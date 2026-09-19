"""
Unit tests for RailOptix ReferenceValidator, WorksControllerAssistant, and DisruptionEngine.
Validates exact compliance with Problem Statement 1 Section 2.7 and Bonus Scope.
"""
import unittest
from trackpulse.data_loader import (
    load_contracts, load_activities, load_initial_schedule,
    get_default_engineers, get_default_equipment
)
from trackpulse.conflict_engine import ConflictEngine
from trackpulse.ai_optimizer import AIOptimizer
from trackpulse.validator import ReferenceValidator
from trackpulse.assistant import WorksControllerAssistant
from trackpulse.disruption_engine import DisruptionEngine

class TestValidatorAndBonusFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contracts = load_contracts()
        cls.acts = load_activities(cls.contracts)
        cls.reqs = load_initial_schedule(cls.acts)
        cls.engineers = get_default_engineers()
        cls.equipment = get_default_equipment()
        cls.engine = ConflictEngine(cls.contracts, cls.engineers, cls.equipment)
        cls.optimizer = AIOptimizer(cls.engine, cls.contracts, cls.engineers, cls.equipment)
        cls.validator = ReferenceValidator(cls.contracts)
        cls.assistant = WorksControllerAssistant(cls.contracts, cls.engineers, cls.equipment)
        cls.disruption = DisruptionEngine(cls.contracts, cls.engine)

    def test_scenario_a_feasibility(self):
        scen_a = self.optimizer.build_scenario_a(self.reqs)
        report = self.validator.validate("A", scen_a.requests)
        self.assertTrue(report["feasible"], f"Scenario A had hard violations: {report['hard_violations']}")
        self.assertEqual(len(report["hard_violations"]), 0)
        self.assertIn("soft_scores", report)
        self.assertGreater(report["soft_scores"]["priority_weighted_score"], 0)

    def test_scenario_b_feasibility_and_zero_overrun(self):
        scen_b = self.optimizer.build_scenario_b(self.reqs)
        report = self.validator.validate("B", scen_b.requests)
        self.assertTrue(report["feasible"], f"Scenario B had hard violations: {report['hard_violations']}")
        self.assertEqual(len(report["hard_violations"]), 0)
        self.assertEqual(report["soft_scores"]["overrun_days_total"], 0)
        self.assertEqual(report["soft_scores"]["contracts_overrunning"], 0)

    def test_scenario_c_feasibility_and_eclo_window(self):
        scen_c = self.optimizer.build_scenario_c(self.reqs)
        report = self.validator.validate("C", scen_c.requests)
        self.assertTrue(report["feasible"], f"Scenario C had hard violations: {report['hard_violations']}")
        self.assertEqual(len(report["hard_violations"]), 0)
        self.assertIn("detail", report)

    def test_works_controller_assistant_briefing(self):
        scen_a = self.optimizer.build_scenario_a(self.reqs)
        res = self.assistant.query("Generate shift handover brief for Week 1 Night 1", scen_a.requests)
        self.assertIn("title", res)
        self.assertIn("response", res)
        self.assertIn("Handover Brief", res["title"])
        self.assertIn("data", res)

    def test_works_controller_assistant_root_cause(self):
        scen_a = self.optimizer.build_scenario_a(self.reqs)
        res = self.assistant.query("Why does contract C006 overrun in Scenario A?", scen_a.requests)
        self.assertIn("title", res)
        self.assertIn("Root-Cause Analysis", res["title"])
        self.assertIn("C006", res["response"])

    def test_disruption_simulator_minimal_churn(self):
        scen_a = self.optimizer.build_scenario_a(self.reqs)
        res = self.disruption.simulate_disruption(
            base_requests=scen_a.requests,
            location_id="SEC:BET:H01_H02:EB",
            start_week=16,
            end_week=16,
            new_capacity=1,
            disruption_name="Emergency Power Outage at H01_H02",
            inject_emergency_work=True
        )
        self.assertEqual(res["blast_radius"]["displaced_accesses_count"], 3)
        self.assertIn("A003", res["blast_radius"]["displaced_activities"])
        self.assertLess(res["churn_metrics"]["churn_percentage"], 10.0)
        self.assertTrue(res["post_replan_status"]["feasible"])

if __name__ == "__main__":
    unittest.main()
