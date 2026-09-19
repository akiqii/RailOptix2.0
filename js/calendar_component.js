/**
 * RailOptix Planning Horizon Calendar Component
 * Provides an interactive calendar popover allowing users to browse dates,
 * navigate months across the 30-week horizon (Jan 2027 - Aug 2027),
 * inspect specific planning weeks (W1 to W30), and apply quick presets (Peak Works, Full Horizon, etc.).
 */
class CalendarComponent {
  constructor(popoverId, triggerId, labelId) {
    this.popover = document.getElementById(popoverId);
    this.trigger = document.getElementById(triggerId);
    this.label = document.getElementById(labelId);
    
    // Default to May 2027 (matching reference photo date: Sat, 17 May 2027, W20)
    this.currentYear = 2027;
    this.currentMonth = 4; // 0-indexed (4 = May)
    this.selectedWeek = 20;
    this.selectedDate = new Date(2027, 4, 17); // 17 May 2027
    this.isOpen = false;
    this.onSelectWeek = null;

    // Horizon anchor: Week 1 Day 1 starts Monday 4 Jan 2027
    this.horizonStart = new Date(2027, 0, 4);

    this.monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
  }

  init() {
    if (!this.popover || !this.trigger) return;

    // Trigger click -> toggle popover
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.popover.contains(e.target) && !this.trigger.contains(e.target)) {
        this.close();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    this.render();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (!this.popover) return;
    this.isOpen = true;
    this.popover.style.display = 'block';
    this.trigger.classList.add('active');
    this.render();
  }

  close() {
    if (!this.popover) return;
    this.isOpen = false;
    this.popover.style.display = 'none';
    this.trigger.classList.remove('active');
  }

  prevMonth() {
    // Bound to Jan 2027 (Month 0)
    if (this.currentYear === 2027 && this.currentMonth <= 0) return;
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.render();
  }

  nextMonth() {
    // Bound to Aug 2027 (Month 7)
    if (this.currentYear === 2027 && this.currentMonth >= 7) return;
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  }

  getWeekFromDate(date) {
    const diffTime = date.getTime() - this.horizonStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    const wk = Math.floor(diffDays / 7) + 1;
    return Math.min(30, Math.max(1, wk));
  }

  getDateFromWeek(weekNum) {
    const d = new Date(this.horizonStart);
    d.setDate(d.getDate() + (weekNum - 1) * 7);
    return d;
  }

  selectPreset(presetType) {
    let targetWeek = 20;
    let labelText = '';

    if (presetType === 'ALL') {
      targetWeek = 'ALL';
      labelText = 'Sat, 17 May 2027 (W1 - W30)';
    } else if (presetType === 'PEAK') {
      targetWeek = 13;
      this.currentMonth = 2; // March
      this.selectedDate = new Date(2027, 2, 29);
      labelText = '⚡ Week 13: 29 Mar 2027 (Peak)';
    } else if (presetType === 'CURRENT') {
      targetWeek = 1;
      this.currentMonth = 0; // January
      this.selectedDate = new Date(2027, 0, 4);
      labelText = '🌙 Week 1: 04 Jan 2027 (Current)';
    } else if (presetType === 'MAY') {
      targetWeek = 20;
      this.currentMonth = 4; // May
      this.selectedDate = new Date(2027, 4, 17);
      labelText = 'Sat, 17 May 2027 (W20)';
    } else if (presetType === 'GATE') {
      targetWeek = 26;
      this.currentMonth = 5; // June
      this.selectedDate = new Date(2027, 5, 28);
      labelText = '🏁 Week 26: 28 Jun 2027 (Gate)';
    }

    this.selectedWeek = targetWeek;
    if (this.label) this.label.innerText = labelText;

    if (this.onSelectWeek) {
      this.onSelectWeek(targetWeek, labelText);
    }
    this.close();
  }

  selectDate(year, month, day) {
    const date = new Date(year, month, day);
    this.selectedDate = date;
    const weekNum = this.getWeekFromDate(date);
    this.selectedWeek = weekNum;

    const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const monthName = date.toLocaleDateString('en-GB', { month: 'short' });
    const formatted = `${dayName}, ${day} ${monthName} ${year} (W${weekNum})`;

    if (this.label) this.label.innerText = formatted;

    if (this.onSelectWeek) {
      this.onSelectWeek(weekNum, formatted);
    }
    this.close();
  }

  render() {
    if (!this.popover) return;

    const monthName = this.monthNames[this.currentMonth];
    const year = this.currentYear;

    // First day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const firstDay = new Date(year, this.currentMonth, 1).getDay();
    // In our European / Railway calendar, week starts on Monday
    const startOffset = (firstDay + 6) % 7; 
    const daysInMonth = new Date(year, this.currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, this.currentMonth, 0).getDate();

    let html = `
      <div class="cal-inner">
        <!-- Month Navigation Header -->
        <div class="cal-header">
          <button class="cal-nav-btn" id="cal-btn-prev" title="Previous Month">‹</button>
          <div class="cal-title-box">
            <span class="cal-month-title">${monthName} ${year}</span>
            <span class="cal-horizon-badge">30-Week Horizon</span>
          </div>
          <button class="cal-nav-btn" id="cal-btn-next" title="Next Month">›</button>
        </div>

        <!-- Quick Presets -->
        <div class="cal-presets">
          <button class="cal-preset-chip ${this.selectedWeek === 'ALL' ? 'active' : ''}" data-preset="ALL">
            Full Horizon (W1-W30)
          </button>
          <button class="cal-preset-chip ${this.selectedWeek === 20 ? 'active' : ''}" data-preset="MAY">
            May 17 Focus (W20)
          </button>
          <button class="cal-preset-chip ${(this.selectedWeek >= 12 && this.selectedWeek <= 14) ? 'active' : ''}" data-preset="PEAK">
            ⚡ Peak Works (W12-W14)
          </button>
          <button class="cal-preset-chip ${this.selectedWeek === 1 ? 'active' : ''}" data-preset="CURRENT">
            🌙 Current (W1-W2)
          </button>
          <button class="cal-preset-chip ${this.selectedWeek === 26 ? 'active' : ''}" data-preset="GATE">
            🏁 Gate (W26)
          </button>
        </div>

        <!-- Weekday Labels -->
        <div class="cal-grid-header">
          <span class="cal-week-label">Wk</span>
          <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
        </div>

        <!-- Days Grid -->
        <div class="cal-grid-days">
    `;

    let currentDayCount = 1;
    let nextMonthDay = 1;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      // Check if starting a new week row
      if (i % 7 === 0) {
        // Calculate the week number for the Monday of this row
        let rowDate;
        if (i < startOffset) {
          const prevDay = daysInPrevMonth - startOffset + i + 1;
          rowDate = new Date(year, this.currentMonth - 1, prevDay);
        } else if (currentDayCount <= daysInMonth) {
          rowDate = new Date(year, this.currentMonth, currentDayCount);
        } else {
          rowDate = new Date(year, this.currentMonth + 1, nextMonthDay);
        }
        const rowWeekNum = this.getWeekFromDate(rowDate);
        const isPeakRow = (rowWeekNum >= 12 && rowWeekNum <= 14);
        const isSelectedRow = (this.selectedWeek === rowWeekNum);

        html += `
          <div class="cal-week-badge ${isPeakRow ? 'peak' : ''} ${isSelectedRow ? 'selected' : ''}" 
               data-week="${rowWeekNum}" 
               title="Click to view all activities in Week ${rowWeekNum}">
            W${rowWeekNum}
          </div>
        `;
      }

      if (i < startOffset) {
        // Trailing days from previous month
        const prevDay = daysInPrevMonth - startOffset + i + 1;
        html += `<div class="cal-day other-month">${prevDay}</div>`;
      } else if (currentDayCount <= daysInMonth) {
        // Current month day
        const dayNum = currentDayCount;
        const thisDate = new Date(year, this.currentMonth, dayNum);
        const dayWeekNum = this.getWeekFromDate(thisDate);
        const isSelected = this.selectedDate && 
          this.selectedDate.getDate() === dayNum && 
          this.selectedDate.getMonth() === this.currentMonth && 
          this.selectedDate.getFullYear() === year;
        const isPeakDay = (dayWeekNum >= 12 && dayWeekNum <= 14);

        html += `
          <div class="cal-day ${isSelected ? 'selected' : ''} ${isPeakDay ? 'peak-day' : ''}" 
               data-day="${dayNum}" 
               data-month="${this.currentMonth}" 
               data-year="${year}"
               data-week="${dayWeekNum}"
               title="Select ${dayNum} ${monthName} ${year} (Week ${dayWeekNum})">
            <span>${dayNum}</span>
            ${isPeakDay ? '<span class="cal-dot-indicator red"></span>' : '<span class="cal-dot-indicator green"></span>'}
          </div>
        `;
        currentDayCount++;
      } else {
        // Leading days of next month
        html += `<div class="cal-day other-month">${nextMonthDay}</div>`;
        nextMonthDay++;
      }
    }

    html += `
        </div>

        <!-- Calendar Footer -->
        <div class="cal-footer">
          <div class="cal-footer-status">
            <span class="cal-status-dot"></span>
            <span>Selected: <strong>Week ${this.selectedWeek || '1 - 30'}</strong> • 14 Contracts Scheduled</span>
          </div>
          <button class="cal-reset-btn" id="cal-reset-all">Reset to All</button>
        </div>
      </div>
    `;

    this.popover.innerHTML = html;

    // Attach internal calendar events
    const btnPrev = document.getElementById('cal-btn-prev');
    const btnNext = document.getElementById('cal-btn-next');
    if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); this.prevMonth(); });
    if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); this.nextMonth(); });

    // Presets
    this.popover.querySelectorAll('.cal-preset-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectPreset(btn.getAttribute('data-preset'));
      });
    });

    // Reset button
    const resetBtn = document.getElementById('cal-reset-all');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectPreset('ALL');
      });
    }

    // Days Click
    this.popover.querySelectorAll('.cal-day[data-day]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const d = parseInt(cell.getAttribute('data-day'));
        const m = parseInt(cell.getAttribute('data-month'));
        const y = parseInt(cell.getAttribute('data-year'));
        this.selectDate(y, m, d);
      });
    });

    // Week badge click
    this.popover.querySelectorAll('.cal-week-badge[data-week]').forEach(wb => {
      wb.addEventListener('click', (e) => {
        e.stopPropagation();
        const wk = parseInt(wb.getAttribute('data-week'));
        this.selectedWeek = wk;
        const d = this.getDateFromWeek(wk);
        const dayStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const labelText = `Week ${wk} Horizon (${dayStr})`;
        if (this.label) this.label.innerText = labelText;
        if (this.onSelectWeek) this.onSelectWeek(wk, labelText);
        this.close();
      });
    });
  }
}
