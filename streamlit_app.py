"""
RailOptix - Streamlit Companion Dashboard for LTA Rail Maintenance Scheduler
Allows running the scheduler, uploading hidden test instances, viewing timelines, and downloading deliverables.
"""
import io
import os
import zipfile
import pandas as pd
import streamlit as st
from datetime import datetime

from trackpulse.data_loader import (
    load_contracts, load_activities, load_initial_schedule,
    get_default_engineers, get_default_equipment,
    validate_instance_bytes, parse_instance_from_bytes, extract_files_from_zip
)
from trackpulse.conflict_engine import ConflictEngine
from trackpulse.ai_optimizer import AIOptimizer
from trackpulse.submission_exporter import SubmissionExporter

st.set_page_config(
    page_title="RailOptix — LTA Rail Access Scheduler",
    page_icon="🚇",
    layout="wide"
)

st.title("🚇 RailOptix — LTA Rail Access Scheduler & AI Optimizer")
st.caption("AI-driven conflict resolution, multi-scenario optimization, and official challenge deliverables generator")

# Initialize Session State
if "contracts" not in st.session_state:
    st.session_state.contracts = load_contracts()
    st.session_state.requests = load_initial_schedule(load_activities(st.session_state.contracts))
    st.session_state.engineers = get_default_engineers()
    st.session_state.equipment = get_default_equipment()
    st.session_state.engine = ConflictEngine(st.session_state.contracts, st.session_state.engineers, st.session_state.equipment)
    st.session_state.optimizer = AIOptimizer(st.session_state.engine, st.session_state.contracts, st.session_state.engineers, st.session_state.equipment)
    st.session_state.exporter = SubmissionExporter(st.session_state.contracts)
    st.session_state.dataset_name = "Public Test Benchmark (54 Activities, 14 Contracts)"
    st.session_state.is_benchmark = True
    
    # Solve initial Scenario A
    scen_a = st.session_state.optimizer.build_scenario_a(st.session_state.requests)
    st.session_state.requests = scen_a.requests

# Sidebar: Hidden Instance Upload & Controls
with st.sidebar:
    st.header("⚙️ Test Instance Controls")
    st.info(f"Active Instance: **{st.session_state.dataset_name}**")
    
    if not st.session_state.is_benchmark:
        if st.button("↺ Reset to Public Benchmark", use_container_width=True):
            st.session_state.contracts = load_contracts()
            st.session_state.requests = load_initial_schedule(load_activities(st.session_state.contracts))
            st.session_state.engine = ConflictEngine(st.session_state.contracts, st.session_state.engineers, st.session_state.equipment)
            st.session_state.optimizer = AIOptimizer(st.session_state.engine, st.session_state.contracts, st.session_state.engineers, st.session_state.equipment)
            st.session_state.exporter = SubmissionExporter(st.session_state.contracts)
            st.session_state.dataset_name = "Public Test Benchmark (54 Activities, 14 Contracts)"
            st.session_state.is_benchmark = True
            scen_a = st.session_state.optimizer.build_scenario_a(st.session_state.requests)
            st.session_state.requests = scen_a.requests
            st.rerun()

    st.subheader("📁 Upload Hidden Instance")
    uploaded_files = st.file_uploader(
        "Upload 8 CSV files or 1 .ZIP file",
        type=["csv", "zip"],
        accept_multiple_files=True
    )

    if uploaded_files and st.button("🚀 Run Live AI Solver", type="primary", use_container_width=True):
        files_dict = {}
        for uf in uploaded_files:
            data = uf.read()
            if uf.name.lower().endswith(".zip"):
                files_dict.update(extract_files_from_zip(data))
            else:
                files_dict[uf.name] = data
        
        is_valid, errors = validate_instance_bytes(files_dict)
        if not is_valid:
            st.error("Validation Failed:\n" + "\n".join(errors))
        else:
            new_contracts, new_requests, params, capacities, meta = parse_instance_from_bytes(files_dict)
            st.session_state.contracts = new_contracts
            st.session_state.requests = new_requests
            h_start = params.get("horizon_start", "2027-01-04")
            h_weeks = int(params.get("horizon_weeks", 30))
            st.session_state.engine = ConflictEngine(new_contracts, st.session_state.engineers, st.session_state.equipment)
            st.session_state.optimizer = AIOptimizer(st.session_state.engine, new_contracts, st.session_state.engineers, st.session_state.equipment, horizon_start_str=h_start, horizon_weeks=h_weeks)
            st.session_state.exporter = SubmissionExporter(new_contracts)
            st.session_state.dataset_name = f"Custom Test Instance ({meta['num_activities']} Acts, {meta['num_contracts']} Contracts)"
            st.session_state.is_benchmark = False
            
            scen_a = st.session_state.optimizer.build_scenario_a(st.session_state.requests)
            st.session_state.requests = scen_a.requests
            st.success(f"Instance successfully solved! {meta['num_activities']} activities scheduled.")
            st.rerun()

    st.divider()
    st.subheader("📥 Export Deliverables")
    scenario_choice = st.selectbox("Scenario", ["A", "B", "C"])
    zip_bytes = st.session_state.exporter.create_zip_archive(scenario_choice, st.session_state.requests)
    st.download_button(
        label=f"Download Scenario {scenario_choice} Bundle (.ZIP)",
        data=zip_bytes,
        file_name=f"RailOptix_Scenario_{scenario_choice}_Deliverables.zip",
        mime="application/zip",
        use_container_width=True
    )

# Main Dashboard View
scenarios = [
    st.session_state.optimizer.build_scenario_a(st.session_state.requests),
    st.session_state.optimizer.build_scenario_b(st.session_state.requests),
    st.session_state.optimizer.build_scenario_c(st.session_state.requests)
]

scenario_tab, schedule_tab, clash_tab = st.tabs(["📊 Scenario Metrics", "📅 Scheduled Timeline", "⚠️ Conflict Engine"])

with scenario_tab:
    scen_cols = st.columns(3)
    for idx, scen in enumerate(scenarios):
        with scen_cols[idx]:
            st.subheader(scen.name)
            st.write(scen.description)
            m = scen.metrics
            c1, c2 = st.columns(2)
            c1.metric("Overrun Delay", f"{m.overrun_days_total} days")
            c2.metric("Penalty Score", f"{m.priority_weighted_score}")
            c3, c4 = st.columns(2)
            c3.metric("ECLO Nights", f"{m.eclo_nights_total}")
            c4.metric("Crew Util.", f"{m.crew_utilization_pct}%")

with schedule_tab:
    st.subheader("Scheduled Track Accesses")
    rows = []
    for r in st.session_state.requests:
        for acc in r.scheduled_accesses:
            rows.append({
                "Activity ID": r.activity_id,
                "Contract": r.contract_number,
                "Week": acc.week,
                "Night": acc.access_night,
                "ECLO": "Yes" if acc.eclo else "No",
                "Nature of Works": r.nature_of_works,
                "Start Loc": r.start_location_id,
                "End Loc": r.end_location_id
            })
    df_sched = pd.DataFrame(rows)
    st.dataframe(df_sched, use_container_width=True, height=400)

with clash_tab:
    conflicts = st.session_state.engine.detect_conflicts(st.session_state.requests)
    st.subheader(f"Active Track Conflicts ({len(conflicts)})")
    if not conflicts:
        st.success("✅ Zero active track conflicts detected! All physical supply limits and safety exclusion buffers respected.")
    else:
        for c in conflicts:
            st.warning(f"**[{c.type.value}]** Week {c.week} - {c.description}")
