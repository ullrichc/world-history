/* Shared helpers. Everything hangs off window.BB to keep the app loadable from file:// without modules. */
(function () {
  const BB = (window.BB = window.BB || {});

  BB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  BB.lerp = (a, b, t) => a + (b - a) * t;
  BB.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  BB.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  BB.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Time is measured in years before 2000 CE. The app spans roughly 7.5 million years to 2,000 years ago.
  BB.TIME_MAX = 7500000;
  BB.TIME_MIN = 2000;
  // Interpolate between two ages on a logarithmic scale.
  BB.logLerp = (a, b, t) => Math.exp(BB.lerp(Math.log(Math.max(a, 1)), Math.log(Math.max(b, 1)), t));

  const nf = new Intl.NumberFormat('en-US');
  BB.num = (n) => nf.format(n);

  // A readable label for an age in years ago.
  BB.formatAge = function (y, opts = {}) {
    if (y >= 1e6) {
      const m = y / 1e6;
      const s = m >= 3 ? m.toFixed(m % 1 < 0.05 ? 0 : 1) : m.toFixed(2).replace(/0$/, '');
      return `${s} million years ago`;
    }
    if (y >= 12000) {
      const r = y >= 100000 ? 1000 : y >= 30000 ? 500 : 100;
      return `${nf.format(Math.round(y / r) * r)} years ago`;
    }
    const bce = Math.round((y - 2000) / 50) * 50;
    if (bce > 0) return `${opts.circa === false ? '' : 'c. '}${nf.format(bce).replace(',', '')} BCE`;
    return `${-bce} CE`;
  };
  // A second line for Holocene dates: how long ago.
  BB.formatAgeSub = function (y) {
    if (y >= 12000) return '';
    return `${nf.format(Math.round(y / 100) * 100)} years ago`;
  };
  BB.shortAge = function (y) {
    if (y >= 1e6) return `${+(y / 1e6).toFixed(1)}M`;
    if (y >= 1000) return `${Math.round(y / 1000)}k`;
    return `${y}`;
  };

  BB.fmtCoord = function (lat, lon) {
    const a = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
    const b = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
    return `${a}, ${b}`;
  };

  // Climate lookups from data/climate.js
  let seaCurve = null;
  BB.seaLevel = function (y) {
    if (!window.LD_CLIMATE) return 0;
    if (!seaCurve) seaCurve = window.LD_CLIMATE.sea.slice().sort((a, b) => a[0] - b[0]);
    const c = seaCurve;
    if (y <= c[0][0]) return c[0][1];
    if (y >= c[c.length - 1][0]) return c[c.length - 1][1];
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m][0] <= y) lo = m; else hi = m; }
    const t = (y - c[lo][0]) / (c[hi][0] - c[lo][0]);
    return BB.lerp(c[lo][1], c[hi][1], t);
  };
  // How much of the Last Glacial Maximum ice to show, from sea level (0 = none, 1 = full LGM extent).
  BB.iceFactor = (sea) => BB.clamp((-sea - 45) / 80, 0, 1);
  // How much of the continental shelf is dry land (0 at today's sea level, 1 at -120 m or lower).
  BB.shelfFactor = (sea) => BB.clamp(-sea / 115, 0, 1);

  BB.REGIONS = {
    africa: 'Africa', europe: 'Europe', asia: 'Asia', oceania: 'Oceania', americas: 'Americas',
  };

  // Site categories: the 12 site types of the content schema folded into 7 map colours.
  BB.CATEGORIES = [
    { id: 'remains', label: 'Human remains and DNA', types: ['fossil', 'dna'], color: '#efe3c9' },
    { id: 'tech', label: 'Tools and fire', types: ['tools', 'fire'], color: '#e3b15c' },
    { id: 'art', label: 'Art and symbols', types: ['art'], color: '#de6b4a' },
    { id: 'burial', label: 'Burials', types: ['burial'], color: '#c893b6' },
    { id: 'life', label: 'Settlements and food', types: ['settlement', 'farming'], color: '#97b476' },
    { id: 'monument', label: 'Monuments and metal', types: ['monument', 'metal'], color: '#72b9b0' },
    { id: 'trace', label: 'Footprints and other traces', types: ['footprints', 'other'], color: '#b9a888' },
  ];
  BB.categoryOf = (type) => BB.CATEGORIES.find((c) => c.types.includes(type)) || BB.CATEGORIES[6];

  BB.el = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  BB.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  BB.store = {
    get(k, d) { try { const v = localStorage.getItem('bb.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bb.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // Tiny event emitter
  BB.emitter = function () {
    const m = new Map();
    return {
      on(ev, fn) { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev).add(fn); return () => m.get(ev).delete(fn); },
      emit(ev, ...a) { (m.get(ev) || []).forEach((fn) => fn(...a)); },
    };
  };

  let toastTimer = null;
  BB.toast = function (msg, ms = 3200) {
    let t = document.getElementById('toast');
    if (!t) { t = BB.el('div', { id: 'toast', class: 'toast', role: 'status' }); document.getElementById('app').append(t); }
    t.textContent = msg;
    t.style.opacity = '1';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => (t.hidden = true), 450); }, ms);
  };

  BB.icons = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.5 3.8 5.3 3.8 8.5s-1.2 6-3.8 8.5c-2.6-2.5-3.8-5.3-3.8-8.5S9.4 6 12 3.5z"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="6.5"/><path d="M3 12h18M12 5.5v13"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5c3-1 5.5-.8 8 1v13c-2.5-1.8-5-2-8-1zM20 5.5c-3-1-5.5-.8-8 1v13c2.5-1.8 5-2 8-1z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M10.5 10.2a2.3 2.3 0 100 3.6M17 10.2a2.3 2.3 0 100 3.6"/></svg>',
  };
})();
