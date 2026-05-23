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

/* ============ ITA SECTIONS — full LHDN payment-type taxonomy ============
   Source: LHDN Public Ruling 11/2018 + ITA 1967 + SQL Accounting reference
            (https://www.sql.com.my/accounting-software/withholding-tax/)

   Each section carries:
     - label        Human-readable description (shown in dropdown)
     - section      ITA 1967 section reference
     - defaultRate  Default WHT % (used when no DTA reduction applies)
     - formCode     LHDN payment form (CP 37, CP 37A, CP 37C, etc.)
     - lhdnCode     3-digit LHDN payment code for bank remittance
                    (only available for the original 4 — others use the
                    form-specific code on the CP 37x voucher)
     - group        UI grouping (for <optgroup> in section dropdown)
     - note         Short explainer shown as tooltip / hint

   ─────────────────────────────────────────────────────────────────────
   Pay code 151 = Contract (S.107A)        Form CP 37A
   Pay code 152 = Special Classes (S.109B) Form CP 37D
   Pay code 153 = Interest (S.109)         Form CP 37
   Pay code 162 = Royalty (S.109)          Form CP 37

   Filing deadline: WHT must be paid to LHDN within 1 MONTH of paying
   the non-resident. Late = 10% penalty per s.109(2)/s.107A(2).
   ───────────────────────────────────────────────────────────────────── */
const WHT_SECTIONS = {
  // ── S.109 — Royalty & Interest ────────────────────────────────────
  royalty: {
    label:'Section 109 — Royalty',
    section:'109', defaultRate:10, formCode:'CP 37', lhdnCode:162,
    group:'S.109',
    note:'Royalty paid to non-resident. Digital ads (Meta/Google/TikTok) classified as royalty in MY — DTA often reduces to 8%.'
  },
  interest: {
    label:'Section 109 — Interest',
    section:'109', defaultRate:15, formCode:'CP 37', lhdnCode:153,
    group:'S.109',
    note:'Interest paid to non-resident (loans, debentures, bonds). DTA may reduce.'
  },

  // ── S.109A — Non-resident public entertainers ─────────────────────
  entertainer: {
    label:'Section 109A — Non-resident public entertainers',
    section:'109A', defaultRate:15, formCode:'Payment memo (Assessment Branch)', lhdnCode:null,
    group:'S.109A',
    note:'Artistes, sportsmen, performers. LHDN issues a payment memo; no standard CP 37 form.'
  },

  // ── S.109B — Special classes of income (technical / services) ─────
  technical: {
    label:'Section 109B / 4A — Technical fees, services & movable property rent',
    section:'109B', defaultRate:10, formCode:'CP 37D', lhdnCode:152,
    group:'S.109B',
    note:'Technical advice/services + use of movable property (equipment rental). DTA may reduce.'
  },

  // ── S.109C — Interest from approved financial institutions ────────
  interest_fi: {
    label:'Section 109C — Interest from approved financial institutions',
    section:'109C', defaultRate:5, formCode:'CP 37C', lhdnCode:null,
    group:'S.109C',
    note:'Interest paid to non-resident by an approved Malaysian bank/financial institution. Concessional 5% rate.'
  },

  // ── S.109D — REIT distributions (3 distinct rates) ────────────────
  reit_other: {
    label:'Section 109D — REIT distribution: other (non-corporate)',
    section:'109D', defaultRate:10, formCode:'CP 37E', lhdnCode:null,
    group:'S.109D — REIT',
    note:'Distribution from a Malaysian REIT to a recipient other than a resident company.'
  },
  reit_nonres_co: {
    label:'Section 109D — REIT distribution: non-resident company',
    section:'109D', defaultRate:25, formCode:'CP 37E', lhdnCode:null,
    group:'S.109D — REIT',
    note:'Distribution to a non-resident COMPANY recipient — 25% under S.109D.'
  },
  reit_fii: {
    label:'Section 109D — REIT distribution: foreign investment institution',
    section:'109D', defaultRate:10, formCode:'CP 37E', lhdnCode:null,
    group:'S.109D — REIT',
    note:'Foreign investment institution recipient (effective 01/01/2007 onwards).'
  },

  // ── S.109E — Family Fund / Takaful Family Fund / Dana Am ──────────
  family_indiv: {
    label:'Section 109E — Family Fund / Takaful: individual & others',
    section:'109E', defaultRate:8, formCode:'CP 37E(T)', lhdnCode:null,
    group:'S.109E — Family Fund',
    note:'Distribution from Family Fund / Takaful Family Fund / Dana Am to individual or other (non-company) recipient.'
  },
  family_nonres_co: {
    label:'Section 109E — Family Fund / Takaful: non-resident company',
    section:'109E', defaultRate:25, formCode:'CP 37E(T)', lhdnCode:null,
    group:'S.109E — Family Fund',
    note:'Distribution to non-resident company recipient — 25%.'
  },

  // ── S.109F — Other income under S.4(f) ────────────────────────────
  s4f: {
    label:'Section 109F — Other income under Section 4(f)',
    section:'109F', defaultRate:10, formCode:'CP 37F', lhdnCode:null,
    group:'S.109F',
    note:'Catch-all for income falling under S.4(f) ITA 1967 — commissions, guarantee fees and miscellaneous gains not specifically covered elsewhere.'
  },

  // ── S.107A — Contract payments to non-resident contractors ────────
  // S.107A(1)(a) — contractor's profit portion (10%)
  // S.107A(1)(b) — contractor's employees' portion (3%)
  // Combined 13% if both apply. Split as separate payees for clean reporting.
  contract: {
    label:'Section 107A(1)(a) — Contract payment (contractor portion)',
    section:'107A', defaultRate:10, formCode:'CP 37A', lhdnCode:151,
    group:'S.107A — Contract',
    note:'Contract payment to non-resident contractor — 10% on contractor\'s profit portion under S.107A(1)(a).'
  },
  contract_emp: {
    label:'Section 107A(1)(b) — Contract payment (employees portion)',
    section:'107A', defaultRate:3, formCode:'CP 37A', lhdnCode:151,
    group:'S.107A — Contract',
    note:'Additional 3% on the portion paid to contractor\'s employees under S.107A(1)(b). Combined with 107A(1)(a) = 13% total.'
  }
};

/* ============ DTA RATES TABLE ============
   Per Malaysia's bilateral Double Taxation Agreements. Most DTAs only
   reduce royalty / interest / technical rates — REIT/Family Fund/S.4(f)
   are domestic provisions that DTAs typically don't override.

   Keys not present here fall back to WHT_SECTIONS[key].defaultRate via
   rateForCountrySection() below. The contract rate stays at 10% (the
   profit portion only — add a 2nd payee with section 'contract_emp'
   to capture the 3% employee portion). */
const DTA_RATES = {
  // country code: { royalty, interest, technical, contract }
  // — domestic default for no-DTA jurisdictions: 10 / 15 / 10 / 10
  'No DTA / Other':      { royalty:10, interest:15, technical:10, contract:10 },
  'Ireland':             { royalty:8,  interest:10, technical:10, contract:10 },
  'Singapore':           { royalty:8,  interest:10, technical:5,  contract:10 },
  'United States':       { royalty:10, interest:15, technical:10, contract:10 },  // no DTA in force
  'United Kingdom':      { royalty:8,  interest:10, technical:8,  contract:10 },
  'China':               { royalty:10, interest:10, technical:10, contract:10 },
  'Japan':               { royalty:10, interest:10, technical:10, contract:10 },
  'Australia':           { royalty:10, interest:15, technical:10, contract:10 },
  'India':               { royalty:10, interest:10, technical:10, contract:10 },
  'Indonesia':           { royalty:10, interest:15, technical:5,  contract:10 },
  'South Korea':         { royalty:10, interest:15, technical:10, contract:10 },
  'Hong Kong':           { royalty:8,  interest:10, technical:5,  contract:10 },
  'Netherlands':         { royalty:8,  interest:10, technical:8,  contract:10 },
  'Germany':             { royalty:7,  interest:10, technical:7,  contract:10 },
  'Thailand':            { royalty:10, interest:15, technical:10, contract:10 },
  'Vietnam':             { royalty:10, interest:10, technical:10, contract:10 },
  'Taiwan':              { royalty:10, interest:10, technical:7.5,contract:10 },
  'France':              { royalty:10, interest:15, technical:10, contract:10 },
  'Italy':               { royalty:10, interest:15, technical:10, contract:10 },
  'Switzerland':         { royalty:10, interest:10, technical:10, contract:10 },
  'Canada':              { royalty:10, interest:15, technical:10, contract:10 },
  'Philippines':         { royalty:15, interest:15, technical:10, contract:10 },
  'United Arab Emirates':{ royalty:10, interest:5,  technical:10, contract:10 },
  'New Zealand':         { royalty:10, interest:15, technical:10, contract:10 },
  'Pakistan':            { royalty:10, interest:15, technical:10, contract:10 },
  'Bangladesh':          { royalty:10, interest:15, technical:10, contract:10 },
  'Sri Lanka':           { royalty:10, interest:10, technical:10, contract:10 },
  'Saudi Arabia':        { royalty:8,  interest:5,  technical:8,  contract:10 },
  'Russia':              { royalty:10, interest:15, technical:10, contract:10 }
};

const COUNTRY_LIST = Object.keys(DTA_RATES);

/* ============ HELPERS ============ */
// Resolve the applicable WHT rate for a given (country, section) pair.
//
// Rules (in priority order):
//   1. If the section is one of the original 4 (royalty/interest/technical/
//      contract) AND a DTA exists for the country, use the DTA-reduced rate.
//   2. Otherwise (new sections like REIT, Family Fund, S.4(f), entertainer,
//      interest_fi, contract_emp), use the section's domestic defaultRate.
//      These sections are domestic provisions — DTAs typically don't
//      override them.
//   3. Fallback to 10% if everything else is missing.
function rateForCountrySection(country, section){
  const r = DTA_RATES[country] || DTA_RATES['No DTA / Other'];
  if(r[section] != null) return r[section];
  const sec = WHT_SECTIONS[section];
  return sec ? sec.defaultRate : 10;
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
  // Clamp negative + NaN to 0 — gross amount is always ≥ 0 in WHT context.
  const gross = Math.max(0, Number(grossAmount) || 0);
  const sstPct = Math.max(0, Math.min(100, Number(sstRate) || 0)) / 100;
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
  catch(e){ console.warn('WHT saveLocal failed (quota or disabled?):', e); }
}
function loadLocal(){
  try {
    const raw = localStorage.getItem(WHT_LS_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeSession(parsed);
  } catch(e){
    console.warn('WHT loadLocal failed — using defaults:', e);
    return null;
  }
}

/* Defensive normalization — fills in missing fields so renderAll() can't
   throw on corrupted/partial localStorage data. */
function normalizeSession(s){
  if(!s || typeof s !== 'object') return null;
  const out = {
    payerName:   typeof s.payerName === 'string' ? s.payerName : '',
    payerTin:    typeof s.payerTin  === 'string' ? s.payerTin  : '',
    payerRefNo:  typeof s.payerRefNo=== 'string' ? s.payerRefNo: '',
    period:      typeof s.period    === 'string' ? s.period    : '',
    preparedBy:  typeof s.preparedBy=== 'string' ? s.preparedBy: '',
    payees:      []
  };
  if(Array.isArray(s.payees)){
    out.payees = s.payees.map(p => normalizePayee(p)).filter(Boolean);
  }
  return out;
}
function normalizePayee(p){
  if(!p || typeof p !== 'object') return null;
  return {
    name:        typeof p.name === 'string' ? p.name : '',
    country:     (p.country && DTA_RATES[p.country]) ? p.country : 'No DTA / Other',
    foreignTin:  typeof p.foreignTin === 'string' ? p.foreignTin : '',
    section:     (p.section && WHT_SECTIONS[p.section]) ? p.section : 'royalty',
    whtRate:     Math.max(0, Math.min(100, Number(p.whtRate) || 0)),
    sstInclusive:p.sstInclusive !== false,
    sstRate:     Math.max(0, Math.min(100, Number(p.sstRate) || 8)),
    latePenalty: !!p.latePenalty,
    dateRange:   typeof p.dateRange === 'string' ? p.dateRange : '',
    lines:       Array.isArray(p.lines)
                   ? p.lines.map(L => ({
                       date:      typeof L.date === 'string' ? L.date : '',
                       receiptNo: typeof L.receiptNo === 'string' ? L.receiptNo : '',
                       gross:     Math.max(0, Number(L.gross) || 0)
                     }))
                   : []
  };
}

global.CTGWhtCalculator = {
  WHT_SECTIONS, DTA_RATES, COUNTRY_LIST,
  rateForCountrySection, calcReceipt, calcPayee, calcSession,
  buildWorkbook, defaultSession, saveLocal, loadLocal,
  fmt
};

})(window);
