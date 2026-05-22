/* ============================================================
   CTG P&L CONVERTER
   ============================================================
   Reads a P&L exported from any Malaysian accounting system
   (AutoCount, SQL Account, MYOB, generic Excel, or PDF) and
   converts it to the SKINDAE-style canonical COA layout, with
   formulas pre-wired and totals computed.

   Strategy: fully automatic keyword-based mapping.
   Unrecognized rows are dropped into a "— Unmapped —" sheet
   for visibility (we don't silently lose anything).
   ============================================================
*/
(function(global){
'use strict';

/* ============ CANONICAL COA TEMPLATE ============
   Order matters — this is exactly the row order in the output. */
const COA = [
  // === TRADING INCOME ===
  { group:'Trading Income', kind:'header' },
  { group:'Trading Income', kind:'account', name:'Revenue - Retail Sales (O2O)' },
  { group:'Trading Income', kind:'account', name:'Revenue - WebStore Sales (Shopify)' },
  { group:'Trading Income', kind:'account', name:'Revenue - COD Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Meta Platform Sales (Facebook/Instagram/WhatsApp)' },
  { group:'Trading Income', kind:'account', name:'Revenue - Shopee Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Lazada Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Exhibition Event' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - Shopee' },
  { group:'Trading Income', kind:'total',   name:'Total Trading Income' },

  // === COST OF SALES ===
  { group:'Cost of Sales',  kind:'header' },
  { group:'Cost of Sales',  kind:'account', name:'Stocks At the Beginning of Year' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Purchases of Goods' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Packaging Costs' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Promotional Items (Souvenirs)' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Inbound Transportation Costs' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Import Duties' },
  { group:'Cost of Sales',  kind:'account', name:'Stocks At the End of Year' },
  { group:'Cost of Sales',  kind:'total',   name:'Total Cost of Sales' },

  // === GROSS PROFIT ===
  { group:'Gross Profit',   kind:'subtotal', name:'Gross Profit' },

  // === OTHER INCOME ===
  { group:'Other Income',   kind:'header' },
  { group:'Other Income',   kind:'account', name:'Other Income - Unknown Fund Received' },
  { group:'Other Income',   kind:'account', name:'Other Income - Shared Employees Service' },
  { group:'Other Income',   kind:'total',   name:'Total Other Income' },

  // === OPERATING EXPENSES ===
  { group:'Operating Expenses', kind:'header' },
  // -- STAFF --
  { group:'Operating Expenses', kind:'account', name:"STAFF - Employees Salaries & Wages" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Employees Employer's Contribution" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Bonuses & Incentives/Allowances" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Staff Benefits" },
  // -- CTG --
  { group:'Operating Expenses', kind:'account', name:"CTG - E-Commerce Webstore Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Human Resource Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - O2O Hub Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Sales Design Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Training Hub Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Lazada Commission Fee 3%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - O2O Hub Commission Fee 3.8%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Shopee Hub Commission Fee 3%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Supply Chain Commission Fee" },
  // -- BD&M --
  { group:'Operating Expenses', kind:'account', name:"BD&M Travel - Transportation" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Gift/Souvenirs/Sponsorship" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Meta Platform)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Shopee)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Lazada)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Google)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (Shopee)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (Lazada)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (COD)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Shopify)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (ManyChat)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Hello CRM)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Others Marketing)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Production Cost (Photography/Videography)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Production Cost (Design & Miscellaneous Studio)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event Space Rental (Booth / Venue)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Sponsorship & Advertising)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Event Crew/Show Talent/MC)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Professional Service Fees" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - KOC Collaboration Commission" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Customer Referral Fees" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Withholding Tax (8%/10%)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Sales Service Tax (6%/8%)" },
  // -- G&A --
  { group:'Operating Expenses', kind:'account', name:"G&A Travel - Accommodation" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Supplies & Logisters" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Ofiice IT Software Information System" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Depreciation/Assets" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Professional Fees/Taxation Service" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Compliance - Corp Sec & Reg Fees" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Stamping Fee/Filling Fee/Tax Duty" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Penalty & Compound" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Withholding Tax (8%/10%)" },
  // -- FIN --
  { group:'Operating Expenses', kind:'account', name:"FIN - Bank Charges & Handling Fees" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (Atome)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (Payex)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Realised Currency Gains" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Revaluations (Gain)/Loss on Foreign Exchange Rate Changes" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Unrealised Currency Gains" },
  { group:'Operating Expenses', kind:'total',   name:'Total Operating Expenses' },

  // === NET PROFIT ===
  { group:'Net Profit',     kind:'subtotal', name:'Net Profit' }
];

/* ============ KEYWORD DICTIONARY ============
   Each entry: target COA name → array of keyword substrings (lowercased).
   First-match wins. Order more specific keywords FIRST. */
const COA_KEYWORDS = {
  // === Trading Income ===
  'Revenue - Retail Sales (O2O)': ['o2o', 'retail sales', 'counter sales', 'walk-in', 'walk in', 'showroom', 'pos sales'],
  'Revenue - WebStore Sales (Shopify)': ['shopify', 'webstore', 'web store', 'website sales', 'online store'],
  'Revenue - COD Sales': ['cod sales', 'cash on delivery', 'c.o.d'],
  'Revenue - Meta Platform Sales (Facebook/Instagram/WhatsApp)': ['meta platform', 'facebook sales', 'instagram sales', 'whatsapp sales', 'ig sales', 'fb sales', 'social media sales'],
  'Revenue - Shopee Sales': ['shopee sales', 'shopee revenue'],
  'Revenue - Lazada Sales': ['lazada sales', 'lazada revenue'],
  'Revenue - Exhibition Event': ['exhibition', 'expo', 'event sales', 'fair sales', 'roadshow'],
  'Discount Voucher - Shopee': ['discount voucher shopee', 'shopee voucher', 'shopee discount'],

  // === Cost of Sales ===
  'Stocks At the Beginning of Year': ['stock at beginning', 'opening stock', 'opening inventory', 'beginning inventory'],
  'COGS - Purchases of Goods': ['purchase of goods', 'purchases - goods', 'purchases of goods', 'goods purchase', 'cogs - purchase', 'cogs purchase', 'purchases'],
  'COGS - Packaging Costs': ['packaging cost', 'packing cost', 'packaging materials', 'cogs - pack', 'cogs pack'],
  'COGS - Promotional Items (Souvenirs)': ['promotional item', 'souvenir', 'promo item', 'gift items cogs'],
  'COGS - Inbound Transportation Costs': ['inbound transport', 'inbound freight', 'inbound shipping', 'cogs - freight', 'incoming freight'],
  'COGS - Import Duties': ['import duty', 'import duties', 'customs duty', 'customs duties', 'kastam'],
  'Stocks At the End of Year': ['stock at end', 'closing stock', 'closing inventory', 'ending inventory'],

  // === Other Income ===
  'Other Income - Unknown Fund Received': ['unknown fund', 'unidentified deposit', 'sundry income', 'miscellaneous income'],
  'Other Income - Shared Employees Service': ['shared employee', 'shared service', 'inter-co recharge', 'intercompany recharge'],

  // === STAFF ===
  "STAFF - Employees Salaries & Wages": ['salary', 'salaries', 'wages', 'wage', 'payroll', 'gaji', 'remuneration'],
  "STAFF - Employees Employer's Contribution": ['employer contribution', 'epf', 'kwsp', 'socso', 'perkeso', 'eis', 'hrd levy', 'hrdf'],
  "STAFF - Bonuses & Incentives/Allowances": ['bonus', 'bonuses', 'incentive', 'allowance', 'commission - staff', 'commission staff', 'sales commission'],
  "STAFF - Staff Benefits": ['staff benefit', 'staff welfare', 'medical', 'insurance - staff', 'staff insurance', 'training - staff'],

  // === CTG (intercompany management fees) ===
  "CTG - E-Commerce Webstore Management Fee": ['ctg e-commerce', 'ctg ecommerce', 'ctg webstore'],
  "CTG - Human Resource Management Fee": ['ctg hr', 'ctg human resource'],
  "CTG - O2O Hub Management Fee": ['ctg o2o hub management', 'ctg o2o management'],
  "CTG - Sales Design Management Fee": ['ctg sales design', 'ctg design management'],
  "CTG - Training Hub Management Fee": ['ctg training'],
  "CTG - Lazada Commission Fee 3%": ['ctg lazada'],
  "CTG - O2O Hub Commission Fee 3.8%": ['ctg o2o commission', 'ctg o2o hub commission'],
  "CTG - Shopee Hub Commission Fee 3%": ['ctg shopee'],
  "CTG - Supply Chain Commission Fee": ['ctg supply chain'],

  // === BD&M — Marketing / Sales ===
  "BD&M Travel - Transportation": ['bdm travel', 'sales travel', 'business travel', 'mileage', 'taxi - sales', 'transportation - sales'],
  "BD&M - Gift/Souvenirs/Sponsorship": ['gift expense', 'souvenir expense', 'sponsorship', 'corporate gift', 'gift - customer'],
  "BD&M - Marketing Press Release (Meta Platform)": ['meta ads', 'facebook ads', 'instagram ads', 'fb ads', 'ig ads', 'meta marketing', 'whatsapp ads', 'manychat ads'],
  "BD&M - Marketing Press Release (Shopee)": ['shopee ads', 'shopee marketing', 'shopee advertis'],
  "BD&M - Marketing Press Release (Lazada)": ['lazada ads', 'lazada marketing', 'lazada advertis'],
  "BD&M - Marketing Press Release (Google)": ['google ads', 'google adwords', 'google marketing', 'youtube ads', 'sem'],
  "BD&M - Platform Merchant/Commission Fees (Shopee)": ['shopee commission', 'shopee fee', 'shopee merchant fee'],
  "BD&M - Platform Merchant/Commission Fees (Lazada)": ['lazada commission', 'lazada fee', 'lazada merchant fee'],
  "BD&M - Platform Merchant/Commission Fees (COD)": ['cod commission', 'cod fee', 'cod handling'],
  "BD&M - IT Software Information System (Shopify)": ['shopify subscription', 'shopify fee', 'shopify monthly'],
  "BD&M - IT Software Information System (ManyChat)": ['manychat'],
  "BD&M - IT Software Information System (Hello CRM)": ['hello crm', 'hellocrm'],
  "BD&M - IT Software Information System (Others Marketing)": ['mailchimp', 'klaviyo', 'hubspot', 'canva pro', 'marketing software', 'marketing tools', 'crm software'],
  "BD&M - Marketing Production Cost (Photography/Videography)": ['photography', 'videography', 'photoshoot', 'video shoot', 'film production'],
  "BD&M - Marketing Production Cost (Design & Miscellaneous Studio)": ['design - marketing', 'studio rental', 'creative production', 'graphic design'],
  "BD&M - Exibition Event Space Rental (Booth / Venue)": ['booth rental', 'venue rental', 'exhibition rental', 'event space'],
  "BD&M - Exibition Event (Sponsorship & Advertising)": ['exhibition sponsorship', 'event sponsorship', 'event advertis'],
  "BD&M - Exibition Event (Event Crew/Show Talent/MC)": ['mc fee', 'event crew', 'show talent', 'emcee', 'usher', 'event staff'],
  "BD&M - Professional Service Fees": ['professional fee - marketing', 'consultant - marketing', 'agency fee'],
  "BD&M - KOC Collaboration Commission": ['koc', 'kol', 'influencer', 'collaboration commission', 'creator commission'],
  "BD&M - Customer Referral Fees": ['referral fee', 'customer referral', 'affiliate commission'],
  "BD&M - Withholding Tax (8%/10%)": ['withholding tax - marketing', 'wht - marketing'],
  "BD&M - Sales Service Tax (6%/8%)": ['sst - sales', 'sales service tax', 'service tax - sales'],

  // === G&A ===
  "G&A Travel - Accommodation": ['accommodation', 'hotel', 'lodging', 'travel - admin'],
  "G&A - Office Supplies & Logisters": ['office supplies', 'stationery', 'office consumables', 'pantry'],
  "G&A - Ofiice IT Software Information System": ['office software', 'microsoft 365', 'google workspace', 'office subscription', 'it admin'],
  "G&A - Office Depreciation/Assets": ['depreciation', 'amortisation', 'amortization', 'office asset', 'fixed asset write off'],
  "G&A - Professional Fees/Taxation Service": ['audit fee', 'accounting fee', 'tax agent', 'professional fee - tax', 'tax consultant', 'company secretary fee'],
  "G&A - Compliance - Corp Sec & Reg Fees": ['corp sec', 'company secretary', 'ssm', 'companies commission', 'registration fee', 'license fee'],
  "G&A - Stamping Fee/Filling Fee/Tax Duty": ['stamp duty', 'stamping', 'filing fee', 'filling fee'],
  "G&A - Penalty & Compound": ['penalty', 'compound', 'fine', 'late fee'],
  "G&A - Withholding Tax (8%/10%)": ['withholding tax', 'wht'],

  // === FIN ===
  "FIN - Bank Charges & Handling Fees": ['bank charge', 'bank fee', 'handling fee', 'transfer fee'],
  "FIN - Payment Gatewway Fee (Atome)": ['atome'],
  "FIN - Payment Gatewway Fee (Payex)": ['payex'],
  "FIN - Realised Currency Gains": ['realised currency gain', 'realized currency gain', 'realised fx gain', 'realized fx gain'],
  "FIN - Revaluations (Gain)/Loss on Foreign Exchange Rate Changes": ['fx revaluation', 'foreign exchange revaluation', 'unrealised fx loss', 'unrealized fx loss', 'forex loss', 'fx loss'],
  "FIN - Unrealised Currency Gains": ['unrealised currency gain', 'unrealized currency gain', 'unrealised fx gain', 'unrealized fx gain']
};

/* Pre-build a lookup index: keyword → COA name (sorted long-first so multi-word keywords beat short ones) */
const KEYWORD_INDEX = (function(){
  const idx = [];
  Object.keys(COA_KEYWORDS).forEach(target => {
    COA_KEYWORDS[target].forEach(kw => {
      idx.push({ kw: kw.toLowerCase(), target });
    });
  });
  // Sort longest first so "shopee commission" matches before "shopee"
  idx.sort((a,b) => b.kw.length - a.kw.length);
  return idx;
})();

function normalizeName(s){
  return String(s||'').toLowerCase()
    .replace(/[–—]/g,'-')           // en/em dash → hyphen
    .replace(/[^a-z0-9&/\-\(\)\s\.\%]/g,' ')
    .replace(/\s+/g,' ').trim();
}

/* Map one source account name → canonical COA name (or null if no match) */
function mapAccount(sourceName){
  if(!sourceName) return null;
  const n = normalizeName(sourceName);
  for(const { kw, target } of KEYWORD_INDEX){
    if(n.indexOf(kw) !== -1) return target;
  }
  return null;
}

/* Parse an Excel file (ArrayBuffer) → { months:[label,...], rows:[{name, values:[...]}], detected:{accountCol, firstMonthCol} } */
function parseExcel(arrayBuffer){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS (xlsx) not loaded');
  const wb = XLSX.read(arrayBuffer, { type:'array', cellDates:true, cellNF:false });
  // Pick first non-empty sheet
  let sheetName = wb.SheetNames[0];
  for(const sn of wb.SheetNames){
    const sheet = wb.Sheets[sn];
    if(sheet && sheet['!ref']) { sheetName = sn; break; }
  }
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, blankrows:false });

  // Find the header row: the first row that has more numbers-or-date strings than text strings in cols 2+
  let headerRowIdx = -1;
  for(let i=0; i<Math.min(aoa.length, 20); i++){
    const row = aoa[i] || [];
    let dateLike = 0;
    for(let j=1; j<row.length; j++){
      const v = row[j];
      if(v == null || v === '') continue;
      if(v instanceof Date) { dateLike++; continue; }
      const s = String(v);
      if(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s)) dateLike++;
      else if(/^\d{4}[-/]\d{1,2}/.test(s)) dateLike++;
      else if(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) dateLike++;
    }
    if(dateLike >= 1) { headerRowIdx = i; break; }
  }
  if(headerRowIdx === -1){
    // Fallback: assume row 0 is header
    headerRowIdx = 0;
  }

  const headerRow = aoa[headerRowIdx] || [];
  // Detect account-name column (usually column 0) and month columns
  const accountCol = 0;  // SKINDAE/Xero/AutoCount all put account names in column A
  const months = [];
  const monthCols = [];
  for(let j=1; j<headerRow.length; j++){
    const v = headerRow[j];
    if(v == null || v === '') continue;
    let label = '';
    if(v instanceof Date){
      label = v.toLocaleString('en-US', { month:'short', year:'numeric' });
    } else {
      label = String(v).trim();
    }
    // Skip percentage / variance / narrow spacer columns
    if(!label) continue;
    if(label === '%' || label === 'YTD %' || /^%$/.test(label)) continue;
    if(/^variance|^var\.?$|^change$|^diff(erence)?$/i.test(label)) continue;
    months.push(label);
    monthCols.push(j);
  }
  // Fallback: if strict detection found 0 months, treat any column whose
  // header is non-empty AND whose data rows are mostly numeric as a month.
  if(months.length === 0){
    for(let j=1; j<headerRow.length; j++){
      const v = headerRow[j];
      if(v == null || v === '') continue;
      const label = String(v).trim();
      if(!label || label === '%') continue;
      let numericCount = 0, dataCount = 0;
      for(let i=headerRowIdx+1; i<Math.min(aoa.length, headerRowIdx + 30); i++){
        const cv = (aoa[i] || [])[j];
        if(cv == null || cv === '') continue;
        dataCount++;
        const n = Number(String(cv).replace(/[,\s]/g,'').replace(/^\((.*)\)$/,'-$1'));
        if(isFinite(n)) numericCount++;
      }
      if(dataCount >= 3 && numericCount / dataCount > 0.6){
        months.push(label);
        monthCols.push(j);
      }
    }
  }
  if(months.length === 0){
    throw new Error('No month/period columns detected in the source. Make sure your header row has month labels (e.g. "Jan 2026") in row 1.');
  }

  // Extract data rows
  const rows = [];
  for(let i=headerRowIdx+1; i<aoa.length; i++){
    const row = aoa[i] || [];
    const name = row[accountCol];
    if(name == null || String(name).trim() === '') continue;
    const nameStr = String(name).trim();
    // Skip total/subtotal lines from source
    if(/^total\s/i.test(nameStr) || /^gross\s+profit/i.test(nameStr) || /^net\s+profit/i.test(nameStr) || /^operating\s+profit/i.test(nameStr)) continue;
    const values = monthCols.map(c => {
      const v = row[c];
      if(v == null || v === '') return 0;
      const n = Number(String(v).replace(/[,\s]/g,'').replace(/^\((.*)\)$/, '-$1'));
      return isFinite(n) ? n : 0;
    });
    // Skip rows that are all-zero AND don't look like a section header
    const allZero = values.every(v => v === 0);
    if(allZero) continue;
    rows.push({ name: nameStr, values });
  }

  return { months, rows };
}

/* Parse a PDF file (ArrayBuffer) → same shape as parseExcel.
   Uses PDF.js text-layer extraction + heuristic line/column detection. */
async function parsePdf(arrayBuffer){
  if(typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  // Extract text-with-position from every page, then group by Y to form rows
  const lines = []; // [{ y, items:[{x, text}] }]
  for(let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pageHeight = page.view[3];
    for(const item of tc.items){
      const tx = item.transform;
      const x = tx[4];
      const y = pageHeight - tx[5]; // flip so y grows downward
      const text = (item.str || '').trim();
      if(!text) continue;
      // Find or create line at this Y (allow 2-px tolerance)
      let line = lines.find(L => Math.abs(L.y - y) < 3 && L.page === p);
      if(!line){ line = { page:p, y, items:[] }; lines.push(line); }
      line.items.push({ x, text });
    }
  }
  // Sort lines top-to-bottom (page then y), items left-to-right
  lines.sort((a,b) => a.page - b.page || a.y - b.y);
  lines.forEach(L => L.items.sort((a,b) => a.x - b.x));

  // Find a row that looks like the header (has month-like tokens)
  const monthTokenRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*\-?\s*\d{2,4}|\d{4}\-\d{2}|q[1-4]\s*\d{2,4}|ytd/i;
  let headerLineIdx = -1;
  for(let i=0;i<lines.length;i++){
    const L = lines[i];
    const tokens = L.items.map(it => it.text);
    let dateLike = 0;
    tokens.forEach(t => { if(monthTokenRe.test(t)) dateLike++; });
    if(dateLike >= 1){ headerLineIdx = i; break; }
  }
  if(headerLineIdx === -1) throw new Error('Could not find a header row with month labels in the PDF');

  // Extract month labels + their X positions (we'll match data cells by X proximity)
  const headerLine = lines[headerLineIdx];
  const monthCols = [];
  headerLine.items.forEach(it => {
    if(monthTokenRe.test(it.text)){
      monthCols.push({ label: it.text, x: it.x });
    }
  });
  if(monthCols.length === 0) throw new Error('No month columns detected in header');

  // Walk data lines and assign each numeric token to nearest month column
  const rows = [];
  const numRe = /^\(?-?[\d,]+\.?\d*\)?$/;
  for(let i=headerLineIdx+1; i<lines.length; i++){
    const L = lines[i];
    // First non-numeric items form the account name
    const nameParts = [];
    const valsByCol = new Array(monthCols.length).fill(0);
    let hitNumeric = false;
    for(const it of L.items){
      if(numRe.test(it.text)){
        hitNumeric = true;
        // assign to closest month column
        let bestIdx = 0, bestD = Infinity;
        for(let m=0;m<monthCols.length;m++){
          const d = Math.abs(monthCols[m].x - it.x);
          if(d < bestD){ bestD = d; bestIdx = m; }
        }
        const n = Number(it.text.replace(/[,\s]/g,'').replace(/^\((.*)\)$/, '-$1'));
        if(isFinite(n)) valsByCol[bestIdx] = n;
      } else if(!hitNumeric){
        nameParts.push(it.text);
      }
    }
    const name = nameParts.join(' ').trim();
    if(!name) continue;
    if(/^total\s/i.test(name) || /^gross\s+profit/i.test(name) || /^net\s+profit/i.test(name)) continue;
    const allZero = valsByCol.every(v => v === 0);
    if(allZero) continue;
    rows.push({ name, values: valsByCol });
  }

  return { months: monthCols.map(c => c.label), rows };
}

/* Auto-map parsed rows into COA buckets. Returns:
   {
     mapped: { [coaName]: [aggregatedValues by month] },
     unmapped: [{ name, values }]
   } */
function autoMap(parsed){
  const monthCount = parsed.months.length;
  const mapped = {};
  const unmapped = [];
  parsed.rows.forEach(r => {
    const target = mapAccount(r.name);
    if(target){
      if(!mapped[target]) mapped[target] = new Array(monthCount).fill(0);
      for(let i=0;i<monthCount;i++) mapped[target][i] += (Number(r.values[i])||0);
    } else {
      unmapped.push(r);
    }
  });
  return { mapped, unmapped };
}

/* ============ EXCEL OUTPUT BUILDER ============
   Mirrors the SKINDAE format exactly:
     - Col A: Account name
     - For each month: [Value column] [% column] [narrow spacer]
       except the LAST month which has no trailing spacer.
*/
function buildOutputWorkbook({ months, mapped, sourceFilename, entityName }){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
  const monthCount = months.length;
  const COL_WIDTHS = (function(){
    const w = [{ wch: 60 }]; // col A — account
    for(let i=0;i<monthCount;i++){
      w.push({ wch: 16 });   // value
      w.push({ wch: 9 });    // %
      if(i < monthCount - 1) w.push({ wch: 2.5 });  // spacer
    }
    return w;
  })();

  // Helpers
  const colLetter = (n) => {
    let s = ''; n = n + 1;
    while(n > 0){ const m = (n-1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n-1)/26); }
    return s;
  };
  // Column index for the value of month m (0-indexed): A=0, then for month 0 → col 1 (B), for month 1 → col 4 (E), etc.
  const valueColIdx  = (m) => 1 + m * 3;
  const pctColIdx    = (m) => 2 + m * 3;

  // Build array-of-arrays. First 3 rows = title block. Row 4 = headers.
  const aoa = [];
  const totalCols = 1 + monthCount * 3 - (monthCount > 0 ? 1 : 0); // last spacer trimmed
  const empty = () => new Array(totalCols).fill(null);

  // Row 1: "Profit and Loss"
  const r1 = empty(); r1[0] = 'Profit and Loss'; aoa.push(r1);
  // Row 2: entity name
  const r2 = empty(); r2[0] = entityName || ''; aoa.push(r2);
  // Row 3: period description
  const r3 = empty(); r3[0] = months.length > 1 ? ('From ' + months[months.length-1] + ' to ' + months[0]) : ('For the period ' + (months[0] || '')); aoa.push(r3);
  // Row 4: column headers
  const r4 = empty(); r4[0] = 'Account';
  for(let m=0; m<monthCount; m++){
    r4[valueColIdx(m)] = months[m];
    r4[pctColIdx(m)] = '%';
  }
  aoa.push(r4);

  // Track row indices we'll need to reference in formulas
  const trIncomeTotalRow = {};       // sheetRow (1-indexed) for "Total Trading Income"
  const cosTotalRow = {};
  const grossProfitRow = {};
  const otherIncomeTotalRow = {};
  const opexTotalRow = {};
  const netProfitRow = {};
  const groupRange = {};             // { groupName: { firstAcctRow, lastAcctRow } }

  // Build COA rows
  COA.forEach(item => {
    const row = empty();
    const rowIdx = aoa.length + 1;  // 1-indexed sheet row
    if(item.kind === 'header'){
      row[0] = item.group;
      aoa.push(row);
      groupRange[item.group] = { firstAcctRow: null, lastAcctRow: null, totalRow: null };
    } else if(item.kind === 'account'){
      row[0] = '    ' + item.name;
      // Get aggregated values; missing → blank (Excel shows nothing)
      for(let m=0; m<monthCount; m++){
        const arr = mapped[item.name] || null;
        const v = arr ? arr[m] : 0;
        row[valueColIdx(m)] = v;
        // % formula will reference the group total row — fill in second pass
      }
      aoa.push(row);
      const gr = groupRange[item.group];
      if(gr){
        if(gr.firstAcctRow == null) gr.firstAcctRow = rowIdx;
        gr.lastAcctRow = rowIdx;
      }
    } else if(item.kind === 'total'){
      row[0] = item.name;
      // Sum formula for each month
      const gr = groupRange[item.group] || {};
      for(let m=0; m<monthCount; m++){
        if(gr.firstAcctRow && gr.lastAcctRow){
          const c = colLetter(valueColIdx(m));
          row[valueColIdx(m)] = { f: 'SUM(' + c + gr.firstAcctRow + ':' + c + gr.lastAcctRow + ')' };
        } else {
          row[valueColIdx(m)] = 0;
        }
      }
      aoa.push(row);
      gr.totalRow = rowIdx;
      if(item.group === 'Trading Income')    trIncomeTotalRow.row = rowIdx;
      if(item.group === 'Cost of Sales')     cosTotalRow.row = rowIdx;
      if(item.group === 'Other Income')      otherIncomeTotalRow.row = rowIdx;
      if(item.group === 'Operating Expenses')opexTotalRow.row = rowIdx;
    } else if(item.kind === 'subtotal'){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        let f;
        if(item.name === 'Gross Profit'){
          f = c + trIncomeTotalRow.row + '-' + c + cosTotalRow.row;
        } else if(item.name === 'Net Profit'){
          f = c + grossProfitRow.row + '+' + c + otherIncomeTotalRow.row + '-' + c + opexTotalRow.row;
        }
        row[valueColIdx(m)] = { f: f };
      }
      aoa.push(row);
      if(item.name === 'Gross Profit') grossProfitRow.row = rowIdx;
      if(item.name === 'Net Profit')   netProfitRow.row = rowIdx;
    }
  });

  // Second pass: fill in % column formulas (divide by trading income total)
  for(let r = 5; r <= aoa.length; r++){  // row 5 is first data row (Trading Income header)
    const item = COA[r - 5];
    if(!item) continue;
    if(item.kind !== 'account' && item.kind !== 'total' && item.kind !== 'subtotal') continue;
    for(let m=0; m<monthCount; m++){
      const vc = colLetter(valueColIdx(m));
      const pc = colLetter(pctColIdx(m));
      const totalRef = vc + trIncomeTotalRow.row;
      // Build formula via the row's cell — but we already wrote .f for some;
      // % column uses a divide formula: =IFERROR(valueCell / totalRef, 0)
      const valRef = vc + r;
      aoa[r-1][pctColIdx(m)] = { f: 'IFERROR(' + valRef + '/' + totalRef + ',0)' };
    }
  }

  // ----- Build SheetJS worksheet -----
  const ws = XLSX.utils.aoa_to_sheet([], { dateNF:'yyyy-mm-dd' });

  // Pre-compute the set of % columns so we can apply percent format
  // (not the MYR format) to formula cells in those columns.
  const PCT_COLS = new Set();
  for(let m=0;m<monthCount;m++) PCT_COLS.add(pctColIdx(m));

  // Write cells one at a time so we can attach formulas + types properly
  for(let r = 0; r < aoa.length; r++){
    const rowVals = aoa[r];
    for(let c = 0; c < rowVals.length; c++){
      const v = rowVals[c];
      if(v == null) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      if(typeof v === 'object' && v.f){
        // Formula cell — also apply the appropriate number format so
        // Excel doesn't show raw decimals.
        const z = PCT_COLS.has(c) ? '0.0%;(0.0%);"-"' : '#,##0.00;(#,##0.00);"-"';
        ws[addr] = { t: 'n', f: v.f, z: z };
      } else if(typeof v === 'number'){
        ws[addr] = { t: 'n', v: v, z: '#,##0.00;(#,##0.00);"-"' };
      } else {
        ws[addr] = { t: 's', v: String(v) };
      }
    }
  }
  // Set sheet range
  ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1, c:totalCols-1} });

  // Column widths
  ws['!cols'] = COL_WIDTHS;

  // Apply number format on % columns
  for(let r = 4; r < aoa.length; r++){
    for(let m=0; m<monthCount; m++){
      const addr = XLSX.utils.encode_cell({ r, c: pctColIdx(m) });
      const cell = ws[addr];
      if(cell) cell.z = '0.0%;(0.0%);"-"';
    }
  }

  // Build the workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Profit and Loss');

  // Add an "Unmapped" sheet if there's anything that didn't map
  // (filled in by the caller via a second helper)

  return wb;
}

/* Append an "Unmapped" sheet listing source lines that didn't auto-map. */
function appendUnmappedSheet(wb, unmapped, months){
  if(!unmapped || unmapped.length === 0) return;
  const head = ['Source Account'].concat(months);
  const rows = [head].concat(unmapped.map(u => [u.name].concat(u.values)));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch:50 }].concat(months.map(() => ({ wch: 16 })));
  XLSX.utils.book_append_sheet(wb, ws, '— Unmapped —');
}

/* High-level convert(): file → Blob (xlsx) + report */
async function convertFile(file, entityName){
  const arrayBuffer = await file.arrayBuffer();
  let parsed;
  const fname = (file.name || '').toLowerCase();
  if(fname.endsWith('.pdf')){
    parsed = await parsePdf(arrayBuffer);
  } else {
    parsed = parseExcel(arrayBuffer);
  }
  if(!parsed || !parsed.rows || parsed.rows.length === 0){
    throw new Error('No data rows detected in the file. Please check the format.');
  }
  const { mapped, unmapped } = autoMap(parsed);
  const wb = buildOutputWorkbook({ months: parsed.months, mapped, sourceFilename: file.name, entityName });
  appendUnmappedSheet(wb, unmapped, parsed.months);
  // Generate file
  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const mappedCount = parsed.rows.length - unmapped.length;
  return {
    blob,
    report: {
      months: parsed.months,
      totalRows: parsed.rows.length,
      mappedCount,
      unmappedCount: unmapped.length,
      unmapped: unmapped.map(u => u.name),
      mappedAccounts: Object.keys(mapped).length
    }
  };
}

// Expose to global
global.CTGPnLConverter = {
  convertFile,
  parseExcel,
  parsePdf,
  autoMap,
  mapAccount,
  COA,
  COA_KEYWORDS
};

})(window);
