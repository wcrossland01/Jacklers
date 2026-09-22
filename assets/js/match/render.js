/* Jacklers Match Engine — rendering.
   Pure drawing: given a canvas context and the engine's current state,
   paint a broadcast-style pitch. No game logic lives here. */
import { PITCH } from './core.js';

const { LEN, WID, TRY0, TRY1, MID, LINE10_A, LINE10_B, LINE22_A, LINE22_B, FIVE_A, FIFTEEN_A, FIVE_B, FIFTEEN_B } = PITCH;

export function makeLayout(w, h) {
  const vertical = h > w * 0.72;
  const margin = 0.955;
  const scale = (vertical ? Math.min(w / WID, h / LEN) : Math.min(w / LEN, h / WID)) * margin;
  const pw = (vertical ? WID : LEN) * scale, ph = (vertical ? LEN : WID) * scale;
  const ox = (w - pw) / 2, oy = (h - ph) / 2;
  return {
    w, h, vertical, scale, ox, oy,
    P(x, y) { return vertical ? [ox + y * scale, oy + x * scale] : [ox + x * scale, oy + y * scale]; }
  };
}

function poly(ctx, lay, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => { const q = lay.P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
}
function seg(ctx, lay, x0, y0, x1, y1) { const a = lay.P(x0, y0), b = lay.P(x1, y1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }

const LINE = '236,240,246';

export function drawPitch(ctx, lay) {
  const s = lay.scale;
  poly(ctx, lay, [[0, 0], [LEN, 0], [LEN, WID], [0, WID]]);
  ctx.fillStyle = '#0d6b3a'; ctx.fill();
  for (let i = 0; i < 12; i++) {
    poly(ctx, lay, [[i * 10, 0], [(i + 1) * 10, 0], [(i + 1) * 10, WID], [i * 10, WID]]);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)'; ctx.fill();
  }
  [[0, TRY0], [TRY1, LEN]].forEach(g => {
    poly(ctx, lay, [[g[0], 0], [g[1], 0], [g[1], WID], [g[0], WID]]);
    ctx.fillStyle = 'rgba(10,17,32,0.22)'; ctx.fill();
  });

  const lw = Math.max(1.1, 0.32 * s);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.strokeStyle = 'rgba(' + LINE + ',0.92)'; ctx.lineWidth = lw; ctx.setLineDash([]);
  ctx.beginPath();
  poly(ctx, lay, [[0, 0], [LEN, 0], [LEN, WID], [0, WID], [0, 0]]);
  seg(ctx, lay, TRY0, 0, TRY0, WID); seg(ctx, lay, TRY1, 0, TRY1, WID);
  seg(ctx, lay, LINE22_A, 0, LINE22_A, WID); seg(ctx, lay, LINE22_B, 0, LINE22_B, WID);
  seg(ctx, lay, MID, 0, MID, WID);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(' + LINE + ',0.55)'; ctx.setLineDash([1.6 * s, 1.4 * s]);
  ctx.beginPath();
  seg(ctx, lay, LINE10_A, 0, LINE10_A, WID); seg(ctx, lay, LINE10_B, 0, LINE10_B, WID);
  ctx.stroke();
  ctx.beginPath();
  seg(ctx, lay, FIVE_A, 3, FIVE_A, WID - 3); seg(ctx, lay, LEN - FIVE_A, 3, LEN - FIVE_A, WID - 3);
  ctx.stroke();
  // 5m and 15m marks off each touchline, short tick marks rather than full lines (as on a real pitch)
  ctx.beginPath();
  for (let x = TRY0; x <= TRY1; x += 5) { seg(ctx, lay, x, 0, x, FIVE_A); seg(ctx, lay, x, WID - FIVE_A, x, WID); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(' + LINE + ',0.4)';
  ctx.beginPath();
  seg(ctx, lay, TRY0, FIFTEEN_A, TRY1, FIFTEEN_A); seg(ctx, lay, TRY0, FIFTEEN_B, TRY1, FIFTEEN_B);
  ctx.stroke(); ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(' + LINE + ',0.75)'; ctx.lineWidth = lw;
  ctx.beginPath(); seg(ctx, lay, MID - 1.3, 35, MID + 1.3, 35); seg(ctx, lay, MID, 33.7, MID, 36.3); ctx.stroke();

  [TRY0, TRY1].forEach(x => {
    const a = lay.P(x, 35 - 2.8), b = lay.P(x, 35 + 2.8);
    ctx.strokeStyle = 'rgba(' + LINE + ',0.95)'; ctx.lineWidth = Math.max(1.6, 0.32 * s);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const back = x === TRY0 ? -3.4 : 3.4;
    [a, b].forEach(q => {
      ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2.2, 0.6 * s), 0, 6.2832);
      ctx.fillStyle = 'rgb(' + LINE + ')'; ctx.fill();
    });
    const c = lay.P(x + back, 35);
    ctx.strokeStyle = 'rgba(' + LINE + ',0.55)'; ctx.lineWidth = Math.max(1.1, 0.22 * s);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.moveTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  });

  [[TRY0, 0], [TRY0, WID], [TRY1, 0], [TRY1, WID]].forEach(c => {
    const p = lay.P(c[0], c[1]);
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2.2, 0.55 * s), 0, 6.2832);
    ctx.fillStyle = '#D0343F'; ctx.fill(); ctx.strokeStyle = 'rgba(' + LINE + ',0.85)'; ctx.lineWidth = 1; ctx.stroke();
  });
}

function teamFill(colours, i) { return i === 0 ? colours.a : colours.b; }

export function drawFrame(ctx, eng, lay, camera) {
  const zoom = (camera && camera.zoom) || 1;
  const focus = (camera && camera.focus) || [MID, WID / 2];
  const s = lay.scale * zoom;
  const r = Math.max(4.2, 1.02 * s);
  const fs = lay.P(focus[0], focus[1]);
  // zoom scales distance from the focus point, so the focus stays put on screen while everything around it grows
  const P = zoom === 1 ? (x, y) => lay.P(x, y) : (x, y) => { const q = lay.P(x, y); return [fs[0] + (q[0] - fs[0]) * zoom, fs[1] + (q[1] - fs[1]) * zoom]; };

  for (const pu of eng.pulses) {
    const u = pu.t / pu.dur, c = P(pu.x, pu.y);
    ctx.beginPath(); ctx.arc(c[0], c[1], (1.2 + u * (pu.type === 'whistle' ? 6 : 3.2)) * lay.scale, 0, 6.2832);
    ctx.strokeStyle = pu.type === 'whistle' ? 'rgba(255,214,102,' + (0.7 * (1 - u)) + ')' : 'rgba(255,255,255,' + (0.5 * (1 - u)) + ')';
    ctx.lineWidth = 1.6; ctx.stroke();
  }

  ctx.font = '700 ' + Math.max(6.5, r * 1.1).toFixed(1) + 'px "Hanken Grotesk", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const pl of eng.players) {
    if (!pl.onField) continue;
    const p = P(pl.x, pl.y);
    const col = pl.team === 0 ? eng.home.colours : eng.away.colours;
    if (pl === eng.carrier) {
      ctx.beginPath(); ctx.arc(p[0], p[1], r + 4, 0, 6.2832);
      ctx.strokeStyle = 'rgba(255,209,102,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(p[0] + r * 0.18, p[1] + r * 0.32, r * 0.92, r * 0.62, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832);
    ctx.fillStyle = col.fill; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = pl.team === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(10,17,32,0.45)'; ctx.stroke();
    ctx.fillStyle = col.text;
    ctx.fillText(String(pl.role + 1), p[0], p[1] + r * 0.05);
  }

  const rp = P(eng.ref.x, eng.ref.y); const rr = r * 1.05;
  ctx.beginPath();
  ctx.moveTo(rp[0], rp[1] - rr); ctx.lineTo(rp[0] + rr, rp[1]); ctx.lineTo(rp[0], rp[1] + rr); ctx.lineTo(rp[0] - rr, rp[1]);
  ctx.closePath(); ctx.fillStyle = '#4fd1a5'; ctx.fill(); ctx.strokeStyle = 'rgba(10,17,32,0.55)'; ctx.lineWidth = 1; ctx.stroke();

  const b = eng.ball, bp = P(b.x, b.y);
  const lift = b.h * s * 0.5;
  if (b.h > 0.2) { ctx.beginPath(); ctx.ellipse(bp[0], bp[1], r * 0.6, r * 0.4, 0, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(bp[0], bp[1] - lift, r * 0.76 * (1 + b.h * 0.03), r * 0.5 * (1 + b.h * 0.03), lay.vertical ? Math.PI / 2 : 0, 0, 6.2832);
  ctx.fillStyle = '#E8B84A'; ctx.fill(); ctx.strokeStyle = 'rgba(10,17,32,0.7)'; ctx.lineWidth = 1; ctx.stroke();
}
