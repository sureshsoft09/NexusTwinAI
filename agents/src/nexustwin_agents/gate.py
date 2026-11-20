"""Deterministic 4-Rule Supply Chain Feasibility Gate & In-Loop ADK Guardrail Tool.

Guarantees operational, temporal, economic, and financial/B2B authority feasibility
BEFORE any SAP S/4HANA stock transfer order (STO) or External FMCG PO executes.

Used in two layers (Defense-in-Depth):
  1. In-Loop ADK Tool (`evaluate_4_gate_guardrail`): called by `twin_supervisor` immediately
     after Agents 1-3 query live MCP servers and strictly BEFORE execution or A2A handover.
  2. Independent Backend Audit Critic (`evaluate_feasibility_gate_from_common_output`):
     verifies the structured JSON returned by Vertex AI Agent Engine before logging to BigQuery.
"""

from typing import Any, Dict, Optional
from nexustwin_agents import config

try:
    from shared.schemas import (
        GateEvaluationResult,
        GateRuleResult,
        GateStatus,
        MultiAgentCommonOutput,
        ReplenishmentProposal,
    )
except ImportError:
    from prototype.src.shared.schemas import (
        GateEvaluationResult,
        GateRuleResult,
        GateStatus,
        MultiAgentCommonOutput,
        ReplenishmentProposal,
    )


class FeasibilityGateEvaluator:
    """Evaluates proposed inventory rebalancing actions against the 4 enterprise mathematical constraints."""

    def __init__(
        self,
        autonomy_threshold_usd: float = config.AUTONOMY_THRESHOLD_USD,
        min_runway_buffer_hours: float = config.MIN_STOCKOUT_RUNWAY_BUFFER_HOURS,
    ):
        self.autonomy_threshold_usd = autonomy_threshold_usd
        self.min_runway_buffer_hours = min_runway_buffer_hours

    def evaluate_values(
        self,
        event_id: str,
        order_type: str,
        source_node: str,
        source_atp_surplus: int,
        requested_units: int,
        transit_hours: float,
        sla_window_hours: float,
        freight_cost_usd: float,
        merchandise_cost_usd: float = 0.0,
        unit_gross_margin_usd: float = 6.20,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        """Pure deterministic 4-gate mathematical check on real live MCP values."""
        order_type_norm = (order_type or "STO_FROM_DC").upper()
        is_fmcg_po = order_type_norm == "PO_TO_FMCG"
        protected_margin = round(int(requested_units) * float(unit_gross_margin_usd), 2)
        total_commitment = round(float(freight_cost_usd) + float(merchandise_cost_usd), 2)

        rules = []

        # -------------------------------------------------------------
        # Gate 1: INVENTORY_ATP_FEASIBLE
        # Source Spare Stock (On-Hand - Safety Reserve) >= Order Qty
        # -------------------------------------------------------------
        atp_passed = int(source_atp_surplus) >= int(requested_units) and int(requested_units) > 0
        rules.append(
            GateRuleResult(
                rule_name="INVENTORY_ATP_FEASIBLE",
                passed=atp_passed,
                threshold=int(requested_units),
                actual_value=int(source_atp_surplus),
                formula_expression=f"Available Spare ({int(source_atp_surplus):,}) >= Order Qty ({int(requested_units):,})",
                message=(
                    f"Source {source_node} has {int(source_atp_surplus):,} spare packs "
                    f"(>= {int(requested_units):,} needed) without breaching safety reserves."
                    if atp_passed
                    else f"INSUFFICIENT_STOCK: Available spare {int(source_atp_surplus):,} < requested {int(requested_units):,}."
                ),
            )
        )

        # -------------------------------------------------------------
        # Gate 2: SLA_BEFORE_STOCKOUT
        # Carrier Transit ETA (hrs) <= Replenishment SLA Window (hrs)
        # -------------------------------------------------------------
        sla_passed = float(transit_hours) <= float(sla_window_hours)
        rules.append(
            GateRuleResult(
                rule_name="SLA_BEFORE_STOCKOUT",
                passed=sla_passed,
                threshold=round(float(sla_window_hours), 1),
                actual_value=round(float(transit_hours), 1),
                formula_expression=f"Transit ({round(float(transit_hours), 1)}h) <= Delivery Window ({round(float(sla_window_hours), 1)}h)",
                message=(
                    f"Carrier transit ({round(float(transit_hours), 1)}h) arrives within the {round(float(sla_window_hours), 1)}h delivery window."
                    if sla_passed
                    else f"TRANSIT_TOO_SLOW: Carrier transit ({round(float(transit_hours), 1)}h) exceeds {round(float(sla_window_hours), 1)}h delivery window."
                ),
            )
        )

        # -------------------------------------------------------------
        # Gate 3: ROI_MARGIN_POSITIVE
        # Protected Retail Gross Margin ($) > Carrier Freight Cost ($)
        # -------------------------------------------------------------
        roi_passed = protected_margin > float(freight_cost_usd)
        net_gain = round(protected_margin - float(freight_cost_usd), 2)
        rules.append(
            GateRuleResult(
                rule_name="ROI_MARGIN_POSITIVE",
                passed=roi_passed,
                threshold=float(freight_cost_usd),
                actual_value=protected_margin,
                formula_expression=f"Margin (${protected_margin:,.0f}) > Shipping (${float(freight_cost_usd):,.0f})",
                message=(
                    f"Protected store profit (${protected_margin:,.2f} = {int(requested_units):,} x ${unit_gross_margin_usd:.2f}) "
                    f"exceeds shipping (${float(freight_cost_usd):,.2f}) -> +${net_gain:,.2f} Net Profit."
                    if roi_passed
                    else f"UNPROFITABLE: Shipping (${float(freight_cost_usd):,.2f}) exceeds protected margin (${protected_margin:,.2f})."
                ),
            )
        )

        # -------------------------------------------------------------
        # Gate 4: AUTONOMY_OR_HITL_SATISFIED
        # (Internal Retail STO AND Total Spend <= $1,000) OR Verified VP Sign-Off
        # -------------------------------------------------------------
        is_autonomous_eligible = (not is_fmcg_po) and (total_commitment <= self.autonomy_threshold_usd)
        autonomy_passed = is_autonomous_eligible or has_human_approval

        if not autonomy_passed:
            reason_tag = "External B2B FMCG PO & " if is_fmcg_po else ""
            autonomy_message = (
                f"PAUSED FOR VP APPROVAL: {reason_tag}Total commitment (${total_commitment:,.2f}) exceeds "
                f"the ${self.autonomy_threshold_usd:,.2f} autonomous cap. Routed via Remote A2A Agent to Tab 5."
            )
            formula_str = (
                f"B2B PO (${total_commitment:,.0f}) > ${self.autonomy_threshold_usd:,.0f} Cap"
                if is_fmcg_po
                else f"Commitment (${total_commitment:,.0f}) > ${self.autonomy_threshold_usd:,.0f} Cap"
            )
        elif has_human_approval:
            autonomy_message = f"HUMAN_APPROVED: Signed off by VP Supply Chain Operations (Token: {approver_token or 'SIG-VERIFIED'})."
            formula_str = f"VP Signed (${total_commitment:,.0f} Approved)"
        else:
            autonomy_message = (
                f"AUTO_APPROVED: Internal Retail STO (${total_commitment:,.2f}) is within the "
                f"${self.autonomy_threshold_usd:,.2f} autonomous execution cap."
            )
            formula_str = f"Internal STO (${total_commitment:,.0f}) <= ${self.autonomy_threshold_usd:,.0f} Cap"

        rules.append(
            GateRuleResult(
                rule_name="AUTONOMY_OR_HITL_SATISFIED",
                passed=autonomy_passed,
                threshold=self.autonomy_threshold_usd,
                actual_value=total_commitment,
                formula_expression=formula_str,
                message=autonomy_message,
            )
        )

        if not (atp_passed and sla_passed and roi_passed):
            failed_rules = [r.rule_name for r in rules[:3] if not r.passed]
            return GateEvaluationResult(
                event_id=event_id,
                gate_status=GateStatus.REJECTED,
                passed=False,
                requires_human_approval=False,
                rejection_reason=f"Failed physical/economic constraints: {', '.join(failed_rules)}",
                rules_evaluated=rules,
            )

        if not autonomy_passed:
            return GateEvaluationResult(
                event_id=event_id,
                gate_status=GateStatus.REFERRED_TO_HUMAN,
                passed=False,
                requires_human_approval=True,
                rejection_reason=(
                    f"Gates 1-3 passed; Gate 4 requires Retail VP sign-off "
                    f"(${total_commitment:,.2f} commitment > ${self.autonomy_threshold_usd:,.2f} cap / B2B PO)."
                ),
                rules_evaluated=rules,
            )

        return GateEvaluationResult(
            event_id=event_id,
            gate_status=GateStatus.APPROVED,
            passed=True,
            requires_human_approval=False,
            rules_evaluated=rules,
        )

    def evaluate_common_output(
        self,
        common_output: MultiAgentCommonOutput,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        """Evaluate the 4 Mandatory Mathematical Gate Checks directly against `MultiAgentCommonOutput`."""
        rep = common_output.replenishment_agent_output
        log = common_output.logistics_agent_output
        return self.evaluate_values(
            event_id=common_output.event_id,
            order_type=rep.order_type,
            source_node=rep.selected_source_node,
            source_atp_surplus=rep.selected_source_atp_surplus,
            requested_units=rep.requested_units,
            transit_hours=log.transit_hours,
            sla_window_hours=log.sla_window_hours,
            freight_cost_usd=log.freight_cost_usd,
            merchandise_cost_usd=rep.merchandise_cost_usd,
            unit_gross_margin_usd=rep.unit_gross_margin_usd,
            has_human_approval=has_human_approval,
            approver_token=approver_token,
        )

    def evaluate(
        self,
        proposal: ReplenishmentProposal,
        store_stockout_runway_hours: float,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        """Helper for direct ReplenishmentProposal evaluation (used by What-If Simulator)."""
        transit_hours = proposal.selected_logistics.transit_hours if proposal.selected_logistics else 5.5
        freight_cost = proposal.selected_logistics.freight_cost if proposal.selected_logistics else 750.0
        return self.evaluate_values(
            event_id=proposal.event_id,
            order_type=proposal.order_type,
            source_node=proposal.selected_donor_dc,
            source_atp_surplus=proposal.donor_atp_surplus,
            requested_units=proposal.units_to_transfer,
            transit_hours=transit_hours,
            sla_window_hours=max(12.0, store_stockout_runway_hours),
            freight_cost_usd=freight_cost,
            merchandise_cost_usd=proposal.fmcg_po_merchandise_cost,
            unit_gross_margin_usd=proposal.unit_gross_margin,
            has_human_approval=has_human_approval,
            approver_token=approver_token,
        )


_default_gate = FeasibilityGateEvaluator()


def evaluate_4_gate_guardrail(
    event_id: str,
    order_type: str,
    source_node: str,
    source_atp_surplus: int,
    requested_units: int,
    transit_hours: float,
    sla_window_hours: float,
    freight_cost_usd: float,
    merchandise_cost_usd: float = 0.0,
    unit_gross_margin_usd: float = 6.20,
    has_human_approval: bool = False,
) -> Dict[str, Any]:
    """Deterministic In-Loop ADK Tool: Evaluates all 4 Supply Chain Feasibility Gates BEFORE any ERP action or A2A handover.

    Returns an authoritative `decision`:
      - `AUTO_EXECUTE_STO`: All 4 gates passed (Internal Retail STO <= $1,000). Proceed to call `create_transfer_order`.
      - `ESCALATE_TO_VP_A2A`: Gates 1-3 passed, Gate 4 requires Retail VP approval (> $1,000 or External FMCG PO).
                              DO NOT call `create_fmcg_purchase_order`! Hand off to `approval_agent` (RemoteA2aAgent).
      - `REJECT_INFEASIBLE`: One of Gates 1-3 failed. Abort cleanly with zero ERP execution and zero VP escalation.
    """
    res = _default_gate.evaluate_values(
        event_id=event_id,
        order_type=order_type,
        source_node=source_node,
        source_atp_surplus=int(source_atp_surplus),
        requested_units=int(requested_units),
        transit_hours=float(transit_hours),
        sla_window_hours=float(sla_window_hours),
        freight_cost_usd=float(freight_cost_usd),
        merchandise_cost_usd=float(merchandise_cost_usd),
        unit_gross_margin_usd=float(unit_gross_margin_usd),
        has_human_approval=bool(has_human_approval),
    )

    if res.gate_status == GateStatus.APPROVED:
        decision = "AUTO_EXECUTE_STO"
    elif res.gate_status == GateStatus.REFERRED_TO_HUMAN:
        decision = "ESCALATE_TO_VP_A2A"
    else:
        decision = "REJECT_INFEASIBLE"

    protected_margin = round(int(requested_units) * float(unit_gross_margin_usd), 2)
    total_commitment = round(float(freight_cost_usd) + float(merchandise_cost_usd), 2)

    return {
        "decision": decision,
        "gate_status": res.gate_status.value,
        "passed": res.passed,
        "requires_human_approval": res.requires_human_approval,
        "rejection_reason": res.rejection_reason,
        "protected_margin_usd": protected_margin,
        "total_commitment_usd": total_commitment,
        "rules_evaluated": [r.model_dump(mode="json") for r in res.rules_evaluated],
    }


def evaluate_feasibility_gate(
    proposal: ReplenishmentProposal,
    store_stockout_runway_hours: float,
    has_human_approval: bool = False,
    approver_token: Optional[str] = None,
) -> GateEvaluationResult:
    """Helper function to evaluate proposal against the 4-rule gate."""
    return _default_gate.evaluate(
        proposal=proposal,
        store_stockout_runway_hours=store_stockout_runway_hours,
        has_human_approval=has_human_approval,
        approver_token=approver_token,
    )


def evaluate_feasibility_gate_from_common_output(
    common_output: MultiAgentCommonOutput,
    has_human_approval: bool = False,
    approver_token: Optional[str] = None,
) -> GateEvaluationResult:
    """Evaluate the 4 Mandatory Mathematical Gate Checks directly from `MultiAgentCommonOutput`."""
    return _default_gate.evaluate_common_output(
        common_output=common_output,
        has_human_approval=has_human_approval,
        approver_token=approver_token,
    )
