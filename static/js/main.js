/**
 * RailOptix Main Application Controller
 * Orchestrates views, state updates, KPI scorecards, demand curve, and user actions.
 * Inspired by modern executive dashboards (SmartStaff AI style).
 */
class RailOptixApp {
  constructor() {
    this.state = {
      network: null,
      contracts: [],
      requests: [],
      conflicts: [],
      roster: [],
      equipment: [],
      scenarios: [],
      activeScenarioId: 'scenario_a_strict_supply',
      selectedWeek: 1,
      selectedNight: 1,
      filterLine: 'ALL',
    };

    this.topologyView = new TopologyView('topology-container');
    this.timelineView = new TimelineView('timeline-container');
    this.conflictView = new ConflictView('clash-list-container');
    this.variablesManager = new VariablesModalManager(this.state);
    this.validatorModal = new ValidatorModalManager();
    this.assistantModal = new WorksAssistantManager();
    this.disruptionModal = new DisruptionModalManager();
    this.calendar = new CalendarComponent('calendar-popover', 'header-date-pill', 'header-date-text');
  }

  async init() {
    console.log('Initializing RailOptix...');
    try {
      // Fetch initial state in parallel
      const [network, contracts, requests, conflicts, roster, equipment, scenarios] = await Promise.all([
        API.getNetwork(),
        API.getContracts(),
        API.getRequests(),
        API.getConflicts(),
        API.getRoster(),
        API.getEquipment(),
        API.getScenarios()
      ]);

      this.state.network = network;
      this.state.contracts = contracts;
      this.state.requests = requests;
      this.state.conflicts = conflicts;
      this.state.roster = roster;
      this.state.equipment = equipment;
      this.state.scenarios = scenarios;

      this.topologyView.init(this.state.network);
      this.validatorModal.init();
      this.assistantModal.init();
      this.disruptionModal.init();
      this.calendar.init();
      this.calendar.onSelectWeek = (weekNum, dateLabel) => {
        this.selectWeek(weekNum, dateLabel);
      };

      this.bindEvents();
      this.refreshUI();
      console.log('RailOptix initialized successfully.');
    } catch (err) {
      console.error('RailOptix initialization error:', err);
    }
  }

  getFilteredRequests() {
    if (!this.state.requests) return [];
    if (!this.state.filterLine || this.state.filterLine === 'ALL') return this.state.requests;
    return this.state.requests.filter(r => 
      (r.start_location_id && r.start_location_id.includes(this.state.filterLine)) ||
      (r.end_location_id && r.end_location_id.includes(this.state.filterLine))
    );
  }

  getFilteredConflicts() {
    if (!this.state.conflicts) return [];
    if (!this.state.filterLine || this.state.filterLine === 'ALL') return this.state.conflicts;
    const lineReqs = this.getFilteredRequests();
    const actIds = new Set(lineReqs.map(r => r.activity_id));
    return this.state.conflicts.filter(c => c.activity_ids.some(id => actIds.has(id)));
  }

  refreshUI() {
    // 1. Update KPI Scorecards
    this.updateKPIScorecards();

    // 2. Update Demand Forecast Curve
    this.renderDemandCurve();

    // 3. Update Topology View
    const filteredReqs = this.getFilteredRequests();
    this.topologyView.update(filteredReqs, this.state.selectedWeek, this.state.selectedNight, this.state.filterLine);

    // 4. Update Timeline View
    this.timelineView.setData({
      requests: this.state.requests,
      contracts: this.state.contracts,
      conflicts: this.state.conflicts
    });

    // 5. Update Conflict View
    this.conflictView.render(this.getFilteredConflicts());

    // 6. Update Active Scenario Pills & Alternative Schedule Cards
    this.updateScenarioSelectionUI();
  }

  updateScenarioSelectionUI() {
    document.querySelectorAll('.scenario-pill').forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-scenario') === this.state.activeScenarioId);
    });

    // Update Alternative Schedules option cards on right panel
    document.querySelectorAll('.schedule-option-card').forEach(card => {
      const scenKey = card.getAttribute('data-scenario');
      const isSel = scenKey === this.state.activeScenarioId;
      card.classList.toggle('selected', isSel);
      card.classList.toggle('active', isSel);
      const star = card.querySelector('.schedule-star');
      if (star) {
        star.style.display = isSel ? 'inline' : 'none';
      }
    });
  }

  updateKPIScorecards() {
    const filteredReqs = this.getFilteredRequests();
    const filteredConfs = this.getFilteredConflicts();
    const hardClashes = filteredConfs.filter(c => c.severity === 'HARD').length;
    const isFeasible = hardClashes === 0;

    // Feasibility status badge
    const statusEl = document.getElementById('kpi-feasibility');
    const badgeEl = document.getElementById('kpi-feasibility-badge');
    if (statusEl) {
      statusEl.innerHTML = isFeasible 
        ? `<span style="color: #059669;">FEASIBLE <span style="font-size: 18px; color: #10b981;">↗</span></span>` 
        : `<span style="color: #dc2626;">INFEASIBLE</span>`;
    }
    if (badgeEl) {
      badgeEl.className = isFeasible ? 'kpi-badge success' : 'kpi-badge danger';
      badgeEl.innerText = isFeasible ? '● 0 Hard Clashes' : `⚠️ ${hardClashes} Violations`;
    }

    // Overrun days
    const totalOverrun = filteredReqs.reduce((max, r) => Math.max(max, r.overrun_days || 0), 0);
    const overrunEl = document.getElementById('kpi-overrun');
    if (overrunEl) {
      overrunEl.innerText = `${totalOverrun} Days`;
      overrunEl.style.color = totalOverrun === 0 ? '#059669' : '#dc2626';
    }

    // Total Works / Scheduled Activities
    const totalWorksEl = document.getElementById('kpi-total-works');
    if (totalWorksEl) {
      totalWorksEl.innerText = `${filteredReqs.length} Works`;
    }

    // Clash Count Card
    const clashCountEl = document.getElementById('kpi-clashes-count');
    const notifBadge = document.getElementById('notif-badge');
    if (clashCountEl) {
      clashCountEl.innerText = `${hardClashes} Clashes`;
      clashCountEl.style.color = hardClashes === 0 ? '#059669' : '#dc2626';
    }
    if (notifBadge) {
      notifBadge.innerText = `${filteredConfs.length}`;
      notifBadge.style.display = filteredConfs.length > 0 ? 'inline-block' : 'none';
    }

    // ECLO Nights
    const ecloCount = filteredReqs.reduce((sum, r) => sum + r.scheduled_accesses.filter(a => a.eclo === 1).length, 0);
    const ecloEl = document.getElementById('kpi-eclo');
    if (ecloEl) {
      ecloEl.innerText = `${ecloCount}`;
    }

    // Penalty Score
    let score = 0;
    filteredReqs.forEach(r => {
      if (r.overrun_days > 0) {
        const cWeight = r.contract_priority === 1 ? 100 : (r.contract_priority === 2 ? 10 : 1);
        score += (cWeight * r.overrun_days);
      }
    });
    const scoreEl = document.getElementById('kpi-score');
    if (scoreEl) {
      scoreEl.innerText = score.toFixed(1);
    }
  }

  renderDemandCurve() {
    const container = document.getElementById('demand-curve-container');
    if (!container) return;

    // Calculate accesses per week (1 to 30) for filtered requests
    const weekCounts = new Array(31).fill(0);
    const filteredReqs = this.getFilteredRequests();
    filteredReqs.forEach(r => {
      r.scheduled_accesses.forEach(a => {
        if (a.week >= 1 && a.week <= 30) {
          weekCounts[a.week]++;
        }
      });
    });

    const maxCount = Math.max(...weekCounts.slice(1), 10);
    const width = 680;
    const height = 180;
    const padX = 40;
    const padY = 25;
    const plotW = width - 2 * padX;
    const plotH = height - 2 * padY;

    // Generate coordinates for weeks 1 to 30
    const points = [];
    for (let w = 1; w <= 30; w++) {
      const x = padX + ((w - 1) / 29) * plotW;
      const y = height - padY - (weekCounts[w] / maxCount) * plotH;
      points.push({ w, x, y, count: weekCounts[w] });
    }

    // Build smooth SVG path
    let dLine = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      dLine += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const dArea = `${dLine} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

    // Highlight area for peak weeks 12 to 14
    const peakP1 = points[11]; // W12
    const peakP2 = points[13]; // W14
    const peakBoxX = peakP1.x - 10;
    const peakBoxW = (peakP2.x - peakP1.x) + 20;

    let svg = `
      <svg id="demand-curve-svg" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="45%" stop-color="#f59e0b" />
            <stop offset="70%" stop-color="#ef4444" />
            <stop offset="100%" stop-color="#10b981" />
          </linearGradient>
        </defs>

        <!-- Peak Demand Highlight Box (Similar to 12 PM - 2 PM in photo) -->
        <rect x="${peakBoxX}" y="${padY - 8}" width="${peakBoxW}" height="${plotH + 16}" 
              rx="8" fill="#fee2e2" fill-opacity="0.5" stroke="#fca5a5" stroke-dasharray="4 3"/>
        <text x="${peakBoxX + peakBoxW / 2}" y="${padY + 4}" fill="#e11d48" font-size="10" font-weight="700" text-anchor="middle">
          W12 - W14 Peak Works
        </text>

        <!-- Horizontal Grid Lines -->
        <line x1="${padX}" y1="${padY}" x2="${width - padX}" y2="${padY}" stroke="#f1f5f9" stroke-width="1"/>
        <line x1="${padX}" y1="${padY + plotH / 2}" x2="${width - padX}" y2="${padY + plotH / 2}" stroke="#f1f5f9" stroke-width="1"/>
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#e2e8f0" stroke-width="1"/>

        <!-- Area Fill -->
        <path d="${dArea}" fill="url(#areaGradient)" />

        <!-- Line Curve -->
        <path d="${dLine}" fill="none" stroke="url(#curveGradient)" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Sample Points and Labels -->
    `;

    // Render dots and selected week tick labels
    points.forEach(p => {
      if (p.w === 1 || p.w === 5 || p.w === 10 || p.w === 13 || p.w === 20 || p.w === 25 || p.w === 30) {
        const isPeak = (p.w === 13);
        const dotColor = isPeak ? '#ef4444' : (p.count >= 4 ? '#f59e0b' : '#10b981');
        svg += `
          <circle cx="${p.x}" cy="${p.y}" r="${isPeak ? 4.5 : 3.5}" fill="#ffffff" stroke="${dotColor}" stroke-width="2" />
          <text x="${p.x}" y="${height - padY + 14}" fill="#64748b" font-size="10" font-weight="600" text-anchor="middle">W${p.w}</text>
        `;
      }
    });

    svg += `</svg>`;
    container.innerHTML = svg;
  }

  setNetworkLine(line) {
    this.state.filterLine = line;

    // 1. Synchronize header select
    const headerSelect = document.getElementById('header-network-select');
    if (headerSelect && headerSelect.value !== line) {
      headerSelect.value = line;
    }

    // 2. Synchronize timetable line filter
    const filterLineSelect = document.getElementById('filter-line');
    if (filterLineSelect && filterLineSelect.value !== line) {
      filterLineSelect.value = line;
    }

    // 3. Synchronize sidebar store selector value
    const sidebarVal = document.getElementById('sidebar-line-value');
    if (sidebarVal) {
      if (line === 'ALP') sidebarVal.textContent = 'Line Alpha (ALP)';
      else if (line === 'BET') sidebarVal.textContent = 'Line Beta (BET)';
      else sidebarVal.textContent = 'Lines ALP & BET (All)';
    }

    // 4. Update Demand Forecast badge
    const demandLineTag = document.getElementById('demand-line-tag');
    if (demandLineTag) {
      if (line === 'ALP') {
        demandLineTag.textContent = 'Line Alpha (23 Works)';
        demandLineTag.style.color = '#ef4444';
        demandLineTag.style.background = '#fef2f2';
      } else if (line === 'BET') {
        demandLineTag.textContent = 'Line Beta (31 Works)';
        demandLineTag.style.color = '#3b82f6';
        demandLineTag.style.background = '#eff6ff';
      } else {
        demandLineTag.textContent = 'All Lines (54 Works)';
        demandLineTag.style.color = '#10b981';
        demandLineTag.style.background = '#ecfdf5';
      }
    }

    // 5. Update timeline view filters
    const priorityFilter = document.getElementById('filter-priority');
    const searchInput = document.getElementById('search-input');
    this.timelineView.setFilters({
      line: line,
      priority: priorityFilter ? priorityFilter.value : 'ALL',
      search: searchInput ? searchInput.value : ''
    });

    // 6. Update topology view filter
    this.topologyView.setFilterLine(line);

    // 7. Update KPIs, Demand curve, and conflicts
    this.updateKPIScorecards();
    this.renderDemandCurve();
    this.conflictView.render(this.getFilteredConflicts());
  }

  selectWeek(weekNum, label) {
    const isAll = (weekNum === 'ALL');
    const w = isAll ? 1 : Math.max(1, Math.min(29, parseInt(weekNum) || 1));
    this.state.selectedWeek = w;

    // 1. Update timetable week dropdown
    const weekSelect = document.getElementById('select-timetable-week');
    if (weekSelect) {
      const targetVal = String(w % 2 === 0 ? w - 1 : w);
      if (Array.from(weekSelect.options).some(o => o.value === targetVal)) {
        weekSelect.value = targetVal;
      }
    }

    // 2. Update TimelineView activeStartWeek
    this.timelineView.setActiveStartWeek(w);

    // 3. Update TopologyView activeWeek
    const filteredReqs = this.getFilteredRequests();
    this.topologyView.update(filteredReqs, w, this.state.selectedNight || 1, this.state.filterLine);

    // 4. Update Header date pill label
    const datePill = document.getElementById('header-date-text');
    if (datePill) {
      if (label) {
        datePill.textContent = label;
      } else {
        datePill.textContent = `Week ${w} - ${w + 1} (2027) • Horizon W1-W30`;
      }
    }
  }

  bindEvents() {
    // Scenario Switcher Buttons in Top Bar & Right Alternative Schedule Stack
    document.querySelectorAll('.scenario-pill, .schedule-option-card').forEach(el => {
      el.addEventListener('click', async () => {
        const scenId = el.getAttribute('data-scenario');
        if (scenId) {
          await this.applyScenario(scenId);
        }
      });
    });

    // View Mode Toggle (2-Week Operational vs 30-Week Strategic Gantt)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-view');
        this.timelineView.setViewMode(mode);
      });
    });

    // Sidebar Navigation Click Handlers
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const targetSection = item.getAttribute('data-target');
        if (targetSection === 'section-dashboard') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (targetSection) {
          const el = document.getElementById(targetSection);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    // Notification Bell Click -> Scroll to Alerts
    const bellBtn = document.getElementById('btn-bell');
    if (bellBtn) {
      bellBtn.addEventListener('click', () => {
        const clashSec = document.getElementById('section-clashes');
        if (clashSec) clashSec.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Header Line Selector (All Lines, Line Alpha, Line Beta)
    const headerSelect = document.getElementById('header-network-select');
    if (headerSelect) {
      headerSelect.addEventListener('change', (e) => {
        this.setNetworkLine(e.target.value);
      });
    }

    // Sidebar Active Line Network Click -> Cycle ALL -> ALP -> BET -> ALL
    const sidebarSelector = document.getElementById('sidebar-line-selector');
    if (sidebarSelector) {
      sidebarSelector.addEventListener('click', () => {
        const current = this.state.filterLine || 'ALL';
        const next = current === 'ALL' ? 'ALP' : (current === 'ALP' ? 'BET' : 'ALL');
        this.setNetworkLine(next);
      });
    }

    // Timetable Line Filter (Synchronized with Header and Sidebar)
    const lineFilter = document.getElementById('filter-line');
    if (lineFilter) {
      lineFilter.addEventListener('change', (e) => {
        this.setNetworkLine(e.target.value);
      });
    }

    // Priority and Search Filters
    const priorityFilter = document.getElementById('filter-priority');
    const searchInput = document.getElementById('search-input');
    const handleFilterChange = () => {
      this.timelineView.setFilters({
        line: this.state.filterLine || 'ALL',
        priority: priorityFilter ? priorityFilter.value : 'ALL',
        search: searchInput ? searchInput.value : ''
      });
    };

    if (priorityFilter) priorityFilter.addEventListener('change', handleFilterChange);
    if (searchInput) searchInput.addEventListener('input', handleFilterChange);

    // Sync priority dropdown when user clicks a legend pill
    this.timelineView.onPriorityFilterChange = (priority) => {
      if (priorityFilter) {
        priorityFilter.value = priority;
      }
    };

    // Timetable Week Navigator (Dropdown, Prev, Next buttons)
    const weekSelect = document.getElementById('select-timetable-week');
    if (weekSelect) {
      weekSelect.addEventListener('change', (e) => {
        this.selectWeek(parseInt(e.target.value));
      });
    }
    const btnPrevWeek = document.getElementById('btn-prev-week');
    if (btnPrevWeek) {
      btnPrevWeek.addEventListener('click', () => {
        const current = this.timelineView.activeStartWeek || 1;
        this.selectWeek(Math.max(1, current - 2));
      });
    }
    const btnNextWeek = document.getElementById('btn-next-week');
    if (btnNextWeek) {
      btnNextWeek.addEventListener('click', () => {
        const current = this.timelineView.activeStartWeek || 1;
        this.selectWeek(Math.min(29, current + 2));
      });
    }

    // AI Auto-Optimize Button
    const btnOptimize = document.getElementById('btn-optimize');
    if (btnOptimize) {
      btnOptimize.addEventListener('click', async () => {
        btnOptimize.disabled = true;
        btnOptimize.innerHTML = '<span>⚡</span><span>Optimizing...</span>';
        await this.applyScenario(this.state.activeScenarioId);
        btnOptimize.disabled = false;
        btnOptimize.innerHTML = '<span>⚡</span><span>AI Auto-Optimize</span>';
        this.showToast('AI Minimal-Perturbation Optimization Applied!');
      });
    }

    // Key Variables Button
    const btnVariables = document.getElementById('btn-variables');
    if (btnVariables) {
      btnVariables.addEventListener('click', () => {
        this.variablesManager.openKeyVariablesModal('roster');
      });
    }

    // Compare Scenarios Button / Link
    const compareTriggers = document.querySelectorAll('#btn-compare, #link-compare-options');
    compareTriggers.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const scenarios = await API.getScenarios();
        this.state.scenarios = scenarios;
        this.variablesManager.openComparisonModal(scenarios);
      });
    });

    // New Request Button
    const btnNewReq = document.getElementById('btn-new-request');
    if (btnNewReq) {
      btnNewReq.addEventListener('click', () => {
        this.variablesManager.openNewRequestModal();
      });
    }

    // Form Submit for New Request
    const formNewReq = document.getElementById('form-new-request');
    if (formNewReq) {
      formNewReq.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reqData = {
          activity_id: document.getElementById('req-act-id').value.trim(),
          contract_number: document.getElementById('req-contract').value,
          activity_type: document.getElementById('req-type').value,
          start_location_id: document.getElementById('req-start').value,
          end_location_id: document.getElementById('req-end').value,
          total_accesses: parseFloat(document.getElementById('req-accesses').value),
          planned_start_date: document.getElementById('req-start-date').value,
          activity_priority: parseInt(document.getElementById('req-priority').value),
          scheduled_accesses: [{
            seq: 1,
            week: parseInt(document.getElementById('req-start-week').value),
            eclo: 0,
            access_night: 1,
            co_share_group: 'b1'
          }]
        };

        try {
          await API.addRequest(reqData);
          document.getElementById('modal-new-request').classList.remove('open');
          formNewReq.reset();
          
          this.state.requests = await API.getRequests();
          this.state.conflicts = await API.getConflicts();
          this.refreshUI();
          this.showToast(`Request ${reqData.activity_id} successfully added!`);
        } catch (err) {
          alert('Failed to add request: ' + err.message);
        }
      });
    }

    // Export Buttons (Toolbar & Footer)
    document.querySelectorAll('#btn-export, #btn-export-footer').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const scenLetter = this.state.activeScenarioId.includes('scenario_b') ? 'B' : (this.state.activeScenarioId.includes('scenario_c') ? 'C' : 'A');
        this.showToast(`Preparing Scenario ${scenLetter} Deliverables ZIP...`);
        try {
          await API.downloadZipBundle(scenLetter);
          this.showToast(`Scenario ${scenLetter} ZIP downloaded!`);
        } catch (err) {
          console.error('ZIP download error:', err);
          this.showToast(`Download failed: ${err.message}`);
        }
      });
    });

    // Deliverables Scenario Dropdown & Action Buttons
    const dSelect = document.getElementById('deliverables-scenario-select');
    const btnZip = document.getElementById('btn-dl-zip');
    if (btnZip) {
      btnZip.addEventListener('click', async (e) => {
        e.preventDefault();
        const scen = dSelect ? dSelect.value : 'A';
        this.showToast(`Preparing Scenario ${scen} Deliverables ZIP...`);
        try {
          await API.downloadZipBundle(scen);
          this.showToast(`Scenario ${scen} ZIP downloaded!`);
        } catch (err) {
          console.error('ZIP download error:', err);
          this.showToast(`Download failed: ${err.message}`);
        }
      });
    }

    ['access', 'occ', 'res'].forEach(key => {
      const btn = document.getElementById(`btn-dl-${key}`);
      if (btn) {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const scen = dSelect ? dSelect.value : 'A';
          const fileMap = {
            access: 'SCHEDULE_ACCESS.csv',
            occ: 'SCHEDULE_OCCUPANCY.csv',
            res: 'RESULTS.csv'
          };
          const fname = fileMap[key];
          this.showToast(`Downloading ${fname}...`);
          try {
            await API.downloadDeliverableCsv(scen, fname);
            this.showToast(`${fname} downloaded!`);
          } catch (err) {
            console.error('CSV download error:', err);
            this.showToast(`Download failed: ${err.message}`);
          }
        });
      }
    });

    // Conflict Resolution Handler
    this.conflictView.onResolveClick = async (confId) => {
      try {
        const res = await API.resolveClash(confId);
        this.state.requests = res.requests;
        this.state.conflicts = await API.getConflicts();
        this.refreshUI();
        this.showToast(res.message);
      } catch (err) {
        alert('Resolution failed: ' + err.message);
      }
    };

    // Task click handler (opens task detail modal on clicking blue, red, orange bars or task chips)
    this.timelineView.onTaskClick = (actId) => {
      this.variablesManager.openTaskDetailModal(actId);
    };

    // Universal Modal Close Delegation
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('.modal-close');
      if (closeBtn) {
        const modal = closeBtn.closest('.modal-backdrop');
        if (modal) modal.classList.remove('open');
      }
    });

    // Universal Escape Key Listener (closes any open modal or popover)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
        const pop = document.getElementById('calendar-popover');
        if (pop) pop.style.display = 'none';
      }
    });
  }

  async refreshAll() {
    try {
      const [network, contracts, requests, conflicts, roster, equipment, scenarios] = await Promise.all([
        API.getNetwork(),
        API.getContracts(),
        API.getRequests(),
        API.getConflicts(),
        API.getRoster(),
        API.getEquipment(),
        API.getScenarios()
      ]);
      this.state.network = network;
      this.state.contracts = contracts;
      this.state.requests = requests;
      this.state.conflicts = conflicts;
      this.state.roster = roster;
      this.state.equipment = equipment;
      this.state.scenarios = scenarios;
      this.topologyView.init(this.state.network);
      this.refreshUI();
      if (typeof updateInstanceBanner === 'function') {
        updateInstanceBanner();
      }
    } catch (err) {
      console.error('RailOptix refresh error:', err);
    }
  }

  async applyScenario(scenarioId) {
    try {
      const res = await API.applyScenario(scenarioId);
      this.state.activeScenarioId = scenarioId;
      this.state.requests = res.requests;
      this.state.conflicts = await API.getConflicts();
      
      const scenLetter = scenarioId.includes('scenario_b') ? 'B' : (scenarioId.includes('scenario_c') ? 'C' : 'A');
      const dSelect = document.getElementById('deliverables-scenario-select');
      if (dSelect) {
        dSelect.value = scenLetter;
        dSelect.dispatchEvent(new Event('change'));
      }

      // Close comparison modal if open
      const compModal = document.getElementById('modal-comparison');
      if (compModal) compModal.classList.remove('open');

      // If Two-Week Operational scenario was clicked, switch to 2-Week view mode
      if (scenarioId === 'two_week_operational') {
        const btn2w = document.getElementById('btn-view-2week');
        if (btn2w && !btn2w.classList.contains('active')) {
          btn2w.click();
        }
      }

      this.refreshUI();
      this.showToast(`Applied ${res.scenario_id.replace(/_/g, ' ').toUpperCase()}`);
    } catch (err) {
      console.error('Error applying scenario:', err);
    }
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2000;
      background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 10px;
      border: 1px solid #3b82f6; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;
      animation: fadeIn 0.2s ease;
    `;
    toast.innerHTML = `<span>⚡</span><span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.RailOptixApp = new RailOptixApp();
  window.TrackPulseApp = window.RailOptixApp;
  window.app = window.RailOptixApp;
  window.app.init();
  if (typeof initUploadModal === 'function') {
    initUploadModal();
  }
});
