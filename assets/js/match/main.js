/* Jacklers Match Engine — bootstrap.
   Wires the engine, camera, renderer and UI together and drives the
   animation loop. This is the only module that touches the DOM directly
   for canvas setup; everything else is called into from here. */
import { MatchEngine, STATE } from './engine.js';
import { makeLayout, drawPitch, drawFrame } from './render.js';
import { Camera } from './camera.js';
import { MatchUI } from './ui.js';

function init() {
  const root = document.getElementById('match-centre');
  const canvas = document.getElementById('match-canvas');
  if (!root || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const eng = new MatchEngine({
    homeName: 'Jacklers Reds', homeShort: 'RED', homeColours: { fill: '#D0343F', text: '#fff' },
    awayName: 'Jacklers Whites', awayShort: 'WHT', awayColours: { fill: '#F6F3EE', text: '#0A1120' }
  });
  const camera = new Camera();
  const ui = new MatchUI(root, eng);

  let lay = null, dpr = 1, raf = 0, last = 0, onScreen = true, playing = true, speed = 1, lastState = eng.state;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(ctx, eng, lay, camera);
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    base.width = canvas.width; base.height = canvas.height;
    lay = makeLayout(r.width, r.height);
    const b = base.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, r.width, r.height); drawPitch(b, lay);
    paint();
  }
  function onStateChange() {
    if (eng.state === lastState) return;
    lastState = eng.state;
    if (eng.state === STATE.TRY) camera.trigger('try', 2.4);
    else if (eng.state === STATE.KICK || eng.state === STATE.KICKOFF) camera.trigger('kick', 1.3);
    else if (eng.state === STATE.SCRUM) camera.trigger('scrum', 1.6);
    else if (eng.state === STATE.LINEOUT) camera.trigger('lineout', 1.4);
    else if (eng.state === STATE.CONVERSION && eng.d.isPenaltyGoal) camera.trigger('penaltyGoal', 1.8);
    if (eng.state === STATE.HALFTIME) {
      playing = false; ui.setPlayLabel(false);
      setTimeout(() => { eng.resumeAfterHalftime(); playing = true; ui.setPlayLabel(true); last = 0; }, 3200);
    }
  }
  function frame(ts) {
    raf = 0; if (!onScreen || document.hidden) return;
    const dtReal = last ? Math.min((ts - last) / 1000, 0.05) : 0.016; last = ts;
    if (playing) { eng.step(dtReal * speed); onStateChange(); }
    camera.update(dtReal, eng);
    paint(); ui.render();
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !reduce && onScreen && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }

  ui.bindControls({
    onPlayPause() { playing = !playing; ui.setPlayLabel(playing); if (playing) start(); },
    onSpeedCycle() { speed = speed >= 4 ? 1 : speed * 2; ui.setSpeedLabel(speed); },
    onRestart() { location.reload(); }
  });

  window.JacklersMatch = { engine: eng, camera };

  resize();
  if (reduce) { for (let i = 0; i < 400; i++) { eng.step(0.05); onStateChange(); } paint(); ui.render(); }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
  if (window.IntersectionObserver) new IntersectionObserver(e => { onScreen = e[0].isIntersecting; if (onScreen) start(); }).observe(canvas);
  document.addEventListener('visibilitychange', start);
  ui.setPlayLabel(true); ui.setSpeedLabel(1);
  start();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
