/**
 * RailOptix Topology View (Interactive SVG Rail Network)
 * Visualizes Line Alpha (ALP), Line Beta (BET), Interchange Hubs (H01, H02),
 * Active Workzones, and 750V Live-Rail Buffers & Opposite-Bound Mirrors.
 */
class TopologyView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.networkData = null;
    this.currentRequests = [];
    this.activeWeek = 1;
    this.activeNight = 1;
    this.filterLine = 'ALL'; // 'ALL', 'ALP', or 'BET'
  }

  init(networkData) {
    this.networkData = networkData;
    this.render();
  }

  setFilterLine(line) {
    this.filterLine = line || 'ALL';
    this.render();
  }

  update(requests, activeWeek = 1, activeNight = 1, filterLine = null) {
    this.currentRequests = requests;
    this.activeWeek = activeWeek;
    this.activeNight = activeNight;
    if (filterLine !== null) this.filterLine = filterLine;
    this.render();
  }

  render() {
    if (!this.container || !this.networkData) return;

    const alpStns = this.networkData.stations_by_line.ALP || [];
    const betStns = this.networkData.stations_by_line.BET || [];

    const svgWidth = 1100;
    const svgHeight = 220;
    const paddingX = 70;
    const stepX = (svgWidth - 2 * paddingX) / (alpStns.length - 1);

    const alpY = 65;
    const betY = 155;

    // Identify active requests in the current week/night
    const activeThisNight = [];
    this.currentRequests.forEach(r => {
      const acc = r.scheduled_accesses.find(a => a.week === this.activeWeek && a.access_night === this.activeNight);
      if (acc) {
        activeThisNight.push({ req: r, acc: acc });
      }
    });

    let svg = `<svg id="topology-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="alpGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#059669" />
          <stop offset="100%" stop-color="#10b981" />
        </linearGradient>
        <linearGradient id="betGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#d97706" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        <filter id="glow-live" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-consist" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>`;

    const alpOpacity = (this.filterLine === 'ALL' || this.filterLine === 'ALP') ? '1' : '0.2';
    const betOpacity = (this.filterLine === 'ALL' || this.filterLine === 'BET') ? '1' : '0.2';
    const alpStroke = (this.filterLine === 'ALP') ? '6' : '4';
    const betStroke = (this.filterLine === 'BET') ? '6' : '4';

    // Interchange Hub Bridge Area (H01 index 4, H02 index 5)
    const h01X = paddingX + 4 * stepX;
    const h02X = paddingX + 5 * stepX;

    svg += `<rect x="${h01X - 25}" y="${alpY - 15}" width="${(h02X - h01X) + 50}" height="${(betY - alpY) + 30}" 
      rx="12" fill="rgba(139, 92, 246, 0.06)" stroke="rgba(139, 92, 246, 0.25)" stroke-dasharray="4 4" />
      <text x="${(h01X + h02X) / 2}" y="${(alpY + betY) / 2 + 4}" fill="#a78bfa" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="1">
        INTERCHANGE POWER ZONE (H01 ↔ H02)
      </text>`;

    // Render Line Alpha Track Lines
    svg += `<line x1="${paddingX}" y1="${alpY}" x2="${svgWidth - paddingX}" y2="${alpY}" stroke="url(#alpGrad)" stroke-width="${alpStroke}" opacity="${alpOpacity}" />`;
    // Render Line Beta Track Lines
    svg += `<line x1="${paddingX}" y1="${betY}" x2="${svgWidth - paddingX}" y2="${betY}" stroke="url(#betGrad)" stroke-width="${betStroke}" opacity="${betOpacity}" />`;

    // Render Active Workzones & Safety Buffers
    activeThisNight.forEach(({ req, acc }) => {
      const line = req.start_location_id.includes('ALP') ? 'ALP' : 'BET';
      if (this.filterLine !== 'ALL' && this.filterLine !== line) return;

      const stnList = line === 'ALP' ? alpStns : betStns;
      const trackY = line === 'ALP' ? alpY : betY;

      // Extract station bounds
      const partsStart = req.start_location_id.split(':')[2].split('_');
      const partsEnd = req.end_location_id.split(':')[2].split('_');
      const allStns = [partsStart[0], partsStart[1], partsEnd[0], partsEnd[1]];
      const indices = allStns.map(s => stnList.indexOf(s)).filter(i => i >= 0);

      if (indices.length > 0) {
        const minIdx = Math.min(...indices);
        const maxIdx = Math.max(...indices);
        const x1 = paddingX + minIdx * stepX;
        const x2 = paddingX + maxIdx * stepX;
        const width = Math.max(20, x2 - x1);

        const isLive = req.nature_of_works === 'Live';
        const isConsist = req.nature_of_works && req.nature_of_works.includes('Consist');

        // Draw Buffer Glow
        if (isLive) {
          // 2-sector buffer on main line
          const bufMinX = paddingX + Math.max(0, minIdx - 2) * stepX;
          const bufMaxX = paddingX + Math.min(stnList.length - 1, maxIdx + 2) * stepX;
          svg += `<rect x="${bufMinX}" y="${trackY - 14}" width="${bufMaxX - bufMinX}" height="28" rx="8" 
            fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 3" filter="url(#glow-live)" />`;

          // Mirror onto opposite line if near H01/H02
          if (minIdx <= 5 && maxIdx >= 4) {
            const oppY = line === 'ALP' ? betY : alpY;
            svg += `<rect x="${h01X}" y="${oppY - 12}" width="${h02X - h01X}" height="24" rx="6" 
              fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 2" />
              <text x="${(h01X + h02X)/2}" y="${oppY + 16}" fill="#fca5a5" font-size="9" text-anchor="middle">750V Live Isolated</text>`;
          }
        } else if (isConsist) {
          const bufMinX = paddingX + Math.max(0, minIdx - 1) * stepX;
          const bufMaxX = paddingX + Math.min(stnList.length - 1, maxIdx + 1) * stepX;
          svg += `<rect x="${bufMinX}" y="${trackY - 10}" width="${bufMaxX - bufMinX}" height="20" rx="6" 
            fill="rgba(6, 182, 212, 0.15)" stroke="#06b6d4" stroke-width="1" stroke-dasharray="3 3" filter="url(#glow-consist)" />`;
        }

        // Draw Work Zone Bar (Clickable)
        const barColor = isLive ? '#ef4444' : (isConsist ? '#3b82f6' : '#10b981');
        svg += `<g class="topology-workzone" data-activity="${req.activity_id}" style="cursor: pointer;" title="Click to view ${req.activity_id} (${req.contract_number})">
          <rect x="${x1}" y="${trackY - 7}" width="${width}" height="14" rx="4" fill="${barColor}" stroke="#fff" stroke-width="1.5" />
          <text x="${x1 + width / 2}" y="${trackY - 12}" fill="#fff" font-size="10" font-weight="700" text-anchor="middle">
            ${req.activity_id} (${req.contract_number})
          </text>
        </g>`;
      }
    });

    // Render Line Alpha Stations
    alpStns.forEach((stn, idx) => {
      const cx = paddingX + idx * stepX;
      const isHub = stn === 'H01' || stn === 'H02';
      const r = isHub ? 8 : 6;
      const fill = isHub ? '#8b5cf6' : '#10b981';

      svg += `<circle cx="${cx}" cy="${alpY}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2" class="stn-node" data-line="ALP" data-stn="${stn}" opacity="${alpOpacity}" style="cursor: pointer;" />
        <text x="${cx}" y="${alpY - 16}" fill="#f3f4f6" font-size="11" font-weight="700" text-anchor="middle" opacity="${alpOpacity}">${stn}</text>`;
    });

    // Render Line Beta Stations
    betStns.forEach((stn, idx) => {
      const cx = paddingX + idx * stepX;
      const isHub = stn === 'H01' || stn === 'H02';
      const r = isHub ? 8 : 6;
      const fill = isHub ? '#8b5cf6' : '#f59e0b';

      svg += `<circle cx="${cx}" cy="${betY}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2" class="stn-node" data-line="BET" data-stn="${stn}" opacity="${betOpacity}" style="cursor: pointer;" />
        <text x="${cx}" y="${betY + 24}" fill="#f3f4f6" font-size="11" font-weight="700" text-anchor="middle" opacity="${betOpacity}">${stn}</text>`;
    });

    // Line Labels
    svg += `<text x="16" y="${alpY + 4}" fill="#10b981" font-size="12" font-weight="800" opacity="${alpOpacity}">ALPHA</text>`;
    svg += `<text x="24" y="${betY + 4}" fill="#f59e0b" font-size="12" font-weight="800" opacity="${betOpacity}">BETA</text>`;

    svg += `</svg>`;
    this.container.innerHTML = svg;

    // Attach click events to workzones
    this.container.querySelectorAll('.topology-workzone').forEach(el => {
      el.addEventListener('click', () => {
        const actId = el.getAttribute('data-activity');
        if (actId && window.RailOptixApp && window.RailOptixApp.timelineView && window.RailOptixApp.timelineView.onTaskClick) {
          window.RailOptixApp.timelineView.onTaskClick(actId);
        }
      });
    });

    // Attach click events to stations to filter search
    this.container.querySelectorAll('.stn-node').forEach(node => {
      node.addEventListener('click', () => {
        const stn = node.getAttribute('data-stn');
        const searchInput = document.getElementById('search-input');
        if (searchInput && stn) {
          searchInput.value = stn;
          searchInput.dispatchEvent(new Event('input'));
          const tt = document.getElementById('section-timetable');
          if (tt) tt.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }
}
