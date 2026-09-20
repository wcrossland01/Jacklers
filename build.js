#!/usr/bin/env node
/* Jacklers site build (runs on Vercel at every deploy; can also be run locally: node build.js)
   - copies the public site into /dist (drafts and source files are NOT copied)
   - turns each published article in /content/articles into /dist/articles/<slug>/index.html
   - writes /dist/data/articles.json (the index used by the home page, list and search)
   - adds the articles to /dist/sitemap.xml
   No packages needed. */
const fs = require('fs');
const path = require('path');
const C = require('./assets/js/markdown.js');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const BASE = 'https://jacklers.co.uk';
const SITE = 'Jacklers';
const RESERVED = new Set(['index']);
// Top-level items that must never be published
const IGNORE = new Set(['dist', 'content', 'node_modules', '.git', '.github', 'templates',
  'build.js', 'build.py', 'package.json', 'package-lock.json', 'vercel.json', 'README.md']);

function copyDir(src, dest, top) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === '.DS_Store' || (top && IGNORE.has(name))) continue;
    const s = path.join(src, name), d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d, false); else fs.copyFileSync(s, d);
  }
}

const GOALPOSTS = '<svg class="empty__icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M14 6v20M34 6v20M14 26h20M24 26v16M17 42h14"/></svg>';

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function jsonForScript(o) { return JSON.stringify(o).replace(/</g, '\\u003c'); }

function loadArticles() {
  const dir = path.join(ROOT, 'content', 'articles');
  const out = [], seen = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const { meta, body } = C.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const slug = C.slugify(meta.slug || file.replace(/\.md$/, ''));
    if (meta.status !== 'published') { console.log('  skipped (not published): ' + file); continue; }
    if (!meta.title) { console.warn('  WARNING skipped (no title): ' + file); continue; }
    if (!slug || RESERVED.has(slug) || seen.has(slug)) { console.warn('  WARNING skipped (bad or duplicate web address): ' + file); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.date || ''))) { console.warn('  WARNING skipped (date must look like 2026-10-01): ' + file); continue; }
    seen.add(slug);
    out.push({ slug, meta, body });
  }
  out.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));
  return out;
}

function articleMain(a) {
  const m = a.meta, e = C.esc;
  const mins = C.readingTime(a.body);
  const byline = [m.author ? 'By ' + e(m.author) : '', e(fmtDate(m.date)), mins + ' min read'].filter(Boolean).join(', ');
  const heroSrc = C.safeUrl(m.heroImage || '');
  const hero = heroSrc ? '<figure class="article__hero"><img src="' + e(heroSrc) + '" alt="' + e(m.heroAlt || '') + '">' +
    (m.heroCaption ? '<figcaption>' + e(m.heroCaption) + '</figcaption>' : '') + '</figure>' : '';
  const tags = m.tags.length ? '<ul class="tags" aria-label="Tags">' + m.tags.map(t => '<li>' + e(t) + '</li>').join('') + '</ul>' : '';
  return '<div class="article">' +
    '<h1>' + e(m.title) + '</h1>' +
    (m.standfirst ? '<p class="article__stand">' + e(m.standfirst) + '</p>' : '') +
    '<p class="article__meta">' + byline + '</p>' + hero +
    '<div class="article__body">' + C.render(a.body) + '</div>' + tags +
    '<div class="share"><button type="button" class="btn btn--quiet" data-copy-link>Copy link</button>' +
    '<button type="button" class="btn btn--quiet" data-share hidden>Share</button><span class="share__msg" role="status"></span></div>' +
    '<section class="discussion" id="discussion" aria-labelledby="disc-t"><h2 id="disc-t" style="font-size:1.5rem">Community discussion</h2>' +
    '<div class="empty">' + GOALPOSTS + '<div><p class="empty__title">Community discussion: coming soon.</p></div></div></section>' +
    '</div>';
}

function articleMeta(a) {
  const m = a.meta, e = C.esc;
  const url = BASE + '/articles/' + a.slug + '/';
  const plain = a.body.replace(/[#>*_\[\]!()`-]/g, ' ').replace(/\s+/g, ' ').trim();
  const desc = m.standfirst || plain.slice(0, 155);
  const title = m.title + ' | ' + SITE;
  const img = C.safeUrl(m.heroImage || '');
  const imgAbs = img ? (img.startsWith('/') ? BASE + img : img) : '';
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: m.title, datePublished: m.date,
    author: m.author ? [{ '@type': 'Person', name: m.author }] : undefined,
    publisher: { '@type': 'Organization', name: SITE }, mainEntityOfPage: url, image: imgAbs ? [imgAbs] : undefined,
    description: desc };
  return [
    '<title>' + e(title) + '</title>',
    '<meta name="description" content="' + e(desc) + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta name="theme-color" content="#0A1120">',
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="' + SITE + '">',
    '<meta property="og:locale" content="en_GB">',
    '<meta property="og:title" content="' + e(title) + '">',
    '<meta property="og:description" content="' + e(desc) + '">',
    '<meta property="og:url" content="' + url + '">',
    imgAbs ? '<meta property="og:image" content="' + e(imgAbs) + '">' : '',
    '<meta property="article:published_time" content="' + e(m.date) + '">',
    '<meta name="twitter:card" content="' + (imgAbs ? 'summary_large_image' : 'summary') + '">',
    '<meta name="twitter:title" content="' + e(title) + '">',
    '<meta name="twitter:description" content="' + e(desc) + '">',
    imgAbs ? '<meta name="twitter:image" content="' + e(imgAbs) + '">' : '',
    '<script type="application/ld+json">' + jsonForScript(ld) + '</script>'
  ].filter(Boolean).join('\n');
}

function main() {
  console.log('Jacklers build');
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(ROOT, DIST, true);

  const shellPath = path.join(ROOT, 'templates', 'article-shell.html');
  if (!fs.existsSync(shellPath)) throw new Error('templates/article-shell.html is missing');
  const shell = fs.readFileSync(shellPath, 'utf8');

  const articles = loadArticles();
  const index = [];
  for (const a of articles) {
    const html = shell.replace('{{META}}', () => articleMeta(a)).replace('{{MAIN}}', () => articleMain(a));
    const dir = path.join(DIST, 'articles', a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    const m = a.meta;
    index.push({ slug: a.slug, title: m.title, standfirst: m.standfirst || '', author: m.author || '', date: m.date,
      tags: m.tags, featured: m.featured === true,
      heroImage: C.safeUrl(m.heroImage || '') ? { src: m.heroImage, alt: m.heroAlt || '' } : undefined,
      readingTime: C.readingTime(a.body) });
    console.log('  published: /articles/' + a.slug + '/');
  }
  fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'data', 'articles.json'), JSON.stringify(index, null, 2) + '\n');

  const smPath = path.join(DIST, 'sitemap.xml');
  if (fs.existsSync(smPath) && articles.length) {
    const extra = articles.map(a => '<url><loc>' + BASE + '/articles/' + a.slug + '/</loc><lastmod>' + a.meta.date + '</lastmod></url>').join('');
    fs.writeFileSync(smPath, fs.readFileSync(smPath, 'utf8').replace('</urlset>', extra + '</urlset>'));
  }
  console.log('Done: ' + articles.length + ' article(s) published.');
}

main();
