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
TAGLINE = "A boutique sports page looking to connect fans and friends."
POSITIONING = "Independent rugby journalism and analysis."
BASE_URL = "https://jacklers.co.uk"
LASTMOD = "2026-09-19"
ROOT = os.path.dirname(os.path.abspath(__file__))

NAV = [
    ("Home", "/"),
    ("Articles", "/articles/"),
    ("Match Centre", "/match/"),
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
<meta property="og:image" content="{BASE_URL}/assets/og-default.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{BASE_URL}/assets/og-default.png">
<meta name="twitter:title" content="{E(full_title)}">
<meta name="twitter:description" content="{E(desc)}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
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
<a class="brand" href="/"><img src="/assets/logo/lockup-light.svg" alt="Jacklers" width="178" height="44"></a>
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


def footer(scripts=""):
    explore = "".join(f'<li><a href="{h}">{E(l)}</a></li>' for l, h in NAV if l != "Newsletter")
    info = "".join(f'<li><a href="{h}">{E(l)}</a></li>' for l, h in INFO)
    return f"""</main>
<footer class="site-footer on-dark">
<div class="wrap footer-grid">
<div><p class="footer-brand"><img src="/assets/logo/lockup-light.svg" alt="Jacklers" width="178" height="44"></p><p>{E(TAGLINE)}</p></div>
<div><h2>Explore</h2><ul>{explore}</ul></div>
<div><h2>Information</h2><ul>{info}</ul></div>
<div><h2>Newsletter</h2><p>The Jacklers Brief</p>{signup("nl-footer")}</div>
</div>
<div class="wrap footer-base">&copy; <span data-year>2026</span> {E(SITE_NAME)}. Independent rugby publication in development.</div>
</footer>
<script src="/assets/js/site.js" defer></script>
{scripts}</body>
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


def build_page(path, title, desc, body, noindex=False, scripts=""):
    write(path, head(title, desc, path, noindex) + header(path) + body + footer(scripts))


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




















def newsletter_page():
    body = page_head("The Jacklers Brief", "Sharp rugby analysis, emerging talent and the stories behind the numbers.")
    body += block('<div class="prose"><p>Sign-ups are not open yet. The form below is a preview of how it will work: it does not send or save anything.</p></div>')
    body += newsletter_block("nl-page")
    build_page("/newsletter/", "The Jacklers Brief", "The Jacklers Brief: sharp rugby analysis, emerging talent and the stories behind the numbers.", body)






def text_page(path, title, lead, desc, paras):
    inner = "".join(f"<p>{E(p)}</p>" for p in paras)
    build_page(path, title, desc, page_head(title, lead) + block(f'<div class="prose">{inner}</div>'))




def not_found():
    body = ('<div class="wrap" style="padding-top:5rem;padding-bottom:6rem"><img src="/assets/logo/mark-dark.svg" alt="" width="240" height="152" style="margin-bottom:2rem"><h1 style="font-size:clamp(2.4rem,6vw,4rem);margin-bottom:1rem">Page not found</h1>'
            '<p style="max-width:40ch;color:var(--ink-soft)">That address does not exist on Jacklers. Try the menu, or go back to the homepage.</p>'
            '<p><a class="btn" href="/">Go to the homepage</a></p></div>')
    html = head("Page not found", "This page does not exist.", "/404", noindex=True) + header("/404") + body + footer()
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f:
        f.write(html)


# ------------------------------------------------------------------ DATA + FILES


def write_static():
    pages = [p for _, p in NAV] + ["/search/"] + [p for _, p in INFO]
    urls = "".join(f"<url><loc>{BASE_URL}{p}</loc><lastmod>{LASTMOD}</lastmod></url>" for p in pages)
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>\n")
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: {BASE_URL}/sitemap.xml\n")


def home():
    hero = f"""<section class="hero on-dark">
<canvas id="pitch" class="hero__pitch" aria-hidden="true"></canvas>
<div class="hero__score" id="pitch-score" aria-hidden="true">Reds 0 &ndash; 0 Whites</div>
<div class="wrap hero__inner">
<h1><span class="hero__name">{E(SITE_NAME)}</span><span class="hero__line">{E(TAGLINE)}</span></h1>
<p class="hero__support">{E(POSITIONING)}</p>
<a class="btn" href="/newsletter/">Subscribe to the Newsletter</a>
</div>
</section>
"""
    latest = block(
        block_head("Latest articles", ("All articles", "/articles/")) +
        '<div data-render="articles" data-limit="6" data-lead>' +
        empty("No stories published yet.", "Jacklers is preparing its first stories.", wide=True) + "</div>")
    community_block = block(
        block_head("Community", ("Go to Community", "/community/")) +
        empty("Comments are coming soon.", "Readers will be able to join the conversation under every article."))
    build_page("/", f"{SITE_NAME}: independent rugby journalism and analysis",
               POSITIONING + " " + TAGLINE, hero + latest + community_block + newsletter_block(),
               scripts='<script src="/assets/js/pitch.js" defer></script>\n')


def articles_page():
    filters = """<div class="filters">
<div class="field"><label for="filter-tag">Topic</label><select id="filter-tag" disabled><option value="">All topics</option></select></div>
<div class="field"><label for="filter-sort">Order</label><select id="filter-sort" disabled><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
</div>"""
    body = page_head("Articles", "Rugby journalism and analysis from Jacklers.")
    body += block(block_head("Featured") + '<div data-featured>' + empty("No featured article yet.", "The featured story appears here once one is chosen.") + "</div>")
    body += block(block_head("Latest") + filters +
                  '<div data-render="articles" data-section="" data-paged>' + empty("No articles yet.", "Jacklers is preparing its first stories.", wide=True) + "</div>" +
                  '<nav class="pager" id="pager" aria-label="Pagination" hidden></nav>')
    body += newsletter_block()
    build_page("/articles/", "Articles", "Rugby journalism and analysis from Jacklers. The first stories are coming soon.", body)


def match_page():
    scoreboard = (
        '<div class="mc-board">'
        '<div class="mc-board__team"><span data-mc="home-name"></span><span class="mc-board__score" data-mc="home-score">0</span></div>'
        '<div class="mc-board__mid"><span class="mc-board__clock" data-mc="clock">00:00</span><span class="mc-board__half" data-mc="half">H1</span></div>'
        '<div class="mc-board__team mc-board__team--away"><span class="mc-board__score" data-mc="away-score">0</span><span data-mc="away-name"></span></div>'
        '</div>'
    )
    controls = (
        '<div class="mc-controls">'
        '<button type="button" class="btn" data-mc="play">Pause</button>'
        '<button type="button" class="btn btn--quiet" data-mc="speed">1&times;</button>'
        '<button type="button" class="btn btn--quiet" data-mc="restart">Restart</button>'
        '<div class="mc-poss"><span data-mc="poss-home">50%</span>'
        '<span class="mc-poss__bar"><span class="mc-poss__fill" data-mc="poss-bar-home" style="width:50%"></span></span>'
        '<span data-mc="poss-away">50%</span></div>'
        '</div>'
    )
    tactics = (
        '<div class="mc-tactics">'
        '<label>Home mentality<select data-mc="mentality-home">'
        '<option value="attack">Attack</option><option value="balanced" selected>Balanced</option><option value="defend">Defend</option>'
        '</select></label>'
        '<label>Away mentality<select data-mc="mentality-away">'
        '<option value="attack">Attack</option><option value="balanced" selected>Balanced</option><option value="defend">Defend</option>'
        '</select></label>'
        '</div>'
    )
    banner = (
        '<div class="mc-banner" data-mc="banner" hidden>'
        '<p class="mc-banner__title">TRY!</p><p class="mc-banner__sub"></p>'
        '</div>'
    )
    body = page_head("Match Centre", "A simulated rugby union match, playing out phase by phase in real time.")
    body += block(
        '<div class="mc" id="match-centre">'
        '<div class="mc__main">' + scoreboard +
        '<p class="mc__phase" data-mc="phase">PHASE 1 &mdash; KICK-OFF</p>' +
        '<div class="mc__canvaswrap"><canvas id="match-canvas" aria-label="Live match pitch"></canvas>' + banner + '</div>' +
        controls + tactics +
        '</div>'
        '<aside class="mc__feed"><h2>Commentary</h2><ul class="mc-feed" data-mc="feed"></ul></aside>'
        '</div>'
    )
    build_page("/match/", "Match Centre", "Watch a simulated rugby union match play out phase by phase, with live commentary.",
               body, scripts='<script type="module" src="/assets/js/match/main.js"></script>\n')


def community():
    later = "".join(f"<li>{i}</li>" for i in ["Comments on articles", "Reader accounts", "Discussions and debates"])
    body = page_head("Community", "A place for readers to talk rugby.")
    body += block(empty("Comments are coming soon.", "There are no accounts, comments or user posts yet.", wide=True) +
                  f'<h2 style="font-size:1.5rem;margin-top:2rem">What may come later</h2><ul class="plain-list">{later}</ul>')
    body += newsletter_block()
    build_page("/community/", "Community", "Community features from Jacklers are coming soon.", body)


def search_page():
    body = page_head("Search", "Find articles by title, topic or keyword.")
    body += block('<form id="search-form" role="search" class="filters"><div class="field" style="min-width:min(24rem,100%)">'
                  '<label for="q">Search Jacklers</label><input id="q" type="search" name="q" autocomplete="off"></div>'
                  '<button class="btn" type="submit">Search</button></form>'
                  '<div id="search-results" aria-live="polite">' + empty("Nothing to search yet.", "Jacklers has not published any articles.", wide=True) + "</div>")
    build_page("/search/", "Search", "Search articles on Jacklers.", body)


def contact():
    kinds = ["General enquiries", "Editorial enquiries"]
    cells = "".join(f'<section class="panel"><h2>{k}</h2><p style="color:var(--ink-soft)">Contact details will be published here.</p></section>' for k in kinds)
    build_page("/contact/", "Contact", "How to contact Jacklers. Details coming soon.",
               page_head("Contact", "Contact details will be added before launch.") + block(f'<div class="contact-grid">{cells}</div>'))


def write_data():
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    for name in ["articles", "authors"]:
        p = os.path.join(ROOT, "data", f"{name}.json")
        if not os.path.exists(p):           # never overwrite real content
            with open(p, "w", encoding="utf-8") as f:
                f.write("[]\n")



def write_shell():
    """Template used by build.js (on Vercel) to build every article page with the same header and footer as the rest of the site."""
    top = ('<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1">\n{{META}}\n'
           '<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">\n<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n' + FONTS +
           '\n<link rel="stylesheet" href="/assets/css/site.css">\n</head>\n')
    os.makedirs(os.path.join(ROOT, "templates"), exist_ok=True)
    with open(os.path.join(ROOT, "templates", "article-shell.html"), "w", encoding="utf-8") as f:
        f.write(top + header("/articles/") + "{{MAIN}}" + footer())


def main():
    home()
    articles_page()
    match_page()
    community()
    newsletter_page()
    write_shell()
    search_page()
    text_page("/about/", "About", "Jacklers is an independent rugby publication in development.",
              "About Jacklers, an independent rugby publication in development.",
              ["Jacklers will cover rugby union through journalism and analysis.",
               "Nothing has been published yet. This page will be expanded when there is something to say."])
    contact()
    text_page("/privacy/", "Privacy", "How Jacklers will handle personal information.", "Jacklers privacy information.",
              ["This page will be completed before Jacklers collects any personal information.",
               "At present the site has no accounts, and the newsletter form does not send or store email addresses."])
    text_page("/terms/", "Terms", "The terms for using Jacklers.", "Jacklers terms of use.",
              ["These terms will be published before launch."])
    text_page("/community-guidelines/", "Community Guidelines", "The rules for taking part in Jacklers community features.",
              "Jacklers community guidelines.",
              ["Community features are not open yet. The guidelines will be published before comments are switched on."])
    not_found()
    write_data()
    write_static()
    print("Built OK")


if __name__ == "__main__":
    main()
