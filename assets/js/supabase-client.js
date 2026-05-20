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
  const listeners = new Set();
  function emit(event, payload) { listeners.forEach(fn => { try { fn(event, payload); } catch (e) { console.error(e); } }); }

  // ---------- auth ----------
  let currentUser = null;

  async function init() {
    if (!sb) { emit('auth', { user: null, mode: 'offline' }); return { user: null }; }
    const { data } = await sb.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    emit('auth', { event: 'INITIAL_SESSION', user: currentUser, mode: currentUser ? 'cloud' : 'anonymous' });
    sb.auth.onAuthStateChange((event, session) => {
      const prevUid = currentUser ? currentUser.id : null;
      currentUser = session ? session.user : null;
      const newUid  = currentUser ? currentUser.id : null;
      if (newUid && newUid !== prevUid) lsWrite(LS_LAST_UID, newUid);
      emit('auth', { event, user: currentUser, mode: currentUser ? 'cloud' : 'anonymous', prevUid, newUid });
    });
    return { user: currentUser };
  }

  function onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); }

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

  // ---------- entities (company profiles) ----------
  // All authenticated users can read (for dropdown); writes are admin-only via RLS.
  const ENTITY_FIELDS = 'id,name,legal_name,registration_number,tax_number,address_line1,address_line2,city,state,postcode,country,contact_person,contact_email,contact_phone,notes,is_active,created_at,updated_at';

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

  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
  }

  // ---------- scenarios ----------
  // Shape (both modes): { id, name, color, data, created_at, updated_at }
  // 'data' is the calculator state snapshot.

  async function listScenarios() {
    if (sb && currentUser) {
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
    listEntities,
    createEntity,
    updateEntity,
    deleteEntity,
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
