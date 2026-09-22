/* Jacklers Match Engine — positional shape.
   Where each player on the pitch should be, given where the ball is.
   Pure functions: given a team's players and a reference point, return
   target (x, y) for everyone. No state, no globals - easy to reason about
   and to unit-test on its own. */
import { PITCH, clamp } from './core.js';

const { WID } = PITCH;

function go(p, x, y) { p.tx = clamp(x, 0.5, PITCH.LEN - 0.5); p.ty = clamp(y, 0.5, WID - 0.5); }

/* Attacking shape: half-backs flat, centres progressively wider, wings hold
   their touchline, full-back trails deep, tight five hug the ball, loose
   forwards (6/7/8) link up wider as support runners. */
export function attackShape(players, dir, ax, ay, skip) {
  const os = ay < WID / 2 ? 1 : -1;
  players.forEach(p => {
    if (skip && skip.indexOf(p) > -1) return;
    if (p.role === 8) { go(p, ax - dir * 2.6 + p.jx * 0.2, ay + os * 1.2); return; }
    if (p.role === 9) { go(p, ax - dir * (2.6 + p.jx * 0.3), ay + os * (5.5 + p.jy * 0.6)); return; }
    if (p.role === 11) { go(p, ax - dir * (3.6 + p.jx * 0.3), ay + os * (11 + p.jy * 0.6)); return; }
    if (p.role === 12) { go(p, ax - dir * (4.6 + p.jx * 0.3), ay + os * (17.5 + p.jy * 0.6)); return; }
    if (p.role === 10) { go(p, ax - dir * (5.5 + p.jx * 0.3), clamp(3 + p.jy, 1.5, WID / 2 - 1)); return; }
    if (p.role === 13) { go(p, ax - dir * (5.5 + p.jx * 0.3), clamp(WID - 3 + p.jy, WID / 2 + 1, WID - 1.5)); return; }
    if (p.role === 14) { go(p, ax - dir * (11 + p.jy * 0.4), clamp(WID / 2 + (ay - WID / 2) * 0.3 + p.jx * 3, 6, WID - 6)); return; }
    if (p.role < 5) { go(p, ax - dir * (1.6 + (p.role % 3) * 1.1 + p.jx * 0.25), ay + (p.role - 2) * 1.9 + p.jy * 0.35); return; }
    go(p, ax - dir * (3.6 + (p.role - 5) * 1.3 + p.jx * 0.3), ay + (p.role - 6) * 4.4 * os * 0.4 + p.jy * 0.45);
  });
}

/* Defensive shape: the front line (forwards + half-backs + both centres)
   holds width across the pitch; the back three (wings + full-back) drop
   off to cover in behind rather than standing flat. */
export function defenceShape(players, dir, ax, ay, depth, skip) {
  const lineX = ax + dir * depth;
  const P = players.filter(p => !skip || skip.indexOf(p) < 0);
  const backRoles = [10, 13, 14];
  const line = P.filter(p => backRoles.indexOf(p.role) < 0).sort((a, b) => a.y - b.y);
  const back = P.filter(p => backRoles.indexOf(p.role) > -1);
  const n = line.length, span = 46;
  line.forEach((p, i) => {
    const u = n > 1 ? i / (n - 1) : 0.5;
    go(p, lineX + dir * (((i % 2) * 0.8) + p.jx * 0.15), clamp(ay + (u - 0.5) * span, 3, WID - 3));
  });
  back.forEach(p => {
    if (p.role === 14) { go(p, lineX + dir * 15, clamp(ay + (ay < WID / 2 ? 6 : -6), 8, WID - 8)); return; }
    const side = p.role === 10 ? -1 : 1;
    go(p, lineX + dir * 9, clamp(WID / 2 + side * 22, 4, WID - 4));
  });
}

export { go };
