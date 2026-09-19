"""
RailOptix - Domain Models and Data Structures
"""
from enum import Enum
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class ConflictType(str, Enum):
    SAFETY_BUFFER_BREACH = "SAFETY_BUFFER_BREACH"
    SECTOR_CAPACITY_OVERLOAD = "SECTOR_CAPACITY_OVERLOAD"
    INCOMPATIBLE_POSSESSION = "INCOMPATIBLE_POSSESSION"
    PREDECESSOR_PRECEDENCE = "PREDECESSOR_PRECEDENCE"
    WORKFRONT_LIMIT_EXCEEDED = "WORKFRONT_LIMIT_EXCEEDED"
    WEEKLY_ACCESS_EXCEEDED = "WEEKLY_ACCESS_EXCEEDED"
    ENGINEERING_ROSTER_DEFICIT = "ENGINEERING_ROSTER_DEFICIT"
    EQUIPMENT_CONTENTION = "EQUIPMENT_CONTENTION"

class ConflictSeverity(str, Enum):
    HARD = "HARD"
    SOFT = "SOFT"

class Conflict(BaseModel):
    id: str
    type: ConflictType
    severity: ConflictSeverity = ConflictSeverity.HARD
    rule: str
    week: int
    access_night: Optional[int] = None
    location_id: Optional[str] = None
    line_code: Optional[str] = None
    activity_ids: List[str] = Field(default_factory=list)
    contract_numbers: List[str] = Field(default_factory=list)
    description: str
    suggested_resolution: str

class Engineer(BaseModel):
    id: str
    name: str
    role: str
    certifications: List[str] = Field(default_factory=list)
    max_weekly_shifts: int = 4
    fatigue_score: float = 0.0
    assigned_shifts_count: int = 0
    assigned_tasks: List[Dict[str, Any]] = Field(default_factory=list)

class Equipment(BaseModel):
    id: str
    name: str
    type: str
    status: str = "AVAILABLE"
    assigned_tasks: List[Dict[str, Any]] = Field(default_factory=list)

class Contract(BaseModel):
    contract_number: str
    contract_description: str
    contract_award_date: str
    activity_type: str
    nature_of_activity: str
    contract_priority: int
    contract_completion_date: str
    planned_completion_date: str
    number_of_workfronts: int
    access_type: str
    number_of_maximum_access_per_week: int

class ScheduledAccess(BaseModel):
    seq: int
    week: int
    eclo: int = 0
    access_night: int
    co_share_group: str = "b1"
    assigned_engineers: List[str] = Field(default_factory=list)
    assigned_equipment: List[str] = Field(default_factory=list)

class MaintenanceRequest(BaseModel):
    activity_id: str
    contract_number: str
    activity_type: str
    start_location_id: str
    end_location_id: str
    total_accesses: float
    planned_start_date: str
    predecessor_activity_id: Optional[str] = None
    activity_priority: int = 2
    nature_of_works: Optional[str] = None
    access_type: Optional[str] = None
    contract_priority: Optional[int] = None
    scheduled_accesses: List[ScheduledAccess] = Field(default_factory=list)
    simulated_completion_date: Optional[str] = None
    overrun_days: int = 0

class TimetableMetrics(BaseModel):
    scenario_id: str
    total_conflicts: int = 0
    hard_violations: int = 0
    soft_violations: int = 0
    overrun_days_total: int = 0
    contracts_overrunning: int = 0
    earliness_days_total: int = 0
    excess_access_nights_total: int = 0
    eclo_nights_total: int = 0
    priority_overrun: Dict[str, int] = Field(default_factory=dict)
    priority_weighted_score: float = 0.0
    nights_scheduled: int = 0
    crew_utilization_pct: float = 0.0
    equipment_utilization_pct: float = 0.0

class TimetableScenario(BaseModel):
    scenario_id: str
    name: str
    description: str
    metrics: TimetableMetrics
    requests: List[MaintenanceRequest]
