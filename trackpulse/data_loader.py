"""
RailOptix - Ground Truth Data Loader and Dynamic Instance Ingestion Engine
Supports:
1. Default loading from workspace CSV files (01-08)
2. In-memory multi-file upload for undisclosed/hidden test instances (8 CSVs or ZIP)
3. Referential integrity and schema validation
4. Certified engineering rosters and equipment registries
"""
import os
import io
import csv
import zipfile
from typing import Dict, List, Tuple, Optional, Any
from trackpulse.models import (
    Contract, MaintenanceRequest, ScheduledAccess,
    Engineer, Equipment
)

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXPECTED_FILES = [
    "01_LINES.csv",
    "02_STATIONS.csv",
    "03_SECTORS.csv",
    "04_LOCATION_SUPPLY.csv",
    "05_BUFFER_LOCATION.csv",
    "06_PARAMETERS.csv",
    "07_PROJECT_DETAILS.csv",
    "08_ACTIVITY_DETAILS.csv"
]

REQUIRED_COLUMNS = {
    "01_LINES.csv": {"line_code", "line_name"},
    "02_STATIONS.csv": {"station_id", "line_code", "seq", "is_interchange"},
    "03_SECTORS.csv": {"sector_id", "line_code", "from_station_id", "to_station_id", "seq", "is_shared"},
    "04_LOCATION_SUPPLY.csv": {"location_id", "location_kind", "line_code", "bound", "supply_capacity"},
    "05_BUFFER_LOCATION.csv": {"nature_of_works", "up_to_buffer_sectors", "opposite_bound_required"},
    "06_PARAMETERS.csv": {"key", "value"},
    "07_PROJECT_DETAILS.csv": {
        "contract_number", "contract_description", "contract_award_date",
        "activity_type", "nature_of_activity", "contract_priority",
        "contract_completion_date", "planned_completion_date",
        "number_of_workfronts", "access_type", "number_of_maximum_access_per_week"
    },
    "08_ACTIVITY_DETAILS.csv": {
        "activity_id", "contract_number", "activity_type",
        "start_location_id", "end_location_id", "total_accesses",
        "planned_start_date", "predecessor_activity_id", "activity_priority"
    }
}


def load_contracts(contracts_file: Optional[str] = None) -> Dict[str, Contract]:
    file_path = contracts_file or os.path.join(WORKSPACE_DIR, "07_PROJECT_DETAILS.csv")
    contracts: Dict[str, Contract] = {}
    if not os.path.exists(file_path):
        return contracts

    with open(file_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            c = Contract(
                contract_number=row["contract_number"],
                contract_description=row["contract_description"],
                contract_award_date=row["contract_award_date"],
                activity_type=row["activity_type"],
                nature_of_activity=row["nature_of_activity"],
                contract_priority=int(row["contract_priority"]),
                contract_completion_date=row["contract_completion_date"],
                planned_completion_date=row["planned_completion_date"],
                number_of_workfronts=int(row["number_of_workfronts"]),
                access_type=row["access_type"],
                number_of_maximum_access_per_week=int(row["number_of_maximum_access_per_week"])
            )
            contracts[c.contract_number] = c
    return contracts


def load_activities(contracts: Dict[str, Contract], activities_file: Optional[str] = None) -> List[MaintenanceRequest]:
    file_path = activities_file or os.path.join(WORKSPACE_DIR, "08_ACTIVITY_DETAILS.csv")
    requests: List[MaintenanceRequest] = []
    if not os.path.exists(file_path):
        return requests

    with open(file_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            contract_num = row["contract_number"]
            c = contracts.get(contract_num)
            pred = row.get("predecessor_activity_id")
            if pred and pred.strip() in ("", "None", "nan", "NULL"):
                pred = None
            req = MaintenanceRequest(
                activity_id=row["activity_id"],
                contract_number=contract_num,
                activity_type=row["activity_type"],
                start_location_id=row["start_location_id"],
                end_location_id=row["end_location_id"],
                total_accesses=float(row["total_accesses"]),
                planned_start_date=row["planned_start_date"],
                predecessor_activity_id=pred,
                activity_priority=int(row["activity_priority"]),
                nature_of_works=c.nature_of_activity if c else "Non-live (Others)",
                access_type=c.access_type if c else "C",
                contract_priority=c.contract_priority if c else 3,
                scheduled_accesses=[],
                simulated_completion_date=None,
                overrun_days=0
            )
            requests.append(req)
    return requests


def load_initial_schedule(requests: List[MaintenanceRequest], access_file: Optional[str] = None) -> List[MaintenanceRequest]:
    file_path = access_file or os.path.join(WORKSPACE_DIR, "SCHEDULE_ACCESS.csv")
    if not os.path.exists(file_path):
        return requests

    req_map = {r.activity_id: r for r in requests}
    with open(file_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            act_id = row["activity_id"]
            if act_id in req_map:
                req_map[act_id].scheduled_accesses.append(
                    ScheduledAccess(
                        seq=int(row["access_seq"]),
                        week=int(row["week"]),
                        eclo=int(row.get("eclo", 0)),
                        access_night=int(row["access_night"]),
                        co_share_group="b1"
                    )
                )

    for r in requests:
        r.scheduled_accesses.sort(key=lambda a: (a.week, a.access_night, a.seq))
    return requests


def extract_files_from_zip(zip_bytes: bytes) -> Dict[str, bytes]:
    files: Dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            base_name = os.path.basename(name)
            if base_name in EXPECTED_FILES:
                files[base_name] = zf.read(name)
    return files


def validate_instance_bytes(files_dict: Dict[str, bytes]) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    for expected in EXPECTED_FILES:
        if expected not in files_dict:
            errors.append(f"Missing required file: {expected}")
    if errors:
        return False, errors

    parsed_rows: Dict[str, List[Dict[str, str]]] = {}
    for filename, raw_bytes in files_dict.items():
        try:
            text = raw_bytes.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            fieldnames = set(reader.fieldnames or [])
            req_cols = REQUIRED_COLUMNS.get(filename, set())
            missing_cols = req_cols - fieldnames
            if missing_cols:
                errors.append(f"{filename}: Missing columns {', '.join(sorted(missing_cols))}")
            parsed_rows[filename] = list(reader)
        except Exception as e:
            errors.append(f"{filename}: Failed to parse CSV: {str(e)}")

    if errors:
        return False, errors

    proj_rows = parsed_rows.get("07_PROJECT_DETAILS.csv", [])
    act_rows = parsed_rows.get("08_ACTIVITY_DETAILS.csv", [])
    supply_rows = parsed_rows.get("04_LOCATION_SUPPLY.csv", [])
    param_rows = parsed_rows.get("06_PARAMETERS.csv", [])

    contract_ids = {r["contract_number"] for r in proj_rows}
    location_ids = {r["location_id"] for r in supply_rows}
    activity_ids = {r["activity_id"] for r in act_rows}

    params = {r["key"]: r["value"] for r in param_rows if "key" in r and "value" in r}
    if "horizon_start" not in params:
        errors.append("06_PARAMETERS.csv: Missing horizon_start")
    if "horizon_weeks" not in params:
        errors.append("06_PARAMETERS.csv: Missing horizon_weeks")

    for act in act_rows:
        cid = act.get("contract_number")
        if cid not in contract_ids:
            errors.append(f"08_ACTIVITY_DETAILS.csv: Activity {act.get('activity_id')} references unknown contract {cid}")
        pred = act.get("predecessor_activity_id")
        if pred and pred.strip() not in ("", "None", "nan", "NULL") and pred not in activity_ids:
            errors.append(f"08_ACTIVITY_DETAILS.csv: Activity {act.get('activity_id')} references unknown predecessor {pred}")
        sloc = act.get("start_location_id")
        eloc = act.get("end_location_id")
        if sloc and sloc not in location_ids:
            errors.append(f"08_ACTIVITY_DETAILS.csv: Activity {act.get('activity_id')} unknown start_location_id {sloc}")
        if eloc and eloc not in location_ids:
            errors.append(f"08_ACTIVITY_DETAILS.csv: Activity {act.get('activity_id')} unknown end_location_id {eloc}")

    if errors:
        return False, errors[:15]
    return True, []


def parse_instance_from_bytes(
    files_dict: Dict[str, bytes]
) -> Tuple[Dict[str, Contract], List[MaintenanceRequest], Dict[str, str], Dict[str, int], Dict[str, Any]]:
    proj_text = files_dict["07_PROJECT_DETAILS.csv"].decode("utf-8-sig")
    contracts: Dict[str, Contract] = {}
    for row in csv.DictReader(io.StringIO(proj_text)):
        c = Contract(
            contract_number=row["contract_number"],
            contract_description=row["contract_description"],
            contract_award_date=row["contract_award_date"],
            activity_type=row["activity_type"],
            nature_of_activity=row["nature_of_activity"],
            contract_priority=int(row["contract_priority"]),
            contract_completion_date=row["contract_completion_date"],
            planned_completion_date=row["planned_completion_date"],
            number_of_workfronts=int(row["number_of_workfronts"]),
            access_type=row["access_type"],
            number_of_maximum_access_per_week=int(row["number_of_maximum_access_per_week"])
        )
        contracts[c.contract_number] = c

    act_text = files_dict["08_ACTIVITY_DETAILS.csv"].decode("utf-8-sig")
    requests: List[MaintenanceRequest] = []
    for row in csv.DictReader(io.StringIO(act_text)):
        contract_num = row["contract_number"]
        c = contracts.get(contract_num)
        pred = row.get("predecessor_activity_id")
        if pred and pred.strip() in ("", "None", "nan", "NULL"):
            pred = None
        req = MaintenanceRequest(
            activity_id=row["activity_id"],
            contract_number=contract_num,
            activity_type=row["activity_type"],
            start_location_id=row["start_location_id"],
            end_location_id=row["end_location_id"],
            total_accesses=float(row["total_accesses"]),
            planned_start_date=row["planned_start_date"],
            predecessor_activity_id=pred,
            activity_priority=int(row["activity_priority"]),
            nature_of_works=c.nature_of_activity if c else "Non-live (Others)",
            access_type=c.access_type if c else "C",
            contract_priority=c.contract_priority if c else 3,
            scheduled_accesses=[],
            simulated_completion_date=None,
            overrun_days=0
        )
        requests.append(req)

    param_text = files_dict["06_PARAMETERS.csv"].decode("utf-8-sig")
    params: Dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(param_text)):
        if "key" in row and "value" in row:
            params[row["key"]] = row["value"]

    supply_text = files_dict["04_LOCATION_SUPPLY.csv"].decode("utf-8-sig")
    supply_capacities: Dict[str, int] = {}
    for row in csv.DictReader(io.StringIO(supply_text)):
        supply_capacities[row["location_id"]] = int(row["supply_capacity"])

    metadata = {
        "num_contracts": len(contracts),
        "num_activities": len(requests)
    }

    return contracts, requests, params, supply_capacities, metadata


def get_default_engineers() -> Dict[str, Engineer]:
    roster = [
        Engineer(id="ENG-01", name="Tan Wei Ming", role="Senior Track Master", certifications=["LIVE_750V", "TRACK_RENEWAL", "HEAVY_CONSIST"]),
        Engineer(id="ENG-02", name="Mohd Farhan", role="High Voltage Isolation Lead", certifications=["LIVE_750V", "SIGNALING"]),
        Engineer(id="ENG-03", name="Kumar S/O Raj", role="Track Renewal Specialist", certifications=["TRACK_RENEWAL", "HEAVY_CONSIST"]),
        Engineer(id="ENG-04", name="Lim Zhi Hao", role="Tamping Machine Operator", certifications=["HEAVY_CONSIST", "TRACK_RENEWAL"]),
        Engineer(id="ENG-05", name="Ahmad Syazwan", role="Signaling & Telecom Lead", certifications=["SIGNALING", "TRACK_RENEWAL"]),
        Engineer(id="ENG-06", name="David Ng", role="Possession Safety Controller", certifications=["LIVE_750V", "TRACK_RENEWAL"]),
        Engineer(id="ENG-07", name="K. Sivakumar", role="Heavy Machinery Shunter", certifications=["HEAVY_CONSIST"]),
        Engineer(id="ENG-08", name="Chen Jun Jie", role="Track Renewal Tech", certifications=["TRACK_RENEWAL"]),
        Engineer(id="ENG-09", name="Nurul Huda", role="Live-Rail Safety Marshal", certifications=["LIVE_750V", "SIGNALING"]),
        Engineer(id="ENG-10", name="Brandon Lee", role="Civil Infrastructure Tech", certifications=["TRACK_RENEWAL"]),
        Engineer(id="ENG-11", name="Zulkifli Mansor", role="Rail Grinder Lead", certifications=["HEAVY_CONSIST", "TRACK_RENEWAL"]),
        Engineer(id="ENG-12", name="Pravin Kumar", role="Senior Signaling Tech", certifications=["SIGNALING"]),
    ]
    return {e.id: e for e in roster}


def get_default_equipment() -> Dict[str, Equipment]:
    units = [
        Equipment(id="EQ-TMP-01", name="Plasser 08-16 Track Tamper", type="TAMPER"),
        Equipment(id="EQ-TMP-02", name="Matisa B45 Tamping Unit", type="TAMPER"),
        Equipment(id="EQ-RGR-01", name="Linsinger Rail Milling/Grinder", type="RAIL_GRINDER"),
        Equipment(id="EQ-CRN-01", name="Kiene Heavy Track Crane Wagon", type="CRANE_WAGON"),
        Equipment(id="EQ-SHT-01", name="Diesel Shunter Locomotive 01", type="CONSIST_SHUNTER"),
        Equipment(id="EQ-SHT-02", name="Diesel Shunter Locomotive 02", type="CONSIST_SHUNTER"),
        Equipment(id="EQ-ISO-01", name="750V Third-Rail Isolation Kit A", type="ISOLATION_KIT"),
        Equipment(id="EQ-ISO-02", name="750V Third-Rail Isolation Kit B", type="ISOLATION_KIT"),
    ]
    return {eq.id: eq for eq in units}
