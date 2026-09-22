/* Jacklers Match Engine — UI.
   Reads the engine each frame and syncs the scoreboard, phase strip and
   commentary feed; wires up the coach-style controls. Pure DOM glue - no
   game logic. */

export class MatchUI {
  constructor(root, eng) {
    this.eng = eng;
    this.el = {
      homeName: root.querySelector('[data-mc="home-name"]'),
      awayName: root.querySelector('[data-mc="away-name"]'),
      homeScore: root.querySelector('[data-mc="home-score"]'),
      awayScore: root.querySelector('[data-mc="away-score"]'),
      clock: root.querySelector('[data-mc="clock"]'),
      half: root.querySelector('[data-mc="half"]'),
      phase: root.querySelector('[data-mc="phase"]'),
      possHome: root.querySelector('[data-mc="poss-home"]'),
      possAway: root.querySelector('[data-mc="poss-away"]'),
      possBarHome: root.querySelector('[data-mc="poss-bar-home"]'),
      feed: root.querySelector('[data-mc="feed"]'),
      play: root.querySelector('[data-mc="play"]'),
      speed: root.querySelector('[data-mc="speed"]'),
      restart: root.querySelector('[data-mc="restart"]'),
      mentalityHome: root.querySelector('[data-mc="mentality-home"]'),
      mentalityAway: root.querySelector('[data-mc="mentality-away"]'),
      banner: root.querySelector('[data-mc="banner"]')
    };
    this._lastFeedLen = 0;
    this._lastBannerState = null;
    this.el.homeName.textContent = eng.home.shortName;
    this.el.awayName.textContent = eng.away.shortName;
    if (this.el.mentalityHome) this.el.mentalityHome.value = eng.mentality[0];
    if (this.el.mentalityAway) this.el.mentalityAway.value = eng.mentality[1];
  }

  bindControls({ onPlayPause, onSpeedCycle, onRestart }) {
    if (this.el.play) this.el.play.addEventListener('click', onPlayPause);
    if (this.el.speed) this.el.speed.addEventListener('click', onSpeedCycle);
    if (this.el.restart) this.el.restart.addEventListener('click', onRestart);
    if (this.el.mentalityHome) this.el.mentalityHome.addEventListener('change', e => { this.eng.mentality[0] = e.target.value; });
    if (this.el.mentalityAway) this.el.mentalityAway.addEventListener('change', e => { this.eng.mentality[1] = e.target.value; });
  }

  setPlayLabel(playing) { if (this.el.play) this.el.play.textContent = playing ? 'Pause' : 'Play'; }
  setSpeedLabel(x) { if (this.el.speed) this.el.speed.textContent = x + '×'; }

  render() {
    const eng = this.eng;
    this.el.homeScore.textContent = eng.home.score;
    this.el.awayScore.textContent = eng.away.score;
    this.el.clock.textContent = eng.clockLabel();
    this.el.half.textContent = eng.state === 'FULLTIME' ? 'FT' : eng.state === 'HALFTIME' ? 'HT' : 'H' + eng.half;
    const info = eng.matchPhaseInfo();
    this.el.phase.textContent = 'PHASE ' + info.phase + ' — ' + info.label + ' — ' + info.team;
    const pct = eng.possessionPct();
    if (this.el.possHome) this.el.possHome.textContent = pct + '%';
    if (this.el.possAway) this.el.possAway.textContent = (100 - pct) + '%';
    if (this.el.possBarHome) this.el.possBarHome.style.width = pct + '%';

    if (this.el.feed && eng.events.length !== this._lastFeedLen) {
      const frag = document.createDocumentFragment();
      for (let i = this._lastFeedLen; i < eng.events.length; i++) {
        const e = eng.events[i];
        const li = document.createElement('li');
        li.className = 'mc-feed__item mc-feed__item--' + e.type;
        li.innerHTML = '<span class="mc-feed__min">' + e.minute + '\'</span> ' + escapeHtml(e.text);
        frag.appendChild(li);
      }
      this.el.feed.appendChild(frag);
      this._lastFeedLen = eng.events.length;
      while (this.el.feed.children.length > 40) this.el.feed.removeChild(this.el.feed.firstChild);
      this.el.feed.scrollTop = this.el.feed.scrollHeight;
    }

    if (this.el.banner && eng.state !== this._lastBannerState) {
      this._lastBannerState = eng.state;
      if (eng.state === 'TRY') this.showBanner('TRY!', eng.d.scorer ? eng.who(eng.d.scorer) : '');
      else if (eng.state === 'HALFTIME') this.showBanner('HALF-TIME', eng.home.shortName + ' ' + eng.home.score + ' – ' + eng.away.score + ' ' + eng.away.shortName);
      else if (eng.state === 'FULLTIME') this.showBanner('FULL-TIME', eng.home.shortName + ' ' + eng.home.score + ' – ' + eng.away.score + ' ' + eng.away.shortName);
      else this.hideBanner();
    }
  }

  showBanner(title, sub) {
    if (!this.el.banner) return;
    this.el.banner.querySelector('.mc-banner__title').textContent = title;
    this.el.banner.querySelector('.mc-banner__sub').textContent = sub || '';
    this.el.banner.hidden = false;
  }
  hideBanner() { if (this.el.banner) this.el.banner.hidden = true; }
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
