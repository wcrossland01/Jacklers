# Jacklers

Jacklers is an independent rugby union publication site, live at
**jacklers.co.uk**, hosted on Vercel and deployed from the `main` branch.
It is a static site: plain HTML, CSS and JavaScript, with two small
build scripts (one Python, one Node) and no other dependencies.

## Standing rules

These apply to every session working in this repository, no exceptions:

1. **Never push to `main`.** Always create a new branch and open a pull
   request. `main` is the live site — a bad push there is a bad push to
   production, immediately.
2. **Never touch DNS, domain, email or hosting settings.** Nothing in
   this repo configures those, and no session should go looking for a
   way to change them (Vercel project settings, domain registrar, email
   records, etc. are all out of scope).
3. **No fake content.** Never invent articles, players, statistics,
   results or quotes. If real content isn't available, leave the
   relevant list or field empty rather than fabricating something
   plausible-looking.
4. **No gambling, betting or affiliate content**, anywhere on the site.
5. **Never delete or rewrite anything already in `content/articles/` or
   `images/`.** These are real editorial content and uploaded images,
   not generated files. Adding new files is fine; touching existing
   ones is not.
6. **Rugby union only, British English throughout.** Spelling,
   terminology and idiom should read as British English, and all
   content and examples should be rugby union (not rugby league or
   any other sport).

## Project structure

- **`build.py`** — the site-wide generator. A `CONFIG` block at the top
  (site name, tagline, nav, base URL) drives every static page it
  writes: home, `/articles/`, `/community/`, `/newsletter/`,
  `/search/`, `/about/`, `/contact/`, `/privacy/`, `/terms/`,
  `/community-guidelines/`, `404.html`, `sitemap.xml` and `robots.txt`.
  It also writes `templates/article-shell.html` (the shared
  header/footer wrapper that `build.js` uses for article pages) and
  only creates `data/articles.json` / `data/authors.json` if they don't
  already exist — it never overwrites real content. Run this after
  changing global site text, navigation or page templates.

- **`build.js`** — the actual Vercel build command (see `vercel.json`,
  `buildCommand: "node build.js"`, output directory `dist`). On every
  deploy it copies the whole public site into `dist/`, then reads every
  `.md` file in `content/articles/`, keeps only those with
  `status: published` and a valid title/date/slug, and renders each
  into `dist/articles/<slug>/index.html` using
  `templates/article-shell.html`. It also writes
  `dist/data/articles.json` (the index used by the home page, articles
  list and search) and appends article URLs to `sitemap.xml`.
  `build.js` depends on `templates/article-shell.html`, which only
  `build.py` produces — so `build.py` must have been run at least once
  for `build.js` to have a shell to use.

- **`content/articles/`** — one Markdown file per article, with
  frontmatter (`title`, `slug`, `status: draft|published`, `date` as
  `YYYY-MM-DD`, `author`, `standfirst`, `tags`, `featured`,
  `heroImage`, `heroAlt`, `heroCaption`) followed by a Markdown body.
  This is real editorial content — see rule 5 above.

- **`admin/index.html`** — a private, client-side article editor
  (`noindex`, excluded from the public build). It stores a
  user-supplied GitHub token in the browser and commits `.md` files
  straight to `content/articles/` on `main` via the GitHub API, with no
  backend involved. This is the existing editorial workflow for
  publishing articles; it is separate from anything a Claude session
  does, and rule 1 above is about Claude's own changes, not this tool.

- **`assets/js/pitch.js`** — the decorative animated rugby match on the
  homepage hero: a self-contained canvas simulation (15-a-side, a
  referee, a ball) with simplified rugby-union physics/rules. Purely
  client-side and cosmetic; no data leaves the browser.

- **`assets/js/markdown.js`** — the frontmatter/Markdown parser shared
  between `build.js` and `admin/index.html`.

- **`data/*.json`** — articles, teams, players, matches, authors,
  competitions, schools. Currently empty placeholder lists.

- **`vercel.json`** — the build command/output directory, plus
  redirects for legacy paths (`analysis/`, `article/`, `players/`,
  `teams/`, `schoolboy/`, `statistics/`, `recruitment/`, `fixtures/`)
  that are no longer part of the site.

- Top-level generated pages (`index.html`, `articles/index.html`, etc.)
  are outputs of `build.py` — edit the generator, not these files
  directly.

## Testing changes

- `python3 build.py` — regenerates every static shell page. Run this
  after any change to `build.py`'s CONFIG or page templates, and check
  `git diff` to see exactly what changed.
- `node build.js` — runs the same build Vercel runs, producing `dist/`.
  Use this to verify article pages render correctly (frontmatter
  parses, drafts are excluded, `dist/data/articles.json` and
  `sitemap.xml` look right) before pushing.

Both scripts have no external dependencies — no `npm install` or `pip
install` is needed to run them.
