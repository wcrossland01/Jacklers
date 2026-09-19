# Jacklers site

An empty-but-complete rugby publication site. There is no editorial content: every list is empty and shows a designed empty state until real records are added.

## Put it live safely
1. In GitHub, open the repo and create a new branch (e.g. `rebuild`). Do not work on `main`, because pushes to `main` go live on jacklers.co.uk.
2. Add these files to the branch (keep the folder structure). `index.html` replaces the old one.
3. Vercel creates a private preview link for the branch. Check it on desktop and phone.
4. When happy, merge the branch into `main`.

The site is plain HTML, CSS and JavaScript. It needs no build step on Vercel.

## Changing the site name or shared text
Edit the CONFIG block at the top of `build.py`, then run `python3 build.py`. This regenerates every page. It never overwrites files in `/data`.

## Adding content
Each file in `/data` is a list. Add a record and the matching pages fill in automatically.

**data/articles.json** (example shape)
```json
{
  "id": "a1", "slug": "my-first-piece", "title": "Headline", "section": "analysis",
  "author": "Name", "date": "2026-10-01", "standfirst": "One or two lines.",
  "heroImage": { "src": "/images/piece.jpg", "alt": "…", "caption": "…" },
  "body": ["Paragraph.", {"type":"heading","text":"Subhead"}, {"type":"pullquote","text":"…","attribution":"…"},
           {"type":"image","src":"/images/x.jpg","alt":"…","caption":"…"}],
  "statistics": [{"label":"Metres carried","value":"120"}],
  "tags": ["Premiership"], "related": ["another-slug"], "featured": false, "readingTime": 5
}
```
`section` is one of `analysis`, `recruitment`, `schoolboy`. Articles open at `/article/?slug=my-first-piece`.

**players.json**: id, name, position, dateOfBirth, nationality, team, profileImage, statistics, articles
**teams.json**: id, name, competition, logo, location, squad, fixtures, results, statistics
**matches.json**: id, competition, season, date, venue, homeTeam, awayTeam, homeScore, awayScore, status, statistics
**authors.json, competitions.json, schools.json**: ready for future use

## Data architecture (future)
```
Rugby data provider -> Backend / data layer -> Jacklers database -> Jacklers calculated metrics -> Website
```
API keys must never appear in front-end code. The website only talks to Jacklers' own backend. Today the site reads `/data/*.json`; to switch to a backend, change `J.dataSource` at the top of `assets/js/site.js`.

## Known limits (deliberate, for now)
- Article and profile pages are filled in by JavaScript in the browser. That is fine while the site is empty. Before publishing lots of articles, move to pre-rendered article pages so search engines see them fully.
- The newsletter form is interface only. It sends and stores nothing, and says so.
- No social sharing image yet. Add one when there is a logo.
- No accounts, comments, payments, advertising, gambling or live data.
- Privacy, Terms and Community Guidelines are placeholders and must be properly written before launch.
