/* Jacklers Match Engine — camera.
   Keeps an eye on the ball by default; on a big moment it eases in for a
   closer look, then eases back out. Deliberately gentle - this is a small
   pitch, not a stadium, so zoom stays subtle. */
import { PITCH, clamp, lerp } from './core.js';

const EVENT_ZOOM = { try: 1.5, kick: 1.18, scrum: 1.22, lineout: 1.2, penaltyGoal: 1.35 };

export class Camera {
  constructor() {
    this.zoom = 1; this.targetZoom = 1;
    this.focus = [PITCH.MID, PITCH.WID / 2];
    this.holdUntil = 0; this.time = 0;
  }
  trigger(kind, seconds) {
    this.targetZoom = EVENT_ZOOM[kind] || 1;
    this.holdUntil = this.time + (seconds || 1.6);
  }
  update(dt, eng) {
    this.time += dt;
    const ballFocus = [eng.ball.x, eng.ball.y];
    const target = eng.state === 'TRY' && eng.d.scorer ? [eng.d.scorer.x, eng.d.scorer.y] : ballFocus;
    this.focus[0] = lerp(this.focus[0], target[0], clamp(dt * 2.4, 0, 1));
    this.focus[1] = lerp(this.focus[1], target[1], clamp(dt * 2.4, 0, 1));
    if (this.time > this.holdUntil) this.targetZoom = 1;
    this.zoom = lerp(this.zoom, this.targetZoom, clamp(dt * 2.2, 0, 1));
  }
}
