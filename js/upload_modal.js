/**
 * RailOptix - Hidden / Undisclosed Test Instance Upload Modal Controller
 * Enables judges to upload 8 CSV instance files or a ZIP archive,
 * validates schema live, triggers the AI scheduler, and updates the UI seamlessly.
 */

const EXPECTED_CSV_FILES = [
  '01_LINES.csv',
  '02_STATIONS.csv',
  '03_SECTORS.csv',
  '04_LOCATION_SUPPLY.csv',
  '05_BUFFER_LOCATION.csv',
  '06_PARAMETERS.csv',
  '07_PROJECT_DETAILS.csv',
  '08_ACTIVITY_DETAILS.csv'
];

let stagedFiles = new Map(); // filename -> File
window.stagedFiles = stagedFiles;

function initUploadModal() {
  const btnUpload = document.getElementById('btn-upload-instance');
  const modalUpload = document.getElementById('modal-upload-instance');
  const btnReset = document.getElementById('btn-reset-instance');
  const dropZone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');
  const btnRunSolver = document.getElementById('btn-run-uploaded-solver');
  const logsContainer = document.getElementById('upload-solver-logs');

  if (btnUpload && modalUpload) {
    btnUpload.addEventListener('click', () => {
      stagedFiles.clear();
      renderFilesChecklist();
      if (logsContainer) logsContainer.style.display = 'none';
      modalUpload.classList.add('open');
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (!confirm('Reset schedule back to the official Public Test Benchmark (54 Activities)?')) return;
      try {
        btnReset.disabled = true;
        btnReset.textContent = 'Resetting...';
        await API.resetInstance();
        await window.TrackPulseApp.refreshAll();
        updateInstanceBanner();
      } catch (err) {
        alert('Reset failed: ' + err.message);
      } finally {
        btnReset.disabled = false;
        btnReset.textContent = '↺ Reset to Public Benchmark';
      }
    });
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-blue)';
      dropZone.style.background = 'rgba(59, 130, 246, 0.08)';
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      dropZone.style.background = 'rgba(255, 255, 255, 0.02)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      dropZone.style.background = 'rgba(255, 255, 255, 0.02)';
      handleSelectedFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
      handleSelectedFiles(e.target.files);
      fileInput.value = '';
    });
  }

  if (btnRunSolver) {
    btnRunSolver.addEventListener('click', async () => {
      await executeUploadedSolver();
    });
  }

  updateInstanceBanner();
}

function handleSelectedFiles(fileList) {
  for (const file of fileList) {
    const name = file.name;
    if (name.toLowerCase().endsWith('.zip')) {
      stagedFiles.set(name, file);
    } else {
      const match = EXPECTED_CSV_FILES.find(f => f.toLowerCase() === name.toLowerCase());
      if (match) {
        stagedFiles.set(match, file);
      } else {
        stagedFiles.set(name, file);
      }
    }
  }
  renderFilesChecklist();
}

function renderFilesChecklist() {
  const container = document.getElementById('upload-files-checklist');
  const btnRun = document.getElementById('btn-run-uploaded-solver');
  if (!container) return;

  const hasZip = Array.from(stagedFiles.keys()).some(k => k.toLowerCase().endsWith('.zip'));

  let html = '';
  if (hasZip) {
    const zipName = Array.from(stagedFiles.keys()).find(k => k.toLowerCase().endsWith('.zip'));
    const zipFile = stagedFiles.get(zipName);
    html = `
      <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <strong style="color: #34d399;">📦 ZIP Archive Detected:</strong> ${zipName}
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Will automatically unpack and validate all 8 CSV files. (${(zipFile.size / 1024).toFixed(1)} KB)</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="stagedFiles.delete('${zipName}'); renderFilesChecklist();">Remove</button>
      </div>
    `;
    if (btnRun) btnRun.disabled = false;
  } else {
    let readyCount = 0;
    html = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px;">
    `;
    EXPECTED_CSV_FILES.forEach(expected => {
      const isPresent = stagedFiles.has(expected);
      if (isPresent) readyCount++;
      const file = stagedFiles.get(expected);
      const sizeStr = file ? ` (${(file.size / 1024).toFixed(1)} KB)` : '';
      html += `
        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: ${isPresent ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)'}; border: 1px solid ${isPresent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}; border-radius: 4px; font-size: 11px; font-family: 'JetBrains Mono', monospace;">
          <span style="color: ${isPresent ? '#34d399' : '#94a3b8'}; font-weight: bold;">${isPresent ? '✓' : '○'}</span>
          <span style="color: ${isPresent ? '#f1f5f9' : '#94a3b8'}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${expected}${sizeStr}</span>
        </div>
      `;
    });
    html += `</div>`;
    if (btnRun) btnRun.disabled = (readyCount !== 8);
  }

  container.innerHTML = html;
}

async function executeUploadedSolver() {
  const btnRun = document.getElementById('btn-run-uploaded-solver');
  const logsContainer = document.getElementById('upload-solver-logs');
  const modalUpload = document.getElementById('modal-upload-instance');

  const formData = new FormData();
  for (const [name, file] of stagedFiles.entries()) {
    formData.append('files', file, name);
  }

  try {
    if (btnRun) {
      btnRun.disabled = true;
      btnRun.textContent = '⏳ AI Solver Executing...';
    }
    if (logsContainer) {
      logsContainer.style.display = 'block';
      logsContainer.innerHTML = `
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.6; color: #93c5fd;">
          <div>[1/5] Ingesting files into memory and checking MIME types...</div>
          <div>[2/5] Validating schema, columns, and foreign key references...</div>
          <div>[3/5] Constructing dual-line physical topology and capacity limits...</div>
          <div>[4/5] Running topological precedence resolver and multi-workfront scheduler...</div>
          <div>[5/5] Synthesizing Scenarios A, B, C and generating deliverables...</div>
        </div>
      `;
    }

    const res = await API.uploadInstance(formData);

    if (logsContainer) {
      logsContainer.innerHTML += `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); color: #34d399; font-weight: bold;">
          🎉 SUCCESS: ${res.message}
        </div>
      `;
    }

    setTimeout(async () => {
      if (modalUpload) modalUpload.classList.remove('open');
      await window.TrackPulseApp.refreshAll();
      updateInstanceBanner();
    }, 1200);

  } catch (err) {
    if (logsContainer) {
      logsContainer.innerHTML = `
        <div style="color: #ef4444; font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: pre-wrap;">
          ❌ Validation / Solver Error:
${err.message}
        </div>
      `;
    }
  } finally {
    if (btnRun) {
      btnRun.disabled = false;
      btnRun.textContent = '⚡ Run AI Solver Live';
    }
  }
}

async function updateInstanceBanner() {
  const label = document.getElementById('active-instance-label');
  const tag = document.getElementById('active-instance-tag');
  const btnReset = document.getElementById('btn-reset-instance');

  try {
    const info = await API.getInstanceInfo();
    if (label) label.textContent = info.instance_name;
    if (tag) {
      if (info.is_benchmark) {
        tag.textContent = 'VERIFIED BENCHMARK';
        tag.style.background = 'rgba(16, 185, 129, 0.2)';
        tag.style.color = '#10b981';
      } else {
        tag.textContent = 'CUSTOM TEST INSTANCE';
        tag.style.background = 'rgba(245, 158, 11, 0.2)';
        tag.style.color = '#fbbf24';
      }
    }
    if (btnReset) {
      btnReset.style.display = info.is_benchmark ? 'none' : 'inline-block';
    }
  } catch (e) {
    console.warn('Could not fetch instance info', e);
  }
}

window.initUploadModal = initUploadModal;
window.updateInstanceBanner = updateInstanceBanner;
window.renderFilesChecklist = renderFilesChecklist;
window.executeUploadedSolver = executeUploadedSolver;
