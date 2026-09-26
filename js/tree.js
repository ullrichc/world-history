/* Family tree: hominin species as time ranges on a logarithmic axis, with known episodes of interbreeding. */
(function () {
  const BB = window.BB;
  const C = window.LD_CONTENT;
  const NS = 'http://www.w3.org/2000/svg';
  const GROUPS = [
    { id: 'early', label: 'Earliest hominins', color: '#b9a888' },
    { id: 'australopith', label: 'Australopiths', color: '#e3b15c' },
    { id: 'paranthropus', label: 'Robust australopiths', color: '#c9a36b' },
    { id: 'early-homo', label: 'Early Homo', color: '#de8a5a' },
    { id: 'erectus', label: 'Homo erectus and island forms', color: '#d4694a' },
    { id: 'archaic', label: 'Later archaic humans', color: '#c893b6' },
    { id: 'sapiens', label: 'Our species', color: '#efe3c9' },
  ];
  let built = false, root, svg, card, selected = null, nowLine, x;

  function s(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  }

  function build() {
    root = document.getElementById('ov-tree');
    root.innerHTML = `
      <div class="overlay-bar"><h2>The hominin family tree</h2><span class="label">${C.species.length} species</span>
        <button class="chip-btn close" id="tree-close">${BB.icons.close}<span>Back to the globe</span></button></div>
      <div class="overlay-body"><div class="tree-wrap">
        <p class="tree-intro">Each bar spans the oldest and youngest fossils or traces generally accepted for a species; paler ends show the wider range some researchers argue for. Dashed outlines mark species whose status is disputed. Arrows show interbreeding documented by ancient DNA. Ancestor and descendant links are left out on purpose: for most species they are still argued over. Time is stretched toward the present so the crowded last few hundred thousand years stay readable.</p>
        <div class="tree-legend">${GROUPS.map((g) => `<span><i style="--c:${g.color}"></i>${g.label}</span>`).join('')}<span><i class="dash" style="--c:var(--yellow-ochre)"></i>Gene flow</span><span><i class="dash" style="--c:var(--red-ochre)"></i>Current time on the globe</span></div>
        <div class="tree-scroll"><svg id="tree-svg" role="img" aria-label="Chart of hominin species through time"></svg></div>
        <div class="species-card" id="species-card"></div>
        <div class="flows" id="flows"></div>
      </div></div>`;
    root.querySelector('#tree-close').addEventListener('click', () => BB.closeOverlay());
    svg = root.querySelector('#tree-svg');
    card = root.querySelector('#species-card');
    draw();
    root.querySelector('#flows').innerHTML = (C.geneFlow || []).map((f) => `
      <div><b>${BB.esc(f.label)}</b><span class="amt">${BB.esc(f.amount || '')}${f.when ? ` · about ${BB.esc(BB.formatAge(f.when))}` : ''}</span><p style="margin:6px 0 0">${BB.esc(f.text || '')}</p></div>`).join('');
    built = true;
    if (C.species.length) select(C.species.find((sp) => sp.id === 'homo-erectus') ? 'homo-erectus' : C.species[0].id);
  }

  function draw() {
    const rows = [];
    for (const g of GROUPS) {
      const sp = C.species.filter((x) => x.group === g.id).sort((a, b) => b.start - a.start);
      if (!sp.length) continue;
      rows.push({ group: g });
      sp.forEach((x) => rows.push({ sp: x, group: g }));
    }
    const W = Math.max(960, svg.parentElement.clientWidth - 2);
    const rowH = 25, top = 34, left = 16, right = 16;
    const H = top + rows.length * rowH + 16;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    // A power scale: older species keep readable widths while the crowded last 300,000 years still get room.
    x = d3.scalePow().exponent(0.42).domain([8000000, 20000]).range([left, W - right - 90]);
    const ax = s('g', { class: 'axis' }, svg);
    for (const t of [7e6, 6e6, 5e6, 4e6, 3e6, 2e6, 1e6, 5e5, 2e5, 1e5, 5e4]) {
      const xx = x(t);
      s('line', { x1: xx, x2: xx, y1: top - 8, y2: H - 8 }, ax);
      const tx = s('text', { x: xx, y: top - 14, 'text-anchor': 'middle' }, ax); tx.textContent = BB.shortAge(t);
    }
    const tx = s('text', { x: W - right, y: top - 14, 'text-anchor': 'end' }, ax); tx.textContent = 'today →';
    const yOf = new Map();
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2;
      if (!r.sp) {
        const t = s('text', { class: 'group-label', x: left, y: y + 4 }, svg); t.textContent = r.group.label;
        return;
      }
      const sp = r.sp;
      yOf.set(sp.id, y);
      const g = s('g', { class: 'sp', tabindex: 0, role: 'button', 'aria-label': `${sp.name}, ${BB.formatAge(sp.start)} to ${sp.end <= 2000 ? 'today' : BB.formatAge(sp.end)}` }, svg);
      g.dataset.id = sp.id;
      const x0 = x(Math.min(sp.start, 8000000)), x1 = sp.end <= 25000 && sp.id === 'homo-sapiens' ? W - right : x(Math.max(sp.end, 20000));
      if (sp.startMax && sp.startMax > sp.start) s('rect', { x: x(Math.min(sp.startMax, 8000000)), y: y - 5, width: Math.max(1, x0 - x(Math.min(sp.startMax, 8000000))), height: 10, rx: 2, fill: r.group.color, opacity: 0.28 }, g);
      if (sp.endMin && sp.endMin < sp.end) s('rect', { x: x1, y: y - 5, width: Math.max(1, x(Math.max(sp.endMin, 20000)) - x1), height: 10, rx: 2, fill: r.group.color, opacity: 0.28 }, g);
      const deb = sp.status === 'debated';
      s('rect', {
        x: x0, y: y - 6, width: Math.max(4, x1 - x0), height: 12, rx: 3, fill: r.group.color, 'fill-opacity': deb ? 0.35 : 0.9,
        stroke: deb ? r.group.color : 'none', 'stroke-dasharray': deb ? '3 2' : 'none', 'stroke-width': 1.2,
      }, g);
      // Labels sit clear of the paler ranges too
      const xe = Math.max(x1, x0 + 4, sp.endMin && sp.endMin < sp.end ? x(Math.max(sp.endMin, 20000)) : 0);
      const xs = sp.startMax && sp.startMax > sp.start ? x(Math.min(sp.startMax, 8000000)) : x0;
      const labelRight = xe + 8 + sp.name.length * 7 < W - 4;
      const t = s('text', { x: labelRight ? xe + 8 : xs - 8, y: y + 4, 'text-anchor': labelRight ? 'start' : 'end' }, g);
      t.textContent = sp.name;
      g.addEventListener('click', () => select(sp.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(sp.id); } });
    });
    // Gene flow arrows
    const defs = s('defs', {}, svg);
    const mk = s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
    s('path', { d: 'M0 0L10 5L0 10z', fill: '#e3b15c' }, mk);
    for (const f of C.geneFlow || []) {
      const y0 = yOf.get(f.from), y1 = yOf.get(f.to);
      if (y0 == null || y1 == null || !f.when) continue;
      const xx = x(BB.clamp(f.when, 20000, 8000000));
      const p = s('path', {
        class: 'flow', d: `M${xx},${y0} C${xx + 18},${(y0 * 2 + y1) / 3} ${xx + 18},${(y0 + 2 * y1) / 3} ${xx},${y1 + (y1 > y0 ? -7 : 7)}`,
        stroke: '#e3b15c', 'stroke-dasharray': f.confidence === 'established' ? 'none' : '4 3', 'marker-end': 'url(#arrow)', opacity: 0.85,
      }, svg);
      const tt = s('title', {}, p); tt.textContent = `${f.label}${f.amount ? `: ${f.amount}` : ''}`;
    }
    nowLine = s('line', { class: 'now-line', x1: 0, x2: 0, y1: top - 8, y2: H - 8 }, svg);
  }

  function select(id) {
    const sp = C.species.find((x) => x.id === id);
    if (!sp) return;
    selected = id;
    svg.querySelectorAll('.sp').forEach((g) => g.classList.toggle('sel', g.dataset.id === id));
    const ch = C.chapters.find((c) => c.id === sp.chapter);
    const range = `${BB.formatAge(sp.start)} to ${sp.end <= 2000 ? 'today' : BB.formatAge(sp.end)}`;
    card.innerHTML = `
      <div>
        <h3>${BB.esc(sp.name)}</h3>
        ${sp.nickname ? `<div class="nick">${BB.esc(sp.nickname)}</div>` : ''}
        <dl>
          <dt>Lived</dt><dd>${BB.esc(range)}</dd>
          <dt>Where</dt><dd>${sp.regions.map((r) => BB.REGIONS[r]).join(', ')}</dd>
          <dt>Brain</dt><dd>${BB.esc(sp.brain)}</dd>
          <dt>Height</dt><dd>${BB.esc(sp.stature)}</dd>
          <dt>Found</dt><dd>${BB.esc(sp.discovered)}</dd>
          <dt>Key fossils</dt><dd>${BB.esc(sp.keyFossils)}</dd>
          <dt>Status</dt><dd>${sp.status === 'debated' ? 'Disputed' : 'Widely accepted'}</dd>
        </dl>
      </div>
      <div>
        <p>${BB.esc(sp.summary)}</p>
        <p class="deb">${BB.esc(sp.debate)}</p>
        ${ch ? `<button class="btn" data-ch="${ch.id}">${BB.icons.book}Chapter: ${BB.esc(ch.title)}</button>` : ''}
      </div>`;
    const b = card.querySelector('[data-ch]');
    if (b) b.addEventListener('click', () => BB.openOverlay('read', b.dataset.ch));
  }

  BB.Tree = {
    open(time) {
      if (!built) build();
      if (nowLine && time) { const xx = x(BB.clamp(time, 20000, 8000000)); nowLine.setAttribute('x1', xx); nowLine.setAttribute('x2', xx); }
    },
    select(id) { if (!built) build(); select(id); },
  };
})();
