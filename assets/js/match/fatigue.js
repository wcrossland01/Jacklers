/* Jacklers Match Engine — fatigue.
   Simple, deliberately not a full sports-science model: players tire a
   little from a baseline match-time creep, and faster from real exertion
   (sprinting, carrying, tackling). Tired players are slower to accelerate,
   handle the ball less cleanly and tackle less reliably. */
import { clamp } from './core.js';

const BASE_CREEP = 0.0006;     // per second of real playback, everyone on the pitch
const EXERTION_RATE = 0.0011;  // per second while working hard
const RECOVERY_RATE = 0.0010;  // per second while coasting

export function tickFatigue(player, dt, intensity) {
  if (!player.onField) return;
  const d = intensity > 0.4
    ? BASE_CREEP + EXERTION_RATE * intensity
    : BASE_CREEP - RECOVERY_RATE * (1 - intensity);
  player.fatigue = clamp(player.fatigue + d * dt, 0, 1);
}

export function speedFactor(player) { return 1 - player.fatigue * 0.32; }
export function handlingFactor(player) { return 1 - player.fatigue * 0.22; }
export function tackleFactor(player) { return 1 - player.fatigue * 0.25; }

// Who on the bench would help most right now (freshest player in that group).
export function bestReplacement(bench, group) {
  const cands = bench.filter(p => p.group === group);
  return cands.length ? cands[0] : null;
}
