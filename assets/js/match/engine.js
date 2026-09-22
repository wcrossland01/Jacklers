/* Jacklers Match Engine — the match itself.
   A finite-state simulation of a rugby union match: kick-off, phases of
   open play, rucks, set pieces, kicks, scores, half-time and full-time.
   The fine-grained "phase" (what's happening physically, right now) and
   the broadcast-level "state" (what a viewer would call it) are related
   but distinct: several phases (kickoff_setup/kickoff_flight) map to one
   state (KICKOFF).

   This is deliberately one module: every phase here shares one mutable
   match context (whose ball it is, where the breakdown is, how long
   until it resolves) the way a real state machine does, so splitting it
   into a dozen tiny files would add indirection, not clarity. Everything
   AROUND the simulation - the data model, the positional AI, fatigue,
   rendering and UI - lives in its own module. */
import { PITCH, clamp, hyp, makeRandom, makeTeam, makeBall, jersey } from './core.js';
import { attackShape, defenceShape } from './shapes.js';
import { tickFatigue, speedFactor, handlingFactor, tackleFactor, bestReplacement } from './fatigue.js';
import { carryLine, tackleLine, breakLine, turnoverLine, kickLine, penaltyReason } from './commentary.js';

const { LEN, WID, TRY0, TRY1, MID } = PITCH;

export const STATE = {
  KICKOFF: 'KICKOFF', OPEN_PLAY: 'OPEN_PLAY', RUCK: 'RUCK', SCRUM: 'SCRUM',
  LINEOUT: 'LINEOUT', KICK: 'KICK', TRY: 'TRY', CONVERSION: 'CONVERSION',
  PENALTY: 'PENALTY', HALFTIME: 'HALFTIME', FULLTIME: 'FULLTIME'
};

const TUNE = {
  sway: 0.7, hurry: 1.6, hustle: 1.55, recover: 1.4, recoverFrom: 6, recoverSlope: 0.04,
  teamRun: 5, teamRunMax: 14, missRedZone: 0.7, lineDepth: 9.5, lineSpeed: 1.6, momentum: 2.6,
  kickOwn: 0.3, kickOpp: 0.11, pass: 0.74, missTackle: 0.4, knockOn: 0.006, turnover: 0.05,
  penaltyRate: 0.018, box: 0.16, carrierSpeed: 1.1, breakRun: 1.4, wideChance: 0.6,
  pauseDur: 0.5, shapeDrift: 3.6
};

const HALF_LENGTH_SEC = 40 * 60;   // real rugby minutes, played out on a compressed clock
const CLOCK_RATE = 10;             // match-seconds per real second at 1x playback (~8 real minutes per match)

export class MatchEngine {
  constructor(opts) {
    opts = opts || {};
    this.rand = makeRandom(opts.seed || (Date.now() & 0xffffffff));
    this.home = makeTeam(0, opts.homeName || 'Home', opts.homeShort || 'HOM', opts.homeColours || { fill: '#D0343F', text: '#fff' }, this.rand);
    this.away = makeTeam(1, opts.awayName || 'Away', opts.awayShort || 'AWY', opts.awayColours || { fill: '#F6F3EE', text: '#0A1120' }, this.rand);
    this.teams = [this.home, this.away];
    this.players = this.home.players.concat(this.away.players);
    this.ball = makeBall();
    this.ref = { x: MID, y: 22, vx: 0, vy: 0, tx: MID, ty: 22 };
    this.pulses = [];
    this.events = [];               // commentary feed, newest last
    this.clock = 0;                 // match seconds, 0..HALF_LENGTH_SEC*2
    this.half = 1;
    this.flip = 1;                  // which physical direction team 0 attacks
    this.state = STATE.KICKOFF;
    this.phase = 'kickoff_setup';
    this.pt = 0;
    this.poss = 0;
    this.seq = 0;
    this.carrier = null;
    this.anchor = { x: MID, y: WID / 2 };
    this.dec = 0;
    this.d = {};
    this.momentum = 0;              // -1 (away dominant) .. +1 (home dominant), territorial pressure
    this.possessionSec = [0, 0];
    this.mentality = ['balanced', 'balanced'];   // per-team coaching instruction: 'attack' | 'balanced' | 'defend'
    this.paused = false;
    this.changed = false;           // scoreboard should refresh
    this.stats = { passes: 0, kicks: 0, chips: 0, tackles: 0, tries: 0, offloads: 0, turnovers: 0, lineBreaks: 0 };

    this._startKickoff(0);
    this._setKickoffTargets();
    this.players.forEach(p => { p.x = p.tx; p.y = p.ty; });
    this.ref.x = this.ref.tx; this.ref.y = this.ref.ty;
  }

  // ---------- small helpers ----------
  other(team) { return 1 - team; }
  dirOf(team) { return (team === 0 ? 1 : -1) * this.flip; }
  team(id) { return this.teams[id]; }
  minute() { return Math.min(80, Math.floor(this.clock / 60) + (this.half === 2 ? 0 : 0)); }
  clockLabel() {
    const secs = this.half === 2 ? this.clock - HALF_LENGTH_SEC : this.clock;
    const m = Math.floor(clamp(secs, 0, HALF_LENGTH_SEC) / 60), s = Math.floor(clamp(secs, 0, HALF_LENGTH_SEC) % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  log(type, text, team) {
    this.events.push({ type, text, team, minute: Math.floor(this.clock / 60), t: this.clock });
    if (this.events.length > 200) this.events.shift();
  }
  who(p) { return this.team(p.team).shortName + ' #' + jersey(p.role) + ' ' + p.short; }

  R(a, b) { return a + (b - a) * this.rand(); }
  pulse(type, x, y) { this.pulses.push({ type, x, y, t: 0, dur: type === 'whistle' ? 1.1 : 0.7 }); }
  nearest(list, x, y) {
    let best = null, bd = 1e9;
    for (let i = 0; i < list.length; i++) { const d = hyp(list[i].x - x, list[i].y - y); if (d < bd) { bd = d; best = list[i]; } }
    return best;
  }
  go(p, x, y) { p.tx = clamp(x, 0.5, LEN - 0.5); p.ty = clamp(y, 0.5, WID - 0.5); }
  setPhase(name) { this.phase = name; this.pt = 0; }
  giveBall(p) { this.ball.owner = p; this.ball.fly = null; this.ball.h = 0; this.carrier = p; }
  loose(x, y) { this.ball.owner = null; this.ball.fly = null; this.ball.x = x; this.ball.y = y; this.ball.h = 0; }
  fly(x1, y1, dur, peak, onLand) {
    const b = this.ball; b.owner = null;
    b.fly = { x0: b.x, y0: b.y, x1, y1, t: 0, dur, peak, land: onLand };
  }
  roleSet(team, from, to) { return this.team(team).players.filter(p => p.role >= from && p.role <= to); }
  bumpMomentum(team, amount) { this.momentum = clamp(this.momentum + (team === 0 ? amount : -amount), -1, 1); }

  // effective top speed after fatigue and match-situation modifiers
  maxSpeed(p) {
    const base = (p.role < 8 ? 4.5 : 5.4) + p.jx * 0.3;
    return base * speedFactor(p);
  }

  // ---------- shape helpers ----------
  attackShapeFor(team, ax, ay, skip) { attackShape(this.team(team).players, this.dirOf(team), ax, ay, skip); }
  defenceShapeFor(team, ax, ay, depth, skip) { defenceShape(this.team(team).players, this.dirOf(team), ax, ay, depth, skip); }
  refFollow(x, y, dir) {
    const side = this.d.refSide || 1;
    this.ref.tx = clamp(x - dir * 9, 3, LEN - 3); this.ref.ty = clamp(y + side * 9, 2, WID - 2);
  }

  /* =====================================================================
     SET PIECES + RESTARTS
     ===================================================================== */
  _startKickoff(kt) {
    this.d = { kt, refSide: this.rand() < 0.5 ? 1 : -1 };
    this.loose(MID, WID / 2);
    this.carrier = null;
    this.state = STATE.KICKOFF;
    this.setPhase('kickoff_setup');
  }
  _setKickoffTargets() {
    const kt = this.d.kt, rt = this.other(kt), dk = this.dirOf(kt);
    this.team(kt).players.forEach(p => {
      if (p.role === 9) { this.go(p, MID - dk * 0.4, WID / 2); return; }
      this.go(p, MID - dk * (1.2 + (p.role % 3) * 0.8), 5 + (p.role / 14) * 60);
    });
    this.team(rt).players.forEach(p => {
      if (p.role < 8) this.go(p, MID + dk * (24 + (p.role % 4) * 2), 9 + p.role * 7.5);
      else { const k = p.role - 8; this.go(p, MID + dk * (24 + k * 3), [30, 22, 48, 12, 58, 28, 35][k]); }
    });
    this.ref.tx = MID - dk * 4; this.ref.ty = 26;
  }
  _startOpen(team, carrier, forcePass, noKick, continuePhase) {
    this.poss = team; this.giveBall(carrier);
    this.seq = continuePhase ? (this.seq || 0) + 1 : 0;
    this.d = { refSide: this.d.refSide || 1, forcePass: !!forcePass, age: 0, baseX: carrier.x, kickChecked: !!noKick, shapeY: carrier.y };
    this.dec = forcePass ? 0.05 : this.R(0.3, 0.7);
    this.state = STATE.OPEN_PLAY;
    this.setPhase('open');
  }
  _startRuck(x, y, tackler) {
    const a = this.poss, dir = this.dirOf(a);
    const ax = clamp(x + dir * this.R(TUNE.momentum * 0.4, TUNE.momentum), TRY0 + 1, TRY1 - 1), ay = clamp(y, 2, WID - 2);
    this.anchor = { x: ax, y: ay };
    this.loose(ax - dir * 0.4, ay);
    this.carrier = null;
    const fa = this.roleSet(a, 0, 7).filter(p => p !== this.d.down);
    fa.sort((p, q) => hyp(p.x - ax, p.y - ay) - hyp(q.x - ax, q.y - ay));
    const fd = this.roleSet(this.other(a), 0, 7).filter(p => p !== tackler);
    fd.sort((p, q) => hyp(p.x - ax, p.y - ay) - hyp(q.x - ax, q.y - ay));
    const roll = this.rand(), extra = roll < 0.3 ? 0 : roll < 0.8 ? 1 : 2;
    let raExtra = 0, rdExtra = 0;
    for (let e = 0; e < extra; e++) { if (this.rand() < 0.5) raExtra++; else rdExtra++; }
    this.d = { down: this.d.down, tackler, ra: fa.slice(0, raExtra), rd: [tackler].concat(fd.slice(0, rdExtra)),
      dur: this.R(1.9, 2.8), refSide: this.d.refSide };
    this.pulse('tackle', ax, ay); this.stats.tackles++; this.team(this.other(a)).stats.tackles++;
    this.state = STATE.RUCK;
    this.setPhase('ruck');
  }
  _startScrum(feed, x, y) {
    this.poss = feed;
    this.anchor = { x: clamp(x, 16, 104), y: clamp(y, 12, 58) };
    this.loose(this.anchor.x, this.anchor.y); this.carrier = null;
    this.d = { dur: this.R(3.4, 4.6), refSide: this.d.refSide };
    this.pulse('whistle', this.ref.x, this.ref.y);
    this.state = STATE.SCRUM;
    this.setPhase('scrum');
    this.log('scrum', 'Scrum, feed to ' + this.team(feed).shortName + '.', feed);
  }
  _startLineout(thrower, x, edge) {
    this.poss = thrower;
    this.anchor = { x: clamp(x, 14, 106), y: edge };
    this.loose(this.anchor.x, edge); this.carrier = null;
    this.d = { dur: 6, thrown: false, refSide: this.d.refSide };
    this.pulse('whistle', this.ref.x, this.ref.y);
    this.state = STATE.LINEOUT;
    this.setPhase('lineout');
    this.log('lineout', 'Lineout to ' + this.team(thrower).shortName + '.', thrower);
  }
  _startPenalty(benef, x, y, reason) {
    this.poss = benef;
    this.anchor = { x: clamp(x, 14, 106), y: clamp(y, 4, 66) };
    this.loose(this.anchor.x, this.anchor.y); this.carrier = null;
    this.d = { dur: 2.6, refSide: this.d.refSide };
    this.pulse('whistle', this.ref.x, this.ref.y);
    this.state = STATE.PENALTY;
    this.setPhase('penalty');
    this.log('penalty', 'Penalty to ' + this.team(benef).shortName + (reason ? ' - ' + reason : '') + '.', benef);
  }
  _startKick(carrier, toTouch, kind) {
    kind = kind || 'long';
    const a = carrier.team, dir = this.dirOf(a), b = this.ball;
    let lx, ly, ct, touch = !!toTouch, peak = 11, spd = 21;
    if (kind === 'chip') {
      const toTry = dir > 0 ? TRY1 - carrier.x : carrier.x - TRY0;
      lx = toTry < 22 ? (dir > 0 ? TRY1 : TRY0) + dir * this.R(-1.5, 3) : clamp(carrier.x + dir * this.R(9, 17), 12, 108);
      ly = clamp(carrier.y + this.R(-7, 7), 5, WID - 5); peak = 6; spd = 14; touch = false;
    } else if (kind === 'box') {
      lx = clamp(carrier.x + dir * this.R(17, 28), 12, 108); ly = clamp(carrier.y + this.R(-12, 12), 4, WID - 4); peak = 14; spd = 15; touch = false;
    } else if (kind === 'cross') {
      lx = clamp(carrier.x + dir * this.R(4, 12), 12, 108); ly = carrier.y < WID / 2 ? WID - this.R(4, 10) : this.R(4, 10); peak = 13; spd = 16; touch = false;
    } else {
      lx = clamp(carrier.x + dir * this.R(26, 46), 14, 106); ly = clamp(carrier.y + this.R(-20, 20), 5, WID - 5);
      touch = touch || this.rand() < 0.26; if (touch) ly = carrier.y < WID / 2 ? 0 : WID;
    }
    b.x = carrier.x; b.y = carrier.y; this.carrier = null;
    const dist = hyp(lx - b.x, ly - b.y);
    const mates = this.team(a).players.filter(p => p !== carrier && p.role >= 9);
    const foes = this.team(this.other(a)).players.filter(p => p.role >= 8);
    if (kind === 'chip' || kind === 'cross') ct = this.rand() < 0.55 ? this.nearest(mates, lx, ly) : this.nearest(foes, lx, ly);
    else if (kind === 'box') ct = this.rand() < 0.4 ? this.nearest(this.team(a).players.filter(p => p !== carrier && p.role < 12), lx, ly) : this.nearest(foes, lx, ly);
    else ct = this.nearest(foes, lx, ly);
    this.d = { kicker: carrier, kx: carrier.x, land: { x: lx, y: ly }, touch, catcher: ct, refSide: this.d.refSide, kind };
    this.stats.kicks++; this.team(a).stats.kicks++; if (kind === 'chip') this.stats.chips++;
    this.log('kick', this.who(carrier) + ' ' + kickLine(kind), a);
    this.fly(lx, ly, Math.max(1.0, dist / spd), peak, () => {
      if (touch) { this._startLineout(this.other(a), lx, ly); return; }
      const cc = this.d.catcher, inGoal = lx > TRY1 - 0.5 || lx < TRY0 + 0.5;
      if (kind === 'chip' && inGoal && cc.team === a) { this._startTry(cc); return; }
      this._startOpen(cc.team, cc, false, true);
    });
    this.state = STATE.KICK;
    this.setPhase('kick');
  }
  _startTry(scorer) {
    const a = scorer.team, dir = this.dirOf(a);
    this.team(a).score += 5; this.team(a).stats.tries++; this.changed = true; this.stats.tries++;
    this.anchor = { x: dir > 0 ? TRY1 : TRY0, y: clamp(scorer.y, 3, WID - 3) };
    this.d = { scorer, team: a, dur: 1.8, refSide: this.d.refSide };
    this.pulse('whistle', this.ref.x, this.ref.y);
    this.state = STATE.TRY;
    this.setPhase('try');
    this.bumpMomentum(a, 0.35);
    this.log('try', 'TRY! ' + this.who(scorer) + ' touches down for ' + this.team(a).name + '!', a);
  }
  _startConversion() {
    const a = this.d.team, dir = this.dirOf(a), tx = dir > 0 ? TRY1 : TRY0, sy = clamp(this.anchor.y, 14, 56);
    const kicker = this.team(a).players[9];
    this.d = { team: a, mark: { x: tx - dir * 12, y: sy }, kicker, dur: 5.4, kicked: false, refSide: this.d.refSide };
    this.giveBall(kicker); this.carrier = null; this.ball.owner = kicker;
    this.state = STATE.CONVERSION;
    this.setPhase('conversion');
  }
  _startPenaltyGoal(kicker) {
    const a = kicker.team, dir = this.dirOf(a), tx = dir > 0 ? TRY1 : TRY0;
    this.d = { team: a, mark: { x: kicker.x, y: clamp(kicker.y, 14, 56) }, kicker, dur: 4.6, kicked: false, refSide: this.d.refSide, isPenaltyGoal: true, tx };
    this.giveBall(kicker); this.carrier = null; this.ball.owner = kicker;
    this.state = STATE.CONVERSION;
    this.setPhase('conversion');
    this.log('kick', this.who(kicker) + ' lines up a shot at goal.', a);
  }

  /* =====================================================================
     OPEN-PLAY DECISION MAKING
     ===================================================================== */
  findRole(team, role) { const arr = this.team(team).players; for (let i = 0; i < arr.length; i++) if (arr[i].role === role) return arr[i]; return null; }
  pickForward(team, c) {
    const dir = this.dirOf(team);
    const cands = this.team(team).players.filter(r => {
      if (r.role >= 8) return false;
      const back = (c.x - r.x) * dir, dist = hyp(r.x - c.x, r.y - c.y);
      return back >= -0.4 && dist >= 2.5 && dist <= 12;
    });
    return cands.length ? this.nearest(cands, c.x + dir * 3, c.y) : null;
  }
  phaseTarget(c) {
    if (c.role !== 8) return null;
    const team = c.team, os = c.y < WID / 2 ? 1 : -1;
    // territorial + momentum bias: pinned in your own half, more likely to keep it tight and eventually kick
    const inOwnHalf = (c.x - MID) * this.dirOf(team) < -10;
    const mentalityBoost = { attack: 0.16, balanced: 0, defend: -0.16 }[this.mentality[team]] || 0;
    const wideChance = TUNE.wideChance * (inOwnHalf ? 0.7 : 1) + (team === 0 ? this.momentum : -this.momentum) * 0.12 + mentalityBoost;
    if (this.seq >= 3 && this.rand() < clamp(wideChance, 0.15, 0.85)) {
      this.seq = 0;
      this.d.chain = [11, 12, os > 0 ? 10 : 13];
      return this.findRole(team, 9);
    }
    this.d.chain = null;
    return this.pickForward(team, c);
  }
  tryPass(c, forced) {
    const a = c.team, dir = this.dirOf(a);
    let r = (forced && forced.team === a && forced !== c) ? forced : null;
    if (!r) {
      const cands = []; let wsum = 0;
      this.team(a).players.forEach(rr => {
        if (rr === c) return;
        const back = (c.x - rr.x) * dir, dist = hyp(rr.x - c.x, rr.y - c.y);
        if (back >= -0.4 && dist >= 3.5 && dist <= 19) {
          const w = rr.role >= 9 && rr.role <= 12 ? 3 : rr.role >= 13 ? 2 : 1; cands.push([rr, w]); wsum += w;
        }
      });
      if (!cands.length) return false;
      let pick = this.rand() * wsum; r = cands[0][0];
      for (let i = 0; i < cands.length; i++) { pick -= cands[i][1]; if (pick <= 0) { r = cands[i][0]; break; } }
    }
    const dist = hyp(r.x - c.x, r.y - c.y), dur = Math.max(0.28, dist / (15.5 * handlingFactor(c)));
    const lx = r.x + r.vx * dur * 0.8, ly = r.y + r.vy * dur * 0.8;
    this.ball.x = c.x; this.ball.y = c.y; this.carrier = null;
    this.d.receiver = r; this.d.passerX = c.x; this.stats.passes++; this.team(a).stats.passes++;
    const dropChance = TUNE.knockOn / Math.max(0.55, handlingFactor(c) * handlingFactor(r));
    this.fly(lx, ly, dur, 1.6, () => {
      this.d.forcePass = false;
      if (this.rand() < dropChance) {
        this.log('knock-on', this.who(r) + ' can’t hold on - knock-on.', a);
        this._startScrum(this.other(a), r.x, r.y); return;
      }
      this.giveBall(r); this.dec = (this.d.chain && this.d.chain.length) ? this.R(0.55, 0.95) : this.R(0.3, 0.75);
    });
    return true;
  }

  /* =====================================================================
     PER-PHASE UPDATE
     ===================================================================== */
  _updatePhase(dt) {
    const ph = this.phase, b = this.ball;
    this.pt += dt;

    if (ph === 'kickoff_setup') {
      this._setKickoffTargets();
      const ready = this.players.every(p => hyp(p.tx - p.x, p.ty - p.y) < 3.5);
      if ((ready && this.pt > 1.4) || this.pt > 6.5) {
        const kt = this.d.kt, kicker = this.team(kt).players[9], dk = this.dirOf(kt);
        this.giveBall(kicker); this.carrier = null; b.owner = kicker;
        const lx = MID + dk * this.R(24, 34), ly = this.R(14, 56);
        b.x = kicker.x; b.y = kicker.y; this.pulse('whistle', this.ref.x, this.ref.y);
        this.d.land = { x: lx, y: ly };
        this.d.catcher = this.nearest(this.team(this.other(kt)).players, lx, ly);
        this.fly(lx, ly, 2.1, 12, () => this._startOpen(this.other(kt), this.d.catcher, false, true));
        this.setPhase('kickoff_flight');
      }
      return;
    }

    if (ph === 'kickoff_flight' || ph === 'kick') {
      const land = this.d.land, kt2 = ph === 'kick' ? this.d.kicker.team : this.d.kt, rt = this.other(kt2), dk2 = this.dirOf(kt2);
      const kx = this.d.kx !== undefined ? this.d.kx : MID;
      this.team(kt2).players.forEach((p, k) => {
        if (p === this.d.kicker) { this.go(p, land.x - dk2 * 6, land.y + (p.y < land.y ? -3 : 3)); return; }
        if (ph === 'kick' && (p.x - kx) * dk2 > 1) { this.go(p, kx - dk2 * (1.5 + (k % 4) * 1.4), p.y + (35 - p.y) * 0.1); p.hurry = true; return; }
        this.go(p, land.x - dk2 * (1.5 + (k % 5) * 1.6), land.y + (p.role - 7) * 2.4);
      });
      this.go(this.d.catcher, land.x, land.y);
      this.team(rt).players.forEach(p => {
        if (p === this.d.catcher) return;
        this.go(p, land.x + this.dirOf(kt2) * (3 + (p.role % 5) * 2.2) - this.dirOf(kt2) * 6, land.y + (p.role - 7) * 3.3);
      });
      this.refFollow(land.x, land.y, this.dirOf(kt2));
      return;
    }

    if (ph === 'open') return this._updateOpen(dt);
    if (ph === 'ruck') return this._updateRuck();
    if (ph === 'scrum') return this._updateScrum();
    if (ph === 'lineout') return this._updateLineout();
    if (ph === 'penalty') return this._updatePenalty();
    if (ph === 'try') return this._updateTry();
    if (ph === 'conversion') return this._updateConversion();
  }

  _updateOpen(dt) {
    const b = this.ball;
    const c = this.carrier;
    if (!c) {
      const pa0 = this.poss, d0 = this.dirOf(pa0), rc = this.d.receiver;
      this.d.age = (this.d.age || 0) + dt;
      this.d.shapeY += clamp(b.y - this.d.shapeY, -TUNE.shapeDrift * dt, TUNE.shapeDrift * dt);
      const wantAx0 = this.d.baseX + d0 * Math.min(this.d.age * TUNE.teamRun, TUNE.teamRunMax);
      const ax0 = d0 > 0 ? Math.min(wantAx0, this.d.passerX) : Math.max(wantAx0, this.d.passerX);
      this.attackShapeFor(pa0, ax0, this.d.shapeY, rc ? [rc] : null);
      this.defenceShapeFor(this.other(pa0), this.d.baseX, this.d.shapeY, TUNE.lineDepth - Math.min(this.d.age * TUNE.lineSpeed, 6), null);
      this.team(pa0).players.forEach(p => { if ((p.x - this.d.passerX) * d0 > 0.3) p.hurry = true; });
      if (rc) { const rcx = d0 > 0 ? Math.min(b.x + d0 * 4, this.d.passerX) : Math.max(b.x + d0 * 4, this.d.passerX); this.go(rc, rcx, b.y); }
      this.go(this.nearest(this.team(this.other(pa0)).players, b.x, b.y), b.x + d0 * 2, b.y);
      this.refFollow(b.x, b.y, d0);
      return;
    }
    const a = c.team, dir = this.dirOf(a), def = this.other(a);
    if (this._lastLoggedCarrier !== c) {
      this._lastLoggedCarrier = c;
      if (c.role < 8 && this.rand() < 0.3) this.log('carry', carryLine(this.rand, this.who(c)), a);
    }
    this.d.age = (this.d.age || 0) + dt;
    c.immune -= dt;
    const open = c.y < WID / 2 ? 1 : -1;
    if (c.immune > 0) this.go(c, c.x + dir * 24, c.y + (c.y < WID / 2 ? 1 : -1) * 3); else this.go(c, c.x + dir * 9, c.y + open * 2.2);
    this.d.shapeY += clamp(c.y - this.d.shapeY, -TUNE.shapeDrift * dt, TUNE.shapeDrift * dt);
    const wantAx = this.d.baseX + dir * Math.min(this.d.age * TUNE.teamRun, TUNE.teamRunMax);
    const ax = dir > 0 ? Math.min(wantAx, c.x) : Math.max(wantAx, c.x);
    this.attackShapeFor(a, ax, this.d.shapeY, [c]);
    this.defenceShapeFor(def, this.d.baseX, this.d.shapeY, TUNE.lineDepth - Math.min(this.d.age * TUNE.lineSpeed, 6), null);
    this.team(a).players.forEach(p => { if (p !== c && (p.x - c.x) * dir > 0.3) p.hurry = true; });
    if (c.immune > 0) {
      const mates = this.team(a).players.filter(p => p !== c).sort((p, q) => hyp(p.x - c.x, p.y - c.y) - hyp(q.x - c.x, q.y - c.y));
      for (let s = 0; s < Math.min(2, mates.length); s++) {
        const m = mates[s], side = m.y < c.y ? -1 : 1;
        this.go(m, c.x - dir * (3 + s * 2.5), c.y + side * (3.5 + s * 1.5));
      }
    }
    this.team(def).players.forEach(q => {
      q.hurry = (q.x - c.x) * dir < 0.5;
      if (q.hurry) {
        const gap = hyp(q.x - c.x, q.y - c.y), T = clamp(gap / (this.maxSpeed(q) * TUNE.hurry), 0.3, 3);
        this.go(q, c.x + c.vx * T + dir * 1.5, c.y + c.vy * T);
      }
    });
    const chaser = this.nearest(this.team(def).players, c.x, c.y);
    if (hyp(chaser.x - c.x, chaser.y - c.y) < 5) this.go(chaser, c.x + dir * 0.6, c.y);
    if (this.d.chain && this.d.chain.length && hyp(chaser.x - c.x, chaser.y - c.y) < 3.2 && c.immune <= 0) this.dec = Math.min(this.dec, 0.05);
    this.refFollow(c.x, c.y, dir);

    if ((dir > 0 && c.x >= TRY1) || (dir < 0 && c.x <= TRY0)) { this._startTry(c); return; }
    if (c.y <= 0.7 || c.y >= WID - 0.7) { this._startLineout(def, c.x, c.y < WID / 2 ? 0 : WID); return; }

    if (c.immune <= 0) {
      this.dec -= dt;
      if (this.dec <= 0) {
        const zone = (c.x - MID) * dir, toGo = dir > 0 ? TRY1 - c.x : c.x - TRY0;
        if (!this.d.forcePass && !this.d.kickChecked && (c.role === 8 || c.role === 9)) {
          this.d.kickChecked = true;
          const pressureKick = (team => team === a ? -this.momentum : this.momentum)(a) * 0.06;
          const mentalityKick = { attack: -0.09, balanced: 0, defend: 0.09 }[this.mentality[a]] || 0;
          const kp = toGo > 18 ? clamp((zone < 8 ? TUNE.kickOwn : TUNE.kickOpp) + pressureKick + mentalityKick, 0.02, 0.65) : 0;
          if (this.rand() < kp) {
            const kind = toGo < 38 ? 'chip' : zone < 6 ? (this.rand() < 0.7 ? 'long' : 'chip') : (this.rand() < 0.55 ? 'chip' : this.rand() < 0.8 ? 'long' : 'cross');
            this._startKick(c, false, kind); return;
          }
        }
        let forced = null;
        if (this.d.chain && this.d.chain.length) forced = this.findRole(a, this.d.chain.shift());
        else if (c.role === 8) forced = this.phaseTarget(c);
        if (forced || this.d.forcePass || this.rand() < (toGo < 15 ? 0.55 : TUNE.pass)) { if (!this.tryPass(c, forced)) this.dec = this.R(0.2, 0.45); }
        else this.dec = this.R(0.4, 0.8);
      }
    }

    let near = null;
    for (let i = 0; i < this.team(def).players.length; i++) {
      const q = this.team(def).players[i];
      if (hyp(q.x - c.x, q.y - c.y) < 1.35) { near = q; break; }
    }
    if (near && this.carrier === c) {
      if (c.immune > 0) return;
      const toLine = dir > 0 ? TRY1 - c.x : c.x - TRY0;
      const breakChance = (toLine < 24 ? TUNE.missRedZone : TUNE.missTackle) * tackleFactor(near) / Math.max(0.55, tackleFactor(c));
      if (this.rand() < breakChance) {
        c.immune = TUNE.breakRun; near.slow = 1.1; this.stats.lineBreaks++; this.team(a).stats.lineBreaks++;
        if (this.rand() < 0.4) this.log('break', breakLine(this.rand, this.who(c)), a);
      } else if (this.rand() < 0.2 && this.tryPass(c)) {
        this.stats.offloads++; near.slow = 0.6;
        if (this.rand() < 0.3) this.log('offload', this.who(c) + ' gets the offload away in the tackle.', a);
        return;
      } else {
        if (this.rand() < 0.12) this.log('tackle', tackleLine(this.rand, this.who(near), this.who(c)), def);
        this.d.down = c; this._startRuck(c.x, c.y, near); return;
      }
    }
    if (this.d.age > 7.5) { this.d.down = c; this._startRuck(c.x, c.y, this.nearest(this.team(def).players, c.x, c.y)); }
  }

  _updateRuck() {
    const A = this.poss, dd = this.dirOf(A), an = this.anchor;
    this.d.down && this.go(this.d.down, an.x, an.y);
    this.d.ra.forEach((p, k) => this.go(p, an.x - dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1));
    this.d.rd.forEach((p, k) => this.go(p, an.x + dd * (0.9 + k * 0.5), an.y + (k - 1) * 1.1));
    const skipA = this.d.ra.concat(this.d.down ? [this.d.down] : []);
    this.attackShapeFor(A, an.x - dd * 3, an.y, skipA);
    this.defenceShapeFor(this.other(A), an.x, an.y, 6, this.d.rd);
    const sh = this.team(A).players[8]; if (skipA.indexOf(sh) < 0) this.go(sh, an.x - dd * 2.2, an.y + 0.6);
    this.team(A).players.forEach(p => { if (skipA.indexOf(p) < 0 && (p.x - an.x) * dd > -1.2) p.hurry = true; });
    this.team(this.other(A)).players.forEach(p => { if (this.d.rd.indexOf(p) < 0 && (p.x - an.x) * dd < 1.2) p.hurry = true; });
    this.refFollow(an.x, an.y, dd);
    if (this.pt > this.d.dur) {
      const roll2 = this.rand();
      if (roll2 < TUNE.penaltyRate) { this._startPenalty(this.rand() < 0.5 ? A : this.other(A), an.x, an.y, penaltyReason(this.rand)); }
      else if (roll2 < TUNE.penaltyRate + TUNE.turnover) {
        const nb = this.nearest(this.d.rd.filter(p => p.role < 8), an.x, an.y) || this.d.rd[0];
        this.d.down = null; this.stats.turnovers++; this.team(this.other(A)).stats.turnovers++;
        this.log('turnover', turnoverLine(this.rand, this.team(this.other(A)).name), this.other(A));
        this._startOpen(this.other(A), nb, false);
      } else {
        const half = this.team(A).players[8]; half.x = an.x - dd * 1.2; half.y = an.y; half.vx = half.vy = 0;
        this.d.down = null;
        if (this.rand() < TUNE.box && (dd > 0 ? TRY1 - an.x : an.x - TRY0) > 22) { this.poss = A; this.carrier = half; this.ball.owner = half; this._startKick(half, false, 'box'); }
        else this._startOpen(A, half, true, false, true);
      }
    }
  }

  _updateScrum() {
    const F = this.poss, df = this.dirOf(F), sa = this.anchor;
    if (this.pt < TUNE.pauseDur) { this.players.forEach(p => this.go(p, p.x, p.y)); this.ref.tx = sa.x; this.ref.ty = clamp(sa.y + 6, 2, WID - 2); return; }
    const rows = [[-1.3, 0, 1.3], [-0.7, 0.7], [-1.3, 0, 1.3]]; let idx = 0;
    rows.forEach((row, ri) => row.forEach(off => {
      const pa = this.team(F).players[idx], pd = this.team(this.other(F)).players[idx]; idx++;
      this.go(pa, sa.x - df * (0.7 + ri * 1.25), sa.y + off);
      this.go(pd, sa.x + df * (0.7 + ri * 1.25), sa.y + off);
    }));
    const sh2 = this.team(F).players[8]; this.go(sh2, sa.x - df * 0.3, sa.y + 2.3);
    const sh3 = this.team(this.other(F)).players[8]; this.go(sh3, sa.x + df * 0.3, sa.y - 2.3);
    this.team(F).players.forEach(p => { if (p.role >= 9) { const s = [6, 12, 19, 26, -14, -5][p.role - 9]; this.go(p, sa.x - df * (8 + (p.role - 9) * 1.2), sa.y + s); } });
    this.team(this.other(F)).players.forEach(p => { if (p.role >= 9) this.go(p, sa.x + df * 9, sa.y + (p.role - 11.5) * 8); });
    this.players.forEach(p => { const mine = p.team === F ? -1 : 1; if (p.role >= 8 && (p.x - sa.x) * df * mine < 5) p.hurry = true; });
    this.ref.tx = sa.x; this.ref.ty = clamp(sa.y + 6, 2, WID - 2);
    if (this.pt > this.d.dur) {
      const roll = this.rand();
      if (roll < 0.05) { this._startPenalty(this.rand() < 0.5 ? F : this.other(F), sa.x, sa.y, 'scrum infringement'); return; }
      if (roll < 0.09) { this.log('turnover', 'Scrum turnover - ' + this.team(this.other(F)).shortName + ' win it against the head!', this.other(F)); sh3.x = sa.x + df * 0.6; sh3.y = sa.y - 1.6; sh3.vx = sh3.vy = 0; this._startOpen(this.other(F), sh3, true); return; }
      sh2.x = sa.x - df * 0.6; sh2.y = sa.y + 1.6; sh2.vx = sh2.vy = 0; this._startOpen(F, sh2, true);
    }
  }

  _updateLineout() {
    const T = this.poss, dt2 = this.dirOf(T), la = this.anchor, sg = la.y < WID / 2 ? 1 : -1;
    if (this.pt < TUNE.pauseDur) { this.players.forEach(p => this.go(p, p.x, p.y)); this.ref.tx = la.x; this.ref.ty = la.y + sg * 3; return; }
    for (let i = 0; i < 7; i++) {
      this.go(this.team(T).players[i], la.x - 0.55, la.y + sg * (5 + i * 1.7));
      this.go(this.team(this.other(T)).players[i], la.x + 0.55, la.y + sg * (5 + i * 1.7));
    }
    this.go(this.team(T).players[7], la.x - dt2 * 3, la.y + sg * 4);
    this.go(this.team(this.other(T)).players[7], la.x + dt2 * 3, la.y + sg * 5);
    this.go(this.team(T).players[8], la.x - dt2 * 4, la.y + sg * 9);
    this.go(this.team(this.other(T)).players[8], la.x + dt2 * 4, la.y + sg * 9);
    [9, 10, 11, 12, 13, 14].forEach((rle, k) => {
      this.go(this.team(T).players[rle], la.x - dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
      this.go(this.team(this.other(T)).players[rle], la.x + dt2 * (10 + k * 1.5), la.y + sg * (12 + k * 4.5));
    });
    this.players.forEach(p => { if (p.role >= 9) p.hurry = true; });
    this.go(this.team(T).players[1], la.x - 0.3, la.y + sg * 1.1);
    this.ref.tx = la.x; this.ref.ty = la.y + sg * 3;
    if (!this.d.thrown) {
      const lineReady = this.team(T).players.concat(this.team(this.other(T)).players).filter(p => p.role < 7).every(p => hyp(p.tx - p.x, p.ty - p.y) < 2.5);
      if ((lineReady && this.pt > 1.1) || this.pt > 4.2) {
        this.d.thrown = true; this.ball.x = la.x; this.ball.y = la.y;
        if (this.rand() < 0.08) { this.log('turnover', this.team(this.other(T)).shortName + ' steal the lineout!', this.other(T));
          const jumper = this.team(this.other(T)).players[3 + Math.floor(this.rand() * 4)];
          this.fly(la.x + 0.55, la.y + sg * (5 + jumper.role * 1.7), 0.55, 4.5, () => { this.ball.owner = jumper; this.poss = this.other(T); });
        } else {
          const jumper = this.team(T).players[3 + Math.floor(this.rand() * 4)];
          this.fly(la.x - 0.55, la.y + sg * (5 + jumper.role * 1.7), 0.55, 4.5, () => { this.ball.owner = jumper; });
        }
      }
    }
    if (this.d.thrown && this.pt > this.d.dur) {
      const T2 = this.poss, dt3 = this.dirOf(T2), sg2 = la.y < WID / 2 ? 1 : -1;
      const half2 = this.team(T2).players[8];
      half2.x = la.x - dt3 * 4; half2.y = la.y + sg2 * 9; half2.vx = half2.vy = 0;
      this._startOpen(T2, half2, true);
    }
  }

  _updatePenalty() {
    const pa2 = this.anchor, Bn = this.poss, dB = this.dirOf(Bn);
    if (this.pt < TUNE.pauseDur) { this.players.forEach(p => this.go(p, p.x, p.y)); this.ref.tx = pa2.x - dB * 3; this.ref.ty = pa2.y + 5; return; }
    const tapper = this.nearest(this.team(Bn).players, pa2.x, pa2.y);
    this.attackShapeFor(Bn, pa2.x, pa2.y, [tapper]);
    this.go(tapper, pa2.x, pa2.y);
    this.team(this.other(Bn)).players.forEach(p => {
      this.go(p, pa2.x + dB * (10.5 + (p.role % 3)), clamp(pa2.y + (p.role - 7) * 4, 3, WID - 3));
      if ((p.x - pa2.x) * dB < 10) p.hurry = true;
    });
    this.ref.tx = pa2.x - this.dirOf(Bn) * 3; this.ref.ty = pa2.y + 5;
    if (this.pt > this.d.dur) {
      const toGoal = dB > 0 ? TRY1 - pa2.x : pa2.x - TRY0;
      const inRange = toGoal < 45 && Math.abs(pa2.y - WID / 2) < 30;
      const roll = this.rand();
      if (inRange && roll < 0.55) { this._startPenaltyGoal(tapper); return; }
      if (roll < 0.8) { tapper.x = pa2.x; tapper.y = pa2.y; tapper.vx = tapper.vy = 0; this._startOpen(Bn, tapper, false); }
      else { this.d = { refSide: this.d.refSide }; this.ball.x = tapper.x; this.ball.y = tapper.y; this._startKick(tapper, true); }
    }
  }

  _updateTry() {
    const sc = this.d.scorer, dtm = this.dirOf(this.d.team);
    this.go(sc, sc.x + dtm * 3, sc.y);
    this.team(this.d.team).players.forEach(p => { if (p !== sc) this.go(p, sc.x - dtm * 4 + p.jx, sc.y + (p.role - 7) * 1.2); });
    this.team(this.other(this.d.team)).players.forEach(p => this.go(p, this.anchor.x + dtm * (12 + (p.role % 4) * 3), 8 + p.role * 3.6));
    this.ref.tx = this.anchor.x - dtm * 2; this.ref.ty = this.anchor.y + 4;
    if (this.pt > this.d.dur) this._startConversion();
  }

  _updateConversion() {
    const cv = this.d, ta = cv.team, dtv = this.dirOf(ta), tx = cv.tx !== undefined ? cv.tx : (dtv > 0 ? TRY1 : TRY0);
    this.go(cv.kicker, cv.mark.x, cv.mark.y);
    this.team(ta).players.forEach(p => { if (p !== cv.kicker) { this.go(p, cv.mark.x - dtv * (10 + (p.role % 4) * 3), 12 + p.role * 3.2); p.hurry = hyp(p.tx - p.x, p.ty - p.y) > 4; } });
    this.team(this.other(ta)).players.forEach(p => {
      if (p.role < 8) this.go(p, tx + dtv * 1.4, 35 + (p.role - 3.5) * 1.6);
      else this.go(p, MID + dtv * 8, 8 + p.role * 3.6);
    });
    this.ref.tx = cv.mark.x + dtv * 6; this.ref.ty = cv.mark.y + 6;
    if (!cv.kicked && this.pt > 2.3 && hyp(cv.kicker.x - cv.mark.x, cv.kicker.y - cv.mark.y) < 1.5) {
      cv.kicked = true; this.ball.x = cv.kicker.x; this.ball.y = cv.kicker.y; this.ball.owner = null;
      const angle = Math.atan2(Math.abs(cv.mark.y - 35), Math.abs(tx - cv.mark.x));
      const chance = (cv.isPenaltyGoal ? 0.72 : 0.68) * (1 - angle * 0.5) * (0.85 + cv.kicker.kicking * 0.3);
      const good = this.rand() < clamp(chance, 0.15, 0.95);
      const ty = good ? 35 + this.R(-1.2, 1.2) : 35 + (this.rand() < 0.5 ? -1 : 1) * this.R(3.6, 5.5);
      this.fly(tx, ty, 1.5, 9, () => {
        if (good) { this.team(ta).score += cv.isPenaltyGoal ? 3 : 2; this.team(ta).stats[cv.isPenaltyGoal ? 'penalties' : 'conversions']++; this.changed = true; }
        this.log(cv.isPenaltyGoal ? 'penalty-kick' : 'conversion', (good ? 'It’s good! ' : 'It drifts wide. ') + this.who(cv.kicker) + (cv.isPenaltyGoal ? ' penalty kick.' : ' conversion.'), ta);
        this.ball.owner = null;
      });
      cv.landed = false;
    }
    if (cv.kicked && !this.ball.fly && !cv.landed) { cv.landed = true; cv.after = this.pt + 1.1; }
    if (cv.landed && this.pt > cv.after) {
      if (cv.isPenaltyGoal) this._resumeAfterDeadBall(this.other(ta));
      else this._startKickoff(this.other(ta));
    } else if (!cv.kicked && this.pt > 7) { cv.kicked = true; cv.landed = true; cv.after = this.pt; }
  }
  _resumeAfterDeadBall(receiving) {
    // a missed/scored penalty kick at goal restarts like a 22 drop-out in spirit: a simple kickoff-style restart
    this._startKickoff(receiving);
  }

  /* =====================================================================
     MOVEMENT + MATCH CLOCK
     ===================================================================== */
  _movePlayer(p, dt, hustle) {
    const dx = p.tx - p.x, dy = p.ty - p.y, dist = hyp(dx, dy);
    const rec = dist > TUNE.recoverFrom ? Math.min(TUNE.recover, 1 + (dist - TUNE.recoverFrom) * TUNE.recoverSlope) : 1;
    const maxv = this.maxSpeed(p) * (p.slow > 0 ? 0.35 : 1) * (hustle ? TUNE.hustle : 1) * (p.burst ? 1.18 : 1) * (p.carrying ? TUNE.carrierSpeed : 1) * (p.hurry ? TUNE.hurry : 1) * rec;
    if (p.slow > 0) p.slow -= dt;
    const want = Math.min(maxv, dist * 3.2);
    const dvx = dist > 0.01 ? dx / dist * want : 0, dvy = dist > 0.01 ? dy / dist * want : 0;
    const acc = 20 * dt; let ax = dvx - p.vx, ay = dvy - p.vy; const am = hyp(ax, ay);
    if (am > acc) { ax = ax / am * acc; ay = ay / am * acc; }
    p.vx += ax; p.vy += ay; p.x += p.vx * dt; p.y += p.vy * dt;
    const intensity = clamp(hyp(p.vx, p.vy) / Math.max(1, this.maxSpeed(p)), 0, 1) * (p.hurry || p.carrying ? 1.15 : 0.85);
    tickFatigue(p, dt, intensity);
  }
  _separate(dt, phase) {
    const packed = phase === 'ruck' || phase === 'scrum' || phase === 'lineout';
    const minD = packed ? 0.95 : 1.7, P = this.players, n = P.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d = hyp(dx, dy);
      if (d < minD && d > 0.001) {
        const push = (minD - d) * 4 * dt / d;
        P[i].x -= dx * push; P[i].y -= dy * push; P[j].x += dx * push; P[j].y += dy * push;
      }
    }
  }
  _maybeSubstitute() {
    this.teams.forEach(team => {
      if (team.subsUsed >= 8 || !team.bench.length) return;
      const tired = team.players.filter(p => p.onField && p.fatigue > 0.5 && p !== this.carrier);
      if (!tired.length) return;
      const out = tired.sort((a, b) => b.fatigue - a.fatigue)[0];
      const inP = bestReplacement(team.bench, out.group);
      if (!inP) return;
      inP.x = out.x; inP.y = out.y; inP.tx = out.tx; inP.ty = out.ty; inP.vx = 0; inP.vy = 0;
      inP.role = out.role; inP.onField = true; inP.fatigue = 0.1; inP.immune = 0; inP.slow = 0;
      inP.jx = out.jx; inP.jy = out.jy; inP.phase = out.phase; inP.wob = out.wob;
      const idx = team.players.indexOf(out);
      team.players[idx] = inP;
      team.bench.splice(team.bench.indexOf(inP), 1);
      out.onField = false; team.bench.push(out);
      team.subsUsed++;
      this.players = this.home.players.concat(this.away.players);
      if (this.carrier === out) this.carrier = inP;
      this.log('sub', team.shortName + ': ' + inP.short + ' ' + jersey(inP.role) + ' replaces ' + out.short + '.', team.id);
    });
  }

  step(dtReal) {
    if (this.paused || this.state === STATE.HALFTIME || this.state === STATE.FULLTIME) return;
    const dt = Math.min(dtReal, 0.05);
    this.clock += dt * CLOCK_RATE;

    // half-time / full-time gates (checked on the match clock, not sim time)
    if (this.half === 1 && this.clock >= HALF_LENGTH_SEC && this.phase !== 'try' && this.phase !== 'conversion') {
      this.half = 2; this.flip *= -1; this.state = STATE.HALFTIME;
      this._pendingKickoffTeam = 1;
      this.log('halftime', 'Half-time.', null);
      return;
    }
    if (this.half === 2 && this.clock >= HALF_LENGTH_SEC * 2 && this.phase !== 'try' && this.phase !== 'conversion') {
      this.state = STATE.FULLTIME;
      this.log('fulltime', 'Full-time: ' + this.home.name + ' ' + this.home.score + ' - ' + this.away.score + ' ' + this.away.name + '.', null);
      return;
    }

    let j;
    for (j = 0; j < this.players.length; j++) this.players[j].hurry = false;
    this._updatePhase(dt);

    const packed = this.phase === 'ruck' || this.phase === 'scrum' || this.phase === 'lineout';
    for (j = 0; j < this.players.length; j++) {
      const pl = this.players[j];
      const lineoutTight = this.phase === 'lineout' && pl.role < 8;
      const near = packed && (lineoutTight || hyp(pl.tx - this.anchor.x, pl.ty - this.anchor.y) < 3.2);
      const amp = TUNE.sway * (near ? 0.25 : 1);
      if (pl === this.carrier) continue;
      pl.tx = clamp(pl.tx + Math.sin(this.clock * pl.wob * 0.1 + pl.phase) * amp, 0.5, LEN - 0.5);
      pl.ty = clamp(pl.ty + Math.cos(this.clock * pl.wob * 0.083 + pl.phase * 1.7) * amp * 1.3, 0.5, WID - 0.5);
    }
    this.ref.tx += Math.sin(this.clock * 0.17) * 0.6; this.ref.ty += Math.cos(this.clock * 0.13) * 0.6;

    const hustle = this.phase === 'kickoff_setup' || this.phase === 'try' || this.phase === 'conversion' || this.phase === 'penalty';
    for (j = 0; j < this.players.length; j++) {
      const pl = this.players[j];
      pl.carrying = pl === this.carrier; pl.burst = pl.carrying && pl.immune > 0;
      this._movePlayer(pl, dt, hustle);
    }
    this._separate(dt, this.phase);

    const rf = this.ref, rd = hyp(rf.tx - rf.x, rf.ty - rf.y), rs = Math.min(5.8, rd * 2.5);
    if (rd > 0.05) { rf.vx += ((rf.tx - rf.x) / rd * rs - rf.vx) * Math.min(1, dt * 6); rf.vy += ((rf.ty - rf.y) / rd * rs - rf.vy) * Math.min(1, dt * 6); }
    else { rf.vx *= 0.8; rf.vy *= 0.8; }
    rf.x += rf.vx * dt; rf.y += rf.vy * dt;

    const b = this.ball;
    if (b.fly) {
      const f = b.fly; f.t += dt; const u = Math.min(1, f.t / f.dur);
      b.x = f.x0 + (f.x1 - f.x0) * u; b.y = f.y0 + (f.y1 - f.y0) * u; b.h = 4 * f.peak * u * (1 - u);
      if (u >= 1) { const cb = f.land; b.fly = null; b.h = 0; if (cb) cb(); }
    } else if (b.owner) {
      const o = b.owner, sp = hyp(o.vx, o.vy), fx = sp > 0.3 ? o.vx / sp : this.dirOf(o.team), fy = sp > 0.3 ? o.vy / sp : 0;
      b.x = o.x + fx * 0.9; b.y = o.y + fy * 0.9; b.h = 0;
    }
    b.x = clamp(b.x, 0, LEN); b.y = clamp(b.y, 0, WID);

    for (j = this.pulses.length - 1; j >= 0; j--) { this.pulses[j].t += dt; if (this.pulses[j].t > this.pulses[j].dur) this.pulses.splice(j, 1); }
    for (j = 0; j < this.players.length; j++) { const q = this.players[j]; q.x = clamp(q.x, 0.4, LEN - 0.4); q.y = clamp(q.y, 0.4, WID - 0.4); }

    // territory -> momentum, gently
    if (this.carrier) {
      const dir = this.dirOf(this.carrier.team);
      const attackerTeam = this.carrier.team;
      const deep = (dir > 0 ? this.carrier.x > TRY1 - 22 : this.carrier.x < TRY0 + 22);
      if (deep) this.bumpMomentum(attackerTeam, 0.006 * dt);
    }
    this.momentum *= (1 - 0.02 * dt);

    if (this.rand() < dt * 0.02) this._maybeSubstitute();
    if (this.poss === 0 || this.poss === 1) this.possessionSec[this.poss] += dt;
  }
  possessionPct() {
    const tot = this.possessionSec[0] + this.possessionSec[1];
    return tot > 0 ? Math.round((this.possessionSec[0] / tot) * 100) : 50;
  }
  matchPhaseInfo() {
    const labels = { SCRUM: 'SCRUM', LINEOUT: 'LINEOUT', KICK: 'KICK', KICKOFF: 'KICK-OFF', RUCK: 'RUCK',
      PENALTY: 'PENALTY', TRY: 'TRY!', CONVERSION: 'KICKING AT GOAL', OPEN_PLAY: 'ATTACKING',
      HALFTIME: 'HALF-TIME', FULLTIME: 'FULL-TIME' };
    return { phase: this.seq + 1, label: labels[this.state] || this.state, team: this.team(this.poss).shortName };
  }

  resumeAfterHalftime() {
    if (this.state !== STATE.HALFTIME) return;
    this._startKickoff(this._pendingKickoffTeam || 1);
    this._setKickoffTargets();
  }
}
