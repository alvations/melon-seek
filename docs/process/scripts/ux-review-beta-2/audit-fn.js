(function audit({ phone = false } = {}) {
  const W = innerWidth, H = innerHeight;
  const res = { hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, contrast: [], small: [], tap: [], clipped: [], offscreen: [] };
  const parse = (c) => { if (!c) return null; let m = c.match(/color\(srgb ([^)]+)\)/); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; } m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let bg = { r: 255, g: 255, b: 255, a: 1 }; if (!stack.length || stack[stack.length - 1].a < 1) bg = parse(getComputedStyle(document.body).backgroundColor) || bg; for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg); return bg; };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (el.closest('[hidden],[inert] .x')) return false; return r.bottom > 0 && r.top < H && r.right > 0 && r.left < W; };
  const desc = (el) => { const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50); return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${t}"`; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.closest('svg') || el.closest('.leaflet-tile-pane')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const cs = getComputedStyle(el);
    if (own) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) res.small.push(`${desc(el)} ${fs}px`);
      const fg = parse(cs.color); const bg = bgOf(el);
      if (fg && bg) {
        const f = blend({ ...fg, a: fg.a * (+cs.opacity || 1) }, bg); const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
        if (ratio < (large ? 3 : 4.5)) { const k = desc(el) + ratio.toFixed(2); if (!seen.has(k)) { seen.add(k); res.contrast.push(`${desc(el)} ${ratio.toFixed(2)}:1 fg ${cs.color} ${fs}px`); } }
      }
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && cs.whiteSpace !== 'normal') res.clipped.push(`${desc(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    if (phone && el.matches('button,a[href],input,select,[role=button],summary,label.check,[tabindex="0"]') && !el.closest('.leaflet-control-attribution')) {
      const r = el.getBoundingClientRect();
      if ((r.height < 44 || r.width < 44) && r.height > 0) res.tap.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // elements partly off the viewport horizontally (inside non-scrolling ancestors)
  for (const el of document.querySelectorAll('button, .sal-pill, .stat, .chip, [class*=edge], [class*=more]')) {
    const r = el.getBoundingClientRect(); if (!r.width || el.closest('[hidden]')) continue;
    if (r.top > H || r.bottom < 0) continue;
    let sc = false; for (let e = el.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') { sc = true; break; } }
    if (!sc && (r.left < -0.5 || r.right > W + 0.5)) res.offscreen.push(`${desc(el)} [${Math.round(r.left)},${Math.round(r.right)}]`);
  }
  return res;
})
