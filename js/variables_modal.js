/**
 * RailOptix Modals & Key Variables Manager
 * Manages:
 * 1. Key Variables Drawer (Sector Supply, Engineer Roster, Equipment Allocation)
 * 2. New Maintenance Request Form (with real-time pre-flight check)
 * 3. Alternative Timetables Comparator Modal
 * 4. Task Inspection & Reschedule Modal
 */
class VariablesModalManager {
  constructor(state) {
    this.state = state;
    window.variablesManager = this;
    this.initModals();
  }

  initModals() {
    // Backdrop click to close
    document.querySelectorAll('.modal-backdrop').forEach(b => {
      b.addEventListener('click', (e) => {
        if (e.target === b) {
          b.classList.remove('open');
        }
      });
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal-backdrop');
        if (modal) modal.classList.remove('open');
      });
    });
  }

  openKeyVariablesModal(activeTab = 'roster') {
    const modal = document.getElementById('modal-variables');
    if (!modal) return;

    this.renderVariablesTabs(activeTab);
    modal.classList.add('open');
  }

  renderVariablesTabs(activeTab) {
    const body = document.getElementById('variables-modal-body');
    if (!body) return;

    const tabsHeader = `
      <div class="modal-tabs">
        <button class="tab-btn ${activeTab === 'roster' ? 'active' : ''}" onclick="window.app.variablesManager.renderVariablesTabs('roster')">
          👥 Engineering Roster (${this.state.roster ? this.state.roster.length : 0})
        </button>
        <button class="tab-btn ${activeTab === 'equipment' ? 'active' : ''}" onclick="window.app.variablesManager.renderVariablesTabs('equipment')">
          ⚙️ Heavy Equipment (${this.state.equipment ? this.state.equipment.length : 0})
        </button>
        <button class="tab-btn ${activeTab === 'supply' ? 'active' : ''}" onclick="window.app.variablesManager.renderVariablesTabs('supply')">
          🛤️ Sector Availability & Supply
        </button>
      </div>
    `;

    let content = '';

    if (activeTab === 'roster') {
      content = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); text-align: left; color: var(--text-secondary);">
              <th style="padding: 8px;">ID</th>
              <th style="padding: 8px;">ENGINEER</th>
              <th style="padding: 8px;">ROLE</th>
              <th style="padding: 8px;">CERTIFICATIONS</th>
              <th style="padding: 8px;">MAX SHIFTS</th>
              <th style="padding: 8px;">STATUS</th>
            </tr>
          </thead>
          <tbody>
      `;
      (this.state.roster || []).forEach(eng => {
        const certBadges = eng.certifications.map(c => 
          `<span style="background: rgba(139,92,246,0.15); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px;">${c}</span>`
        ).join('');

        content += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 8px; font-family: var(--font-mono); font-weight: 700; color: #a78bfa;">${eng.id}</td>
            <td style="padding: 10px 8px; font-weight: 600;">${eng.name}</td>
            <td style="padding: 10px 8px; color: var(--text-secondary);">${eng.role}</td>
            <td style="padding: 10px 8px;">${certBadges}</td>
            <td style="padding: 10px 8px;">${eng.max_weekly_shifts} / wk</td>
            <td style="padding: 10px 8px;"><span style="color: var(--success-green);">● Active</span></td>
          </tr>
        `;
      });
      content += `</tbody></table>`;
    } else if (activeTab === 'equipment') {
      content = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); text-align: left; color: var(--text-secondary);">
              <th style="padding: 8px;">EQUIPMENT ID</th>
              <th style="padding: 8px;">ASSET NAME</th>
              <th style="padding: 8px;">CATEGORY</th>
              <th style="padding: 8px;">OPERATIONAL STATUS</th>
            </tr>
          </thead>
          <tbody>
      `;
      (this.state.equipment || []).forEach(eq => {
        content += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 8px; font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">${eq.id}</td>
            <td style="padding: 10px 8px; font-weight: 600;">${eq.name}</td>
            <td style="padding: 10px 8px;"><span class="brand-badge" style="font-size: 10px;">${eq.type}</span></td>
            <td style="padding: 10px 8px;"><span style="color: var(--success-green);">● ${eq.status}</span></td>
          </tr>
        `;
      });
      content += `</tbody></table>`;
    } else if (activeTab === 'supply') {
      content = `
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
          Track capacity caps per 3.5h engineering hours night across dual-line network (04_LOCATION_SUPPLY.csv).
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-height: 480px; overflow-y: auto;">
      `;
      const supply = (this.state.network && this.state.network.location_supply) || {};
      Object.keys(supply).sort().forEach(locId => {
        const cap = supply[locId];
        content += `
          <div style="background: var(--bg-card); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 600;">${locId}</span>
            <span style="font-family: var(--font-mono); font-weight: 700; color: var(--border-focus);">${cap} cap</span>
          </div>
        `;
      });
      content += `</div>`;
    }

    body.innerHTML = tabsHeader + content;
  }

  openNewRequestModal() {
    const modal = document.getElementById('modal-new-request');
    if (!modal) return;
    modal.classList.add('open');
  }

  openComparisonModal(scenarios = []) {
    const modal = document.getElementById('modal-comparison');
    if (!modal) return;

    const grid = document.getElementById('comparison-grid');
    if (!grid) return;

    let html = '';
    scenarios.forEach(scen => {
      const m = scen.metrics;
      const isA = scen.scenario_id.includes('scenario_a');
      const isB = scen.scenario_id.includes('scenario_b');
      const isC = scen.scenario_id.includes('scenario_c');
      const is2Wk = scen.scenario_id.includes('two_week');

      html += `
        <div class="scenario-card ${isA ? 'highlight' : ''}">
          <div class="scen-card-title">${scen.name}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">${scen.description}</div>

          <div class="scen-metric-row">
            <span>Hard Violations</span>
            <span class="scen-metric-val" style="color: ${m.hard_violations === 0 ? 'var(--success-green)' : 'var(--clash-red)'};">
              ${m.hard_violations}
            </span>
          </div>

          <div class="scen-metric-row">
            <span>Overrun Days</span>
            <span class="scen-metric-val">${m.overrun_days_total} days</span>
          </div>

          <div class="scen-metric-row">
            <span>Weighted Penalty</span>
            <span class="scen-metric-val">${m.priority_weighted_score}</span>
          </div>

          <div class="scen-metric-row">
            <span>ECLO Nights</span>
            <span class="scen-metric-val">${m.eclo_nights_total}</span>
          </div>

          <div class="scen-metric-row">
            <span>Excess Access-Nights</span>
            <span class="scen-metric-val">${m.excess_access_nights_total}</span>
          </div>

          <div class="scen-metric-row">
            <span>Crew Utilization</span>
            <span class="scen-metric-val">${m.crew_utilization_pct}%</span>
          </div>

          <button class="btn btn-primary" style="margin-top: 12px; width: 100%; justify-content: center;"
            onclick="window.app.applyScenario('${scen.scenario_id}'); document.getElementById('modal-comparison').classList.remove('open');">
            Adopt Timetable
          </button>
        </div>
      `;
    });

    grid.innerHTML = html;
    modal.classList.add('open');
  }

  openTaskDetailModal(activityId) {
    const req = this.state.requests.find(r => r.activity_id === activityId);
    if (!req) return;

    const modal = document.getElementById('modal-task-detail');
    if (!modal) return;

    document.getElementById('task-detail-title').innerText = `${req.activity_id} Details (${req.contract_number})`;

    const body = document.getElementById('task-detail-body');
    body.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
          <div class="form-label">Contract</div>
          <div style="font-weight: 700; color: #fff;">${req.contract_number} (Priority ${req.contract_priority})</div>
        </div>
        <div>
          <div class="form-label">Nature of Works</div>
          <div style="font-weight: 700; color: #38bdf8;">${req.nature_of_works}</div>
        </div>
        <div>
          <div class="form-label">Location Span</div>
          <div style="font-size: 12px; font-weight: 600;">${req.start_location_id} ➔ ${req.end_location_id}</div>
        </div>
        <div>
          <div class="form-label">Workload Required</div>
          <div style="font-weight: 700;">${req.total_accesses} Access Nights</div>
        </div>
      </div>

      <div class="form-label" style="margin-bottom: 8px;">Scheduled Access Slots:</div>
      <div style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto;">
        ${req.scheduled_accesses.map((a, i) => `
          <div style="background: var(--bg-card); padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
            <span>Access #${a.seq}: <b>Week ${a.week}</b>, Night ${a.access_night} (Slot ${a.co_share_group})</span>
            <span>${a.eclo ? '⚡ ECLO (+1.5x)' : 'Standard 3.5h'}</span>
          </div>
        `).join('')}
      </div>
    `;

    modal.classList.add('open');
  }
}
