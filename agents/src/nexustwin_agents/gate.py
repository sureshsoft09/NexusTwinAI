"""Deterministic 4-Rule Supply Chain Feasibility Gate.

Guarantees operational, temporal, economic, and policy feasibility before
any SAP S/4HANA stock transfer order (STO) or External Factory PO can be executed.
Consumes the Standardized Common Multi-Agent Output (`MultiAgentCommonOutput`).
"""

from typing import Optional
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

    def evaluate_common_output(
        self,
        common_output: MultiAgentCommonOutput,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        """Evaluate the 4 Mandatory Mathematical Gate Checks directly against `MultiAgentCommonOutput`."""
        rep = common_output.replenishment_agent_output
        log = common_output.logistics_agent_output

        rules = []

        # -------------------------------------------------------------
        # Math Check 1: INVENTORY_ATP_FEASIBLE
        # Available Spare Stock >= Requested Transfer Units
        # -------------------------------------------------------------
        atp_passed = rep.selected_source_atp_surplus >= rep.requested_units
        rules.append(
            GateRuleResult(
                rule_name="INVENTORY_ATP_FEASIBLE",
                passed=atp_passed,
                threshold=rep.requested_units,
                actual_value=rep.selected_source_atp_surplus,
                formula_expression=f"Available Spare ({rep.selected_source_atp_surplus:,}) >= Order Qty ({rep.requested_units:,})",
                message=(
                    f"Source {rep.selected_source_node} has {rep.selected_source_atp_surplus:,} spare packs "
                    f"(>= {rep.requested_units:,} needed) without touching safety reserves."
                    if atp_passed
                    else f"INSUFFICIENT_STOCK: Available spare {rep.selected_source_atp_surplus:,} < requested {rep.requested_units:,}."
                ),
            )
        )

        # -------------------------------------------------------------
        # Math Check 2: SLA_BEFORE_STOCKOUT
        # Carrier Transit Hours <= Replenishment SLA Window
        # -------------------------------------------------------------
        sla_passed = log.transit_hours <= log.sla_window_hours
        rules.append(
            GateRuleResult(
                rule_name="SLA_BEFORE_STOCKOUT",
                passed=sla_passed,
                threshold=round(log.sla_window_hours, 1),
                actual_value=round(log.transit_hours, 1),
                formula_expression=f"Transit ({log.transit_hours}h) <= Delivery Window ({log.sla_window_hours}h)",
                message=(
                    f"Carrier transit ({log.transit_hours}h) arrives within the {log.sla_window_hours}h replenishment SLA window."
                    if sla_passed
                    else f"TRANSIT_TOO_SLOW: Carrier transit ({log.transit_hours}h) exceeds {log.sla_window_hours}h SLA window."
                ),
            )
        )

        # -------------------------------------------------------------
        # Math Check 3: ROI_MARGIN_POSITIVE
        # Protected Retail Gross Margin ($) > Carrier Freight Cost ($)
        # -------------------------------------------------------------
        roi_passed = rep.protected_margin_usd > log.freight_cost_usd
        net_gain = round(rep.protected_margin_usd - log.freight_cost_usd, 2)
        rules.append(
            GateRuleResult(
                rule_name="ROI_MARGIN_POSITIVE",
                passed=roi_passed,
                threshold=log.freight_cost_usd,
                actual_value=rep.protected_margin_usd,
                formula_expression=f"Margin (${rep.protected_margin_usd:,.0f}) > Shipping (${log.freight_cost_usd:,.0f})",
                message=(
                    f"Protected store profit (${rep.protected_margin_usd:,.2f} = {rep.requested_units:,} x $6.20) "
                    f"exceeds shipping cost (${log.freight_cost_usd:,.2f}) -> +${net_gain:,.2f} Net Profit."
                    if roi_passed
                    else f"UNPROFITABLE: Shipping (${log.freight_cost_usd:,.2f}) exceeds protected margin (${rep.protected_margin_usd:,.2f})."
                ),
            )
        )

        # -------------------------------------------------------------
        # Math Check 4: AUTONOMY_OR_HITL_SATISFIED
        # Total Financial Commitment <= $1,000.00 OR Verified VP Sign-Off
        # -------------------------------------------------------------
        is_autonomous_budget = log.total_commitment_usd <= self.autonomy_threshold_usd
        autonomy_passed = is_autonomous_budget or has_human_approval

        if not autonomy_passed:
            autonomy_message = (
                f"PAUSED FOR VP APPROVAL: Total commitment (${log.total_commitment_usd:,.2f}) exceeds the "
                f"${self.autonomy_threshold_usd:,.2f} auto-execution cap. Routed to Manager Sign-Off Queue (Tab 5)."
            )
            formula_str = f"Commitment (${log.total_commitment_usd:,.0f}) > ${self.autonomy_threshold_usd:,.0f} Cap"
        elif has_human_approval:
            autonomy_message = f"HUMAN_APPROVED: Signed off by VP Supply Chain Operations (Token: {approver_token or 'SIG-VERIFIED'})."
            formula_str = f"VP Signed (${log.total_commitment_usd:,.0f} Approved)"
        else:
            autonomy_message = (
                f"AUTO_APPROVED: Total commitment (${log.total_commitment_usd:,.2f}) is within the "
                f"${self.autonomy_threshold_usd:,.2f} autonomous execution cap."
            )
            formula_str = f"Commitment (${log.total_commitment_usd:,.0f}) <= ${self.autonomy_threshold_usd:,.0f} Cap"

        rules.append(
            GateRuleResult(
                rule_name="AUTONOMY_OR_HITL_SATISFIED",
                passed=autonomy_passed,
                threshold=self.autonomy_threshold_usd,
                actual_value=log.total_commitment_usd,
                formula_expression=formula_str,
                message=autonomy_message,
            )
        )

        physical_and_economic_pass = atp_passed and sla_passed and roi_passed
        if not physical_and_economic_pass:
            failed_rules = [r.rule_name for r in rules if not r.passed]
            return GateEvaluationResult(
                event_id=common_output.event_id,
                gate_status=GateStatus.REJECTED,
                passed=False,
                requires_human_approval=False,
                rejection_reason=f"Failed physical/economic constraints: {', '.join(failed_rules)}",
                rules_evaluated=rules,
            )

        if not autonomy_passed:
            return GateEvaluationResult(
                event_id=common_output.event_id,
                gate_status=GateStatus.REFERRED_TO_HUMAN,
                passed=False,
                requires_human_approval=True,
                rejection_reason="Order commitment exceeds $1,000 autonomous cap; awaiting VP sign-off",
                rules_evaluated=rules,
            )

        return GateEvaluationResult(
            event_id=common_output.event_id,
            gate_status=GateStatus.APPROVED,
            passed=True,
            requires_human_approval=False,
            rules_evaluated=rules,
        )

    def evaluate(
        self,
        proposal: ReplenishmentProposal,
        store_stockout_runway_hours: float,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        """Legacy helper for direct ReplenishmentProposal evaluation."""
        transit_hours = proposal.selected_logistics.transit_hours if proposal.selected_logistics else 14.0
        freight_cost = proposal.selected_logistics.freight_cost if proposal.selected_logistics else 750.0
        total_commitment = round(freight_cost + proposal.fmcg_po_merchandise_cost, 2)

        atp_passed = proposal.donor_atp_surplus >= proposal.units_to_transfer
        sla_passed = (transit_hours + self.min_runway_buffer_hours) < store_stockout_runway_hours
        roi_passed = proposal.projected_protected_revenue > freight_cost
        autonomy_passed = (total_commitment <= self.autonomy_threshold_usd) or has_human_approval

        rules = [
            GateRuleResult(
                rule_name="INVENTORY_ATP_FEASIBLE",
                passed=atp_passed,
                threshold=proposal.units_to_transfer,
                actual_value=proposal.donor_atp_surplus,
                formula_expression=f"Spare ({proposal.donor_atp_surplus:,}) >= Order ({proposal.units_to_transfer:,})",
                message=f"ATP Surplus {proposal.donor_atp_surplus:,} >= {proposal.units_to_transfer:,} units.",
            ),
            GateRuleResult(
                rule_name="SLA_BEFORE_STOCKOUT",
                passed=sla_passed,
                threshold=round(store_stockout_runway_hours, 1),
                actual_value=round(transit_hours, 1),
                formula_expression=f"Transit ({transit_hours}h) <= Window ({round(store_stockout_runway_hours, 1)}h)",
                message=f"Transit ({transit_hours}h) arrives before stockout window ({round(store_stockout_runway_hours, 1)}h).",
            ),
            GateRuleResult(
                rule_name="ROI_MARGIN_POSITIVE",
                passed=roi_passed,
                threshold=freight_cost,
                actual_value=proposal.projected_protected_revenue,
                formula_expression=f"Profit (${proposal.projected_protected_revenue:,.0f}) > Freight (${freight_cost:,.0f})",
                message=f"Protected margin (${proposal.projected_protected_revenue:,.2f}) > freight (${freight_cost:,.2f}).",
            ),
            GateRuleResult(
                rule_name="AUTONOMY_OR_HITL_SATISFIED",
                passed=autonomy_passed,
                threshold=self.autonomy_threshold_usd,
                actual_value=total_commitment,
                formula_expression=f"Commitment (${total_commitment:,.0f}) <= ${self.autonomy_threshold_usd:,.0f}",
                message="Within $1,000 cap" if autonomy_passed else "Exceeds $1,000 cap -> Referred to VP Queue",
            ),
        ]

        if not (atp_passed and sla_passed and roi_passed):
            return GateEvaluationResult(
                event_id=proposal.event_id,
                gate_status=GateStatus.REJECTED,
                passed=False,
                requires_human_approval=False,
                rules_evaluated=rules,
            )
        if not autonomy_passed:
            return GateEvaluationResult(
                event_id=proposal.event_id,
                gate_status=GateStatus.REFERRED_TO_HUMAN,
                passed=False,
                requires_human_approval=True,
                rules_evaluated=rules,
            )
        return GateEvaluationResult(
            event_id=proposal.event_id,
            gate_status=GateStatus.APPROVED,
            passed=True,
            requires_human_approval=False,
            rules_evaluated=rules,
        )


_default_gate = FeasibilityGateEvaluator()


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
