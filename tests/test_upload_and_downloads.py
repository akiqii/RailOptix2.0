"""
Unit tests for Hidden Instance Upload, Deliverables Download, and Validation
"""
import os
import io
import zipfile
import unittest
from fastapi.testclient import TestClient

from trackpulse.server import app
from trackpulse.data_loader import (
    validate_instance_bytes, extract_files_from_zip, WORKSPACE_DIR, EXPECTED_FILES
)

class TestUploadAndDeliverables(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.csv_files = {}
        for fname in EXPECTED_FILES:
            fpath = os.path.join(WORKSPACE_DIR, fname)
            with open(fpath, "rb") as f:
                self.csv_files[fname] = f.read()

    def test_validation_success_on_benchmark_files(self):
        is_valid, errors = validate_instance_bytes(self.csv_files)
        self.assertTrue(is_valid, f"Validation failed with errors: {errors}")
        self.assertEqual(len(errors), 0)

    def test_validation_failure_on_missing_file(self):
        corrupted = dict(self.csv_files)
        del corrupted["08_ACTIVITY_DETAILS.csv"]
        is_valid, errors = validate_instance_bytes(corrupted)
        self.assertFalse(is_valid)
        self.assertTrue(any("08_ACTIVITY_DETAILS.csv" in e for e in errors))

    def test_upload_instance_multipart(self):
        upload_payload = []
        for fname, raw_bytes in self.csv_files.items():
            upload_payload.append(("files", (fname, raw_bytes, "text/csv")))

        response = self.client.post("/api/upload-instance", files=upload_payload)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("activities", data["message"].lower())

    def test_upload_instance_zip(self):
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname, raw_bytes in self.csv_files.items():
                zf.writestr(fname, raw_bytes)
        zip_bytes = zip_buf.getvalue()

        response = self.client.post(
            "/api/upload-instance",
            files=[("files", ("test_instance.zip", zip_bytes, "application/zip"))]
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["status"], "success")

    def test_instance_info_endpoint(self):
        resp = self.client.get("/api/instance-info")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("instance_name", data)
        self.assertIn("num_activities", data)

    def test_download_deliverables(self):
        for fname in ["SCHEDULE_ACCESS.csv", "SCHEDULE_OCCUPANCY.csv", "RESULTS.csv"]:
            resp = self.client.get(f"/api/download/{fname}")
            self.assertEqual(resp.status_code, 200, f"Failed to download {fname}")
            self.assertGreater(len(resp.text), 10)
            lines = resp.text.strip().split("\n")
            self.assertGreater(len(lines), 1)

    def test_scenario_download_deliverables(self):
        for scen in ["A", "B", "C"]:
            for fname in ["SCHEDULE_ACCESS.csv", "SCHEDULE_OCCUPANCY.csv", "RESULTS.csv"]:
                resp = self.client.get(f"/api/download/{scen}/{fname}")
                self.assertEqual(resp.status_code, 200, f"Failed to download {scen}/{fname}")
                self.assertGreater(len(resp.text), 10)

    def test_export_zip_endpoints(self):
        # Default /api/export
        resp = self.client.get("/api/export")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["content-type"], "application/zip")
        self.assertIn("RailOptix_Scenario_", resp.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            namelist = zf.namelist()
            self.assertIn("SCHEDULE_ACCESS.csv", namelist)
            self.assertIn("SCHEDULE_OCCUPANCY.csv", namelist)
            self.assertIn("RESULTS.csv", namelist)
            self.assertGreater(len(zf.read("SCHEDULE_ACCESS.csv")), 50)
            self.assertGreater(len(zf.read("RESULTS.csv")), 50)

        # Explicit /api/export/A, B, C
        for scen in ["A", "B", "C"]:
            resp = self.client.get(f"/api/export/{scen}")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.headers["content-type"], "application/zip")
            self.assertIn(f"RailOptix_Scenario_{scen}_Deliverables.zip", resp.headers["content-disposition"])
            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                namelist = zf.namelist()
                self.assertIn("SCHEDULE_ACCESS.csv", namelist)
                self.assertIn("SCHEDULE_OCCUPANCY.csv", namelist)
                self.assertIn("RESULTS.csv", namelist)

    def test_reset_instance(self):
        resp = self.client.post("/api/reset-instance")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("Public Test Benchmark", data["instance_name"])

if __name__ == "__main__":
    unittest.main()
