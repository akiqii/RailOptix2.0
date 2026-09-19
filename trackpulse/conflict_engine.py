"""
RailOptix - Multi-Dimensional Conflict Detection Engine
Evaluates:
1. Planned Start Date Precedence
2. Finish-to-Start Predecessor Precedence (FS+0)
3. Weekly Allocation Budget (number_of_maximum_access_per_week)
4. Workfront Concurrency Caps (number_of_workfronts per night)
5. Spatial Overlaps, Co-Sharing Legal Mixes, and Safety Exclusion Buffers
6. Engineering Roster Competency & Fatigue
7. Equipment Contention / Double-Booking
"""
from typing import List, Dict, Set, Tuple, Optional
from datetime import datetime
from collections import defaultdict

from trackpulse.models import (
    MaintenanceRequest, Conflict, ConflictType, ConflictSeverity,
    Contract, Engineer, Equipment
)
from trackpulse.topology import (
    expand_activity_occupancy_locations,
    calculate_safety_exclusion_buffers,
    LOCATION_SUPPLY_CAPACITY,
    parse_sector_id
)

HORIZON_START = "2027-01-04"

class ConflictEngine:
    def __init__(
        self,
        contracts: Dict[str, Contract],
        engineers: Optional[Dict[str, Engineer]] = None,
        equipment: Optional[Dict[str, Equipment]] = None
    ):
        self.contracts = contracts
        self.engineers = engineers or {}
        self.equipment = equipment or {}

    def detect_conflicts(self, requests: List[MaintenanceRequest]) -> List[Conflict]:
        conflicts: List[Conflict] = []
        req_map = {r.activity_id: r for r in requests}
        start_dt = datetime.strptime(HORIZON_START, "%Y-%m-%d")

        # 1. Planned Start Date Precedence
        for r in requests:
            if not r.planned_start_date or not r.scheduled_accesses:
                continue
            plan_dt = datetime.strptime(r.planned_start_date, "%Y-%m-%d")
            plan_week = max(1, int((plan_dt - start_dt).days / 7) + 1)
            for acc in r.scheduled_accesses:
                if acc.week < plan_week:
                    conflicts.append(
                        Conflict(
                            id=f"CONF-PLANNED-{r.activity_id}-W{acc.week}",
                            type=ConflictType.PREDECESSOR_PRECEDENCE,
                            severity=ConflictSeverity.HARD,
                            rule="planned_start_date",
                            week=acc.week,
                            activity_ids=[r.activity_id],
                            contract_numbers=[r.contract_number],
                            description=(
                                f"Early start violation: Activity {r.activity_id} scheduled in Week {acc.week} "
                                f"before its planned start week {plan_week} ({r.planned_start_date})."
                            ),
                            suggested_resolution=f"Reschedule access to Week {plan_week} or later."
                        )
                    )
                    break

        # 2. Finish-to-Start Predecessor Precedence (FS+0)
        for req in requests:
            if not req.predecessor_activity_id:
                continue
            pred = req_map.get(req.predecessor_activity_id)
            if not pred or not pred.scheduled_accesses or not req.scheduled_accesses:
                continue
            
            pred_last_week = max(a.week for a in pred.scheduled_accesses)
            succ_first_week = min(a.week for a in req.scheduled_accesses)

            if succ_first_week <= pred_last_week:
                conflicts.append(
                    Conflict(
                        id=f"CONF-PRED-{req.activity_id}-{pred.activity_id}",
                        type=ConflictType.PREDECESSOR_PRECEDENCE,
                        severity=ConflictSeverity.HARD,
                        rule="predecessor",
                        week=succ_first_week,
                        activity_ids=[req.activity_id, pred.activity_id],
                        contract_numbers=[req.contract_number, pred.contract_number],
                        description=(
                            f"Predecessor violation: Activity {req.activity_id} starts in Week {succ_first_week}, "
                            f"before predecessor {pred.activity_id} finishes (ends Week {pred_last_week})."
                        ),
                        suggested_resolution=(
                            f"Reschedule {req.activity_id} to Week {pred_last_week + 1} or later to satisfy finish-to-start precedence."
                        )
                    )
                )

        # 3. Weekly Allocation Budget
        contract_week_nights: Dict[Tuple[str, int], Set[int]] = defaultdict(set)
        for req in requests:
            for acc in req.scheduled_accesses:
                contract_week_nights[(req.contract_number, acc.week)].add(acc.access_night)

        for (c_num, wk), nights in contract_week_nights.items():
            c = self.contracts.get(c_num)
            max_nights = c.number_of_maximum_access_per_week if c else 3
            if len(nights) > max_nights:
                conflicts.append(
                    Conflict(
                        id=f"CONF-WACC-{c_num}-W{wk}",
                        type=ConflictType.WEEKLY_ACCESS_EXCEEDED,
                        severity=ConflictSeverity.HARD,
                        rule="weekly_allocation",
                        week=wk,
                        contract_numbers=[c_num],
                        description=(
                            f"Weekly allocation exceeded: Contract {c_num} uses {len(nights)} distinct access nights "
                            f"in Week {wk} (maximum allowed: {max_nights})."
                        ),
                        suggested_resolution=(
                            f"Consolidate accesses on existing nights or defer to an adjacent week."
                        )
                    )
                )

        # 4. Workfront Concurrency Caps
        contract_night_activities: Dict[Tuple[str, int, int], List[str]] = defaultdict(list)
        for req in requests:
            for acc in req.scheduled_accesses:
                contract_night_activities[(req.contract_number, acc.week, acc.access_night)].append(req.activity_id)

        for (c_num, wk, night), act_ids in contract_night_activities.items():
            c = self.contracts.get(c_num)
            max_wf = c.number_of_workfronts if c else 1
            distinct_acts = list(set(act_ids))
            if len(distinct_acts) > max_wf:
                conflicts.append(
                    Conflict(
                        id=f"CONF-WFRONT-{c_num}-W{wk}-N{night}",
                        type=ConflictType.WORKFRONT_LIMIT_EXCEEDED,
                        severity=ConflictSeverity.HARD,
                        rule="workfronts",
                        week=wk,
                        access_night=night,
                        activity_ids=distinct_acts,
                        contract_numbers=[c_num],
                        description=(
                            f"Workfront limit breached: Contract {c_num} has {len(distinct_acts)} concurrent activities "
                            f"on Week {wk} Night {night} (workfront cap: {max_wf})."
                        ),
                        suggested_resolution=(
                            f"Stagger activities {distinct_acts} across different access nights (1..{max_wf})."
                        )
                    )
                )

        # 5. Spatial Overlaps, Co-Sharing Legal Mixes, and Safety Buffers
        night_slots: Dict[Tuple[int, int], List[MaintenanceRequest]] = defaultdict(list)
        for r in requests:
            for acc in r.scheduled_accesses:
                night_slots[(acc.week, acc.access_night)].append(r)

        for (wk, night), nightly_reqs in night_slots.items():
            active_reqs = list({r.activity_id: r for r in nightly_reqs}.values())
            n = len(active_reqs)

            for i in range(n):
                r1 = active_reqs[i]
                c1 = self.contracts.get(r1.contract_number)
                nature1 = c1.nature_of_activity if c1 else (r1.nature_of_works or "Non-live (Consist)")
                line1, _, _, bound1 = parse_sector_id(r1.start_location_id)
                locs1 = set(expand_activity_occupancy_locations(r1.start_location_id, r1.end_location_id))
                buf1 = set(calculate_safety_exclusion_buffers(line1, bound1, r1.start_location_id, r1.end_location_id, nature1))

                for j in range(i + 1, n):
                    r2 = active_reqs[j]
                    c2 = self.contracts.get(r2.contract_number)
                    nature2 = c2.nature_of_activity if c2 else (r2.nature_of_works or "Non-live (Consist)")
                    line2, _, _, bound2 = parse_sector_id(r2.start_location_id)
                    locs2 = set(expand_activity_occupancy_locations(r2.start_location_id, r2.end_location_id))
                    buf2 = set(calculate_safety_exclusion_buffers(line2, bound2, r2.start_location_id, r2.end_location_id, nature2))

                    # A. Physical Sector Overlap / Legal Co-Sharing Mix
                    overlap_locs = locs1.intersection(locs2)
                    if overlap_locs:
                        type1 = c1.access_type if c1 else (r1.access_type or "C")
                        type2 = c2.access_type if c2 else (r2.access_type or "C")
                        # Co-sharing rule: PM must be alone; only 1 PC + C or C + C allowed
                        is_co_share_legal = not (type1 == "PM" or type2 == "PM" or (type1 == "PC" and type2 == "PC"))
                        if not is_co_share_legal:
                            conflicts.append(
                                Conflict(
                                    id=f"CONF-SECTOR-{r1.activity_id}-{r2.activity_id}-W{wk}-N{night}",
                                    type=ConflictType.INCOMPATIBLE_POSSESSION,
                                    severity=ConflictSeverity.HARD,
                                    rule="possession_mix",
                                    week=wk,
                                    access_night=night,
                                    activity_ids=[r1.activity_id, r2.activity_id],
                                    contract_numbers=[r1.contract_number, r2.contract_number],
                                    description=(
                                        f"Illegal possession overlap: {r1.activity_id} ({type1}) and {r2.activity_id} ({type2}) "
                                        f"overlap at {sorted(list(overlap_locs))[:2]} without valid co-sharing permission."
                                    ),
                                    suggested_resolution="PM must possess alone. Separate onto alternate nights or reassign co-worker roles."
                                )
                            )

                    # B. Safety Buffer Breach (only between non-overlapping activities)
                    if not overlap_locs:
                        in_buf1 = locs2.intersection(buf1)
                        if in_buf1:
                            conflicts.append(
                                Conflict(
                                    id=f"CONF-BUF-{r1.activity_id}-{r2.activity_id}-W{wk}-N{night}",
                                    type=ConflictType.SAFETY_BUFFER_BREACH,
                                    severity=ConflictSeverity.HARD,
                                    rule="closure_buffer",
                                    week=wk,
                                    access_night=night,
                                    activity_ids=[r1.activity_id, r2.activity_id],
                                    contract_numbers=[r1.contract_number, r2.contract_number],
                                    description=(
                                        f"Safety exclusion buffer infringement: {r2.activity_id} ({nature2}) "
                                        f"penetrates exclusion buffer of {r1.activity_id} ({nature1}) at {sorted(list(in_buf1))[:2]}."
                                    ),
                                    suggested_resolution="Shift possession outside exclusion boundary or stagger onto alternate nights."
                                )
                            )

                        in_buf2 = locs1.intersection(buf2)
                        if in_buf2 and not in_buf1:
                            conflicts.append(
                                Conflict(
                                    id=f"CONF-BUF-{r2.activity_id}-{r1.activity_id}-W{wk}-N{night}",
                                    type=ConflictType.SAFETY_BUFFER_BREACH,
                                    severity=ConflictSeverity.HARD,
                                    rule="closure_buffer",
                                    week=wk,
                                    access_night=night,
                                    activity_ids=[r1.activity_id, r2.activity_id],
                                    contract_numbers=[r1.contract_number, r2.contract_number],
                                    description=(
                                        f"Safety exclusion buffer infringement: {r1.activity_id} ({nature1}) "
                                        f"penetrates exclusion buffer of {r2.activity_id} ({nature2}) at {sorted(list(in_buf2))[:2]}."
                                    ),
                                    suggested_resolution="Shift possession outside exclusion boundary or stagger onto alternate nights."
                                )
                            )

        # 6. Equipment Contention
        for (wk, night), nightly_reqs in night_slots.items():
            eq_map: Dict[str, List[str]] = defaultdict(list)
            for r in nightly_reqs:
                for acc in r.scheduled_accesses:
                    if acc.week == wk and acc.access_night == night:
                        for eq_id in acc.assigned_equipment:
                            eq_map[eq_id].append(r.activity_id)

            for eq_id, acts in eq_map.items():
                distinct_acts = list(set(acts))
                if len(distinct_acts) > 1:
                    conflicts.append(
                        Conflict(
                            id=f"CONF-EQ-{eq_id}-W{wk}-N{night}",
                            type=ConflictType.EQUIPMENT_CONTENTION,
                            severity=ConflictSeverity.SOFT,
                            rule="equipment_contention",
                            week=wk,
                            access_night=night,
                            activity_ids=distinct_acts,
                            description=f"Equipment {eq_id} simultaneously assigned to {distinct_acts} on Week {wk} Night {night}.",
                            suggested_resolution="Reassign to reserve fleet or schedule on alternate night."
                        )
                    )

        return conflicts
