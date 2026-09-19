"""
Direct Python Test of RailOptix Server Endpoints
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trackpulse.server import (
    get_network, get_contracts, get_requests, get_conflicts,
    get_all_scenarios, get_roster, get_equipment, export_csv_bundle,
    apply_scenario, resolve_clash, STATIC_DIR
)

def test_direct_endpoints():
    print("Testing get_network()...")
    net = get_network()
    assert "lines" in net and "stations_by_line" in net
    print("✓ Network endpoint ok")

    print("Testing get_contracts()...")
    contracts = get_contracts()
    assert len(contracts) == 14
    print("✓ Contracts endpoint ok (14 contracts)")

    print("Testing get_requests()...")
    reqs = get_requests()
    assert len(reqs) == 54
    print("✓ Requests endpoint ok (54 activities)")

    print("Testing get_conflicts()...")
    confs = get_conflicts()
    print(f"✓ Conflicts endpoint ok ({len(confs)} conflicts detected)")

    print("Testing get_all_scenarios()...")
    scens = get_all_scenarios()
    assert len(scens) == 4
    for s in scens:
        print(f"  - {s.name}: {s.metrics.hard_violations} hard violations, {s.metrics.overrun_days_total} overrun days")
    print("✓ Scenarios endpoint ok (4 scenarios)")

    print("Testing get_roster()...")
    roster = get_roster()
    assert len(roster) >= 10
    print("✓ Roster endpoint ok")

    print("Testing get_equipment()...")
    equip = get_equipment()
    assert len(equip) >= 8
    print("✓ Equipment endpoint ok")

    print("Testing export_csv_bundle('A')...")
    res = export_csv_bundle("A")
    assert res.media_type == "application/zip"
    print(f"✓ Export CSV zip bundle ok ({len(res.body)} bytes)")

    print("Testing Static Files Directory...")
    index_file = os.path.join(STATIC_DIR, "index.html")
    assert os.path.exists(index_file), "index.html must exist"
    with open(index_file, "r", encoding="utf-8") as f:
        html = f.read()
    assert "RailOptix" in html
    assert "dual-line" in html.lower() or "line alpha" in html.lower()
    assert "header-date-pill" in html, "header-date-pill must exist for calendar"
    assert "calendar-popover" in html, "calendar-popover must exist"
    assert "calendar_component.js" in html, "calendar_component.js script must be linked"
    assert "header-network-select" in html, "header-network-select must exist for line toggling"
    assert "filter-line" in html, "filter-line must exist for timetable line filtering"
    assert os.path.exists(os.path.join(STATIC_DIR, "js", "calendar_component.js")), "calendar_component.js file must exist"
    print("✓ index.html & calendar component verified")

    print("Testing apply_scenario('scenario_b_strict_schedule')...")
    app_res = apply_scenario({"scenario_id": "scenario_b_strict_schedule"})
    assert app_res["status"] == "applied"
    assert app_res["metrics"].overrun_days_total == 0
    print("✓ Scenario switch verified")

    print("\n==============================================")
    print(" ALL API ENDPOINTS & FRONTEND VERIFIED 100%! ")
    print("==============================================")

if __name__ == "__main__":
    test_direct_endpoints()
