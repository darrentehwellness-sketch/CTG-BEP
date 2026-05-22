/* ============================================================
   CTG WITHHOLDING TAX CALCULATOR
   ============================================================
   Mirrors the SKINDAE methodology from the reference PDF:
     • Each payee has many invoice "receipts" (lines)
     • Each receipt's GROSS amount is SST-inclusive @ 8%
     • Reverse-calc: Net = Gross / 1.08    SST = Gross − Net
     • WHT base = Σ Net (NOT gross — SST excluded per LHDN PR 11/2018)
     • WHT % depends on payee Country (DTA) × ITA Section
       (Royalty / Interest / Technical / Contract)
     • Late penalty = 10% × WHT  (toggle)
     • Multi-payee → ONE master summary + per-payee detail
     • Currency: MYR only
   ============================================================
*/
(function(global){
'use strict';

/* ============ ITA SECTIONS (LHDN PAYMENT CODES) ============ */
const WHT_SECTIONS = {
  royalty:    { label:'Section 109 (Royalty)',                     code:162, defaultRate:10 },
  interest:   { label:'Section 109 (Interest)',                    code:153, defaultRate:15 },
  technical:  { label:'Section 109B / 4A (Special Classes / Technical Services)', code:152, defaultRate:10 },
  contract:   { label:'Section 107A (Contract Payment to Non-Resident)',          code:151, defaultRate:13 }
};

/* ============ DTA RATES TABLE ============
   For each country, the WHT rate under each ITA section per Malaysia's DTA.
   "—" means use the default non-DTA rate. Add more rows as needed. */
const DTA_RATES = {
  // country code: [royalty, interest, technical, contract]
  // (no DTA fallback uses ITA defaults: 10 / 15 / 10 / 13)
  'No DTA / Other':      { royalty:10, interest:15, technical:10, contract:13 },
  'Ireland':             { royalty:8,  interest:10, technical:10, contract:13 },
  'Singapore':           { royalty:8,  interest:10, technical:5,  contract:13 },
  'United States':       { royalty:10, interest:15, technical:10, contract:13 },  // no DTA
  'United Kingdom':      { royalty:8,  interest:10, technical:8,  contract:13 },
  'China':               { royalty:10, interest:10, technical:10, contract:13 },
  'Japan':               { royalty:10, interest:10, technical:10, contract:13 },
  'Australia':           { royalty:10, interest:15, technical:10, contract:13 },
  'India':               { royalty:10, interest:10, technical:10, contract:13 },
  'Indonesia':           { royalty:10, interest:15, technical:5,  contract:13 },
  'South Korea':         { royalty:10, interest:15, technical:10, contract:13 },
  'Hong Kong':           { royalty:8,  interest:10, technical:5,  contract:13 },
  'Netherlands':         { royalty:8,  interest:10, technical:8,  contract:13 },
  'Germany':             { royalty:7,  interest:10, technical:7,  contract:13 },
  'Thailand':            { royalty:10, interest:15, technical:10, contract:13 },
  'Vietnam':             { royalty:10, interest:10, technical:10, contract:13 },
  'Taiwan':              { royalty:10, interest:10, technical:7.5,contract:13 },
  'France':              { royalty:10, interest:15, technical:10, contract:13 },
  'Italy':               { royalty:10, interest:15, technical:10, contract:13 },
  'Switzerland':         { royalty:10, interest:10, technical:10, contract:13 },
  'Canada':              { royalty:10, interest:15, technical:10, contract:13 },
  'Philippines':         { royalty:15, interest:15, technical:10, contract:13 },
  'United Arab Emirates':{ royalty:10, interest:5,  technical:10, contract:13 },
  'New Zealand':         { royalty:10, interest:15, technical:10, contract:13 },
  'Pakistan':            { royalty:10, interest:15, technical:10, contract:13 },
  'Bangladesh':          { royalty:10, interest:15, technical:10, contract:13 },
  'Sri Lanka':           { royalty:10, interest:10, technical:10, contract:13 },
  'Saudi Arabia':        { royalty:8,  interest:5,  technical:8,  contract:13 },
  'Russia':              { royalty:10, interest:15, technical:10, contract:13 }
};

const COUNTRY_LIST = Object.keys(DTA_RATES);

/* ============ HELPERS ============ */
function rateForCountrySection(country, section){
  const r = DTA_RATES[country] || DTA_RATES['No DTA / Other'];
  return r[section] != null ? r[section] : (WHT_SECTIONS[section] || {}).defaultRate || 10;
}

function fmt(n){
  if(n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function round2(n){ return Math.round(Number(n) * 100) / 100; }

/* ============ CORE CALCULATION ============
   For ONE payee with N receipts:
     For each receipt:  net = gross / (1 + sst%);  sstAmount = gross − net
     Subtotal: Σ net, Σ sstAmount, Σ gross
     WHT      = Σ net × whtRate%
     Penalty  = 10% × WHT  (if late toggle)
     Payable  = WHT + Penalty
*/
function calcReceipt(grossAmount, sstRate){
  const gross = Number(grossAmount) || 0;
  const sstPct = (Number(sstRate) || 0) / 100;
  const net  = sstPct > 0 ? gross / (1 + sstPct) : gross;
  const sst  = gross - net;
  return { gross: round2(gross), net: round2(net), sst: round2(sst) };
}

function calcPayee(payee){
  const sstRate = Number(payee.sstInclusive ? (payee.sstRate || 8) : 0);
  const whtRate = Number(payee.whtRate || 0);
  const lines = (payee.lines || []).map(L => {
    const r = calcReceipt(L.gross || 0, sstRate);
    return { date: L.date || '', receiptNo: L.receiptNo || '', ...r };
  });
  const subtotal = lines.reduce((acc, L) => ({
    gross: acc.gross + L.gross,
    net:   acc.net   + L.net,
    sst:   acc.sst   + L.sst
  }), { gross:0, net:0, sst:0 });
  subtotal.gross = round2(subtotal.gross);
  subtotal.net   = round2(subtotal.net);
  subtotal.sst   = round2(subtotal.sst);
  const wht     = round2(subtotal.net * whtRate / 100);
  const penalty = payee.latePenalty ? round2(wht * 0.10) : 0;
  const payable = round2(wht + penalty);
  return { lines, subtotal, wht, penalty, payable };
}

function calcSession(session){
  const payees = (session.payees || []).map(p => {
    const calc = calcPayee(p);
    return { ...p, _calc: calc };
  });
  const grandWht     = round2(payees.reduce((s,p) => s + p._calc.wht, 0));
  const grandPenalty = round2(payees.reduce((s,p) => s + p._calc.penalty, 0));
  const grandPayable = round2(payees.reduce((s,p) => s + p._calc.payable, 0));
  const grandNet     = round2(payees.reduce((s,p) => s + p._calc.subtotal.net, 0));
  const grandSst     = round2(payees.reduce((s,p) => s + p._calc.subtotal.sst, 0));
  const grandGross   = round2(payees.reduce((s,p) => s + p._calc.subtotal.gross, 0));
  return { payees, totals: { wht: grandWht, penalty: grandPenalty, payable: grandPayable, net: grandNet, sst: grandSst, gross: grandGross } };
}

/* ============ EXCEL EXPORT ============
   Two-sheet structure mirroring the SKINDAE reference:
     Sheet 1 "Master Summary" — list all payees with WHT
     Sheet 2+ — one per payee, with all receipt lines + subtotal + WHT calc */
function buildWorkbook(session){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS (xlsx) not loaded');
  const result = calcSession(session);

  const FONT_TITLE = { name:'Calibri', sz:14, color:{ rgb:'1F3A5F' }, bold:true };
  const FONT_SUB   = { name:'Calibri', sz:11, color:{ rgb:'333333' } };
  const FONT_BOLD  = { name:'Calibri', sz:10, color:{ rgb:'000000' }, bold:true };
  const FONT_BASE  = { name:'Calibri', sz:10, color:{ rgb:'333333' } };
  const FONT_COL   = { name:'Calibri', sz:9,  color:{ rgb:'FFFFFF' }, bold:true };
  const FILL_HEADER = { fgColor:{ rgb:'1F3A5F' } };
  const FILL_TOTAL  = { fgColor:{ rgb:'FFF3CD' } };
  const FILL_HILITE = { fgColor:{ rgb:'D4EDDA' } };
  const BORDER_THIN = {
    top:    { style:'thin', color:{ rgb:'000000' } },
    bottom: { style:'thin', color:{ rgb:'000000' } },
    left:   { style:'thin', color:{ rgb:'000000' } },
    right:  { style:'thin', color:{ rgb:'000000' } }
  };
  const ALIGN_LEFT  = { horizontal:'left',   vertical:'center' };
  const ALIGN_RIGHT = { horizontal:'right',  vertical:'center' };
  const ALIGN_CENTER = { horizontal:'center', vertical:'center' };

  const NUM_FMT = '#,##0.00;[Red](#,##0.00);"-"';
  const PCT_FMT = '0.0%;[Red](0.0%);"-"';

  const wb = XLSX.utils.book_new();
  const payerName = session.payerName || '';
  const payerTin  = session.payerTin  || '';
  const period    = session.period    || '';
  const preparedBy = session.preparedBy || '';

  // ---- helper to write a cell with style ----
  function setCell(ws, addr, value, opts){
    opts = opts || {};
    const isNum = typeof value === 'number';
    const cell = { t: isNum ? 'n' : 's', v: value };
    if(opts.f) cell.f = opts.f;
    if(opts.z) cell.z = opts.z;
    if(opts.s) cell.s = opts.s;
    ws[addr] = cell;
  }

  // ============ Sheet 1: Master Summary ============
  const ws1 = {};
  // Row 1: Company + TIN
  setCell(ws1, 'A1', payerName + (payerTin ? ' (TIN: ' + payerTin + ')' : ''), { s:{ font:FONT_TITLE, alignment:ALIGN_LEFT } });
  // Row 2: Title
  setCell(ws1, 'A2', 'WITHHOLDING TAX SUMMARY', { s:{ font:{ name:'Calibri', sz:12, bold:true, color:{ rgb:'1F3A5F' } }, alignment:ALIGN_LEFT } });
  // Row 3: Period
  setCell(ws1, 'A3', 'PERIOD : ' + period, { s:{ font:FONT_SUB, alignment:ALIGN_LEFT } });
  // Row 5: header row
  const headers = ['No', 'Date', 'Payee', 'Foreign Country', 'ITA Section', 'Subtotal (Net)', 'Tax Rate', 'WHT'];
  headers.forEach((h, i) => {
    const c = XLSX.utils.encode_cell({ r:4, c:i });
    setCell(ws1, c, h, { s:{ font:FONT_COL, fill:FILL_HEADER, alignment:ALIGN_CENTER, border:BORDER_THIN } });
  });
  // Data rows
  result.payees.forEach((p, idx) => {
    const r = 5 + idx;
    const sec = WHT_SECTIONS[p.section] || {};
    setCell(ws1, XLSX.utils.encode_cell({ r, c:0 }), idx+1,                                          { s:{ font:FONT_BASE, alignment:ALIGN_CENTER, border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:1 }), p.dateRange || '',                              { s:{ font:FONT_BASE, alignment:ALIGN_LEFT,   border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:2 }), p.name || '',                                   { s:{ font:FONT_BASE, alignment:ALIGN_LEFT,   border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:3 }), p.country || '',                                { s:{ font:FONT_BASE, alignment:ALIGN_LEFT,   border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:4 }), sec.label || p.section || '',                   { s:{ font:FONT_BASE, alignment:ALIGN_LEFT,   border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:5 }), p._calc.subtotal.net,                           { z:NUM_FMT, s:{ font:FONT_BASE, alignment:ALIGN_RIGHT,  border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:6 }), (Number(p.whtRate)||0) / 100,                   { z:PCT_FMT, s:{ font:FONT_BASE, alignment:ALIGN_CENTER, border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r, c:7 }), p._calc.wht,                                    { z:NUM_FMT, s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT,  border:BORDER_THIN } });
  });
  // Total row
  const totalR = 5 + result.payees.length;
  setCell(ws1, XLSX.utils.encode_cell({ r:totalR, c:6 }), 'Total', { s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
  setCell(ws1, XLSX.utils.encode_cell({ r:totalR, c:7 }), result.totals.wht, { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
  // Penalty row (if any payee has it)
  let nextR = totalR + 1;
  if(result.totals.penalty > 0){
    setCell(ws1, XLSX.utils.encode_cell({ r:nextR, c:6 }), 'Penalty (10%)', { s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r:nextR, c:7 }), result.totals.penalty, { z:NUM_FMT, s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    nextR++;
    setCell(ws1, XLSX.utils.encode_cell({ r:nextR, c:6 }), 'Total Payable', { s:{ font:FONT_BOLD, fill:FILL_HILITE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws1, XLSX.utils.encode_cell({ r:nextR, c:7 }), result.totals.payable, { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_HILITE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    nextR++;
  }
  // Prepared by row
  if(preparedBy){
    setCell(ws1, XLSX.utils.encode_cell({ r:nextR+1, c:0 }), 'Prepared by : ' + preparedBy, { s:{ font:FONT_SUB, alignment:ALIGN_LEFT } });
  }
  // Set range and column widths
  ws1['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:nextR+2, c:7} });
  ws1['!cols'] = [
    { wch:4 }, { wch:22 }, { wch:30 }, { wch:18 }, { wch:32 }, { wch:14 }, { wch:10 }, { wch:14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Master Summary');

  // ============ Sheet 2+: per-payee detail ============
  result.payees.forEach((p, idx) => {
    const ws = {};
    const sec = WHT_SECTIONS[p.section] || {};
    setCell(ws, 'A1', payerName + (payerTin ? ' (TIN: ' + payerTin + ')' : ''), { s:{ font:FONT_TITLE, alignment:ALIGN_LEFT } });
    setCell(ws, 'A2', 'WITHHOLDING TAX SUMMARY', { s:{ font:{ name:'Calibri', sz:12, bold:true, color:{ rgb:'1F3A5F' } }, alignment:ALIGN_LEFT } });
    setCell(ws, 'A4', 'PAYEE : ' + (p.name || ''), { s:{ font:FONT_BOLD, alignment:ALIGN_LEFT } });
    if(p.foreignTin) setCell(ws, 'D4', p.foreignTin, { s:{ font:FONT_SUB, alignment:ALIGN_LEFT } });
    setCell(ws, 'F4', p.country || '', { s:{ font:FONT_SUB, alignment:ALIGN_LEFT } });
    setCell(ws, 'A5', 'PERIOD : ' + (p.dateRange || period), { s:{ font:FONT_BOLD, alignment:ALIGN_LEFT } });
    setCell(ws, 'A6', 'ITA SECTION : ' + (sec.label || p.section || '') + ' · Payment Code ' + (sec.code || ''), { s:{ font:FONT_SUB, alignment:ALIGN_LEFT } });

    const headers2 = ['No', 'Payment Date', 'Receipt No', 'Amount (Net)', (Number(p.sstInclusive?p.sstRate:0)||0) + '% SST', 'Total (Gross)'];
    headers2.forEach((h, i) => {
      const c = XLSX.utils.encode_cell({ r:7, c:i });
      setCell(ws, c, h, { s:{ font:FONT_COL, fill:FILL_HEADER, alignment:ALIGN_CENTER, border:BORDER_THIN } });
    });
    p._calc.lines.forEach((L, li) => {
      const r = 8 + li;
      setCell(ws, XLSX.utils.encode_cell({ r, c:0 }), li+1,           { s:{ font:FONT_BASE, alignment:ALIGN_CENTER, border:BORDER_THIN } });
      setCell(ws, XLSX.utils.encode_cell({ r, c:1 }), L.date || '',   { s:{ font:FONT_BASE, alignment:ALIGN_CENTER, border:BORDER_THIN } });
      setCell(ws, XLSX.utils.encode_cell({ r, c:2 }), L.receiptNo,    { s:{ font:FONT_BASE, alignment:ALIGN_CENTER, border:BORDER_THIN } });
      setCell(ws, XLSX.utils.encode_cell({ r, c:3 }), L.net,          { z:NUM_FMT, s:{ font:FONT_BASE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
      setCell(ws, XLSX.utils.encode_cell({ r, c:4 }), L.sst,          { z:NUM_FMT, s:{ font:FONT_BASE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
      setCell(ws, XLSX.utils.encode_cell({ r, c:5 }), L.gross,        { z:NUM_FMT, s:{ font:FONT_BASE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    });
    const subR = 8 + p._calc.lines.length;
    setCell(ws, XLSX.utils.encode_cell({ r:subR, c:2 }), 'Subtotal', { s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR, c:3 }), p._calc.subtotal.net,   { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR, c:4 }), p._calc.subtotal.sst,   { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR, c:5 }), p._calc.subtotal.gross, { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_TOTAL, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    // WHT block
    setCell(ws, XLSX.utils.encode_cell({ r:subR+1, c:2 }), 'WHT Tax Rate',   { s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+1, c:3 }), (Number(p.whtRate)||0)/100, { z:PCT_FMT, s:{ font:FONT_BOLD, alignment:ALIGN_CENTER, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+2, c:2 }), 'WHT',            { s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+2, c:3 }), p._calc.wht,      { z:NUM_FMT, s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+3, c:2 }), 'Penalty (10%)',  { s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+3, c:3 }), p._calc.penalty,  { z:NUM_FMT, s:{ font:FONT_BOLD, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+4, c:2 }), 'WHT + Penalty',  { s:{ font:FONT_BOLD, fill:FILL_HILITE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });
    setCell(ws, XLSX.utils.encode_cell({ r:subR+4, c:3 }), p._calc.payable,  { z:NUM_FMT, s:{ font:FONT_BOLD, fill:FILL_HILITE, alignment:ALIGN_RIGHT, border:BORDER_THIN } });

    ws['!ref']  = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:subR+5, c:5} });
    ws['!cols'] = [{ wch:4 }, { wch:14 }, { wch:24 }, { wch:14 }, { wch:12 }, { wch:14 }];
    const sheetName = (p.name || ('Payee ' + (idx+1))).substring(0, 28).replace(/[\\\/\?\*\[\]:]/g,'_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  return wb;
}

/* ============ DEFAULT SAMPLE STATE ============ */
function defaultSession(){
  return {
    payerName:   'SKINDAE SDN BHD',
    payerTin:    '58427907080',
    payerRefNo:  '',
    period:      '',
    preparedBy:  '',
    payees: [
      {
        name:'Meta Platforms Ireland Limited',
        country:'Ireland',
        foreignTin:'C 29806901060',
        section:'royalty',
        whtRate:8,
        sstInclusive:true,
        sstRate:8,
        latePenalty:false,
        dateRange:'17/01/2026 - 31/01/2026',
        lines:[
          { date:'17/01/2026', receiptNo:'3KANN9RW82', gross:3826.00 },
          { date:'20/01/2026', receiptNo:'KEGFX9RW82', gross:3826.00 },
          { date:'24/01/2026', receiptNo:'HWE47A9X82', gross:3826.00 },
          { date:'27/01/2026', receiptNo:'V9L7X95X82', gross:3826.00 },
          { date:'29/01/2026', receiptNo:'97BYMA9X82', gross:3826.00 },
          { date:'30/01/2026', receiptNo:'AJDV5AVW82', gross:1540.08 },
          { date:'31/01/2026', receiptNo:'Q9STWARW82', gross:1102.78 }
        ]
      }
    ]
  };
}

/* ============ LOCAL STORAGE ============ */
const WHT_LS_KEY = 'ctg_wht_state_v1';
function saveLocal(session){
  try { localStorage.setItem(WHT_LS_KEY, JSON.stringify(session)); }
  catch(e){}
}
function loadLocal(){
  try {
    const raw = localStorage.getItem(WHT_LS_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  } catch(e){ return null; }
}

global.CTGWhtCalculator = {
  WHT_SECTIONS, DTA_RATES, COUNTRY_LIST,
  rateForCountrySection, calcReceipt, calcPayee, calcSession,
  buildWorkbook, defaultSession, saveLocal, loadLocal,
  fmt
};

})(window);
