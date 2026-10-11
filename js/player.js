// Audio-Playlist: MP3s und stille Pausen nacheinander, mit Tempo, Endlosschleife und Sperrbildschirm-Steuerung.
const PAUSES = [500, 1000, 1500, 2000, 2500, 3000];

export const au = (id, lang, text, first = false) => ({ id, lang, text, first, src: `audio/${lang}/${id}.mp3` });
export function pz(ms) {
  if (!ms || ms <= 0) return null;
  const n = PAUSES.reduce((a, b) => (Math.abs(b - ms) < Math.abs(a - ms) ? b : a));
  return { pause: true, src: `audio/p/${n}.wav` };
}

export class Player {
  constructor() {
    this.a = new Audio();
    this.list = []; this.i = 0; this.rate = 1; this.loop = false; this.playing = false; this.tok = 0;
    this.onItem = null; this.onEnd = null;
    this.a.addEventListener('ended', () => this.next());
    this.a.addEventListener('error', () => { if (this.playing) this.fallback(); });
    const ms = navigator.mediaSession;
    if (ms) {
      ms.setActionHandler('play', () => this.resume());
      ms.setActionHandler('pause', () => this.pause());
      ms.setActionHandler('nexttrack', () => this.skip(1));
      ms.setActionHandler('previoustrack', () => this.skip(-1));
    }
  }

  play(list, { loop = false, rate = 1 } = {}) {
    this.stop();
    this.list = list.filter(Boolean); this.loop = loop; this.rate = rate; this.i = 0;
    this.go();
  }

  go() {
    const it = this.list[this.i];
    if (!it) {
      if (this.loop && this.list.length) { this.i = 0; return this.go(); }
      this.playing = false; if (this.onEnd) this.onEnd(); return;
    }
    this.playing = true; this.tok++;
    if (this.onItem) this.onItem(it, this.i);
    const r = it.pause ? 1 : this.rate;
    this.a.src = it.src; this.a.defaultPlaybackRate = r; this.a.playbackRate = r;
    this.a.play().catch(() => this.fallback());
    if (!it.pause && navigator.mediaSession && window.MediaMetadata)
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.text, artist: 'Français A1' });
  }

  next() { if (!this.list.length) return; this.i++; this.go(); }

  // MP3 fehlt oder lädt nicht: Handy-Stimme liest vor.
  fallback() {
    const it = this.list[this.i], tok = this.tok;
    if (this.fb === tok) return; this.fb = tok;
    if (!it || it.pause || !it.text || !window.speechSynthesis) return this.next();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(it.text);
    u.lang = it.lang === 'de' ? 'de-DE' : 'fr-FR'; u.rate = this.rate;
    u.onend = () => { if (tok === this.tok && this.playing) this.next(); };
    speechSynthesis.speak(u);
  }

  skip(dir) {
    if (!this.list.length) return;
    let j = this.i;
    do { j = (j + dir + this.list.length) % this.list.length; } while (!this.list[j].first && j !== this.i);
    this.i = j; this.go();
  }

  pause() { this.a.pause(); if (window.speechSynthesis) speechSynthesis.pause(); this.playing = false; }
  resume() {
    if (this.i >= this.list.length) { this.i = 0; return this.go(); }
    this.playing = true; this.a.play().catch(() => {}); if (window.speechSynthesis) speechSynthesis.resume();
  }
  toggle() { this.playing ? this.pause() : this.resume(); }
  stop() { this.tok++; this.playing = false; this.a.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); this.list = []; }
}
