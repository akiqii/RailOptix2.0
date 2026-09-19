"""
RailOptix - Official Reference Validator & Quality Evaluator
Faithfully implements the LTA NebulaX Problem 01 Reference Validator:
- Rigid Rules Check (10 Strict Constraints -> Hard Violations with Rule Tags)
- Soft Score Objective Evaluation (Scenario A, B, C scoring formulas)
- Official JSON Output Report schema per Section 2.7
"""
from datetime import datetime, timedelta
from typing import List, Dict, Set, Tuple, Optional, Any
from collections import defaultdict

from trackpulse.models import MaintenanceRequest, Contract
from trackpulse.topology import (
    expand_activity_occupancy_locations,
    calculate_safety_exclusion_buffers,
    LOCATION_SUPPLY_CAPACITY,
    parse_sector_id
)

HORIZON_START = datetime(2027, 1, 4)

def week_to_date(week: int, night: int = 7, horizon_start: datetime = HORIZON_START) -> datetime:
    return horizon_start + timedelta(weeks=week - 1, days=night - 1)

class ReferenceValidator:
    def __init__(
        self,
        contracts: Dict[str, Contract],
        horizon_start: datetime = HORIZON_START,
        horizon_weeks: int = 30
    ):
        self.contracts = contracts
        self.horizon_start = horizon_start
        self.horizon_weeks = horizon_weeks

    def validate(
        self,
        scenario_letter: str,
        requests: List[MaintenanceRequest]
    ) -> Dict[str, Any]:
        scen = scenario_letter.upper()
        hard_violations: List[Dict[str, str]] = []
        req_map = {r.activity_id: r for r in requests}

        # -------------------------------------------------------------
        # Rule 1: Complete Workload Baseline Conservation
        # Nightly yield: standard = 1.0, ECLO = 1.5. Total >= total_accesses
        # -------------------------------------------------------------
        for r in requests:
            yield_sum = sum(1.5 if a.eclo == 1 else 1.0 for a in r.scheduled_accesses)
            if yield_sum < r.total_accesses - 1e-6:
                hard_violations.append({
                    "rule": "workload",
                    "severity": "hard",
                    "detail": f"Activity {r.activity_id} under-scheduled: yield {yield_sum:.1f} < required {r.total_accesses:.1f}"
                })

        # -------------------------------------------------------------
        # Rule 2: Planned Start Date Precedence
        # -------------------------------------------------------------
        for r in requests:
            if r.planned_start_date and r.scheduled_accesses:
                p_dt = datetime.strptime(r.planned_start_date, "%Y-%m-%d")
                min_wk = max(1, int((p_dt - self.horizon_start).days // 7) + 1)
                for acc in r.scheduled_accesses:
                    if acc.week < min_wk:
                        hard_violations.append({
                            "rule": "planned_date",
                            "severity": "hard",
                            "detail": f"wk{acc.week}: {r.activity_id} scheduled before planned start week {min_wk} ({r.planned_start_date})"
                        })
                        break

        # -------------------------------------------------------------
        # Rule 3: Finish-to-Start Predecessor Precedence (FS+0)
        # -------------------------------------------------------------
        for r in requests:
            if r.predecessor_activity_id:
                pred = req_map.get(r.predecessor_activity_id)
                if pred and pred.scheduled_accesses and r.scheduled_accesses:
                    pred_last_wk = max(a.week for a in pred.scheduled_accesses)
                    succ_first_wk = min(a.week for a in r.scheduled_accesses)
                    if succ_first_wk <= pred_last_wk:
                        hard_violations.append({
                            "rule": "predecessor",
                            "severity": "hard",
                            "detail": f"wk{succ_first_wk}: {r.activity_id} starts week {succ_first_wk} <= predecessor {pred.activity_id} finish week {pred_last_wk}"
                        })

        # -------------------------------------------------------------
        # Rule 7: Weekly Allocation Cap (number_of_maximum_access_per_week)
        # -------------------------------------------------------------
        contract_week_nights: Dict[Tuple[str, int], Set[int]] = defaultdict(set)
        for r in requests:
            for acc in r.scheduled_accesses:
                contract_week_nights[(r.contract_number, acc.week)].add(acc.access_night)

        for (c_num, wk), nights in contract_week_nights.items():
            c = self.contracts.get(c_num)
            max_nights = c.number_of_maximum_access_per_week if c else 3
            if len(nights) > max_nights:
                hard_violations.append({
                    "rule": "weekly_allocation",
                    "severity": "hard",
                    "detail": f"wk{wk}: contract {c_num} uses {len(nights)} distinct access nights (cap {max_nights})"
                })

        # -------------------------------------------------------------
        # Rule 8: Workfront Concurrency Caps (number_of_workfronts per night)
        # -------------------------------------------------------------
        contract_night_acts: Dict[Tuple[str, int, int], Set[str]] = defaultdict(set)
        for r in requests:
            for acc in r.scheduled_accesses:
                contract_night_acts[(r.contract_number, acc.week, acc.access_night)].add(r.activity_id)

        for (c_num, wk, night), act_set in contract_night_acts.items():
            c = self.contracts.get(c_num)
            max_wf = c.number_of_workfronts if c else 1
            if len(act_set) > max_wf:
                hard_violations.append({
                    "rule": "workfronts",
                    "severity": "hard",
                    "detail": f"wk{wk} n{night}: contract {c_num} has {len(act_set)} concurrent activities {sorted(list(act_set))} (cap {max_wf})"
                })

        # -------------------------------------------------------------
        # Rule 4 & 5 & 6: Closures, Buffers, Co-Sharing Legal Mixes
        # -------------------------------------------------------------
        night_acts: Dict[Tuple[int, int], List[MaintenanceRequest]] = defaultdict(list)
        for r in requests:
            for acc in r.scheduled_accesses:
                night_acts[(acc.week, acc.access_night)].append(r)

        for (wk, night), act_list in night_acts.items():
            unique_acts = list({r.activity_id: r for r in act_list}.values())
            m = len(unique_acts)
            for i in range(m):
                r1 = unique_acts[i]
                c1 = self.contracts.get(r1.contract_number)
                nature1 = c1.nature_of_activity if c1 else (r1.nature_of_works or "Non-live (Consist)")
                type1 = c1.access_type if c1 else (r1.access_type or "C")
                line1, _, _, bound1 = parse_sector_id(r1.start_location_id)
                locs1 = set(expand_activity_occupancy_locations(r1.start_location_id, r1.end_location_id))
                buf1 = set(calculate_safety_exclusion_buffers(line1, bound1, r1.start_location_id, r1.end_location_id, nature1))

                acc1 = next(a for a in r1.scheduled_accesses if a.week == wk and a.access_night == night)
                csg1 = acc1.co_share_group or "b1"

                for j in range(i + 1, m):
                    r2 = unique_acts[j]
                    c2 = self.contracts.get(r2.contract_number)
                    nature2 = c2.nature_of_activity if c2 else (r2.nature_of_works or "Non-live (Consist)")
                    type2 = c2.access_type if c2 else (r2.access_type or "C")
                    line2, _, _, bound2 = parse_sector_id(r2.start_location_id)
                    locs2 = set(expand_activity_occupancy_locations(r2.start_location_id, r2.end_location_id))
                    buf2 = set(calculate_safety_exclusion_buffers(line2, bound2, r2.start_location_id, r2.end_location_id, nature2))

                    acc2 = next(a for a in r2.scheduled_accesses if a.week == wk and a.access_night == night)
                    csg2 = acc2.co_share_group or "b1"

                    overlap_locs = locs1.intersection(locs2)
                    if overlap_locs:
                        # If sharing same location, must be legal co-sharing
                        is_legal_mix = not (type1 == "PM" or type2 == "PM" or (type1 == "PC" and type2 == "PC"))
                        if not is_legal_mix:
                            hard_violations.append({
                                "rule": "possession_mix",
                                "severity": "hard",
                                "detail": f"wk{wk} n{night}: {r1.activity_id} ({type1}) and {r2.activity_id} ({type2}) illegal possession mix at {sorted(list(overlap_locs))[:2]}"
                            })
                    else:
                        # Non-overlapping: buffers must clear
                        in_buf1 = locs2.intersection(buf1)
                        if in_buf1 and csg1 != csg2:
                            hard_violations.append({
                                "rule": "closure",
                                "severity": "hard",
                                "detail": f"wk{wk} n{night}: {r2.activity_id} inside closure/buffer of ['{r1.activity_id}'] at {sorted(list(in_buf1))[:2]}"
                            })
                        in_buf2 = locs1.intersection(buf2)
                        if in_buf2 and csg1 != csg2 and not in_buf1:
                            hard_violations.append({
                                "rule": "closure",
                                "severity": "hard",
                                "detail": f"wk{wk} n{night}: {r1.activity_id} inside closure/buffer of ['{r2.activity_id}'] at {sorted(list(in_buf2))[:2]}"
                            })

        # -------------------------------------------------------------
        # Scenario-Specific Rigid Constraints:
        # Scenario A: ECLO is hard-forbidden!
        # Scenario B: Overruns past planned_completion_date hard-fail!
        # Scenario C: ECLO continuity window (<= 2 calendar weeks per line)
        # -------------------------------------------------------------
        total_eclo_nights = sum(sum(1 for a in r.scheduled_accesses if a.eclo == 1) for r in requests)

        if scen == "A" and total_eclo_nights > 0:
            hard_violations.append({
                "rule": "eclo",
                "severity": "hard",
                "detail": f"Scenario A hard-forbids ECLO: {total_eclo_nights} ECLO nights found."
            })

        # Overrun calculations per contract
        overrun_days_total = 0
        contracts_overrunning = 0
        priority_overrun: Dict[str, int] = {"1": 0, "2": 0, "3": 0}
        priority_weighted_score = 0.0

        contract_acts: Dict[str, List[MaintenanceRequest]] = defaultdict(list)
        for r in requests:
            contract_acts[r.contract_number].append(r)

        for c_num, acts in contract_acts.items():
            contract = self.contracts.get(c_num)
            if not contract:
                continue
            max_wk = max((max(a.week for a in act.scheduled_accesses) for act in acts if act.scheduled_accesses), default=1)
            sim_dt = week_to_date(max_wk, 7, self.horizon_start)
            plan_dt = datetime.strptime(contract.planned_completion_date, "%Y-%m-%d")
            diff_days = max(0, (sim_dt - plan_dt).days)

            if scen == "B" and diff_days > 0:
                hard_violations.append({
                    "rule": "planned_date",
                    "severity": "hard",
                    "detail": f"Scenario B hard-forbids deadline overrun: Contract {c_num} overruns by {diff_days} days ({sim_dt.strftime('%Y-%m-%d')} > {contract.planned_completion_date})"
                })

            if diff_days > 0:
                contracts_overrunning += 1
                overrun_days_total += diff_days
                tier_str = str(contract.contract_priority or 3)
                priority_overrun[tier_str] = priority_overrun.get(tier_str, 0) + diff_days

                c_weight = 100.0 if contract.contract_priority == 1 else (10.0 if contract.contract_priority == 2 else 1.0)
                for a in acts:
                    nudge = 0.3 if a.activity_priority == 1 else (0.2 if a.activity_priority == 2 else 0.0)
                    priority_weighted_score += (c_weight * (1.0 + nudge) * (diff_days / max(1, len(acts))))

        if scen == "C":
            # Rule 10: ECLO Continuity Window (<= 2 continuous calendar weeks per line)
            line_eclo_weeks: Dict[str, Set[int]] = defaultdict(set)
            for r in requests:
                for a in r.scheduled_accesses:
                    if a.eclo == 1:
                        line1, _, _, _ = parse_sector_id(r.start_location_id)
                        line_eclo_weeks[line1].add(a.week)
                        c = self.contracts.get(r.contract_number)
                        if (c and c.nature_of_activity == "Live") or r.nature_of_works == "Live":
                            line_eclo_weeks["ALP"].add(a.week)
                            line_eclo_weeks["BET"].add(a.week)

            for line_id, wks in line_eclo_weeks.items():
                if wks:
                    span = max(wks) - min(wks) + 1
                    if span > 2:
                        hard_violations.append({
                            "rule": "eclo_window",
                            "severity": "hard",
                            "detail": f"Scenario C ECLO window breached on Line {line_id}: span of {span} weeks ({sorted(list(wks))}) exceeds 2-week limit."
                        })

        # Excess access-nights and location supply capacity check
        excess_access_nights_total = 0
        loc_week_groups: Dict[Tuple[str, int], Set[str]] = defaultdict(set)
        for r in requests:
            locs = expand_activity_occupancy_locations(r.start_location_id, r.end_location_id)
            for acc in r.scheduled_accesses:
                for loc in locs:
                    loc_week_groups[(loc, acc.week)].add(acc.co_share_group or "b1")

        capacity_hotspots = []
        for (loc, wk), grps in loc_week_groups.items():
            nominal_cap = LOCATION_SUPPLY_CAPACITY.get(loc, 4)
            count = len(grps)
            if count >= nominal_cap:
                capacity_hotspots.append(f"{loc} (wk{wk}: {count}/{nominal_cap})")
            if count > nominal_cap:
                excess = count - nominal_cap
                excess_access_nights_total += excess
                if scen == "A":
                    hard_violations.append({
                        "rule": "capacity",
                        "severity": "hard",
                        "detail": f"Scenario A strict supply breach: {loc} wk{wk} has {count} possessions > nominal capacity {nominal_cap}"
                    })
                elif scen == "C" and excess > 1:
                    hard_violations.append({
                        "rule": "capacity",
                        "severity": "hard",
                        "detail": f"Scenario C excess capacity breach: {loc} wk{wk} has {count} possessions (> 1 excess above {nominal_cap})"
                    })

        # Total scheduled access-nights count
        nights_scheduled = sum(len(r.scheduled_accesses) for r in requests)

        # Final Objective Score Calculation per §2.5
        if scen == "A":
            final_objective_score = round(priority_weighted_score, 1)
        elif scen == "B":
            final_objective_score = round(7 * excess_access_nights_total + 5 * total_eclo_nights, 1)
        else: # C
            final_objective_score = round(priority_weighted_score + 7 * excess_access_nights_total + 5 * total_eclo_nights, 1)

        is_feasible = len(hard_violations) == 0

        return {
            "scenario": scen,
            "feasible": is_feasible,
            "hard_violations": hard_violations,
            "soft_scores": {
                "scenario": scen,
                "overrun_days_total": overrun_days_total if scen != "B" else 0,
                "contracts_overrunning": contracts_overrunning if scen != "B" else 0,
                "earliness_days_total": 0,
                "excess_access_nights_total": excess_access_nights_total,
                "eclo_nights_total": total_eclo_nights,
                "priority_overrun": priority_overrun if scen != "B" else {"1": 0, "2": 0, "3": 0},
                "priority_weighted_score": final_objective_score
            },
            "detail": {
                "capacity_hotspots": capacity_hotspots[:10],
                "nights_scheduled": nights_scheduled,
                "eclo_nights": total_eclo_nights
            }
        }
