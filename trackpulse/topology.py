"""
RailOptix - Dual-Line Rail Network Topology Engine
Models Line Alpha (ALP), Line Beta (BET), Interchange Hubs H01 & H02,
Possession Expansion, Safety Exclusion Buffers (Tunnel Sectors), and Topological Distances.
"""
from typing import List, Tuple, Dict, Set, Optional

MRT_LINES = {
    "ALP": "Line Alpha",
    "BET": "Line Beta"
}

ALP_STATIONS = ["S01", "S02", "S03", "S04", "H01", "H02", "S05", "S06", "S07", "S08"]
BET_STATIONS = ["S11", "S12", "S13", "S14", "H01", "H02", "S15", "S16", "S17", "S18"]

STATIONS_BY_LINE = {
    "ALP": ALP_STATIONS,
    "BET": BET_STATIONS
}

INTERCHANGE_HUBS = {"H01", "H02"}

LOCATION_SUPPLY_CAPACITY: Dict[str, int] = {
    "SEC:ALP:S01_S02:EB": 4, "SEC:ALP:S01_S02:WB": 4,
    "SEC:ALP:S02_S03:EB": 4, "SEC:ALP:S02_S03:WB": 4,
    "SEC:ALP:S03_S04:EB": 4, "SEC:ALP:S03_S04:WB": 4,
    "SEC:ALP:S04_H01:EB": 2, "SEC:ALP:S04_H01:WB": 2,
    "SEC:ALP:H01_H02:EB": 1, "SEC:ALP:H01_H02:WB": 1,
    "SEC:ALP:H02_S05:EB": 2, "SEC:ALP:H02_S05:WB": 2,
    "SEC:ALP:S05_S06:EB": 4, "SEC:ALP:S05_S06:WB": 4,
    "SEC:ALP:S06_S07:EB": 4, "SEC:ALP:S06_S07:WB": 4,
    "SEC:ALP:S07_S08:EB": 4, "SEC:ALP:S07_S08:WB": 4,
    "SEC:BET:S11_S12:EB": 4, "SEC:BET:S11_S12:WB": 4,
    "SEC:BET:S12_S13:EB": 4, "SEC:BET:S12_S13:WB": 4,
    "SEC:BET:S13_S14:EB": 4, "SEC:BET:S13_S14:WB": 4,
    "SEC:BET:S14_H01:EB": 2, "SEC:BET:S14_H01:WB": 2,
    "SEC:BET:H01_H02:EB": 1, "SEC:BET:H01_H02:WB": 1,
    "SEC:BET:H02_S15:EB": 2, "SEC:BET:H02_S15:WB": 2,
    "SEC:BET:S15_S16:EB": 4, "SEC:BET:S15_S16:WB": 4,
    "SEC:BET:S16_S17:EB": 4, "SEC:BET:S16_S17:WB": 4,
    "SEC:BET:S17_S18:EB": 4, "SEC:BET:S17_S18:WB": 4,
}

for line, stns in STATIONS_BY_LINE.items():
    for stn in stns:
        for bound in ["EB", "WB"]:
            plat_id = f"PLAT:{line}:{stn}:{bound}"
            LOCATION_SUPPLY_CAPACITY[plat_id] = 2


def parse_sector_id(sector_id: str) -> Tuple[str, str, str, str]:
    parts = sector_id.split(":")
    line = parts[1]
    stn_parts = parts[2].split("_")
    s_from = stn_parts[0]
    s_to = stn_parts[1]
    bound = parts[3] if len(parts) > 3 else "EB"
    return line, s_from, s_to, bound


def get_sector_index(line: str, s_from: str, s_to: str) -> int:
    stns = STATIONS_BY_LINE[line]
    i1 = stns.index(s_from)
    i2 = stns.index(s_to)
    return min(i1, i2)


def expand_activity_occupancy_locations(start_loc: str, end_loc: str) -> List[str]:
    line1, s1_from, s1_to, bound1 = parse_sector_id(start_loc)
    line2, s2_from, s2_to, bound2 = parse_sector_id(end_loc)
    line = line1
    bound = bound1

    stns = STATIONS_BY_LINE[line]
    idx1_a = stns.index(s1_from)
    idx1_b = stns.index(s1_to)
    idx2_a = stns.index(s2_from)
    idx2_b = stns.index(s2_to)

    min_stn_idx = min(idx1_a, idx1_b, idx2_a, idx2_b)
    max_stn_idx = max(idx1_a, idx1_b, idx2_a, idx2_b)

    occupied: List[str] = []

    # Platform sectors
    for i in range(min_stn_idx, max_stn_idx + 1):
        occupied.append(f"PLAT:{line}:{stns[i]}:{bound}")

    # Tunnel sectors
    for i in range(min_stn_idx, max_stn_idx):
        occupied.append(f"SEC:{line}:{stns[i]}_{stns[i+1]}:{bound}")

    return sorted(list(set(occupied)))


def calculate_safety_exclusion_buffers(
    line: str,
    bound: str,
    start_loc: str,
    end_loc: str,
    nature: str
) -> List[str]:
    """
    Calculate required exclusion zones based on nature of works (05_BUFFER_LOCATION.csv):
    - Live: 2 tunnel buffer sectors upstream & downstream + opposite bound mirroring + H01/H02 interchange line crossover
    - Non-live (Consist): 1 tunnel buffer sector upstream & downstream on same bound
    - Non-live (Others): 0 buffer sectors
    """
    if nature == "Non-live (Others)":
        return []

    buffer_sectors_count = 2 if nature == "Live" else 1
    mirror_opposite = (nature == "Live")

    stns = STATIONS_BY_LINE[line]
    _, s1_from, s1_to, _ = parse_sector_id(start_loc)
    _, s2_from, s2_to, _ = parse_sector_id(end_loc)

    min_sec_idx = min(get_sector_index(line, s1_from, s1_to), get_sector_index(line, s2_from, s2_to))
    max_sec_idx = max(get_sector_index(line, s1_from, s1_to), get_sector_index(line, s2_from, s2_to))

    buf_min_idx = max(0, min_sec_idx - buffer_sectors_count)
    buf_max_idx = min(len(stns) - 2, max_sec_idx + buffer_sectors_count)

    buffer_locs: Set[str] = set()
    bounds = [bound, "WB" if bound == "EB" else "EB"] if mirror_opposite else [bound]

    for b in bounds:
        # Upstream tunnel buffer
        for i in range(buf_min_idx, min_sec_idx):
            buffer_locs.add(f"SEC:{line}:{stns[i]}_{stns[i+1]}:{b}")

        # Downstream tunnel buffer
        for i in range(max_sec_idx + 1, buf_max_idx + 1):
            buffer_locs.add(f"SEC:{line}:{stns[i]}_{stns[i+1]}:{b}")

    # For Live rail work: mirrors work zone itself on opposite bound
    if mirror_opposite:
        opp_b = "WB" if bound == "EB" else "EB"
        for i in range(min_sec_idx, max_sec_idx + 1):
            buffer_locs.add(f"SEC:{line}:{stns[i]}_{stns[i+1]}:{opp_b}")

        # Interchange coupling check: if work or buffer reaches H01 or H02
        h01_idx, h02_idx = 4, 5
        touches_h = (buf_min_idx <= h01_idx <= buf_max_idx + 1) or (buf_min_idx <= h02_idx <= buf_max_idx + 1)
        if touches_h:
            other_line = "BET" if line == "ALP" else "ALP"
            for ob in ["EB", "WB"]:
                buffer_locs.add(f"SEC:{other_line}:H01_H02:{ob}")

    return sorted(list(buffer_locs))


def calculate_topological_distance(loc1: str, loc2: str) -> int:
    try:
        parts1 = loc1.split(":")
        parts2 = loc2.split(":")
        line1, line2 = parts1[1], parts2[1]

        def extract_station_indices(parts, line):
            stns = STATIONS_BY_LINE[line]
            if parts[0] == "SEC":
                s_from, s_to = parts[2].split("_")
                return (stns.index(s_from) + stns.index(s_to)) / 2.0
            else:
                return float(stns.index(parts[2]))

        idx1 = extract_station_indices(parts1, line1)
        idx2 = extract_station_indices(parts2, line2)

        if line1 == line2:
            return int(abs(idx1 - idx2))
        else:
            dist_via_h01 = abs(idx1 - 4.5) + abs(idx2 - 4.5) + 1
            return int(dist_via_h01)
    except Exception:
        return 5
