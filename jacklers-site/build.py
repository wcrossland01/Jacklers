#!/usr/bin/env python3
"""Jacklers static site generator.

Run:  python3 build.py
It rewrites every page from the templates below. Change SITE_NAME (or anything
else in the CONFIG block) and run it again to update the whole site.
Nothing here contains editorial content: all lists start empty.
"""
import json
import os
from html import escape

# ------------------------------------------------------------------ CONFIG
SITE_NAME = "Jacklers"                       # single global site name
TAGLINE = "The rugby publication serious fans have been waiting for."
POSITIONING = "Independent rugby journalism, analysis, data and talent intelligence."
BASE_URL = "https://jacklers.co.uk"
LASTMOD = "2026-09-19"
ROOT = os.path.dirname(os.path.abspath(__file__))

NAV = [
    ("Home", "/"),
    ("Analysis", "/analysis/"),
    ("Recruitment", "/recruitment/"),
    ("Schoolboy", "/schoolboy/"),
    ("Statistics", "/statistics/"),
    ("Players", "/players/"),
    ("Teams", "/teams/"),
    ("Fixtures & Results", "/fixtures/"),
    ("Community", "/community/"),
    ("Newsletter", "/newsletter/"),
]
INFO = [("About", "/about/"), ("Contact", "/contact/"), ("Privacy", "/privacy/"),
        ("Terms", "/terms/"), ("Community Guidelines", "/community-guidelines/")]

E = escape

# ------------------------------------------------------------------ PARTS
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600'
         '&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap">')

GOALPOSTS = ('<svg class="empty__icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" '
             'stroke-linecap="round" aria-hidden="true"><path d="M14 6v20M34 6v20M14 26h20M24 26v16M17 42h14"/></svg>')

SEARCH_ICON = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
               'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>')


def empty(title, text="", wide=False, extra=""):
    cls = "empty empty--wide" if wide else "empty"
    body = f'<p class="empty__title">{E(title)}</p>'
    if text:
        body += f'<p class="empty__text">{E(text)}</p>'
    return f'<div class="{cls}"{extra}>{GOALPOSTS}<div>{body}</div></div>'


def head(title, desc, path, noindex=False):
    full_title = title if path == "/" else f"{title} | {SITE_NAME}"
    url = BASE_URL + path
    robots = '<meta name="robots" content="noindex">' if noindex else ""
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(full_title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}">
{robots}
<meta name="theme-color" content="#0A1120">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(SITE_NAME)}">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="{E(full_title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{E(full_title)}">
<meta name="twitter:description" content="{E(desc)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
{FONTS}
<link rel="stylesheet" href="/assets/css/site.css">
</head>
"""


def header(path):
    items = []
    for label, href in NAV:
        cur = ' aria-current="page"' if href == path else ""
        cls = ' class="nav__cta"' if label == "Newsletter" else ""
        items.append(f'<li{cls}><a href="{href}"{cur}>{E(label)}</a></li>')
    return f"""<body>
<a class="skip-link" href="#main">Skip to content</a>
<template id="tpl-empty-icon">{GOALPOSTS}</template>
<header class="site-header on-dark">
<div class="wrap header-row">
<a class="brand" href="/">{E(SITE_NAME)}</a>
<nav class="nav" id="site-nav" aria-label="Primary"><ul>{''.join(items)}</ul></nav>
<div class="header-tools">
<a class="icon-btn" href="/search/" aria-label="Search">{SEARCH_ICON}</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
</div>
</div>
</header>
<main id="main">
"""


def signup(form_id):
    return f"""<form class="signup" data-newsletter novalidate>
<label class="visually-hidden" for="{form_id}">Email address</label>
<input id="{form_id}" type="email" name="email" placeholder="Email address" autocomplete="email" required>
<button class="btn" type="submit">Subscribe</button>
<p class="signup__msg" role="status"></p>
</form>"""


def newsletter_block(form_id="nl-main"):
    return f"""<section class="newsletter on-dark" aria-labelledby="nl-title-{form_id}">
<div class="wrap">
<div><h2 id="nl-title-{form_id}">The Jacklers Brief</h2>
<p>Sharp rugby analysis, emerging talent and the stories behind the numbers.</p></div>
{signup(form_id)}
</div>
</section>
"""


def footer():
    explore = "".join(f'<li><a href="{h}">{E(l)}</a></li>' for l, h in NAV if l != "Newsletter")
    info = "".join(f'<li><a href="{h}">{E(l)}</a></li>' for l, h in INFO)
    return f"""</main>
<footer class="site-footer on-dark">
<div class="wrap footer-grid">
<div><p class="footer-brand">{E(SITE_NAME)}</p><p>{E(TAGLINE)}</p></div>
<div><h2>Explore</h2><ul>{explore}</ul></div>
<div><h2>Information</h2><ul>{info}</ul></div>
<div><h2>Newsletter</h2><p>The Jacklers Brief</p>{signup("nl-footer")}</div>
</div>
<div class="wrap footer-base">&copy; <span data-year>2026</span> {E(SITE_NAME)}. Independent rugby publication in development.</div>
</footer>
<script src="/assets/js/site.js" defer></script>
</body>
</html>
"""


def page_head(title, lead):
    return f"""<section class="page-head on-dark"><div class="wrap">
<h1>{E(title)}</h1><p>{E(lead)}</p>
</div></section>
"""


def block(inner, extra_cls=""):
    return f'<section class="block {extra_cls}"><div class="wrap">{inner}</div></section>\n'


def block_head(title, link=None, sub=None):
    a = f'<a href="{link[1]}">{E(link[0])}</a>' if link else ""
    s = f"<p>{E(sub)}</p>" if sub else ""
    return f'<div class="block__head"><div><h2>{title}</h2>{s}</div>{a}</div>'


def write(path, html):
    fs = os.path.join(ROOT, path.strip("/"), "index.html") if path != "/" else os.path.join(ROOT, "index.html")
    os.makedirs(os.path.dirname(fs), exist_ok=True)
    with open(fs, "w", encoding="utf-8") as f:
        f.write(html)


def build_page(path, title, desc, body, noindex=False):
    write(path, head(title, desc, path, noindex) + header(path) + body + footer())


# ------------------------------------------------------------------ PAGES
PITCH = """<svg class="hero__pitch" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<path pathLength="1" d="M60 70H1140V570H60Z"/>
<path pathLength="1" d="M170 70V570M1030 70V570"/>
<path pathLength="1" d="M380 70V570M820 70V570"/>
<path pathLength="1" d="M150 250V320M190 250V320M150 320H190M170 320V370"/>
<path pathLength="1" d="M1010 250V320M1050 250V320M1010 320H1050M1030 320V370"/>
<path pathLength="1" d="M60 320H170M1030 320H1140"/>
<path pathLength="1" class="is-halfway" d="M600 70V570"/>
</svg>"""


def home():
    hero = f"""<section class="hero on-dark">
{PITCH}
<div class="wrap hero__inner">
<h1><span class="hero__name">{E(SITE_NAME)}</span><span class="hero__line">{E(TAGLINE)}</span></h1>
<p class="hero__support">{E(POSITIONING)}</p>
<a class="btn" href="/newsletter/">Subscribe to the Newsletter</a>
</div>
</section>
"""
    latest = block(
        block_head("Latest") +
        '<div data-render="articles" data-limit="6" data-lead>' +
        empty("No stories published yet.", "Jacklers is preparing its first stories.", wide=True) + "</div>")
    pair1 = block(
        '<div class="pair"><div>' + block_head("Analysis", ("Go to Analysis", "/analysis/")) +
        '<div data-render="articles" data-section="analysis" data-limit="3">' + empty("Analysis coming soon.") + "</div></div><div>" +
        block_head("Recruitment", ("Go to Recruitment", "/recruitment/")) +
        '<div data-render="articles" data-section="recruitment" data-limit="3">' + empty("Recruitment intelligence coming soon.") + "</div></div></div>")
    pair2 = block(
        '<div class="pair"><div>' + block_head("Schoolboy", ("Go to Schoolboy", "/schoolboy/")) +
        '<div data-render="articles" data-section="schoolboy" data-limit="3">' + empty("Schoolboy coverage coming soon.") + "</div></div><div>" +
        block_head("Statistics", ("Go to Statistics", "/statistics/")) +
        empty("Jacklers statistics are coming soon.") + "</div></div>")
    build_page("/", f"{SITE_NAME}: independent rugby journalism, analysis and data",
               POSITIONING + " " + TAGLINE, hero + latest + pair1 + pair2 + newsletter_block())


def section_page(path, title, lead, desc, section, empty_msg):
    filters = """<div class="filters">
<div class="field"><label for="filter-tag">Topic</label><select id="filter-tag" disabled><option value="">All topics</option></select></div>
<div class="field"><label for="filter-sort">Order</label><select id="filter-sort" disabled><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
</div>"""
    body = page_head(title, lead)
    body += block(block_head("Featured") + '<div data-featured>' + empty("No featured article yet.", "The featured story appears here once one is chosen.") + "</div>")
    body += block(block_head("Latest") + filters +
                  f'<div data-render="articles" data-section="{section}" data-paged>' + empty(empty_msg, "Jacklers is preparing its first stories.", wide=True) + "</div>" +
                  '<nav class="pager" id="pager" aria-label="Pagination" hidden></nav>')
    body += newsletter_block()
    build_page(path, title, desc, body)


def panel_page(path, title, lead, desc, panels):
    cells = "".join(f'<section class="panel"><h2>{t}</h2>{empty(msg)}</section>' for t, msg in panels)
    build_page(path, title, desc, page_head(title, lead) + block(f'<div class="panels">{cells}</div>') + newsletter_block())


def statistics():
    picker_items = ["Competition", "Season", "Team", "Player", "Position", "Statistic"]
    picker = '<div class="stat-picker">' + "".join(
        f'<div class="field"><label for="sp-{i}">{n}</label><select id="sp-{i}" disabled><option>Not available yet</option></select></div>'
        for i, n in enumerate(picker_items)) + "</div>"
    msg = "Statistics will appear here once Jacklers connects its rugby data source."

    def table(cols):
        th = "".join(f"<th scope=\"col\">{c}</th>" for c in cols)
        return (f'<div class="table-scroll"><table class="data"><thead><tr>{th}</tr></thead><tbody><tr><td class="is-empty" colspan="{len(cols)}">'
                f'{empty(msg)}</td></tr></tbody></table></div>')

    def compare(kind):
        slot = lambda n: (f'<div class="slot"><div class="field"><label for="c-{kind}-{n}">{kind} {n}</label>'
                          f'<select id="c-{kind}-{n}" disabled><option>Choose a {kind.lower()}</option></select></div></div>')
        return f'<div class="compare">{slot(1)}{slot(2)}</div><p class="stat-note">Comparison opens once there is data to compare.</p>'

    chart = ('<div class="chart-frame"><svg viewBox="0 0 600 180" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">'
             '<path d="M40 10V150H580"/><path d="M40 110H580M40 70H580M40 30H580" stroke-dasharray="3 5"/></svg>' + empty(msg) + "</div>")
    board = table(["Rank", "Name", "Team", "Value"])

    def sec(title, inner, sub=None):
        return block(block_head(title, sub=sub) + inner)

    body = page_head("Statistics", "Tables, leaderboards and comparisons, built on rugby data.")
    body += block(picker + f'<p class="stat-note">{E(msg)}</p>')
    body += sec("League tables", table(["Position", "Team", "Played", "Won", "Drawn", "Lost", "Points for", "Points against", "Points"]))
    body += sec("Player statistics", table(["Player", "Team", "Position", "Statistic", "Value"]))
    body += sec("Team statistics", table(["Team", "Competition", "Statistic", "Value"]))
    body += sec("Player comparison", compare("Player"))
    body += sec("Team comparison", compare("Team"))
    body += sec("Historical trends", chart)
    body += sec("Statistical leaderboards", board)
    body += sec("The Jacklers Index", empty("The Jacklers Index will live here.", "Nothing is scored or published yet."))
    body += newsletter_block()
    build_page("/statistics/", "Statistics", "Rugby tables, leaderboards and comparisons from Jacklers. Data is coming soon.", body)


def listing(path, title, lead, desc, kind, noun, filters_html, empty_title):
    body = page_head(title, lead)
    body += block(
        f'<div class="filters"><div class="field" style="min-width:16rem"><label for="list-search">Search {noun}</label>'
        f'<input id="list-search" type="search" disabled placeholder="Search by name"></div>{filters_html}</div>'
        f'<div data-render="{kind}">' + empty(empty_title, "", wide=True) + "</div>")
    body += newsletter_block()
    build_page(path, title, desc, body)


def sel(label, i):
    return f'<div class="field"><label for="f-{i}">{label}</label><select id="f-{i}" disabled><option>All</option></select></div>'


def profile_page(path, kind, title, empty_title, empty_text):
    body = page_head(title, "Profiles appear here once they are added.")
    body += f'<div class="wrap" style="padding-top:2.5rem;padding-bottom:4rem"><div id="profile-root" data-kind="{kind}">{empty(empty_title, empty_text, wide=True)}</div></div>'
    build_page(path, title, "Profile page template.", body, noindex=True)


def fixtures():
    filt = ('<div class="filters">'
            '<div class="field"><label for="filter-competition">Competition</label><select id="filter-competition" disabled><option value="">All competitions</option></select></div>'
            '<div class="field"><label for="filter-season">Season</label><select id="filter-season" disabled><option value="">All seasons</option></select></div>'
            '<div class="field"><label for="filter-date">Date</label><input id="filter-date" type="date" disabled></div></div>')
    body = page_head("Fixtures & Results", "Match dates, scores and league tables.")
    body += block(filt + '<div data-render="matches">' + empty("Fixtures and results will appear here once Jacklers connects to a rugby data provider.", "", wide=True) + "</div>")
    body += block(block_head("League tables") + empty("League tables will appear here once Jacklers connects to a rugby data provider."))
    body += newsletter_block()
    build_page("/fixtures/", "Fixtures & Results", "Rugby fixtures, results and league tables from Jacklers. Coming soon.", body)


def community():
    later = "".join(f"<li>{i}</li>" for i in ["Comments", "Discussions", "User profiles", "Article discussion", "Rugby debates"])
    body = page_head("Community", "A place for readers to talk rugby.")
    body += block(empty("Community is coming soon.", "There are no accounts, comments or user posts yet.", wide=True) +
                  f'<h2 style="font-size:1.5rem;margin-top:2rem">What may come later</h2><ul class="plain-list">{later}</ul>')
    body += newsletter_block()
    build_page("/community/", "Community", "Community features from Jacklers are coming soon.", body)


def newsletter_page():
    body = page_head("The Jacklers Brief", "Sharp rugby analysis, emerging talent and the stories behind the numbers.")
    body += block('<div class="prose"><p>Sign-ups are not open yet. The form below is a preview of how it will work: it does not send or save anything.</p></div>')
    body += newsletter_block("nl-page")
    build_page("/newsletter/", "The Jacklers Brief", "The Jacklers Brief: sharp rugby analysis, emerging talent and the stories behind the numbers.", body)


def article_template():
    inner = ('<div class="article"><div id="article-root">' +
             empty("Article not found.", "This page shows an article when it is opened from a link, such as /article/?slug=example.", wide=True) +
             '<section class="discussion" id="discussion" aria-labelledby="disc-t"><h2 id="disc-t" style="font-size:1.5rem">Community discussion</h2>' +
             empty("Community discussion: coming soon.") + "</section></div></div>")
    build_page("/article/", "Article", "Article page template.", inner, noindex=True)


def search_page():
    body = page_head("Search", "Find articles, players, teams, schools and topics.")
    body += block('<form id="search-form" role="search" class="filters"><div class="field" style="min-width:min(24rem,100%)">'
                  '<label for="q">Search Jacklers</label><input id="q" type="search" name="q" autocomplete="off"></div>'
                  '<button class="btn" type="submit">Search</button></form>'
                  '<div id="search-results" aria-live="polite">' + empty("Nothing to search yet.", "Jacklers has not published any content.", wide=True) + "</div>")
    build_page("/search/", "Search", "Search articles, players, teams and schools on Jacklers.", body)


def text_page(path, title, lead, desc, paras):
    inner = "".join(f"<p>{E(p)}</p>" for p in paras)
    build_page(path, title, desc, page_head(title, lead) + block(f'<div class="prose">{inner}</div>'))


def contact():
    kinds = ["General enquiries", "Editorial enquiries", "Partnerships", "Data enquiries"]
    cells = "".join(f'<section class="panel"><h2>{k}</h2><p style="color:var(--ink-soft)">Contact details will be published here.</p></section>' for k in kinds)
    build_page("/contact/", "Contact", "How to contact Jacklers. Details coming soon.",
               page_head("Contact", "Contact details will be added before launch.") + block(f'<div class="contact-grid">{cells}</div>'))


def not_found():
    body = ('<div class="wrap" style="padding-top:5rem;padding-bottom:6rem"><h1 style="font-size:clamp(2.4rem,6vw,4rem);margin-bottom:1rem">Page not found</h1>'
            '<p style="max-width:40ch;color:var(--ink-soft)">That address does not exist on Jacklers. Try the menu, or go back to the homepage.</p>'
            '<p><a class="btn" href="/">Go to the homepage</a></p></div>')
    html = head("Page not found", "This page does not exist.", "/404", noindex=True) + header("/404") + body + footer()
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f:
        f.write(html)


# ------------------------------------------------------------------ DATA + FILES
def write_data():
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    for name in ["articles", "authors", "players", "teams", "competitions", "matches", "schools"]:
        p = os.path.join(ROOT, "data", f"{name}.json")
        if not os.path.exists(p):           # never overwrite real content
            with open(p, "w", encoding="utf-8") as f:
                f.write("[]\n")


def write_static():
    pages = [p for _, p in NAV] + ["/search/"] + [p for _, p in INFO]
    urls = "".join(f"<url><loc>{BASE_URL}{p}</loc><lastmod>{LASTMOD}</lastmod></url>" for p in pages)
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>\n")
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /article/\nDisallow: /players/profile/\nDisallow: /teams/profile/\n\nSitemap: {BASE_URL}/sitemap.xml\n")
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    with open(os.path.join(ROOT, "assets", "favicon.svg"), "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0A1120"/>'
                '<text x="32" y="46" text-anchor="middle" font-family="Georgia,serif" font-size="42" fill="#F6F3EE">J</text>'
                '<rect x="14" y="52" width="36" height="3" fill="#A81F2B"/></svg>')


def main():
    home()
    section_page("/analysis/", "Analysis", "Tactical breakdowns, match reviews and the ideas shaping the game.",
                 "Rugby analysis from Jacklers: tactics, match reviews and the ideas shaping the Premiership and international rugby.",
                 "analysis", "Analysis coming soon.")
    panel_page("/recruitment/", "Recruitment", "Contracts, transfers and the players clubs are chasing.",
               "Rugby recruitment intelligence from Jacklers. Coming soon.",
               [("Recruitment News", "Recruitment news will appear here."),
                ("Players to Watch", "Players to watch will appear here."),
                ("Contract &amp; Transfer Intelligence", "Contract and transfer reporting will appear here."),
                ("Position Needs", "Position-by-position needs will appear here."),
                ("Recruitment Analysis", "Recruitment analysis will appear here."),
                ("Jacklers Recruitment Board", "The Jacklers recruitment board will appear here.")])
    panel_page("/schoolboy/", "Schoolboy", "The next generation of rugby talent, from schools and academies.",
               "Schoolboy rugby coverage from Jacklers. Coming soon.",
               [("Players to Watch", "Players to watch will appear here."),
                ("Schools to Watch", "Schools to watch will appear here."),
                ("Emerging Talent", "Emerging talent coverage will appear here."),
                ("Position Watch", "Position-by-position watch lists will appear here."),
                ("School Profiles", "School profiles will appear here."),
                ("Player Profiles", "Player profiles will appear here.")])
    statistics()
    listing("/players/", "Players", "Profiles and performance for players across the game.",
            "Rugby player profiles and statistics from Jacklers. Coming soon.", "players", "players",
            sel("Position", 1) + sel("Club", 2) + sel("Competition", 3), "No players in the Jacklers database.")
    listing("/teams/", "Teams", "Squads, fixtures, results and statistics for every team.",
            "Rugby team profiles from Jacklers. Coming soon.", "teams", "teams",
            sel("Competition", 4) + sel("Season", 5), "No teams in the Jacklers database.")
    profile_page("/players/profile/", "players", "Player profile", "Player not found.", "Player profiles will appear here once players are added to the Jacklers database.")
    profile_page("/teams/profile/", "teams", "Team profile", "Team not found.", "Team profiles will appear here once teams are added to the Jacklers database.")
    fixtures()
    community()
    newsletter_page()
    article_template()
    search_page()
    text_page("/about/", "About", "Jacklers is an independent rugby publication in development.",
              "About Jacklers, an independent rugby publication in development.",
              ["Jacklers will cover rugby union through journalism, analysis, data and talent intelligence.",
               "Nothing has been published yet. This page will be expanded when there is something to say."])
    contact()
    text_page("/privacy/", "Privacy", "How Jacklers will handle personal information.", "Jacklers privacy information.",
              ["This page will be completed before Jacklers collects any personal information.",
               "At present the site has no accounts, and the newsletter form does not send or store email addresses."])
    text_page("/terms/", "Terms", "The terms for using Jacklers.", "Jacklers terms of use.",
              ["These terms will be published before launch."])
    text_page("/community-guidelines/", "Community Guidelines", "The rules for taking part in Jacklers community features.",
              "Jacklers community guidelines.",
              ["Community features are not open yet. The guidelines will be published before comments or user posts are switched on."])
    not_found()
    write_data()
    write_static()
    print("Built OK")


if __name__ == "__main__":
    main()
