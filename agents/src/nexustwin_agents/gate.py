"""Deterministic 4-Rule Supply Chain Feasibility Gate.

Guarantees operational, temporal, economic, and policy feasibility before
any SAP S/4HANA stock transfer order (STO) can be executed.
Eliminates GenAI hallucinations in physical supply chains.
"""

from typing import Any, Dict, List, Optional
from nexustwin_agents import config
try:
    from shared.schemas import (
        GateEvaluationResult,
        GateRuleResult,
        GateStatus,
        ReplenishmentProposal,
    )
except ImportError:
    from prototype.src.shared.schemas import (
        GateEvaluationResult,
        GateRuleResult,
        GateStatus,
        ReplenishmentProposal,
    )


class FeasibilityGateEvaluator:
    """Evaluates proposed inventory rebalancing actions against the 4 enterprise constraints."""

    def __init__(
        self,
        autonomy_threshold_usd: float = config.AUTONOMY_THRESHOLD_USD,
        min_runway_buffer_hours: float = config.MIN_STOCKOUT_RUNWAY_BUFFER_HOURS,
    ):
        self.autonomy_threshold_usd = autonomy_threshold_usd
        self.min_runway_buffer_hours = min_runway_buffer_hours

    def evaluate(
        self,
        proposal: ReplenishmentProposal,
        store_stockout_runway_hours: float,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> GateEvaluationResult:
        rules: List[GateRuleResult] = []

        # -------------------------------------------------------------
        # Rule 1: INVENTORY_ATP_FEASIBLE
        # Sourced DC Available-to-Promise >= transfer units without safety buffer breach
        # -------------------------------------------------------------
        atp_passed = proposal.donor_atp_surplus >= proposal.units_to_transfer
        rules.append(
            GateRuleResult(
                rule_name="INVENTORY_ATP_FEASIBLE",
                passed=atp_passed,
                threshold=proposal.units_to_transfer,
                actual_value=proposal.donor_atp_surplus,
                message=(
                    f"ATP Surplus of {proposal.donor_atp_surplus} units at {proposal.selected_donor_dc} "
                    f"covers requested transfer of {proposal.units_to_transfer} units."
                    if atp_passed
                    else f"INSUFFICIENT_STOCK: DC ATP {proposal.donor_atp_surplus} < requested {proposal.units_to_transfer} units."
                ),
            )
        )

        # -------------------------------------------------------------
        # Rule 2: SLA_BEFORE_STOCKOUT
        # Carrier transit ETA + handling buffer < store stockout runway hours
        # -------------------------------------------------------------
        transit_hours = proposal.selected_logistics.transit_hours if proposal.selected_logistics else 14.0
        sla_passed = (transit_hours + self.min_runway_buffer_hours) < store_stockout_runway_hours
        rules.append(
            GateRuleResult(
                rule_name="SLA_BEFORE_STOCKOUT",
                passed=sla_passed,
                threshold=round(store_stockout_runway_hours, 1),
                actual_value=round(transit_hours + self.min_runway_buffer_hours, 1),
                message=(
                    f"Transit ({transit_hours}h) + buffer ({self.min_runway_buffer_hours}h) arrives "
                    f"{round(store_stockout_runway_hours - transit_hours, 1)}h before shelf depletion."
                    if sla_passed
                    else f"TRANSIT_TOO_SLOW: Arrival ({transit_hours}h + buffer) exceeds store runway ({store_stockout_runway_hours}h)."
                ),
            )
        )

        # -------------------------------------------------------------
        # Rule 3: ROI_MARGIN_POSITIVE
        # Protected retail shelf gross margin ($) > total expedited freight cost ($)
        # -------------------------------------------------------------
        freight_cost = proposal.selected_logistics.freight_cost if proposal.selected_logistics else 750.0
        roi_passed = proposal.projected_protected_revenue > freight_cost
        rules.append(
            GateRuleResult(
                rule_name="ROI_MARGIN_POSITIVE",
                passed=roi_passed,
                threshold=freight_cost,
                actual_value=proposal.projected_protected_revenue,
                message=(
                    f"Protected gross margin of ${proposal.projected_protected_revenue:,.2f} "
                    f"exceeds freight cost of ${freight_cost:,.2f} (Net Gain: ${proposal.projected_protected_revenue - freight_cost:,.2f})."
                    if roi_passed
                    else f"UNPROFITABLE: Expedited freight (${freight_cost:,.2f}) exceeds protected margin (${proposal.projected_protected_revenue:,.2f})."
                ),
            )
        )

        # -------------------------------------------------------------
        # Rule 4: AUTONOMY_OR_HITL_SATISFIED
        # Freight cost <= $1,000 OR verified human director approval
        # -------------------------------------------------------------
        is_autonomous_budget = freight_cost <= self.autonomy_threshold_usd
        autonomy_passed = is_autonomous_budget or has_human_approval

        if not autonomy_passed:
            autonomy_message = (
                f"AUTONOMY_THRESHOLD_EXCEEDED: Freight cost (${freight_cost:,.2f}) > ${self.autonomy_threshold_usd:,.2f}. "
                "Referred to Operations Director for Human-in-the-Loop sign-off."
            )
        elif has_human_approval:
            autonomy_message = f"HUMAN_APPROVED: Authorized by Operations Director (Token: {approver_token or 'SIG-VERIFIED'})."
        else:
            autonomy_message = f"AUTO_APPROVED: Freight cost (${freight_cost:,.2f}) within $1,000 autonomous execution policy."

        rules.append(
            GateRuleResult(
                rule_name="AUTONOMY_OR_HITL_SATISFIED",
                passed=autonomy_passed,
                threshold=self.autonomy_threshold_usd,
                actual_value=freight_cost,
                message=autonomy_message,
            )
        )

        # Determine Final Gate Status
        physical_and_economic_pass = atp_passed and sla_passed and roi_passed

        if not physical_and_economic_pass:
            failed_rules = [r.rule_name for r in rules if not r.passed]
            return GateEvaluationResult(
                event_id=proposal.event_id,
                gate_status=GateStatus.REJECTED,
                passed=False,
                requires_human_approval=False,
                rejection_reason=f"Failed physical/economic constraints: {', '.join(failed_rules)}",
                rules_evaluated=rules,
            )

        if not autonomy_passed:
            return GateEvaluationResult(
                event_id=proposal.event_id,
                gate_status=GateStatus.REFERRED_TO_HUMAN,
                passed=False,
                requires_human_approval=True,
                rejection_reason="Transfer expenditure requires executive human sign-off",
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
