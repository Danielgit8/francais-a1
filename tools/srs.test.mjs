// node tools/srs.test.mjs
import assert from 'node:assert/strict';
import { rate, dayStart, DAY, sits } from '../js/srs.js';

const now = new Date(2026, 9, 11, 15, 0).getTime(), t0 = dayStart(now);
let t = rate(undefined, 2, now);
assert.deepEqual([t.ivl, t.due, t.reps], [1, t0 + DAY, 1], '1–3★: morgen');
t = rate(undefined, 4, now); assert.equal(t.ivl, 2, '4★ neu: 2 Tage');
t = rate(undefined, 5, now); assert.equal(t.ivl, 4, '5★ neu: 4 Tage'); assert.ok(sits(t));
t = rate({ ivl: 4, reps: 1 }, 5, now); assert.equal(t.ivl, 10, '5★: ×2,5');
t = rate({ ivl: 4, reps: 1 }, 4, now); assert.equal(t.ivl, 6, '4★: ×1,5');
t = rate({ ivl: 1, reps: 1 }, 4, now); assert.equal(t.ivl, 2, 'wächst mindestens um 1');
t = rate({ ivl: 30, reps: 5 }, 3, now); assert.equal(t.ivl, 1, 'Fehler: zurück auf morgen'); assert.ok(!sits(t));
console.log('srs ok');
