/**
 * RailOptix Conflict View (Alerts & AI Solution Hub)
 * Clean modern alerts style inspired by reference dashboard
 */
class ConflictView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.onResolveClick = null;
  }

  render(conflicts = []) {
    this.currentConflicts = conflicts;
    if (!this.container) return;

    if (conflicts.length === 0) {
      this.container.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <div style="font-size: 32px; color: #10b981; margin-bottom: 8px;">🛡️</div>
          <div style="font-weight: 700; font-size: 14px; color: #0f172a;">All Workzones Conflict-Free</div>
          <div style="font-size: 11px; margin-top: 4px; color: #64748b; line-height: 1.4;">
            All 750V Live traction buffers, consist clearances, and contractor workfront caps are 100% compliant.
          </div>
        </div>
      `;
      return;
    }

    let html = `<div class="alerts-list">`;
    conflicts.forEach(c => {
      const isHard = c.severity === 'HARD';
      const iconClass = isHard ? 'red' : 'amber';
      const tagClass = isHard ? 'red' : 'amber';
      const typeLabel = c.type.replace(/_/g, ' ');

      html += `
        <div class="alert-item-card" data-conflict-id="${c.id}">
          <div class="alert-item-left">
            <div class="alert-icon-box ${iconClass}">
              <span>${isHard ? '⚠️' : '⏱️'}</span>
            </div>
            <div>
              <div class="alert-title">${typeLabel}</div>
              <div class="alert-time">W${c.week} ${c.access_night ? `• Night ${c.access_night}` : ''} • ${c.activity_ids ? c.activity_ids.join(', ') : ''}</div>
              <div style="font-size: 11px; color: #475569; margin-top: 4px; line-height: 1.3;">${c.description}</div>
              ${c.suggested_resolution ? `
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                  <button class="btn-autofix" data-resolve-id="${c.id}">⚡ Auto-Fix (${c.suggested_resolution.slice(0, 32)}...)</button>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="alert-item-right">
            <span class="alert-tag ${tagClass}">${c.severity}</span>
            <span class="chevron-arrow">›</span>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  attachEvents() {
    this.container.querySelectorAll('.btn-autofix').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const confId = btn.getAttribute('data-resolve-id');
        if (confId && this.onResolveClick) {
          btn.disabled = true;
          btn.innerText = 'Resolving...';
          this.onResolveClick(confId);
        }
      });
    });

    this.container.querySelectorAll('.alert-item-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-autofix')) return;
        const confId = card.getAttribute('data-conflict-id');
        const conflict = (this.currentConflicts || []).find(c => c.id === confId);
        if (conflict && conflict.activity_ids && conflict.activity_ids.length > 0) {
          if (window.RailOptixApp && window.RailOptixApp.timelineView && window.RailOptixApp.timelineView.onTaskClick) {
            window.RailOptixApp.timelineView.onTaskClick(conflict.activity_ids[0]);
          }
        }
      });
    });
  }
}
