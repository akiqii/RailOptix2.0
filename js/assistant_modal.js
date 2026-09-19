/**
 * RailOptix 2AM Works Controller AI Assistant Modal
 * Natural language querying, shift handovers, root cause analysis, and safety audits.
 */
class WorksAssistantManager {
  constructor() {
    this.modal = null;
    this.messagesContainer = null;
    this.inputEl = null;
    this.btnSend = null;
    this.isQuerying = false;
  }

  init() {
    this.modal = document.getElementById('modal-works-assistant');
    this.messagesContainer = document.getElementById('assistant-chat-history');
    this.inputEl = document.getElementById('assistant-prompt-input');
    this.btnSend = document.getElementById('btn-assistant-send');

    const btnOpen = document.getElementById('btn-works-assistant');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.open());
    }

    const closeBtn = this.modal?.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (this.btnSend && this.inputEl) {
      this.btnSend.addEventListener('click', () => this.submitPrompt());
      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitPrompt();
        }
      });
    }

    // Quick chips
    document.querySelectorAll('.assistant-quick-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const prompt = e.currentTarget.getAttribute('data-prompt');
        if (this.inputEl) {
          this.inputEl.value = prompt;
          this.submitPrompt();
        }
      });
    });
  }

  open() {
    if (this.modal) this.modal.classList.add('open');
    if (this.inputEl) this.inputEl.focus();
  }

  close() {
    if (this.modal) this.modal.classList.remove('open');
  }

  async submitPrompt() {
    if (this.isQuerying) return;
    const prompt = this.inputEl?.value?.trim();
    if (!prompt) return;

    this.inputEl.value = '';
    this.appendMessage('user', prompt);
    this.isQuerying = true;
    if (this.btnSend) this.btnSend.disabled = true;

    const loadingId = this.appendLoading();

    try {
      const activeScen = window.app?.state?.activeScenarioId || 'scenario_a_strict_supply';
      const data = await API.queryAssistant(prompt, activeScen);
      this.removeLoading(loadingId);
      const text = data.response || data.answer || 'Analysis complete.';
      this.appendMessage('assistant', text, data.title, data.data);
    } catch (err) {
      this.removeLoading(loadingId);
      this.appendMessage('assistant', `⚠️ **Error processing query:** ${err.message}`, 'Operational Alert');
    } finally {
      this.isQuerying = false;
      if (this.btnSend) this.btnSend.disabled = false;
      if (this.inputEl) this.inputEl.focus();
    }
  }

  appendMessage(role, text, title = null, structuredData = null) {
    if (!this.messagesContainer) return;
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      align-items: ${role === 'user' ? 'flex-end' : 'flex-start'};
    `;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      max-width: 88%;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      ${role === 'user' 
        ? 'background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border: 1px solid rgba(255,255,255,0.1);' 
        : 'background: #1e293b; color: #f1f5f9; border: 1px solid var(--border-color);'}
    `;

    let html = '';
    if (role === 'assistant') {
      html += `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px;">
          <span style="font-size: 14px;">🤖</span>
          <span style="font-weight: 700; color: #93c5fd; font-size: 12px;">${title || 'Works Controller AI'}</span>
          <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">2AM Operational Mode</span>
        </div>
      `;
    }

    html += this.formatMarkdown(text);
    bubble.innerHTML = html;
    msgDiv.appendChild(bubble);
    this.messagesContainer.appendChild(msgDiv);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  appendLoading() {
    if (!this.messagesContainer) return null;
    const loadId = 'load-' + Date.now();
    const loadDiv = document.createElement('div');
    loadDiv.id = loadId;
    loadDiv.style.cssText = `margin-bottom: 16px; display: flex; align-items: flex-start;`;
    loadDiv.innerHTML = `
      <div style="background: #1e293b; border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 16px; font-size: 12px; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
        <span style="animation: spin 1s linear infinite; display: inline-block;">⚙️</span>
        <span>2AM Works Controller AI inspecting topology & rosters...</span>
      </div>
    `;
    this.messagesContainer.appendChild(loadDiv);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    return loadId;
  }

  removeLoading(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  formatMarkdown(md) {
    if (!md) return '';
    let res = md
      .replace(/^### (.*$)/gim, '<div style="font-weight: 700; font-size: 13px; color: #60a5fa; margin: 8px 0 4px;">$1</div>')
      .replace(/^## (.*$)/gim, '<div style="font-weight: 800; font-size: 14px; color: #93c5fd; margin: 10px 0 6px;">$1</div>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff;">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\s*[-*]\s+(.*$)/gim, '<div style="margin-left: 12px; margin-bottom: 3px;">• $1</div>')
      .replace(/\n\n/g, '<div style="height: 8px;"></div>')
      .replace(/\n/g, '<br/>');
    return res;
  }
}

window.WorksAssistantManager = WorksAssistantManager;
