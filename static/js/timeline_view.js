/**
 * RailOptix Timeline View
 * Supports Dual View Modes:
 * 1. 2-Week High-Resolution Operational Grid (Nights 1 to 14 with Crew & Equipment tags)
 * 2. 30-Week Strategic Horizon Master Gantt with Interactive Clickable Bars (Red, Orange, Blue)
 * Plus Interactive Legend for Engineering Hours Timetable Filtering
 */
class TimelineView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.viewMode = '2week'; // '2week' or '30week'
    this.requests = [];
    this.contracts = [];
    this.conflicts = [];
    this.filterLine = 'ALL';
    this.filterPriority = 'ALL';
    this.searchTerm = '';
    this.activeStartWeek = 1; // Starting week for 2-Week Operational Grid (W1 to W29)
    this.selectedActivityId = null;
    this.onTaskClick = null;
    this.onPriorityFilterChange = null;
  }

  setData({ requests, contracts, conflicts }) {
    this.requests = requests || [];
    this.contracts = contracts || [];
    this.conflicts = conflicts || [];
    this.render();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.render();
  }

  setActiveStartWeek(startWeek) {
    this.activeStartWeek = Math.max(1, Math.min(29, parseInt(startWeek) || 1));
    this.render();
  }

  setFilters({ line, priority, search }) {
    if (line !== undefined) this.filterLine = line;
    if (priority !== undefined) this.filterPriority = priority;
    if (search !== undefined) this.searchTerm = search.toLowerCase();
    this.render();
  }

  render() {
    if (!this.container) return;

    // Filter requests
    const filtered = this.requests.filter(r => {
      const matchLine = this.filterLine === 'ALL' || 
        (r.start_location_id && r.start_location_id.includes(this.filterLine)) ||
        (r.end_location_id && r.end_location_id.includes(this.filterLine));
      const matchPriority = this.filterPriority === 'ALL' || String(r.contract_priority) === String(this.filterPriority);
      const matchSearch = !this.searchTerm || 
        r.activity_id.toLowerCase().includes(this.searchTerm) || 
        r.contract_number.toLowerCase().includes(this.searchTerm);
      return matchLine && matchPriority && matchSearch;
    });

    if (this.viewMode === '2week') {
      this.renderOperationalGrid(filtered);
    } else {
      this.renderStrategicGantt(filtered);
    }

    this.renderLegendBar();
    this.attachEvents();
  }

  renderOperationalGrid(filteredRequests) {
    let html = `
      <div class="operational-grid">
        <div class="grid-header-cell" style="text-align: left; padding-left: 14px;">CONTRACT / ACTIVITY</div>
    `;

    const startWk = this.activeStartWeek || 1;

    // 14 night columns based on activeStartWeek
    for (let day = 1; day <= 14; day++) {
      const wk = Math.floor((day - 1) / 7) + startWk;
      const night = ((day - 1) % 7) + 1;
      const isPeakCol = (wk >= 12 && wk <= 14);
      html += `
        <div class="grid-header-cell ${isPeakCol ? 'highlight-col' : ''}">
          <div style="font-weight: 700;">D${day}</div>
          <div style="font-size: 9px; opacity: 0.75; font-weight: 500;">W${wk} N${night}</div>
        </div>
      `;
    }

    // Group requests by contract
    const grouped = {};
    filteredRequests.forEach(r => {
      grouped[r.contract_number] = grouped[r.contract_number] || [];
      grouped[r.contract_number].push(r);
    });

    Object.keys(grouped).sort().forEach(cNum => {
      const reqs = grouped[cNum];
      reqs.forEach(r => {
        const priorityClass = `p${r.contract_priority || 3}`;
        const isSelected = this.selectedActivityId === r.activity_id;
        html += `
          <div class="grid-row-header ${isSelected ? 'selected' : ''}" data-activity="${r.activity_id}">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; color: #0f172a; font-size: 12px;">${r.activity_id}</span>
              <span style="background: #e2e8f0; color: #334155; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">${cNum}</span>
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${r.nature_of_works || ''}</div>
          </div>
        `;

        for (let day = 1; day <= 14; day++) {
          const wk = Math.floor((day - 1) / 7) + startWk;
          const night = ((day - 1) % 7) + 1;
          const isPeakCol = (wk >= 12 && wk <= 14);

          // Find accesses in this day/night
          const accs = r.scheduled_accesses.filter(a => a.week === wk && a.access_night === night);
          const hasClash = this.conflicts.some(c => c.week === wk && c.access_night === night && c.activity_ids.includes(r.activity_id));

          html += `<div class="grid-cell ${isPeakCol ? 'highlight-col' : ''}" data-activity="${r.activity_id}" data-day="${day}">`;
          accs.forEach(acc => {
            const clashClass = hasClash ? 'clash' : '';
            const crewTag = acc.assigned_engineers && acc.assigned_engineers.length > 0 
              ? `<div style="font-size: 9px; color: #7c3aed; font-weight: 600;">👤 ${acc.assigned_engineers[0]}</div>` 
              : '';
            const equipTag = acc.assigned_equipment && acc.assigned_equipment.length > 0 
              ? `<div style="font-size: 9px; color: #0284c7; font-weight: 600;">⚙️ ${acc.assigned_equipment[0]}</div>` 
              : '';

            html += `
              <div class="task-chip ${priorityClass} ${clashClass}" 
                   data-activity="${r.activity_id}"
                   data-priority="${r.contract_priority}"
                   title="${r.activity_id} (${cNum}) - Slot: ${acc.co_share_group} ${acc.eclo ? '(ECLO Early Closure)' : ''}\nClick to view full activity details">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span>Slot ${acc.co_share_group}</span>
                  ${acc.eclo ? '<span style="font-size: 8px; font-weight: 800; color: #b45309;">⚡ECLO</span>' : ''}
                </div>
                ${crewTag}
                ${equipTag}
              </div>
            `;
          });
          html += `</div>`;
        }
      });
    });

    html += `</div>`;
    this.container.innerHTML = html;
  }

  renderStrategicGantt(filteredRequests) {
    let html = `
      <div style="overflow-x: auto;">
        <table class="gantt-table">
          <thead>
            <tr class="gantt-header-row">
              <th class="gantt-header-cell label-col">ACTIVITY / CONTRACT</th>
    `;

    for (let w = 1; w <= 30; w++) {
      // Highlight W12-W14 as high-intensity renewal window
      const isPeakWeek = (w >= 12 && w <= 14);
      const isSelectedWeek = (this.activeStartWeek && (w === this.activeStartWeek || w === this.activeStartWeek + 1));
      html += `<th class="gantt-header-cell ${isPeakWeek ? 'highlight-col' : ''} ${isSelectedWeek ? 'selected-week-col' : ''}">W${w}</th>`;
    }

    html += `</tr></thead><tbody>`;

    filteredRequests.forEach(r => {
      const activeWeeks = new Set(r.scheduled_accesses.map(a => a.week));
      const hasClash = this.conflicts.some(c => c.activity_ids.includes(r.activity_id));
      const isOverrunning = r.overrun_days > 0;
      const isSelected = this.selectedActivityId === r.activity_id;

      // Color mapping for Blue, Red, Orange
      let colorClass = 'color-blue';
      let priorityName = 'Priority 3 (Flexible)';
      if (r.contract_priority === 1) {
        colorClass = 'color-red';
        priorityName = 'Priority 1 (Urgent)';
      } else if (r.contract_priority === 2) {
        colorClass = 'color-orange';
        priorityName = 'Priority 2 (Standard)';
      }

      html += `
        <tr class="gantt-row ${isSelected ? 'selected' : ''}" data-activity="${r.activity_id}" data-priority="${r.contract_priority}">
          <td class="gantt-label-cell" data-activity="${r.activity_id}" style="cursor: pointer;" title="Click to inspect ${r.activity_id}">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; color: #0f172a; font-size: 12px;">${r.activity_id}</span>
              <span style="background: #e2e8f0; color: #334155; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">${r.contract_number}</span>
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
              ${r.nature_of_works} • <span style="font-weight: 600;">${priorityName}</span>
            </div>
          </td>
      `;

      for (let w = 1; w <= 30; w++) {
        const isActive = activeWeeks.has(w);
        const cellClash = this.conflicts.some(c => c.week === w && c.activity_ids.includes(r.activity_id));
        const isPeakWeek = (w >= 12 && w <= 14);
        const isSelectedWeek = (this.activeStartWeek && (w === this.activeStartWeek || w === this.activeStartWeek + 1));

        let cellContent = '';
        if (isActive) {
          const finalColorClass = (isOverrunning && w >= 27) ? 'color-red' : colorClass;
          const tooltip = `${r.activity_id} (${r.contract_number})\nWeek ${w} • ${priorityName}\nNature: ${r.nature_of_works}\nTotal accesses: ${r.total_accesses}${cellClash ? '\n⚠️ WARNING: Sector buffer conflict detected' : ''}\n👉 Click to open task inspection drawer`;

          cellContent = `
            <div class="gantt-bar-segment ${finalColorClass} ${cellClash ? 'color-clash' : ''}" 
                 data-activity="${r.activity_id}" 
                 data-week="${w}"
                 data-priority="${r.contract_priority}"
                 title="${tooltip}">
            </div>
          `;
        }

        html += `
          <td class="gantt-bar-cell ${isPeakWeek ? 'highlight-col' : ''} ${isSelectedWeek ? 'selected-week-cell' : ''}" 
              data-activity="${r.activity_id}" 
              data-week="${w}">
            ${cellContent}
          </td>
        `;
      }

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    this.container.innerHTML = html;
  }

  renderLegendBar() {
    // Render the legend directly into the timetable legend container if present
    const legendContainer = document.getElementById('timetable-legend-container');
    if (!legendContainer) return;

    // Calculate priority breakdown counts based on filtered line
    const lineRequests = this.requests.filter(r => 
      this.filterLine === 'ALL' || 
      (r.start_location_id && r.start_location_id.includes(this.filterLine)) ||
      (r.end_location_id && r.end_location_id.includes(this.filterLine))
    );
    const p1Count = lineRequests.filter(r => r.contract_priority === 1).length;
    const p2Count = lineRequests.filter(r => r.contract_priority === 2).length;
    const p3Count = lineRequests.filter(r => r.contract_priority === 3).length;
    const allCount = lineRequests.length;

    legendContainer.innerHTML = `
      <div class="footer-legend">
        <span style="font-size: 12px; font-weight: 700; color: #475569; margin-right: 4px;">Timetable Legend:</span>
        <div class="legend-pill all ${this.filterPriority === 'ALL' ? 'active' : ''}" data-filter-priority="ALL" title="Show all activities">
          <span class="legend-dot" style="background: #64748b;"></span>
          <span>All (${allCount})</span>
        </div>
        <div class="legend-pill high ${this.filterPriority === '1' ? 'active' : ''}" data-filter-priority="1" title="Click to filter by Priority 1 Red bars">
          <span class="legend-dot red"></span>
          <span>🔴 Priority 1 - Urgent (${p1Count})</span>
        </div>
        <div class="legend-pill medium ${this.filterPriority === '2' ? 'active' : ''}" data-filter-priority="2" title="Click to filter by Priority 2 Orange bars">
          <span class="legend-dot yellow"></span>
          <span>🟠 Priority 2 - Standard (${p2Count})</span>
        </div>
        <div class="legend-pill blue ${this.filterPriority === '3' ? 'active' : ''}" data-filter-priority="3" title="Click to filter by Priority 3 Blue bars">
          <span class="legend-dot blue"></span>
          <span>🔵 Priority 3 - Flexible (${p3Count})</span>
        </div>
        <div class="legend-pill low" style="cursor: default;" title="Early Closure Operation window gives 1.5x productivity">
          <span style="font-size: 11px;">⚡ ECLO Window</span>
        </div>
        <div class="legend-pill" style="background: #fee2e2; color: #dc2626; border: 1px dashed #ef4444; cursor: default;" title="Pulsing red outline indicates 750V buffer or consist clash">
          <span style="font-size: 11px;">⚠️ Conflict / Clash</span>
        </div>
      </div>
    `;

    // Attach click events to legend pills for instant filtering
    legendContainer.querySelectorAll('[data-filter-priority]').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const priority = pill.getAttribute('data-filter-priority');
        this.filterPriority = priority;
        if (this.onPriorityFilterChange) {
          this.onPriorityFilterChange(priority);
        }
        this.render();
      });
    });
  }

  attachEvents() {
    // Attach click listeners to all clickable bars, chips, and table cells
    this.container.querySelectorAll('.gantt-bar-segment, .task-chip, .gantt-row, .grid-row-header, .gantt-label-cell').forEach(el => {
      el.addEventListener('click', (e) => {
        const actId = el.getAttribute('data-activity') || (el.closest('[data-activity]') ? el.closest('[data-activity]').getAttribute('data-activity') : null);
        if (actId) {
          this.selectedActivityId = actId;
          
          // Visual selection feedback on all rows
          this.container.querySelectorAll('.gantt-row, .grid-row-header').forEach(r => {
            if (r.getAttribute('data-activity') === actId) {
              r.classList.add('selected');
            } else {
              r.classList.remove('selected');
            }
          });

          if (this.onTaskClick) {
            this.onTaskClick(actId);
          }
        }
      });
    });
  }
}
