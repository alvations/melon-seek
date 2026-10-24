import re, sys
for p in sys.argv[1:]:
    s = open(p).read()
    s = re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", lambda m: m.group(1) + m.group(2), s, flags=re.S)
    if p.endswith('e2e.js'):
        out, seen = [], set()
        for l in s.split('\n'):
            k = l.strip()
            reg = k.startswith('import { register') or (k.startswith('register') and k.endswith('(suite);'))
            if reg and k in seen: continue
            if reg: seen.add(k)
            out.append(l)
        s = '\n'.join(out)
    open(p, 'w').write(s)
print('resolved', ' '.join(sys.argv[1:]))
