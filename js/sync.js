// Abgleich mit Supabase (gleiches Projekt und Login wie das PARA Cockpit, Tabelle fr_progress).
import * as store from './store.js';

const CONFIG = { url: 'https://yzntbxbdxtdqgddyicdn.supabase.co', key: 'sb_publishable_0hu09OCTj9H1dnam_ztXYQ_0OfPEk1R' };
const sb = window.supabase ? window.supabase.createClient(CONFIG.url, CONFIG.key) : null;
let user = null, busy = false, statusCb = () => {};

const status = s => statusCb(s);
export const onStatus = f => { statusCb = f; };
export const currentUser = () => user;

export async function init(onAuth) {
  if (!sb) return status('offline');
  const { data } = await sb.auth.getSession();
  user = data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((_e, s) => {
    const was = user && user.id; user = s ? s.user : null;
    if ((user && user.id) !== was) { onAuth(); if (user) sync(); }
  });
  addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(sync, 60000);
  status(user ? '' : 'lokal');
  if (user) sync();
}

export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export const logout = () => sb.auth.signOut();

export async function sync() {
  if (!sb || !user || busy || !navigator.onLine) return;
  busy = true; status('↻');
  try {
    const ids = store.dirtyIds();
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500), snap = {};
      const rows = part.map(id => { const d = store.get(id); snap[id] = d.u; return { user_id: user.id, id, data: d, updated_at: d.u || 0 }; });
      const { error } = await sb.from('fr_progress').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      store.clean(snap);
    }
    let since = store.lastPull();
    for (;;) {
      const { data, error } = await sb.from('fr_progress').select('id,data,synced_at')
        .gt('synced_at', since).order('synced_at').limit(1000);
      if (error) throw error;
      data.forEach(r => store.merge(r.id, r.data));
      if (data.length) { since = data[data.length - 1].synced_at; store.setLastPull(since); }
      if (data.length < 1000) break;
    }
    store.flush(); status('');
  } catch (e) {
    console.warn('Sync', e); status('⚠');
  } finally { busy = false; }
}
