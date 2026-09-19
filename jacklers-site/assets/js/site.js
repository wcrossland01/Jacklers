/* Jacklers — site script
   No fake content lives here. Every list renders from JSON files in /data.
   When a record is added to a file, the matching pages populate automatically.
   To move to a real backend later, change J.dataSource below (one place). */
(function () {
  'use strict';

  var J = (window.Jacklers = window.Jacklers || {});

  // Single place that decides where data comes from.
  // Today: static JSON files. Later: the Jacklers backend (e.g. base '/api/', ext '').
  J.dataSource = { base: '/data/', ext: '.json' };

  var cache = {};
  J.load = function (name) {
    if (!cache[name]) {
      cache[name] = fetch(J.dataSource.base + name + J.dataSource.ext, { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) { throw new Error(String(r.status)); } return r.json(); })
        .then(function (d) { return Array.isArray(d) ? d : []; })
        .catch(function () { return []; });
    }
    return cache[name];
  };

  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      if (k === 'text') { n.textContent = a[k]; }
      else if (k === 'class') { n.className = a[k]; }
      else { n.setAttribute(k, a[k]); }
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) { return; }
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function safeUrl(u) {
    return typeof u === 'string' && /^(https?:\/\/|\/)/.test(u) ? u : '';
  }
  function fmtDate(d) {
    var t = new Date(d);
    return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function byDateDesc(a, b) { return new Date(b.date || 0) - new Date(a.date || 0); }
  function readingTime(a) {
    if (a.readingTime) { return a.readingTime; }
    var words = 0;
    (a.body || []).forEach(function (b) {
      var t = typeof b === 'string' ? b : (b && b.text) || '';
      words += t.split(/\s+/).filter(Boolean).length;
    });
    return Math.max(1, Math.round(words / 220));
  }
  function emptyState(title, text) {
    var svg = document.getElementById('tpl-empty-icon');
    var wrap = el('div', { class: 'empty' });
    if (svg) { wrap.innerHTML = svg.innerHTML; }
    wrap.appendChild(el('div', {}, [el('p', { class: 'empty__title', text: title }), text ? el('p', { class: 'empty__text', text: text }) : null]));
    return wrap;
  }

  /* ---------- navigation ---------- */
  var menuBtn = document.querySelector('.menu-btn');
  var nav = document.getElementById('site-nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = 'Menu';
        menuBtn.focus();
      }
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (n) { n.textContent = String(new Date().getFullYear()); });

  /* ---------- newsletter (interface only; nothing is sent or stored) ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('form[data-newsletter]'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var msg = form.querySelector('.signup__msg');
      if (!input.checkValidity() || !input.value) {
        msg.textContent = 'Enter a valid email address.';
        input.focus();
        return;
      }
      msg.textContent = 'Sign-ups are not open yet. Your email address has not been saved.';
    });
  });

  /* ---------- article cards ---------- */
  function storyCard(a, lead) {
    var href = '/article/?slug=' + encodeURIComponent(a.slug || '');
    var img = safeUrl(a.heroImage && (a.heroImage.src || a.heroImage));
    var meta = [a.author, fmtDate(a.date)].filter(Boolean).join(', ');
    return el('article', { class: 'story' + (lead ? ' story--lead' : '') }, [
      img ? el('img', { class: 'story__img', src: img, alt: (a.heroImage && a.heroImage.alt) || '', loading: 'lazy' }) : null,
      a.section ? el('p', { class: 'story__section', text: cap(a.section) }) : null,
      el('h3', {}, [el('a', { href: href, text: a.title || 'Untitled' })]),
      a.standfirst ? el('p', { class: 'story__stand', text: a.standfirst }) : null,
      meta ? el('p', { class: 'story__meta', text: meta }) : null
    ]);
  }
  function renderStories(container, list) {
    var grid = el('div', { class: 'story-grid' }, list.map(function (a, i) { return storyCard(a, i === 0 && container.hasAttribute('data-lead')); }));
    container.replaceChildren(grid);
  }

  /* ---------- lists on home and section pages ---------- */
  var storyBoxes = document.querySelectorAll('[data-render="articles"]');
  if (storyBoxes.length) {
    J.load('articles').then(function (all) {
      Array.prototype.forEach.call(storyBoxes, function (box) {
        if (box.hasAttribute('data-paged')) { return; } // handled below
        var section = box.getAttribute('data-section');
        var limit = parseInt(box.getAttribute('data-limit') || '6', 10);
        var list = all.filter(function (a) { return !section || a.section === section; }).sort(byDateDesc).slice(0, limit);
        if (list.length) { renderStories(box, list); }
      });
    });
  }

  /* ---------- section page: featured, filter, pagination ---------- */
  var paged = document.querySelector('[data-render="articles"][data-paged]');
  if (paged) {
    var PER_PAGE = 12;
    var section = paged.getAttribute('data-section');
    var tagSelect = document.getElementById('filter-tag');
    var sortSelect = document.getElementById('filter-sort');
    var pager = document.getElementById('pager');
    var featuredBox = document.querySelector('[data-featured]');
    var state = { page: 1, tag: '', sort: 'newest' };
    J.load('articles').then(function (all) {
      var items = all.filter(function (a) { return a.section === section; });
      if (!items.length) { return; }
      var featured = items.filter(function (a) { return a.featured; }).sort(byDateDesc)[0];
      if (featured && featuredBox) { featuredBox.replaceChildren(storyCard(featured, true)); }
      var tags = {};
      items.forEach(function (a) { (a.tags || []).forEach(function (t) { tags[t] = true; }); });
      Object.keys(tags).sort().forEach(function (t) { tagSelect.appendChild(el('option', { value: t, text: t })); });
      tagSelect.disabled = !Object.keys(tags).length;
      sortSelect.disabled = false;
      function draw() {
        var list = items.filter(function (a) { return !state.tag || (a.tags || []).indexOf(state.tag) > -1; });
        list.sort(state.sort === 'oldest' ? function (a, b) { return -byDateDesc(a, b); } : byDateDesc);
        var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        state.page = Math.min(state.page, pages);
        var slice = list.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
        if (slice.length) { renderStories(paged, slice); }
        else { paged.replaceChildren(emptyState('No articles match these filters.', 'Clear a filter to see more.')); }
        pager.hidden = pages <= 1;
        pager.replaceChildren(
          el('button', { type: 'button', 'data-dir': '-1', text: 'Previous' }),
          el('span', { text: 'Page ' + state.page + ' of ' + pages }),
          el('button', { type: 'button', 'data-dir': '1', text: 'Next' })
        );
        pager.querySelector('[data-dir="-1"]').disabled = state.page <= 1;
        pager.querySelector('[data-dir="1"]').disabled = state.page >= pages;
      }
      tagSelect.addEventListener('change', function () { state.tag = tagSelect.value; state.page = 1; draw(); });
      sortSelect.addEventListener('change', function () { state.sort = sortSelect.value; state.page = 1; draw(); });
      pager.addEventListener('click', function (e) {
        var dir = e.target && e.target.getAttribute && e.target.getAttribute('data-dir');
        if (dir) { state.page += parseInt(dir, 10); draw(); paged.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
      draw();
    });
  }

  /* ---------- article page ---------- */
  var articleRoot = document.getElementById('article-root');
  if (articleRoot) {
    var slug = new URLSearchParams(location.search).get('slug');
    J.load('articles').then(function (all) {
      var a = all.filter(function (x) { return x.slug === slug; })[0];
      if (!a) { return; } // the empty state already on the page stays
      document.title = a.title + ' | Jacklers';
      var body = el('div', { class: 'article__body' });
      (a.body || []).forEach(function (b) {
        if (typeof b === 'string') { body.appendChild(el('p', { text: b })); return; }
        if (b.type === 'heading') { body.appendChild(el('h2', { text: b.text })); }
        else if (b.type === 'pullquote') {
          body.appendChild(el('blockquote', {}, [b.text, b.attribution ? el('cite', { text: b.attribution }) : null]));
        } else if (b.type === 'image' && safeUrl(b.src)) {
          body.appendChild(el('figure', {}, [el('img', { src: b.src, alt: b.alt || '', loading: 'lazy' }), b.caption ? el('figcaption', { text: b.caption }) : null]));
        } else if (b.type === 'paragraph') { body.appendChild(el('p', { text: b.text })); }
      });
      var hero = a.heroImage && safeUrl(a.heroImage.src || a.heroImage);
      var stats = (a.statistics || []).length
        ? el('dl', { class: 'article__stats' }, a.statistics.map(function (s) {
            return el('div', {}, [el('dt', { text: s.label }), el('dd', { text: String(s.value) })]);
          }))
        : null;
      var meta = [a.author ? 'By ' + a.author : '', fmtDate(a.date), readingTime(a) + ' min read'].filter(Boolean).join(', ');
      var msg = el('span', { class: 'share__msg', role: 'status' });
      var copy = el('button', { type: 'button', class: 'btn btn--quiet', text: 'Copy link' });
      copy.addEventListener('click', function () {
        if (navigator.clipboard) { navigator.clipboard.writeText(location.href).then(function () { msg.textContent = 'Link copied.'; }); }
      });
      var share = el('div', { class: 'share' }, [copy]);
      if (navigator.share) {
        var native = el('button', { type: 'button', class: 'btn btn--quiet', text: 'Share' });
        native.addEventListener('click', function () { navigator.share({ title: a.title, url: location.href }).catch(function () {}); });
        share.appendChild(native);
      }
      share.appendChild(msg);
      var related = el('section', { class: 'article__related' });
      var wrap = el('div', {}, [
        a.section ? el('p', { class: 'article__section', text: cap(a.section) }) : null,
        el('h1', { text: a.title }),
        a.standfirst ? el('p', { class: 'article__stand', text: a.standfirst }) : null,
        el('p', { class: 'article__meta', text: meta }),
        hero ? el('figure', { class: 'article__hero' }, [el('img', { src: hero, alt: (a.heroImage && a.heroImage.alt) || '' }), a.heroImage && a.heroImage.caption ? el('figcaption', { text: a.heroImage.caption }) : null]) : null,
        stats, body,
        (a.tags || []).length ? el('ul', { class: 'tags', 'aria-label': 'Tags' }, a.tags.map(function (t) { return el('li', { text: t }); })) : null,
        share, related
      ]);
      var rel = (a.related || []).map(function (id) { return all.filter(function (x) { return x.slug === id || x.id === id; })[0]; }).filter(Boolean);
      if (rel.length) {
        related.appendChild(el('h2', { text: 'Related' }));
        related.appendChild(el('div', { class: 'story-grid' }, rel.map(function (r) { return storyCard(r, false); })));
      } else { related.remove(); }
      var disc = document.getElementById('discussion');
      articleRoot.replaceChildren(wrap);
      if (disc) { articleRoot.appendChild(disc); }
    });
  }

  /* ---------- players and teams ---------- */
  function renderCards(box, list, kind) {
    var cards = list.map(function (p) {
      var href = '/' + kind + '/profile/?id=' + encodeURIComponent(p.id || '');
      var line = kind === 'players' ? [p.position, p.team].filter(Boolean).join(', ') : [p.competition, p.location].filter(Boolean).join(', ');
      return el('div', { class: 'card' }, [el('h3', {}, [el('a', { href: href, text: p.name || 'Unnamed' })]), line ? el('p', { text: line }) : null]);
    });
    box.replaceChildren(el('div', { class: 'cards' }, cards));
  }
  var listBox = document.querySelector('[data-render="players"], [data-render="teams"]');
  if (listBox) {
    var kind = listBox.getAttribute('data-render');
    var search = document.getElementById('list-search');
    J.load(kind).then(function (all) {
      if (!all.length) { return; }
      if (search) { search.disabled = false; }
      var draw = function () {
        var q = search ? search.value.trim().toLowerCase() : '';
        var list = all.filter(function (x) { return !q || (x.name || '').toLowerCase().indexOf(q) > -1; });
        if (list.length) { renderCards(listBox, list, kind); }
        else { listBox.replaceChildren(emptyState('No matches.', 'Try a different name.')); }
      };
      if (search) { search.addEventListener('input', draw); }
      draw();
    });
  }
  var profileRoot = document.getElementById('profile-root');
  if (profileRoot) {
    var pkind = profileRoot.getAttribute('data-kind');
    var pid = new URLSearchParams(location.search).get('id');
    J.load(pkind).then(function (all) {
      var p = all.filter(function (x) { return x.id === pid; })[0];
      if (!p) { return; }
      document.title = p.name + ' | Jacklers';
      var facts = pkind === 'players'
        ? [['Position', p.position], ['Team', p.team], ['Date of birth', p.dateOfBirth ? fmtDate(p.dateOfBirth) : ''], ['Nationality', p.nationality]]
        : [['Competition', p.competition], ['Location', p.location]];
      var dl = el('dl', { class: 'article__stats' }, facts.filter(function (f) { return f[1]; }).map(function (f) {
        return el('div', {}, [el('dt', { text: f[0] }), el('dd', { text: String(f[1]) })]);
      }));
      var img = safeUrl(p.profileImage || p.logo);
      profileRoot.replaceChildren(el('div', {}, [
        el('h1', { text: p.name }),
        img ? el('img', { src: img, alt: '', style: 'max-width:16rem;margin:1.5rem 0' }) : null,
        dl
      ]));
    });
  }

  /* ---------- fixtures and results ---------- */
  var fixBox = document.querySelector('[data-render="matches"]');
  if (fixBox) {
    var comp = document.getElementById('filter-competition');
    var seas = document.getElementById('filter-season');
    J.load('matches').then(function (all) {
      if (!all.length) { return; }
      var uniq = function (key) { var o = {}; all.forEach(function (m) { if (m[key]) { o[m[key]] = true; } }); return Object.keys(o).sort(); };
      uniq('competition').forEach(function (v) { comp.appendChild(el('option', { value: v, text: v })); });
      uniq('season').forEach(function (v) { seas.appendChild(el('option', { value: v, text: v })); });
      comp.disabled = seas.disabled = false;
      var draw = function () {
        var list = all.filter(function (m) { return (!comp.value || m.competition === comp.value) && (!seas.value || m.season === seas.value); }).sort(byDateDesc);
        if (!list.length) { fixBox.replaceChildren(emptyState('No matches for this selection.', '')); return; }
        fixBox.replaceChildren(el('div', { class: 'rows' }, list.map(function (m) {
          var score = m.status === 'scheduled' || m.homeScore === undefined ? 'v' : m.homeScore + ' to ' + m.awayScore;
          return el('div', { class: 'row' }, [
            el('span', { class: 'row__meta', text: fmtDate(m.date) }),
            el('span', { text: (m.homeTeam || '') + ' ' + score + ' ' + (m.awayTeam || '') }),
            el('span', { class: 'row__meta', text: [m.competition, m.venue].filter(Boolean).join(', ') })
          ]);
        })));
      };
      comp.addEventListener('change', draw); seas.addEventListener('change', draw); draw();
    });
  }

  /* ---------- global search ---------- */
  var searchForm = document.getElementById('search-form');
  if (searchForm) {
    var out = document.getElementById('search-results');
    var qInput = document.getElementById('q');
    var run = function (q) {
      Promise.all([J.load('articles'), J.load('players'), J.load('teams'), J.load('schools')]).then(function (sets) {
        var total = sets.reduce(function (n, s) { return n + s.length; }, 0);
        if (!total) { out.replaceChildren(emptyState('Nothing to search yet.', 'Jacklers has not published any content.')); return; }
        if (!q) { out.replaceChildren(); return; }
        var needle = q.toLowerCase();
        var hit = function (x) { return [x.title, x.name, x.standfirst, (x.tags || []).join(' ')].join(' ').toLowerCase().indexOf(needle) > -1; };
        var rows = [];
        sets[0].filter(hit).forEach(function (a) { rows.push(el('div', { class: 'card' }, [el('h3', {}, [el('a', { href: '/article/?slug=' + encodeURIComponent(a.slug), text: a.title })]), el('p', { text: 'Article' })])); });
        sets[1].filter(hit).forEach(function (p) { rows.push(el('div', { class: 'card' }, [el('h3', {}, [el('a', { href: '/players/profile/?id=' + encodeURIComponent(p.id), text: p.name })]), el('p', { text: 'Player' })])); });
        sets[2].filter(hit).forEach(function (t) { rows.push(el('div', { class: 'card' }, [el('h3', {}, [el('a', { href: '/teams/profile/?id=' + encodeURIComponent(t.id), text: t.name })]), el('p', { text: 'Team' })])); });
        sets[3].filter(hit).forEach(function (s) { rows.push(el('div', { class: 'card' }, [el('h3', { text: s.name }), el('p', { text: 'School' })])); });
        if (rows.length) { out.replaceChildren(el('div', { class: 'cards' }, rows)); }
        else { out.replaceChildren(emptyState('No results for "' + q + '".', 'Check the spelling or try a broader term.')); }
      });
    };
    var initial = new URLSearchParams(location.search).get('q') || '';
    qInput.value = initial;
    searchForm.addEventListener('submit', function (e) { e.preventDefault(); run(qInput.value.trim()); });
    if (initial) { run(initial); }
  }
})();
