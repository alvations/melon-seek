"""Flag secondary lines over the density rule: >1 line on a phone, >12 words, or >2 facts.
python3 analyze.py <vp> [boards] -> one row per distinct (view, path-tail, text) over the rule."""
import json, glob, sys, re, collections
vp = sys.argv[1]
only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
SKIP = re.compile(r'card-title|ms-crow__name|ms-row__label|sr-only|ms-pin__label|kw-group|d-tier-name|d-tier-pay|card-loc|card-age|card-dept|sen sen|juice-badge|ms-comp__item|msi-row__name|msi-row__value|msi-row__n|ms-insights__title|leaflet-control-attribution|state-card h|ms-modes__key|ms-modes__net|d-company|drawer-pos|d-meta|apply|list-more|ms-hist|ms-axis|cloud')
rows = collections.OrderedDict()
for f in sorted(glob.glob(f'density-*-{vp}.json')):
    d = json.load(open(f))
    if only and d['slug'] not in only: continue
    for view, items in d['views'].items():
        for x in items:
            if SKIP.search(x['path']): continue
            phone = vp.startswith('p')
            over = []
            if phone and x['lines'] > 1: over.append(f"{x['lines']} lines")
            if not phone and x['lines'] > 2: over.append(f"{x['lines']} lines")
            if x['words'] > 12: over.append(f"{x['words']} words")
            if x['facts'] > 2: over.append(f"{x['facts']} facts")
            if x.get('cut'): over.append('cut off')
            if not over: continue
            tail = x['path'].split(' > ')[-1]
            key = (view.split(':')[0], tail, re.sub(r'\d[\d,.]*', 'N', x['text'])[:90])
            r = rows.setdefault(key, {'boards': [], 'ex': x, 'over': over, 'view': view})
            r['boards'].append(d['slug'])
for (view, tail, _), r in rows.items():
    x = r['ex']
    print(f"{view:10} | {tail[:48]:48} | {x['words']:3}w {x['lines']}l {x['facts']}f | {','.join(r['over'])} | {','.join(sorted(set(r['boards'])))} | {x['text'][:230]}")
