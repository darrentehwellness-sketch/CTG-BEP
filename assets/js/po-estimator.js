/* ============================================================
   CTG PO CASH FLOW ESTIMATOR — compute engine
   ============================================================
   Pure computation. No DOM. Returns structured data that the UI
   layer (index.html) renders into tables + charts.

   Model:
     Lines:    SKU * Qty * UnitPrice = Cost. Sell Price drives revenue.
     Cash out: Deposit at T+0, Balance + Duty + Forwarding at T+lead.
               Balance optionally deferred by credit_days.
     Cash in:  Per-SKU per-month forecast units × Sell Price, split
               across channels with each channel's payment days lag.
     KPIs:     Peak outflow (cumulative low), Working capital required,
               Break-even month, Total revenue/cost/profit, ROI %.
   ============================================================ */
(function(global){
'use strict';

function round2(n){ return Math.round(Number(n) * 100) / 100; }
function fmt(n){
  if(n == null || !isFinite(Number(n))) return '-';
  const v = Number(n);
  return v.toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmt0(n){
  if(n == null || !isFinite(Number(n))) return '-';
  return Number(n).toLocaleString('en-MY', { minimumFractionDigits:0, maximumFractionDigits:0 });
}

/* ─────────────────────────────────────────────────────────────
   Per-line derived fields. Pure function — no side effects.
   ───────────────────────────────────────────────────────────── */
function computeLine(line){
  const qty       = Math.max(0, Number(line.qty)       || 0);
  const moq       = Math.max(0, Number(line.moq)       || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
  const sellPrice = Math.max(0, Number(line.sellPrice) || 0);
  const extAmt       = qty * unitPrice;
  const totalRevenue = qty * sellPrice;
  const grossProfit  = totalRevenue - extAmt;
  const margin       = sellPrice > 0 ? ((sellPrice - unitPrice) / sellPrice) * 100 : 0;
  const meetsMoq     = qty >= moq;
  return {
    ...line,
    extAmt:       round2(extAmt),
    totalRevenue: round2(totalRevenue),
    grossProfit:  round2(grossProfit),
    margin:       round2(margin),
    meetsMoq:     meetsMoq
  };
}

function computeTotals(state){
  const lines = (state.lines || []).map(computeLine);
  const totalCost    = lines.reduce((s,l) => s + l.extAmt, 0);
  const totalRevenue = lines.reduce((s,l) => s + l.totalRevenue, 0);
  const totalUnits   = lines.reduce((s,l) => s + (Number(l.qty)||0), 0);
  const totalProfit  = totalRevenue - totalCost;
  return {
    lines,
    totalCost:    round2(totalCost),
    totalRevenue: round2(totalRevenue),
    totalUnits:   totalUnits,
    totalProfit:  round2(totalProfit)
  };
}

/* ─────────────────────────────────────────────────────────────
   Monthly cash flow projection.
   Returns array of { month, label, deposit, balance, duty,
     forwarding, totalOut, revenue, byChannel, net, cumulative }.
   ───────────────────────────────────────────────────────────── */
function computeCashFlow(state){
  const months     = Math.max(1, Math.min(36, Number(state.forecastMonths) || 12));
  const leadWeeks  = Math.max(0, Number(state.leadTimeWeeks) || 0);
  // 4.33 weeks/month average — close enough for monthly cash buckets
  const leadMonths = Math.round(leadWeeks / 4.33);
  const creditMon  = Math.round((Number(state.creditDays) || 0) / 30);

  const totals     = computeTotals(state);
  const fxRate     = (state.currency === 'MYR') ? 1 : Math.max(0.0001, Number(state.fxRate) || 1);
  const fxBuffer   = 1 + (Math.max(0, Number(state.fxBufferPct) || 0)) / 100;
  // Convert PO total (in supplier currency) to MYR and add FX hedge buffer
  const totalCostMyr   = totals.totalCost * fxRate * fxBuffer;
  const depositMyr     = totalCostMyr * (Number(state.depositPct) || 0) / 100;
  const balanceMyr     = totalCostMyr * (Number(state.balancePct) || 0) / 100;
  const dutyMyr        = totalCostMyr * (Number(state.importDutyPct) || 0) / 100;
  const forwardingMyr  = Math.max(0, Number(state.forwardingFee) || 0);

  // Month labels seeded from PO date
  const labels = [];
  const start = state.poDate ? new Date(state.poDate) : new Date();
  if(isNaN(start.getTime())) start.setTime(Date.now());
  for(let m = 0; m < months; m++){
    const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
    labels.push(d.toLocaleDateString('en-MY', { month:'short', year:'2-digit' }));
  }

  // Outflow buckets
  const out = Array.from({length: months}, () => ({ deposit:0, balance:0, duty:0, forwarding:0 }));
  out[0].deposit = depositMyr;
  const deliveryMonth = Math.min(leadMonths, months - 1);
  const balancePayMonth = Math.min(deliveryMonth + creditMon, months - 1);
  out[balancePayMonth].balance += balanceMyr;
  out[deliveryMonth].duty       += dutyMyr;
  out[deliveryMonth].forwarding += forwardingMyr;

  // Channels (default: D2C 100% no lag)
  const channels = (Array.isArray(state.channels) && state.channels.length)
    ? state.channels
    : [{ name:'D2C', sharePct:100, paymentDays:0 }];

  // Inflow buckets per channel
  const inf = Array.from({length: months}, () => {
    const obj = { total: 0, byChannel: {} };
    channels.forEach(ch => { obj.byChannel[ch.name] = 0; });
    return obj;
  });

  // Walk per-SKU monthly forecast → revenue per channel per month
  totals.lines.forEach(line => {
    const skuForecast = (state.forecast && state.forecast[line.sku]) || [];
    const sellPrice = Number(line.sellPrice) || 0;
    for(let m = 0; m < Math.min(skuForecast.length, months); m++){
      const units = Number(skuForecast[m]) || 0;
      if(units <= 0) continue;
      const lineRev = units * sellPrice;
      channels.forEach(ch => {
        const chRev = lineRev * (Number(ch.sharePct) || 0) / 100;
        if(chRev <= 0) return;
        const payLag = Math.round((Number(ch.paymentDays) || 0) / 30);
        const payMonth = Math.min(m + payLag, months - 1);
        inf[payMonth].total += chRev;
        inf[payMonth].byChannel[ch.name] = (inf[payMonth].byChannel[ch.name] || 0) + chRev;
      });
    }
  });

  // Starting bank balance — entered by the user. The "ending bank" each
  // month = previous ending bank + net cash. So Month 1 starts at
  // startingBankBalance and we layer the cumulative net on top.
  const startingBank = Math.max(0, Number(state.startingBankBalance) || 0);

  // Stitch outflows + inflows → monthly cash flow + cumulative + bank
  const cashFlow = [];
  let cumulative = 0;
  let bankBalance = startingBank;
  for(let m = 0; m < months; m++){
    const o = out[m];
    const i = inf[m];
    const totalOut = o.deposit + o.balance + o.duty + o.forwarding;
    const totalIn  = i.total;
    const net = totalIn - totalOut;
    const startBank = bankBalance;   // bank entering this month
    cumulative += net;
    bankBalance += net;              // bank exiting this month
    // Round byChannel entries
    const byChannelRounded = {};
    Object.keys(i.byChannel).forEach(k => { byChannelRounded[k] = round2(i.byChannel[k]); });
    cashFlow.push({
      month: m + 1,
      label: labels[m],
      startBank:  round2(startBank),
      deposit:    round2(o.deposit),
      balance:    round2(o.balance),
      duty:       round2(o.duty),
      forwarding: round2(o.forwarding),
      totalOut:   round2(totalOut),
      revenue:    round2(totalIn),
      byChannel:  byChannelRounded,
      net:        round2(net),
      cumulative: round2(cumulative),
      bankBalance:round2(bankBalance)    // absolute cash position end-of-month
    });
  }

  return {
    cashFlow,
    months: months,
    leadMonths: leadMonths,
    deliveryMonth: deliveryMonth + 1,   // 1-indexed for display
    balancePayMonth: balancePayMonth + 1,
    startingBank: round2(startingBank),
    totals: {
      totalCostMyr:   round2(totalCostMyr),
      depositMyr:     round2(depositMyr),
      balanceMyr:     round2(balanceMyr),
      dutyMyr:        round2(dutyMyr),
      forwardingMyr:  round2(forwardingMyr),
      fxRate:         fxRate,
      fxBuffer:       fxBuffer
    }
  };
}

/* ─────────────────────────────────────────────────────────────
   Top-level KPIs (combines cash flow + totals).
   ───────────────────────────────────────────────────────────── */
function computeKpis(state){
  const totals = computeTotals(state);
  const cf = computeCashFlow(state);
  const cums = cf.cashFlow.map(m => m.cumulative);

  // Peak outflow = the most-negative cumulative position
  const peakOutflow = cums.length ? Math.min(0, ...cums) : 0;
  const workingCapital = -peakOutflow;
  const finalPosition = cums[cums.length - 1] || 0;

  // Break-even month: first month where cumulative goes positive AFTER
  // having been negative at some point earlier.
  let everNegative = false;
  let breakEvenMonth = null;
  for(let i = 0; i < cf.cashFlow.length; i++){
    if(cf.cashFlow[i].cumulative < 0) everNegative = true;
    if(everNegative && cf.cashFlow[i].cumulative >= 0){
      breakEvenMonth = i + 1;
      break;
    }
  }

  const totalRevenue = cf.cashFlow.reduce((s,m) => s + m.revenue, 0);
  const totalOutflows = cf.cashFlow.reduce((s,m) => s + m.totalOut, 0);
  const grossProfit = totalRevenue - totalOutflows;
  const roi = workingCapital > 0 ? (grossProfit / workingCapital * 100) : 0;

  // Bank balance KPIs (the new "before/after cash flow" feature)
  const banks = cf.cashFlow.map(m => m.bankBalance);
  const startingBank = cf.startingBank || 0;
  const minBank   = banks.length ? Math.min(...banks) : startingBank;
  const maxBank   = banks.length ? Math.max(...banks) : startingBank;
  const endingBank = banks[banks.length - 1] || startingBank;
  const overdraftMonths = cf.cashFlow.filter(m => m.bankBalance < 0).length;
  const minBankMonth = banks.length
    ? (cf.cashFlow.find(m => m.bankBalance === minBank) || {}).month
    : null;
  // Bank-aware break-even: first month bank balance recovers ABOVE
  // the starting balance after having dipped below it.
  let bankBreakEven = null;
  let dippedBelow = false;
  for(let i = 0; i < cf.cashFlow.length; i++){
    if(cf.cashFlow[i].bankBalance < startingBank) dippedBelow = true;
    if(dippedBelow && cf.cashFlow[i].bankBalance >= startingBank){
      bankBreakEven = i + 1;
      break;
    }
  }

  return {
    poCostOriginalCcy:  totals.totalCost,           // in supplier currency
    poCostMyr:          cf.totals.totalCostMyr,     // post-FX + buffer
    totalRevenue:       round2(totalRevenue),
    totalOutflows:      round2(totalOutflows),
    grossProfit:        round2(grossProfit),
    peakOutflow:        round2(peakOutflow),
    workingCapital:     round2(workingCapital),
    breakEvenMonth:     breakEvenMonth,
    finalPosition:      round2(finalPosition),
    roi:                round2(roi),
    totalUnits:         totals.totalUnits,
    deliveryMonth:      cf.deliveryMonth,
    // ── Bank balance KPIs ─────────────────────────────────────
    startingBank:       round2(startingBank),
    minBank:            round2(minBank),
    minBankMonth:       minBankMonth,
    maxBank:            round2(maxBank),
    endingBank:         round2(endingBank),
    overdraftMonths:    overdraftMonths,
    bankBreakEven:      bankBreakEven,
    bankImpact:         round2(endingBank - startingBank),   // net change over horizon
    balancePayMonth:    cf.balancePayMonth
  };
}

/* ─────────────────────────────────────────────────────────────
   Smart PO split suggestion.
   For each line where the line's deposit exceeds the user's
   max-per-batch threshold, propose how to split into N batches.
   ───────────────────────────────────────────────────────────── */
function suggestSplits(state, maxOutflowPerBatch){
  const totals = computeTotals(state);
  const depositPct = (Number(state.depositPct) || 0) / 100;
  const fxRate     = (state.currency === 'MYR') ? 1 : Math.max(0.0001, Number(state.fxRate) || 1);
  const fxBuffer   = 1 + (Math.max(0, Number(state.fxBufferPct) || 0)) / 100;
  const cap        = Math.max(1, Number(maxOutflowPerBatch) || 50000);
  const out = [];
  totals.lines.forEach((line, idx) => {
    const lineCostMyr = line.extAmt * fxRate * fxBuffer;
    const lineDepositMyr = lineCostMyr * depositPct;
    if(lineDepositMyr > cap && line.qty > 0){
      const batches = Math.ceil(lineDepositMyr / cap);
      const qtyPerBatch = Math.ceil((Number(line.qty) || 0) / batches);
      out.push({
        lineIdx:        idx,
        sku:            line.sku,
        name:           line.name,
        currentQty:     line.qty,
        currentCostMyr: round2(lineCostMyr),
        currentDepositMyr: round2(lineDepositMyr),
        suggestedBatches:  batches,
        qtyPerBatch:       qtyPerBatch,
        depositPerBatchMyr: round2(lineDepositMyr / batches)
      });
    }
  });
  return out;
}

/* ─────────────────────────────────────────────────────────────
   Default seed state — mirrors the IPOCARE acknowledgement
   letter the user shared (RM 646,400 across 6 SKUs).
   ───────────────────────────────────────────────────────────── */
function defaultPoState(){
  // Clean blank slate — no sample SKUs, no fake supplier, no fake forecast.
  // Every user starts from zero and types in their own real PO.
  // Industry-norm payment terms (30/70/30 days) are kept as a starting
  // point because they're commercial defaults, not user-specific data.
  return {
    poNumber:        '',
    poDate:          new Date().toISOString().slice(0,10),
    buyingEntityId:  '',
    supplierId:      '',
    supplierName:    '',
    currency:        'MYR',
    fxRate:          1,
    leadTimeWeeks:   8,
    notes:           '',

    // One empty line so the table is editable from the first click.
    // User can hit "Add Line" to add more.
    lines: [
      { sku:'', name:'', moq:0, qty:0, unitPrice:0, sellPrice:0, remark:'' }
    ],

    depositPct:       30,
    balancePct:       70,
    creditDays:       30,
    importDutyPct:    0,
    forwardingFee:    0,
    fxBufferPct:      0,

    // Channels structure preserved for engine compatibility, but blanked.
    // The UI doesn't show this section anymore — kept for backward compat
    // with older saved scenarios.
    channels: [],

    // Empty forecast — user fills in real sell-through per SKU.
    forecast: {},
    forecastMonths: 12,

    splitThresholdMyr: 50000,
    // Starting bank balance (MYR) — user enters their actual balance.
    startingBankBalance: 0
  };
}

/* ─────────────────────────────────────────────────────────────
   Local storage persistence
   ───────────────────────────────────────────────────────────── */
const PO_LS_KEY = 'ctg_po_state_v1';
function saveLocal(s){
  try { localStorage.setItem(PO_LS_KEY, JSON.stringify(s)); } catch(e){ console.warn('[PO] saveLocal failed', e); }
}
function loadLocal(){
  try {
    const raw = localStorage.getItem(PO_LS_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  } catch(e){ console.warn('[PO] loadLocal failed', e); return null; }
}

/* ─────────────────────────────────────────────────────────────
   Excel export — 4 sheets:
     1. Summary    — KPIs + payment timeline
     2. Lines      — line items with derived columns
     3. CashFlow   — full monthly waterfall
     4. Forecast   — per-SKU monthly units grid
   ───────────────────────────────────────────────────────────── */
function buildWorkbook(state){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS (xlsx) not loaded');
  const kpis = computeKpis(state);
  const cf = computeCashFlow(state);
  const totals = computeTotals(state);

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Summary
  const sum = [];
  sum.push(['CTG PO CASH FLOW ESTIMATOR — SUMMARY']);
  sum.push([]);
  sum.push(['PO Number', state.poNumber || '']);
  sum.push(['PO Date', state.poDate || '']);
  sum.push(['Supplier', state.supplierName || '']);
  sum.push(['Currency', state.currency || 'MYR']);
  sum.push(['FX Rate', kpis.poCostMyr && totals.totalCost ? round2(kpis.poCostMyr / totals.totalCost) : 1]);
  sum.push(['Lead Time (weeks)', state.leadTimeWeeks || 8]);
  sum.push(['Starting Bank Balance', kpis.startingBank]);
  sum.push([]);
  sum.push(['KPI', 'Value (MYR)']);
  sum.push(['Total PO Cost', kpis.poCostMyr]);
  sum.push(['Total Forecast Revenue', kpis.totalRevenue]);
  sum.push(['Total Outflows', kpis.totalOutflows]);
  sum.push(['Gross Profit', kpis.grossProfit]);
  sum.push(['Peak Cash Outflow', kpis.peakOutflow]);
  sum.push(['Working Capital Required', kpis.workingCapital]);
  sum.push(['Break-Even Month', kpis.breakEvenMonth || 'Not within horizon']);
  sum.push(['ROI on Working Capital %', kpis.roi]);
  sum.push(['Total Units', kpis.totalUnits]);
  sum.push([]);
  sum.push(['BANK POSITION', '']);
  sum.push(['Starting Bank Balance', kpis.startingBank]);
  sum.push(['Minimum Bank Balance', kpis.minBank]);
  sum.push(['Min Balance Month', kpis.minBankMonth || '—']);
  sum.push(['Maximum Bank Balance', kpis.maxBank]);
  sum.push(['Ending Bank Balance', kpis.endingBank]);
  sum.push(['Net Bank Impact', kpis.bankImpact]);
  sum.push(['Months in Overdraft', kpis.overdraftMonths]);
  sum.push(['Bank Recovery Month', kpis.bankBreakEven || 'Not within horizon']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary');

  // ─── Sheet 2: Line Items
  const lineHead = ['No', 'SKU', 'Product Name', 'MOQ', 'Order Qty', 'Unit Price', 'Ext Amt', 'Sell Price', 'Margin %', 'Total Revenue', 'Gross Profit', 'Remark'];
  const lineRows = [lineHead];
  totals.lines.forEach((l, i) => lineRows.push([
    i+1, l.sku || '', l.name || '', Number(l.moq)||0, Number(l.qty)||0,
    Number(l.unitPrice)||0, l.extAmt, Number(l.sellPrice)||0, l.margin,
    l.totalRevenue, l.grossProfit, l.remark || ''
  ]));
  lineRows.push(['', '', 'TOTAL', '', kpis.totalUnits, '', totals.totalCost, '', '', totals.totalRevenue, totals.totalProfit, '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lineRows), 'Line Items');

  // ─── Sheet 3: Cash Flow (now with Bank Balance columns)
  const channels = (state.channels || []);
  const cfHead = ['Month', 'Label', 'Start Bank', 'Deposit Out', 'Balance Out', 'Duty', 'Forwarding', 'Total Out'];
  channels.forEach(ch => cfHead.push('Rev ' + ch.name));
  cfHead.push('Revenue Total', 'Net Cash', 'Cumulative', 'End Bank');
  const cfRows = [cfHead];
  cf.cashFlow.forEach(m => {
    const r = [m.month, m.label, m.startBank, m.deposit, m.balance, m.duty, m.forwarding, m.totalOut];
    channels.forEach(ch => r.push(m.byChannel[ch.name] || 0));
    r.push(m.revenue, m.net, m.cumulative, m.bankBalance);
    cfRows.push(r);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), 'Cash Flow');

  // ─── Sheet 4: Sales Forecast
  const fcHead = ['SKU', 'Sell Price'];
  for(let m = 0; m < cf.months; m++) fcHead.push('M' + (m+1) + ' (' + (cf.cashFlow[m] ? cf.cashFlow[m].label : '') + ')');
  fcHead.push('Total Units', 'Total Revenue');
  const fcRows = [fcHead];
  totals.lines.forEach(l => {
    const fc = (state.forecast && state.forecast[l.sku]) || [];
    const row = [l.sku || '', Number(l.sellPrice)||0];
    let totU = 0;
    for(let m = 0; m < cf.months; m++){
      const u = Number(fc[m]) || 0;
      row.push(u);
      totU += u;
    }
    row.push(totU, round2(totU * (Number(l.sellPrice)||0)));
    fcRows.push(row);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fcRows), 'Sales Forecast');

  return wb;
}

global.CTGPoEstimator = {
  defaultPoState,
  saveLocal, loadLocal,
  computeLine, computeTotals, computeCashFlow, computeKpis,
  suggestSplits, buildWorkbook,
  fmt, fmt0, round2
};

})(window);
