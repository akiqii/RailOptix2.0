"""
Comprehensive Unit & Integration Test Suite for RailOptix Engine
"""
import sys
import os
import unittest
import copy

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trackpulse.topology import (
    MRT_LINES, STATIONS_BY_LINE, INTERCHANGE_HUBS,
    parse_sector_id, expand_activity_occupancy_locations,
    calculate_safety_exclusion_buffers, calculate_topological_distance
)
from trackpulse.models import (
    MaintenanceRequest, ScheduledAccess, ConflictType, ConflictSeverity
)
from trackpulse.data_loader import (
    load_contracts, load_activities, load_initial_schedule,
    get_default_engineers, get_default_equipment
)
from trackpulse.conflict_engine import ConflictEngine
from trackpulse.ai_optimizer import AIOptimizer
from trackpulse.submission_exporter import SubmissionExporter


class TestRailOptix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contracts = load_contracts()
        cls.raw_requests = load_activities(cls.contracts)
        cls.requests = load_initial_schedule(cls.raw_requests)
        cls.engineers = get_default_engineers()
        cls.equipment = get_default_equipment()
        cls.engine = ConflictEngine(cls.contracts, cls.engineers, cls.equipment)
        cls.optimizer = AIOptimizer(cls.engine, cls.contracts, cls.engineers, cls.equipment)
        cls.exporter = SubmissionExporter(cls.contracts)

    def test_01_topology_and_expansion(self):
        """Verify dual-line topology, stations, and path expansion."""
        self.assertIn("ALP", MRT_LINES)
        self.assertIn("BET", MRT_LINES)
        self.assertEqual(len(STATIONS_BY_LINE["ALP"]), 10)
        self.assertEqual(len(STATIONS_BY_LINE["BET"]), 10)
        self.assertIn("H01", INTERCHANGE_HUBS)
        self.assertIn("H02", INTERCHANGE_HUBS)

        # Sector parsing
        line, s_from, s_to, bound = parse_sector_id("SEC:ALP:S03_S04:EB")
        self.assertEqual((line, s_from, s_to, bound), ("ALP", "S03", "S04", "EB"))

        # Path expansion
        locs = expand_activity_occupancy_locations("SEC:BET:S15_S16:EB", "SEC:BET:S16_S17:EB")
        self.assertIn("PLAT:BET:S15:EB", locs)
        self.assertIn("PLAT:BET:S16:EB", locs)
        self.assertIn("PLAT:BET:S17:EB", locs)
        self.assertIn("SEC:BET:S15_S16:EB", locs)
        self.assertIn("SEC:BET:S16_S17:EB", locs)

    def test_02_safety_buffers_and_live_mirroring(self):
        """Verify buffer calculations and 750V Live opposite bound / interchange crossover."""
        # Non-live (Others): 0 buffer
        others_buf = calculate_safety_exclusion_buffers("ALP", "EB", "SEC:ALP:S01_S02:EB", "SEC:ALP:S01_S02:EB", "Non-live (Others)")
        self.assertEqual(len(others_buf), 0)

        # Non-live (Consist): 1 buffer sector upstream and downstream on same bound
        consist_buf = calculate_safety_exclusion_buffers("ALP", "EB", "SEC:ALP:S02_S03:EB", "SEC:ALP:S02_S03:EB", "Non-live (Consist)")
        self.assertTrue(any("S01_S02:EB" in b for b in consist_buf))
        self.assertTrue(any("S03_S04:EB" in b for b in consist_buf))
        self.assertFalse(any("WB" in b for b in consist_buf))

        # Live: 2 sectors + opposite bound WB + H01/H02 cross-line crossover
        live_buf = calculate_safety_exclusion_buffers("ALP", "EB", "SEC:ALP:S03_S04:EB", "SEC:ALP:S04_H01:EB", "Live")
        self.assertTrue(any("WB" in b for b in live_buf), "Live works must mirror to opposite bound")
        # Touches H01, so must isolate BET interchange tunnel as well
        self.assertTrue(any("BET:H01_H02" in b for b in live_buf), "Live works touching H01 must isolate Line Beta interchange tunnel")

    def test_03_data_loading(self):
        """Verify CSV data ingestion."""
        self.assertEqual(len(self.contracts), 14)
        self.assertEqual(len(self.requests), 54)
        self.assertGreaterEqual(len(self.engineers), 10)
        self.assertGreaterEqual(len(self.equipment), 8)

    def test_04_conflict_detection_benchmarks(self):
        """Verify synthetic conflict injection and detection."""
        test_reqs = copy.deepcopy(self.requests)

        # Inject Predecessor violation: A004 starts before A003 finishes
        req_map = {r.activity_id: r for r in test_reqs}
        if "A004" in req_map:
            req_map["A004"].scheduled_accesses = [
                ScheduledAccess(seq=1, week=5, eclo=0, access_night=1)
            ]
        if "A003" in req_map:
            req_map["A003"].scheduled_accesses = [
                ScheduledAccess(seq=1, week=10, eclo=0, access_night=1)
            ]

        conflicts = self.engine.detect_conflicts(test_reqs)
        pred_clashes = [c for c in conflicts if c.type == ConflictType.PREDECESSOR_PRECEDENCE]
        self.assertTrue(len(pred_clashes) > 0, "Expected predecessor conflict detected")

    def test_05_minimal_perturbation_resolution(self):
        """Verify 1-click smart minimal perturbation resolution."""
        test_reqs = copy.deepcopy(self.requests)
        req_map = {r.activity_id: r for r in test_reqs}
        # Create clash
        if "A038" in req_map and "A037" in req_map:
            req_map["A038"].scheduled_accesses = [
                ScheduledAccess(seq=1, week=5, eclo=0, access_night=1)
            ]
            req_map["A037"].scheduled_accesses = [
                ScheduledAccess(seq=1, week=8, eclo=0, access_night=1)
            ]

        conflicts = self.engine.detect_conflicts(test_reqs)
        clash = next(c for c in conflicts if c.type == ConflictType.PREDECESSOR_PRECEDENCE and "A038" in c.activity_ids)

        resolved_reqs, msg = self.optimizer.resolve_single_conflict(clash.id, test_reqs)
        new_conflicts = self.engine.detect_conflicts(resolved_reqs)
        self.assertTrue(len(new_conflicts) < len(conflicts))
        self.assertIn("Rescheduled", msg)

    def test_06_scenarios_and_official_csv_export(self):
        """Verify Scenarios A, B, C and official CSV outputs."""
        scen_a = self.optimizer.build_scenario_a(self.requests)
        self.assertEqual(scen_a.metrics.hard_violations, 0)
        self.assertEqual(scen_a.metrics.eclo_nights_total, 0, "Scenario A forbids ECLO")
        self.assertEqual(scen_a.metrics.overrun_days_total, 28)

        scen_b = self.optimizer.build_scenario_b(self.requests)
        self.assertEqual(scen_b.metrics.hard_violations, 0)
        self.assertEqual(scen_b.metrics.overrun_days_total, 0, "Scenario B must have zero overrun days")
        self.assertGreater(scen_b.metrics.eclo_nights_total, 0)

        scen_c = self.optimizer.build_scenario_c(self.requests)
        self.assertEqual(scen_c.metrics.hard_violations, 0)

        scen_2wk = self.optimizer.build_two_week_operational_timetable(self.requests, start_week=1)
        self.assertEqual(scen_2wk.metrics.hard_violations, 0)
        # Check that crew is assigned in 2-week view
        assigned_crew_count = sum(
            sum(len(a.assigned_engineers) for a in r.scheduled_accesses if a.week <= 2)
            for r in scen_2wk.requests
        )
        self.assertGreater(assigned_crew_count, 0)

        # Test CSV Export
        access_csv = self.exporter.generate_schedule_access_csv(scen_a.requests)
        occupancy_csv = self.exporter.generate_schedule_occupancy_csv(scen_a.requests)
        results_csv = self.exporter.generate_results_csv("A", scen_a.requests)

        self.assertIn("activity_id,access_seq,week,eclo,access_night", access_csv)
        self.assertIn("activity_id,week,location_id,co_share_group", occupancy_csv)
        self.assertIn("scenario,contract_number,simulated_completion_date,overrun_days", results_csv)

        # Test ZIP bundle creation
        zip_bytes = self.exporter.create_zip_archive("A", scen_a.requests)
        self.assertGreater(len(zip_bytes), 1000)


if __name__ == "__main__":
    unittest.main()
