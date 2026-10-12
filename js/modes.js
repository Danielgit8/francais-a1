// Die fünf Übungsarten: a Kennenlernen, b Nachsprechen, c Abrufen, d Audio-Abrufen, e Hintergrund.
import * as store from './store.js';
import * as srs from './srs.js';
import { Player, au, pz } from './player.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function runSession(el, { mode, ids, title, cards, onClose, onDone }) {
  const st = store.settings(), P = new Player();
  let i = 0, dead = false;
  el.innerHTML = `<div class="s-head"><button class="x" data-x aria-label="Schließen">✕</button>
    <div><b>${esc(title)}</b><small id="s-sub"></small></div></div><div class="s-body" id="s-body"></div>`;
  const body = el.querySelector('#s-body'), sub = el.querySelector('#s-sub');
  el.querySelector('[data-x]').onclick = onClose;
  const c = id => cards[id];

  const markSeen = id => { if (!(store.get(id) || {}).seen) store.put(id, { seen: Date.now() }); };
  const rateTrack = (id, track, n) => store.put(id, { [track]: srs.rate((store.get(id) || {})[track], n) });
  const noteBox = id => `<textarea class="note" data-note="${id}" rows="2" placeholder="Eselsbrücke …">${esc((store.get(id) || {}).note || '')}</textarea>`;
  const stars = attr => `<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-${attr}="${n}">${n}★</button>`).join('')}</div>`;
  body.addEventListener('change', e => { const n = e.target.dataset.note; if (n) store.put(n, { note: e.target.value.trim() }); });

  const done = () => {
    P.stop(); if (onDone) onDone();
    body.innerHTML = `<div class="done">Geschafft!</div><button class="primary" data-close>Schließen</button>`;
    body.onclick = e => { if (e.target.closest('[data-close]')) onClose(); };
  };

  // a + b: Karte für Karte, Audio automatisch, optional automatisch weiter.
  function stepper(kind) {
    const cfg = st[kind]; let auto = true;
    const show = () => {
      if (dead) return;
      if (i >= ids.length) return done();
      const id = ids[i], k = c(id); markSeen(id);
      const showDe = kind === 'a' || cfg.trans;
      sub.textContent = `${i + 1} / ${ids.length}`;
      body.innerHTML = `<div class="big fr">${esc(k.fr)}</div>
        <div class="de ${showDe ? '' : 'hide'}" data-tap>${esc(k.de)}</div>
        ${kind === 'a' ? noteBox(id) : (cfg.trans ? '' : `<p class="muted">Verstanden? (Deutsch antippen zum Aufdecken)</p>${stars('u')}`)}
        <div class="ctl"><button data-prev>◀</button><button data-play>⏯</button><button data-next>▶</button></div>
        <label class="chk"><input type="checkbox" data-auto ${auto ? 'checked' : ''}> automatisch weiter</label>`;
      const list = [];
      for (let r = 0; r < cfg.reps; r++) list.push(au(id, 'fr', k.fr), pz(cfg.pause));
      P.onEnd = () => { if (auto && !dead) { i++; show(); } };
      P.play(list, { rate: cfg.rate });
    };
    body.onclick = e => {
      const t = e.target;
      if (t.closest('[data-prev]')) { i = Math.max(0, i - 1); show(); }
      else if (t.closest('[data-next]')) { i++; show(); }
      else if (t.closest('[data-play]')) P.toggle();
      else if (t.closest('[data-tap]')) t.closest('[data-tap]').classList.toggle('hide');
      else if (t.dataset.u) {
        rateTrack(ids[i], 'un', +t.dataset.u);
        t.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t));
      }
    };
    body.addEventListener('change', e => { if (e.target.matches('[data-auto]')) auto = e.target.checked; });
    show();
  }

  // c: 10er-Runden. Unter 4 Sternen kommt der Satz in der Runde wieder (höchstens 3-mal). Für die Planung zählt die erste Bewertung.
  function recall() {
    const rest = [...ids], first = {}, tries = {};
    let queue = [], round = 0;
    const nextRound = () => { queue = rest.splice(0, 10); round++; queue.length ? ask() : done(); };
    const ask = () => {
      P.stop();
      const k = c(queue[0]); markSeen(queue[0]);
      sub.textContent = `Runde ${round} · ${queue.length} offen · danach noch ${rest.length}`;
      body.innerHTML = `<div class="big de">${esc(k.de)}</div>
        <p class="muted">Laut auf Französisch sagen, dann aufdecken.</p>
        <button class="primary" data-show>Aufdecken</button>`;
    };
    const reveal = () => {
      const id = queue[0], k = c(id);
      body.innerHTML = `<div class="de small">${esc(k.de)}</div><div class="big fr">${esc(k.fr)}</div>
        <div class="ctl"><button data-play>🔊</button></div>${stars('r')}
        <p class="muted">5★ nur fehlerfrei und ohne Zögern</p>${noteBox(id)}`;
      P.play([au(id, 'fr', k.fr)]);
    };
    body.onclick = e => {
      const t = e.target;
      if (t.closest('[data-show]')) reveal();
      else if (t.closest('[data-play]')) P.play([au(queue[0], 'fr', c(queue[0]).fr)]);
      else if (t.dataset.r) {
        const n = +t.dataset.r, id = queue.shift();
        if (!(id in first)) { first[id] = n; rateTrack(id, 'sp', n); }
        tries[id] = (tries[id] || 0) + 1;
        if (n < 4 && tries[id] < 3) queue.push(id);
        queue.length ? ask() : nextRound();
      }
    };
    nextRound();
  }

  // d + e: eine Endlos-Playlist, läuft auch bei gesperrtem Bildschirm.
  function stream(kind) {
    const cfg = st[kind], list = [];
    ids.forEach(id => {
      const k = c(id);
      if (kind === 'd') list.push(au(id, 'de', k.de, true), pz(cfg.pause), au(id, 'fr', k.fr), pz(1000));
      else list.push(au(id, 'fr', k.fr, true), pz(cfg.pause));
    });
    body.innerHTML = `<div class="de small" id="s-de"></div><div class="big fr" id="s-fr"></div>
      <div class="ctl"><button data-prev>⏮</button><button data-play>⏯</button><button data-next>⏭</button></div>
      <p class="muted">Endlosschleife. Läuft weiter, wenn du den Bildschirm sperrst.</p>`;
    const de = body.querySelector('#s-de'), fr = body.querySelector('#s-fr');
    P.onItem = it => {
      if (!it.id) return;
      const k = c(it.id);
      sub.textContent = `${ids.indexOf(it.id) + 1} / ${ids.length}`;
      de.textContent = kind === 'd' ? k.de : '';
      fr.textContent = kind === 'd' && it.lang === 'de' ? '…' : k.fr;
    };
    P.play(list, { loop: true, rate: cfg.rate || 1 });
    body.onclick = e => {
      if (e.target.closest('[data-play]')) P.toggle();
      else if (e.target.closest('[data-next]')) P.skip(1);
      else if (e.target.closest('[data-prev]')) P.skip(-1);
    };
  }

  ({ a: () => stepper('a'), b: () => stepper('b'), c: recall, d: () => stream('d'), e: () => stream('e') })[mode]();
  return () => { dead = true; P.stop(); };
}
