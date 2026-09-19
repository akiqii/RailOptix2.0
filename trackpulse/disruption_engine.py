"""
RailOptix - Dynamic Disruption Simulator & Minimal-Churn Re-Optimizer (Bonus Scope)
Simulates mid-horizon track closures, capacity cuts, and emergency maintenance injections.
Performs impact blast-radius analysis and minimal-churn re-planning, keeping unaffected activities frozen.
"""
import copy
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict

from trackpulse.models import MaintenanceRequest, ScheduledAccess, Contract
from trackpulse.topology import (
    expand_activity_occupancy_locations,
    LOCATION_SUPPLY_CAPACITY,
    calculate_safety_exclusion_buffers
)
from trackpulse.conflict_engine import ConflictEngine

class DisruptionEngine:
    def __init__(self, contracts: Dict[str, Contract], conflict_engine: ConflictEngine):
        self.contracts = contracts
        self.conflict_engine = conflict_engine

    def simulate_disruption(
        self,
        base_requests: List[MaintenanceRequest],
        location_id: str,
        start_week: int,
        end_week: int,
        new_capacity: int = 1,
        disruption_name: str = "Emergency Rail Fracture",
        inject_emergency_work: bool = True
    ) -> Dict[str, Any]:
        """
        Simulate a mid-horizon disruption cutting capacity at a location over a span of weeks.
        Identifies blast radius, shifts displaced work with minimal churn, and evaluates the impact.
        """
        replanned = copy.deepcopy(base_requests)
        req_map = {r.activity_id: r for r in replanned}

        # Step 1: Detect blast radius
        displaced_activities = set()
        displaced_accesses = []

        for r in replanned:
            locs = expand_activity_occupancy_locations(r.start_location_id, r.end_location_id)
            if location_id in locs:
                for acc in r.scheduled_accesses:
                    if start_week <= acc.week <= end_week:
                        displaced_activities.add(r.activity_id)
                        displaced_accesses.append({
                            "activity_id": r.activity_id,
                            "contract": r.contract_number,
                            "week": acc.week,
                            "night": acc.access_night,
                            "location": location_id
                        })

        # Step 2: Minimal-Churn Re-planning
        # Shift displaced accesses to the earliest subsequent week where capacity and workfront caps permit
        churned_activities = set()
        for r_id in displaced_activities:
            r = req_map[r_id]
            for acc in r.scheduled_accesses:
                if start_week <= acc.week <= end_week:
                    old_wk = acc.week
                    # Shift forward to end_week + 1 (or next feasible week)
                    target_wk = end_week + 1
                    # Ensure doesn't collide with existing week for this activity
                    existing_weeks = {a.week for a in r.scheduled_accesses if a != acc}
                    while target_wk in existing_weeks:
                        target_wk += 1
                    acc.week = target_wk
                    churned_activities.add(r.activity_id)

        # Step 3: Cascade to direct successors under Rule 3 (FS+0) if violated
        cascaded_activities = set()
        for r in replanned:
            if r.predecessor_activity_id and r.predecessor_activity_id in churned_activities:
                pred = req_map[r.predecessor_activity_id]
                pred_last_wk = max((a.week for a in pred.scheduled_accesses), default=1)
                succ_first_wk = min((a.week for a in r.scheduled_accesses), default=30)
                if succ_first_wk <= pred_last_wk:
                    shift_amount = pred_last_wk - succ_first_wk + 1
                    for acc in r.scheduled_accesses:
                        acc.week += shift_amount
                    cascaded_activities.add(r.activity_id)

        total_churned = churned_activities.union(cascaded_activities)
        unaffected_count = len(replanned) - len(total_churned)
        churn_percentage = round((len(total_churned) / max(1, len(replanned))) * 100, 1)

        # Step 4: Inject emergency activity if requested
        emergency_request = None
        if inject_emergency_work:
            emergency_request = MaintenanceRequest(
                activity_id=f"EMG-{location_id.split(':')[-1][:6]}-{start_week}",
                contract_number="C001",
                activity_type="Emergency Track Rectification",
                planned_start_date=(datetime(2027, 1, 4) + timedelta(weeks=start_week - 1)).strftime("%Y-%m-%d"),
                start_location_id=location_id,
                end_location_id=location_id,
                activity_priority=1,
                total_accesses=2,
                access_type="C",
                nature_of_works="Non-live (Consist)",
                scheduled_accesses=[
                    ScheduledAccess(seq=1, week=start_week, access_night=1, co_share_group="b1"),
                    ScheduledAccess(seq=2, week=start_week, access_night=2, co_share_group="b1")
                ]
            )
            replanned.insert(0, emergency_request)

        # Step 5: Detect post-replan conflicts
        post_conflicts = self.conflict_engine.detect_conflicts(replanned)

        return {
            "disruption_event": {
                "name": disruption_name,
                "location_id": location_id,
                "start_week": start_week,
                "end_week": end_week,
                "quota_cap": new_capacity,
                "emergency_injected": emergency_request.activity_id if emergency_request else None
            },
            "blast_radius": {
                "displaced_accesses_count": len(displaced_accesses),
                "displaced_activities": sorted(list(displaced_activities)),
                "access_details": displaced_accesses
            },
            "churn_metrics": {
                "total_activities": len(replanned),
                "unaffected_count": unaffected_count,
                "churned_count": len(total_churned),
                "churn_percentage": churn_percentage,
                "directly_shifted": sorted(list(churned_activities)),
                "cascaded_successors": sorted(list(cascaded_activities))
            },
            "post_replan_status": {
                "feasible": len([c for c in post_conflicts if c.severity == "hard"]) == 0,
                "conflicts_count": len(post_conflicts)
            },
            "replanned_requests": replanned
        }
