/**
 * RailOptix Dynamic Disruption Simulator Modal
 * Simulates urgent mid-horizon track closures, broken rails, and minimal-churn re-planning.
 */
class DisruptionModalManager {
  constructor() {
    this.modal = null;
    this.form = null;
    this.resultsContainer = null;
    this.currentSimulation = null;
  }

  init() {
    this.modal = document.getElementById('modal-disruption');
    this.form = document.getElementById('form-disruption-sim');
    this.resultsContainer = document.getElementById('disruption-results-container');

    const btnOpen = document.getElementById('btn-disruption-sim');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.open());
    }

    const closeBtn = this.modal?.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.runSimulation();
      });
    }
  }

  open() {
    if (this.modal) this.modal.classList.add('open');
    if (this.resultsContainer) this.resultsContainer.innerHTML = '';
  }

  close() {
    if (this.modal) this.modal.classList.remove('open');
  }

  async runSimulation() {
    const locationId = document.getElementById('disrupt-location')?.value || 'SEC:BET:H01_H02:EB';
    const startWeek = parseInt(document.getElementById('disrupt-start-week')?.value || '16', 10);
    const endWeek = parseInt(document.getElementById('disrupt-end-week')?.value || '16', 10);
    const newCapacity = parseInt(document.getElementById('disrupt-capacity')?.value || '1', 10);
    const disruptionName = document.getElementById('disrupt-name')?.value || 'Emergency Rail Fracture';
    const injectWork = document.getElementById('disrupt-inject')?.checked ?? true;

    if (!this.resultsContainer) return;
    this.resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #93c5fd;">
        <span style="font-size: 28px; animation: spin 1s linear infinite; display: inline-block;">⚙️</span>
        <p style="margin-top: 10px; font-weight: 600;">Calculating Blast Radius & Minimal-Churn Re-plan...</p>
      </div>
    `;

    const payload = {
      location_id: locationId,
      start_week: startWeek,
      end_week: endWeek,
      new_capacity: newCapacity,
      disruption_name: disruptionName,
      inject_emergency_work: injectWork
    };

    try {
      const data = await API.simulateDisruption(payload);
      this.currentSimulation = { payload, data };
      this.renderResults(data);
    } catch (err) {
      this.resultsContainer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 14px; color: #fca5a5;">
          <strong>Error running disruption simulation:</strong> ${err.message}
        </div>
      `;
    }
  }

  renderResults(data) {
    const churn = data.churn_metrics;
    const blast = data.blast_radius;
    const postStatus = data.post_replan_status;

    const html = `
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-top: 16px;">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 10px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #f87171; display: flex; align-items: center; gap: 6px;">
              <span>💥</span>
              <span>Disruption Blast Radius: ${blast.disruption_name}</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              Target Location: <code style="color: #60a5fa;">${blast.affected_location}</code> | Weeks ${blast.disrupted_weeks.join(', ')}
            </div>
          </div>
          <span style="background: ${postStatus.feasible ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${postStatus.feasible ? '#10b981' : '#f87171'}; border: 1px solid ${postStatus.feasible ? '#10b981' : '#f87171'}; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;">
            ${postStatus.feasible ? '✔ REPLAN FEASIBLE' : '⚠️ HARD CONFLICTS'}
          </span>
        </div>

        <!-- Churn Metrics Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Displaced Accesses</div>
            <div style="font-size: 20px; font-weight: 800; color: #f87171;">${blast.displaced_accesses_count}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Schedule Churn</div>
            <div style="font-size: 20px; font-weight: 800; color: #f59e0b;">${churn.churn_percentage}%</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Untouched Work</div>
            <div style="font-size: 20px; font-weight: 800; color: #10b981;">${churn.unaffected_count}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Directly Shifted</div>
            <div style="font-size: 20px; font-weight: 800; color: #60a5fa;">${churn.directly_shifted.length}</div>
          </div>
        </div>

        <!-- Displaced Details -->
        <div style="font-size: 12px; margin-bottom: 14px;">
          <div style="font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Perturbation Summary:</div>
          <div style="color: var(--text-muted); line-height: 1.5;">
            ${blast.displaced_activities.length > 0 
              ? `Activities displaced from affected window: <strong style="color: #f1f5f9;">${blast.displaced_activities.join(', ')}</strong>. Shifted smoothly to earliest conflict-free slots with zero perturbation to remaining schedule.`
              : `Zero scheduled activities traversed this sector during weeks ${blast.disrupted_weeks.join(', ')}. Emergency inspection injected without schedule churn.`}
          </div>
        </div>

        <!-- Actions -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-disruption').classList.remove('open')">Close</button>
          <button type="button" id="btn-apply-replan" class="btn btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); font-weight: 700;">
            <span>🚀</span> Apply Minimal-Churn Re-plan to Live Schedule
          </button>
        </div>
      </div>
    `;

    this.resultsContainer.innerHTML = html;

    const btnApply = document.getElementById('btn-apply-replan');
    if (btnApply) {
      btnApply.addEventListener('click', () => this.applyReplan());
    }
  }

  async applyReplan() {
    if (!this.currentSimulation) return;
    const btn = document.getElementById('btn-apply-replan');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Applying to Timetable...';
    }

    try {
      const res = await API.applyDisruption(this.currentSimulation.payload);
      if (window.app) {
        window.app.state.requests = res.requests;
        window.app.state.conflicts = await API.getConflicts();
        window.app.refreshUI();
        window.app.showToast(res.message);
      }
      this.close();
    } catch (err) {
      alert('Error applying replan: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Apply Minimal-Churn Re-plan to Live Schedule';
      }
    }
  }
}

window.DisruptionModalManager = DisruptionModalManager;
