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
      // Audit-log the auth lifecycle so admins can see sign-in / sign-out events.
      // Fire-and-forget — never block auth on logging.
      if (event === 'SIGNED_IN' && currentUser && newUid !== prevUid) {
        try { logActivity('login', { metadata: { ua: navigator.userAgent.slice(0, 200) } }); } catch (_e) {}
      } else if (event === 'SIGNED_OUT' && prevUid) {
        // SIGNED_OUT fires after currentUser is cleared — there's no JWT to authorize
        // the RPC anymore, so we don't try to log here (the sign-in event covers session bracketing).
      }
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

  async function adminSetUserProfile(userId, role, entityIds, opts) {
    _ensureSb();
    // entityIds is an array; backward-compat: accept null/undefined/single uuid
    let ids = entityIds;
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    opts = opts || {};
    const payload = {
      p_user_id: userId,
      p_role: role,
      p_entity_ids: ids
    };
    // Optional security flags — pass through only when provided so callers
    // that didn't opt in keep the existing values (NULL = leave-as-is on DB).
    if (typeof opts.isActive === 'boolean')           payload.p_is_active             = opts.isActive;
    if (typeof opts.mustChangePassword === 'boolean') payload.p_must_change_password  = opts.mustChangePassword;
    if (opts.enabledFeatures && typeof opts.enabledFeatures === 'object') {
      payload.p_enabled_features = opts.enabledFeatures;
    }
    const { error } = await sb.rpc('admin_set_user_profile', payload);
    if (error) throw error;
  }

  // Called by the user after a successful password change to clear the
  // "must change password" gate so they don't get re-prompted next login.
  async function clearMyMustChangePassword() {
    if (!sb || !currentUser) return;
    try {
      await sb.rpc('clear_my_must_change_password');
    } catch (e) { console.warn('[clear_my_must_change_password]', e); }
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

  // ---------- Suppliers (admin-managed master list, mirrors entities) ----------
  // Used by the PO Cash Flow Estimator's supplier dropdown. PO defaults
  // (lead time, deposit%, balance%, credit days, duty%, forwarding fee)
  // auto-populate when an admin picks a supplier. Read by all signed-in
  // users so dropdowns work for non-admins too.
  const SUPPLIER_FIELDS = 'id,entity_id,name,code,legal_name,registration_number,tax_number,tin_number,address_line1,address_line2,city,state,postcode,country,contact_person,contact_email,contact_phone,base_currency,default_lead_time_weeks,default_deposit_pct,default_balance_pct,default_credit_days,default_import_duty_pct,default_forwarding_fee,payment_terms_note,notes,is_active,created_at,updated_at';

  async function listSuppliers({ activeOnly = false } = {}) {
    if (!sb || !currentUser) return [];
    let q = sb.from('suppliers').select(SUPPLIER_FIELDS).order('name');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function createSupplier(payload) {
    _ensureSb();
    const { data, error } = await sb.from('suppliers').insert(payload).select(SUPPLIER_FIELDS).single();
    if (error) throw error;
    return data;
  }

  async function updateSupplier(id, payload) {
    _ensureSb();
    const { data, error } = await sb.from('suppliers').update(payload).eq('id', id).select(SUPPLIER_FIELDS).single();
    if (error) throw error;
    return data;
  }

  async function deleteSupplier(id) {
    _ensureSb();
    const { error } = await sb.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- WHT scenarios (DB-backed, entity-scoped) ----------
  // RLS on the table already enforces that non-admins only see scenarios
  // for entities they're assigned to. Admins see all.
  const WHT_SCN_FIELDS = 'id,user_id,entity_id,name,data,created_at,updated_at';

  async function listWhtScenarios({ entityId = null } = {}) {
    if (!sb || !currentUser) return [];
    let q = sb.from('wht_scenarios').select(WHT_SCN_FIELDS).order('created_at', { ascending: false });
    if (entityId && entityId !== '*') q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) { console.error('[wht_scenarios.list]', error); return []; }
    return data || [];
  }

  async function saveWhtScenario({ name, entityId, data }) {
    _ensureSb();
    if (!name || !entityId) throw new Error('Name and entity are required.');
    const { data: row, error } = await sb.from('wht_scenarios').insert({
      user_id: currentUser.id, entity_id: entityId, name, data
    }).select(WHT_SCN_FIELDS).single();
    if (error) throw error;
    return row;
  }

  async function deleteWhtScenario(id) {
    _ensureSb();
    const { error } = await sb.from('wht_scenarios').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- PO scenarios (DB-backed, entity-scoped) ----------
  const PO_SCN_FIELDS = 'id,user_id,entity_id,name,data,created_at,updated_at';

  async function listPoScenarios({ entityId = null } = {}) {
    if (!sb || !currentUser) return [];
    let q = sb.from('po_scenarios').select(PO_SCN_FIELDS).order('created_at', { ascending: false });
    if (entityId && entityId !== '*') q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) { console.error('[po_scenarios.list]', error); return []; }
    return data || [];
  }

  async function savePoScenario({ name, entityId, data }) {
    _ensureSb();
    if (!name || !entityId) throw new Error('Name and entity are required.');
    const { data: row, error } = await sb.from('po_scenarios').insert({
      user_id: currentUser.id, entity_id: entityId, name, data
    }).select(PO_SCN_FIELDS).single();
    if (error) throw error;
    return row;
  }

  async function deletePoScenario(id) {
    _ensureSb();
    const { error } = await sb.from('po_scenarios').delete().eq('id', id);
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

  // ---------- Activity audit log ----------
  // Most writes (scenarios, entities, suppliers, user_profiles, user_entities)
  // are captured automatically by the public.tg_audit_row() Postgres trigger
  // — no client code needed. Client-side events (login, scope switch, export)
  // call CTG.logActivity() which writes via the log_activity RPC.
  // RLS: admins see all rows; normal users see only their own.
  async function logActivity(action, opts = {}) {
    if (!sb || !currentUser) return null;
    try {
      const { data, error } = await sb.rpc('log_activity', {
        p_action:        String(action || ''),
        p_resource_type: opts.resourceType || null,
        p_resource_id:   opts.resourceId   || null,
        p_entity_id:     opts.entityId     || null,
        p_metadata:      opts.metadata     || {}
      });
      if (error) { console.warn('[logActivity] failed:', error.message); return null; }
      return data;
    } catch (e) { console.warn('[logActivity] threw:', e); return null; }
  }

  async function listActivityLog({ limit = 200, sinceDays = null, action = null, entityId = null, userId = null, search = null } = {}) {
    if (!sb || !currentUser) return [];
    let q = sb.from('activity_log')
      .select('id,user_id,user_email,entity_id,action,resource_type,resource_id,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit | 0, 1), 1000));
    if (sinceDays && sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
      q = q.gte('created_at', since);
    }
    if (action)   q = q.eq('action', action);
    if (entityId) q = q.eq('entity_id', entityId);
    if (userId)   q = q.eq('user_id', userId);
    if (search)   q = q.ilike('user_email', '%' + search + '%');
    const { data, error } = await q;
    if (error) { console.error('[listActivityLog]', error); return []; }
    return data || [];
  }

  async function adminPurgeActivityLog(olderThanDays) {
    _ensureSb();
    const cutoff = new Date(Date.now() - (olderThanDays | 0) * 86400000).toISOString();
    const { data, error } = await sb.rpc('admin_purge_activity_log', { p_older_than: cutoff });
    if (error) throw error;
    return data;
  }

  // ─── Admin cross-entity dashboard — aggregate KPIs in one RPC
  async function adminDashboardOverview() {
    _ensureSb();
    const { data, error } = await sb.rpc('admin_dashboard_overview');
    if (error) throw error;
    return data || {};
  }

  // ─── Admin migration: bulk-restore historical activity_log rows
  async function adminImportActivityLog(rows) {
    _ensureSb();
    const { data, error } = await sb.rpc('admin_import_activity_log', { p_rows: rows });
    if (error) throw error;
    // RPC returns a 1-row table → [{ ok, failed, errors }]
    return Array.isArray(data) ? data[0] : data;
  }

  // ─── Admin migration: bulk-import saved scenarios across all 4
  // calculator tables. Each row picks its target table via a
  // "calculator" field (bep|wht|po|pc).
  async function adminImportScenarios(rows) {
    _ensureSb();
    const { data, error } = await sb.rpc('admin_import_scenarios', { p_rows: rows });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  // ---------- working state (calculator inputs) ----------
  // Always local — too noisy to sync on every keystroke.
  function loadWorkingState() { return lsRead(LS_STATE, null); }
  function saveWorkingState(state) { lsWrite(LS_STATE, state); }
  function loadLang() { return lsRead(LS_LANG, null); }
  function saveLang(lang) { lsWrite(LS_LANG, lang); }

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
    clearMyMustChangePassword,
    updateMyProfile,
    listEntities,
    createEntity,
    updateEntity,
    deleteEntity,
    listSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    listWhtScenarios,
    saveWhtScenario,
    deleteWhtScenario,
    listPoScenarios,
    savePoScenario,
    deletePoScenario,
    pcListSavedScenarios,
    pcSaveSavedScenario,
    pcDeleteSavedScenario,
    logActivity,
    listActivityLog,
    adminPurgeActivityLog,
    adminDashboardOverview,
    adminImportActivityLog,
    adminImportScenarios,
    signOut,
    listScenarios,
    saveScenario,
    deleteScenario,
    migrateLocalToCloud,
    loadWorkingState,
    saveWorkingState,
    loadLang,
    saveLang
  };
})();
