/* Animated diagrams for the Watch stage. Each diagram is a function (ctx, w, h, t, p) drawing frame at time t seconds
   with parameters p from the script. They use the app's palette and fonts and are resolution independent. */
(function () {
  const BB = window.BB;
  const C = { ink: '#eee5d4', ink2: '#bcb09c', ink3: '#8a7f6f', ochre: '#e3b15c', red: '#d4694a', line: 'rgba(236,226,208,0.18)', teal: '#72b9b0', lichen: '#97b476', mauve: '#c893b6' };
  const mono = (px) => `500 ${px}px "IBM Plex Mono", ui-monospace, monospace`;
  const display = (px, w = 500) => `${w} ${px}px Fraunces, Georgia, serif`;
  const ease = (u) => BB.easeInOut(BB.clamp(u, 0, 1));
  const step = (t, a, b) => ease((t - a) / (b - a));

  function wrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lh;
  }

  const D = {};

  /* Stratigraphy: layers build up from the bottom, one every `every` seconds; an artefact sits in one of them.
     p.layers: [{label, age, color?, artefact?}] from bottom to top. */
  D.strata = function (ctx, w, h, t, p) {
    const layers = p.layers || [];
    const every = p.every || 1.6;
    const narrow = w < 640;
    const pad = Math.min(w, h) * 0.08;
    const left = narrow ? pad * 0.6 : pad * 1.2, right = narrow ? w - pad * 0.6 : w - pad * 4.2, bottom = h * 0.9, top = narrow ? h * 0.1 : h * 0.16;
    const lh = (bottom - top) / layers.length;
    const colors = ['#5c5143', '#4a4238', '#6a5e4d', '#3e3a33', '#7a6b56', '#4f463a', '#615544'];
    ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, w, h);
    layers.forEach((L, i) => {
      const u = step(t, i * every, i * every + 1.2);
      if (u <= 0) return;
      const y1 = bottom - lh * (i + 1), y0 = bottom - lh * i;
      const yTop = y0 - (y0 - y1) * u;
      ctx.fillStyle = L.color || colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(left, y0);
      for (let x = left; x <= right; x += 12) ctx.lineTo(x, yTop + Math.sin(x / 47 + i) * 3 + Math.sin(x / 13 + i * 2) * 1.5);
      ctx.lineTo(right, y0); ctx.closePath(); ctx.fill();
      // texture
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 40; k++) { const x = left + ((k * 97 + i * 31) % (right - left)); const y = yTop + 6 + ((k * 53) % Math.max(6, (y0 - yTop) - 8)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 1.5); ctx.stroke(); }
      if (u > 0.95) {
        const lx = narrow ? left + 12 : right + 16, ly = narrow ? yTop + 10 : (y0 + yTop) / 2 - 8;
        ctx.fillStyle = C.ink; ctx.font = display(Math.max(narrow ? 13 : 15, h * 0.026));
        ctx.textAlign = 'left'; ctx.textBaseline = narrow ? 'top' : 'middle';
        ctx.fillText(L.label, lx, ly);
        ctx.fillStyle = C.ochre; ctx.font = mono(Math.max(9, h * 0.016));
        ctx.fillText(L.age || '', lx, ly + (narrow ? 18 : 20));
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(left, yTop); ctx.lineTo(right + 8, yTop); ctx.stroke();
      }
      if (L.artefact && u > 0.98) {
        const v = step(t, i * every + 1.3, i * every + 2.2);
        const cx = left + (right - left) * (L.at || 0.55), cy = (y0 + yTop) / 2;
        ctx.save(); ctx.globalAlpha = v;
        ctx.fillStyle = C.ochre; ctx.strokeStyle = '#1a0f0a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 14, cy + 8); ctx.lineTo(cx - 6, cy - 10); ctx.lineTo(cx + 9, cy - 8); ctx.lineTo(cx + 14, cy + 6); ctx.lineTo(cx + 2, cy + 11); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.ochre; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(cx, cy, 24 + 6 * Math.sin(t * 3), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.ink; ctx.font = mono(Math.max(10, h * 0.016)); ctx.textAlign = 'center';
        ctx.fillText(L.artefact, cx, cy + 44);
        ctx.restore();
      }
    });
    if (p.title) {
      ctx.fillStyle = C.ink3; ctx.font = mono(Math.max(10, h * 0.015)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.title.toUpperCase(), left, top - 24);
    }
    // surface line and a marker for "surface finds"
    const uS = step(t, layers.length * every, layers.length * every + 1);
    if (p.surface && uS > 0) {
      ctx.save(); ctx.globalAlpha = uS;
      ctx.fillStyle = C.red; ctx.font = mono(Math.max(10, h * 0.016)); ctx.textAlign = 'left';
      ctx.fillText(p.surface, left, top - 4);
      ctx.restore();
    }
  };

  /* A horizontal line of years with events appearing one by one. p.from, p.to (calendar years), p.events: [{year, label}], p.every */
  D.years = function (ctx, w, h, t, p) {
    ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, w, h);
    const pad = w * 0.1, y = h * 0.5;
    const x = (yr) => pad + ((yr - p.from) / (p.to - p.from)) * (w - 2 * pad);
    const u0 = step(t, 0, 1.2);
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + (w - 2 * pad) * u0, y); ctx.stroke();
    ctx.fillStyle = C.ink3; ctx.font = mono(Math.max(10, h * 0.016)); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let yr = p.from; yr <= p.to; yr += p.tick || 1) if (x(yr) <= pad + (w - 2 * pad) * u0 + 1) { ctx.fillRect(x(yr) - 0.5, y - 6, 1, 12); ctx.fillText(String(yr), x(yr), y + 12); }
    const every = p.every || 2.2;
    (p.events || []).forEach((e, i) => {
      const u = step(t, 1 + i * every, 1.8 + i * every);
      if (u <= 0) return;
      const ex = x(e.year), up = i % 2 === 0;
      const ey = up ? y - h * 0.09 - h * 0.06 * (i % 4 === 0 ? 1 : 0) : y + h * 0.13 + h * 0.06 * (i % 4 === 1 ? 1 : 0);
      ctx.save(); ctx.globalAlpha = u;
      ctx.strokeStyle = C.ochre; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex, up ? ey + 8 : ey - 10); ctx.stroke();
      ctx.fillStyle = C.ochre; ctx.beginPath(); ctx.arc(ex, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = display(Math.max(14, h * 0.028)); ctx.textAlign = 'center'; ctx.textBaseline = up ? 'bottom' : 'top';
      const lines = e.label.split('|');
      lines.forEach((ln, k) => ctx.fillText(ln, ex, up ? ey - (lines.length - 1 - k) * h * 0.034 : ey + k * h * 0.034));
      ctx.restore();
    });
    if (p.title) { ctx.fillStyle = C.ink3; ctx.font = mono(Math.max(10, h * 0.015)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(p.title.toUpperCase(), pad, h * 0.14); }
  };

  /* Radiocarbon decay: a population of atoms halving every half-life, with the curve drawn alongside. */
  D.decay = function (ctx, w, h, t, p) {
    ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, w, h);
    const half = p.halfLife || 5730, halves = p.halves || 8, secPerHalf = p.secPerHalf || 1.4;
    const T = t / secPerHalf; // in half-lives
    const pad = w * 0.1, left = pad, right = w - pad, bottom = h * 0.78, top = h * 0.2;
    const x = (k) => left + (k / halves) * (right - left);
    const y = (f) => bottom - f * (bottom - top);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.moveTo(left, bottom); ctx.lineTo(left, top); ctx.stroke();
    ctx.fillStyle = C.ink3; ctx.font = mono(Math.max(10, h * 0.015)); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let k = 0; k <= halves; k += 2) ctx.fillText(BB.num(k * half), x(k), bottom + 10);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const f of [1, 0.5, 0.25, 0.125]) ctx.fillText(`${Math.round(f * 100)}%`, left - 10, y(f));
    ctx.strokeStyle = C.ochre; ctx.lineWidth = 2.5; ctx.beginPath();
    const n = 200, kmax = Math.min(halves, T);
    for (let i = 0; i <= n; i++) { const k = (i / n) * kmax; const px = x(k), py = y(Math.pow(0.5, k)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    // atoms
    const cols = 20, rows = 8, total = cols * rows, remain = Math.round(total * Math.pow(0.5, Math.min(T, halves)));
    const ax = w * 0.62, ay = h * 0.24, cell = Math.min(w * 0.014, h * 0.03);
    for (let i = 0; i < total; i++) {
      const cx = ax + (i % cols) * cell, cy = ay + Math.floor(i / cols) * cell;
      // deterministic decay order
      const order = (i * 7919) % total;
      const alive = order < remain;
      ctx.fillStyle = alive ? C.ochre : 'rgba(236,226,208,0.12)';
      ctx.beginPath(); ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.ink; ctx.font = display(Math.max(16, h * 0.032)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${BB.num(Math.round(Math.min(T, halves) * half))} years`, ax, ay + rows * cell + h * 0.05);
    ctx.fillStyle = C.ink2; ctx.font = mono(Math.max(10, h * 0.015));
    ctx.fillText(`${remain} of ${total} carbon-14 atoms left`.toUpperCase(), ax, ay + rows * cell + h * 0.085);
    if (p.title) { ctx.fillStyle = C.ink3; ctx.fillText(p.title.toUpperCase(), left, top - 24); }
    if (T > halves + 0.5 && p.limit) { ctx.fillStyle = C.red; ctx.font = display(Math.max(14, h * 0.026)); ctx.fillText(p.limit, left, bottom + h * 0.09); }
  };

  /* Magnetic reversals: a column of normal (light) and reversed (dark) stripes scrolling up, the present at the top. */
  D.reversals = function (ctx, w, h, t, p) {
    ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, w, h);
    const chrons = p.chrons || [[0, 0.773, 'Brunhes', true], [0.773, 0.99, '', false], [0.99, 1.07, 'Jaramillo', true], [1.07, 1.78, '', false], [1.78, 1.94, 'Olduvai', true], [1.94, 2.58, 'Matuyama', false], [2.58, 3.05, 'Gauss', true], [3.05, 3.12, '', false], [3.12, 3.22, '', true], [3.22, 3.33, '', false], [3.33, 3.6, 'Gauss', true], [3.6, 4.2, 'Gilbert', false]];
    const maxMa = p.maxMa || 3.5;
    const shown = Math.min(maxMa, ease(t / (p.secs || 7)) * maxMa);
    const left = w * 0.42, cw = w * 0.16, top = h * 0.14, bottom = h * 0.86;
    const y = (ma) => top + (ma / maxMa) * (bottom - top);
    for (const [a, b, name, normal] of chrons) {
      if (a >= shown) continue;
      const bb = Math.min(b, shown);
      ctx.fillStyle = normal ? '#d7e5ec' : '#2b2823';
      ctx.fillRect(left, y(a), cw, y(bb) - y(a));
      if (name && bb - a > 0.12 && bb >= b - 0.001) { ctx.fillStyle = normal ? '#1a1813' : C.ink2; ctx.font = mono(Math.max(9, h * 0.014)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name.toUpperCase(), left + cw / 2, (y(a) + y(b)) / 2); }
    }
    ctx.strokeStyle = C.line; ctx.strokeRect(left, top, cw, bottom - top);
    ctx.fillStyle = C.ink3; ctx.font = mono(Math.max(10, h * 0.015)); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let ma = 0; ma <= maxMa + 0.01; ma += 0.5) if (ma <= shown + 0.01) ctx.fillText(ma === 0 ? 'today' : `${ma.toFixed(1)} million years`, left - 14, y(ma));
    if (shown >= 0.773) {
      const u = step(t, (0.773 / maxMa) * (p.secs || 7) + 0.3, (0.773 / maxMa) * (p.secs || 7) + 1.2);
      ctx.save(); ctx.globalAlpha = u;
      ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left - 6, y(0.773)); ctx.lineTo(left + cw + 6, y(0.773)); ctx.stroke();
      ctx.fillStyle = C.red; ctx.font = display(Math.max(14, h * 0.028)); ctx.textAlign = 'left';
      ctx.fillText('Last full reversal', left + cw + 18, y(0.773) - 10);
      ctx.fillStyle = C.ochre; ctx.font = mono(Math.max(10, h * 0.016)); ctx.fillText('773,000 YEARS AGO', left + cw + 18, y(0.773) + 12);
      ctx.restore();
    }
    ctx.fillStyle = C.ink2; ctx.font = mono(Math.max(10, h * 0.015)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('LIGHT: FIELD AS TODAY   DARK: REVERSED', left, top - 16);
  };

  BB.diagrams = D;
})();
