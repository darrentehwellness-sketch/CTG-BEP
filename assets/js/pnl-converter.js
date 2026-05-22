/* ============================================================
   CTG P&L CONVERTER  —  Canonical SKINDAE Template
   ============================================================
   Reads a P&L exported from ANY system (AutoCount, SQL Account,
   Xero, MYOB, generic Excel, PDF) and re-emits it in the canonical
   SKINDAE COA format:
     - exact account list, order, and section grouping
     - Calibri 10 styling with bold section headers, ruled totals,
       double-underline Gross/Net Profit
     - all subtotals + Gross Profit + Net Profit as live formulas
     - % column for each month (= account / Total Trading Income)
     - MYR number format with parens for negatives, "-" for zero

   Anything the source has that doesn't map → "— Unmapped —" sheet
   so nothing is silently lost.
   ============================================================
*/
(function(global){
'use strict';

/* ============ CANONICAL MASTER COA TEMPLATE ============
   Mirrors ChartOfAccounts.csv exactly (128 accounts). Row order
   matters — this is the row order in the output. */
const COA = [
  // === TRADING INCOME (Revenue + Return Inwards + Discount Voucher) ===
  { group:'Trading Income', kind:'header' },
  { group:'Trading Income', kind:'account', name:'Revenue - Retail Sales (O2O)' },
  { group:'Trading Income', kind:'account', name:'Revenue - WebStore Sales (Shopify)' },
  { group:'Trading Income', kind:'account', name:'Revenue - COD Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Shopee Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Lazada Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Meta Platform Sales (Facebook/Instagram/WhatsApp)' },
  { group:'Trading Income', kind:'account', name:'Revenue - TikTok Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Live Streaming Sales' },
  { group:'Trading Income', kind:'account', name:'Revenue - Exhibition Event' },
  { group:'Trading Income', kind:'account', name:'Revenue - One-Day Shop Manager Event' },
  { group:'Trading Income', kind:'account', name:'Revenue - CTG4U Platform' },
  { group:'Trading Income', kind:'account', name:'Return Inwards - COD Sales' },
  { group:'Trading Income', kind:'account', name:'Return Inwards - Shopee Sales' },
  { group:'Trading Income', kind:'account', name:'Return Inwards - Lazada Sales' },
  { group:'Trading Income', kind:'account', name:'Return Inwards - Meta Platform Sales (Facebook/Instagram/WhatsApp)' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - Shopify' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - Shopee' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - Lazada' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - TikTok' },
  { group:'Trading Income', kind:'account', name:'Discount Voucher - Others' },
  { group:'Trading Income', kind:'total',   name:'Total Trading Income' },
  { group:'',               kind:'blank' },

  // === COST OF SALES (Direct Costs) ===
  { group:'Cost of Sales',  kind:'header' },
  { group:'Cost of Sales',  kind:'account', name:'Stocks At the Beginning of Year' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Purchases of Goods' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Packaging Costs' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Promotional Items (Souvenirs)' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Inbound Transportation Costs' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Import Duties' },
  { group:'Cost of Sales',  kind:'account', name:'COGS - Goods Royalty Fees' },
  { group:'Cost of Sales',  kind:'account', name:'Purchases Return' },
  { group:'Cost of Sales',  kind:'account', name:'Stocks At the End of Year' },
  { group:'Cost of Sales',  kind:'total',   name:'Total Cost of Sales' },
  { group:'',               kind:'blank' },

  // === GROSS PROFIT ===
  { group:'Gross Profit',   kind:'gp',      name:'Gross Profit' },
  { group:'',               kind:'blank' },

  // === OTHER INCOME ===
  { group:'Other Income',   kind:'header' },
  { group:'Other Income',   kind:'account', name:'Other Income - Unknown Fund Received' },
  { group:'Other Income',   kind:'account', name:'Other Income - Bank Interest/Hibah' },
  { group:'Other Income',   kind:'account', name:'Other Income - Capital (Gain)/Loss' },
  { group:'Other Income',   kind:'account', name:'Other Income - Fixed Asset (Gain)/Loss on Disposal' },
  { group:'Other Income',   kind:'account', name:'Other Income - Shared Employees Service' },
  { group:'Other Income',   kind:'total',   name:'Total Other Income' },
  { group:'',               kind:'blank' },

  // === OPERATING EXPENSES ===
  { group:'Operating Expenses', kind:'header' },
  // -- STAFF --
  { group:'Operating Expenses', kind:'account', name:"STAFF - Director's Remuneration" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Director Employer's Contribution" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Employees Salaries & Wages" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Employees Employer's Contribution" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Bonuses & Incentives/Allowances" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Training & Development (HRDF)" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Staff Benefits" },
  { group:'Operating Expenses', kind:'account', name:"STAFF - Recruitment Expenses" },
  // -- CTG --
  { group:'Operating Expenses', kind:'account', name:"CTG - Sales Design Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Human Resource Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Project Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - O2O Hub Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Training Hub Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - E-Commerce Webstore Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - DataBees Maintenance Management Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - DataBees Hub Commission Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Shopee Hub Commission Fee 3%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - O2O Hub Commission Fee 3.8%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Tiktok Commission Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Lazada Commission Fee 3%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Supply Chain Commission Fee" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Platform Fee Commission Fee 3%" },
  { group:'Operating Expenses', kind:'account', name:"CTG - Platform Fee 30% (Community Sales/Shopee)" },
  // -- BD&M --
  { group:'Operating Expenses', kind:'account', name:"BD&M Travel - Transportation" },
  { group:'Operating Expenses', kind:'account', name:"BD&M Travel - Accommodation" },
  { group:'Operating Expenses', kind:'account', name:"BD&M Travel - Meal" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Entertainment" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Gift/Souvenirs/Sponsorship" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Live Streaming Marketing (Facebook/TikTok)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Meta Platform)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Shopee)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Lazada)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (Google)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Press Release (TikTok/XHS)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (Shopee)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (Lazada)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (TikTok)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Platform Merchant/Commission Fees (COD)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (ManyChat)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Wati)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Shopify)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Hello CRM)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Google)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - IT Software Information System (Others Marketing)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Production Cost (Design & Miscellaneous Studio)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Production Cost (Photography/Videography)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Marketing Production Cost (Model/Show Talent)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event Space Rental (Booth / Venue)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event Space Design (Booth/Venue)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Sponsorship & Advertising)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Event Crew/Show Talent/MC)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Gift/Souvenirs)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Exibition Event (Miscellaneous)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Professional Service Fees" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - KOC Collaboration Commission" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Customer Referral Fees" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Withholding Tax (8%/10%)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Sales Service Tax (6%/8%)" },
  { group:'Operating Expenses', kind:'account', name:"BD&M - Others" },
  // -- G&A --
  { group:'Operating Expenses', kind:'account', name:"G&A Travel - Transportation" },
  { group:'Operating Expenses', kind:'account', name:"G&A Travel - Accommodation" },
  { group:'Operating Expenses', kind:'account', name:"G&A Travel - Meal" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Entertaiment" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Rental" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Supplies & Logisters" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Repair & Maintenance" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Utilities" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Communication" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Ofiice IT Software Information System" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Ofiice Upkeep of IT Equipment" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Depreciation/Assets" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Office Small Value Assets" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Advertising" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Incorpation Fees" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Audit Fees" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Professional Fees/Taxation Service" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Compliance - Corp Sec & Reg Fees" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Stamping Fee/Filling Fee/Tax Duty" },
  { group:'Operating Expenses', kind:'account', name:"G&A - License/Certificate Fees" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Penalty & Compound" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Withholding Tax (8%/10%)" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Sales Service Tax (6%/8%)" },
  { group:'Operating Expenses', kind:'account', name:"G&A - Others" },
  // -- FIN --
  { group:'Operating Expenses', kind:'account', name:"FIN - Bank Charges & Handling Fees" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (Atome)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (Ahapay)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (EzBeli)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (HiPay)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Payment Gatewway Fee (Payex)" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Revaluations (Gain)/Loss on Foreign Exchange Rate Changes" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Unrealised Currency Gains" },
  { group:'Operating Expenses', kind:'account', name:"FIN - Realised Currency Gains" },
  { group:'Operating Expenses', kind:'total',   name:'Total Operating Expenses' },
  { group:'',               kind:'blank' },

  // === TAXATION ===
  { group:'Taxation',       kind:'header' },
  { group:'Taxation',       kind:'account', name:'Corparate Taxation @24%' },
  { group:'Taxation',       kind:'total',   name:'Total Taxation' },
  { group:'',               kind:'blank' },

  // === NET PROFIT (after tax) ===
  { group:'Net Profit',     kind:'np',      name:'Net Profit' }
];

/* ============ KEYWORD DICTIONARY ============
   Maps source-line keywords to canonical COA names. Order longest-first
   per target so multi-word keywords beat single-word ones. */
const COA_KEYWORDS = {
  // === Trading Income ===
  'Revenue - Retail Sales (O2O)': ['o2o', 'retail sales', 'counter sales', 'walk-in', 'walk in', 'showroom', 'pos sales'],
  'Revenue - WebStore Sales (Shopify)': ['shopify', 'webstore', 'web store', 'website sales', 'online store'],
  'Revenue - COD Sales': ['cod sales', 'cash on delivery', 'c.o.d'],
  'Revenue - Meta Platform Sales (Facebook/Instagram/WhatsApp)': ['meta platform sales', 'facebook sales', 'instagram sales', 'whatsapp sales', 'ig sales', 'fb sales', 'meta sales', 'social media sales'],
  'Revenue - Shopee Sales': ['shopee sales', 'shopee revenue', 'revenue - shopee'],
  'Revenue - Lazada Sales': ['lazada sales', 'lazada revenue', 'revenue - lazada'],
  'Revenue - Exhibition Event': ['exhibition', 'expo', 'event sales', 'fair sales', 'roadshow'],
  'Discount Voucher - Shopee': ['discount voucher shopee', 'shopee voucher', 'shopee discount', 'return inwards - shopee', 'returns shopee'],

  // === Cost of Sales ===
  'Stocks At the Beginning of Year': ['stock at beginning', 'opening stock', 'opening inventory', 'beginning inventory', 'stocks at beginning'],
  'COGS - Purchases of Goods': ['purchase of goods', 'purchases - goods', 'purchases of goods', 'goods purchase', 'cogs - purchase', 'cogs purchase', 'purchases', 'purchases return'],
  'COGS - Packaging Costs': ['packaging cost', 'packing cost', 'packaging materials', 'cogs - pack', 'cogs packaging'],
  'COGS - Promotional Items (Souvenirs)': ['promotional item', 'souvenir', 'promo item', 'gift items cogs', 'promotional items'],
  'COGS - Inbound Transportation Costs': ['inbound transport', 'inbound freight', 'inbound shipping', 'cogs - freight', 'incoming freight', 'inbound transportation'],
  'COGS - Import Duties': ['import duty', 'import duties', 'customs duty', 'customs duties', 'kastam'],
  'Stocks At the End of Year': ['stock at end', 'closing stock', 'closing inventory', 'ending inventory', 'stocks at end'],

  // === Other Income ===
  'Other Income - Unknown Fund Received': ['unknown fund', 'unidentified deposit', 'sundry income', 'miscellaneous income'],
  'Other Income - Shared Employees Service': ['shared employee', 'shared service', 'inter-co recharge', 'intercompany recharge'],

  // === STAFF ===
  "STAFF - Employees Salaries & Wages": ['staff - employees salaries', 'salaries & wages', 'salary', 'salaries', 'wages', 'wage', 'payroll', 'gaji', 'remuneration'],
  "STAFF - Employees Employer's Contribution": ["employer's contribution", 'employer contribution', 'epf', 'kwsp', 'socso', 'perkeso', 'eis', 'hrd levy', 'hrdf'],
  "STAFF - Bonuses & Incentives/Allowances": ['bonus', 'bonuses', 'incentive', 'allowance', 'commission - staff', 'commission staff', 'sales commission'],
  "STAFF - Staff Benefits": ['staff benefit', 'staff welfare', 'medical', 'insurance - staff', 'staff insurance', 'training - staff'],

  // === CTG ===
  "CTG - E-Commerce Webstore Management Fee": ['ctg - e-commerce', 'ctg - ecommerce', 'ctg webstore', 'ctg e-commerce webstore'],
  "CTG - Human Resource Management Fee": ['ctg - human resource', 'ctg hr management'],
  "CTG - O2O Hub Management Fee": ['ctg - o2o hub management', 'ctg o2o management'],
  "CTG - Sales Design Management Fee": ['ctg - sales design', 'ctg design management'],
  "CTG - Training Hub Management Fee": ['ctg - training', 'ctg training hub'],
  "CTG - Lazada Commission Fee 3%": ['ctg - lazada commission', 'ctg lazada commission'],
  "CTG - O2O Hub Commission Fee 3.8%": ['ctg - o2o hub commission', 'ctg o2o commission'],
  "CTG - Shopee Hub Commission Fee 3%": ['ctg - shopee', 'ctg shopee hub'],
  "CTG - Supply Chain Commission Fee": ['ctg - supply chain', 'ctg supply chain'],

  // === BD&M ===
  "BD&M Travel - Transportation": ['bd&m travel - transportation', 'bdm travel', 'sales travel - transport', 'business travel', 'mileage'],
  "BD&M - Gift/Souvenirs/Sponsorship": ['gift/souvenirs', 'gift expense', 'souvenir expense', 'sponsorship gift', 'corporate gift'],
  "BD&M - Marketing Press Release (Meta Platform)": ['bd&m - marketing press release (meta', 'meta ads', 'facebook ads', 'instagram ads', 'fb ads', 'ig ads', 'meta marketing'],
  "BD&M - Marketing Press Release (Shopee)": ['bd&m - marketing press release (shopee', 'shopee ads', 'shopee marketing'],
  "BD&M - Marketing Press Release (Lazada)": ['bd&m - marketing press release (lazada', 'lazada ads', 'lazada marketing'],
  "BD&M - Marketing Press Release (Google)": ['bd&m - marketing press release (google', 'google ads', 'google adwords', 'youtube ads'],
  "BD&M - Platform Merchant/Commission Fees (Shopee)": ['platform merchant/commission fees (shopee', 'platform fees shopee', 'shopee commission', 'shopee merchant fee', 'shopee platform fee'],
  "BD&M - Platform Merchant/Commission Fees (Lazada)": ['platform merchant/commission fees (lazada', 'platform fees lazada', 'lazada commission fee', 'lazada merchant fee', 'lazada platform fee'],
  "BD&M - Platform Merchant/Commission Fees (COD)": ['platform merchant/commission fees (cod', 'cod commission', 'cod fee', 'cod handling'],
  "BD&M - IT Software Information System (Shopify)": ['it software information system (shopify', 'shopify subscription', 'shopify fee', 'shopify monthly'],
  "BD&M - IT Software Information System (ManyChat)": ['manychat'],
  "BD&M - IT Software Information System (Hello CRM)": ['hello crm', 'hellocrm'],
  "BD&M - IT Software Information System (Others Marketing)": ['it software information system (others', 'mailchimp', 'klaviyo', 'hubspot', 'canva pro', 'marketing software', 'crm software'],
  "BD&M - Marketing Production Cost (Photography/Videography)": ['photography/videography', 'photography', 'videography', 'photoshoot', 'video shoot', 'film production', 'model/show talent'],
  "BD&M - Marketing Production Cost (Design & Miscellaneous Studio)": ['design & miscellaneous studio', 'studio rental', 'creative production', 'graphic design - marketing'],
  "BD&M - Exibition Event Space Rental (Booth / Venue)": ['exibition event space', 'booth rental', 'venue rental', 'exhibition rental', 'event space'],
  "BD&M - Exibition Event (Sponsorship & Advertising)": ['exibition event (sponsorship', 'event sponsorship', 'event advertising'],
  "BD&M - Exibition Event (Event Crew/Show Talent/MC)": ['event crew/show talent', 'mc fee', 'event crew', 'show talent', 'emcee', 'usher', 'event staff'],
  "BD&M - Professional Service Fees": ['bd&m - professional service', 'professional fee - marketing', 'consultant - marketing', 'agency fee'],
  "BD&M - KOC Collaboration Commission": ['koc collaboration', 'koc', 'kol', 'influencer', 'creator commission'],
  "BD&M - Customer Referral Fees": ['customer referral', 'referral fee', 'affiliate commission'],
  "BD&M - Withholding Tax (8%/10%)": ['bd&m - withholding tax', 'wht - marketing'],
  "BD&M - Sales Service Tax (6%/8%)": ['sales service tax', 'sst - sales', 'service tax - sales'],

  // === G&A ===
  "G&A Travel - Accommodation": ['g&a travel - accommodation', 'g&a travel', 'accommodation', 'hotel', 'lodging', 'travel - admin'],
  "G&A - Office Supplies & Logisters": ['office supplies', 'stationery', 'office consumables', 'pantry'],
  "G&A - Ofiice IT Software Information System": ['office it software', 'ofiice it software', 'microsoft 365', 'google workspace', 'office subscription', 'it admin'],
  "G&A - Office Depreciation/Assets": ['office depreciation', 'depreciation', 'amortisation', 'amortization', 'office asset', 'fixed asset write off'],
  "G&A - Professional Fees/Taxation Service": ['professional fees/taxation', 'audit fee', 'accounting fee', 'tax agent', 'tax consultant', 'company secretary fee'],
  "G&A - Compliance - Corp Sec & Reg Fees": ['compliance - corp sec', 'corp sec', 'ssm', 'companies commission', 'registration fee', 'license fee', 'g&a - office rental'],
  "G&A - Stamping Fee/Filling Fee/Tax Duty": ['stamping fee/filling', 'stamp duty', 'stamping', 'filing fee', 'filling fee'],
  "G&A - Penalty & Compound": ['penalty', 'compound', 'fine', 'late fee'],
  "G&A - Withholding Tax (8%/10%)": ['g&a - withholding tax', 'withholding tax', 'wht'],

  // === FIN ===
  "FIN - Bank Charges & Handling Fees": ['bank charges', 'bank fee', 'handling fee', 'transfer fee'],
  "FIN - Payment Gatewway Fee (Atome)": ['payment gatewway fee (atome', 'atome'],
  "FIN - Payment Gatewway Fee (Ahapay)":['payment gatewway fee (ahapay','ahapay'],
  "FIN - Payment Gatewway Fee (EzBeli)":['payment gatewway fee (ezbeli','ezbeli'],
  "FIN - Payment Gatewway Fee (HiPay)": ['payment gatewway fee (hipay','hipay'],
  "FIN - Payment Gatewway Fee (Payex)": ['payment gatewway fee (payex', 'payex'],
  "Corparate Taxation @24%":            ['corparate taxation','corporate taxation','corporate tax','corp tax','tax @24','tax@24'],
  "FIN - Realised Currency Gains": ['realised currency gain', 'realized currency gain', 'realised fx gain'],
  "FIN - Revaluations (Gain)/Loss on Foreign Exchange Rate Changes": ['revaluations (gain)/loss', 'fx revaluation', 'foreign exchange revaluation', 'forex loss', 'fx loss'],
  "FIN - Unrealised Currency Gains": ['unrealised currency gain', 'unrealized currency gain', 'unrealised fx gain']
};

function normalizeName(s){
  return String(s||'').toLowerCase()
    .replace(/[–—]/g,'-')
    .replace(/[^a-z0-9&/\-\(\)\s\.\%]/g,' ')
    .replace(/\s+/g,' ').trim();
}

/* Build a flat lookup index sorted longest-keyword-first so specific
   matches win (e.g. "shopee commission" matches before "shopee").
   Also AUTO-REGISTERS each canonical COA name as a keyword for itself
   so any source file that uses the exact canonical name maps 1:1.
   Wrapped in try/catch so a malformed entry can't break script load. */
const KEYWORD_INDEX = (function(){
  const idx = [];
  try {
    // 1) Auto-register canonical names as self-matching keywords
    COA.forEach(item => {
      if(item && item.kind === 'account' && item.name){
        const kw = normalizeName(item.name);
        if(kw) idx.push({ kw, target: item.name });
      }
    });
    // 2) Then the explicit fuzzy keywords
    Object.keys(COA_KEYWORDS).forEach(target => {
      const kws = COA_KEYWORDS[target];
      if(!Array.isArray(kws)) return;
      kws.forEach(kw => {
        if(typeof kw === 'string' && kw.length > 0){
          idx.push({ kw: kw.toLowerCase(), target });
        }
      });
    });
  } catch(e) {
    console.error('KEYWORD_INDEX build failed:', e);
  }
  // Longest-first so more specific matches win
  idx.sort((a,b) => b.kw.length - a.kw.length);
  return idx;
})();
function mapAccount(sourceName){
  if(!sourceName) return null;
  const n = normalizeName(sourceName);
  for(const { kw, target } of KEYWORD_INDEX){
    if(n.indexOf(kw) !== -1) return target;
  }
  return null;
}

/* ============================================================
   AI THINKING — multi-signal classifier with reasoning
   ============================================================
   Scores each source line against every canonical COA account
   using a weighted blend of:
     - Exact-name match           (100% confidence — instant win)
     - Keyword dictionary hit     (85-95% — strong signal)
     - Section-prefix alignment   (e.g. STAFF/CTG/BD&M match)
     - Token overlap (Jaccard-ish on non-stop words)
     - Substring match (any direction)
     - Semantic-bucket hints      (epf → STAFF, ads → BD&M, etc.)
   Then picks the highest-scoring canonical bucket and produces a
   human-readable explanation of WHY it picked that bucket.
   ============================================================ */

// Stop words ignored in token matching
const STOP_WORDS = new Set(['the','a','an','of','at','to','for','in','on','with','and','&','-','&amp;','&m','m','&a','fee','fees','cost','costs','expense','expenses','income','revenue']);

// Known financial sections — prefix-match boost
const SECTIONS = ['staff','ctg','bd&m','g&a','fin','cogs','revenue','other income','stocks','discount voucher'];

// Semantic anchors — tokens that strongly suggest a section
const SEMANTIC_HINTS = [
  // STAFF cues
  { tokens:['salary','salaries','wage','wages','gaji','payroll','remuneration','director'], section:'staff' },
  { tokens:['epf','kwsp','socso','perkeso','eis','hrdf','hrd','contribution'],              section:'staff' },
  { tokens:['bonus','incentive','allowance','allowances'],                                  section:'staff' },
  { tokens:['benefit','welfare','medical','insurance','training','recruitment'],            section:'staff' },
  // BD&M cues
  { tokens:['ads','advertis','marketing','press','release','adwords','sem'],                section:'bd&m' },
  { tokens:['shopee','lazada','tiktok','meta','facebook','instagram','google','xhs','xiaohongshu','livestream','streaming'], section:'bd&m' },
  { tokens:['photography','videography','photoshoot','design','studio','model','talent'],   section:'bd&m' },
  { tokens:['exhibition','exibition','expo','event','booth','venue','sponsorship'],         section:'bd&m' },
  { tokens:['koc','kol','influencer','referral','affiliate'],                               section:'bd&m' },
  { tokens:['manychat','wati','crm'],                                                       section:'bd&m' },
  { tokens:['entertainment'],                                                               section:'bd&m' },
  // G&A cues
  { tokens:['office','stationery','utilities','communication','rental','rent','repair','maintenance','upkeep'], section:'g&a' },
  { tokens:['audit','accounting','tax','agent','secretary','ssm','incorporation','incorpation','license','certificate'], section:'g&a' },
  { tokens:['stamp','stamping','filing','filling','penalty','compound','fine'],             section:'g&a' },
  { tokens:['depreciation','amortisation','amortization','asset','assets'],                 section:'g&a' },
  { tokens:['entertaiment'],                                                                section:'g&a' },  // sic — typo preserved from CSV
  // FIN cues
  { tokens:['bank','charge','charges','transfer','handling','gateway','gatewway'],          section:'fin' },
  { tokens:['atome','payex','hipay','ipay88','fiuu','stripe','ezbeli','ahapay'],            section:'fin' },
  { tokens:['fx','forex','currency','foreign','exchange','realised','realized','unrealised','unrealized','revaluation'], section:'fin' },
  // CTG (inter-co) cues
  { tokens:['ctg','databees'],                                                              section:'ctg' },
  { tokens:['management','hub','commission'],                                               section:'ctg' },
  // COGS cues
  { tokens:['cogs','purchase','purchases','packaging','packing','souvenir','souvenirs','inbound','freight','duty','duties','customs','kastam','stocks','inventory','royalty'], section:'cogs' },
  // Revenue cues
  { tokens:['sales','revenue','retail','webstore','shopify','o2o','cod'],                   section:'revenue' },
  { tokens:['ctg4u','one-day','one day','live','livestream','streaming'],                   section:'revenue' },
  { tokens:['return','inwards','refund','refunds'],                                         section:'revenue' },
  { tokens:['discount','voucher','vouchers'],                                               section:'revenue' },
  // Other Income cues
  { tokens:['hibah','interest','capital','disposal'],                                       section:'other income' },
  // Taxation cues
  { tokens:['corporate','corparate','corp','taxation'],                                     section:'taxation' }
];

function tokenize(s){
  return normalizeName(s)
    .replace(/[\(\)\-\/\.]/g,' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOP_WORDS.has(t));
}

// Edit-distance (Levenshtein) — used for typo tolerance
function levenshtein(a, b){
  if(a === b) return 0;
  const al = a.length, bl = b.length;
  if(al === 0) return bl;
  if(bl === 0) return al;
  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for(let i=0; i<=bl; i++) v0[i] = i;
  for(let i=0; i<al; i++){
    v1[0] = i + 1;
    for(let j=0; j<bl; j++){
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j+1] = Math.min(v1[j] + 1, v0[j+1] + 1, v0[j] + cost);
    }
    for(let j=0; j<=bl; j++) v0[j] = v1[j];
  }
  return v0[bl];
}

function detectSection(tokens){
  // Walk source tokens, see which semantic section gets the most hits
  const hits = {};
  for(const t of tokens){
    for(const hint of SEMANTIC_HINTS){
      for(const tk of hint.tokens){
        if(t === tk || t.indexOf(tk) !== -1 || tk.indexOf(t) !== -1){
          hits[hint.section] = (hits[hint.section] || 0) + 1;
          break;
        }
      }
    }
  }
  let bestSection = null, bestCount = 0;
  Object.keys(hits).forEach(s => { if(hits[s] > bestCount){ bestSection = s; bestCount = hits[s]; } });
  return { section: bestSection, count: bestCount };
}

function targetSection(canonicalName){
  const n = canonicalName.toLowerCase();
  if(n.startsWith('staff'))         return 'staff';
  if(n.startsWith('ctg'))           return 'ctg';
  if(n.startsWith('bd&m'))          return 'bd&m';
  if(n.startsWith('g&a'))           return 'g&a';
  if(n.startsWith('fin'))           return 'fin';
  if(n.startsWith('cogs'))          return 'cogs';
  if(n.startsWith('revenue'))       return 'revenue';
  if(n.startsWith('other income'))  return 'other income';
  if(n.startsWith('stocks'))        return 'cogs';     // stock movements live in COS
  if(n.startsWith('purchases'))     return 'cogs';     // Purchases Return
  if(n.startsWith('discount'))      return 'revenue';
  if(n.startsWith('return inwards'))return 'revenue';
  if(n.startsWith('corparate'))     return 'taxation'; // sic — matches the CSV typo
  if(n.startsWith('corporate'))     return 'taxation';
  return null;
}

/* ============================================================
   DOCUMENT ANALYSIS (Pass 1)
   ============================================================
   Before classifying each row, walk the whole document to build
   intelligence — section context, naming style, anomalies. That
   context then feeds into the per-row classifier in Pass 2.
   ============================================================ */

// Match a row name to a canonical P&L section
function detectSourceSection(name){
  const n = String(name||'').toLowerCase().trim();
  if(!n) return null;
  if(/^(trading income|sales|revenue|turnover|operating revenue)$/i.test(n)) return 'Trading Income';
  if(/^(cost of sales|cost of goods sold|cogs|direct cost|direct costs)$/i.test(n)) return 'Cost of Sales';
  if(/^(gross profit)/i.test(n)) return null;       // computed, not a section
  if(/^(other income|miscellaneous income|sundry income|non[-\s]?operating income)$/i.test(n)) return 'Other Income';
  if(/^(operating expenses|administrative expenses|expenses|less:.*expenses|overhead)$/i.test(n)) return 'Operating Expenses';
  if(/^(finance (cost|costs|expenses|income)|finance|interest expense)$/i.test(n)) return 'Operating Expenses';
  if(/^(staff (costs|cost|expenses)|payroll)$/i.test(n)) return 'Operating Expenses';
  if(/^(taxation|tax expense|income tax|provision for taxation|corporate tax)$/i.test(n)) return 'Taxation';
  return null;
}

// What canonical section does this CANONICAL COA name belong to?
function canonicalSectionOf(canonicalName){
  for(const item of COA){
    if(item.kind === 'account' && item.name === canonicalName){
      return item.group;  // 'Trading Income' | 'Cost of Sales' | etc.
    }
  }
  return null;
}

// Pass 1 — analyze the whole document, return context per source row +
// document-level intelligence used in Pass 2.
function analyzeDocument(parsed){
  const rows = parsed.rows || [];
  // Count how many rows look like canonical names (prefix match)
  const canonicalNameRe = /^(staff|ctg|bd&m|g&a|fin|cogs|revenue|return inwards|discount voucher|stocks|other income|purchases return|corparate)/i;
  const canonicalHits = rows.filter(r => canonicalNameRe.test(r.name)).length;
  const total = Math.max(rows.length, 1);
  const canonicalRatio = canonicalHits / total;
  // Naming style heuristic — over 50% canonical = source uses our COA format
  const namingStyle = canonicalRatio >= 0.5 ? 'canonical' : 'generic';

  // Did the parser find any section headers at all?
  const sectionsFound = new Set();
  rows.forEach(r => { if(r.sourceSection) sectionsFound.add(r.sourceSection); });

  // Negative-value rows — likely contra-accounts (returns / discounts / stock adjustments)
  const negativeIdx = new Set();
  rows.forEach((r, idx) => {
    const allNeg = r.values && r.values.length > 0 && r.values.every(v => v <= 0) && r.values.some(v => v < 0);
    if(allNeg) negativeIdx.add(idx);
  });

  return {
    namingStyle,           // 'canonical' or 'generic'
    canonicalRatio,        // 0..1
    sectionsFound: Array.from(sectionsFound),
    hasStructuredSections: sectionsFound.size > 0,
    negativeIdx,           // Set of row indices with all-negative values
    rowCount: rows.length
  };
}

/* ============================================================
   SENIOR ACCOUNTANT RULE ENGINE
   ============================================================
   Each rule encodes professional judgment from an ACCA-qualified
   Senior Accountant / Finance Controller perspective. Rules are
   evaluated in priority order (most specific first). Each carries:
     - any:        array of tokens — at least one must appear
     - none:       (optional) tokens that disqualify the rule
     - target:     canonical COA account name (must match COA exactly)
     - conf:       confidence 60-95 (rule-based matches max at 95;
                   exact-name match still wins at 100)
     - why:        professional reasoning shown to the user
   ============================================================ */
const SENIOR_RULES = [
  // ==================== STAFF ====================
  {
    any:['director'], none:['epf','kwsp','contribution','socso','perkeso','eis','training','recruitment'],
    target:"STAFF - Director's Remuneration", conf:92,
    why:"Director's fees / salary are recognized as director's remuneration per MFRS 119 and disclosed separately from staff salaries (Companies Act 2016 s.252 disclosure)."
  },
  {
    any:['director'], some:['epf','kwsp','contribution','socso'],
    target:"STAFF - Director Employer's Contribution", conf:92,
    why:"Employer's statutory contributions for directors (EPF/SOCSO/EIS) are reported under director's contribution — a Companies Act 2016 disclosure requirement separate from staff contributions."
  },
  {
    any:['salary','salaries','wage','wages','gaji','payroll','remuneration'], none:['director','contribution','epf','socso','training','recruitment','commission'],
    target:"STAFF - Employees Salaries & Wages", conf:92,
    why:"Employee salaries & wages are recognized as employee benefits expense (MFRS 119). Distinct from director's remuneration and from sales commissions (which go to BD&M when paid to external parties)."
  },
  {
    any:['epf','kwsp','socso','perkeso','eis','hrdf levy','employer contribution',"employer's contribution"], none:['director'],
    target:"STAFF - Employees Employer's Contribution", conf:90,
    why:"EPF (KWSP), SOCSO (PERKESO), EIS and HRDF Levy are mandatory employer-borne statutory contributions for employees — recognized as employee benefits expense per MFRS 119."
  },
  {
    any:['bonus','bonuses','incentive','incentives','sales commission - staff','staff commission','allowance','allowances'], none:['director'],
    target:"STAFF - Bonuses & Incentives/Allowances", conf:90,
    why:"Bonuses, incentives and allowances paid to employees are short-term employee benefits (MFRS 119). Staff commissions also belong here — distinct from BD&M platform/affiliate commissions paid to external parties."
  },
  {
    any:['training','development','course','seminar','workshop','hrdf course','hrdc'], none:['recruitment'],
    target:"STAFF - Training & Development (HRDF)", conf:88,
    why:"Staff training & development costs (including HRDF/HRDC-claimable training) are employee benefits per MFRS 119, recognized in the period the service is consumed."
  },
  {
    any:['recruitment','hiring','headhunt','job ad','jobstreet','linkedin recruit'],
    target:"STAFF - Recruitment Expenses", conf:90,
    why:"Recruitment costs (agency fees, job postings, hiring tools) are period costs — recognized when incurred and not capitalized as part of any asset."
  },
  {
    any:['staff benefit','staff welfare','medical','group insurance','insurance - staff','annual dinner','staff event'],
    target:"STAFF - Staff Benefits", conf:88,
    why:"Welfare / medical / group insurance / staff functions are employee benefits expense (MFRS 119). Excludes statutory contributions (which go to Employer's Contribution)."
  },

  // ==================== CTG (inter-co) ====================
  {
    any:['ctg'], some:['e-commerce','ecommerce','webstore','shopify management'],
    target:"CTG - E-Commerce Webstore Management Fee", conf:90,
    why:"Inter-company management fee for the e-commerce webstore function. Per MFRS 124 (Related Party Disclosures), inter-co charges must be on arm's-length terms and disclosed separately."
  },
  { any:['ctg - human','ctg hr','ctg - hr'], target:"CTG - Human Resource Management Fee", conf:90, why:"Inter-company HR management charge. Disclosed under MFRS 124 related-party transactions." },
  { any:['ctg project','ctg - project'],     target:"CTG - Project Management Fee", conf:90, why:"Inter-company project management charge. MFRS 124 disclosure required." },
  { any:['ctg o2o','ctg - o2o'], some:['management'], target:"CTG - O2O Hub Management Fee", conf:88, why:"Inter-company O2O hub management charge. MFRS 124 disclosure." },
  { any:['ctg o2o','ctg - o2o'], some:['commission'], target:"CTG - O2O Hub Commission Fee 3.8%", conf:88, why:"Inter-company O2O hub commission (3.8% of relevant revenue). Variable-rate inter-co charge — MFRS 124." },
  { any:['ctg - sales design','ctg sales design'], target:"CTG - Sales Design Management Fee", conf:88, why:"Inter-company sales design support charge — MFRS 124 disclosure." },
  { any:['ctg - training','ctg training hub'], target:"CTG - Training Hub Management Fee", conf:88, why:"Inter-company training hub management charge — MFRS 124." },
  { any:['ctg - databees','databees - maintenance','databees maintenance'], target:"CTG - DataBees Maintenance Management Fee", conf:90, why:"Inter-company DataBees platform maintenance — MFRS 124." },
  { any:['ctg - databees commission','databees commission'], target:"CTG - DataBees Hub Commission Fee", conf:90, why:"Inter-company DataBees hub commission — MFRS 124." },
  { any:['ctg shopee','ctg - shopee'], target:"CTG - Shopee Hub Commission Fee 3%", conf:88, why:"Inter-company Shopee hub commission (3%) — MFRS 124." },
  { any:['ctg lazada','ctg - lazada'], target:"CTG - Lazada Commission Fee 3%", conf:88, why:"Inter-company Lazada commission (3%) — MFRS 124." },
  { any:['ctg tiktok','ctg - tiktok'], target:"CTG - Tiktok Commission Fee", conf:88, why:"Inter-company TikTok commission — MFRS 124." },
  { any:['ctg supply chain','ctg - supply chain'], target:"CTG - Supply Chain Commission Fee", conf:88, why:"Inter-company supply-chain management commission — MFRS 124." },
  { any:['platform fee 30%','community sales/shopee'], target:"CTG - Platform Fee 30% (Community Sales/Shopee)", conf:90, why:"Inter-company community-sales platform fee (30% bracket) — MFRS 124." },
  { any:['platform fee commission'], target:"CTG - Platform Fee Commission Fee 3%", conf:85, why:"Inter-company platform commission (3% bracket) — MFRS 124." },

  // ==================== BD&M ====================
  {
    any:['fb ads','meta ads','facebook ads','instagram ads','ig ads','meta advertising','whatsapp ads'],
    target:"BD&M - Marketing Press Release (Meta Platform)", conf:92,
    why:"Paid advertising on Meta-owned platforms (Facebook / Instagram / WhatsApp) — marketing expense. Note: WHT may apply if billed via Meta Ireland — check LHDN's withholding tax guidance for digital services."
  },
  { any:['google ads','google adwords','adwords','sem','youtube ads','google marketing'], target:"BD&M - Marketing Press Release (Google)", conf:92, why:"Paid advertising on Google / YouTube / Search. WHT (8-10%) typically applies to Google Asia Pacific Pte Ltd billings — withhold and remit via CP37D." },
  { any:['shopee ads','shopee marketing','shopee promotion','shopee boost'], target:"BD&M - Marketing Press Release (Shopee)", conf:92, why:"Shopee-platform paid promotions / ads / boost packs — marketing expense, not a commission." },
  { any:['lazada ads','lazada marketing','lazada sponsored','lazada boost'], target:"BD&M - Marketing Press Release (Lazada)", conf:92, why:"Lazada-platform paid promotions / sponsored listings — marketing expense, not commission." },
  { any:['tiktok ads','xhs','xiaohongshu','tiktok shop ads','tiktok marketing'], target:"BD&M - Marketing Press Release (TikTok/XHS)", conf:90, why:"Paid promotions on TikTok / Xiaohongshu (XHS) — marketing expense. WHT may apply on digital ad services billed offshore." },
  { any:['live streaming','livestream marketing','live stream cost'], target:"BD&M - Live Streaming Marketing (Facebook/TikTok)", conf:88, why:"Live-streaming marketing campaign costs (host fees, platform boost, gifting). Distinct from Live Streaming SALES revenue." },

  { any:['shopee commission','shopee fee','shopee merchant fee','shopee service fee','shopee transaction fee'], target:"BD&M - Platform Merchant/Commission Fees (Shopee)", conf:92, why:"Marketplace commission deducted by Shopee on each transaction. Substance: merchant fee for using the platform. Distinct from Shopee ads (marketing) and CTG Shopee Hub commission (inter-co)." },
  { any:['lazada commission','lazada fee','lazada merchant','lazada service'], target:"BD&M - Platform Merchant/Commission Fees (Lazada)", conf:92, why:"Marketplace commission deducted by Lazada. Distinct from Lazada ads and CTG Lazada commission." },
  { any:['tiktok commission','tiktok shop fee','tiktok merchant'], target:"BD&M - Platform Merchant/Commission Fees (TikTok)", conf:92, why:"TikTok Shop platform commission on transactions." },
  { any:['cod commission','cod handling','cod fee'], target:"BD&M - Platform Merchant/Commission Fees (COD)", conf:88, why:"Cash-on-delivery courier handling fee per transaction." },

  { any:['shopify subscription','shopify monthly','shopify plan'], target:"BD&M - IT Software Information System (Shopify)", conf:92, why:"Shopify monthly software subscription — recognized over the subscription period. Distinct from Shopify sales revenue or any payment-gateway processing fees on Shopify orders." },
  { any:['manychat'], target:"BD&M - IT Software Information System (ManyChat)", conf:95, why:"ManyChat (Messenger/WhatsApp automation) — marketing tool subscription." },
  { any:['wati'], target:"BD&M - IT Software Information System (Wati)", conf:95, why:"Wati WhatsApp Business API platform — marketing CRM subscription." },
  { any:['hello crm','hellocrm'], target:"BD&M - IT Software Information System (Hello CRM)", conf:95, why:"Hello CRM marketing automation subscription." },
  { any:['google workspace','google one','google ads tool','google marketing platform'], some:['marketing'], target:"BD&M - IT Software Information System (Google)", conf:80, why:"Google marketing-purpose subscription. (If office/admin use → G&A Office IT Software.)" },
  { any:['mailchimp','klaviyo','hubspot','canva pro','marketing crm','sendgrid'], target:"BD&M - IT Software Information System (Others Marketing)", conf:90, why:"Generic marketing-stack SaaS subscription (email/CRM/design)." },

  { any:['photography','videography','photoshoot','video shoot','photo session','content production'], target:"BD&M - Marketing Production Cost (Photography/Videography)", conf:92, why:"Photography / videography production costs for marketing assets — recognized when incurred (MFRS 138 — internally-generated brand-related costs are expensed, not capitalized)." },
  { any:['model fee','show talent','influencer fee','model session'], target:"BD&M - Marketing Production Cost (Model/Show Talent)", conf:92, why:"Talent fees paid to models / hosts / influencers for production sessions. WHT 10% typically applies if paid to non-resident — CP37." },
  { any:['design studio','creative studio','graphic design'], some:['marketing','design'], target:"BD&M - Marketing Production Cost (Design & Miscellaneous Studio)", conf:80, why:"External design studio production costs for marketing collateral — expense when incurred." },

  { any:['booth rental','venue rental','exhibition rental','event space'], target:"BD&M - Exibition Event Space Rental (Booth / Venue)", conf:92, why:"Rental of exhibition booth or event venue — short-term operating cost, expensed in the period (MFRS 16 short-term lease exemption typically applies for events <12 months)." },
  { any:['booth design','space design','exhibition build','booth construction'], target:"BD&M - Exibition Event Space Design (Booth/Venue)", conf:90, why:"Booth/venue design & build costs for exhibitions — expensed when consumed; not capitalized as fixed assets (use-life typically < 12 months)." },
  { any:['mc fee','emcee','event crew','show talent - event','usher'], target:"BD&M - Exibition Event (Event Crew/Show Talent/MC)", conf:90, why:"Event crew / MC / show-talent fees during exhibitions — services consumed in the event period." },
  { any:['event sponsorship','exhibition sponsorship','event advertising'], target:"BD&M - Exibition Event (Sponsorship & Advertising)", conf:88, why:"Sponsorship paid to event organizers or advertising bought within an event — marketing expense." },
  { any:['event gift','event souvenir','exhibition giveaway'], target:"BD&M - Exibition Event (Gift/Souvenirs)", conf:85, why:"Gifts & souvenirs distributed at events — marketing expense (not deductible for income tax under s.39(1)(L) ITA if entertainment to non-related parties — check LHDN PR 4/2015)." },
  { any:['exhibition miscellaneous','event miscellaneous','event misc'], target:"BD&M - Exibition Event (Miscellaneous)", conf:75, why:"Miscellaneous event-related costs not falling into other event sub-buckets." },

  { any:['koc','kol','influencer collaboration','influencer commission'], target:"BD&M - KOC Collaboration Commission", conf:92, why:"Influencer / KOC / KOL commission on sales attributed to their content — WHT 10% applies for non-resident creators per ITA s.4A and PR 11/2018." },
  { any:['customer referral','affiliate commission','referral fee - customer'], target:"BD&M - Customer Referral Fees", conf:88, why:"Referral fees paid to customers or affiliates for bringing in new business — marketing expense; SST 8% may apply if recipient is registered." },
  { any:['entertainment - sales','client entertainment','client meal','entertainment marketing'], target:"BD&M - Entertainment", conf:88, why:"Client/customer entertainment — only 50% deductible for income tax (ITA s.39(1)(L)). Recognize full amount as expense; the 50% addback is a tax-computation adjustment." },
  { any:['gift','souvenir','sponsorship'], none:['exhibition','event','customer','staff'], target:"BD&M - Gift/Souvenirs/Sponsorship", conf:80, why:"Gifts / souvenirs / sponsorships given to external parties for marketing purposes." },
  { any:['bd&m travel - accommodation','bdm travel accommodation','sales travel hotel'], target:"BD&M Travel - Accommodation", conf:90, why:"Hotel/lodging for sales/marketing staff during business trips — distinct from G&A Travel (admin trips)." },
  { any:['bd&m travel - meal','bdm travel meal','sales meal'], target:"BD&M Travel - Meal", conf:88, why:"Meals during sales/marketing business trips — deductible at full cost (not entertainment if no customer present)." },
  { any:['bd&m travel - transportation','sales travel transportation','sales mileage','sales taxi'], target:"BD&M Travel - Transportation", conf:88, why:"Transportation (mileage / taxi / Grab) for sales/marketing staff — distinct from G&A admin travel." },
  { any:['bd&m - withholding tax','wht - marketing','wht on koc'], target:"BD&M - Withholding Tax (8%/10%)", conf:90, why:"Withholding tax on marketing-related payments (KOC, agency, non-resident services). Borne by the payer if not deducted at source — booked as an expense per LHDN practice." },
  { any:['sst - sales','sst output','sales service tax (6%','sales service tax (8%'], target:"BD&M - Sales Service Tax (6%/8%)", conf:85, why:"Output SST charged on taxable sales / services. Goes to BD&M Sales SST if it's the unrecovered portion or a reclass; usually netted against output SST liability." },
  { any:['bd&m - professional','marketing consultant','agency fee - marketing'], target:"BD&M - Professional Service Fees", conf:80, why:"Professional fees for marketing-specific consulting / agency work. Distinct from G&A Professional Fees (audit, tax, legal)." },
  { any:['bd&m - others','other marketing expense'], target:"BD&M - Others", conf:65, why:"Catch-all for marketing-related expenses not fitting any specific bucket." },

  // ==================== G&A ====================
  { any:['office rent','premise rent','office rental','shop rental'], none:['booth','exhibition','event'], target:"G&A - Office Rental", conf:92, why:"Office/premise lease cost. Per MFRS 16, treat as ROU asset + lease liability unless short-term (<12mo) or low-value — then expensed on straight-line basis." },
  { any:['electricity','tnb','water','syabas','indah water','utility','utilities','astro'], target:"G&A - Office Utilities", conf:92, why:"Utilities (TNB / Syabas / Indah Water / etc.) — recognized when consumed." },
  { any:['phone bill','mobile plan','postpaid','prepaid - office','internet','wifi','unifi','tm','maxis','digi','celcom'], target:"G&A - Office Communication", conf:92, why:"Communication services (phone / mobile / internet / unifi) — recognized when consumed." },
  { any:['stationery','pantry','office supplies','printing supplies','letterhead'], target:"G&A - Office Supplies & Logisters", conf:90, why:"Office consumables & supplies — period expense." },
  { any:['office repair','repair & maintenance','aircon service'], target:"G&A - Office Repair & Maintenance", conf:90, why:"Repairs that maintain (not enhance) office assets — expensed per MFRS 116. Major enhancements that extend useful life should be capitalized." },
  { any:['it equipment upkeep','computer repair','it support'], target:"G&A - Ofiice Upkeep of IT Equipment", conf:88, why:"Upkeep/maintenance of IT equipment (not new purchases). Repairs are expensed; upgrades that meet the recognition criteria (MFRS 116) should be capitalized." },
  { any:['microsoft 365','office 365','google workspace','autocount','sql account','xero','quickbooks','myob'], target:"G&A - Ofiice IT Software Information System", conf:92, why:"Office/admin productivity & accounting software subscriptions — period expense. Distinct from BD&M IT (marketing tools)." },
  { any:['depreciation','amortisation','amortization','accumulated depreciation'], target:"G&A - Office Depreciation/Assets", conf:92, why:"Depreciation expense on office PPE (MFRS 116) / amortization on intangibles (MFRS 138). Calculated over useful life on straight-line or chosen method." },
  { any:['small value asset','low value asset','svca','non capital'], target:"G&A - Office Small Value Assets", conf:88, why:"Assets below capitalization threshold (per company policy, typically RM2,000 each) — expensed in year of acquisition. Tax: full SVCA deduction under Sch 3 Para 19A ITA capped at RM20k/yr." },
  { any:['newspaper ad','newspaper advertisement','radio ad','generic advertising'], none:['shopee','lazada','meta','google','tiktok'], target:"G&A - Advertising", conf:80, why:"Generic / corporate advertising (newspaper, radio, billboard) — distinct from BD&M digital marketing which is platform-specific." },
  { any:['incorpation fee','incorporation fee','company setup'], target:"G&A - Incorpation Fees", conf:90, why:"Company incorporation / setup fees — typically not tax-deductible as incurred before commencement (s.33(1) ITA); check tax treatment." },
  { any:['audit fee','external audit'], target:"G&A - Audit Fees", conf:95, why:"Statutory audit fees per Companies Act 2016 s.266 — recognized in the period audited. Fully tax-deductible." },
  { any:['tax agent','tax filing','taxation service','tax computation','tax consultant'], target:"G&A - Professional Fees/Taxation Service", conf:92, why:"Professional fees for tax compliance & consulting (filing CP204, Form C, etc.). Distinct from audit (which has its own account)." },
  { any:['corp sec','company secretary','ssm','companies commission','annual return','ar fee'], target:"G&A - Compliance - Corp Sec & Reg Fees", conf:92, why:"Company secretary retainer + SSM annual returns / regulatory fees — corporate governance compliance per Companies Act 2016." },
  { any:['stamp duty','setem','filing fee','filling fee','court fee'], target:"G&A - Stamping Fee/Filling Fee/Tax Duty", conf:90, why:"Stamp duty (Stamp Act 1949) on agreements / share transfers / loans + filing fees at government registries." },
  { any:['license','certificate','business license','signage license','dbkl license','majlis'], target:"G&A - License/Certificate Fees", conf:88, why:"Business licenses, signage licenses, council fees (DBKL/MBPJ/etc.) — annually recurring period costs." },
  { any:['penalty','compound','fine','late fee','late charge'], target:"G&A - Penalty & Compound", conf:92, why:"Penalties / fines / compounds — NOT tax-deductible under s.39(1)(l) ITA. Disclose separately for the tax computation addback." },
  { any:['g&a - withholding','withholding tax','wht'], none:['marketing','koc'], target:"G&A - Withholding Tax (8%/10%)", conf:80, why:"Withholding tax on non-marketing payments (professional fees, royalties, rent to non-residents) — payer-borne where not deducted; check LHDN PR 11/2018." },
  { any:['g&a - sales service tax','sst on g&a','sst input'], target:"G&A - Sales Service Tax (6%/8%)", conf:75, why:"Unrecoverable input SST on admin purchases — included in expense base." },
  { any:['g&a travel - transportation','admin travel transport'], target:"G&A Travel - Transportation", conf:88, why:"Transportation costs for admin/director travel — distinct from BD&M Travel (sales/marketing trips)." },
  { any:['g&a travel - accommodation','admin hotel','director hotel'], target:"G&A Travel - Accommodation", conf:88, why:"Admin/director accommodation during business travel — full expense, no entertainment 50% rule." },
  { any:['g&a travel - meal','admin meal','director meal'], target:"G&A Travel - Meal", conf:85, why:"Admin/director meal during business travel — fully deductible if no clients present (otherwise entertainment 50% rule)." },
  { any:['entertaiment','staff entertainment','company dinner','team building'], target:"G&A - Entertaiment", conf:80, why:"Staff entertainment (annual dinner, team building) — 100% deductible per LHDN PR 4/2015 if for ALL staff. CSV preserves the 'entertaiment' typo from the master COA." },
  { any:['g&a - others','other admin','sundry admin'], target:"G&A - Others", conf:65, why:"Catch-all for admin expenses not fitting any specific G&A bucket." },

  // ==================== FIN ====================
  { any:['bank charge','bank fee','handling fee','cheque fee','tt fee','transfer fee','iban fee'], target:"FIN - Bank Charges & Handling Fees", conf:92, why:"Bank service charges — finance cost. Borne by the entity for banking services, distinct from payment-gateway fees on customer transactions." },
  { any:['atome'], target:"FIN - Payment Gatewway Fee (Atome)", conf:95, why:"Atome BNPL transaction fees — netted from settlements. Recognize at gross sales + separately recognize the fee expense per MFRS 15." },
  { any:['ahapay'], target:"FIN - Payment Gatewway Fee (Ahapay)", conf:95, why:"Ahapay payment gateway transaction fees." },
  { any:['ezbeli'], target:"FIN - Payment Gatewway Fee (EzBeli)", conf:95, why:"EzBeli payment gateway transaction fees." },
  { any:['hipay'], target:"FIN - Payment Gatewway Fee (HiPay)", conf:95, why:"HiPay payment gateway transaction fees." },
  { any:['payex'], target:"FIN - Payment Gatewway Fee (Payex)", conf:95, why:"Payex payment gateway transaction fees." },
  { any:['fx loss','forex loss','foreign exchange loss','fx revaluation','foreign exchange revaluation'], target:"FIN - Revaluations (Gain)/Loss on Foreign Exchange Rate Changes", conf:90, why:"FX revaluation gain/loss on monetary items per MFRS 121 — translate at closing rate; differences recognized in P&L." },
  { any:['realised currency gain','realized currency gain','realised fx gain','realized fx gain'], target:"FIN - Realised Currency Gains", conf:90, why:"Realized FX gain on settled transactions — MFRS 121. Recognized in P&L at settlement." },
  { any:['unrealised currency gain','unrealized currency gain','unrealised fx gain'], target:"FIN - Unrealised Currency Gains", conf:90, why:"Unrealized FX gain on open monetary positions at reporting date — MFRS 121 closing-rate translation." },

  // ==================== TAXATION ====================
  { any:['corporate tax','corparate tax','company tax','tax @24','tax@24','income tax expense','tax expense','tax provision'], target:"Corparate Taxation @24%", conf:95, why:"Malaysian corporate income tax @ 24% standard rate (15% on first RM150k taxable income for SME — check qualifying conditions per ITA s.6 and Sch 1). MFRS 112: recognize current tax based on current legislation and rates substantively enacted." },

  // ==================== COGS ====================
  { any:['opening stock','opening inventory','beginning inventory','stocks at the beginning','stocks at beginning'], target:'Stocks At the Beginning of Year', conf:95, why:"Opening inventory — included in cost of sales calculation per MFRS 102. Stock movement line, not a purchase." },
  { any:['closing stock','closing inventory','ending inventory','stocks at the end','stocks at end'], target:'Stocks At the End of Year', conf:95, why:"Closing inventory — reduces COS in the period (negative figure). Valued at lower of cost and NRV per MFRS 102." },
  { any:['purchases of goods','purchases - goods','goods purchase','cogs purchase'], target:'COGS - Purchases of Goods', conf:92, why:"Purchases of finished goods / merchandise for resale. Recognized when control transfers per MFRS 102 / Incoterms." },
  { any:['packaging cost','packaging materials','packing cost'], target:'COGS - Packaging Costs', conf:90, why:"Packaging materials forming part of inventory cost (MFRS 102 paragraph 11) — included in cost of sales." },
  { any:['promotional items','souvenirs','promo items','cogs - promotional'], target:'COGS - Promotional Items (Souvenirs)', conf:88, why:"Goods packed/included with sales as promotional items — direct cost of sales. Distinct from BD&M Gifts (external marketing gifts)." },
  { any:['inbound transport','inbound freight','inbound shipping','incoming freight'], target:'COGS - Inbound Transportation Costs', conf:92, why:"Inbound freight included in inventory cost (MFRS 102 para 11) until sale, then released to COS." },
  { any:['import duty','import duties','customs duty','customs duties','kastam'], target:'COGS - Import Duties', conf:92, why:"Import duty / customs / Kastam payments form part of inventory cost (MFRS 102 para 11) — released to COS on sale." },
  { any:['royalty','license fee - goods','brand royalty'], target:'COGS - Goods Royalty Fees', conf:88, why:"Royalty fee paid as a direct condition of selling licensed goods — direct cost of sales. WHT 10% typically applies if paid to non-resident IP holder." },
  { any:['purchases return','return outwards','return to supplier'], target:'Purchases Return', conf:90, why:"Goods returned to supplier — reduces COGS Purchases in the period of return. Documented via credit note." },

  // ==================== TRADING INCOME ====================
  { any:['retail sales','o2o sales','counter sales','walk-in','showroom','pos sales'], target:'Revenue - Retail Sales (O2O)', conf:90, why:"Revenue from offline retail / O2O channel. Recognized at point of sale when control transfers to customer (MFRS 15)." },
  { any:['webstore','website sales','online store','shopify sales','d2c'], target:'Revenue - WebStore Sales (Shopify)', conf:90, why:"Direct-to-consumer webstore sales (Shopify) — revenue recognized when goods delivered / control transfers per MFRS 15." },
  { any:['cod sales','cash on delivery sale'], target:'Revenue - COD Sales', conf:92, why:"Cash-on-delivery sales — revenue recognized on delivery (control transfer) per MFRS 15. Cash received via courier remittance." },
  { any:['shopee sales','sales - shopee'], target:'Revenue - Shopee Sales', conf:92, why:"Marketplace sales via Shopee — gross revenue (before deducting platform commission). Platform fees recognized separately in BD&M." },
  { any:['lazada sales','sales - lazada'], target:'Revenue - Lazada Sales', conf:92, why:"Marketplace sales via Lazada — gross revenue. Platform fees in BD&M." },
  { any:['tiktok sales','tiktok shop sales','sales - tiktok'], target:'Revenue - TikTok Sales', conf:92, why:"Marketplace sales via TikTok Shop — gross revenue per MFRS 15." },
  { any:['meta sales','facebook sales','instagram sales','social media sales','whatsapp sales','fb sales','ig sales'], target:'Revenue - Meta Platform Sales (Facebook/Instagram/WhatsApp)', conf:90, why:"Sales via Meta-owned channels (FB / IG / WhatsApp) — recognized at point of delivery." },
  { any:['live streaming sales','livestream sales','live stream revenue'], target:'Revenue - Live Streaming Sales', conf:90, why:"Sales generated during live-streaming sessions — distinct revenue stream tracked separately." },
  { any:['exhibition sales','event sales','expo sales','fair sales'], target:'Revenue - Exhibition Event', conf:88, why:"Sales made at exhibitions/events/fairs — separately disclosed channel revenue." },
  { any:['one-day shop','one day shop','shop manager event'], target:'Revenue - One-Day Shop Manager Event', conf:88, why:"Pop-up / one-day shop manager event sales — separately tracked." },
  { any:['ctg4u'], target:'Revenue - CTG4U Platform', conf:92, why:"Sales via CTG4U platform — inter-co linked platform sales, separately disclosed per MFRS 124." },

  // Return Inwards
  { any:['return inwards - shopee','sales return shopee'], target:'Return Inwards - Shopee Sales', conf:90, why:"Customer returns on Shopee — contra-revenue per MFRS 15 (variable consideration / refund liability)." },
  { any:['return inwards - lazada','sales return lazada'], target:'Return Inwards - Lazada Sales', conf:90, why:"Customer returns on Lazada — contra-revenue." },
  { any:['return inwards - cod','sales return cod','cod return'], target:'Return Inwards - COD Sales', conf:90, why:"COD failed deliveries / returns — contra-revenue when goods returned." },
  { any:['return inwards - meta','sales return meta','meta return'], target:'Return Inwards - Meta Platform Sales (Facebook/Instagram/WhatsApp)', conf:88, why:"Customer returns on Meta channels — contra-revenue." },

  // Discount Voucher
  { any:['discount voucher - shopify','shopify voucher','shopify discount'], target:'Discount Voucher - Shopify', conf:90, why:"Discount vouchers / promo codes on Shopify — reduces transaction price per MFRS 15 (variable consideration)." },
  { any:['discount voucher - shopee','shopee voucher','shopee discount'], target:'Discount Voucher - Shopee', conf:90, why:"Discount vouchers on Shopee — variable consideration reducing revenue per MFRS 15." },
  { any:['discount voucher - lazada','lazada voucher','lazada discount'], target:'Discount Voucher - Lazada', conf:90, why:"Discount vouchers on Lazada — variable consideration." },
  { any:['discount voucher - tiktok','tiktok voucher','tiktok discount'], target:'Discount Voucher - TikTok', conf:90, why:"Discount vouchers on TikTok Shop — variable consideration." },
  { any:['discount voucher - others','other voucher','generic discount'], target:'Discount Voucher - Others', conf:75, why:"Discount vouchers on other/unspecified channels — variable consideration." },

  // ==================== OTHER INCOME ====================
  { any:['hibah','bank interest','interest income'], target:'Other Income - Bank Interest/Hibah', conf:92, why:"Interest income / Islamic hibah from bank deposits — recognized when receivable per MFRS 9. Taxable under s.4(c) ITA." },
  { any:['gain on disposal','loss on disposal','disposal of asset','fixed asset disposal'], target:'Other Income - Fixed Asset (Gain)/Loss on Disposal', conf:92, why:"Net gain/loss on disposal of PPE per MFRS 116 para 67 — disposal proceeds less carrying amount." },
  { any:['capital gain','capital loss','rpgt'], target:'Other Income - Capital (Gain)/Loss', conf:88, why:"Capital gain/loss on disposal of property/assets — Real Property Gains Tax (RPGT) may apply per RPGT Act 1976." },
  { any:['shared employee','shared service','inter-co recharge','intercompany recharge'], target:'Other Income - Shared Employees Service', conf:88, why:"Inter-co recharge for shared employee services — disclose under MFRS 124 related-party transactions." },
  { any:['unknown fund','unidentified deposit','sundry income','miscellaneous income'], target:'Other Income - Unknown Fund Received', conf:75, why:"Unidentified/unreconciled deposits — investigate source and reclass to proper account when identified." }
];

/* Evaluate SENIOR_RULES against a source name. Returns matching rule or null. */
function evalSeniorRules(sourceName, normName, srcTokens){
  for(const rule of SENIOR_RULES){
    // any: at least one token/phrase must appear (substring match)
    const anyHit = rule.any.some(p => normName.indexOf(p.toLowerCase()) !== -1);
    if(!anyHit) continue;
    // none: if any of these appear, disqualify
    if(rule.none && rule.none.some(p => normName.indexOf(p.toLowerCase()) !== -1)) continue;
    // some (optional): if specified, at least one must also appear (further qualifier)
    if(rule.some && !rule.some.some(p => normName.indexOf(p.toLowerCase()) !== -1)) continue;
    return rule;
  }
  return null;
}

/* The AI-thinking classifier — now document-aware.
   ctx (optional) carries Pass-1 document analysis + per-row context:
     { docContext: {namingStyle, hasStructuredSections, ...},
       row:        {sourceSection, prevName, values, ...} }
   Returns { target, confidence (0-100), reason, signals[] } */
function mapAccountAI(sourceName, ctx){
  if(!sourceName){
    return { target:null, confidence:0, reason:'Empty source name', signals:[] };
  }
  const n = normalizeName(sourceName);
  const srcTokens = tokenize(sourceName);
  const signals = [];
  const doc = (ctx && ctx.docContext) || {};
  const row = (ctx && ctx.row) || {};
  const sourceSection = row.sourceSection || null;
  const docHints = [];
  if(doc.namingStyle === 'canonical') docHints.push('source uses canonical naming style');
  if(sourceSection) docHints.push('source section context: "' + sourceSection + '"');

  // ---- Helper: is `target`'s canonical section compatible with sourceSection? ----
  function sectionMatches(target){
    if(!sourceSection) return null;  // no context — can't judge
    const tgtSection = canonicalSectionOf(target);
    if(!tgtSection) return null;
    // Operating Expenses, Other Income, Trading Income, Cost of Sales, Taxation, Net Profit
    return tgtSection === sourceSection;
  }

  // === Signal 1: Exact-name match against canonical COA ===
  for(const item of COA){
    if(item.kind !== 'account') continue;
    if(normalizeName(item.name) === n){
      const ctxNote = docHints.length ? '  Document context: ' + docHints.join(' · ') + '.' : '';
      return {
        target: item.name,
        confidence: 100,
        reason: 'Exact match — source name is identical to the canonical COA account.' + ctxNote,
        signals: ['exact-name']
      };
    }
  }

  // === Signal 2: Keyword-dictionary hit (longest-match-wins) ===
  for(const { kw, target } of KEYWORD_INDEX){
    if(n.indexOf(kw) !== -1){
      const sectionOk = sectionMatches(target);
      let conf = Math.min(95, 70 + kw.length);
      let extra = '';
      // Document context can boost or reduce confidence
      if(sectionOk === true){ conf = Math.min(98, conf + 5); extra = ' Section context "' + sourceSection + '" confirms.'; }
      else if(sectionOk === false){ conf = Math.max(40, conf - 25); extra = ' ⚠ Section mismatch — source places this under "' + sourceSection + '", but the matched bucket is in canonical "' + canonicalSectionOf(target) + '". Keyword wins but review recommended.'; }
      signals.push('keyword:"' + kw + '"');
      if(sourceSection) signals.push('source-section:' + sourceSection);
      return {
        target,
        confidence: conf,
        reason: 'Matched canonical keyword "' + kw + '" inside the source name.' + extra,
        signals
      };
    }
  }

  // === Signal 3: ACCA Senior Accountant rule engine ===
  // Applies professional accounting judgment — distinguishes similar
  // accounts (e.g. Director's Remuneration vs Employee Salaries),
  // cites MFRS/LHDN basis, and explains substance-over-form decisions.
  const rule = evalSeniorRules(sourceName, n, srcTokens);
  if(rule){
    const sectionOk = sectionMatches(rule.target);
    let conf = rule.conf;
    let extra = '';
    if(sectionOk === true){ conf = Math.min(98, conf + 5); extra = '  Section context "' + sourceSection + '" confirms the classification.'; }
    else if(sectionOk === false){ conf = Math.max(40, conf - 20); extra = '  ⚠ Note: source places this row under "' + sourceSection + '" but professional judgment maps it to canonical "' + canonicalSectionOf(rule.target) + '". Review recommended.'; }
    signals.push('senior-rule');
    if(sourceSection) signals.push('source-section:' + sourceSection);
    return {
      target: rule.target,
      confidence: conf,
      reason: '🎓 ACCA Senior Accountant: ' + rule.why + extra,
      signals
    };
  }

  // === Signal 4: Multi-signal fuzzy scoring (fallback) ===
  const srcSection = detectSection(srcTokens);
  if(srcSection.section) signals.push('section-hint:' + srcSection.section);

  let best = null;
  const accountItems = COA.filter(it => it.kind === 'account');

  for(const item of accountItems){
    const tgtName = item.name;
    const tgtTokens = tokenize(tgtName);
    if(tgtTokens.length === 0) continue;

    // (a) Token overlap (Jaccard-style)
    const common = srcTokens.filter(t => tgtTokens.some(tt => tt === t || tt.indexOf(t) !== -1 || t.indexOf(tt) !== -1));
    const union = new Set([...srcTokens, ...tgtTokens]);
    const overlap = union.size > 0 ? common.length / union.size : 0;

    // (b) Section-prefix alignment bonus
    const tgtSec = targetSection(tgtName);
    const sectionBonus = (srcSection.section && tgtSec && srcSection.section === tgtSec) ? 0.25 : 0;

    // (c) Levenshtein similarity on full strings (typo tolerance)
    const editDist = levenshtein(n.substring(0, 60), normalizeName(tgtName).substring(0, 60));
    const maxLen = Math.max(n.length, tgtName.length, 1);
    const editSim = 1 - editDist / maxLen;

    // (d) Substring containment
    const tgtNorm = normalizeName(tgtName);
    const containBonus = (n.indexOf(tgtNorm) !== -1 || tgtNorm.indexOf(n) !== -1) ? 0.20 : 0;

    // (e) Document-aware bonus — source section matches canonical section
    const tgtGroup = canonicalSectionOf(tgtName);
    const sourceSectionBonus = (sourceSection && tgtGroup && sourceSection === tgtGroup) ? 0.20 : 0;

    // Weighted blend
    const score = (overlap * 0.40) + (sectionBonus) + (editSim * 0.15) + containBonus + sourceSectionBonus;

    if(!best || score > best.score){
      best = { score, target: tgtName, overlap, sectionBonus, editSim, containBonus, sourceSectionBonus, common };
    }
  }

  // Only accept best match if score is high enough
  const THRESHOLD = 0.40;
  if(best && best.score >= THRESHOLD){
    const reasons = [];
    if(best.common && best.common.length > 0) reasons.push('shared keywords {' + best.common.slice(0,4).join(', ') + '}');
    if(best.sectionBonus > 0) reasons.push('same section prefix (' + srcSection.section.toUpperCase() + ')');
    if(best.containBonus > 0) reasons.push('substring containment');
    if(best.editSim > 0.5)    reasons.push('low edit distance');
    if(best.sourceSectionBonus > 0) reasons.push('document section context "' + sourceSection + '" matches');
    signals.push('fuzzy-score:' + best.score.toFixed(2));
    if(sourceSection) signals.push('source-section:' + sourceSection);
    return {
      target: best.target,
      confidence: Math.min(80, Math.round(best.score * 100)),
      reason: 'Fuzzy match — ' + (reasons.join(' · ') || 'weighted token overlap') + '.',
      signals
    };
  }

  return {
    target: null,
    confidence: 0,
    reason: 'No confident match — confidence ' + (best ? Math.round(best.score * 100) : 0) + '% (threshold ' + Math.round(THRESHOLD * 100) + '%). Best guess: "' + (best ? best.target : '—') + '". Source section: "' + (sourceSection || 'unknown') + '".',
    signals
  };
}
function parseNumeric(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return v;
  const s = String(v).trim();
  if(!s) return null;
  const cleaned = s.replace(/^rm\s*/i,'').replace(/[,\s]/g,'').replace(/^\((.*)\)$/,'-$1');
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

/* ============ EXCEL PARSER ============ */
function parseExcel(arrayBuffer){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
  const wb = XLSX.read(arrayBuffer, { type:'array', cellDates:true, cellNF:false });
  let sheetName = wb.SheetNames[0];
  for(const sn of wb.SheetNames){
    const ws = wb.Sheets[sn];
    if(ws && ws['!ref']){ sheetName = sn; break; }
  }
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, blankrows:false });

  // Detect header row
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

  // Detect month columns
  const monthCols = [];
  for(let j=1; j<headerRow.length; j++){
    const v = headerRow[j];
    if(v == null || v === '') continue;
    let label = '';
    if(v instanceof Date) label = v.toLocaleString('en-US', { month:'short', year:'numeric' });
    else label = String(v).trim();
    if(!label) continue;
    if(/^%$/.test(label) || /^ytd\s*%$/i.test(label)) continue;
    if(/^variance$|^var\.?$|^change$|^diff(erence)?$/i.test(label)) continue;
    monthCols.push({ col: j, label });
  }
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

  // Extract title block
  let title = '', entity = '', period = '';
  for(let i=0; i<headerRowIdx; i++){
    const r = aoa[i] || [];
    const v = String(r[0] || '').trim();
    if(!v) continue;
    if(/^profit\s+and\s+loss/i.test(v) || /^income\s+statement/i.test(v)) title = v;
    else if(/(sdn\s+bhd|berhad|ltd|pte|inc|llp|gmbh|enterprise|trading)/i.test(v)) entity = v;
    else if(/^for\s+(the|month|year|period)|^as\s+at|^year\s+ended/i.test(v) || /^\d/.test(v)) period = v;
    else if(!entity) entity = v;
    else if(!period) period = v;
  }

  // Extract data rows — TRACK section context per row.
  // A row is a section header if it has a name but no values AND its name
  // matches a known section pattern OR is short and capitalized.
  const rows = [];
  let currentSection = null;       // tracks which P&L section we're currently inside
  let lastAccountIdx = -1;          // for sibling-context detection
  for(let i=headerRowIdx+1; i<aoa.length; i++){
    const row = aoa[i] || [];
    const name = (row[0] == null ? '' : String(row[0])).trim();
    if(!name) continue;
    const values = monthCols.map(mc => parseNumeric(row[mc.col]) || 0);
    const hasAny = values.some(v => v !== 0);
    // --- Section header detection ---
    if(!hasAny){
      const detected = detectSourceSection(name);
      if(detected){
        currentSection = detected;
        continue;
      }
      // Could be a sub-heading inside a section — track but don't change section
      continue;
    }
    // --- Skip subtotal / computed lines (they're recomputed in output) ---
    if(/^total\s+/i.test(name)) continue;
    if(/^gross\s+profit$/i.test(name) || /^net\s+profit(\/?\(loss\))?$/i.test(name) ||
       /^operating\s+profit/i.test(name) || /^ebitda$/i.test(name)) continue;
    // --- Real account row ---
    const prev = lastAccountIdx >= 0 ? rows[lastAccountIdx] : null;
    rows.push({ name, values, sourceSection: currentSection, prevName: prev ? prev.name : null });
    lastAccountIdx = rows.length - 1;
  }

  return {
    title:  title  || 'Profit and Loss',
    entity: entity || '',
    period: period || '',
    months: monthCols.map(mc => mc.label),
    rows
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
      const x = item.transform[4];
      const y = pageHeight - item.transform[5];
      const text = (item.str || '').trim();
      if(!text) continue;
      let line = lines.find(L => Math.abs(L.y - y) < 3 && L.page === p);
      if(!line){ line = { page:p, y, items:[] }; lines.push(line); }
      line.items.push({ x, text });
    }
  }
  lines.sort((a,b) => a.page - b.page || a.y - b.y);
  lines.forEach(L => L.items.sort((a,b) => a.x - b.x));

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
  if(monthCols.length === 0) throw new Error('No month columns detected in PDF header');

  let title = '', entity = '', period = '';
  for(let i=0;i<headerLineIdx;i++){
    const txt = lines[i].items.map(it => it.text).join(' ').trim();
    if(!txt) continue;
    if(/^profit\s+and\s+loss/i.test(txt)) title = txt;
    else if(/(sdn\s+bhd|berhad|ltd|pte|inc|llp|gmbh)/i.test(txt)) entity = txt;
    else if(/^for\s+(the|month|year|period)|^year\s+ended/i.test(txt)) period = txt;
    else if(!entity) entity = txt;
    else if(!period) period = txt;
  }

  const rows = [];
  const numRe = /^\(?-?[\d,]+\.?\d*\)?$/;
  let currentSection = null;
  let lastAccountIdx = -1;
  for(let i=headerLineIdx+1; i<lines.length; i++){
    const L = lines[i];
    const nameParts = [];
    const vals = new Array(monthCols.length).fill(0);
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
    if(!name) continue;
    const hasAny = vals.some(v => v !== 0);
    // Section header detection
    if(!hasAny){
      const detected = detectSourceSection(name);
      if(detected) currentSection = detected;
      continue;
    }
    if(/^total\s+/i.test(name) || /^gross\s+profit$/i.test(name) || /^net\s+profit/i.test(name) || /^operating\s+profit/i.test(name)) continue;
    const prev = lastAccountIdx >= 0 ? rows[lastAccountIdx] : null;
    rows.push({ name, values: vals, sourceSection: currentSection, prevName: prev ? prev.name : null });
    lastAccountIdx = rows.length - 1;
  }

  return {
    title:  title  || 'Profit and Loss',
    entity: entity || '',
    period: period || '',
    months: monthCols.map(mc => mc.label),
    rows
  };
}

/* ============ AUTO-MAP — two-pass document-aware AI ============
   Pass 1: analyseDocument() builds document-level intelligence
           (naming style, section context, etc.)
   Pass 2: classify each row WITH that context, so e.g. a row labeled
           "Office Rental" appearing under source's "Cost of Sales"
           section gets the section-mismatch flag in its reasoning. */
function autoMap(parsed){
  const monthCount = parsed.months.length;
  const mapped = {};
  const unmapped = [];
  const decisions = [];
  // === PASS 1 — analyse the document ===
  const docContext = analyzeDocument(parsed);
  // === PASS 2 — classify each row with full context ===
  parsed.rows.forEach(r => {
    const ctx = {
      docContext,
      row: {
        sourceSection: r.sourceSection || null,
        prevName: r.prevName || null,
        values: r.values
      }
    };
    const decision = mapAccountAI(r.name, ctx);
    decisions.push({
      source: r.name,
      sourceSection: r.sourceSection || null,
      target: decision.target,
      confidence: decision.confidence,
      reason: decision.reason,
      signals: decision.signals || [],
      values: r.values
    });
    if(decision.target){
      if(!mapped[decision.target]) mapped[decision.target] = new Array(monthCount).fill(0);
      for(let i=0;i<monthCount;i++) mapped[decision.target][i] += (Number(r.values[i])||0);
    } else {
      unmapped.push(r);
    }
  });
  return { mapped, unmapped, decisions, docContext };
}

/* ============ OUTPUT BUILDER ============ */
function buildOutputWorkbook({ source, mapped, unmapped, decisions, entityOverride }){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
  const { title, entity, period, months } = source;
  const monthCount = months.length;
  const entityName = (entityOverride && entityOverride.trim()) || entity || '';

  const COL_WIDTHS = [{ wch: 64 }];  // wider col A like SKINDAE
  for(let i=0; i<monthCount; i++){
    COL_WIDTHS.push({ wch: 18 });
    COL_WIDTHS.push({ wch: 11 });
    if(i < monthCount - 1) COL_WIDTHS.push({ wch: 2.7 });
  }
  const totalCols = 1 + monthCount * 3 - (monthCount > 0 ? 1 : 0);
  const valueColIdx = (m) => 1 + m * 3;
  const pctColIdx   = (m) => 2 + m * 3;
  const colLetter = (n) => {
    let s = ''; n = n + 1;
    while(n > 0){ const k = (n-1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n-1)/26); }
    return s;
  };

  const aoa = [];
  const rowKinds = [];
  const empty = () => new Array(totalCols).fill(null);
  const push = (row, kind) => { aoa.push(row); rowKinds.push(kind || 'plain'); return aoa.length; };

  // Title block
  const r1 = empty(); r1[0] = title || 'Profit and Loss'; push(r1, 'title');
  const r2 = empty(); r2[0] = entityName;                  push(r2, 'entity');
  const r3 = empty(); r3[0] = period || (months.length > 1
    ? 'From ' + months[months.length-1] + ' to ' + months[0]
    : 'For the period ' + (months[0] || ''));
  push(r3, 'period');
  // Column headers
  const r4 = empty();
  r4[0] = 'Account';
  for(let m=0; m<monthCount; m++){
    r4[valueColIdx(m)] = months[m];
    r4[pctColIdx(m)] = '%';
  }
  push(r4, 'colhead');

  // Track key total row numbers for formula references
  let trIncomeTotalRow = null;
  let cosTotalRow = null;
  let otherIncomeTotalRow = null;
  let opexTotalRow = null;
  let taxationTotalRow = null;
  let grossProfitRow = null;
  let netProfitRow = null;

  // Per-group account range tracking for SUM ranges
  const groupRange = {};

  COA.forEach(item => {
    if(item.kind === 'blank'){
      push(empty(), 'blank');
      return;
    }
    const row = empty();
    if(item.kind === 'header'){
      row[0] = item.group;
      const rowIdx = push(row, 'section');
      groupRange[item.group] = { first: null, last: null, total: null };
      return;
    }
    if(item.kind === 'account'){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const v = (mapped[item.name] && mapped[item.name][m]) || 0;
        row[valueColIdx(m)] = v;
      }
      const rowIdx = push(row, 'account');
      const gr = groupRange[item.group];
      if(gr){ if(gr.first == null) gr.first = rowIdx; gr.last = rowIdx; }
      return;
    }
    if(item.kind === 'total'){
      row[0] = item.name;
      const gr = groupRange[item.group] || {};
      for(let m=0; m<monthCount; m++){
        if(gr.first && gr.last){
          const c = colLetter(valueColIdx(m));
          row[valueColIdx(m)] = { f: 'SUM(' + c + gr.first + ':' + c + gr.last + ')' };
        } else {
          row[valueColIdx(m)] = 0;
        }
      }
      const rowIdx = push(row, 'subtotal');
      gr.total = rowIdx;
      if(item.group === 'Trading Income')     trIncomeTotalRow = rowIdx;
      if(item.group === 'Cost of Sales')      cosTotalRow = rowIdx;
      if(item.group === 'Other Income')       otherIncomeTotalRow = rowIdx;
      if(item.group === 'Operating Expenses') opexTotalRow = rowIdx;
      if(item.group === 'Taxation')           taxationTotalRow = rowIdx;
      return;
    }
    if(item.kind === 'gp'){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        if(trIncomeTotalRow && cosTotalRow){
          row[valueColIdx(m)] = { f: c + trIncomeTotalRow + '-' + c + cosTotalRow };
        } else {
          row[valueColIdx(m)] = 0;
        }
      }
      const rowIdx = push(row, 'gp');
      grossProfitRow = rowIdx;
      return;
    }
    if(item.kind === 'np'){
      row[0] = item.name;
      for(let m=0; m<monthCount; m++){
        const c = colLetter(valueColIdx(m));
        const parts = [];
        if(grossProfitRow) parts.push(c + grossProfitRow);
        if(otherIncomeTotalRow) parts.push('+' + c + otherIncomeTotalRow);
        if(opexTotalRow) parts.push('-' + c + opexTotalRow);
        if(taxationTotalRow) parts.push('-' + c + taxationTotalRow);
        row[valueColIdx(m)] = parts.length ? { f: parts.join('') } : 0;
      }
      const rowIdx = push(row, 'np');
      netProfitRow = rowIdx;
      return;
    }
  });

  // Second pass: % column formulas (divide by Trading Income total)
  if(trIncomeTotalRow){
    for(let r = 5; r <= aoa.length; r++){
      const row = aoa[r-1];
      if(!row) continue;
      // Skip if value cell is null (section header or blank row)
      if(row[valueColIdx(0)] == null) continue;
      for(let m=0; m<monthCount; m++){
        const vc = colLetter(valueColIdx(m));
        const valRef = vc + r;
        const totalRef = vc + trIncomeTotalRow;
        row[pctColIdx(m)] = { f: 'IFERROR(' + valRef + '/' + totalRef + ',0)' };
      }
    }
  }

  // === Cell styles (Calibri 10 base, SKINDAE/Xero look) ===
  const FONT_BASE  = { name:'Calibri', sz:10, color:{ rgb:'333333' } };
  const FONT_BOLD  = { name:'Calibri', sz:10, color:{ rgb:'000000' }, bold:true };
  const FONT_TITLE = { name:'Calibri', sz:16, color:{ rgb:'1F3A5F' }, bold:true };
  const FONT_ENT   = { name:'Calibri', sz:12, color:{ rgb:'000000' }, bold:true };
  const FONT_PER   = { name:'Calibri', sz:10, color:{ rgb:'666666' }, italic:true };
  const FONT_COL   = { name:'Calibri', sz:9,  color:{ rgb:'333333' }, bold:true };
  const FONT_SECT  = { name:'Calibri', sz:11, color:{ rgb:'1F3A5F' }, bold:true };

  const BORDER_TOPLINE = { top: { style:'thin', color:{ rgb:'000000' } } };
  const BORDER_COLHEAD = { bottom: { style:'thin', color:{ rgb:'000000' } } };
  const BORDER_GP_NP   = {
    top:    { style:'thin',   color:{ rgb:'000000' } },
    bottom: { style:'double', color:{ rgb:'000000' } }
  };

  const ALIGN_LEFT   = { horizontal:'left',  vertical:'center' };
  const ALIGN_RIGHT  = { horizontal:'right', vertical:'center' };
  const ALIGN_INDENT = { horizontal:'left',  vertical:'center', indent:1 };

  function styleForKind(kind, isCol0){
    const s = {};
    if(kind === 'title'){          s.font = FONT_TITLE; s.alignment = ALIGN_LEFT; }
    else if(kind === 'entity'){    s.font = FONT_ENT;   s.alignment = ALIGN_LEFT; }
    else if(kind === 'period'){    s.font = FONT_PER;   s.alignment = ALIGN_LEFT; }
    else if(kind === 'colhead'){   s.font = FONT_COL;   s.alignment = isCol0 ? ALIGN_LEFT : ALIGN_RIGHT; s.border = { ...BORDER_COLHEAD }; }
    else if(kind === 'section'){   s.font = FONT_SECT;  s.alignment = ALIGN_LEFT; }
    else if(kind === 'account'){   s.font = FONT_BASE;  s.alignment = isCol0 ? ALIGN_INDENT : ALIGN_RIGHT; }
    else if(kind === 'subtotal'){  s.font = FONT_BOLD;  s.alignment = isCol0 ? ALIGN_LEFT : ALIGN_RIGHT; s.border = { ...BORDER_TOPLINE }; }
    else if(kind === 'gp' || kind === 'np'){ s.font = FONT_BOLD; s.alignment = isCol0 ? ALIGN_LEFT : ALIGN_RIGHT; s.border = { ...BORDER_GP_NP }; }
    else {                         s.font = FONT_BASE;  s.alignment = isCol0 ? ALIGN_LEFT : ALIGN_RIGHT; }
    return s;
  }

  // === Build SheetJS worksheet ===
  const ws = XLSX.utils.aoa_to_sheet([], { dateNF:'yyyy-mm-dd' });
  const PCT_COLS = new Set();
  for(let m=0; m<monthCount; m++) PCT_COLS.add(pctColIdx(m));

  for(let r=0; r<aoa.length; r++){
    const rowVals = aoa[r];
    const kind = rowKinds[r] || 'plain';
    for(let c=0; c<rowVals.length; c++){
      const v = rowVals[c];
      if(v == null) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const isCol0 = (c === 0);
      const isPctCol = PCT_COLS.has(c);
      const baseStyle = styleForKind(kind, isCol0);
      if(typeof v === 'object' && v.f){
        const z = isPctCol ? '0.0%;[Red](0.0%);"-"' : '#,##0.00;[Red](#,##0.00);"-"';
        ws[addr] = { t:'n', f: v.f, z, s: baseStyle };
      } else if(typeof v === 'number'){
        ws[addr] = { t:'n', v, z:'#,##0.00;[Red](#,##0.00);"-"', s: baseStyle };
      } else {
        ws[addr] = { t:'s', v: String(v), s: baseStyle };
      }
    }
  }
  ws['!ref']  = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:aoa.length-1, c:totalCols-1} });
  ws['!cols'] = COL_WIDTHS;
  ws['!rows'] = [ { hpt: 22 }, { hpt: 16 }, { hpt: 14 }, { hpt: 16 } ];

  // Freeze rows 1–4 (title block + month-header row) so they stay
  // visible while scrolling. Set BOTH freeze syntaxes for maximum
  // compatibility — older xlsx-style forks recognize !freeze, newer
  // SheetJS recognizes !views with pane state.
  ws['!freeze'] = { xSplit: 0, ySplit: 4 };
  ws['!views'] = [{
    state: 'frozen',
    ySplit: 4,
    xSplit: 0,
    topLeftCell: 'A5',
    activePane: 'bottomLeft'
  }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Profit and Loss');

  // === AI Decisions sheet — full reasoning trail ===
  if(decisions && decisions.length > 0){
    const aiHead = ['Source Account', 'Confidence', 'Mapped To', 'AI Reasoning'];
    const aiRows = decisions.map(d => [
      d.source,
      (d.confidence || 0) + '%',
      d.target || '(unmapped)',
      d.reason || ''
    ]);
    const aiWs = XLSX.utils.aoa_to_sheet([aiHead].concat(aiRows));
    aiWs['!cols'] = [{ wch: 50 }, { wch: 12 }, { wch: 55 }, { wch: 80 }];
    // Style header row
    for(let c=0; c<aiHead.length; c++){
      const addr = XLSX.utils.encode_cell({ r:0, c });
      if(aiWs[addr]) aiWs[addr].s = {
        font: { name:'Calibri', sz:10, bold:true, color:{ rgb:'FFFFFF' } },
        fill: { fgColor:{ rgb:'1F3A5F' } },
        alignment: { vertical:'center' }
      };
    }
    // Color-code confidence cells
    for(let r=1; r<=aiRows.length; r++){
      const conf = decisions[r-1].confidence || 0;
      const cAddr = XLSX.utils.encode_cell({ r, c:1 });
      const tAddr = XLSX.utils.encode_cell({ r, c:2 });
      let fill = null;
      if(conf >= 90)      fill = { fgColor:{ rgb:'D4F5DC' } };  // green
      else if(conf >= 60) fill = { fgColor:{ rgb:'FFF3CD' } };  // amber
      else if(conf > 0)   fill = { fgColor:{ rgb:'FFE0E0' } };  // light red
      else                fill = { fgColor:{ rgb:'F0F0F0' } };  // grey
      if(aiWs[cAddr]) aiWs[cAddr].s = { font:{ name:'Calibri', sz:10, bold:true }, fill, alignment:{ horizontal:'center' } };
      if(aiWs[tAddr]) aiWs[tAddr].s = { font:{ name:'Calibri', sz:10 }, fill };
    }
    XLSX.utils.book_append_sheet(wb, aiWs, 'AI Decisions');
  }

  // === Unmapped sheet ===
  if(unmapped && unmapped.length > 0){
    const head = ['Source Account'].concat(months);
    const data = unmapped.map(u => [u.name].concat(u.values));
    const umWs = XLSX.utils.aoa_to_sheet([head].concat(data));
    umWs['!cols'] = [{ wch: 50 }].concat(months.map(() => ({ wch: 16 })));
    // Style header row
    for(let c=0; c<head.length; c++){
      const addr = XLSX.utils.encode_cell({ r:0, c });
      if(umWs[addr]) umWs[addr].s = { font: FONT_BOLD, fill: { fgColor: { rgb:'FFF3E0' } }, border: { ...BORDER_COLHEAD } };
    }
    // Number format on amount cells
    for(let r=1; r<=data.length; r++){
      for(let c=1; c<head.length; c++){
        const addr = XLSX.utils.encode_cell({ r, c });
        if(umWs[addr]) umWs[addr].z = '#,##0.00;[Red](#,##0.00);"-"';
      }
    }
    XLSX.utils.book_append_sheet(wb, umWs, '— Unmapped —');
  }

  return wb;
}

/* ============ HIGH-LEVEL convert() ============ */
async function convertFile(file, entityName){
  const arrayBuffer = await file.arrayBuffer();
  const fname = (file.name || '').toLowerCase();
  let source;
  if(fname.endsWith('.pdf')) source = await parsePdf(arrayBuffer);
  else                       source = parseExcel(arrayBuffer);
  if(!source || !source.rows || source.rows.length === 0){
    throw new Error('No data rows detected in the file. Please check the format.');
  }
  const { mapped, unmapped, decisions, docContext } = autoMap(source);
  const wb = buildOutputWorkbook({ source, mapped, unmapped, decisions, entityOverride: entityName });
  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  // Confidence summary
  const highConf   = decisions.filter(d => d.confidence >= 90).length;
  const medConf    = decisions.filter(d => d.confidence >= 60 && d.confidence < 90).length;
  const lowConf    = decisions.filter(d => d.confidence > 0  && d.confidence < 60).length;
  const noConf     = decisions.filter(d => d.confidence === 0).length;

  return {
    blob,
    report: {
      months:        source.months,
      entity:        source.entity,
      totalRows:     source.rows.length,
      mappedRows:    source.rows.length - unmapped.length,
      unmappedRows:  unmapped.length,
      unmappedNames: unmapped.map(u => u.name),
      coaAccounts:   Object.keys(mapped).length,
      // AI thinking output
      decisions:     decisions,
      highConfCount: highConf,
      medConfCount:  medConf,
      lowConfCount:  lowConf,
      noConfCount:   noConf,
      // Pass-1 document analysis output
      docContext:    docContext
    }
  };
}

global.CTGPnLConverter = {
  convertFile, parseExcel, parsePdf,
  autoMap, mapAccount, mapAccountAI,
  COA, COA_KEYWORDS
};

})(window);
