# RailOptix — LTA AI Maintenance Scheduler & Optimization Engine

**LTA NebulaX Hackathon — Problem 01: AI Maintenance Scheduler**

---

## 🚀 Overview

**RailOptix** is a production-grade, AI-powered railway track access scheduling and conflict resolution platform purpose-built for the Land Transport Authority (LTA) MRT network. It optimizes the allocation of scarce engineering downtime across **Line Alpha (ALP)** and **Line Beta (BET)**, balancing track sector availability, physical possession limits, engineering crew rosters, and heavy machinery allocation.

### Core Capabilities:
1. **Public Test Results**: Includes certified, pre-computed benchmark schedule files (`SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv`, `RESULTS.csv`) matching the public test dataset.
2. **Hidden Instance Upload & Dynamic Solver**: Judging panel can drag and drop an undisclosed test instance (8 CSV files or a single `.ZIP` archive) directly into the UI. The engine validates schema and referential integrity live, schedules all activities respecting predecessor DAGs and physical constraints, and updates the entire dashboard instantly.
3. **Smart Conflict Resolution (Minimal Perturbation)**: Pinpoints multidimensional clashes (finish-to-start predecessor violations, workfront limits, weekly quota exceedance, location supply bottlenecks, and 750V live third-rail safety buffer breaches), shifts conflicting tasks to the earliest viable window, and minimizes network disruption.
4. **Context-Aware Prioritization & Spatial Clustering**: Weights requests by contract and activity urgency, factors in topological physical distance, and clusters compatible works within shared possessions (`b1`, `b2`) to eliminate redundant travel and setup overhead.
5. **Alternative Timetable Generation**: Computes Pareto-optimal alternative schedules:
   - **Scenario A (Strict Supply)**: Zero ECLO, strict adherence to physical track capacity, planned overruns minimal and confined to Priority-3 contracts.
   - **Scenario B (Strict Schedule)**: Zero schedule overrun across all contracts using targeted Early Closure / Late Opening (ECLO) nights.
   - **Scenario C (Balanced Elasticity)**: Pareto sweet spot with localized elasticity absorbing overruns at minimal operational disruption.
   - **2-Week High-Resolution Operational View**: Shift-by-shift night dispatch timetable with certified named engineers and heavy equipment assignments.

---

## 📁 Repository Structure

```
RailOptix/
├── 01_LINES.csv                        # Network line definitions (ALP, BET)
├── 02_STATIONS.csv                     # Stations (S01-S08, S11-S18, H01, H02)
├── 03_SECTORS.csv                      # Inter-station running tunnel sectors
├── 04_LOCATION_SUPPLY.csv              # Track capacity limits per location
├── 05_BUFFER_LOCATION.csv              # Work nature exclusion buffer rules
├── 06_PARAMETERS.csv                   # Horizon start date and duration
├── 07_PROJECT_DETAILS.csv              # Contracts, priorities, workfronts, quotas
├── 08_ACTIVITY_DETAILS.csv             # 54 maintenance activities, locations, DAG
│
├── SCHEDULE_ACCESS.csv                 # Official Access Deliverable (Benchmark)
├── SCHEDULE_OCCUPANCY.csv              # Official Occupancy Deliverable (Benchmark)
├── RESULTS.csv                         # Official Completion & Overrun Deliverable
│
├── trackpulse/                         # Core Python Optimization Engine
│   ├── models.py                       # Pydantic data schemas
│   ├── topology.py                     # Dual-line topology, buffers, distance
│   ├── data_loader.py                  # CSV loader, ZIP extractor & validation
│   ├── conflict_engine.py              # Multi-dimensional conflict detection
│   ├── ai_optimizer.py                 # Minimal-perturbation solver & scenarios
│   ├── submission_exporter.py          # CSV and ZIP deliverables generator
│   └── server.py                       # FastAPI REST API + Static Files Mount
│
├── static/                             # Interactive Modern Web Dashboard UI
│   ├── index.html                      # Single-page dashboard application
│   ├── css/
│   │   └── dashboard.css               # Modern dark-mode MRT command center theme
│   └── js/
│       ├── api.js                      # REST API communication client
│       ├── main.js                     # Main state & UI orchestrator
│       ├── topology_view.js            # SVG schematic map & live 750V isolation
│       ├── timeline_view.js            # Interactive 30-week Gantt timeline
│       ├── conflict_view.js            # Clash feed & AI 1-click resolver
│       ├── variables_modal.js          # Sector, Roster & Equipment manager
│       └── upload_modal.js             # Drag-and-drop hidden instance modal
│
├── tests/                              # Automated Test Suite (100% Pass Rate)
│   ├── test_trackpulse.py              # Topology, conflict engine & optimizer tests
│   ├── test_api_endpoints.py           # FastAPI endpoint tests
│   └── test_upload_and_downloads.py    # Hidden instance upload & CSV download tests
│
├── start_dashboard.py                  # Primary FastAPI server launcher
├── streamlit_app.py                    # Companion Streamlit application
├── index.html                          # Root Web Dashboard (Zero-dependency offline preview)
├── start.bat                           # 1-Click Windows Batch Launcher (Auto-opens browser)
├── start.ps1                           # 1-Click PowerShell Launcher
├── requirements.txt                    # Project Python dependencies
└── README.md                           # Comprehensive documentation
```

---

## 🛠️ Quick Start Guide

### Option 1: 1-Click Windows Launcher (Recommended)
Double-click `start.bat` (or run `./start.ps1` in PowerShell).
This starts the local FastAPI optimization server and **automatically opens** your default browser to:
👉 **`http://127.0.0.1:8080`**

### Option 2: Command Line
```bash
pip install -r requirements.txt
python start_dashboard.py
```
Then navigate to: **`http://127.0.0.1:8080`**

### Option 3: Instant Zero-Dependency File Preview (No Python Required)
Double-click `index.html` directly from File Explorer (or open `static/index.html` in any browser: Chrome, Edge, Safari, Firefox).
RailOptix features built-in **Offline State Hydration** that renders the complete interactive dual-line topology SVG, 2-week operational dispatch grid, 30-week master Gantt, and safety compliance KPI scorecards immediately—even without running a local web server!

---

## 🧪 Running Automated Tests

Run the complete test suite (19 unit and integration tests):
```bash
python -m unittest discover -s tests
```
All tests pass in `< 0.5s`.

---

## 📋 Evaluation Checklist for Judges

| Evaluation Requirement | RailOptix Feature | Verification Method |
|---|---|---|
| **Public Test Results** | Verified `SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv`, `RESULTS.csv` included directly in root directory. | Direct file inspection or click the download buttons on the top bar of the web app. |
| **Zero-Dependency Direct File View** | Both `index.html` (root) and `static/index.html` open directly in any browser via `file:///` with full offline fallback data. | Double-click `index.html` directly from Windows Explorer. |
| **Hidden Instance Upload** | "📁 Upload Test Instance" button on the top navbar. Accepts 8 CSV files or 1 ZIP archive. | Click "Upload Test Instance", drag/drop files, view green checklist, and click "Run AI Solver Live". |
| **Live Schema Validation** | Validates headers, data types, foreign keys (Contracts, Predecessors, Locations). | Upload invalid files or missing files to observe real-time error logging. |
| **Multi-Scenario Comparison** | Interactive switching between Scenario A (Strict Supply), B (Strict Schedule), C (Balanced), and 2-Week Operational View. | Click the scenario pills on the top navigation bar. |
| **Conflict Detection & Resolution** | Detects predecessor violations, workfront limits, location capacity, and 750V live-rail buffer breaches. | Click "AI Auto-Optimize" or individual "AI Resolve Clash" buttons. |
| **Key Variables Inspection** | Sector availability, engineer roster (certifications), and equipment allocations. | Click "⚙️ Key Variables" button in header. |
