// Wiederholungslogik: Sterne -> nächster Termin. Reine Funktionen.
export const DAY = 864e5;

export function dayStart(t = Date.now()) {
  const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime();
}

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// track = { ivl (Tage), reps, last, due }. 1–3 Sterne: morgen wieder; 4/5: Abstand wächst.
export function rate(track, stars, now = Date.now()) {
  const prev = (track && track.ivl) || 0;
  let ivl;
  if (stars <= 3) ivl = 1;
  else if (stars === 4) ivl = Math.max(prev + 1, prev ? Math.round(prev * 1.5) : 2);
  else ivl = Math.max(prev + 1, prev ? Math.round(prev * 2.5) : 4);
  return { ivl, reps: ((track && track.reps) || 0) + 1, last: stars, due: dayStart(now) + ivl * DAY };
}

// Eine Karte "sitzt", wenn der Abstand mindestens 4 Tage beträgt.
export const sits = track => !!track && track.ivl >= 4;
