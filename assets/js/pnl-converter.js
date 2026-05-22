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

/* ============ CANONICAL SKINDAE COA TEMPLATE ============
   Order matters — this is the row order in the output. */
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
  { group:'',               kind:'blank' },

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
  { group:'',               kind:'blank' },

  // === GROSS PROFIT ===
  { group:'Gross Profit',   kind:'gp',      name:'Gross Profit' },
  { group:'',               kind:'blank' },

  // === OTHER INCOME ===
  { group:'Other Income',   kind:'header' },
  { group:'Other Income',   kind:'account', name:'Other Income - Unknown Fund Received' },
  { group:'Other Income',   kind:'account', name:'Other Income - Shared Employees Service' },
  { group:'Other Income',   kind:'total',   name:'Total Other Income' },
  { group:'',               kind:'blank' },

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
  { group:'',               kind:'blank' },

  // === NET PROFIT ===
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
  "FIN - Payment Gatewway Fee (Payex)": ['payment gatewway fee (payex', 'payex'],
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
  { tokens:['salary','salaries','wage','wages','gaji','payroll','remuneration'], section:'staff' },
  { tokens:['epf','kwsp','socso','perkeso','eis','hrdf','hrd','contribution'],   section:'staff' },
  { tokens:['bonus','incentive','allowance','allowances'],                       section:'staff' },
  { tokens:['benefit','welfare','medical','insurance','training'],               section:'staff' },
  // BD&M cues
  { tokens:['ads','advertis','marketing','press','release','adwords','sem'],     section:'bd&m' },
  { tokens:['shopee','lazada','tiktok','meta','facebook','instagram','google'],  section:'bd&m' },
  { tokens:['photography','videography','photoshoot','design','studio'],         section:'bd&m' },
  { tokens:['exhibition','expo','event','booth','venue','sponsorship'],          section:'bd&m' },
  { tokens:['koc','kol','influencer','referral','affiliate'],                    section:'bd&m' },
  // G&A cues
  { tokens:['office','stationery','utilities','communication','rental','rent'],  section:'g&a' },
  { tokens:['audit','accounting','tax','agent','secretary','ssm'],               section:'g&a' },
  { tokens:['stamp','stamping','filing','penalty','compound','fine'],            section:'g&a' },
  { tokens:['depreciation','amortisation','amortization','asset'],               section:'g&a' },
  // FIN cues
  { tokens:['bank','charge','charges','transfer','handling','gateway','gatewway'],section:'fin' },
  { tokens:['atome','payex','hipay','ipay88','fiuu','stripe','ezbeli','ahapay'], section:'fin' },
  { tokens:['fx','forex','currency','foreign','exchange','realised','realized','unrealised','unrealized','revaluation'], section:'fin' },
  // CTG (inter-co) cues
  { tokens:['ctg','management'],                                                  section:'ctg' },
  // COGS cues
  { tokens:['cogs','purchase','purchases','packaging','packing','souvenir','souvenirs','inbound','freight','duty','duties','customs','kastam','stocks','inventory'], section:'cogs' },
  // Revenue cues
  { tokens:['sales','revenue','retail','webstore','shopify','o2o','cod','sales)'], section:'revenue' }
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
  if(n.startsWith('staff'))      return 'staff';
  if(n.startsWith('ctg'))        return 'ctg';
  if(n.startsWith('bd&m'))       return 'bd&m';
  if(n.startsWith('g&a'))        return 'g&a';
  if(n.startsWith('fin'))        return 'fin';
  if(n.startsWith('cogs'))       return 'cogs';
  if(n.startsWith('revenue'))    return 'revenue';
  if(n.startsWith('other income'))return 'other income';
  if(n.startsWith('stocks'))     return 'cogs';   // stock movements live in COS
  if(n.startsWith('discount'))   return 'revenue';
  return null;
}

/* The AI-thinking classifier.
   Returns { target, confidence (0-100), reason, signals[] } */
function mapAccountAI(sourceName){
  if(!sourceName){
    return { target:null, confidence:0, reason:'Empty source name', signals:[] };
  }
  const n = normalizeName(sourceName);
  const srcTokens = tokenize(sourceName);
  const signals = [];

  // === Signal 1: Exact-name match against canonical COA ===
  for(const item of COA){
    if(item.kind !== 'account') continue;
    if(normalizeName(item.name) === n){
      return {
        target: item.name,
        confidence: 100,
        reason: 'Exact match — source name is identical to the canonical COA account.',
        signals: ['exact-name']
      };
    }
  }

  // === Signal 2: Keyword-dictionary hit (longest-match-wins) ===
  for(const { kw, target } of KEYWORD_INDEX){
    if(n.indexOf(kw) !== -1){
      signals.push('keyword:"' + kw + '"');
      return {
        target,
        confidence: Math.min(95, 70 + kw.length),  // longer keyword = more specific = higher confidence
        reason: 'Matched canonical keyword "' + kw + '" inside the source name.',
        signals
      };
    }
  }

  // === Signal 3: Multi-signal fuzzy scoring ===
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

    // Weighted blend
    const score = (overlap * 0.45) + (sectionBonus) + (editSim * 0.15) + containBonus;

    if(!best || score > best.score){
      best = { score, target: tgtName, overlap, sectionBonus, editSim, containBonus, common };
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
    signals.push('fuzzy-score:' + best.score.toFixed(2));
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
    reason: 'No confident match — confidence ' + (best ? Math.round(best.score * 100) : 0) + '% (threshold ' + Math.round(THRESHOLD * 100) + '%). Best guess: "' + (best ? best.target : '—') + '".',
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

  // Extract data rows (skip totals/sections — only map accounts)
  const rows = [];
  for(let i=headerRowIdx+1; i<aoa.length; i++){
    const row = aoa[i] || [];
    const name = (row[0] == null ? '' : String(row[0])).trim();
    if(!name) continue;
    // Skip subtotal/computed lines
    if(/^total\s+/i.test(name)) continue;
    if(/^gross\s+profit$/i.test(name) || /^net\s+profit(\/?\(loss\))?$/i.test(name) ||
       /^operating\s+profit/i.test(name) || /^ebitda$/i.test(name)) continue;
    const values = monthCols.map(mc => parseNumeric(row[mc.col]) || 0);
    const hasAny = values.some(v => v !== 0);
    if(!hasAny) continue;
    rows.push({ name, values });
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
    if(/^total\s+/i.test(name) || /^gross\s+profit$/i.test(name) || /^net\s+profit/i.test(name) || /^operating\s+profit/i.test(name)) continue;
    if(vals.every(v => v === 0)) continue;
    rows.push({ name, values: vals });
  }

  return {
    title:  title  || 'Profit and Loss',
    entity: entity || '',
    period: period || '',
    months: monthCols.map(mc => mc.label),
    rows
  };
}

/* ============ AUTO-MAP (with AI thinking) ============ */
function autoMap(parsed){
  const monthCount = parsed.months.length;
  const mapped = {};
  const unmapped = [];
  const decisions = [];   // [{ source, target, confidence, reason, signals }]
  parsed.rows.forEach(r => {
    const decision = mapAccountAI(r.name);
    decisions.push({
      source: r.name,
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
  return { mapped, unmapped, decisions };
}

/* ============ OUTPUT BUILDER ============ */
function buildOutputWorkbook({ source, mapped, unmapped, entityOverride }){
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
  const { mapped, unmapped, decisions } = autoMap(source);
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
      noConfCount:   noConf
    }
  };
}

global.CTGPnLConverter = {
  convertFile, parseExcel, parsePdf,
  autoMap, mapAccount, mapAccountAI,
  COA, COA_KEYWORDS
};

})(window);
