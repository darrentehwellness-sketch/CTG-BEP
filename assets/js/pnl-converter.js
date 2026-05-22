/* ============================================================
   CTG P&L CONVERTER  —  Source-Mirror Mode
   ============================================================
   Reads a P&L exported from any Malaysian accounting system
   (AutoCount, SQL Account, MYOB, Xero, generic Excel, or PDF)
   and re-emits it in a clean Excel with:
     - the EXACT account list and order from the source
     - section headers preserved
     - total rows rebuilt as SUM() formulas
     - Gross Profit / Net Profit detected and rebuilt as formulas
     - a % column added next to each value column (% of Trading Income)
     - MYR number formatting + standard column widths
   This way every entity's own COA (SKINDAE, DRSMILE, etc.) keeps
   its own structure in the output — we don't squash everything
   into one fixed template.
   ============================================================
*/
(function(global){
'use strict';

/* ---- Row-kind classification ---- */
const KIND = {
  TITLE:    'title',     // "Profit and Loss"
  ENTITY:   'entity',    // company name
  PERIOD:   'period',    // "For the month ended..."
  COLHEAD:  'colhead',   // "Account" + month names
  SECTION:  'section',   // "Trading Income", "Cost of Sales", "Operating Expenses", etc.
  ACCOUNT:  'account',   // a normal line with values
  SUBTOTAL: 'subtotal',  // "Total Trading Income", "Total Cost of Sales", ...
  GP:       'gp',        // "Gross Profit"
  NP:       'np',        // "Net Profit"
  OP:       'op',        // "Operating Profit"
  EBITDA:   'ebitda',    // "EBITDA"
  BLANK:    'blank'      // empty row (preserved for spacing)
};

/* ---- Section detector: text that introduces a group ---- */
const SECTION_RE = /^(trading income|sales revenue|revenue|cost of sales|cost of goods sold|cogs|other income|operating expenses|administrative expenses|finance (cost|income|expenses)|other expenses|less:.*$|expenses)$/i;

/* ---- Helpers ---- */
function trimLow(s){ return String(s || '').trim().toLowerCase(); }
function classifyRow(nameRaw, hasAnyValue){
  const name = trimLow(nameRaw);
  if(!name) return KIND.BLANK;
  if(/^total\s+/.test(name)) return KIND.SUBTOTAL;
  if(name === 'gross profit')   return KIND.GP;
  if(name === 'net profit' || name === 'net loss' || name === 'net profit/(loss)') return KIND.NP;
  if(name === 'operating profit' || name === 'operating profit/(loss)') return KIND.OP;
  if(name === 'ebitda') return KIND.EBITDA;
  // A short heading with no values is most likely a section header
  if(!hasAnyValue && (SECTION_RE.test(name) || name.length < 35)) return KIND.SECTION;
  return KIND.ACCOUNT;
}

function parseNumeric(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return v;
  const s = String(v).trim();
  if(!s) return null;
  // (1,234.56) → -1234.56  ;  RM 1,234.56 → 1234.56
  const cleaned = s.replace(/^rm\s*/i,'').replace(/[,\s]/g,'').replace(/^\((.*)\)$/,'-$1');
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

/* ============ EXCEL PARSER ============ */
function parseExcel(arrayBuffer){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS (xlsx) not loaded');
  const wb = XLSX.read(arrayBuffer, { type:'array', cellDates:true, cellNF:false });
  let sheetName = wb.SheetNames[0];
  for(const sn of wb.SheetNames){
    const ws = wb.Sheets[sn];
    if(ws && ws['!ref']){ sheetName = sn; break; }
  }
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, blankrows:true });

  // === Find header row (with month labels) ===
  let headerRowIdx = -1;
  const monthRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;
  for(let i=0; i<Math.min(aoa.length, 25); i++){
    const row = aoa[i] || [];
    let monthHits = 0;
    for(let j=1; j<row.length; j++){
      const v = row[j];
      if(v == null || v === '') continue;
      if(v instanceof Date){ monthHits++; continue; }
      const s = String(v);
      if(monthRe.test(s)) monthHits++;
      else if(/^\d{4}[-/]\d{1,2}/.test(s)) monthHits++;
      else if(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) monthHits++;
    }
    if(monthHits >= 1){ headerRowIdx = i; break; }
  }
  if(headerRowIdx === -1) headerRowIdx = 0;

  const headerRow = aoa[headerRowIdx] || [];

  // === Detect month columns ===
  const monthCols = [];   // { col, label }
  for(let j=1; j<headerRow.length; j++){
    const v = headerRow[j];
    if(v == null || v === '') continue;
    let label = '';
    if(v instanceof Date){
      label = v.toLocaleString('en-US', { month:'short', year:'numeric' });
    } else {
      label = String(v).trim();
    }
    if(!label) continue;
    if(/^%$/.test(label)) continue;
    if(/^variance$|^var\.?$|^change$|^diff(erence)?$/i.test(label)) continue;
    if(/^ytd\s*%$/i.test(label)) continue;
    monthCols.push({ col: j, label });
  }
  // Fallback: numeric-column detection if strict scan found nothing
  if(monthCols.length === 0){
    for(let j=1; j<headerRow.length; j++){
      const v = headerRow[j];
      if(v == null || v === '') continue;
      const label = String(v).trim();
      if(!label || label === '%') continue;
      let nNum=0, nData=0;
      for(let i=headerRowIdx+1; i<Math.min(aoa.length, headerRowIdx + 40); i++){
        const cv = (aoa[i] || [])[j];
        if(cv == null || cv === '') continue;
        nData++;
        if(parseNumeric(cv) != null) nNum++;
      }
      if(nData >= 3 && nNum / nData > 0.6) monthCols.push({ col: j, label });
    }
  }
  if(monthCols.length === 0){
    throw new Error('No month/period columns detected. Your source file must have month labels (e.g. "Jan 2026") in a header row.');
  }

  // === Extract title block (rows above header) ===
  let title = '', entity = '', period = '';
  for(let i=0; i<headerRowIdx; i++){
    const r = aoa[i] || [];
    const v = String(r[0] || '').trim();
    if(!v) continue;
    if(/^profit\s+and\s+loss/i.test(v) || /^income\s+statement/i.test(v) || v.toLowerCase() === 'p&l') title = v;
    else if(/(sdn\s+bhd|berhad|ltd|pte|inc|llp|gmbh|enterprise|trading)/i.test(v)) entity = v;
    else if(/^for\s+(the|month|year|period)|^as\s+at|^period|^year\s+ended/i.test(v) || /^\d/.test(v)) period = v;
    else if(!entity) entity = v;
    else if(!period) period = v;
  }

  // === Extract data rows preserving order + structure ===
  const items = [];  // { kind, name, values: [...] | null }
  for(let i=headerRowIdx+1; i<aoa.length; i++){
    const row = aoa[i] || [];
    const name = (row[0] == null ? '' : String(row[0])).trim();
    const values = monthCols.map(mc => parseNumeric(row[mc.col]));
    const hasAnyValue = values.some(v => v != null && v !== 0);
    if(!name && !hasAnyValue){
      // Pure blank row — preserve only if surrounded by data (skip trailing blanks)
      items.push({ kind: KIND.BLANK, name: '', values: null });
      continue;
    }
    const kind = classifyRow(name, hasAnyValue);
    items.push({ kind, name, values });
  }
  // Trim trailing blanks
  while(items.length && items[items.length-1].kind === KIND.BLANK) items.pop();

  return {
    title:  title  || 'Profit and Loss',
    entity: entity || '',
    period: period || '',
    months: monthCols.map(mc => mc.label),
    items
  };
}

/* ============ PDF PARSER ============ */
async function parsePdf(arrayBuffer){
  if(typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for(let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pageHeight = page.view[3];
    for(const item of tc.items){
      const tx = item.transform;
      const x = tx[4];
      const y = pageHeight - tx[5];
      const text = (item.str || '').trim();
      if(!text) continue;
      let line = lines.find(L => Math.abs(L.y - y) < 3 && L.page === p);
      if(!line){ line = { page:p, y, items:[] }; lines.push(line); }
      line.items.push({ x, text });
    }
  }
  lines.sort((a,b) => a.page - b.page || a.y - b.y);
  lines.forEach(L => L.items.sort((a,b) => a.x - b.x));

  // Find header line with month tokens
  const monthTokenRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*\-?\s*\d{2,4}|\d{4}\-\d{2}|q[1-4]\s*\d{2,4}|ytd|fy\d{2,4}/i;
  let headerLineIdx = -1;
  for(let i=0;i<lines.length;i++){
    let dateLike = 0;
    lines[i].items.forEach(it => { if(monthTokenRe.test(it.text)) dateLike++; });
    if(dateLike >= 1){ headerLineIdx = i; break; }
  }
  if(headerLineIdx === -1) throw new Error('Could not find a header row with month labels in the PDF');

  const headerLine = lines[headerLineIdx];
  const monthCols = [];
  headerLine.items.forEach(it => {
    if(monthTokenRe.test(it.text)) monthCols.push({ label: it.text, x: it.x });
  });
  if(monthCols.length === 0) throw new Error('No month columns detected in header');

  // Title block from lines above the header
  let title = '', entity = '', period = '';
  for(let i=0;i<headerLineIdx;i++){
    const txt = lines[i].items.map(it => it.text).join(' ').trim();
    if(!txt) continue;
    if(/^profit\s+and\s+loss/i.test(txt) || /^income\s+statement/i.test(txt)) title = txt;
    else if(/(sdn\s+bhd|berhad|ltd|pte|inc|llp|gmbh)/i.test(txt)) entity = txt;
    else if(/^for\s+(the|month|year|period)|^as\s+at|^year\s+ended/i.test(txt)) period = txt;
    else if(!entity) entity = txt;
    else if(!period) period = txt;
  }

  // Walk data lines
  const items = [];
  const numRe = /^\(?-?[\d,]+\.?\d*\)?$/;
  for(let i=headerLineIdx+1; i<lines.length; i++){
    const L = lines[i];
    const nameParts = [];
    const vals = new Array(monthCols.length).fill(null);
    let hitNumeric = false;
    for(const it of L.items){
      if(numRe.test(it.text)){
        hitNumeric = true;
        let bestIdx = 0, bestD = Infinity;
        for(let m=0;m<monthCols.length;m++){
          const d = Math.abs(monthCols[m].x - it.x);
          if(d < bestD){ bestD = d; bestIdx = m; }
        }
        const n = parseNumeric(it.text);
        if(n != null) vals[bestIdx] = n;
      } else if(!hitNumeric){
        nameParts.push(it.text);
      }
    }
    const name = nameParts.join(' ').trim();
    if(!name && vals.every(v => v == null)) continue;
    const hasAny = vals.some(v => v != null && v !== 0);
    const kind = classifyRow(name, hasAny);
    items.push({ kind, name, values: vals });
  }

  return {
    title:  title  || 'Profit and Loss',
    entity: entity || '',
    period: period || '',
    months: monthCols.map(mc => mc.label),
    items
  };
}

/* ============ OUTPUT BUILDER ============
   Writes an xlsx where the layout matches the SKINDAE/DRSMILE
   convention exactly:
     - Row 1: "Profit and Loss"
     - Row 2: entity name
     - Row 3: period description
     - Row 4: column headers — "Account" | Month1 | "%" | Month2 | "%" | ...
     - Following rows: section headers + accounts + totals + GP + NP
*/
function buildOutputWorkbook({ source, entityOverride }){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
  const { title, entity, period, months, items } = source;
  const monthCount = months.length;
  const entityName = (entityOverride && entityOverride.trim()) || entity || '';

  // === Column layout ===
  const COL_WIDTHS = [{ wch: 60 }];
  for(let i=0; i<monthCount; i++){
    COL_WIDTHS.push({ wch: 18 });   // value
    COL_WIDTHS.push({ wch: 9 });    // %
    if(i < monthCount - 1) COL_WIDTHS.push({ wch: 2.5 });  // spacer
  }
  const totalCols = 1 + monthCount * 3 - (monthCount > 0 ? 1 : 0);
  const valueColIdx = (m) => 1 + m * 3;
  const pctColIdx   = (m) => 2 + m * 3;
  const colLetter = (n) => {
    let s = ''; n = n + 1;
    while(n > 0){ const k = (n-1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n-1)/26); }
    return s;
  };

  // === Build aoa ===
  const aoa = [];
  const empty = () => new Array(totalCols).fill(null);
  const push = (row) => { aoa.push(row); return aoa.length; };  // returns 1-indexed sheet row

  // Rows 1-3: title block
  const r1 = empty(); r1[0] = title || 'Profit and Loss'; push(r1);
  const r2 = empty(); r2[0] = entityName;                  push(r2);
  const r3 = empty(); r3[0] = period ||
    (months.length > 1 ? ('From ' + months[months.length-1] + ' to ' + months[0])
                       : ('For the period ' + (months[0] || '')));
  push(r3);
  // Row 4: column headers
  const r4 = empty();
  r4[0] = 'Account';
  for(let m=0; m<monthCount; m++){
    r4[valueColIdx(m)] = months[m];
    r4[pctColIdx(m)] = '%';
  }
  push(r4);

  // === Walk items, building section ranges so totals can SUM ===
  // We treat each SECTION header as starting a new account-range.
  // SUBTOTAL/GP/NP/OP/EBITDA close the current range.
  const sectionRanges = [];  // array of { sectionRow, firstAcctRow, lastAcctRow, sectionName, totalRow }
  let cur = null;
  const beginSection = (sectionRow, name) => {
    cur = { sectionRow, firstAcctRow: null, lastAcctRow: null, sectionName: name, totalRow: null };
    sectionRanges.push(cur);
  };
  // Identify Trading Income subtotal for % denominator
  let tradingIncomeTotalRow = null;
  let costOfSalesTotalRow   = null;
  let otherIncomeTotalRow   = null;
  let operatingExpensesTotalRow = null;
  let grossProfitRow = null;
  let operatingProfitRow = null;
  let netProfitRow   = null;

  items.forEach(item => {
    if(item.kind === KIND.BLANK){
      // Preserve blank row for spacing
      push(empty());
      return;
    }
    const row = empty();
    if(item.kind === KIND.SECTION){
      row[0] = item.name;
      const rowIdx = push(row);
      beginSection(rowIdx, item.name);
      return;
    }
    if(item.kind === KIND.ACCOUNT){
      row[0] = '    ' + item.name;
      for(let m=0; m<monthCount; m++){
        const v = item.values && item.values[m];
        row[valueColIdx(m)] = (v == null) ? 0 : v;
      }
      const rowIdx = push(row);
      if(cur){
        if(cur.firstAcctRow == null) cur.firstAcctRow = rowIdx;
        cur.lastAcctRow = rowIdx;
      }
      return;
    }
    if(item.kind === KIND.SUBTOTAL){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        if(cur && cur.firstAcctRow && cur.lastAcctRow){
          const c = colLetter(valueColIdx(m));
          row[valueColIdx(m)] = { f: 'SUM(' + c + cur.firstAcctRow + ':' + c + cur.lastAcctRow + ')' };
        } else {
          // No accounts seen — fall back to literal value from source
          const v = item.values && item.values[m];
          row[valueColIdx(m)] = (v == null) ? 0 : v;
        }
      }
      const rowIdx = push(row);
      if(cur) cur.totalRow = rowIdx;
      // Remember commonly-referenced totals by section name
      const low = item.name.toLowerCase();
      if(/trading income|sales\s+revenue|^total\s+revenue$/i.test(low))     tradingIncomeTotalRow = rowIdx;
      else if(/cost of sales|cost of goods|cogs/i.test(low))                costOfSalesTotalRow = rowIdx;
      else if(/other income/i.test(low))                                    otherIncomeTotalRow = rowIdx;
      else if(/operating expense|administrative expense|expenses?$/i.test(low)) operatingExpensesTotalRow = rowIdx;
      cur = null;  // close the section
      return;
    }
    if(item.kind === KIND.GP){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        if(tradingIncomeTotalRow && costOfSalesTotalRow){
          row[valueColIdx(m)] = { f: c + tradingIncomeTotalRow + '-' + c + costOfSalesTotalRow };
        } else {
          const v = item.values && item.values[m];
          row[valueColIdx(m)] = (v == null) ? 0 : v;
        }
      }
      const rowIdx = push(row);
      grossProfitRow = rowIdx;
      cur = null;
      return;
    }
    if(item.kind === KIND.OP){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        // OP = GP + Other Income - Operating Expenses
        const parts = [];
        if(grossProfitRow) parts.push(c + grossProfitRow);
        if(otherIncomeTotalRow) parts.push('+' + c + otherIncomeTotalRow);
        if(operatingExpensesTotalRow) parts.push('-' + c + operatingExpensesTotalRow);
        if(parts.length > 0){
          row[valueColIdx(m)] = { f: parts.join('') };
        } else {
          const v = item.values && item.values[m];
          row[valueColIdx(m)] = (v == null) ? 0 : v;
        }
      }
      const rowIdx = push(row);
      operatingProfitRow = rowIdx;
      cur = null;
      return;
    }
    if(item.kind === KIND.NP){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        // If we already computed Operating Profit, NP = OP (or use the same formula).
        // Otherwise compute NP = GP + Other Income - Operating Expenses
        const parts = [];
        if(operatingProfitRow){
          parts.push(c + operatingProfitRow);
        } else {
          if(grossProfitRow) parts.push(c + grossProfitRow);
          if(otherIncomeTotalRow) parts.push('+' + c + otherIncomeTotalRow);
          if(operatingExpensesTotalRow) parts.push('-' + c + operatingExpensesTotalRow);
        }
        if(parts.length > 0){
          row[valueColIdx(m)] = { f: parts.join('') };
        } else {
          const v = item.values && item.values[m];
          row[valueColIdx(m)] = (v == null) ? 0 : v;
        }
      }
      const rowIdx = push(row);
      netProfitRow = rowIdx;
      cur = null;
      return;
    }
    if(item.kind === KIND.EBITDA){
      // Keep as literal — we don't try to derive EBITDA
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const v = item.values && item.values[m];
        row[valueColIdx(m)] = (v == null) ? 0 : v;
      }
      push(row);
      cur = null;
      return;
    }
    // Fallback — should not happen
    row[0] = item.name;
    for(let m=0; m<monthCount; m++){
      const v = item.values && item.values[m];
      row[valueColIdx(m)] = (v == null) ? 0 : v;
    }
    push(row);
  });

  // === Second pass: % formulas (divide by Trading Income total) ===
  if(tradingIncomeTotalRow){
    for(let r = 5; r <= aoa.length; r++){
      const row = aoa[r-1];
      if(!row) continue;
      // Skip if the value cell is null (section header or blank row)
      if(row[valueColIdx(0)] == null) continue;
      for(let m=0; m<monthCount; m++){
        const vc = colLetter(valueColIdx(m));
        const valRef = vc + r;
        const totalRef = vc + tradingIncomeTotalRow;
        row[pctColIdx(m)] = { f: 'IFERROR(' + valRef + '/' + totalRef + ',0)' };
      }
    }
  }

  // === Build SheetJS worksheet ===
  const ws = XLSX.utils.aoa_to_sheet([], { dateNF:'yyyy-mm-dd' });
  const PCT_COLS = new Set();
  for(let m=0; m<monthCount; m++) PCT_COLS.add(pctColIdx(m));

  for(let r=0; r<aoa.length; r++){
    const rowVals = aoa[r];
    for(let c=0; c<rowVals.length; c++){
      const v = rowVals[c];
      if(v == null) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      if(typeof v === 'object' && v.f){
        const z = PCT_COLS.has(c) ? '0.0%;(0.0%);"-"' : '#,##0.00;(#,##0.00);"-"';
        ws[addr] = { t:'n', f: v.f, z };
      } else if(typeof v === 'number'){
        ws[addr] = { t:'n', v, z:'#,##0.00;(#,##0.00);"-"' };
      } else {
        ws[addr] = { t:'s', v: String(v) };
      }
    }
  }
  ws['!ref']  = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1, c:totalCols-1} });
  ws['!cols'] = COL_WIDTHS;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Profit and Loss');
  return wb;
}

/* ============ HIGH-LEVEL convert() ============ */
async function convertFile(file, entityName){
  const arrayBuffer = await file.arrayBuffer();
  const fname = (file.name || '').toLowerCase();
  let source;
  if(fname.endsWith('.pdf')){
    source = await parsePdf(arrayBuffer);
  } else {
    source = parseExcel(arrayBuffer);
  }
  if(!source || !source.items || source.items.length === 0){
    throw new Error('No data rows detected in the file. Please check the format.');
  }
  const wb = buildOutputWorkbook({ source, entityOverride: entityName });
  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  // Build a friendly report
  const tally = { sections: 0, accounts: 0, subtotals: 0, gp: 0, np: 0, op: 0, ebitda: 0, blank: 0 };
  source.items.forEach(it => {
    if(it.kind === KIND.SECTION)  tally.sections++;
    if(it.kind === KIND.ACCOUNT)  tally.accounts++;
    if(it.kind === KIND.SUBTOTAL) tally.subtotals++;
    if(it.kind === KIND.GP)       tally.gp++;
    if(it.kind === KIND.NP)       tally.np++;
    if(it.kind === KIND.OP)       tally.op++;
    if(it.kind === KIND.EBITDA)   tally.ebitda++;
    if(it.kind === KIND.BLANK)    tally.blank++;
  });

  return {
    blob,
    report: {
      months:      source.months,
      entity:      source.entity,
      sections:    tally.sections,
      accounts:    tally.accounts,
      subtotals:   tally.subtotals,
      computed:    tally.gp + tally.np + tally.op + tally.ebitda
    }
  };
}

// Expose
global.CTGPnLConverter = {
  convertFile,
  parseExcel,
  parsePdf,
  buildOutputWorkbook,
  classifyRow,
  KIND
};

})(window);
