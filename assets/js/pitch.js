/* Jacklers hero pitch  (version 7: numbered 1-15 and set up the way professional
   sides play - forwards in pods off the ruck with the backs as a deeper second
   layer, a defensive line set on the offside line with line speed, called backline
   moves, territory kicking, lineouts, mauls, scrums and penalty goals, and every
   player working back onside rather than straight through the breakdown.)
   A detailed rugby union pitch (plan view, correct markings) with an automated,
   endless, random game: 15 Reds v 15 Whites, a referee and a ball.
   Decorative only: it runs on the home page, pauses when off screen, and respects
   "reduce motion" (shows one still frame instead). No data leaves the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.JacklersPitch = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEN = 120, WID = 70, MID = 60, TRY0 = 10, TRY1 = 110;
  // Tuning knobs for the match (all probabilities per event)
  var TUNE = { sway: 0.75, hurry: 1.6, hustle: 1.6, recover: 1.4, recoverFrom: 6, recoverSlope: 0.04, teamRun: 5, teamRunMax: 14, missRedZone: 0.08, lineDepth: 9.5, lineSpeed: 3.2, momentum: 2.6, pass: 0.74, missTackle: 0.16, knockOn: 0.018, spill: 0.03, offload: 0.08, turnover: 0.04, penalty: 0.05, scrumPen: 0.2, lineoutSteal: 0.12, maul: 0.65, driveOver: 0.35, pickGo: 0.55, carrierSpeed: 1.1, breakRun: 1.4, stepRun: 0.5, wideChance: 0.6, pauseDur: 0.55, shapeDrift: 3.6 };
  var COL = { red: '#D0343F', white: '#F6F3EE', ball: '#E8B84A', ref: '#6FD3A2', line: '246,243,238' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }

  /* =====================================================================
     SIMULATION
     ===================================================================== */
  function createSim(rand) {
    rand = rand || Math.random;
    function R(a, b) { return a + (b - a) * rand(); }

    var sim = {
      players: [], teams: [[], []], ref: { x: 60, y: 22, vx: 0, vy: 0, tx: 60, ty: 22 },
      ball: { x: 60, y: 35, h: 0, owner: null, fly: null }, ballTrail: [],
      phase: 'kickoff_setup', pt: 0, poss: 0, score: [0, 0], flip: 1, time: 0, nextHalf: 140, half: 1, seq: 0,
      pulses: [], carrier: null, anchor: { x: 60, y: 35 }, dec: 0, d: {}, changed: false, fslot: [[], []],
      stats: { passes: 0, kicks: 0, chips: 0, tackles: 0, tries: 0, offloads: 0, knockOns: 0, mauls: 0, penGoals: 0 }
    };
    for (var t = 0; t < 2; t++) {
      for (var r = 0; r < 15; r++) {
        var p = { w: R(1.5, 2.4), ph: R(0, 6.28), hurry: false, team: t, role: r, x: 60, y: 35, vx: 0, vy: 0, tx: 60, ty: 35, max: (r < 8 ? 4.5 : 5.4) + R(-0.3, 0.4),
                  jx: R(-0.8, 0.8), jy: R(-0.8, 0.8), immune: 0, slow: 0 };
        sim.players.push(p); sim.teams[t].push(p);
      }
    }

    function dirOf(team) { return (team === 0 ? 1 : -1) * sim.flip; }
    function other(team) { return 1 - team; }
    function pulse(type, x, y) { sim.pulses.push({ type: type, x: x, y: y, t: 0, dur: type === 'whistle' ? 1.1 : 0.7 }); }
    function nearest(list, x, y) {
      var best = null, bd = 1e9;
      for (var i = 0; i < list.length; i++) { var d = hyp(list[i].x - x, list[i].y - y); if (d < bd) { bd = d; best = list[i]; } }
      return best;
    }
    function go(p, x, y) { p.tx = clamp(x, 0.5, LEN - 0.5); p.ty = clamp(y, 0.5, WID - 0.5); }
    function setPhase(name) { sim.phase = name; sim.pt = 0; }
    function giveBall(p) { sim.ball.owner = p; sim.ball.fly = null; sim.ball.h = 0; sim.carrier = p; }
    function loose(x, y) { sim.ball.owner = null; sim.ball.fly = null; sim.ball.x = x; sim.ball.y = y; sim.ball.h = 0; }
    function fly(x1, y1, dur, peak, onLand) {
      var b = sim.ball; b.owner = null;
      b.fly = { x0: b.x, y0: b.y, x1: x1, y1: y1, t: 0, dur: dur, peak: peak, land: onLand };
    }
    function roleSet(team, from, to) { return sim.teams[team].filter(function (p) { return p.role >= from && p.role <= to; }); }

    /* ---------- shape helpers ---------- */
    // Attack off a breakdown, as professional sides set up: the forwards in pods (three just off the ruck, one on
    // the blind side, three wider, one on the edge) with the backs as a second, deeper layer behind them.
    // Slots go to whoever is nearest when the ruck forms - next man up - and are [lateral, depth, pod].
    var FSLOTS = [[5.5, 2.2, 1], [4.0, 3.2, 1], [7.0, 3.2, 1], [-5.5, 2.8, 0], [17, 2.6, 2], [15.5, 3.6, 2], [18.5, 3.6, 2], [28, 3.2, 3]];
    function assignPods(team, ax, ay, os, exclude) {
      var d = dirOf(team), slots = sim.fslot[team], blindW = os > 0 ? ay : WID - ay;
      var free = roleSet(team, 0, 7).filter(function (p) { return !exclude || exclude.indexOf(p) < 0; });
      for (var i = 0; i < 15; i++) slots[i] = null;
      FSLOTS.forEach(function (s) {
        if (!free.length) return;
        var lat = s[0], dep = s[1];
        if (lat < 0 && blindW < 13) { lat = 11; dep = 4.4; }   // no room on the blind side: fill the gap between the pods instead
        var px = ax - d * dep, py = clamp(ay + os * lat, 3, WID - 3), best = 0, bd = 1e9;
        for (var k = 0; k < free.length; k++) { var dk = hyp(free[k].x - px, free[k].y - py); if (dk < bd) { bd = dk; best = k; } }
        slots[free[best].role] = { lat: lat, dep: dep, pod: s[2] };
        free.splice(best, 1);
      });
    }
    function podLead(team, pod) {
      var slots = sim.fslot[team], best = null;
      sim.teams[team].forEach(function (p) { var s = slots[p.role]; if (p.role < 8 && s && s.pod === pod && (!best || s.dep < slots[best.role].dep)) best = p; });
      return best;
    }
    function attackShape(team, ax, ay, skip, focus) {
      var d = dirOf(team), os = sim.d.os || (ay < WID / 2 ? 1 : -1), P = sim.teams[team], slots = sim.fslot[team];
      var ry = sim.d.ry !== undefined ? sim.d.ry : ay;                 // pods stay anchored where the breakdown was
      var openW = os > 0 ? WID - ry : ry, blindW = WID - openW, squeeze = clamp((openW - 4) / 30, 0.45, 1);
      var wOpen = os > 0 ? 13 : 10;                                    // 11 holds the low touchline, 14 the high one
      var fbIn = sim.d.fbIn, looper = sim.d.looper;
      function Y(lat) { return clamp(ry + os * (lat > 0 ? lat * squeeze : lat), 3, WID - 3); }
      function backSlot(p) {                                           // [lateral, depth] in the set shape
        if (p.role === 9) return [9, 4.6];                             // 10: second layer, just behind the gap between the pods
        if (p.role === 11) return [15.5, 6.3];                         // 12
        if (p.role === 12) return [22, 8.0];                           // 13
        if (p.role === 14) return [19, 7.2];                           // 15, called into the line for a strike move
        if (p.role === wOpen) return [(openW - 4) / squeeze, 9.4];     // open-side wing holds the width
        return blindW > 14 ? [-(blindW - 5), 7] : [7, 15];             // blind wing: his touchline, or the backfield when there's no room
      }
      var moving = focus && focus.team === team && focus.role >= 9;    // ball's in the backline: everyone outside re-aligns off it
      var fLat = moving ? (focus.y - ry) * os : 0, outside = [];
      P.forEach(function (p) {
        if (skip && skip.indexOf(p) > -1) return;
        var r = p.role, jx = p.jx * 0.3, jy = p.jy * 0.5, s, bs;
        if (r === 8) { go(p, ax - d * 2.6 + p.jx * 0.2, ay + os * 1.2); return; }   // 9: chases the ball to the next breakdown
        if (r === 14 && !fbIn) { go(p, ax - d * (21 + p.jy * 0.6), clamp(WID / 2 + (ay - WID / 2) * 0.15 + p.jx * 4, 8, WID - 8)); return; }   // 15: deep, joins only when a move brings him in
        if (r < 8) {
          s = slots[r];
          if (!s) { go(p, ax - d * (2.4 + (r % 3) * 0.8), ay + os * (1.5 + (r % 4) * 1.2)); return; }   // just up from a ruck: trail the ball as a cleaner
          var fs = focus && focus.team === team && focus.role < 8 ? slots[focus.role] : null;
          if (fs && fs.pod === s.pod && s.pod > 0) { go(p, focus.x - d * 1.4, focus.y + ((p.y - focus.y) >= 0 ? 1.3 : -1.3)); return; }   // pod-mate on the carry: latch on behind him
          go(p, ax - d * (s.dep + jx), Y(s.lat) + jy); return;
        }
        bs = backSlot(p);
        if (moving && p !== focus) {
          if (p === looper) { go(p, focus.x - d * 2.4, focus.y + os * 3.6); return; }                     // loop: round the back of the man he passed to
          if (bs[0] > fLat + 1.5) { outside.push([p, bs[0]]); return; }
          if (bs[0] > fLat - 12) { go(p, focus.x - d * 3.2, focus.y - os * 3.5); return; }                // just passed: support on the inside shoulder
        }
        go(p, ax - d * (bs[1] + jx), Y(bs[0]) + jy);
      });
      outside.sort(function (u, v) { return u[1] - v[1]; }).forEach(function (o, k) {   // outside the ball: each man a little deeper and wider than the last
        var p = o[0], own = Y(o[1]), ty = clamp(focus.y + os * 6.8 * (k + 1), 3, WID - 3);
        if (p.role === wOpen || (ty - own) * os > 0) ty = own;                           // never wider than his own channel; the wing keeps the width
        go(p, focus.x - d * (1.2 + 1.9 * (k + 1)), ty);
      });
    }
    // Defensive line: guard and pillar tight on the breakdown, channels widening towards the touchlines, and
    // defenders shared either side in proportion to the room there. The back three sit behind the line.
    var DOFF = [1.7, 4.6, 8.2, 12.4, 17, 22, 27.5, 33.5, 40, 47, 54, 61];
    function defenceShape(team, lineX, ay, skip) {
      var da = dirOf(other(team));
      var P = sim.teams[team].filter(function (p) { return (!skip || skip.indexOf(p) < 0); });
      var backRoles = [10, 13, 14];   // 11, 14, 15: the back three drop off the front line to cover
      var line = P.filter(function (p) { return backRoles.indexOf(p.role) < 0; }).sort(function (a, b) { return a.y - b.y; });
      var back = P.filter(function (p) { return backRoles.indexOf(p.role) > -1; });
      var n = line.length, lo = ay - 2.5, hi = WID - 2.5 - ay, ys = [];
      var nLo = clamp(Math.round(n * lo / Math.max(1, lo + hi)), lo > 1.5 ? 1 : 0, hi > 1.5 ? n - 1 : n);
      function side(count, room, sgn) {
        if (count <= 0) return;
        var far = DOFF[count - 1], sc = far > room ? room / far : 1;
        for (var i = 0; i < count; i++) ys.push(ay + sgn * Math.max(Math.min(1.5, room), DOFF[i] * sc));
      }
      side(nLo, lo, -1); side(n - nLo, hi, 1);
      // forwards (and the 9) take the tight channels round the breakdown, the 10 and centres the wider ones
      var tight = line.filter(function (p) { return p.role <= 8; }), wide = line.filter(function (p) { return p.role > 8; });
      ys.sort(function (a, b) { return Math.abs(a - ay) - Math.abs(b - ay); });
      var inner = ys.slice(0, tight.length).sort(function (a, b) { return a - b; }), outer = ys.slice(tight.length).sort(function (a, b) { return a - b; });
      function place(group, slotsY) {
        group.forEach(function (p, i) { go(p, lineX + da * (p.jx * 0.15 + (i % 2) * 0.3), clamp(slotsY[i], 2, WID - 2)); });
      }
      place(tight, inner); place(wide, outer);
      var room = Math.max(0, ((da > 0 ? TRY1 : TRY0) - lineX) * da - 1);   // defending on their own line there's no backfield to cover: the back three come up
      back.forEach(function (p) {
        if (p.role === 14) { go(p, lineX + da * Math.min(20, room), clamp(ay + (ay < WID / 2 ? 6 : -6), 8, WID - 8)); return; }   // 15 full-back: deepest, sweeps behind
        var side = p.role === 10 ? -1 : 1;                                                                        // 11 covers the left edge, 14 the right
        go(p, lineX + da * Math.min(9, room), clamp(WID / 2 + side * 22, 4, WID - 4));
      });
    }
    function refFollow(x, y, d) {
      var side = sim.d.refSide || 1;
      sim.ref.tx = clamp(x - d * 9, 3, LEN - 3); sim.ref.ty = clamp(y + side * 9, 2, WID - 2);
    }
    function defLine(ball) {   // defence sets at its offside line, then comes up with line speed - up to the ball, never through it
      var dd = dirOf(sim.poss), x = sim.d.defX0 - dd * Math.min(sim.d.age * TUNE.lineSpeed, sim.d.defAdv);
      return dd > 0 ? Math.max(x, ball.x + 1.2) : Math.min(x, ball.x - 1.2);
    }
    // at a ruck or maul, anyone on the wrong side of their offside line (the hindmost foot) has to get back onside
    // round the side of the breakdown, not through it
    function workOnside(team, an, skip, sideSign) {
      var dd = dirOf(sim.poss), onDir = dd * sideSign, lineX = an.x + onDir * 1.4;
      sim.teams[team].forEach(function (p) {
        if (skip.indexOf(p) > -1 || (p.x - lineX) * onDir >= 0) return;
        p.hurry = true;
        if (Math.abs(p.y - an.y) < 3.2) go(p, p.x + onDir * 1.2, an.y + (p.y >= an.y ? 3.6 : -3.6));
      });
    }
    // who kicks, and how often, by where they are: exit from your own 22, kick for territory from your own half,
    // and in the opposition half only a probing chip, grubber or cross-kick
    function kickChance(role, zone, toGo, pressure) {
      var own22 = toGo > 78, ownHalf = zone < 0, opp22 = toGo < 22;
      if (role === 9) return own22 ? 0.7 : ownHalf ? 0.38 : opp22 ? 0.1 : 0.12;              // 10: the main kicker
      if (role === 8) return own22 ? 0.45 : ownHalf ? 0.06 : 0;                               // 9 on the run (box kicks come off the ruck)
      if (role === 14) return own22 ? (pressure ? 0.8 : 0.45) : ownHalf ? 0.25 : 0.03;        // 15: exits, or returns the kick
      if (role === 10 || role === 13) return own22 ? (pressure ? 0.55 : 0.2) : ownHalf ? 0.08 : 0;   // wing pinned deep: clear it
      return 0;
    }
    function kickKind(role, toGo) {
      if (toGo > 50) return role === 8 ? 'box' : 'long';
      if (role !== 9) return 'chip';
      var k = rand();
      if (toGo < 22) return k < 0.4 ? 'cross' : k < 0.75 ? 'grubber' : 'chip';
      return k < 0.3 ? 'long' : k < 0.6 ? 'chip' : k < 0.8 ? 'cross' : 'grubber';
    }

    /* ---------- phase starters ---------- */
    function startKickoff(kt, dropout) {   // halfway kick-off, or (dropout) a 22 drop-out
      if (!dropout && sim.time > sim.nextHalf) {
        sim.flip *= -1; sim.nextHalf += 140; sim.half++;
        if (sim.half > 2) { sim.half = 1; sim.score = [0, 0]; sim.changed = true; }   // full time: a fresh match kicks off
      }
      var dk = dirOf(kt);
      sim.d = { kt: kt, refSide: rand() < 0.5 ? 1 : -1, kox: dropout ? (dk > 0 ? TRY0 : TRY1) + dk * 22 : MID, drop: !!dropout };
      loose(sim.d.kox, WID / 2);
      sim.carrier = null;
      setPhase('kickoff_setup');
    }
    function setKickoffTargets() {
      var kt = sim.d.kt, rt = other(kt), dk = dirOf(kt), kox = sim.d.kox;
      sim.teams[kt].forEach(function (p) {
        if (p.role === 9) { go(p, kox - dk * 0.4, WID / 2); return; }
        go(p, kox - dk * (1.2 + (p.role % 3) * 0.8), 5 + (p.role / 14) * 60);
      });
      sim.teams[rt].forEach(function (p) {   // nobody starts shallower than the shortest possible kick (24m) - no one is caught offside at the catch
        if (p.role < 8) go(p, kox + dk * (24 + (p.role % 4) * 2), 9 + p.role * 7.5);
        else { var k = p.role - 8; go(p, kox + dk * (24 + k * 3), [30, 22, 48, 12, 58, 28, 35][k]); }
      });
      sim.ref.tx = kox - dk * 4; sim.ref.ty = 26;
    }
    function startOpen(team, carrier, forcePass, noKick, continuePhase) {
      var from = sim.phase, dd = dirOf(team), fromBreak = from === 'ruck' || from === 'maul';
      sim.poss = team; giveBall(carrier);
      sim.seq = continuePhase ? (sim.seq || 0) + 1 : 0;   // phases since the last set-piece/turnover: only recycled ruck ball counts
      // where the defence sets: the ruck's hindmost foot, 5m behind a scrum, 10m back from a lineout or penalty, or on the catcher after a kick
      var ref = (fromBreak || from === 'scrum' || from === 'lineout' || from === 'penalty') ? sim.anchor.x : carrier.x;
      var ls = fromBreak ? [2.0, 2.6] : from === 'scrum' ? [7, 5] : (from === 'lineout' || from === 'penalty') ? [10.5, 6.5] : (from === 'kick' || from === 'kickoff_flight') ? [4, 3.5] : [TUNE.lineDepth, 6];
      var os = carrier.y < WID / 2 ? 1 : -1;
      sim.d = { refSide: sim.d.refSide || 1, forcePass: !!forcePass, age: 0, baseX: carrier.x, kickChecked: !!noKick, shapeY: carrier.y,
                ry: carrier.y, os: os, defX0: ref + dd * ls[0], defAdv: ls[1] };
      if (!fromBreak || !continuePhase || from === 'maul') assignPods(team, carrier.x, carrier.y, os, [carrier]);
      sim.dec = forcePass ? 0.05 : R(0.3, 0.7);
      setPhase('open');
    }
    function startRuck(x, y, tackler) {
      var a = sim.poss, d = dirOf(a);
      var ax = clamp(x + d * R(TUNE.momentum * 0.4, TUNE.momentum), TRY0 + 1, TRY1 - 1), ay = clamp(y, 2, WID - 2);
      sim.anchor = { x: ax, y: ay };
      loose(ax - d * 0.4, ay);
      sim.carrier = null;
      var fa = roleSet(a, 0, 7).filter(function (p) { return p !== sim.d.down; });
      fa.sort(function (p, q) { return hyp(p.x - ax, p.y - ay) - hyp(q.x - ax, q.y - ay); });
      var fd = roleSet(other(a), 0, 7).filter(function (p) { return p !== tackler; });
      fd.sort(function (p, q) { return hyp(p.x - ax, p.y - ay) - hyp(q.x - ax, q.y - ay); });
      // keep the breakdown itself small - the ball carrier and tackler plus, usually, one or two more:
      // never more than 4 bodies committed, most often 2 or 3
      var extraRoll = rand(), extra = extraRoll < 0.3 ? 0 : extraRoll < 0.8 ? 1 : 2, raExtra = 0, rdExtra = 0;
      for (var e = 0; e < extra; e++) { if (rand() < 0.5) raExtra++; else rdExtra++; }
      var os = ay < WID / 2 ? 1 : -1;
      sim.d = { down: sim.d.down, tackler: tackler, ra: fa.slice(0, raExtra), rd: [tackler].concat(fd.slice(0, rdExtra)),
                dur: R(1.9, 2.8), refSide: sim.d.refSide, os: os, ry: ay };
      assignPods(a, ax - d * 1.5, ay, os, sim.d.ra.concat(sim.d.down ? [sim.d.down] : []));   // the next pods form off this ruck
      pulse('tackle', ax, ay); sim.stats.tackles++;
      setPhase('ruck');
    }
    function startScrum(feed, x, y) {
      sim.poss = feed;
      sim.anchor = { x: clamp(x, 16, 104), y: clamp(y, 12, 58) };
      loose(sim.anchor.x, sim.anchor.y); sim.carrier = null;
      sim.d = { dur: R(3.2, 4.2), refSide: sim.d.refSide };
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('scrum');
    }
    function startLineout(thrower, x, edge) {
      sim.poss = thrower;
      sim.anchor = { x: clamp(x, 14, 106), y: edge };
      loose(sim.anchor.x, edge); sim.carrier = null;
      sim.d = { dur: 6, thrown: false, refSide: sim.d.refSide };
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('lineout');
    }
    function startPenalty(benef, x, y) {
      sim.poss = benef;
      sim.anchor = { x: clamp(x, 14, 106), y: clamp(y, 4, 66) };
      loose(sim.anchor.x, sim.anchor.y); sim.carrier = null;
      var os = sim.anchor.y < WID / 2 ? 1 : -1, dB = dirOf(benef), tg = dB > 0 ? TRY1 - sim.anchor.x : sim.anchor.x - TRY0, wide = Math.abs(sim.anchor.y - WID / 2);
      // the captain's call: three points if it's in range, otherwise the corner (or touch for territory), sometimes a quick tap
      var option = (tg < 40 && wide < 24 && rand() < (tg < 22 ? 0.4 : 0.7)) ? 'goal' : rand() < (tg < 50 ? 0.7 : 0.85) ? 'touch' : 'tap';
      sim.d = { dur: 2.4, refSide: sim.d.refSide, os: os, ry: sim.anchor.y, option: option };
      assignPods(benef, sim.anchor.x - dB * 2, sim.anchor.y, os, []);
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('penalty');
    }
    function startKick(carrier, toTouch, kind, penalty) {
      kind = kind || 'long';
      var a = carrier.team, d = dirOf(a), b = sim.ball, lx, ly, ct, touch = !!toTouch, peak = 11, spd = 21;
      var toTry = d > 0 ? TRY1 - carrier.x : carrier.x - TRY0, tryX = d > 0 ? TRY1 : TRY0;
      var mates = sim.teams[a].filter(function (p) { return p !== carrier && p.role >= 9; });
      var foes = sim.teams[other(a)].filter(function (p) { return p.role >= 8; });
      if (kind === 'chip') {
        lx = toTry < 22 ? tryX + d * R(-1.5, 3) : clamp(carrier.x + d * R(9, 17), 12, 108);
        ly = clamp(carrier.y + R(-7, 7), 5, WID - 5); peak = 6; spd = 14; touch = false;
        ct = rand() < 0.55 ? nearest(mates, lx, ly) : nearest(foes, lx, ly);
      }
      else if (kind === 'grubber') {   // along the ground through the line, for the chasers to run on to
        lx = toTry < 16 ? tryX + d * R(1, 5) : clamp(carrier.x + d * R(8, 16), 12, 108);
        ly = clamp(carrier.y + R(-5, 5), 5, WID - 5); peak = 0.6; spd = 12; touch = false;
        ct = rand() < 0.45 ? nearest(mates, lx, ly) : nearest(sim.teams[other(a)], lx, ly);
      }
      else if (kind === 'cross') {     // cross-field kick to the far wing: his wing against theirs in the air
        var hi = carrier.y < WID / 2, wingRole = hi ? 13 : 10;
        lx = toTry < 26 ? tryX + d * R(-5, 3) : clamp(carrier.x + d * R(12, 22), 12, 108);
        ly = hi ? WID - R(4, 9) : R(4, 9); peak = 10; spd = 19; touch = false;
        ct = rand() < 0.55 ? sim.teams[a][wingRole] : sim.teams[other(a)][wingRole];
      }
      else if (kind === 'box') {
        lx = clamp(carrier.x + d * R(17, 28), 12, 108); ly = clamp(carrier.y + R(-12, 12), 4, WID - 4); peak = 14; spd = 15; touch = false;
        ct = rand() < 0.4 ? nearest(sim.teams[a].filter(function (p) { return p !== carrier && p.role < 12; }), lx, ly) : nearest(foes, lx, ly);
      }
      else {
        lx = clamp(carrier.x + d * (penalty ? R(22, 38) : R(30, 50)), 14, 106);
        if (penalty) lx = d > 0 ? Math.min(lx, TRY1 - R(5, 10)) : Math.max(lx, TRY0 + R(5, 10));   // penalty to the corner, not over the dead-ball line
        ly = clamp(carrier.y + R(-20, 20), 5, WID - 5);
        touch = touch || rand() < (toTry > 78 ? 0.7 : 0.45); if (touch) ly = carrier.y < WID / 2 ? 0 : WID;   // exits from the 22 mostly find touch
        ct = nearest(foes, lx, ly);
      }
      b.x = carrier.x; b.y = carrier.y; sim.carrier = null;
      var dist = hyp(lx - b.x, ly - b.y), landsX = lx;
      sim.d = { kicker: carrier, kx: carrier.x, land: { x: lx, y: ly }, touch: touch, catcher: ct, refSide: sim.d.refSide };
      sim.stats.kicks++; if (kind === 'chip') sim.stats.chips++;
      fly(lx, ly, Math.max(1.0, dist / spd), peak, function () {
        if (touch) { startLineout(penalty ? a : other(a), lx, ly); return; }   // from a penalty the kicking side throws in
        var cc = sim.d.catcher, inGoal = landsX > TRY1 - 0.5 || landsX < TRY0 + 0.5;
        if (inGoal) { if (cc.team === a) startTry(cc); else startKickoff(cc.team, true); return; }   // regathered and grounded - or touched down: 22 drop-out
        var ownHalf = (cc.x - MID) * dirOf(cc.team) < 0;
        startOpen(cc.team, cc, false, !((kind === 'long' || kind === 'box') && ownHalf));   // a long kick caught deep can be kicked straight back
      });
      setPhase('kick');
    }
    function startGoalKick(team, x, y) {   // penalty kick at goal: three points
      var kicker = sim.teams[team][9];
      sim.d = { team: team, mark: { x: x, y: clamp(y, 6, WID - 6) }, kicker: kicker, dur: 5.2, kicked: false, pen: true, refSide: sim.d.refSide };
      giveBall(kicker); sim.carrier = null; sim.ball.owner = kicker;
      setPhase('conversion');
    }
    function startMaul(team, x, y) {   // lineout catch in the 22: bind on and drive for the line
      sim.poss = team;
      sim.anchor = { x: x, y: clamp(y, 6, WID - 6) };
      sim.carrier = null;
      var os = sim.anchor.y < WID / 2 ? 1 : -1;
      sim.d = { dur: R(5, 8), speed: 0, stall: 0, refSide: sim.d.refSide, os: os, ry: sim.anchor.y };
      sim.stats.mauls++;
      pulse('tackle', x, sim.anchor.y);
      setPhase('maul');
    }
    function startTry(scorer) {
      var a = scorer.team, d = dirOf(a);
      sim.score[a] += 5; sim.changed = true; sim.stats.tries++;
      sim.anchor = { x: d > 0 ? TRY1 : TRY0, y: clamp(scorer.y, 3, WID - 3) };
      sim.d = { scorer: scorer, team: a, dur: 1.5, refSide: sim.d.refSide };
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('try');
    }
    function startConversion() {
      var a = sim.d.team, d = dirOf(a), tx = d > 0 ? TRY1 : TRY0, sy = clamp(sim.anchor.y, 14, 56);
      var kicker = sim.teams[a][9];
      sim.d = { team: a, mark: { x: tx - d * 12, y: sy }, kicker: kicker, dur: 5.2, kicked: false, refSide: sim.d.refSide };
      giveBall(kicker); sim.carrier = null; sim.ball.owner = kicker;
      setPhase('conversion');
    }

    /* ---------- open play decisions ---------- */
    function findRole(a, role) {
      for (var i = 0; i < sim.teams[a].length; i++) if (sim.teams[a][i].role === role) return sim.teams[a][i];
      return null;
    }
    function pickForward(a, c) {   // an onside forward to carry it into contact: usually the lead runner of the pod off the ruck
      var d = dirOf(a), slots = sim.fslot[a], cands = sim.teams[a].filter(function (r) {
        if (r.role >= 8 || r === c) return false;
        var back = (c.x - r.x) * d, dist = hyp(r.x - c.x, r.y - c.y);
        return back >= 0.3 && dist >= 2.5 && dist <= 14;
      });
      if (!cands.length) return null;
      var want = rand() < 0.8 ? 1 : 0, pod = cands.filter(function (r) { return slots[r.role] && slots[r.role].pod === want; });
      if (pod.length) {
        pod.sort(function (u, v) { return slots[u.role].dep - slots[v.role].dep; });
        return pod.length > 1 && rand() < 0.2 ? pod[1] : pod[0];   // mostly the lead runner, sometimes a tip-on to the man beside him
      }
      return nearest(cands, c.x + d * 3, c.y);
    }
    function phaseTarget(c) {   // what the scrum-half does with quick ball off a ruck: mostly feed the forwards, sometimes release the backline
      if (c.role !== 8) return null;
      var a = c.team, d = dirOf(a), os = sim.d.os || (c.y < WID / 2 ? 1 : -1), wOpen = os > 0 ? 13 : 10;
      var toGo = d > 0 ? TRY1 - c.x : c.x - TRY0, m = rand();
      sim.d.chain = null; sim.d.fbIn = false; sim.d.looper = null;
      if (sim.seq >= 3 && rand() < TUNE.wideChance) {
        sim.seq = 0;   // used our release for this run of phases: back to forwards next time
        // a called backline move: crash ball, spin it wide, miss-pass, the 10 looping round his 12, or the 15 hitting the line
        if (toGo < 30) sim.d.chain = m < 0.3 ? [11] : m < 0.6 ? [11, 12, wOpen] : m < 0.8 ? [12, wOpen] : [11, 9, 12, wOpen];
        else sim.d.chain = m < 0.15 ? [11] : m < 0.45 ? [11, 12, wOpen] : m < 0.65 ? [12, wOpen] : m < 0.85 ? [11, 14, wOpen] : [11, 9, 12, wOpen];
        sim.d.fbIn = sim.d.chain.indexOf(14) > -1;
        if (sim.d.chain[1] === 9) sim.d.looper = findRole(a, 9);
        return findRole(a, 9);
      }
      if (m < 0.22) {   // play off 10: he puts the second pod through a hole on the gain line
        var lead = podLead(a, 2);
        if (lead) { sim.d.chain = [lead]; return findRole(a, 9); }
      }
      return pickForward(a, c);
    }
    function tryPass(c, forced) {
      var a = c.team, d = dirOf(a), r = (forced && forced.team === a && forced !== c) ? forced : null;
      if (!r) {
        var cands = [], wsum = 0, flow = sim.d.flowY || 0;
        sim.teams[a].forEach(function (rr) {
          if (rr === c) return;
          var back = (c.x - rr.x) * d, dist = hyp(rr.x - c.x, rr.y - c.y);
          if (back >= 0.3 && dist >= 3.5 && dist <= 19) {
            var w = rr.role >= 9 && rr.role <= 12 ? 3 : rr.role >= 13 ? 2 : 1;
            if (flow && (rr.y - c.y) * flow < 0) w *= dist < 6 ? 0.4 : 0.1;   // keep the ball moving the way it's going: only a short inside ball to close support
            cands.push([rr, w]); wsum += w;
          }
        });
        if (!cands.length) return false;
        var pick = rand() * wsum; r = cands[0][0];
        for (var i = 0; i < cands.length; i++) { pick -= cands[i][1]; if (pick <= 0) { r = cands[i][0]; break; } }
      }
      var dist = hyp(r.x - c.x, r.y - c.y), dur = Math.max(0.28, dist / 15.5);
      var lx = r.x + r.vx * dur * 0.8, ly = r.y + r.vy * dur * 0.8;
      lx = d > 0 ? Math.min(lx, c.x - 0.3) : Math.max(lx, c.x + 0.3);   // passed flat or backwards - never forward
      var drawn = nearest(sim.teams[other(a)], c.x, c.y);
      if (drawn && hyp(drawn.x - c.x, drawn.y - c.y) < 3) drawn.slow = Math.max(drawn.slow, 0.7);   // drew his man before releasing: that defender is committed and can't drift on to the receiver
      sim.ball.x = c.x; sim.ball.y = c.y; sim.carrier = null;
      sim.d.receiver = r; sim.d.passerX = c.x; sim.stats.passes++;   // the offside line while it's in the air: where it was thrown from
      sim.d.passes = (sim.d.passes || 0) + 1; sim.d.flowY = ly > c.y ? 1 : -1;
      fly(lx, ly, dur, 1.6, function () {
        sim.d.forcePass = false;
        if (rand() < TUNE.knockOn) { // knock-on: scrum to the other side
          sim.stats.knockOns++; startScrum(other(a), r.x, r.y); return;
        }
        giveBall(r); sim.dec = (sim.d.chain && sim.d.chain.length) ? R(0.55, 0.95) : R(0.3, 0.75);   // mid-move: run at your man before you release it
      });
      return true;
    }

    /* ---------- per-phase updates ---------- */
    function updatePhase(dt) {
      var ph = sim.phase, b = sim.ball, i;
      sim.pt += dt;

      if (ph === 'kickoff_setup') {
        setKickoffTargets();
        var ready = sim.players.every(function (p) { return hyp(p.tx - p.x, p.ty - p.y) < 3.5; });
        if ((ready && sim.pt > 1.6) || sim.pt > 6.5) {
          var kt = sim.d.kt, kicker = sim.teams[kt][9], dk = dirOf(kt);
          giveBall(kicker); sim.carrier = null; b.owner = kicker;
          var lx = clamp(sim.d.kox + dk * (sim.d.drop ? R(28, 45) : R(24, 34)), 14, 106), ly = R(14, 56);
          b.x = kicker.x; b.y = kicker.y; pulse('whistle', sim.ref.x, sim.ref.y);
          sim.d.land = { x: lx, y: ly };
          sim.d.catcher = nearest(sim.teams[other(kt)], lx, ly);
          fly(lx, ly, 2.1, 12, function () { startOpen(other(kt), sim.d.catcher, false, true); });
          setPhase('kickoff_flight');
        }
        return;
      }

      if (ph === 'kickoff_flight' || ph === 'kick') {
        var land = sim.d.land, kt2 = ph === 'kick' ? sim.d.kicker.team : sim.d.kt, rt = other(kt2), dk2 = dirOf(kt2);
        var kx = sim.d.kx !== undefined ? sim.d.kx : sim.d.kox;
        if (ph === 'kick' && (sim.d.kicker.x - kx) * dk2 > 0) kx = sim.d.kx = sim.d.kicker.x;   // the chasing kicker puts team-mates onside as he passes them
        sim.teams[kt2].forEach(function (p, k) {
          if (p === sim.d.kicker) { go(p, land.x - dk2 * 6, land.y + (p.y < land.y ? -3 : 3)); return; }
          if (ph === 'kick' && (p.x - kx) * dk2 > 1) {           // in front of the kicker = offside: hold or retire, never advance, until he runs past
            go(p, p.x - dk2 * 0.8, p.y); return;
          }
          go(p, land.x - dk2 * (1.5 + (k % 5) * 1.6), land.y + (p.role - 7) * 2.4);
        });
        go(sim.d.catcher, land.x, land.y);
        sim.teams[rt].forEach(function (p) {
          if (p === sim.d.catcher) return;
          go(p, land.x + dirOf(kt2) * (3 + (p.role % 5) * 2.2) - dirOf(kt2) * 6, land.y + (p.role - 7) * 3.3);
        });
        refFollow(land.x, land.y, dirOf(kt2));
        return;
      }

      if (ph === 'open') {
        var c = sim.carrier;
        if (!c) { // a pass is in the air: keep shape around the ball, but nobody may stand ahead of where it was thrown from
          var pa0 = sim.poss, d0 = dirOf(pa0), rc = sim.d.receiver;
          sim.d.age = (sim.d.age || 0) + dt;
          sim.d.shapeY += clamp(b.y - sim.d.shapeY, -TUNE.shapeDrift * dt, TUNE.shapeDrift * dt);   // the shape drifts across, it doesn't snap to the ball
          var wantAx0 = sim.d.baseX + d0 * Math.min(sim.d.age * TUNE.teamRun, TUNE.teamRunMax);
          var ax0 = d0 > 0 ? Math.min(wantAx0, sim.d.passerX) : Math.max(wantAx0, sim.d.passerX);
          attackShape(pa0, ax0, sim.d.shapeY, rc ? [rc] : null, rc);
          defenceShape(other(pa0), defLine(b), sim.d.shapeY, null);
          sim.teams[pa0].forEach(function (p) { if ((p.x - sim.d.passerX) * d0 > 0.3) p.hurry = true; });   // caught offside: sprint back now
          if (rc && b.fly) go(rc, b.fly.x1, b.fly.y1);   // the receiver runs on to where the pass will arrive
          go(nearest(sim.teams[other(pa0)], b.x, b.y), b.x + d0 * 2, b.y);
          refFollow(b.x, b.y, d0);
          return;
        }
        var a = c.team, d = dirOf(a), def = other(a);
        sim.d.age = (sim.d.age || 0) + dt;
        c.immune -= dt;
        // carrier runs hard at the line, angling away from the nearest defender in front of him (at the gap) - but not into touch
        var front = null, fd = 1e9;
        sim.teams[def].forEach(function (q) { var ah = (q.x - c.x) * d; if (ah > -0.5 && ah < 14) { var dq = hyp(q.x - c.x, q.y - c.y); if (dq < fd) { fd = dq; front = q; } } });
        var open = front ? (c.y >= front.y ? 1 : -1) : (c.y < WID / 2 ? 1 : -1);
        if (c.y < 5) open = 1; else if (c.y > WID - 5) open = -1;
        if (c.immune > 0) go(c, c.x + d * 24, c.y + open * 3); else go(c, c.x + d * 9, c.y + open * 2.2);
        sim.d.shapeY += clamp(c.y - sim.d.shapeY, -TUNE.shapeDrift * dt, TUNE.shapeDrift * dt);   // the shape drifts across, it doesn't snap to the carrier
        // support may never be shown ahead of the ball carrier - that's offside in open play, no exceptions
        var wantAx = sim.d.baseX + d * Math.min(sim.d.age * TUNE.teamRun, TUNE.teamRunMax);
        var ax = d > 0 ? Math.min(wantAx, c.x) : Math.max(wantAx, c.x);
        attackShape(a, ax, sim.d.shapeY, [c], c);
        defenceShape(def, defLine(c), sim.d.shapeY, null);
        sim.teams[a].forEach(function (p) { if (p !== c && (p.x - c.x) * d > 0.3) p.hurry = true; });   // caught offside: sprint back now
        if (c.immune > 0) {   // a clean break: the nearest couple of team-mates shadow the ball rather than holding the wider shape
          var mates = sim.teams[a].filter(function (p) { return p !== c; })
            .sort(function (p, q) { return hyp(p.x - c.x, p.y - c.y) - hyp(q.x - c.x, q.y - c.y); });
          for (var s = 0; s < Math.min(2, mates.length); s++) {
            var m = mates[s], side = m.y < c.y ? -1 : 1;
            go(m, c.x - d * (3 + s * 2.5), c.y + side * (3.5 + s * 1.5));
          }
        }
        sim.teams[def].forEach(function (q) {
          q.hurry = (q.x - c.x) * d < 0.5;
          if (!q.hurry) return;
          if (q.role === 10 || q.role === 13 || q.role === 14) {   // back three: hold depth and scan across rather than sprinting flat at the carrier
            var covDepth = q.role === 14 ? 14 : 8, scanY = q.y + clamp(c.y - q.y, -6, 6) * 0.5;
            go(q, c.x + d * covDepth, clamp(scanY, 4, WID - 4));
            return;
          }
          var gap = hyp(q.x - c.x, q.y - c.y), T = clamp(gap / (q.max * TUNE.hurry), 0.3, 3);   // beaten: turn and cut the runner off
          go(q, c.x + c.vx * T + d * 1.5, c.y + c.vy * T);
        });
        var chaser = nearest(sim.teams[def], c.x, c.y);
        if (hyp(chaser.x - c.x, chaser.y - c.y) < 5) go(chaser, c.x + d * 0.6, c.y);
        // mid backline move: run straight at the defender to draw him rather than passing on a clock
        if (c.immune <= 0 && sim.d.chain && sim.d.chain.length && hyp(chaser.x - c.x, chaser.y - c.y) < 3.2) {
          sim.dec = Math.min(sim.dec, 0.05);
        }
        refFollow(c.x, c.y, d);
        // try
        if ((d > 0 && c.x >= TRY1) || (d < 0 && c.x <= TRY0)) { startTry(c); return; }
        // out of play
        if (c.y <= 0.7 || c.y >= WID - 0.7) { startLineout(def, c.x, c.y < WID / 2 ? 0 : WID); return; }
        // decisions: a clean break just runs - no pass, no kick, no getting hauled into a ruck by the clock
        if (c.immune <= 0) {
          sim.dec -= dt;
          if (sim.dec <= 0) {
            var zone = (c.x - MID) * d, toGo = d > 0 ? TRY1 - c.x : c.x - TRY0;
            if (!sim.d.forcePass && !sim.d.kickChecked && c.role >= 8 && c.role !== 11 && c.role !== 12) {   // 9, 10 and the back three can kick: one look per phase
              sim.d.kickChecked = true;
              var pressure = hyp(chaser.x - c.x, chaser.y - c.y) < 6;
              if (rand() < kickChance(c.role, zone, toGo, pressure)) { startKick(c, false, kickKind(c.role, toGo)); return; }
            }
            if (c === sim.d.looper) sim.d.looper = null;   // the loop is complete: he has it back
            var forced = null;
            if (sim.d.chain && sim.d.chain.length) { var nx = sim.d.chain.shift(); forced = typeof nx === 'object' ? nx : findRole(a, nx); }   // mid-move: next man in the call
            else if (c.role === 8) forced = phaseTarget(c);                                     // scrum-half: forwards most phases, backline sometimes
            var basePass = toGo < 15 ? 0.55 : TUNE.pass;
            var passChance = c.role < 8 ? basePass * 0.3 : basePass;   // a forward on the carry drives into contact rather than looking for another inside pass
            if ((sim.d.passes || 0) >= 3) passChance *= 0.35;           // the move has run its course: take it into contact, don't shovel it sideways
            if (forced || sim.d.forcePass || rand() < passChance) { if (!tryPass(c, forced)) sim.dec = R(0.2, 0.45); }
            else sim.dec = R(0.4, 0.8);
          }
        }
        // contact
        var near = null;
        for (i = 0; i < sim.teams[def].length; i++) {
          var q = sim.teams[def][i];
          if (hyp(q.x - c.x, q.y - c.y) < 1.35) { near = q; break; }
        }
        if (near && sim.carrier === c) {
          if (c.immune > 0) return;
          var toLine = d > 0 ? TRY1 - c.x : c.x - TRY0;
          if (toLine < 2.2 && rand() < TUNE.driveOver) { startTry(c); return; }   // from a metre out, momentum and a long reach get it down
          if (rand() < (toLine < 24 ? TUNE.missRedZone : TUNE.missTackle)) {
            // beaten his man - but it's only a clean line break if there's no cover defender right there to finish the job
            var cover = sim.teams[def].some(function (q) { return q !== near && (q.x - c.x) * d > -0.5 && (q.x - c.x) * d < 3.5 && Math.abs(q.y - c.y) < 2.5; });
            c.immune = cover ? TUNE.stepRun : TUNE.breakRun; near.slow = 1.1;
          }
          else if (rand() < TUNE.offload && tryPass(c)) { sim.stats.offloads++; near.slow = 0.6; return; }
          else if (rand() < TUNE.spill) { sim.stats.knockOns++; startScrum(def, c.x, c.y); return; }   // spilled in the tackle: scrum
          else { sim.d.down = c; startRuck(c.x, c.y, near); return; }
        }
        if (c.immune <= 0 && sim.d.age > 7.5) { sim.d.down = c; startRuck(c.x, c.y, nearest(sim.teams[def], c.x, c.y)); }
        return;
      }

      if (ph === 'ruck') {
        var A = sim.poss, dd = dirOf(A), an = sim.anchor;
        sim.d.down && go(sim.d.down, an.x, an.y);
        sim.d.ra.forEach(function (p, k) { go(p, an.x - dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1); });
        sim.d.rd.forEach(function (p, k) { go(p, an.x + dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1); });
        var skipA = sim.d.ra.concat(sim.d.down ? [sim.d.down] : []);
        attackShape(A, an.x - dd * 1.5, an.y, skipA);          // the rest of the pack forms its pods off the breakdown rather than piling in
        defenceShape(other(A), an.x + dd * 2.0, an.y, sim.d.rd);   // defence sets right on the hindmost foot
        var sh = sim.teams[A][8]; if (skipA.indexOf(sh) < 0) go(sh, an.x - dd * 2.2, an.y + 0.6);
        workOnside(A, an, skipA.concat([sh]), -1);
        workOnside(other(A), an, sim.d.rd, 1);
        refFollow(an.x, an.y, dd);
        if (sim.pt > sim.d.dur) {
          var roll2 = rand();
          if (roll2 < TUNE.penalty) { startPenalty(rand() < 0.5 ? A : other(A), an.x, an.y); }
          else if (roll2 < TUNE.penalty + TUNE.turnover) { // turnover
            var nb = nearest(sim.d.rd.filter(function (p) { return p.role < 8; }), an.x, an.y) || sim.d.rd[0];
            sim.d.down = null; startOpen(other(A), nb, false);
          } else {
            var half = sim.teams[A][8]; half.x = an.x - dd * 1.2; half.y = an.y; half.vx = half.vy = 0;
            sim.d.down = null;
            var pg = sim.d.ra[0], toGoR = dd > 0 ? TRY1 - an.x : an.x - TRY0;
            if (pg && toGoR < 7 && rand() < TUNE.pickGo) {   // on the line: a forward picks from the base and drives, no pass
              pg.x = an.x - dd * 0.6; pg.y = an.y; pg.vx = pg.vy = 0; startOpen(A, pg, false, true, true); return;
            }
            var pBox = toGoR > 78 ? 0.32 : toGoR > 50 ? 0.2 : 0.03;   // box kicks are an own-half weapon
            if (rand() < pBox) { sim.poss = A; sim.carrier = half; sim.ball.owner = half; startKick(half, false, 'box'); }
            else startOpen(A, half, true, false, true);
          }
        }
        return;
      }

      if (ph === 'scrum') {
        var F = sim.poss, df = dirOf(F), sa = sim.anchor;
        if (sim.pt < TUNE.pauseDur) { sim.players.forEach(function (p) { go(p, p.x, p.y); }); sim.ref.tx = sa.x; sim.ref.ty = clamp(sa.y + 6, 2, WID - 2); return; }   // a beat for the whistle before anyone sets
        var rows = [[-1.3, 0, 1.3], [-0.7, 0.7], [-1.3, 0, 1.3]], idx = 0;
        rows.forEach(function (row, ri) {
          row.forEach(function (off) {
            var pa = sim.teams[F][idx], pd = sim.teams[other(F)][idx]; idx++;
            go(pa, sa.x - df * (0.7 + ri * 1.25), sa.y + off);
            go(pd, sa.x + df * (0.7 + ri * 1.25), sa.y + off);
          });
        });
        var sh2 = sim.teams[F][8]; go(sh2, sa.x - df * 0.3, sa.y + 2.3);
        var sh3 = sim.teams[other(F)][8]; go(sh3, sa.x + df * 0.3, sa.y - 2.3);
        sim.teams[F].forEach(function (p) { if (p.role >= 9) { var s = [6, 12, 19, 26, -14, -5][p.role - 9]; go(p, sa.x - df * (8 + (p.role - 9) * 1.2), sa.y + s); } });
        sim.teams[other(F)].forEach(function (p) { if (p.role >= 9) go(p, sa.x + df * 9, sa.y + (p.role - 11.5) * 8); });
        sim.players.forEach(function (p) { var mine = p.team === F ? -1 : 1; if (p.role >= 8 && (p.x - sa.x) * df * mine < 5) p.hurry = true; });
        sim.ref.tx = sa.x; sim.ref.ty = clamp(sa.y + 6, 2, WID - 2);
        if (sim.pt > sim.d.dur) {
          if (rand() < TUNE.scrumPen) { startPenalty(rand() < 0.55 ? F : other(F), sa.x, sa.y); return; }   // the set piece is won on the referee's arm as often as not
          sh2.x = sa.x - df * 0.6; sh2.y = sa.y + 1.6; sh2.vx = sh2.vy = 0; startOpen(F, sh2, true);
        }
        return;
      }

      if (ph === 'lineout') {
        var T = sim.poss, dt2 = dirOf(T), la = sim.anchor, sg = la.y < WID / 2 ? 1 : -1;
        if (sim.pt < TUNE.pauseDur) { sim.players.forEach(function (p) { go(p, p.x, p.y); }); sim.ref.tx = la.x; sim.ref.ty = la.y + sg * 3; return; }   // a beat for the whistle before anyone sets
        for (i = 0; i < 7; i++) {
          go(sim.teams[T][i], la.x - 0.55, la.y + sg * (5 + i * 1.7));
          go(sim.teams[other(T)][i], la.x + 0.55, la.y + sg * (5 + i * 1.7));
        }
        go(sim.teams[T][7], la.x - dt2 * 3, la.y + sg * 4);
        go(sim.teams[other(T)][7], la.x + dt2 * 3, la.y + sg * 5);
        go(sim.teams[T][8], la.x - dt2 * 4, la.y + sg * 9);
        go(sim.teams[other(T)][8], la.x + dt2 * 4, la.y + sg * 9);
        [9, 10, 11, 12, 13, 14].forEach(function (rle, k) {
          go(sim.teams[T][rle], la.x - dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
          go(sim.teams[other(T)][rle], la.x + dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
        });
        sim.players.forEach(function (p) { p.hurry = true; });   // everyone sprints to form the lineout, not just the backs
        go(sim.teams[T][1], la.x - 0.3, la.y + sg * 1.1); // 2 hooker stands at the mark to throw in
        sim.ref.tx = la.x; sim.ref.ty = la.y + sg * 3;
        if (!sim.d.thrown) {
          var lineReady = sim.teams[T].concat(sim.teams[other(T)]).filter(function (p) { return p.role < 7; })
            .every(function (p) { return hyp(p.tx - p.x, p.ty - p.y) < 2.5; });
          if ((lineReady && sim.pt > 1.1) || sim.pt > 4.2) {
            sim.d.thrown = true; b.x = la.x; b.y = la.y;
            var stolen = rand() < TUNE.lineoutSteal, jt = stolen ? other(T) : T;
            var jumper = sim.teams[jt][3 + Math.floor(rand() * 4)]; // a lock or flanker (4-7) jumps - occasionally theirs gets up first
            sim.d.jumper = jumper; sim.d.stolen = stolen;
            fly(la.x + (jt === T ? -0.55 : 0.55), la.y + sg * (5 + jumper.role * 1.7), 0.55, 4.5, function () { sim.ball.owner = jumper; sim.d.caught = sim.pt; });
          }
        }
        var W = sim.d.stolen ? other(T) : T, dW = dirOf(W), toGoL = dW > 0 ? TRY1 - la.x : la.x - TRY0;
        if (sim.d.caught !== undefined && !sim.d.stolen && !sim.d.noMaul && sim.pt > sim.d.caught + 0.6) {   // catch in the 22: set the maul
          if (rand() < (toGoL < 15 ? TUNE.maul : toGoL < 25 ? TUNE.maul * 0.4 : 0)) { startMaul(T, sim.d.jumper.x - dt2 * 0.8, sim.d.jumper.y); return; }
          sim.d.noMaul = true;
        }
        if (sim.d.thrown && sim.pt > sim.d.dur) {
          var half2 = sim.teams[W][8];
          half2.x = la.x - dW * 4; half2.y = la.y + sg * 9; half2.vx = half2.vy = 0;
          startOpen(W, half2, true);
        }
        return;
      }

      if (ph === 'maul') {
        var M = sim.poss, dm = dirOf(M), mo = sim.anchor, fw = roleSet(M, 0, 7), dfw = roleSet(other(M), 0, 7);
        if (sim.pt > 0.8) {                                   // it takes a moment to bind before it goes forward, then surges and stalls
          if (!sim.d.bound) { sim.d.bound = true; sim.d.speed = R(1.2, 2.4); }   // bound on: the first shove
          else if (rand() < dt * 1.3) sim.d.speed = rand() < 0.2 ? 0 : R(1.2, 2.4);
          mo.x += dm * sim.d.speed * dt;
          sim.d.stall = sim.d.speed === 0 ? sim.d.stall + dt : 0;
        }
        // attacking pack bound in behind the jumper, hooker at the back with the ball; their pack in front, driving back
        var rowsA = [[0.4, 0], [1.1, -0.9], [1.1, 0.9], [1.8, -1.3], [1.8, 0], [1.8, 1.3], [2.5, -0.6], [2.5, 0.6]];
        var hooker = sim.teams[M][1], order = fw.filter(function (p) { return p !== hooker; }).concat([hooker]);
        order.forEach(function (p, k) { go(p, mo.x - dm * rowsA[k][0], mo.y + rowsA[k][1]); });
        dfw.forEach(function (p, k) { go(p, mo.x + dm * (1.0 + Math.floor(k / 3) * 0.8), mo.y + ((k % 3) - 1) * 1.0); });
        sim.ball.owner = hooker; sim.carrier = null;
        attackShape(M, mo.x - dm * 3.5, mo.y, fw);
        defenceShape(other(M), mo.x + dm * 3.5, mo.y, dfw);
        workOnside(M, { x: mo.x - dm * 2.2, y: mo.y }, fw.concat([sim.teams[M][8]]), -1);
        workOnside(other(M), { x: mo.x + dm * 2.2, y: mo.y }, dfw, 1);
        go(sim.teams[M][8], mo.x - dm * 3.4, mo.y + 1.2);    // 9 at the back, hand on the ball
        refFollow(mo.x, mo.y, dm);
        if ((dm > 0 && mo.x >= TRY1 + 1) || (dm < 0 && mo.x <= TRY0 - 1)) { startTry(hooker); return; }   // driven over: hooker grounds it
        if (sim.pt > 1.2 && rand() < dt * 0.03) { startPenalty(M, mo.x, mo.y); return; }                   // pulled down illegally
        if (sim.pt > sim.d.dur || sim.d.stall > 1.6) {                                                     // it's stopped: use it
          var h9 = sim.teams[M][8]; h9.x = mo.x - dm * 3.4; h9.y = mo.y; h9.vx = h9.vy = 0;
          startOpen(M, h9, true, false, true);
        }
        return;
      }

      if (ph === 'penalty') {
        var pa2 = sim.anchor, Bn = sim.poss, dB = dirOf(Bn);
        if (sim.pt < TUNE.pauseDur) { sim.players.forEach(function (p) { go(p, p.x, p.y); }); sim.ref.tx = pa2.x - dirOf(Bn) * 3; sim.ref.ty = pa2.y + 5; return; }   // a beat for the whistle before anyone sets
        var tapper = sim.d.taker || (sim.d.taker = sim.d.option === 'tap' ? nearest(sim.teams[Bn], pa2.x, pa2.y) : sim.teams[Bn][9]);   // the 10 comes up to kick it
        attackShape(Bn, pa2.x, pa2.y, [tapper]);
        go(tapper, pa2.x, pa2.y);
        sim.teams[other(Bn)].forEach(function (p) {          // offenders retreat ten metres, sprinting
          go(p, pa2.x + dB * (10.5 + (p.role % 3)), clamp(pa2.y + (p.role - 7) * 4, 3, WID - 3));
          if ((p.x - pa2.x) * dB < 10) p.hurry = true;
        });
        sim.ref.tx = pa2.x - dirOf(Bn) * 3; sim.ref.ty = pa2.y + 5;
        var opt = sim.d.option;
        if (sim.pt > sim.d.dur && (opt === 'goal' || hyp(tapper.x - pa2.x, tapper.y - pa2.y) < 1.5 || sim.pt > sim.d.dur + 3)) {
          if (opt === 'goal') { startGoalKick(Bn, pa2.x, pa2.y); return; }                     // in range: take the three points
          tapper.x = pa2.x; tapper.y = pa2.y; tapper.vx = tapper.vy = 0;
          if (opt === 'touch') { b.x = tapper.x; b.y = tapper.y; startKick(tapper, true, 'long', true); }   // kick for the corner, or for territory
          else startOpen(Bn, tapper, false);                                                   // quick tap and go
        }
        return;
      }

      if (ph === 'try') {
        var sc = sim.d.scorer, dtm = dirOf(sim.d.team);
        go(sc, sc.x + dtm * 3, sc.y);
        sim.teams[sim.d.team].forEach(function (p) { if (p !== sc) go(p, sc.x - dtm * 4 + p.jx, sc.y + (p.role - 7) * 1.2); });
        sim.teams[other(sim.d.team)].forEach(function (p) { go(p, sim.anchor.x + dtm * (12 + (p.role % 4) * 3), 8 + p.role * 3.6); });
        sim.ref.tx = sim.anchor.x - dtm * 2; sim.ref.ty = sim.anchor.y + 4;
        if (sim.pt > sim.d.dur) startConversion();
        return;
      }

      if (ph === 'conversion') {
        var cv = sim.d, ta = cv.team, dtv = dirOf(ta), tx = dtv > 0 ? TRY1 : TRY0;
        go(cv.kicker, cv.mark.x, cv.mark.y);
        sim.teams[ta].forEach(function (p) { if (p !== cv.kicker) { go(p, cv.mark.x - dtv * (10 + (p.role % 4) * 3), 12 + p.role * 3.2); p.hurry = hyp(p.tx - p.x, p.ty - p.y) > 4; } });
        sim.teams[other(ta)].forEach(function (p) {
          if (p.role < 8) go(p, tx + dtv * 1.4, 35 + (p.role - 3.5) * 1.6);
          else go(p, cv.pen ? clamp(cv.mark.x + dtv * (12 + (p.role % 3) * 4), 12, 108) : MID + dtv * 8, 8 + p.role * 3.6);   // at a penalty goal their backs wait between the mark and the posts
        });
        sim.ref.tx = cv.mark.x + dtv * 6; sim.ref.ty = cv.mark.y + 6;
        if (!cv.kicked && sim.pt > 2.3 && hyp(cv.kicker.x - cv.mark.x, cv.kicker.y - cv.mark.y) < 1.5) {
          cv.kicked = true; b.x = cv.kicker.x; b.y = cv.kicker.y; b.owner = null;
          var reach = hyp(cv.mark.x - tx, cv.mark.y - WID / 2), good = rand() < clamp(0.97 - reach * 0.0065 - Math.abs(cv.mark.y - WID / 2) * 0.009, 0.3, 0.95);   // longer and wider is harder
          var ty = good ? 35 + R(-1.2, 1.2) : 35 + (rand() < 0.5 ? -1 : 1) * R(3.6, 5.5);
          cv.good = good;
          fly(tx, ty, Math.max(1.2, reach / 24), 9, function () {
            if (good) { sim.score[ta] += cv.pen ? 3 : 2; sim.changed = true; if (cv.pen) sim.stats.penGoals++; }
            sim.ball.owner = null;
          });
          cv.landed = false;
        }
        if (cv.kicked && !sim.ball.fly && !cv.landed) { cv.landed = true; cv.after = sim.pt + 1.1; }
        if (cv.landed && sim.pt > cv.after) { if (cv.pen && !cv.good) startKickoff(other(ta), true); else startKickoff(other(ta)); }   // a missed penalty goes dead: 22 drop-out
        else if (!cv.kicked && sim.pt > 7) { cv.kicked = true; cv.landed = true; cv.after = sim.pt; }
        return;
      }
    }

    /* ---------- movement ---------- */
    function movePlayer(p, dt, hustle) {
      var dx = p.tx - p.x, dy = p.ty - p.y, dist = hyp(dx, dy);
      var rec = dist > TUNE.recoverFrom ? Math.min(TUNE.recover, 1 + (dist - TUNE.recoverFrom) * TUNE.recoverSlope) : 1;   // out of position: sprint back
      var maxv = p.max * (p.slow > 0 ? 0.35 : 1) * (hustle ? TUNE.hustle : 1) * (p.burst ? 1.18 : 1) * (p.carrying ? TUNE.carrierSpeed : 1) * (p.hurry ? TUNE.hurry : 1) * rec; if (p.slow > 0) p.slow -= dt;
      var want = Math.min(maxv, dist * 3.2);
      var dvx = dist > 0.01 ? dx / dist * want : 0, dvy = dist > 0.01 ? dy / dist * want : 0;
      var acc = 20 * dt, ax = dvx - p.vx, ay = dvy - p.vy, am = hyp(ax, ay);
      if (am > acc) { ax = ax / am * acc; ay = ay / am * acc; }
      p.vx += ax; p.vy += ay; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    function separate(dt, phase) {
      var packed = phase === 'ruck' || phase === 'scrum' || phase === 'lineout' || phase === 'maul';
      var minD = packed ? 0.95 : 1.7, P = sim.players, n = P.length;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d = hyp(dx, dy);
          if (d < minD && d > 0.001) {
            var push = (minD - d) * 4 * dt / d;
            P[i].x -= dx * push; P[i].y -= dy * push; P[j].x += dx * push; P[j].y += dy * push;
          }
        }
      }
    }

    sim.step = function (dt) {
      dt = Math.min(dt, 0.05);
      sim.time += dt;
      var j;
      for (j = 0; j < sim.players.length; j++) sim.players[j].hurry = false;
      updatePhase(dt);
      // nobody stands still: everyone shuffles, tracks the play and stays on their toes (less so inside a pack)
      var packed = sim.phase === 'ruck' || sim.phase === 'scrum' || sim.phase === 'lineout' || sim.phase === 'maul';
      for (j = 0; j < sim.players.length; j++) {
        var pl = sim.players[j];
        // in a lineout the anchor sits at the touchline, well away from the line itself, so
        // check discipline (roles 1-8) directly rather than distance to the anchor
        var lineoutTight = sim.phase === 'lineout' && pl.role < 8;
        var near = packed && (lineoutTight || hyp(pl.tx - sim.anchor.x, pl.ty - sim.anchor.y) < 3.2), amp = TUNE.sway * (near ? 0.25 : 1);
        if (pl === sim.carrier) continue;
        pl.tx = clamp(pl.tx + Math.sin(sim.time * pl.w + pl.ph) * amp, 0.5, LEN - 0.5);
        pl.ty = clamp(pl.ty + Math.cos(sim.time * pl.w * 0.83 + pl.ph * 1.7) * amp * 1.3, 0.5, WID - 0.5);
      }
      sim.ref.tx += Math.sin(sim.time * 1.7) * 0.6; sim.ref.ty += Math.cos(sim.time * 1.3) * 0.6;
      var i;
      var hustle = sim.phase === 'kickoff_setup' || sim.phase === 'try' || sim.phase === 'conversion' || sim.phase === 'penalty';
      for (i = 0; i < sim.players.length; i++) { sim.players[i].carrying = sim.players[i] === sim.carrier; sim.players[i].burst = sim.players[i].carrying && sim.players[i].immune > 0; movePlayer(sim.players[i], dt, hustle); }
      separate(dt, sim.phase);
      // referee
      var rf = sim.ref, rd = hyp(rf.tx - rf.x, rf.ty - rf.y), rs = Math.min(5.8, rd * 2.5);
      if (rd > 0.05) { rf.vx += ((rf.tx - rf.x) / rd * rs - rf.vx) * Math.min(1, dt * 6); rf.vy += ((rf.ty - rf.y) / rd * rs - rf.vy) * Math.min(1, dt * 6); }
      else { rf.vx *= 0.8; rf.vy *= 0.8; }
      rf.x += rf.vx * dt; rf.y += rf.vy * dt;
      // ball
      var b = sim.ball;
      if (b.fly) {
        var f = b.fly; f.t += dt; var u = Math.min(1, f.t / f.dur);
        b.x = f.x0 + (f.x1 - f.x0) * u; b.y = f.y0 + (f.y1 - f.y0) * u; b.h = 4 * f.peak * u * (1 - u);
        if (u >= 1) { var cb = f.land; b.fly = null; b.h = 0; if (cb) cb(); }
      } else if (b.owner) {
        var o = b.owner, sp = hyp(o.vx, o.vy), fx = sp > 0.3 ? o.vx / sp : dirOf(o.team), fy = sp > 0.3 ? o.vy / sp : 0;
        b.x = o.x + fx * 0.9; b.y = o.y + fy * 0.9; b.h = 0;
      }
      b.x = clamp(b.x, 0, LEN); b.y = clamp(b.y, 0, WID);
      if (b.fly) {   // a short fading trail behind the ball while it's in flight, so a pass or kick is easy to follow through a crowded breakdown
        sim.ballTrail.push({ x: b.x, y: b.y, h: b.h, t: sim.time });
        var trailCut = sim.time - 0.35;
        while (sim.ballTrail.length && sim.ballTrail[0].t < trailCut) sim.ballTrail.shift();
      } else if (sim.ballTrail.length) {
        sim.ballTrail.length = 0;
      }
      for (i = sim.pulses.length - 1; i >= 0; i--) { sim.pulses[i].t += dt; if (sim.pulses[i].t > sim.pulses[i].dur) sim.pulses.splice(i, 1); }
      for (i = 0; i < sim.players.length; i++) { var q = sim.players[i]; q.x = clamp(q.x, 0.4, LEN - 0.4); q.y = clamp(q.y, 0.4, WID - 0.4); }
    };

    // start: kickoff, Reds kick
    startKickoff(0);
    // place everyone near their kickoff spots so the first frame looks like a game
    setKickoffTargets();
    sim.players.forEach(function (p) { p.x = p.tx; p.y = p.ty; });
    sim.ref.x = sim.ref.tx; sim.ref.y = sim.ref.ty;
    return sim;
  }

  /* =====================================================================
     DRAWING
     ===================================================================== */
  function makeLayout(w, h) {
    var vertical = h > w * 0.95, margin = 0.965;
    var scale = (vertical ? Math.min(w / WID, h / LEN) : Math.min(w / LEN, h / WID)) * margin;
    var pw = (vertical ? WID : LEN) * scale, ph = (vertical ? LEN : WID) * scale;
    var ox = (w - pw) / 2, oy = (h - ph) / 2;
    return {
      w: w, h: h, vertical: vertical, scale: scale, ox: ox, oy: oy,
      P: function (x, y) { return vertical ? [ox + y * scale, oy + x * scale] : [ox + x * scale, oy + y * scale]; }
    };
  }

  function poly(ctx, lay, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) { var p = lay.P(pts[i][0], pts[i][1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
  }
  function seg(ctx, lay, x0, y0, x1, y1) { var a = lay.P(x0, y0), b = lay.P(x1, y1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }

  function drawBase(ctx, lay) {
    var s = lay.scale, i, p;
    // turf
    poly(ctx, lay, [[0, 0], [LEN, 0], [LEN, WID], [0, WID]]);
    ctx.fillStyle = '#0E1A31'; ctx.fill();
    // mowing stripes every 10 m
    for (i = 0; i < 12; i += 2) {
      poly(ctx, lay, [[i * 10, 0], [(i + 1) * 10, 0], [(i + 1) * 10, WID], [i * 10, WID]]);
      ctx.fillStyle = 'rgba(255,255,255,0.028)'; ctx.fill();
    }
    // in-goal areas
    [[0, TRY0], [TRY1, LEN]].forEach(function (g) {
      poly(ctx, lay, [[g[0], 0], [g[1], 0], [g[1], WID], [g[0], WID]]);
      ctx.fillStyle = 'rgba(168,31,43,0.10)'; ctx.fill();
    });
    var lw = Math.max(1.1, 0.34 * s);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    // solid lines
    ctx.strokeStyle = 'rgba(' + COL.line + ',0.62)'; ctx.lineWidth = lw; ctx.setLineDash([]);
    ctx.beginPath();
    poly(ctx, lay, [[0, 0], [LEN, 0], [LEN, WID], [0, WID], [0, 0]]);
    seg(ctx, lay, TRY0, 0, TRY0, WID); seg(ctx, lay, TRY1, 0, TRY1, WID);
    seg(ctx, lay, 32, 0, 32, WID); seg(ctx, lay, 88, 0, 88, WID); seg(ctx, lay, MID, 0, MID, WID);
    ctx.stroke();
    // dashed lines: 10 m, 5 m from goal lines, 5 m and 15 m from touch
    ctx.strokeStyle = 'rgba(' + COL.line + ',0.36)'; ctx.setLineDash([1.7 * s, 1.5 * s]);
    ctx.beginPath();
    seg(ctx, lay, 50, 0, 50, WID); seg(ctx, lay, 70, 0, 70, WID);
    seg(ctx, lay, 15, 3, 15, WID - 3); seg(ctx, lay, 105, 3, 105, WID - 3);
    seg(ctx, lay, 15, 5, 105, 5); seg(ctx, lay, 15, WID - 5, 105, WID - 5);
    seg(ctx, lay, 15, 15, 105, 15); seg(ctx, lay, 15, WID - 15, 105, WID - 15);
    ctx.stroke(); ctx.setLineDash([]);
    // halfway mark
    ctx.strokeStyle = 'rgba(' + COL.line + ',0.5)'; ctx.lineWidth = lw;
    ctx.beginPath(); seg(ctx, lay, MID - 1.3, 35, MID + 1.3, 35); seg(ctx, lay, MID, 33.7, MID, 36.3); ctx.stroke();
    // goal posts (plan view): two uprights joined by the crossbar
    [TRY0, TRY1].forEach(function (x) {
      var a = lay.P(x, 35 - 2.8), b = lay.P(x, 35 + 2.8);
      ctx.strokeStyle = 'rgba(' + COL.line + ',0.85)'; ctx.lineWidth = Math.max(1.4, 0.3 * s);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      [a, b].forEach(function (q) {
        ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2.2, 0.62 * s), 0, 6.2832);
        ctx.fillStyle = 'rgb(' + COL.line + ')'; ctx.fill();
        ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(3.6, 1.05 * s), 0, 6.2832);
        ctx.strokeStyle = 'rgba(' + COL.line + ',0.3)'; ctx.lineWidth = 1; ctx.stroke();
      });
    });
    // corner flags
    [[TRY0, 0], [TRY0, WID], [TRY1, 0], [TRY1, WID]].forEach(function (c) {
      p = lay.P(c[0], c[1]); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, 0.6 * s), 0, 6.2832);
      ctx.fillStyle = COL.red; ctx.fill(); ctx.strokeStyle = 'rgba(' + COL.line + ',0.8)'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  function drawFrame(ctx, sim, lay) {
    var s = lay.scale, i, p, r = Math.max(3.4, 0.95 * s);
    // pulses (whistle / tackle rings)
    for (i = 0; i < sim.pulses.length; i++) {
      var pu = sim.pulses[i], u = pu.t / pu.dur, c = lay.P(pu.x, pu.y);
      ctx.beginPath(); ctx.arc(c[0], c[1], (1.2 + u * (pu.type === 'whistle' ? 6 : 3.2)) * s, 0, 6.2832);
      ctx.strokeStyle = pu.type === 'whistle' ? 'rgba(111,211,162,' + (0.7 * (1 - u)) + ')' : 'rgba(246,243,238,' + (0.55 * (1 - u)) + ')';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    // players (labelled with their shirt number, 1-15)
    ctx.font = '700 ' + Math.max(6.5, r * 1.15).toFixed(1) + 'px "Hanken Grotesk", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineCap = 'round';
    var CAPS = { 0: [4, 5, 15], 1: [4, 6, 13] };   // jersey numbers who wear a scrum cap, per team
    for (i = 0; i < sim.players.length; i++) {
      var pl = sim.players[i]; p = lay.P(pl.x, pl.y);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832);
      ctx.fillStyle = pl.team === 0 ? COL.red : COL.white; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = pl.team === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(10,17,32,0.45)'; ctx.stroke();
      if (CAPS[pl.team].indexOf(pl.role + 1) > -1) {   // scrum cap: a padded band over the crown
        ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.82, Math.PI * 1.08, Math.PI * 1.92);
        ctx.lineWidth = Math.max(1.2, r * 0.4); ctx.strokeStyle = 'rgba(17,24,39,0.88)'; ctx.stroke();
      }
      ctx.fillStyle = pl.team === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(10,17,32,0.85)';
      ctx.fillText(String(pl.role + 1), p[0], p[1] + r * 0.05);
    }
    // ball carrier ring
    if (sim.carrier) {
      p = lay.P(sim.carrier.x, sim.carrier.y);
      ctx.beginPath(); ctx.arc(p[0], p[1], r + 3, 0, 6.2832); ctx.strokeStyle = 'rgba(232,184,74,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    // referee (diamond)
    p = lay.P(sim.ref.x, sim.ref.y); var rr = r * 1.15;
    ctx.beginPath(); ctx.moveTo(p[0], p[1] - rr); ctx.lineTo(p[0] + rr, p[1]); ctx.lineTo(p[0], p[1] + rr); ctx.lineTo(p[0] - rr, p[1]); ctx.closePath();
    ctx.fillStyle = COL.ref; ctx.fill(); ctx.strokeStyle = 'rgba(10,17,32,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    // ball trail: a short fading arc of dots behind the ball while it's in flight
    if (sim.ballTrail && sim.ballTrail.length > 1) {
      for (i = 0; i < sim.ballTrail.length - 1; i++) {
        var tp = sim.ballTrail[i], tu = clamp(1 - (sim.time - tp.t) / 0.35, 0, 1), tc = lay.P(tp.x, tp.y);
        ctx.beginPath(); ctx.arc(tc[0], tc[1] - tp.h * s * 0.55, r * 0.34 * tu, 0, 6.2832);
        ctx.fillStyle = 'rgba(232,184,74,' + (0.4 * tu) + ')'; ctx.fill();
      }
    }
    // ball (with shadow when kicked or passed)
    var b = sim.ball; p = lay.P(b.x, b.y);
    var lift = b.h * s * 0.55, ang = Math.atan2(lay.vertical ? 1 : 0.2, lay.vertical ? 0.2 : 1);
    if (b.h > 0.2) { ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 0.62, r * 0.42, 0, 0, 6.2832); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(p[0], p[1] - lift, r * 0.78 * (1 + b.h * 0.03), r * 0.52 * (1 + b.h * 0.03), lay.vertical ? Math.PI / 2 : 0, 0, 6.2832);
    ctx.fillStyle = COL.ball; ctx.fill(); ctx.strokeStyle = 'rgba(10,17,32,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  }

  /* =====================================================================
     BROWSER WIRING
     ===================================================================== */
  function init() {
    var canvas = document.getElementById('pitch');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d'), base = document.createElement('canvas');
    var sim = createSim(), lay = null, dpr = 1, raf = 0, last = 0, onScreen = true;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var scoreEl = document.getElementById('pitch-score');

    function paint() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(ctx, sim, lay);
    }
    function resize() {
      var r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      base.width = canvas.width; base.height = canvas.height;
      lay = makeLayout(r.width, r.height);
      var b = base.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, r.width, r.height); drawBase(b, lay);
      paint();
    }
    function showScore() {
      if (!scoreEl || !sim.changed) return; sim.changed = false;
      scoreEl.textContent = 'Reds ' + sim.score[0] + ' \u2013 ' + sim.score[1] + ' Whites';
    }
    function frame(ts) {
      raf = 0; if (!onScreen || document.hidden) return;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016; last = ts;
      sim.step(dt); paint(); showScore(); raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !reduce && onScreen && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }

    resize();
    if (reduce) { for (var i = 0; i < 500; i++) sim.step(0.05); paint(); showScore(); }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; if (onScreen) start(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', start);
    start();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }

  return { TUNE: TUNE, createSim: createSim, makeLayout: makeLayout, drawBase: drawBase, drawFrame: drawFrame };
});
