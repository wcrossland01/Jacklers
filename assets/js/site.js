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
    var href = '/articles/' + encodeURIComponent(a.slug || '') + '/';
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
      var items = all.filter(function (a) { return !section || a.section === section; });
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

  /* ---------- share buttons on article pages ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy-link]'), function (btn) {
    var msg = btn.parentNode.querySelector('.share__msg');
    btn.addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href.split('#')[0]).then(function () { if (msg) { msg.textContent = 'Link copied.'; } });
      }
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-share]'), function (btn) {
    if (!navigator.share) { return; }
    btn.hidden = false;
    btn.addEventListener('click', function () { navigator.share({ title: document.title, url: location.href.split('#')[0] }).catch(function () {}); });
  });

  /* ---------- global search (articles) ---------- */
  var searchForm = document.getElementById('search-form');
  if (searchForm) {
    var out = document.getElementById('search-results');
    var qInput = document.getElementById('q');
    var run = function (q) {
      J.load('articles').then(function (all) {
        if (!all.length) { out.replaceChildren(emptyState('Nothing to search yet.', 'Jacklers has not published any articles.')); return; }
        if (!q) { out.replaceChildren(); return; }
        var needle = q.toLowerCase();
        var hits = all.filter(function (x) {
          return [x.title, x.standfirst, (x.tags || []).join(' ')].join(' ').toLowerCase().indexOf(needle) > -1;
        });
        if (hits.length) { renderStories(out, hits.sort(byDateDesc)); }
        else { out.replaceChildren(emptyState('No results for "' + q + '".', 'Check the spelling or try a broader term.')); }
      });
    };
    var initial = new URLSearchParams(location.search).get('q') || '';
    qInput.value = initial;
    searchForm.addEventListener('submit', function (e) { e.preventDefault(); run(qInput.value.trim()); });
    if (initial) { run(initial); }
  }
})();
