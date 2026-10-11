// Lokaler Speicher (zuerst lokal, Abgleich über sync.js). Eine Zeile pro Karte bzw. Einstellung/Tag.
import { dayKey } from './srs.js';

const K = 'fra1';
const DEF = {
  newS: 30, newV: 30, goal: 60, restDay: -1,
  a: { reps: 2, pause: 1500, rate: 1 },
  b: { reps: 2, pause: 2000, rate: 1, trans: false },
  d: { pause: 2000 },
  e: { pause: 500, rate: 1 },
};

const read = k => { try { return JSON.parse(localStorage.getItem(`${K}.${k}`)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(`${K}.${k}`, JSON.stringify(v)); } catch { /* voll/privat */ } };

let S = read('state') || {};
const dirty = new Set(read('dirty') || []);
const subs = [];
let timer;

export function flush() { clearTimeout(timer); write('state', S); write('dirty', [...dirty]); }
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
addEventListener('pagehide', flush);

export const get = id => S[id];
export const onChange = f => subs.push(f);

export function put(id, patch) {
  S[id] = { ...(S[id] || {}), ...patch, u: Date.now() };
  dirty.add(id); save(); subs.forEach(f => f(id));
  return S[id];
}

// Neuere Änderung gewinnt.
export function merge(id, remote) {
  const local = S[id];
  if (!local || (remote.u || 0) > (local.u || 0)) { S[id] = remote; dirty.delete(id); save(); }
}

export const dirtyIds = () => [...dirty];
export function clean(snap) {
  for (const [id, u] of Object.entries(snap)) if (S[id] && S[id].u === u) dirty.delete(id);
  save();
}

export function settings() {
  const s = S._settings || {};
  return { ...DEF, ...s, a: { ...DEF.a, ...s.a }, b: { ...DEF.b, ...s.b }, d: { ...DEF.d, ...s.d }, e: { ...DEF.e, ...s.e } };
}
export const setSettings = patch => put('_settings', patch);

export const day = (k = dayKey()) => S[`_d:${k}`] || {};
export function addMinutes(m) {
  const k = `_d:${dayKey()}`;
  put(k, { min: ((S[k] || {}).min || 0) + m });
}

export const lastPull = () => read('pull') || '1970-01-01T00:00:00Z';
export const setLastPull = v => write('pull', v);
