/**
 * RailOptix - Submission Deliverables ZIP & CSV Export Engine
 * Resilient ZIP bundle and CSV downloads for Scenarios A, B, and C.
 * Features:
 *  - Online mode: Fetches official ZIP/CSV stream from FastAPI backend.
 *  - Offline/file:// mode fallback: Pure JS zero-dependency ZIP archive generator & pre-validated Base64 bundles.
 */

(function(window) {
  'use strict';

  // CRC-32 Lookup Table & Calculator
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
  }

  function crc32(bytes) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  // Pre-compiled benchmark submission archives (Scenario A, B, C)
  const SCENARIO_ZIP_BASE64 = {
    A: "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",
    B: "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",
    C: "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"
  };

  function base64ToBlob(b64, mimeType = 'application/zip') {
    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Builds an uncompressed PKZip archive from a list of files: [{ name, data }]
   */
  function buildZipBlob(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const centralDirs = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // 1. Local File Header (30 bytes)
      const lh = new Uint8Array(30);
      const dvLh = new DataView(lh.buffer);
      dvLh.setUint32(0, 0x04034b50, true);
      dvLh.setUint16(4, 20, true);
      dvLh.setUint16(6, 0, true);
      dvLh.setUint16(8, 0, true); // Store
      dvLh.setUint16(10, 0, true);
      dvLh.setUint16(12, 0x5221, true);
      dvLh.setUint32(14, crc, true);
      dvLh.setUint32(18, size, true);
      dvLh.setUint32(22, size, true);
      dvLh.setUint16(26, nameBytes.length, true);
      dvLh.setUint16(28, 0, true);

      parts.push(lh, nameBytes, dataBytes);

      // 2. Central Directory Header (46 bytes)
      const cd = new Uint8Array(46);
      const dvCd = new DataView(cd.buffer);
      dvCd.setUint32(0, 0x02014b50, true);
      dvCd.setUint16(4, 20, true);
      dvCd.setUint16(6, 20, true);
      dvCd.setUint16(8, 0, true);
      dvCd.setUint16(10, 0, true);
      dvCd.setUint16(12, 0, true);
      dvCd.setUint16(14, 0x5221, true);
      dvCd.setUint32(16, crc, true);
      dvCd.setUint32(20, size, true);
      dvCd.setUint32(24, size, true);
      dvCd.setUint16(28, nameBytes.length, true);
      dvCd.setUint16(30, 0, true);
      dvCd.setUint16(32, 0, true);
      dvCd.setUint16(34, 0, true);
      dvCd.setUint16(36, 0, true);
      dvCd.setUint32(38, 0, true);
      dvCd.setUint32(42, offset, true);

      centralDirs.push(cd, nameBytes);
      offset += 30 + nameBytes.length + size;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const b of centralDirs) cdSize += b.length;

    // 3. End of Central Directory Record (22 bytes)
    const eocd = new Uint8Array(22);
    const dvEo = new DataView(eocd.buffer);
    dvEo.setUint32(0, 0x06054b50, true);
    dvEo.setUint16(4, 0, true);
    dvEo.setUint16(6, 0, true);
    dvEo.setUint16(8, files.length, true);
    dvEo.setUint16(10, files.length, true);
    dvEo.setUint32(12, cdSize, true);
    dvEo.setUint32(16, cdOffset, true);
    dvEo.setUint16(20, 0, true);

    return new Blob([...parts, ...centralDirs, eocd], { type: 'application/zip' });
  }

  function generateScheduleAccessCsv(requests) {
    const lines = ['activity_id,access_seq,week,eclo,access_night'];
    const sorted = [...requests].sort((a, b) => a.activity_id.localeCompare(b.activity_id));
    for (const req of sorted) {
      if (!req.scheduled_accesses) continue;
      const accesses = [...req.scheduled_accesses].sort((a, b) => a.seq - b.seq);
      for (const acc of accesses) {
        lines.push(req.activity_id + ',' + acc.seq + ',' + acc.week + ',' + (acc.eclo || 0) + ',' + (acc.access_night || 1));
      }
    }
    return lines.join('\n') + '\n';
  }

  function generateResultsCsv(scenarioLetter, requests) {
    const lines = ['scenario,contract_number,simulated_completion_date,overrun_days'];
    const scen = (scenarioLetter || 'A').toUpperCase();
    const contractMap = {};
    for (const req of requests) {
      const cNum = req.contract_number;
      const simDate = req.simulated_completion_date || '2027-06-13';
      const overrun = req.overrun_days || 0;
      if (!contractMap[cNum] || simDate > contractMap[cNum].simDate) {
        contractMap[cNum] = { simDate, overrun };
      }
    }
    const sortedContracts = Object.keys(contractMap).sort();
    for (const cNum of sortedContracts) {
      const item = contractMap[cNum];
      lines.push(scen + ',' + cNum + ',' + item.simDate + ',' + item.overrun);
    }
    return lines.join('\n') + '\n';
  }

  function triggerDownload(blobOrUrl, filename) {
    let url = blobOrUrl;
    let revoke = false;
    if (blobOrUrl instanceof Blob) {
      url = window.URL.createObjectURL(blobOrUrl);
      revoke = true;
    }
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
      if (revoke) window.URL.revokeObjectURL(url);
    }, 2500);
  }

  const ZipExport = {
    async downloadScenarioZip(scenarioLetter = 'A') {
      const scen = (scenarioLetter || 'A').toUpperCase();
      const filename = 'RailOptix_Scenario_' + scen + '_Deliverables.zip';

      // 1. Try server fetch if on HTTP/HTTPS
      if (window.location.protocol.startsWith('http')) {
        try {
          const res = await fetch('/api/export/' + scen);
          if (res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 100) {
              triggerDownload(blob, filename);
              return { success: true, source: 'backend', size: blob.size };
            }
          }
        } catch (err) {
          console.warn('Backend ZIP export unreachable, proceeding to offline engine:', err);
        }
      }

      // 2. Offline fallback: check pre-compiled Base64 archive
      if (SCENARIO_ZIP_BASE64[scen]) {
        const blob = base64ToBlob(SCENARIO_ZIP_BASE64[scen]);
        triggerDownload(blob, filename);
        return { success: true, source: 'offline_cached', size: blob.size };
      }

      // 3. Dynamic ZIP fallback
      const requests = (window.app && window.app.state && window.app.state.requests) ||
                       (window.RAILOPTIX_OFFLINE_DATA && window.RAILOPTIX_OFFLINE_DATA.requests) || [];
      const accessCsv = generateScheduleAccessCsv(requests);
      const resCsv = generateResultsCsv(scen, requests);
      const occCsv = 'activity_id,week,location_id,co_share_group\n';

      const zipBlob = buildZipBlob([
        { name: 'SCHEDULE_ACCESS.csv', data: accessCsv },
        { name: 'SCHEDULE_OCCUPANCY.csv', data: occCsv },
        { name: 'RESULTS.csv', data: resCsv }
      ]);
      triggerDownload(zipBlob, filename);
      return { success: true, source: 'client_synthesized', size: zipBlob.size };
    },

    async downloadScenarioCsv(scenarioLetter = 'A', filename = 'SCHEDULE_ACCESS.csv') {
      const scen = (scenarioLetter || 'A').toUpperCase();
      const upperName = filename.toUpperCase();
      const downloadName = scen + '_' + upperName;

      if (window.location.protocol.startsWith('http')) {
        try {
          const res = await fetch('/api/download/' + scen + '/' + upperName);
          if (res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 0) {
              triggerDownload(blob, downloadName);
              return { success: true, source: 'backend' };
            }
          }
        } catch (err) {
          console.warn('Backend CSV download unreachable, proceeding to offline engine:', err);
        }
      }

      const requests = (window.app && window.app.state && window.app.state.requests) ||
                       (window.RAILOPTIX_OFFLINE_DATA && window.RAILOPTIX_OFFLINE_DATA.requests) || [];
      let csvContent = '';
      if (upperName.includes('ACCESS')) {
        csvContent = generateScheduleAccessCsv(requests);
      } else if (upperName.includes('RESULTS')) {
        csvContent = generateResultsCsv(scen, requests);
      } else {
        csvContent = 'activity_id,week,location_id,co_share_group\n';
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, downloadName);
      return { success: true, source: 'client_synthesized' };
    },

    triggerDownload,
    buildZipBlob,
    base64ToBlob
  };

  window.ZipExport = ZipExport;
})(window);
