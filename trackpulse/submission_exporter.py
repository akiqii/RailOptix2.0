"""
RailOptix - Official Submission Deliverables Exporter
Generates the 3 mandatory challenge files:
1. SCHEDULE_ACCESS.csv
2. SCHEDULE_OCCUPANCY.csv
3. RESULTS.csv
"""
import io
import csv
import zipfile
from typing import List, Dict
from trackpulse.models import MaintenanceRequest, Contract
from trackpulse.topology import expand_activity_occupancy_locations

class SubmissionExporter:
    def __init__(self, contracts: Dict[str, Contract]):
        self.contracts = contracts

    def generate_schedule_access_csv(self, requests: List[MaintenanceRequest]) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["activity_id", "access_seq", "week", "eclo", "access_night"])

        for req in sorted(requests, key=lambda r: r.activity_id):
            for acc in sorted(req.scheduled_accesses, key=lambda a: (a.week, a.seq)):
                writer.writerow([
                    req.activity_id,
                    acc.seq,
                    acc.week,
                    acc.eclo,
                    acc.access_night
                ])
        return output.getvalue()

    def generate_schedule_occupancy_csv(self, requests: List[MaintenanceRequest]) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["activity_id", "week", "location_id", "co_share_group"])

        rows = []
        for req in requests:
            locations = expand_activity_occupancy_locations(req.start_location_id, req.end_location_id)
            for acc in req.scheduled_accesses:
                for loc in locations:
                    rows.append((req.activity_id, acc.week, loc, acc.co_share_group))

        rows.sort(key=lambda r: (r[0], r[1], r[2]))
        for row in rows:
            writer.writerow(row)
        return output.getvalue()

    def generate_results_csv(self, scenario_letter: str, requests: List[MaintenanceRequest]) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["scenario", "contract_number", "simulated_completion_date", "overrun_days"])

        req_by_contract: Dict[str, List[MaintenanceRequest]] = {}
        for r in requests:
            req_by_contract.setdefault(r.contract_number, []).append(r)

        for c_num in sorted(self.contracts.keys()):
            acts = req_by_contract.get(c_num, [])
            sim_date = acts[0].simulated_completion_date if acts and acts[0].simulated_completion_date else self.contracts[c_num].planned_completion_date
            overrun = acts[0].overrun_days if acts else 0
            writer.writerow([scenario_letter, c_num, sim_date, overrun])

        return output.getvalue()

    def create_zip_archive(self, scenario_letter: str, requests: List[MaintenanceRequest]) -> bytes:
        access_csv = self.generate_schedule_access_csv(requests)
        occupancy_csv = self.generate_schedule_occupancy_csv(requests)
        results_csv = self.generate_results_csv(scenario_letter, requests)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("SCHEDULE_ACCESS.csv", access_csv)
            zf.writestr("SCHEDULE_OCCUPANCY.csv", occupancy_csv)
            zf.writestr("RESULTS.csv", results_csv)

        return zip_buffer.getvalue()
