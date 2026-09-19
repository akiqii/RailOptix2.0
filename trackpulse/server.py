"""
RailOptix - Main Application Server (FastAPI)
LTA Rail Engineering Hours Scheduler & Multi-Scenario AI Optimization Engine
Supports:
- Public Test Benchmark (54 activities, 14 contracts, certified deliverables)
- Undisclosed/Hidden Test Instance Live Ingestion (8 CSVs or ZIP)
- Multi-dimensional conflict detection and minimal-perturbation AI resolution
- Live CSV Deliverable Downloads (SCHEDULE_ACCESS.csv, SCHEDULE_OCCUPANCY.csv, RESULTS.csv)
"""
import sys
import os
import copy
from typing import List, Dict, Optional, Any
from fastapi import FastAPI, HTTPException, Body, Response, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

sys.stdout.reconfigure(encoding="utf-8")

from trackpulse.models import (
    MaintenanceRequest, Conflict, TimetableScenario, TimetableMetrics,
    Engineer, Equipment, Contract, ScheduledAccess
)
from trackpulse.topology import (
    MRT_LINES, STATIONS_BY_LINE, INTERCHANGE_HUBS,
    LOCATION_SUPPLY_CAPACITY, parse_sector_id
)
from trackpulse.data_loader import (
    load_contracts, load_activities, load_initial_schedule,
    get_default_engineers, get_default_equipment,
    extract_files_from_zip, validate_instance_bytes, parse_instance_from_bytes
)
from trackpulse.conflict_engine import ConflictEngine
from trackpulse.ai_optimizer import AIOptimizer
from trackpulse.submission_exporter import SubmissionExporter
from trackpulse.validator import ReferenceValidator
from trackpulse.assistant import WorksControllerAssistant
from trackpulse.disruption_engine import DisruptionEngine

app = FastAPI(
    title="RailOptix — LTA Engineering Hours Track Access Scheduler",
    description="Automated multi-dimensional conflict detection, minimal-perturbation AI optimization, and official challenge deliverables generator.",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if any(request.url.path.endswith(ext) for ext in [".js", ".css", ".html"]) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.get("/favicon.ico")
def favicon():
    return Response(content=b"", status_code=204)

# Global State Management
CONTRACTS: Dict[str, Contract] = load_contracts()
REQUESTS: List[MaintenanceRequest] = load_initial_schedule(load_activities(CONTRACTS))
BASELINE_REQUESTS: List[MaintenanceRequest] = copy.deepcopy(REQUESTS)
ENGINEERS: Dict[str, Engineer] = get_default_engineers()
EQUIPMENT: Dict[str, Equipment] = get_default_equipment()

CONFLICT_ENGINE = ConflictEngine(CONTRACTS, ENGINEERS, EQUIPMENT)
OPTIMIZER = AIOptimizer(CONFLICT_ENGINE, CONTRACTS, ENGINEERS, EQUIPMENT)
EXPORTER = SubmissionExporter(CONTRACTS)
VALIDATOR = ReferenceValidator(CONTRACTS)
ASSISTANT = WorksControllerAssistant(CONTRACTS, ENGINEERS, EQUIPMENT)
DISRUPTION_ENGINE = DisruptionEngine(CONTRACTS, CONFLICT_ENGINE)

ACTIVE_SCENARIO_ID = "scenario_a_strict_supply"
ACTIVE_INSTANCE_NAME = "Public Test Benchmark (54 Activities, 14 Contracts)"
IS_BENCHMARK = True

scen_a = OPTIMIZER.build_scenario_a(REQUESTS)
REQUESTS = scen_a.requests

@app.get("/api/instance-info")
def get_instance_info():
    return {
        "instance_name": ACTIVE_INSTANCE_NAME,
        "is_benchmark": IS_BENCHMARK,
        "active_scenario_id": ACTIVE_SCENARIO_ID,
        "num_contracts": len(CONTRACTS),
        "num_activities": len(REQUESTS),
        "num_engineers": len(ENGINEERS),
        "num_equipment": len(EQUIPMENT)
    }

@app.post("/api/upload-instance")
async def upload_instance(files: List[UploadFile] = File(...)):
    global CONTRACTS, REQUESTS, BASELINE_REQUESTS, CONFLICT_ENGINE, OPTIMIZER, EXPORTER
    global ACTIVE_INSTANCE_NAME, IS_BENCHMARK, ACTIVE_SCENARIO_ID

    files_dict: Dict[str, bytes] = {}
    for f in files:
        data = await f.read()
        fname = f.filename or ""
        if fname.lower().endswith(".zip"):
            extracted = extract_files_from_zip(data)
            files_dict.update(extracted)
        else:
            base = os.path.basename(fname)
            files_dict[base] = data

    is_valid, errors = validate_instance_bytes(files_dict)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={"message": "Uploaded files failed schema or integrity validation", "errors": errors}
        )

    new_contracts, new_requests, params, capacities, meta = parse_instance_from_bytes(files_dict)
    
    CONTRACTS = new_contracts
    REQUESTS = new_requests
    BASELINE_REQUESTS = copy.deepcopy(REQUESTS)
    
    h_start = params.get("horizon_start", "2027-01-04")
    h_weeks = int(params.get("horizon_weeks", 30))
    
    CONFLICT_ENGINE = ConflictEngine(CONTRACTS, ENGINEERS, EQUIPMENT)
    OPTIMIZER = AIOptimizer(CONFLICT_ENGINE, CONTRACTS, ENGINEERS, EQUIPMENT, horizon_start_str=h_start, horizon_weeks=h_weeks)
    EXPORTER = SubmissionExporter(CONTRACTS)
    VALIDATOR = ReferenceValidator(CONTRACTS)
    ASSISTANT = WorksControllerAssistant(CONTRACTS, ENGINEERS, EQUIPMENT)
    DISRUPTION_ENGINE = DisruptionEngine(CONTRACTS, CONFLICT_ENGINE)
    
    ACTIVE_INSTANCE_NAME = f"Custom Test Instance ({meta['num_activities']} Activities, {meta['num_contracts']} Contracts)"
    IS_BENCHMARK = False
    ACTIVE_SCENARIO_ID = "scenario_a_strict_supply"
    
    solved_scen_a = OPTIMIZER.build_scenario_a(REQUESTS)
    REQUESTS = solved_scen_a.requests

    return {
        "status": "success",
        "instance_name": ACTIVE_INSTANCE_NAME,
        "metadata": meta,
        "metrics": solved_scen_a.metrics,
        "message": f"Successfully loaded and solved custom instance with {meta['num_activities']} activities across {meta['num_contracts']} contracts."
    }

@app.post("/api/reset-instance")
def reset_instance():
    global CONTRACTS, REQUESTS, BASELINE_REQUESTS, CONFLICT_ENGINE, OPTIMIZER, EXPORTER
    global ACTIVE_INSTANCE_NAME, IS_BENCHMARK, ACTIVE_SCENARIO_ID, VALIDATOR, ASSISTANT, DISRUPTION_ENGINE

    CONTRACTS = load_contracts()
    REQUESTS = load_initial_schedule(load_activities(CONTRACTS))
    BASELINE_REQUESTS = copy.deepcopy(REQUESTS)
    CONFLICT_ENGINE = ConflictEngine(CONTRACTS, ENGINEERS, EQUIPMENT)
    OPTIMIZER = AIOptimizer(CONFLICT_ENGINE, CONTRACTS, ENGINEERS, EQUIPMENT)
    EXPORTER = SubmissionExporter(CONTRACTS)
    VALIDATOR = ReferenceValidator(CONTRACTS)
    ASSISTANT = WorksControllerAssistant(CONTRACTS, ENGINEERS, EQUIPMENT)
    DISRUPTION_ENGINE = DisruptionEngine(CONTRACTS, CONFLICT_ENGINE)

    ACTIVE_INSTANCE_NAME = "Public Test Benchmark (54 Activities, 14 Contracts)"
    IS_BENCHMARK = True
    ACTIVE_SCENARIO_ID = "scenario_a_strict_supply"

    scen_a = OPTIMIZER.build_scenario_a(REQUESTS)
    REQUESTS = scen_a.requests

    return {
        "status": "success",
        "instance_name": ACTIVE_INSTANCE_NAME,
        "message": "Reset to default public test benchmark instance."
    }

@app.get("/api/download/{filename}")
def download_deliverable(filename: str):
    fname = filename.upper()
    if fname not in ["SCHEDULE_ACCESS.CSV", "SCHEDULE_OCCUPANCY.CSV", "RESULTS.CSV"]:
        raise HTTPException(status_code=404, detail="File must be SCHEDULE_ACCESS.csv, SCHEDULE_OCCUPANCY.csv, or RESULTS.csv")

    current_letter = "A" if "scenario_a" in ACTIVE_SCENARIO_ID else ("B" if "scenario_b" in ACTIVE_SCENARIO_ID else "C")
    
    if fname == "SCHEDULE_ACCESS.CSV":
        content = EXPORTER.generate_schedule_access_csv(REQUESTS)
    elif fname == "SCHEDULE_OCCUPANCY.CSV":
        content = EXPORTER.generate_schedule_occupancy_csv(REQUESTS)
    else:
        content = EXPORTER.generate_results_csv(current_letter, REQUESTS)

    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/network")
def get_network():
    return {
        "lines": MRT_LINES,
        "stations_by_line": STATIONS_BY_LINE,
        "interchange_hubs": list(INTERCHANGE_HUBS),
        "location_supply": LOCATION_SUPPLY_CAPACITY
    }

@app.get("/api/contracts")
def get_contracts():
    return list(CONTRACTS.values())

@app.get("/api/requests", response_model=List[MaintenanceRequest])
def get_requests():
    return REQUESTS

@app.post("/api/requests", response_model=MaintenanceRequest)
def add_request(req: MaintenanceRequest):
    global REQUESTS
    c = CONTRACTS.get(req.contract_number)
    if c:
        req.nature_of_works = c.nature_of_activity
        req.access_type = c.access_type
        req.contract_priority = c.contract_priority

    if not req.scheduled_accesses:
        req.scheduled_accesses.append(
            ScheduledAccess(
                seq=1,
                week=1,
                eclo=0,
                access_night=1,
                co_share_group="b1"
            )
        )

    REQUESTS.append(req)
    return req

@app.put("/api/requests/{activity_id}", response_model=MaintenanceRequest)
def update_request(activity_id: str, updated_req: MaintenanceRequest):
    global REQUESTS
    for i, r in enumerate(REQUESTS):
        if r.activity_id == activity_id:
            REQUESTS[i] = updated_req
            return updated_req
    raise HTTPException(status_code=404, detail="Activity not found")

@app.delete("/api/requests/{activity_id}")
def delete_request(activity_id: str):
    global REQUESTS
    initial_len = len(REQUESTS)
    REQUESTS = [r for r in REQUESTS if r.activity_id != activity_id]
    if len(REQUESTS) == initial_len:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "deleted", "activity_id": activity_id}

@app.get("/api/conflicts", response_model=List[Conflict])
def get_conflicts():
    return CONFLICT_ENGINE.detect_conflicts(REQUESTS)

@app.post("/api/resolve-clash")
def resolve_clash(payload: Dict[str, str] = Body(...)):
    global REQUESTS
    conflict_id = payload.get("conflict_id")
    if not conflict_id:
        raise HTTPException(status_code=400, detail="conflict_id required")

    updated_requests, message = OPTIMIZER.resolve_single_conflict(conflict_id, REQUESTS)
    REQUESTS = updated_requests
    new_conflicts = CONFLICT_ENGINE.detect_conflicts(REQUESTS)
    return {
        "status": "success",
        "message": message,
        "remaining_conflicts": len(new_conflicts),
        "requests": REQUESTS
    }

@app.get("/api/scenarios", response_model=List[TimetableScenario])
def get_all_scenarios():
    scen_a = OPTIMIZER.build_scenario_a(BASELINE_REQUESTS)
    scen_b = OPTIMIZER.build_scenario_b(BASELINE_REQUESTS)
    scen_c = OPTIMIZER.build_scenario_c(BASELINE_REQUESTS)
    scen_2wk = OPTIMIZER.build_two_week_operational_timetable(REQUESTS, start_week=1)
    return [scen_a, scen_b, scen_c, scen_2wk]

@app.post("/api/apply-scenario")
def apply_scenario(payload: Dict[str, str] = Body(...)):
    global REQUESTS, ACTIVE_SCENARIO_ID
    scen_id = payload.get("scenario_id")
    if scen_id == "scenario_a_strict_supply":
        scen = OPTIMIZER.build_scenario_a(BASELINE_REQUESTS)
    elif scen_id == "scenario_b_strict_schedule":
        scen = OPTIMIZER.build_scenario_b(BASELINE_REQUESTS)
    elif scen_id == "scenario_c_balanced":
        scen = OPTIMIZER.build_scenario_c(BASELINE_REQUESTS)
    elif scen_id == "two_week_operational":
        scen = OPTIMIZER.build_two_week_operational_timetable(REQUESTS, start_week=1)
    else:
        raise HTTPException(status_code=400, detail="Unknown scenario ID")

    REQUESTS = scen.requests
    ACTIVE_SCENARIO_ID = scen_id
    return {
        "status": "applied",
        "scenario_id": scen_id,
        "metrics": scen.metrics,
        "requests": REQUESTS
    }

@app.get("/api/roster", response_model=List[Engineer])
def get_roster():
    return list(ENGINEERS.values())

@app.get("/api/equipment", response_model=List[Equipment])
def get_equipment():
    return list(EQUIPMENT.values())

@app.get("/api/export")
@app.get("/api/export/")
def export_default_csv_bundle():
    current_letter = "A" if "scenario_a" in ACTIVE_SCENARIO_ID else ("B" if "scenario_b" in ACTIVE_SCENARIO_ID else "C")
    return export_csv_bundle(current_letter)

@app.get("/api/export/{scenario_letter}")
def export_csv_bundle(scenario_letter: str):
    scen = scenario_letter.upper()
    if scen not in ["A", "B", "C"]:
        raise HTTPException(status_code=400, detail="Scenario must be A, B, or C")

    source_reqs = REQUESTS if REQUESTS else BASELINE_REQUESTS
    if scen == "A":
        reqs = OPTIMIZER.build_scenario_a(source_reqs).requests
    elif scen == "B":
        reqs = OPTIMIZER.build_scenario_b(source_reqs).requests
    else:
        reqs = OPTIMIZER.build_scenario_c(source_reqs).requests

    zip_data = EXPORTER.create_zip_archive(scen, reqs)
    return Response(
        content=zip_data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="RailOptix_Scenario_{scen}_Deliverables.zip"',
            "Content-Type": "application/zip",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@app.get("/api/validator-report/{scenario_letter}")
def get_validator_report(scenario_letter: str):
    scen = scenario_letter.upper()
    if scen not in ["A", "B", "C"]:
        raise HTTPException(status_code=400, detail="Scenario must be A, B, or C")

    source_reqs = REQUESTS if REQUESTS else BASELINE_REQUESTS
    if scen == "A":
        reqs = OPTIMIZER.build_scenario_a(source_reqs).requests
    elif scen == "B":
        reqs = OPTIMIZER.build_scenario_b(source_reqs).requests
    else:
        reqs = OPTIMIZER.build_scenario_c(source_reqs).requests

    report = VALIDATOR.validate(scen, reqs)
    return report

@app.get("/api/download/{scenario_letter}/{filename}")
def download_scenario_deliverable(scenario_letter: str, filename: str):
    scen = scenario_letter.upper()
    fname = filename.upper()
    if scen not in ["A", "B", "C"]:
        raise HTTPException(status_code=400, detail="Scenario must be A, B, or C")
    if fname not in ["SCHEDULE_ACCESS.CSV", "SCHEDULE_OCCUPANCY.CSV", "RESULTS.CSV"]:
        raise HTTPException(status_code=404, detail="File must be SCHEDULE_ACCESS.csv, SCHEDULE_OCCUPANCY.csv, or RESULTS.csv")

    source_reqs = REQUESTS if REQUESTS else BASELINE_REQUESTS
    if scen == "A":
        reqs = OPTIMIZER.build_scenario_a(source_reqs).requests
    elif scen == "B":
        reqs = OPTIMIZER.build_scenario_b(source_reqs).requests
    else:
        reqs = OPTIMIZER.build_scenario_c(source_reqs).requests

    if fname == "SCHEDULE_ACCESS.CSV":
        content = EXPORTER.generate_schedule_access_csv(reqs)
    elif fname == "SCHEDULE_OCCUPANCY.CSV":
        content = EXPORTER.generate_schedule_occupancy_csv(reqs)
    else:
        content = EXPORTER.generate_results_csv(scen, reqs)

    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{scen}_{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@app.post("/api/assistant/query")
def query_assistant(payload: Dict[str, Any] = Body(...)):
    prompt = payload.get("prompt", "")
    scen_id = payload.get("scenario_id", ACTIVE_SCENARIO_ID)
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    res = ASSISTANT.query(prompt, REQUESTS, scen_id)
    return res

@app.post("/api/disruption/simulate")
def simulate_disruption(payload: Dict[str, Any] = Body(...)):
    loc = payload.get("location_id", "SEC:ALP:S02_S03:EB")
    start_wk = int(payload.get("start_week", 4))
    end_wk = int(payload.get("end_week", 4))
    new_cap = int(payload.get("new_capacity", 1))
    name = payload.get("disruption_name", "Emergency Rail Fracture")
    inject_work = bool(payload.get("inject_emergency_work", True))

    res = DISRUPTION_ENGINE.simulate_disruption(
        base_requests=REQUESTS,
        location_id=loc,
        start_week=start_wk,
        end_week=end_wk,
        new_capacity=new_cap,
        disruption_name=name,
        inject_emergency_work=inject_work
    )
    return res

@app.post("/api/disruption/apply")
def apply_disruption(payload: Dict[str, Any] = Body(...)):
    global REQUESTS
    sim_res = simulate_disruption(payload)
    REQUESTS = sim_res["replanned_requests"]
    new_conflicts = CONFLICT_ENGINE.detect_conflicts(REQUESTS)
    return {
        "status": "applied",
        "message": f"Applied disruption '{payload.get('disruption_name')}' with minimal churn ({sim_res['churn_metrics']['churn_percentage']}% churned).",
        "churn_metrics": sim_res["churn_metrics"],
        "remaining_conflicts": len(new_conflicts),
        "requests": REQUESTS
    }

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True), name="static_dir")
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

def main():
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    main()
