/* Jacklers hero pitch  (version 6: numbered 1-15, each position holds its real
   place and role - tight five close to the ball, loose forwards linking wide,
   half-backs and centres flat, wings on the touchline, full-back sweeping deep
   - and a calmer pace so the shape reads clearly while defenders track back.)
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
  var TUNE = { sway: 0.75, hurry: 1.6, hustle: 1.6, recover: 1.4, recoverFrom: 6, recoverSlope: 0.04, teamRun: 5, teamRunMax: 14, missRedZone: 0.7, lineDepth: 9.5, lineSpeed: 1.6, momentum: 2.6, kickOwn: 0.32, kickOpp: 0.12, pass: 0.74, missTackle: 0.4, knockOn: 0.006, turnover: 0.05, penalty: 0.02, box: 0.16, carrierSpeed: 1.1, breakRun: 1.4 };
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
      ball: { x: 60, y: 35, h: 0, owner: null, fly: null },
      phase: 'kickoff_setup', pt: 0, poss: 0, score: [0, 0], flip: 1, time: 0, nextHalf: 140,
      pulses: [], carrier: null, anchor: { x: 60, y: 35 }, dec: 0, d: {}, changed: false,
      stats: { passes: 0, kicks: 0, chips: 0, tackles: 0, tries: 0, offloads: 0 }
    };
    for (var t = 0; t < 2; t++) {
      for (var r = 0; r < 15; r++) {
        var p = { w: R(1.5, 2.4), ph: R(0, 6.28), hurry: false, team: t, role: r, x: 60, y: 35, vx: 0, vy: 0, tx: 60, ty: 35, max: (r < 8 ? 5.0 : 6.0) + R(-0.3, 0.4),
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
    function attackShape(team, ax, ay, skip) {
      var d = dirOf(team), os = ay < WID / 2 ? 1 : -1, P = sim.teams[team];
      P.forEach(function (p) {
        if (skip && skip.indexOf(p) > -1) return;
        if (p.role === 8) { go(p, ax - d * 2.6 + p.jx * 0.2, ay + os * 1.2); return; }                          // 9 scrum-half: snipes at the base
        if (p.role === 9) { go(p, ax - d * (2.6 + p.jx * 0.3), ay + os * (5.5 + p.jy * 0.6)); return; }         // 10 fly-half: flat, first receiver
        if (p.role === 11) { go(p, ax - d * (3.6 + p.jx * 0.3), ay + os * (11 + p.jy * 0.6)); return; }         // 12 inside centre
        if (p.role === 12) { go(p, ax - d * (4.6 + p.jx * 0.3), ay + os * (17.5 + p.jy * 0.6)); return; }       // 13 outside centre: drifts wider
        if (p.role === 10) { go(p, ax - d * (5.5 + p.jx * 0.3), clamp(3 + p.jy, 1.5, WID / 2 - 1)); return; }   // 11 left wing: holds the near touchline
        if (p.role === 13) { go(p, ax - d * (5.5 + p.jx * 0.3), clamp(WID - 3 + p.jy, WID / 2 + 1, WID - 1.5)); return; } // 14 right wing: holds the far touchline
        if (p.role === 14) { go(p, ax - d * (11 + p.jy * 0.4), clamp(WID / 2 + (ay - WID / 2) * 0.3 + p.jx * 3, 6, WID - 6)); return; } // 15 full-back: trails, covering
        if (p.role < 5) { go(p, ax - d * (1.6 + (p.role % 3) * 1.1 + p.jx * 0.25), ay + (p.role - 2) * 1.9 + p.jy * 0.35); return; }      // tight five: hug the ball
        go(p, ax - d * (3.6 + (p.role - 5) * 1.3 + p.jx * 0.3), ay + (p.role - 6) * 4.4 * os * 0.4 + p.jy * 0.45);                        // 6/7/8: loose forwards link wider
      });
    }
    function defenceShape(team, ax, ay, depth, skip) {
      var da = dirOf(other(team)), lineX = ax + da * depth;
      var P = sim.teams[team].filter(function (p) { return (!skip || skip.indexOf(p) < 0); });
      var backRoles = [10, 13, 14];   // 11, 14, 15: the back three drop off the front line to cover
      var line = P.filter(function (p) { return backRoles.indexOf(p.role) < 0; }).sort(function (a, b) { return a.y - b.y; });
      var back = P.filter(function (p) { return backRoles.indexOf(p.role) > -1; });
      var n = line.length, span = 46;
      line.forEach(function (p, i) {
        var u = n > 1 ? i / (n - 1) : 0.5;
        go(p, lineX + da * (((i % 2) * 0.8) + p.jx * 0.15), clamp(ay + (u - 0.5) * span, 3, WID - 3));
      });
      back.forEach(function (p) {
        if (p.role === 14) { go(p, lineX + da * 15, clamp(ay + (ay < WID / 2 ? 6 : -6), 8, WID - 8)); return; }   // 15 full-back: deepest, sweeps behind
        var side = p.role === 10 ? -1 : 1;                                                                        // 11 covers the left edge, 14 the right
        go(p, lineX + da * 9, clamp(WID / 2 + side * 22, 4, WID - 4));
      });
    }
    function refFollow(x, y, d) {
      var side = sim.d.refSide || 1;
      sim.ref.tx = clamp(x - d * 9, 3, LEN - 3); sim.ref.ty = clamp(y + side * 9, 2, WID - 2);
    }

    /* ---------- phase starters ---------- */
    function startKickoff(kt) {
      if (sim.time > sim.nextHalf) { sim.flip *= -1; sim.nextHalf += 140; }
      sim.d = { kt: kt, refSide: rand() < 0.5 ? 1 : -1 };
      loose(MID, WID / 2);
      sim.carrier = null;
      setPhase('kickoff_setup');
    }
    function setKickoffTargets() {
      var kt = sim.d.kt, rt = other(kt), dk = dirOf(kt);
      sim.teams[kt].forEach(function (p) {
        if (p.role === 9) { go(p, MID - dk * 0.4, WID / 2); return; }
        go(p, MID - dk * (1.2 + (p.role % 3) * 0.8), 5 + (p.role / 14) * 60);
      });
      var fw = [8, 14, 20, 26, 32, 38, 44, 50, 56];
      sim.teams[rt].forEach(function (p) {
        if (p.role < 8) go(p, MID + dk * (11.5 + (p.role % 2) * 1.5), 9 + p.role * 7.5);
        else { var k = p.role - 8; go(p, MID + dk * (22 + k * 3), [30, 22, 48, 12, 58, 28, 35][k]); }
      });
      sim.ref.tx = MID - dk * 4; sim.ref.ty = 26;
    }
    function startOpen(team, carrier, forcePass, noKick) {
      sim.poss = team; giveBall(carrier);
      sim.d = { refSide: sim.d.refSide || 1, forcePass: !!forcePass, age: 0, baseX: carrier.x, kickChecked: !!noKick };
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
      sim.d = { down: sim.d.down, tackler: tackler, ra: fa.slice(0, 3), rd: [tackler].concat(fd.slice(0, 2)),
                dur: R(1.9, 2.8), refSide: sim.d.refSide };
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
      sim.d = { dur: 3.4, thrown: false, refSide: sim.d.refSide };
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('lineout');
    }
    function startPenalty(benef, x, y) {
      sim.poss = benef;
      sim.anchor = { x: clamp(x, 14, 106), y: clamp(y, 4, 66) };
      loose(sim.anchor.x, sim.anchor.y); sim.carrier = null;
      sim.d = { dur: 2.4, refSide: sim.d.refSide };
      pulse('whistle', sim.ref.x, sim.ref.y);
      setPhase('penalty');
    }
    function startKick(carrier, toTouch, kind) {
      kind = kind || 'long';
      var a = carrier.team, d = dirOf(a), b = sim.ball, lx, ly, ct, touch = !!toTouch, peak = 11, spd = 21;
      if (kind === 'chip') {
        var toTry = d > 0 ? TRY1 - carrier.x : carrier.x - TRY0;
        lx = toTry < 22 ? (d > 0 ? TRY1 : TRY0) + d * R(-1.5, 3) : clamp(carrier.x + d * R(9, 17), 12, 108);
        ly = clamp(carrier.y + R(-7, 7), 5, WID - 5); peak = 6; spd = 14; touch = false;
      }
      else if (kind === 'box') { lx = clamp(carrier.x + d * R(17, 28), 12, 108); ly = clamp(carrier.y + R(-12, 12), 4, WID - 4); peak = 14; spd = 15; touch = false; }
      else { lx = clamp(carrier.x + d * R(26, 46), 14, 106); ly = clamp(carrier.y + R(-20, 20), 5, WID - 5); touch = touch || rand() < 0.26; if (touch) ly = carrier.y < WID / 2 ? 0 : WID; }
      b.x = carrier.x; b.y = carrier.y; sim.carrier = null;
      var dist = hyp(lx - b.x, ly - b.y);
      var mates = sim.teams[a].filter(function (p) { return p !== carrier && p.role >= 9; });
      var foes = sim.teams[other(a)].filter(function (p) { return p.role >= 8; });
      if (kind === 'chip') ct = rand() < 0.55 ? nearest(mates, lx, ly) : nearest(foes, lx, ly);
      else if (kind === 'box') ct = rand() < 0.4 ? nearest(sim.teams[a].filter(function (p) { return p !== carrier && p.role < 12; }), lx, ly) : nearest(foes, lx, ly);
      else ct = nearest(foes, lx, ly);
      sim.d = { kicker: carrier, kx: carrier.x, land: { x: lx, y: ly }, touch: touch, catcher: ct, refSide: sim.d.refSide };
      sim.stats.kicks++; if (kind === 'chip') sim.stats.chips++;
      fly(lx, ly, Math.max(1.0, dist / spd), peak, function () {
        if (touch) { startLineout(other(a), lx, ly); return; }
        var cc = sim.d.catcher, inGoal = lx > TRY1 - 0.5 || lx < TRY0 + 0.5;
        if (kind === 'chip' && inGoal && cc.team === a) { startTry(cc); return; }   // regathered and grounded
        startOpen(cc.team, cc, false, true);   // no instant return kick: counter-attack
      });
      setPhase('kick');
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
    function tryPass(c) {
      var a = c.team, d = dirOf(a), cands = [], wsum = 0;
      sim.teams[a].forEach(function (r) {
        if (r === c) return;
        var back = (c.x - r.x) * d, dist = hyp(r.x - c.x, r.y - c.y);
        if (back >= -0.4 && dist >= 3.5 && dist <= 19) {
          var w = r.role >= 9 && r.role <= 12 ? 3 : r.role >= 13 ? 2 : 1; cands.push([r, w]); wsum += w;
        }
      });
      if (!cands.length) return false;
      var pick = rand() * wsum, r = cands[0][0];
      for (var i = 0; i < cands.length; i++) { pick -= cands[i][1]; if (pick <= 0) { r = cands[i][0]; break; } }
      var dist = hyp(r.x - c.x, r.y - c.y), dur = Math.max(0.28, dist / 15.5);
      var lx = r.x + r.vx * dur * 0.8, ly = r.y + r.vy * dur * 0.8;
      sim.ball.x = c.x; sim.ball.y = c.y; sim.carrier = null;
      sim.d.receiver = r; sim.stats.passes++;
      fly(lx, ly, dur, 1.6, function () {
        sim.d.forcePass = false;
        if (rand() < TUNE.knockOn) { // knock-on: scrum to the other side
          startScrum(other(a), r.x, r.y); return;
        }
        giveBall(r); sim.dec = R(0.3, 0.75);
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
          var lx = MID + dk * R(24, 34), ly = R(14, 56);
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
        var kx = sim.d.kx !== undefined ? sim.d.kx : MID;
        sim.teams[kt2].forEach(function (p, k) {
          if (p === sim.d.kicker) { go(p, land.x - dk2 * 6, land.y + (p.y < land.y ? -3 : 3)); return; }
          if (ph === 'kick' && (p.x - kx) * dk2 > 1) {           // ahead of the kicker = offside: sprint back behind him
            go(p, kx - dk2 * (1.5 + (k % 4) * 1.4), p.y + (35 - p.y) * 0.1); p.hurry = true; return;
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
        if (!c) { // a pass is in the air: keep shape around the ball and let the receiver run on to it
          var pa0 = sim.poss, d0 = dirOf(pa0), rc = sim.d.receiver;
          sim.d.age = (sim.d.age || 0) + dt;
          attackShape(pa0, sim.d.baseX + d0 * Math.min(sim.d.age * TUNE.teamRun, TUNE.teamRunMax), b.y, rc ? [rc] : null);
          defenceShape(other(pa0), sim.d.baseX, b.y, TUNE.lineDepth - Math.min(sim.d.age * TUNE.lineSpeed, 6), null);
          if (rc) go(rc, b.x + d0 * 4, b.y);
          go(nearest(sim.teams[other(pa0)], b.x, b.y), b.x + d0 * 2, b.y);
          refFollow(b.x, b.y, d0);
          return;
        }
        var a = c.team, d = dirOf(a), def = other(a);
        sim.d.age = (sim.d.age || 0) + dt;
        c.immune -= dt;
        // carrier runs at the line, drifting to space
        var open = c.y < WID / 2 ? 1 : -1;
        if (c.immune > 0) go(c, c.x + d * 24, c.y + (c.y < WID / 2 ? 1 : -1) * 3); else go(c, c.x + d * 9, c.y + open * 2.2);
        attackShape(a, sim.d.baseX + d * Math.min(sim.d.age * TUNE.teamRun, TUNE.teamRunMax), c.y, [c]);
        defenceShape(def, sim.d.baseX, c.y, TUNE.lineDepth - Math.min(sim.d.age * TUNE.lineSpeed, 6), null);
        sim.teams[def].forEach(function (q) {
          q.hurry = (q.x - c.x) * d < 0.5;
          if (q.hurry) {                                            // beaten: turn and cut the runner off
            var gap = hyp(q.x - c.x, q.y - c.y), T = clamp(gap / (q.max * TUNE.hurry), 0.3, 3);
            go(q, c.x + c.vx * T + d * 1.5, c.y + c.vy * T);
          }
        });
        var chaser = nearest(sim.teams[def], c.x, c.y);
        if (hyp(chaser.x - c.x, chaser.y - c.y) < 5) go(chaser, c.x + d * 0.6, c.y);
        refFollow(c.x, c.y, d);
        // try
        if ((d > 0 && c.x >= TRY1) || (d < 0 && c.x <= TRY0)) { startTry(c); return; }
        // out of play
        if (c.y <= 0.7 || c.y >= WID - 0.7) { startLineout(def, c.x, c.y < WID / 2 ? 0 : WID); return; }
        // decisions
        sim.dec -= dt;
        if (sim.dec <= 0) {
          var zone = (c.x - MID) * d, toGo = d > 0 ? TRY1 - c.x : c.x - TRY0;
          if (!sim.d.forcePass && !sim.d.kickChecked) {   // one chance per possession to put boot to ball
            sim.d.kickChecked = true;
            var kp = toGo > 18 ? (zone < 8 ? TUNE.kickOwn : TUNE.kickOpp) : 0;
            if (rand() < kp) { startKick(c, false, toGo < 38 ? 'chip' : zone < 6 ? (rand() < 0.75 ? 'long' : 'chip') : (rand() < 0.6 ? 'chip' : 'long')); return; }
          }
          if (sim.d.forcePass || rand() < (toGo < 15 ? 0.55 : TUNE.pass)) { if (!tryPass(c)) sim.dec = R(0.2, 0.45); }
          else sim.dec = R(0.4, 0.8);
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
          if (rand() < (toLine < 24 ? TUNE.missRedZone : TUNE.missTackle)) { c.immune = TUNE.breakRun; near.slow = 1.1; }
          else if (rand() < 0.2 && tryPass(c)) { sim.stats.offloads++; near.slow = 0.6; return; }
          else { sim.d.down = c; startRuck(c.x, c.y, near); return; }
        }
        if (sim.d.age > 7.5) { sim.d.down = c; startRuck(c.x, c.y, nearest(sim.teams[def], c.x, c.y)); }
        return;
      }

      if (ph === 'ruck') {
        var A = sim.poss, dd = dirOf(A), an = sim.anchor;
        sim.d.down && go(sim.d.down, an.x, an.y);
        sim.d.ra.forEach(function (p, k) { go(p, an.x - dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1); });
        sim.d.rd.forEach(function (p, k) { go(p, an.x + dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1); });
        var skipA = sim.d.ra.concat(sim.d.down ? [sim.d.down] : []);
        attackShape(A, an.x, an.y, skipA);
        defenceShape(other(A), an.x, an.y, 6, sim.d.rd);
        var sh = sim.teams[A][8]; if (skipA.indexOf(sh) < 0) go(sh, an.x - dd * 2.2, an.y + 0.6);
        sim.teams[A].forEach(function (p) { if (skipA.indexOf(p) < 0 && (p.x - an.x) * dd > -1.2) p.hurry = true; });
        sim.teams[other(A)].forEach(function (p) { if (sim.d.rd.indexOf(p) < 0 && (p.x - an.x) * dd < 1.2) p.hurry = true; });
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
            if (rand() < TUNE.box && (dd > 0 ? TRY1 - an.x : an.x - TRY0) > 22) { sim.poss = A; sim.carrier = half; sim.ball.owner = half; startKick(half, false, 'box'); }
            else startOpen(A, half, true);
          }
        }
        return;
      }

      if (ph === 'scrum') {
        var F = sim.poss, df = dirOf(F), sa = sim.anchor;
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
        if (sim.pt > sim.d.dur) { sh2.x = sa.x - df * 0.6; sh2.y = sa.y + 1.6; sh2.vx = sh2.vy = 0; startOpen(F, sh2, true); }
        return;
      }

      if (ph === 'lineout') {
        var T = sim.poss, dt2 = dirOf(T), la = sim.anchor, sg = la.y < WID / 2 ? 1 : -1;
        for (i = 0; i < 7; i++) {
          go(sim.teams[T][i], la.x - 0.55, la.y + sg * (5 + i * 1.35));
          go(sim.teams[other(T)][i], la.x + 0.55, la.y + sg * (5 + i * 1.35));
        }
        go(sim.teams[T][7], la.x - dt2 * 3, la.y + sg * 4);
        go(sim.teams[other(T)][7], la.x + dt2 * 3, la.y + sg * 5);
        go(sim.teams[T][8], la.x - dt2 * 4, la.y + sg * 9);
        go(sim.teams[other(T)][8], la.x + dt2 * 4, la.y + sg * 9);
        [9, 10, 11, 12, 13, 14].forEach(function (rle, k) {
          go(sim.teams[T][rle], la.x - dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
          go(sim.teams[other(T)][rle], la.x + dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
        });
        sim.players.forEach(function (p) { if (p.role >= 9) p.hurry = true; });
        go(sim.teams[T][1], la.x - 0.3, la.y + sg * 1.1); // 2 hooker stands at the mark to throw in
        sim.ref.tx = la.x; sim.ref.ty = la.y + sg * 3;
        if (!sim.d.thrown && sim.pt > 1.7) {
          sim.d.thrown = true; b.x = la.x; b.y = la.y;
          var jumper = sim.teams[T][3 + Math.floor(rand() * 4)]; // a lock or flanker (4-7) jumps
          fly(la.x - 0.55, la.y + sg * (5 + jumper.role * 1.35), 0.55, 4.5, function () { sim.ball.owner = jumper; });
        }
        if (sim.pt > sim.d.dur) {
          var half2 = sim.teams[T][8]; half2.vx = half2.vy = 0;
          startOpen(T, half2, true);
        }
        return;
      }

      if (ph === 'penalty') {
        var pa2 = sim.anchor, Bn = sim.poss, dB = dirOf(Bn);
        var tapper = nearest(sim.teams[Bn], pa2.x, pa2.y);
        attackShape(Bn, pa2.x, pa2.y, [tapper]);
        go(tapper, pa2.x, pa2.y);
        sim.teams[other(Bn)].forEach(function (p) {          // offenders retreat ten metres, sprinting
          go(p, pa2.x + dB * (10.5 + (p.role % 3)), clamp(pa2.y + (p.role - 7) * 4, 3, WID - 3));
          if ((p.x - pa2.x) * dB < 10) p.hurry = true;
        });
        sim.ref.tx = pa2.x - dirOf(Bn) * 3; sim.ref.ty = pa2.y + 5;
        if (sim.pt > sim.d.dur) {
          if (rand() < 0.5) { tapper.x = pa2.x; tapper.y = pa2.y; tapper.vx = tapper.vy = 0; startOpen(Bn, tapper, false); }
          else { sim.d = { refSide: sim.d.refSide }; b.x = tapper.x; b.y = tapper.y; startKick(tapper, true); }
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
          else go(p, MID + dtv * 8, 8 + p.role * 3.6);
        });
        sim.ref.tx = cv.mark.x + dtv * 6; sim.ref.ty = cv.mark.y + 6;
        if (!cv.kicked && sim.pt > 2.3 && hyp(cv.kicker.x - cv.mark.x, cv.kicker.y - cv.mark.y) < 1.5) {
          cv.kicked = true; b.x = cv.kicker.x; b.y = cv.kicker.y; b.owner = null;
          var good = rand() < 0.68;
          var ty = good ? 35 + R(-1.2, 1.2) : 35 + (rand() < 0.5 ? -1 : 1) * R(3.6, 5.5);
          fly(tx, ty, 1.5, 9, function () {
            if (good) { sim.score[ta] += 2; sim.changed = true; }
            sim.ball.owner = null;
          });
          cv.landed = false;
        }
        if (cv.kicked && !sim.ball.fly && !cv.landed) { cv.landed = true; cv.after = sim.pt + 1.1; }
        if (cv.landed && sim.pt > cv.after) startKickoff(other(ta));
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
      var packed = phase === 'ruck' || phase === 'scrum' || phase === 'lineout';
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
      var packed = sim.phase === 'ruck' || sim.phase === 'scrum' || sim.phase === 'lineout';
      for (j = 0; j < sim.players.length; j++) {
        var pl = sim.players[j], near = packed && hyp(pl.tx - sim.anchor.x, pl.ty - sim.anchor.y) < 3.2, amp = TUNE.sway * (near ? 0.25 : 1);
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
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < sim.players.length; i++) {
      var pl = sim.players[i]; p = lay.P(pl.x, pl.y);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832);
      ctx.fillStyle = pl.team === 0 ? COL.red : COL.white; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = pl.team === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(10,17,32,0.45)'; ctx.stroke();
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
