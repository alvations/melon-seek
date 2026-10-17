"""Markdown inventory from density-*.json: one row per secondary line kind, with max words/lines per viewport
and the worst text (phone 390), plus the per-board table of the chart notes and stats line."""
import json, glob, re, collections
KINDS = [
    ('Stats line', 'chart', r'#statsLine'),
    ('Tagline', 'chart', r'#tagline'),
    ('Results header', 'chart', r'resultsTitle'),
    ('Badge label', 'chart', r'badge-label'),
    ('Chart notes (Clusters)', 'chart', r'ms-chart__foot'),
    ('Chart median caption', 'chart', r'ms-hist__cap|median-cap|ms-chart__cap'),
    ('Chart row sub-line', 'chart', r'ms-crow__sub'),
    ('Chart notes (Ranges)', 'ranges', r'ms-chart__foot'),
    ('Juice explainer above the list', 'sheet|list', r'juice-scale'),
    ('Map Pay legend note', 'map', r'ms-modes__paywhat'),
    ('Map Juice legend note', 'mapJuice', r'juicenote|ms-modes__none'),
    ('Insights header', 'insights', r'ms-insights__sub'),
    ('Insights card captions', 'insights', r'msi-card__sub'),
    ('Insights tile notes', 'insights', r'msi-stat__note'),
    ('Pay estimate caption', 'insights', r'ms-comp__sub'),
    ('Pay estimate auto line', 'insights', r'ms-comp__auto'),
    ('Pay estimate accuracy', 'insights', r'ms-comp__accuracy'),
    ('Pay estimate explain', 'insights', r'ms-comp__explain'),
    ('Pay estimate as-of', 'insights', r'ms-comp__asof'),
    ('Filter notes', 'filters', r'p\.fnote'),
    ('Drawer pay caption', 'drawer', r'd-pay-note'),
    ('Drawer percentile line', 'drawer', r'd-pct-text'),
    ('Drawer strip caption', 'drawer', r'dist-caption'),
    ('Drawer converted pay', 'drawer', r'dist-approx'),
    ('Drawer Same role elsewhere: comparison', 'drawer', r'comps-note'),
    ('Drawer Same role elsewhere: caveat', 'drawer', r'comps-caveat'),
    ('Drawer Same role elsewhere: key', 'drawer', r'ms-comps__note'),
    ('Drawer Same role elsewhere: as of', 'drawer', r'comps-asof'),
    ('Drawer Juice line', 'drawer', r'juice-head-net|juice-none'),
    ('Drawer no-pay estimate note', 'drawer', r'd-comp-note'),
    ('Empty state', 'empty', r'state-card'),
]
data = {}
for f in glob.glob('density-*-*.json'):
    d = json.load(open(f))
    data[(d['slug'], d['vp'])] = d
rows = []
for name, views, pat in KINDS:
    cells = {}
    worst = None
    for vp in ['p390', 'p360', 'd1440']:
        mw = ml = 0
        for (slug, v), d in data.items():
            if v != vp: continue
            for view, items in d['views'].items():
                if not re.fullmatch(views, view.split(':')[0]): continue
                for x in items:
                    if not re.search(pat, x['path']): continue
                    if 'sr-only' in x['path']: continue
                    if x['words'] > mw or (x['words'] == mw and x['lines'] > ml):
                        pass
                    mw = max(mw, x['words']); ml = max(ml, x['lines'])
                    if vp == 'p390' and (worst is None or (x['words'], x['lines']) > (worst[0], worst[1])):
                        worst = (x['words'], x['lines'], slug, x['text'])
        cells[vp] = f'{mw} / {ml}' if mw else '—'
    over = worst and (worst[1] > 1 or worst[0] > 12)
    rows.append(f"| {name} | {cells['p390']} | {cells['p360']} | {cells['d1440']} | {'**over**' if over else 'ok'} | {worst[2] + ': “' + worst[3][:150] + '”' if worst else '—'} |")
print('| Line | 390x844 words / lines | 360x740 | 1440x900 | Phone rule | Worst text at 390 (board) |')
print('|---|---|---|---|---|---|')
print('\n'.join(rows))
print()
print('| Board | Stats line, 390 | Chart notes, 390 | Stats line, 1440 | Chart notes, 1440 |')
print('|---|---|---|---|---|')
for slug in ['amazon', 'apple', 'google', 'meta', 'microsoft', 'nvidia', 'netflix', 'anduril']:
    out = []
    for vp in ['p390', 'd1440']:
        d = data.get((slug, vp))
        for pat in [r'#statsLine', r'ms-chart__foot']:
            t = next((x for x in d['views']['chart'] if re.search(pat, x['path']) and 'ms-note__line' in x['path']), None) if d else None
            out.append(f"{t['words']} / {t['lines']}: “{t['text']}”" if t else '—')
    print(f"| {slug} | {out[0]} | {out[1]} | {out[2]} | {out[3]} |")
