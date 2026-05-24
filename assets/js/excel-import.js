/* ===================================================================
   CTG Excel Import — shared infrastructure
   -------------------------------------------------------------------
   Lets normal users paste their Excel data into any calculator
   instead of typing every row by hand. Each calculator registers a
   schema (column definitions + sample row + apply-function) with
   CTGImport.register(). The Import button on each calculator opens
   the shared modal — parses + validates + previews + applies.

   Powered by the xlsx-js-style library already loaded for the
   P&L Converter (`window.XLSX`).

   Usage from a calculator:
     CTGImport.register('po', {
       label:   'PO Cash Flow Estimator',
       sheets:  [ { name, columns, sample } … ],
       apply:   (parsed) => { mergeIntoState(parsed); rerender(); }
     });

     // Button click:
     CTGImport.open('po');
   =================================================================== */
(function(){
  if (typeof window === 'undefined') return;

  const schemas = {};          // target -> schema
  let current = null;          // { target, schema, parsed, mode }

  // ─── Public API ───────────────────────────────────────────────
  const API = {
    register(target, schema) { schemas[target] = schema; },
    open(target) {
      const schema = schemas[target];
      if (!schema) { console.error('[CTGImport] no schema for', target); return; }
      current = { target, schema, parsed: null, mode: 'replace' };
      openModal(schema);
    },
    downloadTemplate(target) {
      const schema = schemas[target] || (current && current.schema);
      if (!schema) return;
      buildAndDownloadTemplate(schema);
    }
  };

  // ─── DOM helpers ──────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.style.display = ''; }
  function hide(el) { if (el) el.style.display = 'none'; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
  }

  // ─── Modal lifecycle ──────────────────────────────────────────
  function openModal(schema) {
    const modal = $('importExcelModal');
    if (!modal) { alert('Import modal not in page'); return; }
    // Title + sheet descriptions
    $('impTitle').textContent = '📥 Import — ' + (schema.label || '');
    const sheetList = schema.sheets.map(s =>
      '<li><b>' + escapeHtml(s.name) + '</b> — '
      + s.columns.map(c =>
          escapeHtml(c.label) + (c.required ? ' <span class="imp-req">*</span>' : '')
        ).join(', ')
      + '</li>'
    ).join('');
    $('impSheetSpec').innerHTML = sheetList;
    // Reset state
    $('impFileInput').value = '';
    $('impPreview').innerHTML = '';
    $('impError').textContent = '';
    $('impError').style.display = 'none';
    $('impConfirmBtn').disabled = true;
    // Mode selector — default to replace
    if ($('impModeReplace')) $('impModeReplace').checked = true;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    const modal = $('importExcelModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    current = null;
  }

  function showError(msg) {
    const el = $('impError');
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ─── File reading + parsing ───────────────────────────────────
  async function handleFileSelect(file) {
    if (!file) return;
    if (!window.XLSX) { showError('Excel parser failed to load. Refresh the page and try again.'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb  = window.XLSX.read(buf, { type: 'array' });
      const parsed = parseWorkbook(wb, current.schema);
      current.parsed = parsed;
      renderPreview(parsed, current.schema);
      $('impConfirmBtn').disabled = parsed.errorCount > 0 || parsed.totalRows === 0;
    } catch (e) {
      console.error('[CTGImport] parse failed:', e);
      showError('Could not read this file. Make sure it\'s a valid .xlsx exported from Excel or Google Sheets.');
    }
  }

  function parseWorkbook(wb, schema) {
    const out = { sheets: {}, totalRows: 0, errorCount: 0, warnings: [] };
    schema.sheets.forEach(spec => {
      // Find matching sheet by name (case-insensitive)
      const sheetName = wb.SheetNames.find(n =>
        n.trim().toLowerCase() === spec.name.trim().toLowerCase()
      );
      if (!sheetName) {
        out.warnings.push('Sheet "' + spec.name + '" not found — skipped.');
        out.sheets[spec.name] = { rows: [], errors: [] };
        return;
      }
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        defval: '',
        raw: false   // strings come back as strings; numbers as numbers
      });
      const validated = validateRows(rows, spec);
      out.sheets[spec.name] = validated;
      out.totalRows += validated.rows.length;
      out.errorCount += validated.errors.length;
    });
    return out;
  }

  function validateRows(rawRows, spec) {
    const rows = [];
    const errors = [];
    rawRows.forEach((raw, idx) => {
      const rowNum = idx + 2;  // header is row 1
      const cleaned = {};
      let hasAny = false;
      spec.columns.forEach(col => {
        // Match column either by exact label or by key (case-insensitive trim)
        let v = raw[col.label];
        if (v === undefined || v === '') {
          for (const k in raw) {
            if (k.trim().toLowerCase() === col.label.trim().toLowerCase()
             || k.trim().toLowerCase() === col.key.toLowerCase()) {
              v = raw[k];
              break;
            }
          }
        }
        // Coerce
        if (col.type === 'number') {
          if (v === '' || v == null) v = 0;
          else {
            const n = Number(String(v).replace(/[, ]/g,''));
            v = Number.isFinite(n) ? n : NaN;
          }
        } else {
          v = (v == null) ? '' : String(v).trim();
        }
        if (v !== '' && v !== 0 && !Number.isNaN(v)) hasAny = true;
        cleaned[col.key] = v;
      });
      // Skip totally-blank rows silently
      if (!hasAny) return;
      // Validate required + types
      const rowErrors = [];
      spec.columns.forEach(col => {
        const v = cleaned[col.key];
        if (col.required && (v === '' || v === null || v === undefined)) {
          rowErrors.push(col.label + ' is required');
        }
        if (col.type === 'number' && Number.isNaN(v)) {
          rowErrors.push(col.label + ' is not a number');
        }
        if (col.type === 'number' && col.min != null && v < col.min) {
          rowErrors.push(col.label + ' must be ≥ ' + col.min);
        }
        if (col.type === 'enum' && col.values && !col.values.includes(v)) {
          rowErrors.push(col.label + ' must be one of: ' + col.values.join(' / '));
        }
      });
      if (rowErrors.length) {
        errors.push({ row: rowNum, msgs: rowErrors });
      } else {
        rows.push(cleaned);
      }
    });
    return { rows, errors };
  }

  // ─── Preview rendering ───────────────────────────────────────
  function renderPreview(parsed, schema) {
    const wrap = $('impPreview');
    let html = '';
    if (parsed.warnings.length) {
      html += '<div class="imp-warn">⚠ ' + parsed.warnings.map(escapeHtml).join('<br>⚠ ') + '</div>';
    }
    schema.sheets.forEach(spec => {
      const sh = parsed.sheets[spec.name];
      if (!sh) return;
      html += '<div class="imp-sheet-block">';
      html += '<h4>' + escapeHtml(spec.name) + ' '
            +   '<span class="imp-count">' + sh.rows.length + ' row(s) ready'
            +   (sh.errors.length ? ' · <span class="imp-err">' + sh.errors.length + ' error(s)</span>' : '')
            +   '</span></h4>';
      if (sh.errors.length) {
        html += '<div class="imp-err-list">';
        sh.errors.slice(0, 10).forEach(e => {
          html += '<div>Row ' + e.row + ': ' + escapeHtml(e.msgs.join('; ')) + '</div>';
        });
        if (sh.errors.length > 10) html += '<div>… and ' + (sh.errors.length - 10) + ' more</div>';
        html += '</div>';
      }
      if (sh.rows.length) {
        html += '<table class="imp-preview-tbl"><thead><tr>';
        spec.columns.forEach(c => { html += '<th>' + escapeHtml(c.label) + '</th>'; });
        html += '</tr></thead><tbody>';
        sh.rows.slice(0, 5).forEach(r => {
          html += '<tr>';
          spec.columns.forEach(c => {
            const v = r[c.key];
            html += '<td>' + escapeHtml(c.type === 'number' && typeof v === 'number'
              ? new Intl.NumberFormat('en-MY',{maximumFractionDigits:2}).format(v)
              : v) + '</td>';
          });
          html += '</tr>';
        });
        if (sh.rows.length > 5) {
          html += '<tr><td colspan="' + spec.columns.length + '" class="imp-more">'
                + '… and ' + (sh.rows.length - 5) + ' more row(s)</td></tr>';
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    });
    wrap.innerHTML = html;
  }

  // ─── Template generation ─────────────────────────────────────
  function buildAndDownloadTemplate(schema) {
    if (!window.XLSX) { alert('Excel library not loaded.'); return; }
    const wb = window.XLSX.utils.book_new();
    // Build an Instructions sheet first
    const instructions = [
      ['CTG Finance Hub — Import Template'],
      ['Calculator: ' + (schema.label || '')],
      ['Generated: ' + new Date().toLocaleString()],
      [],
      ['Instructions:'],
      ['1. Each sheet below corresponds to one section of the calculator.'],
      ['2. Keep the header row exactly as-is (column names are matched case-insensitively).'],
      ['3. Required columns are marked with * in the description below.'],
      ['4. Numbers can include commas (1,000) — they are parsed automatically.'],
      ['5. Delete the sample row(s) before saving your real data, OR leave them — the import preview shows what will land.'],
      ['6. Empty rows are skipped silently.'],
      []
    ];
    schema.sheets.forEach(spec => {
      instructions.push(['Sheet: ' + spec.name]);
      spec.columns.forEach(c => {
        instructions.push(['  ' + c.label + (c.required ? ' *' : ''),
                           c.type, c.help || '']);
      });
      instructions.push([]);
    });
    const inst = window.XLSX.utils.aoa_to_sheet(instructions);
    inst['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 60 }];
    window.XLSX.utils.book_append_sheet(wb, inst, 'Instructions');

    // One sheet per spec with header row + sample row(s)
    schema.sheets.forEach(spec => {
      const headers = spec.columns.map(c => c.label);
      const rows = [headers];
      const samples = Array.isArray(spec.sample) && Array.isArray(spec.sample[0])
        ? spec.sample
        : (Array.isArray(spec.sample) ? [spec.sample] : []);
      samples.forEach(s => rows.push(s));
      const ws = window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = spec.columns.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));
      window.XLSX.utils.book_append_sheet(wb, ws, spec.name);
    });

    const stamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const filename = 'ctg-import-template-' + (schema.target || 'calc') + '-' + stamp + '.xlsx';
    window.XLSX.writeFile(wb, filename);
  }

  // ─── Confirm import → call schema.apply ───────────────────────
  function confirmImport() {
    if (!current || !current.parsed) return;
    const mode = ($('impModeReplace') && $('impModeReplace').checked) ? 'replace' : 'append';
    try {
      // Pass the rows (per sheet, by key) + mode to the calculator's apply().
      const flat = {};
      Object.keys(current.parsed.sheets).forEach(k => {
        flat[k] = current.parsed.sheets[k].rows;
      });
      current.schema.apply(flat, mode);
      const total = current.parsed.totalRows;
      if (window.showToast) {
        window.showToast('✓ Imported ' + total + ' row(s) successfully', 'success');
      }
      closeModal();
    } catch (e) {
      console.error('[CTGImport] apply failed:', e);
      showError('Could not apply the imported data: ' + (e.message || e));
    }
  }

  // ─── Bind handlers once the DOM has the modal ─────────────────
  function bindOnce() {
    const file = $('impFileInput');
    if (file && !file.dataset.bound) {
      file.addEventListener('change', e => handleFileSelect(e.target.files && e.target.files[0]));
      file.dataset.bound = '1';
    }
    const conf = $('impConfirmBtn');
    if (conf && !conf.dataset.bound) {
      conf.addEventListener('click', confirmImport);
      conf.dataset.bound = '1';
    }
    const cancel = $('impCancelBtn');
    if (cancel && !cancel.dataset.bound) {
      cancel.addEventListener('click', closeModal);
      cancel.dataset.bound = '1';
    }
    const tpl = $('impDownloadBtn');
    if (tpl && !tpl.dataset.bound) {
      tpl.addEventListener('click', () => { if (current) buildAndDownloadTemplate(current.schema); });
      tpl.dataset.bound = '1';
    }
    // Backdrop / close button
    document.querySelectorAll('[data-imp-close]').forEach(el => {
      if (!el.dataset.bound) {
        el.addEventListener('click', closeModal);
        el.dataset.bound = '1';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindOnce);
  } else {
    bindOnce();
  }

  // Expose
  window.CTGImport = API;
})();
