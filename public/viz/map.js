// melon-seek job map (Leaflet, global `L`).
//
// createMap(container, { onSelect(job), onAreaSelect(jobs, label),
//                        tiles?: { url, attribution, maxZoom, subdomains, dark: 'filter' | url } })
//   -> { update(jobs, { fit }), highlight(jobId|null), invalidateSize(), destroy() }
//
// Jobs are aggregated per location (lat/lng rounded to 0.1°; a job with several
// locations counts in each), then greedily clustered in screen space so pills
// never overlap at the current zoom. Each cluster is a Zillow-style price-tag
// pill: median salary (approx USD) + count badge, filled on a one-hue
// sequential scale by median. Remote-only postings live in a "Remote" control.
// Basemap: OpenStreetMap standard tiles by default (no API key). Dark mode
// inverts the tile pane only with a CSS filter (pins are never filtered), or
// swaps to `tiles.dark` when that is a URL. If tiles fail, the container
// keeps a styled background, a graticule and labelled pins.

import { formatMoney, toUSD, median, salaryColor, inkOn, onThemeChange, isDark, prefersReducedMotion } from './palette.js';

/** Default basemap: OSM standard tiles (no key). Usage policy: attribution visible, no prefetch. */
export const OSM_TILES = Object.freeze({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  dark: 'filter',
});
const BASE_MIN_ZOOM = 2; // lowered per dataset by fitToData() when the pins need it
const CLUSTER_W = 76;  // px: pill width + gap
const CLUSTER_H = 34;  // px: pill height + gap (labels add more when offline)

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function midUSD(job) {
  const s = job.salary;
  if (!s || (s.min == null && s.max == null)) return null;
  const cur = s.currency || 'USD';
  const mid = s.mid ?? ((s.min ?? s.max) + (s.max ?? s.min)) / 2;
  return toUSD(mid, cur);
}

function locLabel(l) {
  if (l.city) return l.region && l.region !== l.city ? `${l.city}, ${l.region}` : (l.country && l.country !== l.city ? `${l.city}, ${l.country}` : l.city);
  return l.name || 'Unknown';
}

const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Aggregate jobs into { places: [{key,lat,lng,label,jobs}], remote: jobs[] }. */
export function aggregate(jobs) {
  const places = new Map();
  const remote = [];
  for (const job of jobs) {
    let placed = false, isRemote = false;
    const seen = new Set();
    for (const l of job.locations || []) {
      if (l.remote) { isRemote = true; continue; }
      if (l.lat == null || l.lng == null || !isFinite(l.lat) || !isFinite(l.lng)) continue;
      const key = `${l.lat.toFixed(1)},${l.lng.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let p = places.get(key);
      if (!p) { p = { key, lat: +l.lat, lng: +l.lng, label: locLabel(l), jobs: [] }; places.set(key, p); }
      p.jobs.push(job);
      placed = true;
    }
    if (isRemote || (!placed && job.remote)) remote.push(job);
  }
  return { places: [...places.values()], remote };
}

function summarize(jobs) {
  const mids = jobs.map(midUSD).filter(v => v != null);
  return { n: jobs.length, salaried: mids.length, median: median(mids) };
}

export function createMap(container, { onSelect, onAreaSelect, tiles: tileOpts } = {}) {
  const T = { ...OSM_TILES, ...(tileOpts || {}) };
  const darkUrl = typeof T.dark === 'string' && T.dark !== 'filter' ? T.dark : null;
  if (typeof L === 'undefined') throw new Error('melon-seek map: Leaflet global `L` not loaded');
  container.classList.add('ms-map');
  container.replaceChildren();
  const host = el('div', 'ms-map__canvas');
  container.append(host);

  const map = L.map(host, {
    zoomControl: true, worldCopyJump: true, minZoom: BASE_MIN_ZOOM, maxZoom: 16,
    zoomSnap: 0.5, attributionControl: true,
  }).setView([30, -20], 2);
  map.attributionControl.setPrefix(false);

  // Graticule below tiles: visible only when tiles are missing.
  map.createPane('ms-graticule').style.zIndex = 150;
  const gratLines = [];
  for (let lat = -60; lat <= 75; lat += 15) gratLines.push([[lat, -540], [lat, 540]]);
  for (let lng = -540; lng <= 540; lng += 15) gratLines.push([[-85, lng], [85, lng]]);
  L.polyline(gratLines, { pane: 'ms-graticule', interactive: false, className: 'ms-graticule-line', weight: 1, smoothFactor: 1 }).addTo(map);

  let tileErrors = 0, tileOk = 0, probe = 'idle'; // probe: idle | pending | ok | bad
  const urlFor = dark => (dark && darkUrl ? darkUrl : T.url);
  const tiles = L.tileLayer(urlFor(isDark()), {
    maxZoom: T.maxZoom ?? 19,
    attribution: T.attribution,
    ...(T.subdomains ? { subdomains: T.subdomains } : {}),
    detectRetina: false,
    crossOrigin: true,                          // lets the one-off status probe below read the response
    referrerPolicy: 'strict-origin-when-cross-origin', // OSM requires a Referer
    keepBuffer: 1,                              // no extra prefetching beyond Leaflet's minimum
  });
  const setOffline = on => {
    if (container.classList.contains('ms-map--offline') === on) return;
    container.classList.toggle('ms-map--offline', on);
    if (places.length) draw(); // labels change pin footprint -> recluster
  };
  const applyDark = dark => container.classList.toggle('ms-map--dark', !!dark && !darkUrl && T.dark === 'filter');
  applyDark(isDark());
  tiles.on('tileerror', () => { tileErrors++; if (!tileOk) setOffline(true); });
  // A tile can "load" while being an error image (for example "API key required" or
  // "Access blocked", served with a 4xx status). Check the first loaded tile's HTTP
  // status once, re-reading it from the HTTP cache, before trusting tileload.
  tiles.on('tileload', e => {
    if (probe === 'bad') return;
    if (probe === 'ok') { tileOk++; setOffline(false); return; }
    if (probe === 'pending') return;
    probe = 'pending';
    const src = e.tile?.src;
    const done = ok => {
      probe = ok ? 'ok' : 'bad';
      container.classList.toggle('ms-map--tiles-bad', !ok);
      if (ok) { tileOk++; setOffline(false); } else setOffline(true);
    };
    if (!src || typeof fetch !== 'function') { done(true); return; }
    fetch(src, { mode: 'cors', cache: 'force-cache', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' })
      .then(r => done(r.ok))
      .catch(() => done(true)); // CORS or network quirk: the <img> loaded, so trust it
  });
  tiles.addTo(map);
  // If nothing loads at all (blocked silently), treat as offline after a moment.
  const offlineTimer = setTimeout(() => { if (!tileOk) setOffline(true); }, 4000);

  // Remote control
  const RemoteControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const b = L.DomUtil.create('button', 'ms-remote');
      b.type = 'button';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', () => { if (remoteJobs.length) onAreaSelect?.(remoteJobs, 'Remote'); });
      return b;
    },
  });
  const remoteCtl = new RemoteControl().addTo(map);
  const remoteBtn = remoteCtl.getContainer();

  // Offline note control
  const NoteControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() { const d = L.DomUtil.create('div', 'ms-map__offline-note'); d.textContent = 'Basemap unavailable · pins still work'; return d; },
  });
  new NoteControl().addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  let places = [];
  let remoteJobs = [];
  let clusters = [];
  let highlighted = null;
  let lastSig = null;
  let pendingFit = false;
  let first = true;

  function cluster() {
    const zoom = map.getZoom();
    const pts = places
      .map(p => ({ p, pt: map.project([p.lat, p.lng], zoom) }))
      .sort((a, b) => b.p.jobs.length - a.p.jobs.length);
    const ch = container.classList.contains('ms-map--offline') ? CLUSTER_H + 16 : CLUSTER_H;
    const out = [];
    for (const { p, pt } of pts) {
      let target = null;
      for (const c of out) {
        if (Math.abs(c.pt.x - pt.x) < CLUSTER_W && Math.abs(c.pt.y - pt.y) < ch) { target = c; break; }
      }
      if (target) target.members.push(p);
      else out.push({ pt, members: [p], lead: p });
    }
    return out.map(c => {
      const ids = new Set();
      const jobs = [];
      for (const m of c.members) for (const j of m.jobs) if (!ids.has(j.id)) { ids.add(j.id); jobs.push(j); }
      const label = c.members.length > 1 ? `${c.lead.label} + ${c.members.length - 1} nearby` : c.lead.label;
      return { lat: c.lead.lat, lng: c.lead.lng, members: c.members, jobs, ids, label, ...summarize(jobs) };
    });
  }

  function tooltipContent(c) {
    const root = el('div', 'ms-map-tip__inner');
    root.append(el('div', 'ms-tip__value', c.median != null ? `${formatMoney(c.median)} median` : plural(c.n, 'job')));
    root.append(el('div', 'ms-tip__title', c.label));
    root.append(el('div', 'ms-tip__meta', c.median != null
      ? `${plural(c.n, 'posting')} · ${c.salaried.toLocaleString()} with salary`
      : `${plural(c.n, 'posting')} · no published salary`));
    const counts = new Map();
    for (const j of c.jobs) counts.set(j.title, (counts.get(j.title) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const list = el('ul', 'ms-tip__roles');
    for (const [t, n] of top.slice(0, 4)) {
      const li = el('li');
      li.append(el('span', 'ms-tip__role', t), el('span', 'ms-tip__n', n > 1 ? `×${n}` : ''));
      list.append(li);
    }
    root.append(list);
    if (top.length > 4) root.append(el('div', 'ms-tip__meta', `+${top.length - 4} more roles`));
    return root;
  }

  function pinElement(c, t) {
    const pin = el('div', 'ms-pin');
    if (c.median != null) {
      const bg = salaryColor(t);
      pin.style.setProperty('--pin-bg', bg);
      pin.style.setProperty('--pin-fg', inkOn(bg));
      pin.append(el('span', 'ms-pin__price', formatMoney(c.median)));
      if (c.n > 1) pin.append(el('span', 'ms-pin__count', c.n > 999 ? '999+' : String(c.n)));
    } else {
      pin.classList.add('ms-pin--nosalary');
      pin.append(el('span', 'ms-pin__price', plural(c.n, 'job')));
    }
    pin.append(el('span', 'ms-pin__label', c.label));
    return pin;
  }

  function pinName(c) {
    return `${c.label}: ${plural(c.n, 'posting')}${c.median != null ? `, median ${formatMoney(c.median)}` : ', no published salary'}`;
  }

  function draw() {
    // Keep keyboard focus on "the same" pin across re-clustering (zoom, activation fly-to):
    // remember a place key of the focused cluster and refocus whichever new cluster contains it.
    const focused = clusters.find(c => c.marker?.getElement() && c.marker.getElement() === document.activeElement);
    const focusedKeys = focused ? new Set(focused.members.map(p => p.key)) : null;
    const focusedLead = focused?.members[0]?.key; // members[0] is the cluster's lead place
    markerLayer.clearLayers();
    clusters = cluster();
    const meds = clusters.map(c => c.median).filter(v => v != null);
    const lo = Math.min(...meds), hi = Math.max(...meds);
    let refocus = null;
    // Draw small clusters first so big ones sit on top.
    const order = clusters.slice().sort((a, b) => a.n - b.n);
    order.forEach((c, i) => {
      const t = c.median == null ? 0 : (hi > lo ? (c.median - lo) / (hi - lo) : 0.6);
      const pinEl = pinElement(c, t);
      pinEl.setAttribute('aria-hidden', 'true'); // name comes from the button's aria-label
      c.pinEl = pinEl;
      const icon = L.divIcon({ className: 'ms-pin-icon', html: pinEl, iconSize: [0, 0], iconAnchor: [0, 0] });
      const m = L.marker([c.lat, c.lng], { icon, keyboard: true, title: '', riseOnHover: false, zIndexOffset: i });
      c.marker = m;
      m.bindTooltip(() => tooltipContent(c), { direction: 'top', offset: [0, -36], className: 'ms-map-tip', opacity: 1 });
      m.on('mouseover', () => { m.setZIndexOffset(100000); pinEl.classList.add('is-hover'); });
      m.on('mouseout', () => { m.setZIndexOffset(i); pinEl.classList.remove('is-hover'); });
      const activate = () => {
        onAreaSelect?.(c.jobs, c.label);
        if (c.jobs.length === 1) onSelect?.(c.jobs[0]);
        const animate = !prefersReducedMotion();
        if (c.members.length > 1) {
          const b = L.latLngBounds(c.members.map(p => [p.lat, p.lng])).pad(0.3);
          if (animate) map.flyToBounds(b, { maxZoom: 12, duration: 0.6 });
          else map.fitBounds(b, { maxZoom: 12, animate: false });
        } else {
          const z = Math.min(12, Math.max(map.getZoom() + 2, 9));
          if (z > map.getZoom()) {
            if (animate) map.flyTo([c.lat, c.lng], z, { duration: 0.6 });
            else map.setView([c.lat, c.lng], z, { animate: false });
          }
        }
      };
      m.on('click', activate);
      m.on('keydown', e => {
        const k = e.originalEvent.key;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.originalEvent.preventDefault(); activate(); }
      });
      m.addTo(markerLayer);
      const iconEl = m.getElement();
      iconEl?.setAttribute('aria-label', pinName(c));
      if (focusedKeys && iconEl) {
        // Prefer the cluster holding the old lead place; else any cluster sharing a member.
        if (c.members.some(p => p.key === focusedLead)) refocus = iconEl;
        else if (!refocus && c.members.some(p => focusedKeys.has(p.key))) refocus = iconEl;
      }
    });
    refocus?.focus({ preventScroll: true });
    applyHighlight();
  }

  function drawRemote() {
    remoteBtn.replaceChildren();
    remoteBtn.hidden = !remoteJobs.length;
    if (!remoteJobs.length) return;
    const s = summarize(remoteJobs);
    remoteBtn.append(el('span', 'ms-remote__icon', '🌐'), el('span', 'ms-remote__label', 'Remote'),
      el('span', 'ms-remote__n', s.n.toLocaleString()));
    if (s.median != null) remoteBtn.append(el('span', 'ms-remote__price', formatMoney(s.median)));
    remoteBtn.title = `${plural(s.n, 'remote posting')}${s.median != null ? ` · median ${formatMoney(s.median)}` : ''} — show list`;
    remoteBtn.setAttribute('aria-label', remoteBtn.title);
  }

  function applyHighlight() {
    for (const c of clusters) c.pinEl?.classList.toggle('is-pulse', highlighted != null && c.ids.has(highlighted));
    remoteBtn.classList.toggle('is-pulse', highlighted != null && remoteJobs.some(j => j.id === highlighted));
  }

  // Initial fit so every price pin is fully visible. Pins are ~70–90px wide pills
  // centred on their point and ~31px tall above it, so pad by about half a pin
  // horizontally, add the pin height on top, and lower minZoom when needed so a
  // board spanning SF–London–Tokyo still fits a narrow column. A hidden (0×0)
  // container defers the fit until it gets a size (ResizeObserver/invalidateSize).
  function fitToData() {
    const size = map.getSize();
    if (!size.x || !size.y) { pendingFit = true; return; }
    pendingFit = false;
    const pts = places.map(p => [p.lat, p.lng]);
    if (!pts.length) { map.setView([30, -20], BASE_MIN_ZOOM, { animate: false }); return; }
    if (pts.length === 1) { map.setView(pts[0], 10, { animate: false }); return; }
    const bounds = L.latLngBounds(pts);
    const padX = Math.round(Math.min(90, size.x / 6));
    const padY = Math.round(Math.min(48, size.y / 8));
    const top = padY + 32;
    const bottom = padY + (container.classList.contains('ms-map--offline') ? 18 : 0);
    map.setMinZoom(0); // getBoundsZoom clamps to minZoom, so measure unclamped first
    const z = map.getBoundsZoom(bounds, false, L.point(padX * 2, top + bottom));
    map.setMinZoom(Math.min(BASE_MIN_ZOOM, Math.max(0, Math.floor(z * 2) / 2)));
    map.fitBounds(bounds, { paddingTopLeft: [padX, top], paddingBottomRight: [padX, bottom], maxZoom: 11, animate: false });
  }

  map.on('zoomend', draw);

  const ro = new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (pendingFit && map.getSize().x && map.getSize().y) { fitToData(); draw(); }
  });
  ro.observe(container);
  const offTheme = onThemeChange(dark => {
    applyDark(dark);
    if (darkUrl) tiles.setUrl(urlFor(dark));
    draw();
  });

  return {
    update(jobs, { fit } = {}) {
      jobs = Array.isArray(jobs) ? jobs : [];
      ({ places, remote: remoteJobs } = aggregate(jobs));
      // Default: refit only when the dataset identity (set of companies) changes.
      const sig = [...new Set(jobs.map(j => j.company))].sort().join('|');
      const doFit = fit ?? (first || sig !== lastSig);
      lastSig = sig;
      if (jobs.length) first = false;
      map.invalidateSize({ pan: false });
      if (doFit) {
        map.off('zoomend', draw);
        fitToData();
        map.on('zoomend', draw);
      }
      draw();
      drawRemote();
    },
    highlight(jobId) { highlighted = jobId ?? null; applyHighlight(); },
    invalidateSize() {
      map.invalidateSize({ pan: false });
      if (pendingFit) fitToData();
      draw();
    },
    destroy() {
      clearTimeout(offlineTimer);
      ro.disconnect();
      offTheme();
      map.remove();
      container.replaceChildren();
      container.classList.remove('ms-map', 'ms-map--offline', 'ms-map--dark', 'ms-map--tiles-bad');
    },
    /** The underlying Leaflet map (escape hatch). */
    get leaflet() { return map; },
  };
}
