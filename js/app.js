/* Before Bronze: application controller. */
(function () {
  const BB = window.BB;
  const C = window.LD_CONTENT;
  const $ = (s, r = document) => r.querySelector(s);

  const chapters = C.chapters;
  const siteById = new Map(C.sites.map((s) => [s.id, s]));
  C.sites.forEach((s) => { s.cat = BB.categoryOf(s.type); });
  const actById = new Map(C.acts.map((a) => [a.id, a]));

  const state = {
    mode: 'journey',
    overlay: null,
    index: 0,
    time: 3300000,
    autoAdvance: BB.store.get('autoAdvance', true),
    cinema: false,
    regions: new Set(Object.keys(BB.REGIONS)),
    cats: new Set(BB.CATEGORIES.map((c) => c.id)),
    query: '',
    allTimes: false,
    started: false,
  };
  BB.state = state;

  let globe, timeline, narrator;
  let timeAnim = null;

  /* Boot -------------------------------------------------------------------------------------- */
  function boot() {
    globe = new BB.Globe($('#globe-base'), $('#globe-overlay'));
    timeline = new BB.Timeline($('#timeline'), chapters);
    narrator = new BB.Narrator();
    BB.globe = globe; BB.narrator = narrator; BB.timeline = timeline;
    makeGrain();
    buildTransport();
    buildExplorePanel();
    buildSettings();
    wireModes();
    layout();
    window.addEventListener('resize', () => { globe.resize(); layout(); });

    globe.events.on('click', (site) => {
      if (site) openSiteCard(site);
      else closeSiteCard();
    });
    globe.events.on('interact', () => { if (siteCardSite) positionSiteCard(); });
    timeline.events.on('chapter', (ch) => {
      closeOverlay();
      setMode('journey');
      goToChapter(chapters.indexOf(ch), { autoplay: narrator.playing || state.started });
    });
    timeline.events.on('scrub', (t, phase) => {
      if (state.mode === 'journey') {
        narrator.pause();
        setMode('explore');
        if (phase === 'start') BB.toast('Exploring freely. Pick a chapter or press play to resume the journey.');
      }
      stopTimeAnim();
      setTime(t);
    });

    narrator.events.on('sentence', (i) => highlightSentence(i));
    narrator.events.on('progress', (p) => {
      if (state.mode !== 'journey') return;
      const ch = chapters[state.index];
      $('#progress i').style.width = `${(p * 100).toFixed(2)}%`;
      if (!timeAnim) setTime(BB.logLerp(ch.start, ch.end, BB.easeInOut(p)));
    });
    narrator.events.on('state', updatePlayButton);
    narrator.events.on('end', () => {
      if (state.mode === 'journey' && state.autoAdvance && state.index < chapters.length - 1) {
        setTimeout(() => { if (!narrator.playing && state.mode === 'journey') goToChapter(state.index + 1, { autoplay: true }); }, 1400);
      }
    });

    document.addEventListener('keydown', onKey);
    buildIntro();
    // Deep links: #explore, #tree, #sources, #chapters, or a chapter id.
    const h = decodeURIComponent(location.hash.slice(1));
    if (h) {
      const i = chapters.findIndex((c) => c.id === h);
      if (i >= 0) { dismissIntro(); goToChapter(i, { autoplay: false }); openOverlay('read', chapters[i].id); }
      else if (h === 'explore') { dismissIntro(); setMode('explore'); }
      else if (h === 'tree') { dismissIntro(); goToChapter(0, {}); openOverlay('tree'); }
      else if (h === 'sources') { dismissIntro(); goToChapter(0, {}); openOverlay('about'); }
      else if (h === 'chapters') { dismissIntro(); goToChapter(0, {}); openOverlay('read', chapters[0].id); }
    }
  }

  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
  }

  /* Layout ------------------------------------------------------------------------------------ */
  function isNarrow() { return window.innerWidth <= 860; }
  function layout() {
    const app = $('#app').getBoundingClientRect();
    const top = $('.topbar').getBoundingClientRect().bottom - app.top;
    $('#app').style.setProperty('--top-offset', `${Math.round(top)}px`);
    const dockTop = $('.dock').getBoundingClientRect().top - app.top;
    let rect;
    const panel = state.mode === 'journey' ? $('#panel-journey') : $('#panel-explore');
    const introOn = !$('#intro').classList.contains('gone');
    if (isNarrow()) {
      const pr = panel.getBoundingClientRect();
      const bottom = introOn || state.cinema ? dockTop : pr.top - app.top;
      rect = { x: 0, y: top, w: app.width, h: Math.max(160, bottom - top) };
    } else if (introOn) {
      rect = { x: app.width * 0.4, y: top, w: app.width * 0.6 - 20, h: dockTop - top };
    } else if (state.cinema) {
      rect = { x: 20, y: top, w: app.width - 40, h: dockTop - top - 60 };
    } else {
      const pr = panel.getBoundingClientRect();
      const x0 = pr.right - app.left + 8;
      rect = { x: x0, y: top, w: app.width - x0 - 12, h: dockTop - top };
    }
    globe.setStage(rect);
    if (siteCardSite) positionSiteCard();
  }
  BB.layout = layout;

  /* Modes and overlays -------------------------------------------------------------------------- */
  function wireModes() {
    document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.mode;
      dismissIntro();
      if (m === 'journey' || m === 'explore') { closeOverlay(); setMode(m); if (m === 'journey' && !narrator.chapter) goToChapter(state.index, {}); }
      else openOverlay(m, m === 'read' ? chapters[state.index].id : undefined);
    }));
    $('#btn-projection').addEventListener('click', () => {
      globe.setMode(globe.mode === 'globe' ? 'flat' : 'globe');
      updateProjectionButton();
      refocus();
    });
    updateProjectionButton();
  }
  function updateProjectionButton() {
    const b = $('#btn-projection');
    const flat = globe.mode === 'flat';
    b.innerHTML = `${flat ? BB.icons.globe : BB.icons.map}<span class="txt">${flat ? 'Globe' : 'Flat map'}</span>`;
    b.setAttribute('aria-label', flat ? 'Switch to globe' : 'Switch to flat map');
  }
  function refocus() {
    if (state.mode === 'journey') globe.flyTo(globe.fitBox(chapters[state.index].focus), 600);
    else globe.flyTo({ ...globe.cam, zoom: 1 }, 600);
  }

  function setMode(m) {
    state.mode = m;
    $('#app').dataset.mode = m;
    $('#panel-journey').hidden = m !== 'journey';
    $('#panel-explore').hidden = m !== 'explore';
    document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === (state.overlay || m))));
    globe.labelAll = m === 'explore';
    if (m === 'explore') { narrator.pause(); refreshExplore(); }
    else refreshJourneySites();
    layout();
  }

  function openOverlay(name, arg) {
    closeSiteCard();
    state.overlay = name;
    for (const o of ['read', 'tree', 'about']) $(`#ov-${o}`).hidden = o !== name;
    if (name === 'read') BB.Reader.open(arg);
    if (name === 'tree') BB.Tree.open(state.time);
    if (name === 'about') BB.About.open();
    document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === name)));
    const ov = $(`#ov-${name}`);
    const focusEl = ov.querySelector('.close');
    if (focusEl) focusEl.focus({ preventScroll: true });
  }
  function closeOverlay() {
    if (!state.overlay) return;
    $(`#ov-${state.overlay}`).hidden = true;
    state.overlay = null;
    document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
  }
  BB.openOverlay = openOverlay;
  BB.closeOverlay = closeOverlay;

  /* Time ------------------------------------------------------------------------------------------- */
  function setTime(t) {
    state.time = BB.clamp(t, BB.TIME_MIN, BB.TIME_MAX);
    globe.setTime(state.time);
    timeline.setTime(state.time);
    updateBadge();
    if (state.mode === 'journey') refreshJourneySites();
    else scheduleExplore();
  }
  function animateTime(to, dur) {
    stopTimeAnim();
    const from = state.time;
    if (BB.reducedMotion() || !dur) { setTime(to); return; }
    const t0 = performance.now();
    const step = (ts) => {
      const u = BB.clamp((ts - t0) / dur, 0, 1);
      setTime(BB.logLerp(from, to, BB.easeInOut(u)));
      if (u < 1) timeAnim = requestAnimationFrame(step); else timeAnim = null;
    };
    timeAnim = requestAnimationFrame(step);
  }
  function stopTimeAnim() { if (timeAnim) cancelAnimationFrame(timeAnim); timeAnim = null; }

  function updateBadge() {
    const t = state.time;
    const sea = Math.round(BB.seaLevel(t));
    $('#badge-when').innerHTML = `${BB.esc(BB.formatAge(t))}${t < 12000 ? `<small>${BB.esc(BB.formatAgeSub(t))}</small>` : ''}`;
    const seaTxt = sea <= -2 ? `−${-sea} m` : sea >= 2 ? `+${sea} m` : 'about today’s level';
    $('#badge-sea').innerHTML = `Sea level <b>${seaTxt}</b>${BB.iceFactor(sea) > 0.5 ? ' · ice sheets' : ''}`;
  }

  /* Journey ---------------------------------------------------------------------------------------- */
  function goToChapter(i, opts = {}) {
    i = BB.clamp(i, 0, chapters.length - 1);
    const ch = chapters[i];
    state.index = i;
    closeSiteCard();
    narrator.load(ch);
    narrator.prefetch(ch).then(() => { if (state.index === i && chapters[i + 1]) narrator.prefetch(chapters[i + 1]); });
    renderJourneyPanel(ch);
    timeline.setCurrent(ch.id);
    $('#np-title').innerHTML = `<b>${BB.esc(ch.title)}</b> <span>· ${i + 1} of ${chapters.length}</span>`;
    $('#progress i').style.width = '0%';
    $('#badge-region').textContent = ch.regions.length >= 4 ? 'The whole world' : ch.regions.map((r) => BB.REGIONS[r]).join(' · ');
    $('#subtitle').textContent = '';
    const routes = (ch.routes || []).map((r) => ({ route: r, coords: BB.densifyRoute(r.path), debated: r.certainty === 'debated', label: r.label, progress: 0 }));
    journeyRoutes = routes;
    globe.setRoutes([]);
    appeared = new Map();
    const flight = globe.flyTo(globe.fitBox(ch.focus));
    animateTime(ch.start, BB.reducedMotion() ? 0 : 1600);
    refreshJourneySites();
    history.replaceState(null, '', `#${ch.id}`);
    if (opts.autoplay) {
      state.started = true;
      flight.then(() => { if (state.index === i && state.mode === 'journey') narrator.play(); });
    }
  }
  BB.goToChapter = (i, o) => { dismissIntro(); closeOverlay(); setMode('journey'); goToChapter(i, o); };

  let journeyRoutes = [];
  let appeared = new Map();
  function refreshJourneySites() {
    const ch = chapters[state.index];
    if (!ch) return;
    const t = state.time;
    const own = new Set(ch.siteIds);
    const now = performance.now();
    const entries = [];
    for (const s of C.sites) {
      if (own.has(s.id)) {
        const reached = t <= s.start * 1.04 || s.start < ch.end || s.start > ch.start;
        if (reached && !appeared.has(s.id)) appeared.set(s.id, now);
        entries.push({ site: s, color: s.cat.color, emphasis: reached ? 1 : 0, alpha: reached ? 1 : 0, appearedAt: appeared.get(s.id) });
      } else if (inWindow(s, t, 1.6)) {
        entries.push({ site: s, color: s.cat.color, emphasis: 0, alpha: 0.28 });
      }
    }
    globe.setSites(entries);
    const logT = Math.log(t);
    for (const r of journeyRoutes) {
      const a = Math.log(r.route.start), b = Math.log(Math.max(r.route.end, 1));
      r.progress = t <= r.route.end ? 1 : t >= r.route.start ? 0 : BB.clamp((a - logT) / (a - b), 0, 1);
    }
    globe.setRoutes(journeyRoutes.filter((r) => r.progress > 0));
  }

  function inWindow(s, t, w) { return s.end <= t * w && s.start >= t / w; }

  function renderJourneyPanel(ch) {
    const act = actById.get(ch.act);
    const p = $('#panel-journey .panel-scroll');
    let si = 0;
    const narr = ch.paragraphs.map((para) => `<p>${para.map((s) => `<span class="s" data-i="${si++}">${BB.esc(s)}</span>`).join(' ')}</p>`).join('');
    const regions = ch.regions.map((r) => BB.REGIONS[r]).join(', ');
    p.innerHTML = `
      <div class="chapter-head">
        <div class="chapter-kicker label"><span class="act">${BB.esc(act ? act.label : '')}</span><span>${BB.esc(act ? act.title : '')}</span></div>
        <div class="emblem" aria-hidden="true">${BB.emblem(ch.emblem)}</div>
        <h1 class="chapter-title" id="chapter-title">${BB.esc(ch.title)}</h1>
        <p class="chapter-sub">${BB.esc(ch.subtitle)}</p>
      </div>
      <div class="chapter-meta"><span class="date">${BB.esc(ch.dateLabel)}</span><span>${BB.esc(ch.era)}</span><span>${BB.esc(regions)}</span></div>
      <div class="narration idle" id="narration" aria-live="off">${narr}</div>
      <dl class="facts">${ch.keyFacts.map((k) => `<div><dt>${BB.esc(k.label)}</dt><dd>${BB.esc(k.value)}</dd></div>`).join('')}</dl>
      <div class="chapter-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px">
        <button class="btn" id="btn-read">${BB.icons.book}Read the full chapter</button>
        <button class="btn" id="btn-debates">${ch.debates.length} debate${ch.debates.length === 1 ? '' : 's'}</button>
      </div>`;
    p.scrollTop = 0;
    p.querySelectorAll('.s').forEach((el) => el.addEventListener('click', () => {
      if (!narrator.playing) { narrator.jumpTo(+el.dataset.i); narrator.play(+el.dataset.i); }
      else narrator.jumpTo(+el.dataset.i);
    }));
    $('#btn-read').addEventListener('click', () => openOverlay('read', ch.id));
    $('#btn-debates').addEventListener('click', () => openOverlay('read', `${ch.id}--debates`));
  }

  function highlightSentence(i) {
    const n = $('#narration');
    if (!n) return;
    n.classList.toggle('idle', i < 0);
    n.querySelectorAll('.s').forEach((el) => {
      const k = +el.dataset.i;
      el.classList.toggle('now', k === i);
      el.classList.toggle('past', k < i);
    });
    const cur = n.querySelector('.s.now');
    if (cur) {
      const sc = $('#panel-journey .panel-scroll');
      const r = cur.getBoundingClientRect(), pr = sc.getBoundingClientRect();
      if (r.top < pr.top + 60 || r.bottom > pr.bottom - 40) sc.scrollTo({ top: sc.scrollTop + r.top - pr.top - pr.height * 0.3, behavior: BB.reducedMotion() ? 'auto' : 'smooth' });
      $('#subtitle').textContent = cur.textContent;
    }
  }

  function updatePlayButton() {
    const b = $('#btn-play');
    b.innerHTML = narrator.playing ? BB.icons.pause : BB.icons.play;
    b.setAttribute('aria-label', narrator.playing ? 'Pause narration' : 'Play narration');
    const eng = narrator.engineInUse();
    $('#btn-voice').innerHTML = `${eng === 'captions' ? BB.icons.cc : BB.icons.voice}<span class="txt">${eng === 'recorded' ? 'Narrator' : eng === 'browser' ? 'Browser voice' : 'Captions only'}</span>`;
  }

  function buildTransport() {
    $('#btn-prev').innerHTML = BB.icons.prev;
    $('#btn-next').innerHTML = BB.icons.next;
    $('#btn-play').addEventListener('click', () => {
      dismissIntro();
      if (state.overlay) closeOverlay();
      if (state.mode !== 'journey') { setMode('journey'); goToChapter(state.index, { autoplay: true }); return; }
      state.started = true;
      narrator.toggle();
    });
    $('#btn-prev').addEventListener('click', () => { dismissIntro(); if (state.mode !== 'journey') setMode('journey'); goToChapter(state.index - 1, { autoplay: narrator.playing || state.started }); });
    $('#btn-next').addEventListener('click', () => { dismissIntro(); if (state.mode !== 'journey') setMode('journey'); goToChapter(state.index + 1, { autoplay: narrator.playing || state.started }); });
    const sp = $('#speed');
    sp.value = String(narrator.rate);
    sp.addEventListener('change', () => narrator.setRate(+sp.value));
    $('#btn-cinema').addEventListener('click', () => toggleCinema());
    updatePlayButton();
  }

  function toggleCinema(on = !state.cinema) {
    state.cinema = on;
    $('#app').classList.toggle('cinema', on);
    $('#btn-cinema').setAttribute('aria-pressed', String(on));
    layout();
    if (state.mode === 'journey') globe.flyTo(globe.fitBox(chapters[state.index].focus), 700);
  }

  /* Explore ---------------------------------------------------------------------------------------- */
  function buildExplorePanel() {
    const regionChips = Object.entries(BB.REGIONS).map(([id, name]) => `<button class="chip" data-region="${id}" aria-pressed="true">${name}</button>`).join('');
    const catChips = BB.CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="true" style="--c:${c.color}"><i></i>${c.label}</button>`).join('');
    $('#panel-explore .panel-scroll').innerHTML = `
      <div class="label" style="color:var(--yellow-ochre)">Explore</div>
      <h1 class="chapter-title">Sites through time</h1>
      <p class="chapter-sub">Drag along the timeline to travel through time. The map shows the places with evidence from that moment; the sea level and ice sheets follow the climate record.</p>
      <div class="search" style="margin-top:16px">${BB.icons.search}<label class="sr-only" for="q">Search sites</label><input id="q" type="search" placeholder="Search sites, countries, finds" autocomplete="off"></div>
      <div class="filter-group"><span class="label">Continents</span><div class="chips">${regionChips}</div></div>
      <div class="filter-group"><span class="label">Evidence</span><div class="chips">${catChips}</div></div>
      <label class="toggle-row"><input type="checkbox" id="alltimes"> Show sites from all periods</label>
      <label class="toggle-row"><input type="checkbox" id="borders"> Show modern borders for orientation</label>
      <div class="explore-count"><span class="label" id="explore-count"></span><button class="btn" id="btn-world" style="min-height:30px;padding:4px 10px">Whole world</button></div>
      <ul class="site-list" id="site-list"></ul>
      <div class="living"><span class="label">Hominins living at this time</span><div class="chips" id="living"></div></div>`;
    $('#q').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); scheduleExplore(); });
    document.querySelectorAll('#panel-explore [data-region]').forEach((b) => b.addEventListener('click', () => toggleSet(state.regions, b.dataset.region, b)));
    document.querySelectorAll('#panel-explore [data-cat]').forEach((b) => b.addEventListener('click', () => toggleSet(state.cats, b.dataset.cat, b)));
    $('#alltimes').addEventListener('change', (e) => { state.allTimes = e.target.checked; refreshExplore(); });
    const bd = $('#borders');
    bd.checked = globe.showBorders;
    bd.addEventListener('change', (e) => { globe.showBorders = e.target.checked; BB.store.set('borders', e.target.checked); globe.dirtyBase = true; });
    $('#btn-world').addEventListener('click', () => globe.flyTo({ lon: globe.cam.lon, lat: 15, zoom: 1 }, 900));
  }
  function toggleSet(set, key, btn) {
    if (set.has(key) && set.size === 1) { // clicking the only active chip re-enables all
      const all = btn.dataset.region ? Object.keys(BB.REGIONS) : BB.CATEGORIES.map((c) => c.id);
      all.forEach((k) => set.add(k));
    } else if (set.has(key) && set.size === (btn.dataset.region ? 5 : BB.CATEGORIES.length)) { // first click isolates
      set.clear(); set.add(key);
    } else if (set.has(key)) set.delete(key);
    else set.add(key);
    const attr = btn.dataset.region ? 'region' : 'cat';
    document.querySelectorAll(`#panel-explore [data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(set.has(b.dataset[attr]))));
    refreshExplore();
  }

  let exploreTimer = null;
  function scheduleExplore() {
    if (state.mode !== 'explore') return;
    if (exploreTimer) return;
    exploreTimer = requestAnimationFrame(() => { exploreTimer = null; refreshExplore(); });
  }
  function matches(s) {
    if (!state.regions.has(s.region) || !state.cats.has(s.cat.id)) return false;
    if (state.query) {
      const hay = `${s.name} ${s.country} ${s.summary}`.toLowerCase();
      if (!hay.includes(state.query)) return false;
    }
    return true;
  }
  function refreshExplore() {
    if (state.mode !== 'explore') return;
    const t = state.time;
    const w = 1.45;
    const list = [];
    const entries = [];
    for (const s of C.sites) {
      if (!matches(s)) continue;
      let a = 0;
      if (state.allTimes || state.query) a = 1;
      else if (t <= s.start * 1.02 && t >= s.end / 1.02) a = 1;
      else if (inWindow(s, t, w)) {
        const d = t > s.start ? Math.log(t / s.start) : Math.log(s.end / t);
        a = BB.clamp(1 - d / Math.log(w), 0.25, 1);
      }
      if (a <= 0) continue;
      entries.push({ site: s, color: s.cat.color, emphasis: 0, alpha: a });
      list.push(s);
    }
    globe.setSites(entries);
    globe.setRoutes([]);
    list.sort((a, b) => b.start - a.start);
    $('#explore-count').textContent = `${list.length} site${list.length === 1 ? '' : 's'} ${state.allTimes || state.query ? 'in all periods' : 'near this time'}`;
    const ul = $('#site-list');
    ul.innerHTML = list.slice(0, 150).map((s) => `<li><button data-site="${s.id}" style="--c:${s.cat.color}"><i></i><span class="n">${BB.esc(s.name)}<small>${BB.esc(s.country)}</small></span><span class="d">${BB.esc(shortDate(s))}</span></button></li>`).join('');
    ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const s = siteById.get(b.dataset.site);
      focusSite(s);
    }));
    // Hominins alive at this time
    const living = (C.species || []).filter((sp) => sp.start >= t && sp.end <= t);
    $('#living').innerHTML = living.length
      ? living.map((sp) => `<button class="chip" data-sp="${sp.id}">${BB.esc(sp.name)}</button>`).join('')
      : '<span class="chip" style="font-style:normal">Only Homo sapiens</span>';
    $('#living').querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => { openOverlay('tree'); BB.Tree.select(b.dataset.sp); }));
  }
  function shortDate(s) {
    if (s.dateLabel && s.dateLabel.length <= 24) return s.dateLabel;
    return BB.formatAge(s.start).replace(' years ago', '').replace('million', 'M');
  }

  function focusSite(s, opts = {}) {
    const z = Math.max(globe.cam.zoom, opts.zoom || 3.2);
    globe.flyTo({ lon: s.lon, lat: s.lat, zoom: z }, 1100).then(() => openSiteCard(s));
  }
  BB.showSite = function (id) {
    const s = siteById.get(id);
    if (!s) return;
    dismissIntro();
    closeOverlay();
    if (state.mode !== 'explore') setMode('explore');
    if (!(s.start >= state.time / 1.45 && s.end <= state.time * 1.45)) setTime(Math.sqrt(s.start * Math.max(s.end, 1)));
    focusSite(s);
  };

  /* Site card ---------------------------------------------------------------------------------- */
  let siteCardSite = null;
  function openSiteCard(s) {
    siteCardSite = s;
    globe.select(s);
    const card = $('#site-card');
    const chs = s.chapters.map((id) => chapters.find((c) => c.id === id)).filter(Boolean);
    card.innerHTML = `
      <div class="top"><span class="cat label" style="--c:${s.cat.color}"><i></i>${BB.esc(s.cat.label)}</span>
      <button class="close" aria-label="Close">${BB.icons.close}</button></div>
      <h3>${BB.esc(s.name)}</h3>
      <div class="where">${BB.esc(s.country)} <span class="mono" style="color:var(--kaolin-3);font-size:11px">· ${BB.fmtCoord(s.lat, s.lon)}</span></div>
      <div class="when">${BB.esc(s.dateLabel || BB.formatAge(s.start))}</div>
      <p>${BB.esc(s.summary)}</p>
      <div class="links">${chs.map((c) => `<a href="#${c.id}" data-ch="${c.id}">${BB.esc(c.title)}</a>`).join('')}</div>`;
    card.hidden = false;
    card.querySelector('.close').addEventListener('click', closeSiteCard);
    card.querySelectorAll('[data-ch]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOverlay('read', a.dataset.ch); }));
    positionSiteCard();
    requestAnimationFrame(followCard);
  }
  function followCard() { if (!siteCardSite) return; positionSiteCard(); requestAnimationFrame(followCard); }
  function positionSiteCard() {
    const card = $('#site-card');
    if (!siteCardSite) return;
    const xy = globe.screenPos(siteCardSite);
    const W = window.innerWidth, H = window.innerHeight;
    const cw = card.offsetWidth, chh = card.offsetHeight;
    if (isNarrow()) {
      card.style.left = '16px'; card.style.top = `${Math.max(70, (globe.stage.y + 10))}px`;
      return;
    }
    let x = xy ? xy[0] + 18 : globe.stage.x + globe.stage.w - cw - 20;
    let y = xy ? xy[1] - chh / 2 : globe.stage.y + 20;
    if (x + cw > W - 16) x = (xy ? xy[0] - cw - 18 : W - cw - 16);
    x = BB.clamp(x, 16, W - cw - 16);
    y = BB.clamp(y, 64, H - chh - 150);
    card.style.left = `${x}px`; card.style.top = `${y}px`;
  }
  function closeSiteCard() {
    siteCardSite = null;
    globe.select(null);
    $('#site-card').hidden = true;
  }

  /* Settings ------------------------------------------------------------------------------------- */
  function buildSettings() {
    const pop = $('#settings');
    const render = () => {
      const eng = narrator.engine;
      const hasRec = !!window.LD_NARRATION;
      const voices = narrator.voices || [];
      const best = narrator.bestVoice();
      pop.innerHTML = `
        <h3>Narration</h3>
        <fieldset>
          <legend class="sr-only">Narrator</legend>
          <label><input type="radio" name="eng" value="recorded" ${eng === 'recorded' ? 'checked' : ''} ${hasRec ? '' : 'disabled'}><span>Recorded narrator<small>${hasRec ? 'A neural voice rendered for every chapter, with captions in sync.' : 'Recordings are not installed.'}</small></span></label>
          <label><input type="radio" name="eng" value="browser" ${eng === 'browser' ? 'checked' : ''} ${voices.length ? '' : 'disabled'}><span>Browser voice<small>${voices.length ? 'Uses the speech voices on this device.' : 'This browser has no speech voices.'}</small></span></label>
          <label><input type="radio" name="eng" value="captions" ${eng === 'captions' ? 'checked' : ''}><span>Captions only<small>Silent. Sentences advance at reading pace.</small></span></label>
        </fieldset>
        ${voices.length ? `<label for="voice-sel" class="label" style="display:block;margin:4px 0 6px">Browser voice</label>
        <select id="voice-sel">${voices.map((v) => `<option ${best && v.name === best.name ? 'selected' : ''}>${BB.esc(v.name)}</option>`).join('')}</select>` : ''}
        <div class="row"><label for="vol" class="label" style="margin:0">Volume</label><input type="range" id="vol" min="0" max="1" step="0.05" value="${narrator.volume}"></div>
        <label class="toggle-row"><input type="checkbox" id="autoadv" ${state.autoAdvance ? 'checked' : ''}> Continue to the next chapter automatically</label>
        <p class="note">The narrator is a synthetic voice (Kokoro, an open neural text-to-speech model), not a human recording. The project is set up so recordings by a human narrator can replace it file by file; see the Sources page.</p>`;
      pop.querySelectorAll('input[name=eng]').forEach((r) => r.addEventListener('change', () => { narrator.setEngine(r.value); updatePlayButton(); }));
      const vs = pop.querySelector('#voice-sel');
      if (vs) vs.addEventListener('change', () => narrator.setVoice(vs.value));
      pop.querySelector('#vol').addEventListener('input', (e) => narrator.setVolume(+e.target.value));
      pop.querySelector('#autoadv').addEventListener('change', (e) => { state.autoAdvance = e.target.checked; BB.store.set('autoAdvance', e.target.checked); });
    };
    narrator.events.on('voices', () => { if (!pop.hidden) render(); updatePlayButton(); });
    const toggle = () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden) { render(); pop.querySelector('input:checked')?.focus(); }
    };
    $('#btn-settings').addEventListener('click', toggle);
    $('#btn-voice').addEventListener('click', toggle);
    document.addEventListener('pointerdown', (e) => {
      if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#btn-settings, #btn-voice')) pop.hidden = true;
    });
  }

  /* Keyboard -------------------------------------------------------------------------------------- */
  function onKey(e) {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'Escape') {
      if (!$('#settings').hidden) { $('#settings').hidden = true; return; }
      if (siteCardSite) { closeSiteCard(); return; }
      if (state.overlay) { closeOverlay(); return; }
      if (state.cinema) { toggleCinema(false); return; }
    }
    if (state.overlay) return;
    if (e.key === ' ' && !e.target.closest('button, a, [role=button]')) { e.preventDefault(); $('#btn-play').click(); }
    if (e.target.closest('#timeline')) return;
    if (e.key === 'ArrowRight' && state.mode === 'journey') $('#btn-next').click();
    if (e.key === 'ArrowLeft' && state.mode === 'journey') $('#btn-prev').click();
  }

  /* Intro -------------------------------------------------------------------------------------------- */
  function buildIntro() {
    const nSites = C.sites.length;
    $('#intro-numbers').innerHTML = `
      <div><b>3.3 million</b><span class="label">years of toolmaking</span></div>
      <div><b>${chapters.length}</b><span class="label">narrated chapters</span></div>
      <div><b>${nSites}</b><span class="label">sites on the map</span></div>
      <div><b>${C.species.length}</b><span class="label">hominin species</span></div>`;
    globe.autoSpin = true;
    globe.cam = { lon: 25, lat: 8, zoom: 1 };
    setTime(3300000);
    globe.setSites(C.sites.map((s) => ({ site: s, color: s.cat.color, emphasis: 0, alpha: 0.5 })));
    $('#intro-begin').addEventListener('click', () => { dismissIntro(); setMode('journey'); goToChapter(0, { autoplay: true }); });
    $('#intro-explore').addEventListener('click', () => { dismissIntro(); goToChapter(0, {}); setMode('explore'); setTime(1800000); globe.flyTo({ lon: 30, lat: 10, zoom: 1 }, 1000); });
    $('#intro-read').addEventListener('click', () => { dismissIntro(); goToChapter(0, {}); openOverlay('read', chapters[0].id); });
    BB.drawHand($('#hand-canvas'));
  }
  function dismissIntro() {
    const intro = $('#intro');
    if (intro.classList.contains('gone')) return;
    intro.classList.add('gone');
    $('#app').classList.remove('intro-on');
    globe.autoSpin = false;
    if (!narrator.chapter) { renderJourneyPanel(chapters[state.index]); narrator.load(chapters[state.index]); }
    setMode(state.mode);
    setTimeout(layout, 50);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
