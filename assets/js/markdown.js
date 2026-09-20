/* Jacklers content helpers.
   One file, used in two places so they can never drift apart:
   - the editor at /admin (live preview, saving)
   - build.js on Vercel (turning articles into web pages)
   All text is HTML-escaped; only a small set of Markdown features is supported. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.JacklersContent = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    u = String(u).trim();
    return /^(https?:\/\/|\/)/i.test(u) ? u : '';
  }

  /* ---- inline: **bold**, *italic*, [text](url) ---- */
  function inline(text) {
    var s = esc(text);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var clean = safeUrl(url.replace(/&amp;/g, '&'));
      if (!clean) { return label; }
      var ext = /^https?:\/\//i.test(clean) ? ' rel="noopener noreferrer" target="_blank"' : '';
      return '<a href="' + esc(clean) + '"' + ext + '>' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return s;
  }

  /* ---- blocks ---- */
  function render(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], para = [], i = 0;
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    while (i < lines.length) {
      var line = lines[i], m;
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        flush();
        var lvl = m[1].length === 3 ? 3 : 2;
        out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>'); i++; continue;
      }
      if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/))) {
        flush();
        var src = safeUrl(m[2]);
        if (src) {
          out.push('<figure><img src="' + esc(src) + '" alt="' + esc(m[1]) + '" loading="lazy">' +
            (m[3] ? '<figcaption>' + esc(m[3]) + '</figcaption>' : '') + '</figure>');
        }
        i++; continue;
      }
      if (/^>\s?/.test(line)) {
        flush();
        var q = [], cite = '';
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          var t = lines[i].replace(/^>\s?/, '').trim();
          if (/^(—|--)\s+/.test(t)) { cite = t.replace(/^(—|--)\s+/, ''); } else if (t) { q.push(t); }
          i++;
        }
        out.push('<blockquote>' + inline(q.join(' ')) + (cite ? '<cite>' + inline(cite) + '</cite>' : '') + '</blockquote>');
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        flush();
        var items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^[-*]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (/^\d+[.)]\s+/.test(line)) {
        flush();
        var oitems = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) { oitems.push('<li>' + inline(lines[i].replace(/^\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + oitems.join('') + '</ol>'); continue;
      }
      if (/^---+\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
      para.push(line.trim()); i++;
    }
    flush();
    return out.join('\n');
  }

  /* ---- front matter: a few "key: value" lines between --- lines, then the body ---- */
  function parse(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    var meta = {}, body = text;
    if (text.indexOf('---\n') === 0) {
      var end = text.indexOf('\n---', 4);
      if (end > -1) {
        text.slice(4, end).split('\n').forEach(function (ln) {
          var k = ln.indexOf(':');
          if (k < 1) { return; }
          var key = ln.slice(0, k).trim(), val = ln.slice(k + 1).trim();
          if (val.charAt(0) === '"') { try { val = JSON.parse(val); } catch (e) { val = val.replace(/^"|"$/g, ''); } }
          else if (val === 'true') { val = true; } else if (val === 'false') { val = false; }
          meta[key] = val;
        });
        body = text.slice(end + 4).replace(/^\n+/, '');
      }
    }
    if (typeof meta.tags === 'string') { meta.tags = meta.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean); }
    if (!meta.tags) { meta.tags = []; }
    return { meta: meta, body: body };
  }

  var ORDER = ['title', 'slug', 'status', 'date', 'author', 'standfirst', 'tags', 'featured', 'heroImage', 'heroAlt', 'heroCaption'];
  function serialize(meta, body) {
    var lines = ['---'];
    ORDER.forEach(function (k) {
      var v = meta[k];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) { return; }
      if (Array.isArray(v)) { v = v.join(', '); }
      if (typeof v === 'string') {
        v = v.replace(/\s*\n\s*/g, ' ');
        if (/^["'\s]|["'\s]$/.test(v)) { v = JSON.stringify(v); }
      }
      lines.push(k + ': ' + v);
    });
    lines.push('---', '', String(body || '').replace(/\r\n?/g, '\n').trim(), '');
    return lines.join('\n');
  }

  function slugify(s) {
    return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  }
  function readingTime(body) {
    var words = String(body || '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  }

  return { esc: esc, safeUrl: safeUrl, render: render, parse: parse, serialize: serialize, slugify: slugify, readingTime: readingTime };
});
