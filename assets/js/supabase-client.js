/* ============================================================
   CTG BEP Calculator — Supabase client
   Exposes window.CTG with auth + scenarios CRUD.
   When signed out, scenarios live in localStorage.
   When signed in, scenarios live in the Supabase 'scenarios' table.
   ============================================================ */
(function () {
  const LS_KEY      = 'ctg_bep_scenarios_v1';   // local cache + anonymous storage
  const LS_STATE    = 'ctg_bep_state_v1';       // calculator working state
  const LS_LANG     = 'ctg_bep_lang_v1';
  const LS_LAST_UID = 'ctg_bep_last_uid_v1';

  if (!window.CTG_CONFIG || !window.CTG_CONFIG.SUPABASE_URL || !window.CTG_CONFIG.SUPABASE_ANON_KEY) {
    console.warn('[CTG] config.js missing or incomplete — running in offline mode (localStorage only).');
  }

  const SUPABASE_URL  = (window.CTG_CONFIG || {}).SUPABASE_URL  || '';
  const SUPABASE_ANON = (window.CTG_CONFIG || {}).SUPABASE_ANON_KEY || '';
  const HAS_SUPABASE  = !!(SUPABASE_URL && SUPABASE_ANON && window.supabase);

  const sb = HAS_SUPABASE
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  // ---------- local storage helpers ----------
  function lsRead(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function lsWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ---------- pub/sub for auth changes ----------
  // Listeners are called with one argument: the event payload object
  // ({ event, user, mode, prevUid, newUid }).
  const listeners = new Set();
  function emit(payload) {
    listeners.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  }

  // ---------- auth ----------
  let currentUser = null;
  // Returns { role, entity_id, entity_name } for the signed-in user — or null if not signed in.
  // Cached per-session so the calculator can synchronously read the user's entity.
  let _profileCache = null;

  // Buffer auth events that fire before any listener attaches. Critical for
  // PASSWORD_RECOVERY: Supabase emits this event synchronously during the SDK's
  // URL-hash parse on page load, which happens before our app's init() has had
  // a chance to subscribe via CTG.onAuth(). Without buffering, the recovery
  // modal would never open and the user would think the reset link is broken.
  const _bufferedEvents = [];
  let _replayedToListeners = false;

  if (sb) {
    // Register the onAuthStateChange callback IMMEDIATELY at module load — not
    // inside init() — so events that fire during URL-hash parsing are caught.
    sb.auth.onAuthStateChange((event, session) => {
      const prevUid = currentUser ? currentUser.id : null;
      currentUser = session ? session.user : null;
      const newUid = currentUser ? currentUser.id : null;
      if (newUid && newUid !== prevUid) lsWrite(LS_LAST_UID, newUid);
      // Invalidate profile cache when the user identity changes (sign-in/out/switch)
      if (newUid !== prevUid) _profileCache = null;
      const payload = { event, user: currentUser, mode: currentUser ? 'cloud' : 'anonymous', prevUid, newUid };
      if (listeners.size === 0) _bufferedEvents.push(payload);
      else emit(payload);
    });
  }

  async function init() {
    if (!sb) {
      emit({ event: 'INITIAL_SESSION', user: null, mode: 'offline' });
      return { user: null };
    }
    const { data } = await sb.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    // Don't double-emit INITIAL_SESSION here if onAuthStateChange already did.
    // The SDK fires INITIAL_SESSION via onAuthStateChange on first call;
    // we buffered it above so onAuth() replay will deliver it.
    return { user: currentUser };
  }

  function onAuth(fn) {
    listeners.add(fn);
    // Replay any auth events that fired before any listener was attached.
    if (!_replayedToListeners && _bufferedEvents.length > 0) {
      _replayedToListeners = true;
      const queue = _bufferedEvents.splice(0);
      queue.forEach(payload => { try { fn(payload); } catch (e) { console.error(e); } });
    }
    return () => listeners.delete(fn);
  }

  function getUser() { return currentUser; }
  function isSignedIn() { return !!currentUser; }

  function _ensureSb() {
    if (!sb) throw new Error('Auth is not configured. Edit config.js with your Supabase URL and anon key.');
  }

  async function signInWithPassword({ email, password }) {
    _ensureSb();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  // Returns { user, needsConfirmation }. If your Supabase project requires email
  // confirmation (default), needsConfirmation will be true and there's no session
  // until the user clicks the link in the email.
  async function signUpWithPassword({ email, password }) {
    _ensureSb();
    const emailRedirectTo = window.location.origin + window.location.pathname;
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { emailRedirectTo }
    });
    if (error) throw error;
    return { user: data.user, needsConfirmation: !data.session };
  }

  async function sendPasswordReset(email) {
    _ensureSb();
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(newPassword) {
    _ensureSb();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function updateDisplayName(name) {
    _ensureSb();
    const { error } = await sb.auth.updateUser({ data: { full_name: name } });
    if (error) throw error;
  }

  // ---------- admin RPCs ----------
  async function isAppAdmin() {
    if (!sb || !currentUser) return false;
    const { data, error } = await sb.rpc('is_app_admin');
    if (error) { console.error(error); return false; }
    return !!data;
  }

  async function adminListUsers() {
    _ensureSb();
    const { data, error } = await sb.rpc('admin_list_users');
    if (error) throw error;
    return data || [];
  }

  async function getCurrentProfile() {
    if (!sb || !currentUser) { _profileCache = null; return null; }
    if (_profileCache && _profileCache._uid === currentUser.id) return _profileCache;
    const { data, error } = await sb.rpc('current_user_profile');
    if (error) { console.error(error); return null; }
    const row = (data && data[0]) || {};
    // Cache ALL fields returned by current_user_profile() — not just role/entity.
    // Otherwise the Settings tab can't pre-fill the saved profile values.
    _profileCache = {
      _uid: currentUser.id,
      role:         row.role         || 'user',
      entity_id:    row.entity_id    || null,
      entity_name:  row.entity_name  || null,
      full_name:    row.full_name    || '',
      display_name: row.display_name || '',
      job_title:    row.job_title    || '',
      department:   row.department   || '',
      phone:        row.phone        || '',
      mobile:       row.mobile       || '',
      bio:          row.bio          || ''
    };
    return _profileCache;
  }

  async function adminSetUserProfile(userId, role, entityIds) {
    _ensureSb();
    // entityIds is an array; backward-compat: accept null/undefined/single uuid
    let ids = entityIds;
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    const { error } = await sb.rpc('admin_set_user_profile', {
      p_user_id: userId,
      p_role: role,
      p_entity_ids: ids
    });
    if (error) throw error;
  }

  // Any signed-in user updates their own profile row.
  async function updateMyProfile(fields) {
    _ensureSb();
    const { error } = await sb.rpc('update_my_profile', {
      p_full_name:    fields.full_name    ?? null,
      p_job_title:    fields.job_title    ?? null,
      p_department:   fields.department   ?? null,
      p_phone:        fields.phone        ?? null,
      p_mobile:       fields.mobile       ?? null,
      p_bio:          fields.bio          ?? null,
      p_display_name: fields.display_name ?? null
    });
    if (error) throw error;
    _profileCache = null; // invalidate so next read pulls fresh data
  }

  // Admin-only: list all scenarios across all users (joined with owner + entity).
  async function adminListScenarios() {
    _ensureSb();
    const { data, error } = await sb.rpc('admin_list_scenarios');
    if (error) throw error;
    return data || [];
  }

  // ---------- entities (company profiles) ----------
  // All authenticated users can read (for dropdown); writes are admin-only via RLS.
  const ENTITY_FIELDS = 'id,name,legal_name,registration_number,tax_number,tin_number,address_line1,address_line2,city,state,postcode,country,contact_person,contact_email,contact_phone,notes,is_active,created_at,updated_at';

  async function listEntities({ activeOnly = false } = {}) {
    if (!sb || !currentUser) return [];
    let q = sb.from('entities').select(ENTITY_FIELDS).order('name');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function createEntity(payload) {
    _ensureSb();
    const { data, error } = await sb.from('entities').insert(payload).select(ENTITY_FIELDS).single();
    if (error) throw error;
    return data;
  }

  async function updateEntity(id, payload) {
    _ensureSb();
    const { data, error } = await sb.from('entities').update(payload).eq('id', id).select(ENTITY_FIELDS).single();
    if (error) throw error;
    return data;
  }

  async function deleteEntity(id) {
    _ensureSb();
    const { error } = await sb.from('entities').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- Product Costing scenarios (DB-backed) ----------
  async function pcListSavedScenarios() {
    if (!sb || !currentUser) return [];
    const { data, error } = await sb
      .from('pc_scenarios')
      .select('id,name,color,entity_id,data,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  }
  async function pcSaveSavedScenario({ name, color, entity_id, data }) {
    _ensureSb();
    const insert = { user_id: currentUser.id, name, color, data };
    if (entity_id) insert.entity_id = entity_id;
    const { data: row, error } = await sb.from('pc_scenarios').insert(insert).select().single();
    if (error) throw error;
    return row;
  }
  async function pcDeleteSavedScenario(id) {
    _ensureSb();
    const { error } = await sb.from('pc_scenarios').delete().eq('id', id);
    if (error) throw error;
  }

  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
  }

  // ---------- scenarios ----------
  // Shape (both modes): { id, name, color, data, created_at, updated_at }
  // 'data' is the calculator state snapshot.

  async function listScenarios() {
    if (sb && currentUser) {
      // If the signed-in user is an admin, return ALL scenarios across users with owner info.
      // Otherwise return only the user's own (RLS enforces this server-side anyway).
      const profile = await getCurrentProfile();
      if (profile && profile.role === 'admin') {
        const { data, error } = await sb.rpc('admin_list_scenarios');
        if (error) { console.error(error); return []; }
        return data || [];
      }
      const { data, error } = await sb
        .from('scenarios')
        .select('id,name,color,data,entity_id,created_at,updated_at')
        .order('updated_at', { ascending: false });
      if (error) { console.error(error); return lsRead(LS_KEY, []); }
      return data || [];
    }
    return lsRead(LS_KEY, []);
  }

  async function saveScenario({ name, color, data, entity_id }) {
    const now = new Date().toISOString();
    if (sb && currentUser) {
      const insertRow = { user_id: currentUser.id, name, color, data };
      if (entity_id) insertRow.entity_id = entity_id;
      const { data: row, error } = await sb
        .from('scenarios')
        .insert(insertRow)
        .select()
        .single();
      if (error) { console.error(error); throw error; }
      return row;
    }
    const row = { id: 'local_' + Date.now().toString(36), name, color, data, entity_id: entity_id || null, created_at: now, updated_at: now };
    const all = lsRead(LS_KEY, []);
    all.unshift(row);
    lsWrite(LS_KEY, all);
    return row;
  }

  async function deleteScenario(id) {
    if (sb && currentUser && !String(id).startsWith('local_')) {
      const { error } = await sb.from('scenarios').delete().eq('id', id);
      if (error) { console.error(error); throw error; }
      return;
    }
    const all = lsRead(LS_KEY, []).filter(s => s.id !== id);
    lsWrite(LS_KEY, all);
  }

  // Move every local_* scenario into Supabase and clear them from localStorage.
  // Called after a successful sign-in if the user has local scenarios.
  async function migrateLocalToCloud() {
    if (!sb || !currentUser) return { migrated: 0 };
    const locals = lsRead(LS_KEY, []).filter(s => String(s.id).startsWith('local_'));
    if (locals.length === 0) return { migrated: 0 };
    const rows = locals.map(s => ({
      user_id: currentUser.id,
      name: s.name,
      color: s.color || null,
      data: s.data
    }));
    const { error } = await sb.from('scenarios').insert(rows);
    if (error) { console.error(error); return { migrated: 0, error }; }
    // Drop the local copies that were migrated; keep any non-local rows (shouldn't exist, but defensive).
    const remaining = lsRead(LS_KEY, []).filter(s => !String(s.id).startsWith('local_'));
    lsWrite(LS_KEY, remaining);
    return { migrated: locals.length };
  }

  // ---------- working state (calculator inputs) ----------
  // Always local — too noisy to sync on every keystroke.
  function loadWorkingState() { return lsRead(LS_STATE, null); }
  function saveWorkingState(state) { lsWrite(LS_STATE, state); }
  function loadLang() { return lsRead(LS_LANG, null); }
  function saveLang(lang) { lsWrite(LS_LANG, lang); }

  // ════════════════════════════════════════════════════════════════════════
  // AI BOOKKEEPER — multi-entity automated bookkeeping w/ Xero + Google Drive
  // ════════════════════════════════════════════════════════════════════════

  // ---------- Chart of Accounts ----------
  async function bkListCoaTemplate() {
    if (!sb) return [];
    const { data, error } = await sb
      .from('bk_coa_template')
      .select('code,name,name_zh,account_type,account_subtype,parent_code,is_sst_applicable,display_order')
      .order('display_order', { ascending: true });
    if (error) { console.error(error); return []; }
    return data || [];
  }
  async function bkListCoaAccounts(entityId) {
    if (!sb || !currentUser || !entityId) return [];
    const { data, error } = await sb
      .from('bk_coa_accounts')
      .select('*')
      .eq('entity_id', entityId)
      .order('code', { ascending: true });
    if (error) { console.error(error); return []; }
    return data || [];
  }
  async function bkSeedCoaForEntity(entityId) {
    _ensureSb();
    const { data, error } = await sb.rpc('bk_seed_coa_for_entity', { p_entity_id: entityId });
    if (error) throw error;
    return data;
  }
  async function bkUpsertCoaAccount(entityId, account) {
    _ensureSb();
    const row = { ...account, entity_id: entityId };
    const { data, error } = await sb
      .from('bk_coa_accounts')
      .upsert(row, { onConflict: 'entity_id,code' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  async function bkDeleteCoaAccount(id) {
    _ensureSb();
    const { error } = await sb.from('bk_coa_accounts').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- Documents ----------
  // Path convention: {entity_id}/{doc_id}.{ext}
  async function bkUploadDocument(entityId, file) {
    _ensureSb();
    if (!entityId) throw new Error('entityId is required');
    if (!file) throw new Error('file is required');

    // 1. SHA-256 hash for dedup
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 2. Check duplicate
    const { data: existing } = await sb
      .from('bk_documents')
      .select('id, file_name, status')
      .eq('entity_id', entityId)
      .eq('content_hash', hashHex)
      .maybeSingle();
    if (existing) {
      return { document: existing, duplicate: true };
    }

    // 3. Generate doc id + storage path
    const docId = crypto.randomUUID();
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const storagePath = `${entityId}/${docId}.${ext}`;

    // 4. Upload to storage
    const { error: upErr } = await sb.storage
      .from('bk-documents')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
    if (upErr) throw upErr;

    // 5. Insert document row
    const { data: doc, error: insErr } = await sb
      .from('bk_documents')
      .insert({
        id: docId,
        entity_id: entityId,
        uploaded_by: currentUser.id,
        source: 'upload',
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
        content_hash: hashHex,
        status: 'new'
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return { document: doc, duplicate: false };
  }

  async function bkListDocuments(entityId, filters = {}) {
    if (!sb || !currentUser || !entityId) return [];
    let q = sb.from('bk_documents')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(filters.limit || 200);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.docKind) q = q.eq('doc_kind', filters.docKind);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  }
  async function bkGetDocument(id) {
    if (!sb) return null;
    const { data, error } = await sb.from('bk_documents').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  }
  async function bkGetDocumentSignedUrl(storagePath, expiresInSec = 600) {
    _ensureSb();
    const { data, error } = await sb.storage
      .from('bk-documents')
      .createSignedUrl(storagePath, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  }
  async function bkUpdateDocument(id, patch) {
    _ensureSb();
    const { data, error } = await sb
      .from('bk_documents').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  async function bkDeleteDocument(id) {
    _ensureSb();
    // Fetch storage path first
    const doc = await bkGetDocument(id);
    if (doc && doc.storage_path) {
      await sb.storage.from('bk-documents').remove([doc.storage_path]);
    }
    const { error } = await sb.from('bk_documents').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- Journal Entries ----------
  async function bkListJournalEntries(entityId, filters = {}) {
    if (!sb || !currentUser || !entityId) return [];
    let q = sb.from('bk_journal_entries')
      .select('*, bk_journal_lines(*)')
      .eq('entity_id', entityId)
      .order('entry_date', { ascending: false })
      .limit(filters.limit || 200);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  }
  async function bkCreateJournalEntry(entityId, entry, lines) {
    _ensureSb();
    const { data: je, error: jeErr } = await sb
      .from('bk_journal_entries')
      .insert({ ...entry, entity_id: entityId, created_by: currentUser.id })
      .select()
      .single();
    if (jeErr) throw jeErr;
    if (lines && lines.length) {
      const linesPayload = lines.map((L, i) => ({ ...L, entry_id: je.id, line_no: i + 1 }));
      const { error: linesErr } = await sb.from('bk_journal_lines').insert(linesPayload);
      if (linesErr) throw linesErr;
    }
    return je;
  }
  async function bkUpdateJournalEntry(id, patch) {
    _ensureSb();
    const { data, error } = await sb
      .from('bk_journal_entries').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  async function bkDeleteJournalEntry(id) {
    _ensureSb();
    const { error } = await sb.from('bk_journal_entries').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- COA corrections (AI training feedback) ----------
  async function bkRecordCoaCorrection(entityId, payload) {
    _ensureSb();
    const { data, error } = await sb
      .from('bk_coa_corrections')
      .insert({ ...payload, entity_id: entityId, corrected_by: currentUser.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  async function bkListCoaCorrections(entityId, limit = 50) {
    if (!sb || !entityId) return [];
    const { data, error } = await sb
      .from('bk_coa_corrections')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error(error); return []; }
    return data || [];
  }

  // ---------- Connections ----------
  async function bkGetXeroConnection(entityId) {
    if (!sb || !entityId) return null;
    const { data, error } = await sb
      .from('bk_xero_connections')
      .select('id,entity_id,xero_tenant_id,xero_tenant_name,xero_org_country,expires_at,last_refreshed_at,refresh_failure_count,created_at')
      .eq('entity_id', entityId)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }
  async function bkGetGDriveConnection() {
    if (!sb || !currentUser) return null;
    const { data, error } = await sb
      .from('bk_gdrive_connections')
      .select('user_id,google_email,scopes,expires_at,last_refreshed_at,refresh_failure_count,created_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }

  // ---------- Edge Function helpers (called when AI/Xero/Drive functions exist) ----------
  async function bkInvokeEdgeFunction(name, body = {}) {
    _ensureSb();
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  }
  // Convenience wrappers — these call Edge Functions we'll deploy next:
  //   bk-ocr-extract   → run Claude Vision on a document
  //   bk-categorise    → assign COA to extracted data
  //   bk-build-journal → build balanced journal entry
  //   bk-xero-connect  → start Xero OAuth (returns auth URL)
  //   bk-xero-callback → finish Xero OAuth (handled by callback page)
  //   bk-xero-sync     → push journal entry to Xero
  //   bk-gdrive-connect/callback/import — same pattern for Google Drive
  async function bkRunOcr(documentId)    { return bkInvokeEdgeFunction('bk-ocr-extract',   { document_id: documentId }); }
  async function bkRunCategorise(docId)  { return bkInvokeEdgeFunction('bk-categorise',    { document_id: docId }); }
  async function bkBuildJournal(docId)   { return bkInvokeEdgeFunction('bk-build-journal', { document_id: docId }); }
  async function bkXeroAuthUrl(entityId) { return bkInvokeEdgeFunction('bk-xero-connect',  { entity_id: entityId }); }
  async function bkXeroSync(entryId)     { return bkInvokeEdgeFunction('bk-xero-sync',     { journal_entry_id: entryId }); }

  // ---------- expose ----------
  window.CTG = {
    HAS_SUPABASE,
    init,
    onAuth,
    getUser,
    isSignedIn,
    signInWithPassword,
    signUpWithPassword,
    sendPasswordReset,
    updatePassword,
    updateDisplayName,
    isAppAdmin,
    adminListUsers,
    adminListScenarios,
    getCurrentProfile,
    adminSetUserProfile,
    updateMyProfile,
    listEntities,
    createEntity,
    updateEntity,
    deleteEntity,
    pcListSavedScenarios,
    pcSaveSavedScenario,
    pcDeleteSavedScenario,
    signOut,
    listScenarios,
    saveScenario,
    deleteScenario,
    migrateLocalToCloud,
    loadWorkingState,
    saveWorkingState,
    loadLang,
    saveLang,
    // ── AI Bookkeeper ──────────────────────────────
    bkListCoaTemplate,
    bkListCoaAccounts,
    bkSeedCoaForEntity,
    bkUpsertCoaAccount,
    bkDeleteCoaAccount,
    bkUploadDocument,
    bkListDocuments,
    bkGetDocument,
    bkGetDocumentSignedUrl,
    bkUpdateDocument,
    bkDeleteDocument,
    bkListJournalEntries,
    bkCreateJournalEntry,
    bkUpdateJournalEntry,
    bkDeleteJournalEntry,
    bkRecordCoaCorrection,
    bkListCoaCorrections,
    bkGetXeroConnection,
    bkGetGDriveConnection,
    bkRunOcr,
    bkRunCategorise,
    bkBuildJournal,
    bkXeroAuthUrl,
    bkXeroSync
  };
})();
