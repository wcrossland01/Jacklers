/* Jacklers Match Engine — core data model.
   Pitch geometry, RNG, and the Team/Player/Ball objects every other module
   works with. No rendering or rules here, just the shared vocabulary. */

// World Rugby pitch proportions in metres: try line to try line 100m,
// in-goal 10-22m (we use 10, a common depth), touchline to touchline 70m.
export const PITCH = {
  LEN: 120, WID: 70, TRY0: 10, TRY1: 110, MID: 60,
  LINE10_A: 50, LINE10_B: 70, LINE22_A: 32, LINE22_B: 88,
  FIVE_A: 5, FIFTEEN_A: 15, FIVE_B: 65, FIFTEEN_B: 55
};

export const POSITIONS = [
  { n: 'Loosehead Prop', short: 'LHP', group: 'front-row' },
  { n: 'Hooker', short: 'HK', group: 'front-row' },
  { n: 'Tighthead Prop', short: 'THP', group: 'front-row' },
  { n: 'Lock', short: 'LK', group: 'second-row' },
  { n: 'Lock', short: 'LK', group: 'second-row' },
  { n: 'Blindside Flanker', short: 'BF', group: 'back-row' },
  { n: 'Openside Flanker', short: 'OF', group: 'back-row' },
  { n: 'Number 8', short: 'N8', group: 'back-row' },
  { n: 'Scrum-half', short: 'SH', group: 'half-back' },
  { n: 'Fly-half', short: 'FH', group: 'half-back' },
  { n: 'Left Wing', short: 'LW', group: 'back-three' },
  { n: 'Inside Centre', short: 'IC', group: 'centre' },
  { n: 'Outside Centre', short: 'OC', group: 'centre' },
  { n: 'Right Wing', short: 'RW', group: 'back-three' },
  { n: 'Fullback', short: 'FB', group: 'back-three' }
];
export function jersey(role) { return role + 1; }
export function isForward(role) { return role < 8; }
export function isTightFive(role) { return role < 5; }
export function isBack(role) { return role >= 8; }

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function hyp(a, b) { return Math.sqrt(a * a + b * b); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Small deterministic PRNG (mulberry32) so a match can be seeded/replayed.
export function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTeam(teamId, name, shortName, colours, rand) {
  const R = (a, b) => a + (b - a) * rand();
  const players = [];
  for (let role = 0; role < 15; role++) {
    const pos = POSITIONS[role];
    players.push({
      team: teamId, role,
      name: pos.n, short: pos.short, group: pos.group,
      // base attributes 0-1, lightly randomised per player so no two matches feel identical
      pace: clamp(R(0.55, 0.95) + (role >= 8 ? 0.08 : 0), 0.3, 1),
      power: clamp(R(0.55, 0.95) + (role < 8 ? 0.1 : 0), 0.3, 1),
      handling: clamp(R(0.55, 0.95) + (role >= 8 ? 0.1 : 0), 0.3, 1),
      kicking: role === 9 ? R(0.7, 0.95) : role === 8 ? R(0.5, 0.75) : R(0.2, 0.5),
      x: PITCH.MID, y: PITCH.WID / 2, vx: 0, vy: 0, tx: PITCH.MID, ty: PITCH.WID / 2,
      jx: R(-0.8, 0.8), jy: R(-0.8, 0.8), phase: R(0, 6.28), wob: R(1.5, 2.4),
      hurry: false, carrying: false, burst: false, immune: 0, slow: 0,
      fatigue: 0,                 // 0 (fresh) .. 1 (exhausted)
      onField: true, subbedFor: null
    });
  }
  return {
    id: teamId, name, shortName, colours, players,
    score: 0, subsUsed: 0, bench: makeBench(teamId, rand),
    stats: { tries: 0, conversions: 0, penalties: 0, dropGoals: 0, passes: 0, kicks: 0, tackles: 0, turnovers: 0, lineBreaks: 0 }
  };
}

function makeBench(teamId, rand) {
  const R = (a, b) => a + (b - a) * rand();
  const bench = [];
  const benchRoles = [1, 0, 3, 6, 8, 9, 13]; // a front-rower, prop, lock, flanker, 9, 10, back-three cover — a plausible 7-player bench
  benchRoles.forEach(role => {
    const pos = POSITIONS[role];
    bench.push({
      team: teamId, role, name: pos.n, short: pos.short, group: pos.group,
      pace: R(0.6, 0.95), power: R(0.6, 0.95), handling: R(0.6, 0.95),
      kicking: role === 9 ? R(0.7, 0.95) : R(0.2, 0.5),
      fatigue: 0, onField: false
    });
  });
  return bench;
}

export function makeBall() {
  return { x: PITCH.MID, y: PITCH.WID / 2, h: 0, owner: null, fly: null, grounded: false };
}
