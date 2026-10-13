import * as store from './store.js';
import * as srs from './srs.js';
import * as sync from './sync.js';
import { runSession } from './modes.js';
import { md } from './md.js';
import { audioUrl } from './player.js';
import { GUIDE } from './guide.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const view = $('#view'), sessionEl = $('#session');
const MODES = { a: 'Kennenlernen', b: 'Nachsprechen', c: 'Abrufen', d: 'Audio-Abrufen', e: 'Hintergrund' };
let D, groupOf = {}, byId = {}, grammar = null, stash = [], session = null;

// ---------- Hilfen ----------
const st = id => store.get(id) || {};
const seenN = ids => ids.filter(id => st(id).seen).length;
const sitsN = ids => ids.filter(id => srs.sits(st(id).sp)).length;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function actions(ids, title, modes = 'abcde') {
  if (!ids.length) return '<p class="muted">Nichts zu tun.</p>';
  stash.push({ ids, title });
  const k = stash.length - 1;
  return `<div class="acts">${[...modes].map(m => `<button data-go="${m}" data-k="${k}" class="m-${m}">${MODES[m]}</button>`).join('')}</div>`;
}

// Zurücksetzen: Karten gelten wieder als neu und kommen über „Neue Sätze/Wörter“ erneut dran.
function resetBtn(ids, label) {
  stash.push({ ids });
  return `<button class="ghost" data-reset="${stash.length - 1}">↺ ${label}</button>`;
}
function resetCards(ids) {
  ids = ids.filter(id => st(id).seen);
  if (!ids.length) return alert('Hier gibt es nichts zurückzusetzen.');
  if (!confirm(`${ids.length} Karten zurücksetzen?\n\nSie gelten dann wieder als neu und kommen nach und nach über „Neue Sätze“ bzw. „Neue Wörter“ wieder dran.`)) return;
  ids.forEach(id => store.put(id, { seen: 0, sp: null, un: null }));
  sync.sync(); route();
}

function todayNew(kind) {
  const s = store.settings(), t0 = srs.dayStart();
  const ids = (kind === 's' ? D.islands : D.vocab).flatMap(g => g.blocks.flat());
  const seenToday = ids.filter(id => st(id).seen >= t0);
  const limit = new Date().getDay() === +s.restDay ? 0 : (kind === 's' ? +s.newS : +s.newV);
  const fresh = ids.filter(id => !st(id).seen).slice(0, Math.max(0, limit - seenToday.length));
  return [...seenToday, ...fresh];
}

function dueIds() {
  const t0 = srs.dayStart(), now = Date.now();
  return Object.keys(D.cards).filter(id => {
    const s = st(id);
    return s.seen && (s.sp ? s.sp.due <= now : s.seen < t0);
  });
}

function streak() {
  const goal = +store.settings().goal; let n = 0, t = Date.now();
  if ((store.day().min || 0) < goal) t -= srs.DAY;
  while ((store.day(srs.dayKey(t)).min || 0) >= goal) { n++; t -= srs.DAY; }
  return n;
}

function weekDays() {
  const goal = +store.settings().goal, now = new Date();
  const monday = srs.dayStart(now.getTime() - ((now.getDay() + 6) % 7) * srs.DAY);
  let n = 0;
  for (let t = monday; t <= now.getTime(); t += srs.DAY) if ((store.day(srs.dayKey(t)).min || 0) >= goal) n++;
  return n;
}

// ---------- Ansichten ----------
function vHeute() {
  const s = store.settings(), min = store.day().min || 0;
  const ns = todayNew('s'), nv = todayNew('v'), due = dueIds();
  const all = Object.keys(D.cards);
  const un = all.filter(id => srs.sits(st(id).un)).length, sp = sitsN(all);
  const from = [...new Set(ns.map(id => groupOf[id]))].join(', ');
  const rest = new Date().getDay() === +s.restDay;
  return `<section class="card stats">
      <div class="row"><span><b>${Math.floor(min)}</b> / ${s.goal} Min. aktiv</span><span>Serie ${streak()} · Woche ${weekDays()}/6</span></div>
      <div class="bar"><i style="width:${Math.min(100, pct(min, s.goal))}%"></i></div>
      <div class="row"><span>Verstehen: <b>${un}</b></span><span>Sprechen: <b>${sp}</b></span><span>Gesehen: <b>${seenN(all)}</b></span></div>
    </section>
    ${rest ? '<section class="card tip">Heute ist Wiederholungstag: keine neuen Sätze.</section>' : ''}
    ${seenN(all) ? '' : '<a class="card tip" href="#anleitung"><b>Neu hier?</b> Lies zuerst die kurze Anleitung (3 Minuten) ›</a>'}
    ${plan(due, ns, nv)}
    <details class="free"><summary>Freies Üben: Übung selbst wählen</summary>
    <section class="card"><h2>Fällige Wiederholung <small>${due.length}</small></h2>${actions(due.slice(0, 200), 'Wiederholung', 'cde')}</section>
    <section class="card"><h2>Neue Sätze <small>${ns.length}</small></h2>${from ? `<p class="muted">${esc(from)}</p>` : ''}${actions(ns, 'Neue Sätze')}</section>
    <section class="card"><h2>Neue Wörter <small>${nv.length}</small></h2>${actions(nv, 'Neue Wörter', 'acde')}</section></details>`;
}

// Fester Tagesplan: ein Knopf „Weiter“, erledigte Schritte bekommen einen Haken (pro Gerät und Tag).
function planDone() {
  try { const p = JSON.parse(localStorage.getItem('fra1.plan') || '{}'); return p.d === srs.dayKey() ? p.done : []; } catch { return []; }
}
function markPlan(key) {
  const done = planDone();
  if (!done.includes(key)) done.push(key);
  try { localStorage.setItem('fra1.plan', JSON.stringify({ d: srs.dayKey(), done })); } catch { /* egal */ }
}
function plan(due, ns, nv) {
  const done = planDone();
  const steps = [
    ['rep', 'c', due.slice(0, 200), 'Wiederholen', 'Wiederholung'],
    ['sa', 'a', ns, 'Neue Sätze · Kennenlernen', 'Neue Sätze'],
    ['sb', 'b', ns, 'Neue Sätze · Nachsprechen', 'Neue Sätze'],
    ['sc', 'c', ns, 'Neue Sätze · Abrufen', 'Neue Sätze'],
    ['va', 'a', nv, 'Neue Wörter · Kennenlernen', 'Neue Wörter'],
    ['vc', 'c', nv, 'Neue Wörter · Abrufen', 'Neue Wörter'],
  ].filter(s => s[2].length || done.includes(s[0])).map(([key, m, ids, label, title]) => {
    stash.push({ ids, title });
    return { key, m, k: stash.length - 1, label, n: ids.length, ok: done.includes(key) };
  });
  const next = steps.find(s => !s.ok);
  const btn = (s, cls, txt) => `<button class="${cls}" data-go="${s.m}" data-k="${s.k}" data-plan="${s.key}">${txt}</button>`;
  const extra = [...new Set([...due.slice(0, 100), ...ns, ...nv])];
  return `<section class="card"><div class="row"><h2>Dein Plan für heute</h2><a href="#anleitung" class="back">Anleitung</a></div>
    ${next ? btn(next, 'primary', `▶ Weiter: ${next.label} (${next.n})`)
      : `<p class="done-day">Tagesplan geschafft ✓</p><p class="muted">Wenn du magst, hör nebenbei noch Audio-Abrufen oder Hintergrund.</p>${actions(extra, 'Heute', 'de')}`}
    <div class="steps">${steps.map((s, i) => btn(s, `step${s.ok ? ' ok' : ''}${s === next ? ' now' : ''}`,
      `<i>${s.ok ? '✓' : i + 1}</i><span>${s.label}</span><small>${s.n || ''}</small>`)).join('')}</div>
    ${next ? `<details><summary>Nebenbei (freiwillig): Audio-Abrufen · Hintergrund</summary>${actions(extra, 'Heute', 'de')}</details>` : ''}
    ${due.length ? `<details><summary>Wiederholungen zu schwer?</summary><p class="muted">Setzt alle ${due.length} fälligen Karten zurück. Sie kommen dann wieder als neu, also mit Kennenlernen und Nachsprechen, jeden Tag nur so viele, wie du unter Mehr eingestellt hast. Einzelne Karten setzt du beim Abrufen mit „Kenne ich gar nicht“ zurück.</p>${resetBtn(due, 'Fällige Wiederholungen zurücksetzen')}</details>` : ''}</section>`;
}

function vAnleitung() {
  return `<h2 class="pt">Anleitung</h2><div class="md">${md(GUIDE)}</div><p><a href="#heute" class="back">‹ Zu Heute</a></p>`;
}

function vGroups(kind) {
  const groups = kind === 's' ? D.islands : D.vocab;
  return `<h2 class="pt">${kind === 's' ? 'Inseln' : 'Vokabeltrainer'}</h2>` + groups.map(g => {
    const ids = g.blocks.flat();
    return `<a class="card item" href="#g/${g.id}"><div><b>${esc(g.title)}</b>
      <small>${ids.length} ${kind === 's' ? 'Sätze' : 'Wörter'} · ${seenN(ids)} gesehen · ${sitsN(ids)} sitzen</small></div>
      <div class="prog"><i style="width:${pct(seenN(ids), ids.length)}%"></i><i class="k" style="width:${pct(sitsN(ids), ids.length)}%"></i></div></a>`;
  }).join('');
}

function vGroup(id) {
  const g = byId[id];
  if (!g) return vHeute();
  const all = g.blocks.flat(), back = g.kind === 's' ? 'inseln' : 'vokabeln';
  return `<a href="#${back}" class="back">‹ Zurück</a><h2 class="pt">${esc(g.title)}</h2>
    <section class="card"><h3>Alles</h3>${actions(all, g.title, 'cde')}
      <button class="ghost" data-dl="${g.id}">Offline laden</button> ${resetBtn(all, 'Alles zurücksetzen')} <div id="dl-${g.id}" class="dl"></div></section>` +
    g.blocks.map((b, i) => `<section class="card"><h3>Block ${i + 1} <small>${seenN(b)}/${b.length} gesehen · ${sitsN(b)} sitzen</small></h3>
      ${actions(b, `${g.title} · Block ${i + 1}`)}${seenN(b) ? resetBtn(b, 'Block zurücksetzen') : ''}
      <details><summary>Inhalt</summary>${b.map(c => `<div class="li"><span>${esc(D.cards[c].fr)}</span><small>${esc(D.cards[c].de)}</small></div>`).join('')}</details>
    </section>`).join('');
}

function loadGrammar() {
  return fetch('content/grammatik.md').then(r => r.text()).then(t => {
    grammar = t; try { localStorage.setItem('fra1.grammar', t); } catch { /* voll */ }
  });
}

async function vGrammatik() {
  if (grammar === null) grammar = localStorage.getItem('fra1.grammar');
  if (grammar === null) {
    try { await loadGrammar(); }
    catch { return '<p class="muted">Die Grammatik ist auf diesem Gerät noch nicht gespeichert. Öffne die App einmal mit Internet.</p>'; }
  }
  const parts = grammar.split(/\n(?=## )/);
  setTimeout(() => {
    const inp = $('#gq'), box = $('#gbox');
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      box.innerHTML = md(parts.filter(p => !q || p.toLowerCase().includes(q)).join('\n'));
    };
    inp.oninput = draw; draw();
  });
  return `<input id="gq" class="search" type="search" placeholder="In der Grammatik suchen …"><div id="gbox" class="md"></div>`;
}

function vEinst() {
  const s = store.settings(), u = sync.currentUser();
  const num = (k, v, lab, step = 1) => `<label>${lab}<input type="number" step="${step}" min="0" data-set="${k}" value="${v}"></label>`;
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return `<a class="card tip" href="#anleitung"><b>Anleitung</b>: So benutzt du die App ›</a>
  <h2 class="pt">Einstellungen</h2>
  <section class="card form"><h3>Tagesziel</h3>
    ${num('newS', s.newS, 'Neue Sätze pro Tag')}${num('newV', s.newV, 'Neue Wörter pro Tag')}${num('goal', s.goal, 'Minuten aktiv pro Tag')}
    <label>Wiederholungstag (keine neuen)<select data-set="restDay"><option value="-1">keiner</option>
      ${days.map((d, i) => `<option value="${i}" ${+s.restDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label></section>
  <section class="card form"><h3>Kennenlernen</h3>${num('a.reps', s.a.reps, 'Wiederholungen pro Satz')}${num('a.pause', s.a.pause, 'Pause (ms)', 500)}${num('a.rate', s.a.rate, 'Tempo', 0.1)}</section>
  <section class="card form"><h3>Nachsprechen</h3>${num('b.reps', s.b.reps, 'Wiederholungen')}${num('b.pause', s.b.pause, 'Pause zum Nachsprechen (ms)', 500)}${num('b.rate', s.b.rate, 'Tempo', 0.1)}
    <label class="chk"><input type="checkbox" data-set="b.trans" ${s.b.trans ? 'checked' : ''}> Übersetzung anzeigen</label></section>
  <section class="card form"><h3>Audio-Abrufen & Hintergrund</h3>${num('d.pause', s.d.pause, 'Audio-Abrufen: Pause zum Sprechen (ms)', 500)}
    ${num('e.pause', s.e.pause, 'Hintergrund: Pause (ms)', 500)}${num('e.rate', s.e.rate, 'Hintergrund: Tempo', 0.1)}</section>
  <section class="card form"><h3>Konto & Abgleich</h3>${u
    ? `<p>Angemeldet als <b>${esc(u.email)}</b></p><button data-sync>Jetzt abgleichen</button> <button class="ghost" data-logout>Abmelden</button>`
    : `<p class="muted">Gleiches Konto wie im PARA Cockpit. Ohne Anmeldung bleibt alles nur auf diesem Gerät.</p>
       <form id="login"><input type="email" id="l-e" placeholder="E-Mail" autocomplete="email" required>
       <input type="password" id="l-p" placeholder="Passwort" autocomplete="current-password" required>
       <button class="primary">Anmelden</button><p id="l-m" class="err"></p></form>`}</section>
  <section class="card form"><h3>App installieren</h3>${matchMedia('(display-mode: standalone)').matches
    ? '<p>Läuft als installierte App ✓</p>'
    : installEvt ? '<button class="primary" data-install>Auf dem Startbildschirm installieren</button>'
    : '<p class="muted">In Chrome: Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Den Link direkt in der Chrome-App öffnen, nicht in der Vorschau von WhatsApp oder Gmail.</p>'}</section>
  <section class="card form"><h3>Lernstand</h3><p class="muted">Setzt alle bisher gesehenen Sätze und Wörter zurück, dann fängst du von vorn an. Einzelne Inseln oder Blöcke setzt du auf der jeweiligen Inselseite zurück.</p>
    ${resetBtn(Object.keys(D.cards), 'Alles zurücksetzen')}</section>
  <section class="card form"><h3>Offline</h3><button class="ghost" data-dl="*">Alle Audios offline laden (ca. 45 MB)</button> <div id="dl-*" class="dl"></div></section>`;
}

// ---------- Router ----------
async function route() {
  if (session) return;
  stash = [];
  const h = location.hash.slice(1) || 'heute';
  const tab = h.startsWith('g/') ? ((byId[h.slice(2)] || {}).kind === 'v' ? 'vokabeln' : 'inseln') : h === 'anleitung' ? 'einst' : h;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${tab}`));
  view.innerHTML = h === 'inseln' ? vGroups('s') : h === 'vokabeln' ? vGroups('v') : h === 'grammatik' ? await vGrammatik()
    : h === 'einst' ? vEinst() : h === 'anleitung' ? vAnleitung() : h.startsWith('g/') ? vGroup(h.slice(2)) : vHeute();
}

// ---------- Übungssitzung ----------
let minuteTimer;
function startSession(mode, ids, title, planKey) {
  sessionEl.hidden = false; document.body.classList.add('in-session');
  history.pushState({ s: 1 }, '');
  session = runSession(sessionEl, { mode, ids, title, cards: D.cards, onClose: () => history.back(),
    onDone: () => { if (planKey) markPlan(planKey); } });
  if ('abc'.includes(mode)) minuteTimer = setInterval(() => { if (document.visibilityState === 'visible') store.addMinutes(0.25); }, 15000);
}
function endSession() {
  if (!session) return;
  session(); session = null; clearInterval(minuteTimer);
  sessionEl.hidden = true; sessionEl.innerHTML = ''; document.body.classList.remove('in-session');
  sync.sync(); route();
}
addEventListener('popstate', endSession);

// ---------- Offline laden ----------
async function download(gid) {
  const out = document.getElementById(`dl-${gid}`);
  const ids = gid === '*' ? Object.keys(D.cards) : byId[gid].blocks.flat();
  const urls = ids.flatMap(id => ['fr', 'de'].map(l => audioUrl(id, l, D.cards[id][l]))).concat([500, 1000, 1500, 2000, 2500, 3000].map(p => `audio/p/${p}.wav`));
  const cache = await caches.open('fra1-audio');
  const total = urls.length;
  let done = 0, fail = 0;
  const show = () => {
    if (!out) return;
    const p = Math.round((done / total) * 100);
    out.innerHTML = `<span class="dl-txt">${done} / ${total} Dateien · ${p} %</span><div class="bar"><i style="width:${p}%"></i></div>`;
  };
  show();
  const work = async () => {
    while (urls.length) {
      const u = urls.pop();
      try { if (!(await cache.match(u))) { const r = await fetch(u); if (r.status === 200) await cache.put(u, r); else fail++; } }
      catch { fail++; }
      if (++done % 10 === 0) show();
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  show();
  if (out) out.querySelector('.dl-txt').textContent = fail
    ? `${total - fail} / ${total} geladen, ${fail} fehlgeschlagen. Nochmal tippen, um den Rest zu laden.`
    : `Offline verfügbar ✓ (${total} Dateien)`;
}

// ---------- Ereignisse ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-go]');
  if (!t) return;
  if (t.dataset.go) { const { ids, title } = stash[+t.dataset.k]; startSession(t.dataset.go, ids, `${title} · ${MODES[t.dataset.go]}`, t.dataset.plan); }
  else if (t.dataset.dl) download(t.dataset.dl);
  else if (t.dataset.reset) resetCards(stash[+t.dataset.reset].ids);
  else if (t.hasAttribute('data-sync')) sync.sync();
  else if (t.hasAttribute('data-logout')) sync.logout();
  else if (t.hasAttribute('data-install') && installEvt) installEvt.prompt().then(() => { installEvt = null; route(); });
});

let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (location.hash === '#einst') route(); });

document.addEventListener('change', e => {
  const k = e.target.dataset.set;
  if (!k) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
  const [a, b] = k.split('.'), s = store.settings();
  store.setSettings(b ? { [a]: { ...s[a], [b]: v } } : { [a]: v });
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const m = $('#l-m'); m.textContent = '';
  try { await sync.login($('#l-e').value.trim(), $('#l-p').value); }
  catch (err) { m.textContent = /invalid/i.test(err.message) ? 'E-Mail oder Passwort falsch.' : err.message; }
});

// ---------- Start ----------
(async function boot() {
  D = await (await fetch('content/data.json')).json();
  for (const g of [...D.islands, ...D.vocab]) { byId[g.id] = g; g.blocks.flat().forEach(id => { groupOf[id] = g.title; }); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  loadGrammar().catch(() => {});
  sync.onStatus(s => { $('#sync').textContent = s; });
  await sync.init(route);
  addEventListener('hashchange', () => route().then(() => scrollTo(0, 0)));
  route();
})();
