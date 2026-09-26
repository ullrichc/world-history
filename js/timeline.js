/* Timeline: a logarithmic strip from 7.5 million to 2,000 years ago, with Palaeolithic stages, geological epochs,
   an estimated sea-level curve, chapter markers and a draggable playhead. */
(function () {
  const BB = window.BB;
  const NS = 'http://www.w3.org/2000/svg';

  const STAGES = [
    { a: 7500000, b: 3300000, label: 'Before stone tools', short: 'Pre-tools' },
    { a: 3300000, b: 300000, label: 'Lower Palaeolithic · Early Stone Age', short: 'Lower Palaeolithic' },
    { a: 300000, b: 50000, label: 'Middle Palaeolithic · Middle Stone Age', short: 'Middle Pal.' },
    { a: 50000, b: 11700, label: 'Upper Palaeolithic · Later Stone Age', short: 'Upper Pal.' },
    { a: 11700, b: 2000, label: 'Holocene: farming and metal, by region', short: 'Holocene' },
  ];
  const EPOCHS = [
    { a: 7500000, b: 5330000, label: 'Miocene' },
    { a: 5330000, b: 2580000, label: 'Pliocene' },
    { a: 2580000, b: 11700, label: 'Pleistocene' },
    { a: 11700, b: 2000, label: 'Holocene' },
  ];
  const TICKS = [5e6, 3e6, 2e6, 1e6, 5e5, 3e5, 2e5, 1e5, 5e4, 3e4, 2e4, 1e4, 5e3];
  const TICKS_NARROW = [5e6, 1e6, 3e5, 1e5, 3e4, 1e4];

  class Timeline {
    constructor(svg, chapters) {
      this.svg = svg;
      this.chapters = chapters;
      this.events = BB.emitter();
      this.time = 3300000;
      this.current = null;
      this.visited = new Set();
      this.tip = BB.el('div', { class: 'tl-tip', hidden: true });
      document.getElementById('app').append(this.tip);
      this.build();
      new ResizeObserver(() => this.build()).observe(svg);
    }

    s(tag, attrs, parent) {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (parent) parent.append(e);
      return e;
    }

    build() {
      const svg = this.svg;
      const W = svg.clientWidth, H = svg.clientHeight;
      if (!W || !H) return;
      this.W = W; this.H = H;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = '';
      const narrow = W < 640;
      const x = (this.x = d3.scaleLog().domain([BB.TIME_MAX, BB.TIME_MIN]).range([6, W - 6]));
      const L = (this.L = {
        label: 14,
        stageY: 18, stageH: narrow ? 8 : 15,
        // The axis labels sit on the bottom edge: curveY + curveH + 32 = H - 2
        curveY: narrow ? 28 : 36, curveH: Math.max(10, H - (narrow ? 62 : 70)),
      });
      L.markerY = L.curveY + L.curveH + 7;
      L.axisY = L.markerY + 17;

      const defs = this.s('defs', {}, svg);
      const lg = this.s('linearGradient', { id: 'seaGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      this.s('stop', { offset: '0%', 'stop-color': '#8fb7c7', 'stop-opacity': 0.05 }, lg);
      this.s('stop', { offset: '100%', 'stop-color': '#8fb7c7', 'stop-opacity': 0.28 }, lg);

      // Palaeolithic stages
      const g1 = this.s('g', { class: 'era' }, svg);
      for (const st of STAGES) {
        const x0 = x(st.a), x1 = x(st.b);
        const r = this.s('rect', { x: x0 + 0.5, y: L.stageY, width: Math.max(0, x1 - x0 - 1), height: L.stageH, rx: 1 }, g1);
        const title = this.s('title', {}, r); title.textContent = st.label;
        if (!narrow) {
          const t = this.s('text', { x: x0 + 6, y: L.stageY + 11 }, g1);
          for (const lab of [st.label, st.label.split(' · ')[0].split(':')[0], st.short, '']) {
            t.textContent = lab;
            if (!lab || t.getComputedTextLength() < x1 - x0 - 12) break;
          }
        }
      }

      // Sea-level curve
      const seaY = d3.scaleLinear().domain([-135, 10]).range([L.curveY + L.curveH, L.curveY]);
      const pts = [];
      const n = Math.min(900, W);
      for (let i = 0; i <= n; i++) {
        const t = x.invert(6 + (W - 12) * (i / n));
        pts.push([6 + (W - 12) * (i / n), seaY(BB.seaLevel(t))]);
      }
      const area = d3.area().x((d) => d[0]).y0(L.curveY + L.curveH).y1((d) => d[1]).curve(d3.curveMonotoneX);
      const line = d3.line().x((d) => d[0]).y((d) => d[1]).curve(d3.curveMonotoneX);
      this.s('path', { class: 'sea-area', d: area(pts) }, svg);
      this.s('path', { class: 'sea-line', d: line(pts) }, svg);
      this.s('line', { x1: 6, x2: W - 6, y1: seaY(0), y2: seaY(0), stroke: 'rgba(143,183,199,.35)', 'stroke-dasharray': '2 4' }, svg);
      if (!narrow) {
        const t = this.s('text', { x: W - 8, y: seaY(0) + 10, 'text-anchor': 'end', fill: 'rgba(143,183,199,.8)', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace' }, svg);
        t.textContent = 'sea level today';
        if (L.curveY + L.curveH - 3 - (seaY(0) + 10) > 12) {
          const t2 = this.s('text', { x: W - 8, y: L.curveY + L.curveH - 3, 'text-anchor': 'end', fill: 'rgba(143,183,199,.6)', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace' }, svg);
          t2.textContent = '−130 m';
        }
      }

      // Epoch boundaries
      const ge = this.s('g', { class: 'epoch' }, svg);
      for (const ep of EPOCHS) {
        const x0 = x(ep.a);
        if (ep.a < BB.TIME_MAX) this.s('line', { x1: x0, x2: x0, y1: L.curveY, y2: L.curveY + L.curveH, stroke: 'rgba(238,226,206,.16)', 'stroke-dasharray': '1 3' }, ge);
        const tt = this.s('title', {}, ge); tt.textContent = `${ep.label} epoch`;
      }

      // Axis
      const ga = this.s('g', { class: 'axis' }, svg);
      for (const tk of narrow ? TICKS_NARROW : TICKS) {
        const xx = x(tk);
        this.s('line', { x1: xx, x2: xx, y1: L.axisY - 6, y2: L.axisY - 2 }, ga);
        const t = this.s('text', { x: xx, y: L.axisY + 8, 'text-anchor': 'middle' }, ga);
        t.textContent = BB.shortAge(tk);
      }
      if (!narrow) {
        const t = this.s('text', { x: W - 6, y: L.axisY + 8, 'text-anchor': 'end' }, ga);
        t.textContent = 'years ago · log scale';
      }

      // Chapter markers
      const gm = (this.markers = this.s('g', {}, svg));
      this.markerEls = new Map();
      for (const ch of this.chapters) {
        if (ch.act === 'prologue' || ch.id === 'epilogue') continue;
        const mx = x(ch.start);
        const g = this.s('g', { class: 'marker', transform: `translate(${mx},${L.markerY})`, tabindex: 0, role: 'button', 'aria-label': `${ch.title}, ${ch.dateLabel}` }, gm);
        this.s('circle', { r: narrow ? 3 : 3.6 }, g);
        g.addEventListener('click', (e) => { e.stopPropagation(); this.events.emit('chapter', ch); });
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.events.emit('chapter', ch); } });
        g.addEventListener('pointerenter', () => this.showTip(ch, mx));
        g.addEventListener('pointerleave', () => (this.tip.hidden = true));
        this.markerEls.set(ch.id, g);
      }

      // Hit area for scrubbing (below the markers so markers stay clickable)
      const hit = this.s('rect', { class: 'hit', x: 0, y: 0, width: W, height: L.markerY - 6 }, svg);
      svg.insertBefore(hit, gm);
      let scrubbing = false;
      const toT = (e) => { const r = svg.getBoundingClientRect(); return x.invert(BB.clamp(e.clientX - r.left, 6, W - 6)); };
      hit.addEventListener('pointerdown', (e) => { scrubbing = true; hit.setPointerCapture(e.pointerId); this.events.emit('scrub', toT(e), 'start'); });
      hit.addEventListener('pointermove', (e) => { if (scrubbing) this.events.emit('scrub', toT(e), 'move'); });
      hit.addEventListener('pointerup', (e) => { if (scrubbing) { scrubbing = false; this.events.emit('scrub', toT(e), 'end'); } });
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('aria-label', 'Timeline. Use left and right arrow keys to move through time.');
      svg.onkeydown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); e.stopPropagation();
        const f = e.shiftKey ? 1.25 : 1.06;
        this.events.emit('scrub', BB.clamp(e.key === 'ArrowLeft' ? this.time * f : this.time / f, BB.TIME_MIN, BB.TIME_MAX), 'end');
      };

      // Playhead
      const ph = (this.ph = this.s('g', { class: 'playhead', 'pointer-events': 'none' }, svg));
      this.s('line', { x1: 0, x2: 0, y1: L.stageY - 2, y2: L.markerY + 4 }, ph);
      this.s('rect', { x: -3, y: L.stageY - 4, width: 6, height: 6, transform: 'rotate(45)', 'transform-origin': `0 ${L.stageY - 1}` }, ph);
      this.phText = this.s('text', { x: 0, y: L.label - 3 }, ph);
      this.update();
    }

    showTip(ch, mx) {
      const r = this.svg.getBoundingClientRect();
      const app = document.getElementById('app').getBoundingClientRect();
      this.tip.innerHTML = `<b>${BB.esc(ch.title)}</b><span>${BB.esc(ch.dateLabel)}</span>`;
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth;
      this.tip.style.left = `${BB.clamp(r.left - app.left + mx - tw / 2, 8, app.width - tw - 8)}px`;
      this.tip.style.top = `${r.top - app.top - this.tip.offsetHeight - 6}px`;
    }

    setTime(t) { this.time = t; this.update(); }
    setCurrent(id) {
      if (this.current) this.visited.add(this.current);
      this.current = id;
      this.update();
    }

    update() {
      if (!this.ph) return;
      const xx = this.x(BB.clamp(this.time, BB.TIME_MIN, BB.TIME_MAX));
      this.ph.setAttribute('transform', `translate(${xx},0)`);
      const label = BB.formatAge(this.time);
      this.phText.textContent = label;
      const w = label.length * 6.4;
      const anchor = xx + w / 2 > this.W ? 'end' : xx - w / 2 < 0 ? 'start' : 'middle';
      this.phText.setAttribute('text-anchor', anchor);
      for (const [id, g] of this.markerEls) {
        g.classList.toggle('current', id === this.current);
        g.classList.toggle('visited', this.visited.has(id));
      }
    }
  }
  BB.Timeline = Timeline;
})();
