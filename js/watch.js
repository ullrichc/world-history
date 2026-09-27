/* Watch: the documentary series inside the app. An episode is a sequence of scenes; each scene has one audio file
   (several voices) with cue and sentence timings, a camera, a time range for the timeline, and on-screen cards.
   The player drives the globe, the timeline and the captions; the app's own controls (Explore, Chapters) stay
   available, so a viewer can pause anywhere and look around. */
(function () {
  const BB = window.BB;
  const S = window.LD_SERIES;
  const C = window.LD_CONTENT;
  const $ = (s, r = document) => r.querySelector(s);
  const speakers = new Map((S ? S.speakers : []).map((sp) => [sp.id, sp]));

  /* Timing model ---------------------------------------------------------------------------------- */
  const readTime = (s) => Math.max(1.6, s.split(/\s+/).length / 2.45);

  // Builds the play model of a scene: duration, cue and sentence timings (recorded if audio exists, else estimated)
  function sceneModel(ep, sc) {
    const rec = window.LD_SERIES_AUDIO && window.LD_SERIES_AUDIO[ep.id] && window.LD_SERIES_AUDIO[ep.id][sc.id];
    const cues = [];
    let pos = 0;
    sc.cues.forEach((cue, i) => {
      if (rec && rec.cues[i]) {
        cues.push({ start: rec.cues[i].start, end: rec.cues[i].end, sentences: rec.cues[i].sentences });
      } else {
        if (i) pos += 0.7;
        const start = pos, sents = [];
        cue.sentences.forEach((s, j) => { const d = readTime(s); sents.push([pos, pos + d]); pos += d + (j < cue.sentences.length - 1 ? 0.42 : 0); });
        cues.push({ start, end: pos, sentences: sents });
      }
    });
    const duration = rec ? rec.duration : pos + 0.6;
    // Keyframes for the timeline: scene start, cue times, scene end (log-interpolated)
    const keys = [[0, sc.start]];
    sc.cues.forEach((cue, i) => { if (cue.time != null) keys.push([cues[i].start, cue.time]); });
    if (sc.end !== sc.start) keys.push([duration, sc.end]);
    return { rec, file: rec ? rec.file : null, duration, cues, keys };
  }

  function timeAt(model, t) {
    const k = model.keys;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const [a, ya] = k[i - 1], [b, yb] = k[i];
        if (b <= a) return yb;
        return BB.logLerp(ya, yb, BB.easeInOut((t - a) / (b - a)));
      }
    }
    return k[k.length - 1][1];
  }

  /* Player ---------------------------------------------------------------------------------------- */
  class Player {
    constructor() {
      this.events = BB.emitter();
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.rate = BB.store.get('rate', 1);
      this.audio.volume = BB.store.get('volume', 1);
      this.blobs = new Map();
      this.playing = false;
      this.episode = null;
      this.scene = -1;
      this.cue = -1;
      this.sentence = -1;
      this.audio.addEventListener('ended', () => this.next(true));
      this.audio.addEventListener('error', () => {
        const m = this.model();
        if (m && m.file && (this.audio.getAttribute('src') || '').startsWith('blob:')) {
          this.noBlobs = true;
          const t = this.audio.currentTime;
          this.audio.src = m.file;
          if (t) this.audio.currentTime = t;
          if (this.playing) this.audio.play().catch(() => {});
        } else if (m && m.file) {
          // No audio for this scene after all: fall back to the silent clock
          m.file = null; m.rec = null;
          if (this.playing) { this.stopClock(); this.startClock(this.local()); }
        }
      });
    }

    load(ep, scene = 0, offset = 0) {
      this.stopAll();
      this.episode = ep;
      this.models = ep.scenes.map((sc) => sceneModel(ep, sc));
      this.offsets = [];
      let acc = 0;
      for (const m of this.models) { this.offsets.push(acc); acc += m.duration; }
      this.total = acc;
      this.events.emit('episode', ep);
      this.setScene(scene, offset);
    }

    model() { return this.models ? this.models[this.scene] : null; }
    sceneObj() { return this.episode ? this.episode.scenes[this.scene] : null; }

    setScene(i, offset = 0) {
      const was = this.playing;
      this.stopAll();
      i = BB.clamp(i, 0, this.models.length - 1);
      this.scene = i;
      this.cue = -1; this.sentence = -1;
      this.clock = offset;
      this.events.emit('scene', i);
      const m = this.model();
      if (m.file) {
        this.useSource();
        this.prefetch(i).then(() => {
          // Once the whole file is in memory, seeking works even on servers without range requests
          if (this.scene !== i || this.playing || (this.audio.getAttribute('src') || '').startsWith('blob:')) return;
          const t = this.local() || offset;
          this.useSource(true);
          if (t) this.seek(t);
        });
        this.prefetch(i + 1);
        if (offset) this.seek(offset);
      }
      this.tickOnce();
      if (was) this.play();
    }

    prefetch(i) {
      const m = this.models[i];
      if (!m || !m.file || !window.fetch || location.protocol === 'file:') return Promise.resolve(null);
      if (!this.blobs.has(m.file)) {
        const entry = { url: null };
        entry.promise = fetch(m.file).then((r) => (r.ok ? r.blob() : null)).then((b) => (entry.url = b ? URL.createObjectURL(b) : null)).catch(() => null);
        this.blobs.set(m.file, entry);
        for (const [file, e] of this.blobs) {
          if (this.blobs.size <= 4) break;
          if (file === m.file || file === this.audioKey) continue;
          if (e.url) URL.revokeObjectURL(e.url);
          this.blobs.delete(file);
        }
      }
      return this.blobs.get(m.file).promise;
    }

    useSource(allowSwap) {
      const m = this.model();
      if (!m || !m.file) return;
      const blob = this.blobs.get(m.file);
      const src = (!this.noBlobs && blob && blob.url) || m.file;
      if (this.audioKey !== m.file || (allowSwap && this.audio.getAttribute('src') !== src)) {
        this.audio.src = src;
        this.audioKey = m.file;
        this.audio.playbackRate = this.rate;
      }
    }

    local() { const m = this.model(); return m && m.file ? this.audio.currentTime : this.clock; }
    // Seconds into the episode
    position() { return (this.offsets ? this.offsets[this.scene] : 0) + this.local(); }

    seek(local) {
      const m = this.model();
      if (!m) return;
      local = BB.clamp(local, 0, Math.max(0, m.duration - 0.05));
      if (m.file) { this.useSource(true); this.audio.currentTime = local; }
      else { this.clock = local; if (this.playing) { this.stopClock(); this.startClock(local); } }
      this.tickOnce();
    }
    seekEpisode(sec) {
      sec = BB.clamp(sec, 0, this.total - 0.05);
      let i = this.offsets.findIndex((o, k) => sec < o + this.models[k].duration);
      if (i < 0) i = this.models.length - 1;
      if (i !== this.scene) this.setScene(i, sec - this.offsets[i]);
      else this.seek(sec - this.offsets[i]);
    }

    play() {
      if (!this.episode) return;
      this.playing = true;
      this.events.emit('state');
      const m = this.model();
      if (m.file) {
        this.useSource(!this.audio.currentTime);
        this.audio.playbackRate = this.rate;
        const pr = this.audio.play();
        if (pr && pr.catch) pr.catch((err) => {
          if (err && err.name === 'NotAllowedError') { this.playing = false; this.events.emit('state'); BB.toast('Press play to start the episode.'); }
        });
      } else this.startClock(this.clock);
      this.tick();
    }
    startClock(from) {
      this.clockT0 = performance.now() - (from * 1000) / this.rate;
      this.clockTimer = setInterval(() => {
        this.clock = ((performance.now() - this.clockT0) / 1000) * this.rate;
        if (this.clock >= this.model().duration) this.next(true);
      }, 100);
    }
    stopClock() { clearInterval(this.clockTimer); this.clockTimer = null; }
    pause() {
      if (!this.playing) return;
      this.playing = false;
      const m = this.model();
      if (m && m.file) this.audio.pause(); else { this.clock = this.local(); this.stopClock(); }
      cancelAnimationFrame(this.raf);
      this.events.emit('state');
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    stopAll() {
      this.playing = false;
      this.stopClock();
      cancelAnimationFrame(this.raf);
      try { this.audio.pause(); } catch (e) { /* ignore */ }
    }
    next(auto) {
      if (this.scene >= this.models.length - 1) {
        this.stopAll();
        this.events.emit('progress', 1);
        this.events.emit('state');
        this.events.emit('end');
        return;
      }
      const was = this.playing || auto;
      this.stopAll();
      this.setScene(this.scene + 1, 0);
      if (was) setTimeout(() => this.play(), auto ? 350 : 0);
    }
    prev() {
      if (this.local() > 3 || this.scene === 0) { this.seek(0); return; }
      const was = this.playing;
      this.stopAll();
      this.setScene(this.scene - 1, 0);
      if (was) this.play();
    }
    setRate(r) {
      this.rate = r; BB.store.set('rate', r);
      this.audio.playbackRate = r;
      if (this.clockTimer) { const l = this.local(); this.stopClock(); this.startClock(l); }
      this.events.emit('state');
    }

    tickOnce() { this.locate(); }
    tick() {
      if (!this.playing) return;
      this.locate();
      this.raf = requestAnimationFrame(() => this.tick());
    }
    locate() {
      const m = this.model();
      if (!m) return;
      const t = this.local();
      let ci = m.cues.findIndex((c) => t >= c.start && t < c.end);
      if (ci < 0) { ci = m.cues.findIndex((c) => t < c.start) - 1; if (ci < -1) ci = m.cues.length - 1; }
      let si = -1;
      if (ci >= 0) {
        const ss = m.cues[ci].sentences;
        si = ss.findIndex((x) => t >= x[0] && t < x[1]);
        if (si < 0) { si = ss.findIndex((x) => t < x[0]) - 1; if (si < -1) si = ss.length - 1; }
      }
      if (ci !== this.cue) { this.cue = ci; this.sentence = -1; this.events.emit('cue', ci); }
      if (si !== this.sentence) { this.sentence = si; this.events.emit('sentence', ci, si); }
      this.events.emit('time', timeAt(m, t), t);
      this.events.emit('progress', BB.clamp(this.position() / this.total, 0, 1));
    }
  }

  /* Watch mode: episode list, player controls, cards, captions ------------------------------------ */
  const Watch = {
    player: null,
    episode: null,
    lit: new Set(),
    appeared: new Map(),
    sites: new Map(),
    routes: [],

    init() {
      if (!S) return;
      this.player = new Player();
      this.siteById = new Map(C.sites.map((s) => [s.id, s]));
      for (const ep of S.episodes) for (const s of ep.sites) { s.cat = BB.categoryOf(s.type || 'other'); this.siteById.set(s.id, s); }
      this.buildTransport();
      const p = this.player;
      p.events.on('scene', (i) => this.onScene(i));
      p.events.on('cue', (i) => this.onCue(i));
      p.events.on('sentence', (ci, si) => this.onSentence(ci, si));
      p.events.on('time', (y, local) => this.onTime(y, local));
      p.events.on('progress', (f) => this.onProgress(f));
      p.events.on('state', () => this.updateButtons());
      p.events.on('end', () => { this.saveProgress(true); BB.toast('End of the episode.'); });
      setInterval(() => { if (this.player.playing) this.saveProgress(); }, 4000);
    },

    /* Episode list (overlay) */
    open() {
      const ov = $('#ov-watch');
      const A = window.LD_SERIES_AUDIO || {};
      const fmt = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);
      const eps = S.episodes.map((ep) => {
        const prog = BB.store.get(`watch.${ep.id}`, null);
        const audio = A[ep.id] ? ep.scenes.filter((sc) => A[ep.id][sc.id]).length : 0;
        const minutes = A[ep.id] ? ep.scenes.reduce((a, sc) => a + (A[ep.id][sc.id] ? A[ep.id][sc.id].duration : 0), 0) / 60 : ep.minutes;
        const status = ep.status === 'final' ? '' : `<span class="wstatus">${ep.status === 'sample' ? 'Sample' : 'Draft'}</span>`;
        const done = prog && prog.done;
        const pct = prog && !done ? Math.round((prog.fraction || 0) * 100) : done ? 100 : 0;
        return `<article class="wep" data-ep="${ep.id}">
          <div class="wep-emblem" aria-hidden="true">${BB.emblem(ep.emblem)}</div>
          <div class="wep-body">
            <div class="label">Episode ${ep.number} · ${fmt(minutes)}${audio < ep.scenes.length ? ` · ${audio} of ${ep.scenes.length} scenes recorded` : ''} ${status}</div>
            <h3>${BB.esc(ep.title)}</h3>
            <p class="sub">${BB.esc(ep.subtitle)}</p>
            <p>${BB.esc(ep.summary)}</p>
            ${ep.statusNote ? `<p class="note">${BB.esc(ep.statusNote)}</p>` : ''}
            <div class="wep-meta label">${ep.regions.length >= 4 ? 'The whole world' : ep.regions.map((r) => BB.REGIONS[r]).join(' · ')} · ${ep.scenes.length} scenes · ${BB.num(ep.words)} words</div>
            ${pct ? `<div class="wprog" aria-label="${pct} percent watched"><i style="width:${pct}%"></i></div>` : ''}
            <div class="wep-actions">
              ${prog && !done ? `<button class="btn primary" data-resume="${ep.id}">${BB.icons.play}Resume at scene ${prog.scene + 1}</button><button class="btn" data-play="${ep.id}">From the start</button>` : `<button class="btn primary" data-play="${ep.id}">${BB.icons.play}${done ? 'Watch again' : 'Watch'}</button>`}
              <details class="wscenes"><summary class="btn">Scenes</summary><ol>${ep.scenes.map((sc, i) => `<li><button data-scene="${ep.id}:${i}">${BB.esc(sc.title)}</button><span class="mono">${this.sceneLength(ep, sc)}</span></li>`).join('')}</ol></details>
            </div>
          </div></article>`;
      }).join('');
      const voices = (S.speakers || []).map((sp) => `<div class="wvoice" style="--c:${sp.color}"><i></i><div><b>${BB.esc(sp.label)}</b><small>${BB.esc(sp.role || '')} Voice <span class="mono">${sp.voice}</span>.</small></div></div>`).join('');
      const aud = S.audition && A._voices ? `<div class="waudition"><span class="label">Voice audition: the same two sentences in each candidate voice</span><div class="chips">${S.audition.voices.filter((v) => A._voices[v]).map((v) => `<button class="chip" data-voice="${v}"><i style="background:${v[0] === 'b' ? 'var(--yellow-ochre)' : 'var(--kaolin-2)'}"></i>${v}</button>`).join('')}</div><p class="note">a = American, b = British; f = female, m = male. Choose one voice per role.</p></div>` : '';
      ov.innerHTML = `
        <div class="overlay-bar"><h2>Watch</h2><span class="label">${BB.esc(S.tagline)}</span><button class="btn close" aria-label="Close">${BB.icons.close}</button></div>
        <div class="overlay-body"><div class="watch-list">
          ${this.episode && this.player.episode ? `<div class="wresume"><span>Now playing: Episode ${this.episode.number}, ${BB.esc(this.episode.title)}, scene ${this.player.scene + 1}: ${BB.esc(this.player.sceneObj().title)}</span><button class="btn primary" id="wresume">${BB.icons.play}Back to the episode</button></div>` : ''}
          <p class="wintro">Eight episodes of about 45 minutes each tell the whole Stone Age, continent by continent, with several voices: a narrator, a voice for what researchers argue, and a voice for the historical sources. Pause at any moment and use Explore to look around the map at that time and place. Where researchers disagree, every view is put as its supporters put it.</p>
          <div class="weps">${eps}</div>
          <div class="wvoices"><span class="label">Voices</span>${voices}</div>
          ${aud}
        </div></div>`;
      ov.querySelector('.close').addEventListener('click', () => BB.closeOverlay());
      ov.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => this.play(b.dataset.play, 0, 0)));
      ov.querySelectorAll('[data-resume]').forEach((b) => b.addEventListener('click', () => { const pr = BB.store.get(`watch.${b.dataset.resume}`, {}); this.play(b.dataset.resume, pr.scene || 0, pr.offset || 0); }));
      ov.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => { const [id, i] = b.dataset.scene.split(':'); this.play(id, +i, 0); }));
      const r = ov.querySelector('#wresume');
      if (r) r.addEventListener('click', () => { BB.closeOverlay(); BB.setMode('watch'); this.player.play(); });
      ov.querySelectorAll('[data-voice]').forEach((b) => b.addEventListener('click', () => this.audition(b.dataset.voice, b)));
      if (this.player.playing) this.player.pause();
    },
    sceneLength(ep, sc) {
      const A = window.LD_SERIES_AUDIO || {};
      const d = A[ep.id] && A[ep.id][sc.id] ? A[ep.id][sc.id].duration : sc.cues.reduce((a, c) => a + c.sentences.reduce((x, s) => x + readTime(s) + 0.4, 0), 0);
      return `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}`;
    },
    audition(voice, btn) {
      const A = window.LD_SERIES_AUDIO || {};
      if (!this.auditionAudio) this.auditionAudio = new Audio();
      const a = this.auditionAudio;
      document.querySelectorAll('[data-voice]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (this.auditionVoice === voice && !a.paused) { a.pause(); this.auditionVoice = null; return; }
      this.auditionVoice = voice;
      btn.setAttribute('aria-pressed', 'true');
      a.src = A._voices[voice].file;
      a.play().catch(() => {});
      a.onended = () => btn.setAttribute('aria-pressed', 'false');
    },

    /* Playback */
    play(epId, scene = 0, offset = 0) {
      const ep = S.episodes.find((e) => e.id === epId);
      if (!ep) return;
      BB.closeOverlay();
      BB.dismissIntro();
      this.episode = ep;
      this.routes = (ep.routes || []).map((r) => ({ route: r, coords: BB.densifyRoute(r.path), debated: r.certainty === 'debated', label: r.label, progress: 0 }));
      BB.setMode('watch');
      this.player.load(ep, scene, offset);
      try { history.replaceState(null, '', `#watch/${ep.id}`); } catch (e) { /* ignore */ }
      this.player.play();
    },
    pause() { if (this.player) this.player.pause(); },
    toggle() { if (this.player && this.player.episode) this.player.toggle(); else this.open(); },
    saveProgress(done) {
      const p = this.player;
      if (!p.episode) return;
      BB.store.set(`watch.${p.episode.id}`, done ? { done: true } : { scene: p.scene, offset: Math.max(0, p.local() - 2), fraction: p.position() / p.total });
    },

    onScene(i) {
      const ep = this.player.episode, sc = ep.scenes[i];
      this.lit = new Set();
      this.lastCue = -1;
      this.routeCue = null;
      this.appeared = new Map();
      this.sceneSites = new Set(sc.cues.flatMap((c) => c.sites || []).concat(sc.camera && sc.camera.sites ? sc.camera.sites : []));
      this.showCard(null);
      this.clearStage();
      $('#badge-region').textContent = `Episode ${ep.number} · ${sc.title}`;
      $('#wt-scene').innerHTML = `<b>${BB.esc(sc.title)}</b> <span>· scene ${i + 1} of ${ep.scenes.length}</span>`;
      $('#watch-caption').innerHTML = '';
      $('#watch-caption').classList.remove('on');
      this.flyTo(sc.camera);
      this.buildScrubber();
      this.refreshSites(this.player.model().keys[0][1]);
    },
    onCue(i) {
      if (i < 0) return;
      const sc = this.player.sceneObj();
      const cue = sc.cues[i];
      // After a seek, catch up on what earlier cues of the scene switched on
      if (i !== this.lastCue + 1) {
        for (let k = 0; k < i; k++) (sc.cues[k].sites || []).forEach((id) => this.lit.add(id));
        if (cue.card === undefined) {
          let last = null;
          for (let k = i - 1; k >= 0; k--) if (sc.cues[k].card !== undefined) { last = sc.cues[k].card; break; }
          this.showCard(last);
        }
        if (!cue.camera) { let cam = null; for (let k = i - 1; k >= 0; k--) if (sc.cues[k].camera) { cam = sc.cues[k].camera; break; } if (cam) this.flyTo(cam); }
      }
      this.lastCue = i;
      (cue.sites || []).forEach((id) => this.lit.add(id));
      if (cue.camera) this.flyTo(cue.camera);
      if (cue.card !== undefined) this.showCard(cue.card);
      if (cue.route) this.routeCue = { id: cue.route, start: this.player.model().cues[i].start, end: this.player.model().cues[i].end };
    },
    onSentence(ci, si) {
      const cap = $('#watch-caption');
      if (ci >= 0 && si >= 0) this.syncShots(ci, si);
      if (ci < 0 || si < 0) { cap.classList.remove('on'); return; }
      const cue = this.player.sceneObj().cues[ci];
      const sp = speakers.get(cue.speaker) || { label: cue.speaker, color: '#eee5d4' };
      cap.innerHTML = `<span class="who" style="--c:${sp.color}">${BB.esc(sp.label)}</span><span class="txt">${BB.esc(cue.sentences[si])}</span>`;
      cap.classList.add('on');
    },
    onTime(years, local) {
      if (this.shot && this.shot.update) this.shot.update(local);
      BB.setTime(years);
      this.refreshSites(years);
      if (this.routeCue) {
        const r = this.routes.find((x) => x.route.id === this.routeCue.id);
        if (r) { r.progress = BB.clamp((local - this.routeCue.start) / Math.max(0.5, this.routeCue.end - this.routeCue.start), 0, 1); BB.globe.setRoutes(this.routes.filter((x) => x.progress > 0)); }
      }
      this.updateClock();
    },
    onProgress(f) {
      const bar = $('#wt-scrub');
      if (bar) bar.style.setProperty('--p', `${(f * 100).toFixed(2)}%`);
    },

    refreshSites(t) {
      const now = performance.now();
      const entries = [];
      for (const [id, s] of this.siteById) {
        if (this.sceneSites.has(id)) {
          const on = this.lit.has(id);
          if (on && !this.appeared.has(id)) this.appeared.set(id, now);
          entries.push({ site: s, color: s.cat.color, emphasis: on ? 1 : 0, alpha: on ? 1 : 0.45, appearedAt: this.appeared.get(id) });
        } else if (s.end <= t * 1.6 && s.start >= t / 1.6) {
          entries.push({ site: s, color: s.cat.color, emphasis: 0, alpha: 0.22 });
        }
      }
      BB.globe.setSites(entries);
    },

    flyTo(cam) {
      if (!cam) return;
      const g = BB.globe;
      let target;
      if (cam.sites) {
        const pts = cam.sites.map((id) => this.siteById.get(id)).filter(Boolean);
        if (!pts.length) return;
        if (pts.length === 1) target = { lon: pts[0].lon, lat: pts[0].lat, zoom: cam.zoom || 4 };
        else {
          const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
          target = g.fitBox([Math.min(...lons) - 3, Math.min(...lats) - 3, Math.max(...lons) + 3, Math.max(...lats) + 3]);
          if (cam.zoom) target.zoom = cam.zoom;
        }
      } else if (cam.box) target = g.fitBox(cam.box);
      else target = { lon: cam.lon, lat: cam.lat, zoom: cam.zoom };
      g.flyTo(target);
    },

    /* Stage: full-screen shots (pictures, montages, diagrams, graphics) timed to sentences ------------------- */
    shotList(sc) {
      // [{shot, cue, at, start}] in play order, with start times from the audio model
      const m = this.player.model();
      const out = [];
      sc.cues.forEach((cue, c) => (cue.shots || []).forEach((shot) => {
        const at = BB.clamp(shot.at || 0, 0, cue.sentences.length - 1);
        const sent = m.cues[c].sentences[at];
        out.push({ shot, cue: c, at, start: sent ? sent[0] : m.cues[c].start });
      }));
      out.sort((a, b) => a.start - b.start);
      return out;
    },
    syncShots(ci, si) {
      const sc = this.player.sceneObj();
      const list = this.shotList(sc);
      if (!list.length) return;
      let active = null, idx = -1;
      list.forEach((e, i) => { if (e.cue < ci || (e.cue === ci && e.at <= si)) { active = e; idx = i; } });
      if (active === this.activeEntry) return;
      if (!active) { this.clearStage(); return; }
      const end = idx + 1 < list.length ? list[idx + 1].start : this.player.model().duration;
      this.activeEntry = active;
      this.showShot(active.shot, active.start, end);
    },
    clearStage() {
      const stage = $('#watch-stage');
      this.activeEntry = null;
      this.shot = null;
      stage.classList.remove('on');
      stage.querySelectorAll('.shot').forEach((el) => { el.classList.add('out'); setTimeout(() => el.remove(), 1000); });
      this.lowerThird(null);
    },
    mediaFor(id) {
      const ep = this.player.episode;
      const m = window.LD_MEDIA && window.LD_MEDIA[ep.id];
      return (m && m[id]) || null;
    },
    creditFor(m) {
      if (!m) return '';
      const who = (m.author || '').replace(/^User:/, '').slice(0, 60);
      return `${who ? who + ' · ' : ''}${m.licence} · Wikimedia Commons`;
    },
    showShot(shot, start, end) {
      const stage = $('#watch-stage');
      const old = stage.querySelectorAll('.shot');
      old.forEach((el) => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 1000); });
      this.shot = null;
      this.lowerThird(shot.lower || null);
      if (shot.type === 'globe') {
        stage.classList.remove('on');
        if (shot.camera) this.flyTo(shot.camera);
        if (shot.time != null) BB.animateTime(shot.time, 1500);
        return;
      }
      const dur = Math.max(1, end - start);
      const el = BB.el('div', { class: `shot ${shot.type}` });
      const S = { el, start, end, update: null };
      const prog = (local) => BB.clamp((local - start) / dur, 0, 1);
      if (shot.type === 'photo') {
        const m = this.mediaFor(shot.media);
        if (m) {
          const img = BB.el('img', { src: m.src, alt: m.description || '' });
          el.append(img, BB.el('div', { class: 'credit' }, shot.caption ? BB.el('b', {}, shot.caption) : null, this.creditFor(m)));
          if (shot.fit === 'contain') el.classList.add('contain');
          const move = shot.move || 'push';
          const K = { push: [1, 1.14, 0, 0, 0, 0], pull: [1.14, 1, 0, 0, 0, 0], 'pan-left': [1.12, 1.12, 3, -3, 0, 0], 'pan-right': [1.12, 1.12, -3, 3, 0, 0], 'tilt-up': [1.12, 1.12, 0, 0, 3, -3], 'tilt-down': [1.12, 1.12, 0, 0, -3, 3], still: [1.04, 1.04, 0, 0, 0, 0] }[move] || [1, 1.14, 0, 0, 0, 0];
          S.update = (local) => { const u = prog(local); const e = u * u * (3 - 2 * u); img.style.transform = `translate(${BB.lerp(K[2], K[3], e)}%, ${BB.lerp(K[4], K[5], e)}%) scale(${BB.lerp(K[0], K[1], e)})`; };
        } else el.append(BB.el('div', { class: 'inner' }, BB.el('div', { class: 'kicker' }, 'picture missing'), BB.el('p', {}, shot.media || '')));
      } else if (shot.type === 'montage') {
        const items = (shot.media || []).map((id) => this.mediaFor(id)).filter(Boolean);
        const imgs = items.map((m) => BB.el('img', { src: m.src, alt: m.description || '' }));
        const credit = BB.el('div', { class: 'credit' });
        el.append(...imgs, credit);
        let cur = -1;
        S.update = (local) => {
          const u = prog(local);
          const i = Math.min(imgs.length - 1, Math.floor(u * imgs.length));
          imgs.forEach((im, k) => im.classList.toggle('on', k === i));
          const f = (u * imgs.length) % 1;
          if (imgs[i]) imgs[i].style.transform = `scale(${1.02 + 0.1 * f})`;
          if (i !== cur) { cur = i; credit.innerHTML = ''; const cap = (shot.captions || [])[i]; if (cap) credit.append(BB.el('b', {}, cap)); credit.append(this.creditFor(items[i])); }
        };
      } else if (shot.type === 'diagram') {
        const canvas = BB.el('canvas');
        el.append(canvas);
        const fn = BB.diagrams && BB.diagrams[shot.diagram];
        const draw = (t) => {
          const r = canvas.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
          const ctx = canvas.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (fn) fn(ctx, r.width, r.height, t, shot.params || {});
        };
        S.update = (local) => draw(Math.max(0, local - start));
        setTimeout(() => S.update(this.player.local()), 30);
      } else if (shot.type === 'type') {
        el.append(BB.el('div', { class: 'inner' }, shot.kicker ? BB.el('div', { class: 'kicker' }, shot.kicker) : null, BB.el('p', {}, shot.text || ''), shot.attribution ? BB.el('div', { class: 'attr' }, shot.attribution) : null));
      } else if (shot.type === 'title') {
        el.append(BB.el('div', { class: 'inner' }, shot.kicker ? BB.el('div', { class: 'kicker' }, shot.kicker) : null, BB.el('h1', {}, shot.title || ''), shot.sub ? BB.el('div', { class: 'sub' }, shot.sub) : null));
      } else if (shot.type === 'number') {
        const big = BB.el('div', { class: 'big' }, shot.value);
        el.append(BB.el('div', { class: 'inner' }, shot.kicker ? BB.el('div', { class: 'kicker' }, shot.kicker) : null, big, BB.el('div', { class: 'lbl' }, shot.label || '')));
        const mnum = String(shot.value).match(/^([\d.,]+)(.*)$/);
        if (mnum) {
          const target = parseFloat(mnum[1].replace(/,/g, '')), dec = (mnum[1].split('.')[1] || '').length;
          S.update = (local) => { const u = Math.min(1, (local - start) / Math.min(3, dur * 0.6)); const v = target * (1 - Math.pow(1 - u, 3)); big.textContent = (dec ? v.toFixed(dec) : BB.num(Math.round(v))) + mnum[2]; };
        }
      } else if (shot.type === 'split') {
        const cols = (shot.views || []).map((v, i) => {
          const m = v.media ? this.mediaFor(v.media) : null;
          return BB.el('div', { class: 'col', style: `--vc:${['var(--yellow-ochre)', 'var(--cat-monument)', 'var(--cat-burial)', 'var(--lichen)'][i % 4]}` }, m ? BB.el('img', { src: m.src, alt: '' }) : null, BB.el('b', {}, v.label), BB.el('p', {}, v.text));
        });
        const status = shot.status ? BB.el('div', { class: 'status' }, shot.status) : null;
        el.append(BB.el('div', { class: 'inner' }, BB.el('h2', {}, shot.question || ''), BB.el('div', { class: 'cols' }, ...cols), status));
        const n = cols.length;
        S.update = (local) => { const t = local - start; cols.forEach((c, i) => c.classList.toggle('on', t > 0.6 + i * (shot.stagger || 2.5))); if (status) status.classList.toggle('on', t > 0.6 + n * (shot.stagger || 2.5)); };
      } else if (shot.type === 'credits') {
        const ep = this.player.episode;
        const used = new Map();
        for (const sc of ep.scenes) for (const cue of sc.cues) for (const sh of cue.shots || []) {
          const ids = sh.type === 'photo' ? [sh.media] : sh.type === 'montage' ? sh.media : sh.type === 'split' ? (sh.views || []).map((v) => v.media) : [];
          for (const id of ids || []) { const m = id && this.mediaFor(id); if (m) used.set(id, m); }
        }
        const rows = [...used.values()].map((m) => BB.el('div', {}, BB.el('b', {}, (m.description || m.file).slice(0, 70)), ` ${(m.author || '').replace(/^User:/, '')}, ${m.licence}, Wikimedia Commons`));
        el.append(BB.el('div', { class: 'inner' }, BB.el('div', { class: 'kicker', style: 'column-span:all' }, shot.kicker || 'Pictures'), ...rows));
      }
      stage.append(el);
      stage.classList.add('on');
      requestAnimationFrame(() => el.classList.add('in'));
      if (S.update) S.update(this.player.local());
      this.shot = S;
    },
    lowerThird(lt) {
      let el = $('#lower-third');
      if (!el) { el = BB.el('div', { class: 'lower-third', id: 'lower-third' }); $('#app').append(el); }
      if (!lt) { el.classList.remove('on'); return; }
      el.innerHTML = `<b>${BB.esc(lt.name || '')}</b>${lt.sub ? `<span>${BB.esc(lt.sub)}</span>` : ''}`;
      el.classList.add('on');
    },

    /* Cards */
    showCard(card) {
      const box = $('#watch-cards');
      const old = box.firstElementChild;
      if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 500); }
      if (!card) return;
      const el = BB.el('div', { class: `wcard wcard-${card.type}` });
      el.innerHTML = this.cardHTML(card);
      box.append(el);
      requestAnimationFrame(() => el.classList.add('in'));
      const btn = el.querySelector('[data-site]');
      if (btn) btn.addEventListener('click', () => { this.player.pause(); BB.showSite(btn.dataset.site); });
    },
    cardHTML(c) {
      const k = c.kicker ? `<div class="label">${BB.esc(c.kicker)}</div>` : '';
      const items = c.items ? `<ul>${c.items.map((x) => `<li>${BB.esc(x)}</li>`).join('')}</ul>` : '';
      const note = c.note ? `<div class="note">${BB.esc(c.note)}</div>` : '';
      switch (c.type) {
        case 'title': return `${k}<h2>${BB.esc(c.title)}</h2>${c.sub ? `<p class="sub">${BB.esc(c.sub)}</p>` : ''}`;
        case 'number': return `${k}<div class="big">${BB.esc(c.value)}</div><p>${BB.esc(c.label)}</p>${note}`;
        case 'quote': return `<blockquote>${BB.esc(c.text)}</blockquote><div class="attr">${BB.esc(c.attribution)}</div>`;
        case 'site': {
          const s = this.siteById.get(c.site);
          if (!s) return '';
          return `<div class="label cat" style="--c:${s.cat.color}"><i></i>${BB.esc(s.cat.label)}</div><h3>${BB.esc(s.name)}</h3><div class="where">${BB.esc(s.country)}</div><div class="when">${BB.esc(s.dateLabel || BB.formatAge(s.start))}</div><p>${BB.esc(s.summary)}</p><button class="btn small" data-site="${s.id}">Explore here</button>`;
        }
        case 'species': {
          const sp = (C.species || []).find((x) => x.id === c.species);
          if (!sp) return '';
          return `<div class="label">Hominin</div><h3><i>${BB.esc(sp.name)}</i></h3>${sp.nickname ? `<div class="where">${BB.esc(sp.nickname)}</div>` : ''}<div class="when">${BB.esc(BB.formatAge(sp.start))} to ${BB.esc(BB.formatAge(sp.end))}</div><p>${BB.esc(sp.summary || '')}</p>`;
        }
        case 'debate': return `<div class="label">Where researchers disagree</div><h3>${BB.esc(c.question)}</h3><div class="views">${c.views.map((v, i) => `<div class="view" style="--vc:${['var(--yellow-ochre)', 'var(--cat-monument)', 'var(--cat-burial)', 'var(--lichen)'][i % 4]}"><b>${BB.esc(v.label)}</b><p>${BB.esc(v.text)}</p></div>`).join('')}</div>${c.status ? `<div class="status"><b>Where it stands</b>${BB.esc(c.status)}</div>` : ''}`;
        case 'place': case 'text': default: return `${k}<h3>${BB.esc(c.title || '')}</h3>${c.sub ? `<p class="sub">${BB.esc(c.sub)}</p>` : ''}${items}${note}`;
      }
    },

    /* Transport in the dock */
    buildTransport() {
      const t = $('#watch-transport');
      t.innerHTML = `
        <button class="tbtn" id="wt-list" aria-label="Episodes" title="Episodes">${BB.icons.book}</button>
        <button class="tbtn" id="wt-prev" aria-label="Previous scene">${BB.icons.prev}</button>
        <button class="tbtn play" id="wt-play" aria-label="Play">${BB.icons.play}</button>
        <button class="tbtn" id="wt-next" aria-label="Next scene">${BB.icons.next}</button>
        <div class="now-playing">
          <div class="t" id="wt-scene"></div>
          <div class="wscrub" id="wt-scrub" role="slider" aria-label="Position in the episode" tabindex="0"><div class="segs" id="wt-segs"></div><i class="head"></i></div>
        </div>
        <div class="right">
          <span class="mono clock" id="wt-clock">0:00 / 0:00</span>
          <label class="sr-only" for="wt-speed">Speed</label>
          <select class="speed" id="wt-speed"><option value="0.85">0.85×</option><option value="1">1×</option><option value="1.15">1.15×</option><option value="1.3">1.3×</option></select>
          <button class="chip-btn" id="wt-explore" title="Pause and explore the map at this time and place">Explore here</button>
        </div>`;
      $('#wt-list').addEventListener('click', () => BB.openOverlay('watch'));
      $('#wt-prev').addEventListener('click', () => this.player.prev());
      $('#wt-next').addEventListener('click', () => this.player.next(false));
      $('#wt-play').addEventListener('click', () => this.player.toggle());
      const sp = $('#wt-speed');
      sp.value = String(this.player.rate);
      sp.addEventListener('change', () => this.player.setRate(+sp.value));
      $('#wt-explore').addEventListener('click', () => this.exploreHere());
      const scrub = $('#wt-scrub');
      const seekAt = (e) => { const r = scrub.getBoundingClientRect(); this.player.seekEpisode(((e.clientX - r.left) / r.width) * this.player.total); };
      scrub.addEventListener('pointerdown', (e) => { seekAt(e); scrub.setPointerCapture(e.pointerId); this.scrubbing = true; });
      scrub.addEventListener('pointermove', (e) => { if (this.scrubbing) seekAt(e); });
      scrub.addEventListener('pointerup', () => { this.scrubbing = false; });
      scrub.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this.player.seekEpisode(this.player.position() - 10); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.player.seekEpisode(this.player.position() + 10); }
      });
      scrub.addEventListener('mousemove', (e) => {
        const r = scrub.getBoundingClientRect();
        const sec = ((e.clientX - r.left) / r.width) * this.player.total;
        const i = this.player.offsets ? this.player.offsets.findIndex((o, k) => sec < o + this.player.models[k].duration) : -1;
        scrub.title = i >= 0 ? `${i + 1}. ${this.player.episode.scenes[i].title}` : '';
      });
    },
    buildScrubber() {
      const p = this.player;
      $('#wt-segs').innerHTML = p.models.map((m, i) => `<span class="${i === p.scene ? 'cur' : i < p.scene ? 'done' : ''}" style="flex:${m.duration}"></span>`).join('');
      this.updateClock();
    },
    updateClock() {
      const p = this.player;
      const f = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      const el = $('#wt-clock');
      if (el && p.total) el.textContent = `${f(p.position())} / ${f(p.total)}`;
    },
    updateButtons() {
      const b = $('#wt-play');
      if (!b) return;
      b.innerHTML = this.player.playing ? BB.icons.pause : BB.icons.play;
      b.setAttribute('aria-label', this.player.playing ? 'Pause' : 'Play');
    },
    exploreHere() {
      this.player.pause();
      BB.setMode('explore');
      BB.toast('Exploring at this moment. Open Watch to return to the episode.');
    },
    key(e) {
      if (e.key === ' ') { e.preventDefault(); this.player.toggle(); return true; }
      if (e.key === 'ArrowRight') { this.player.next(false); return true; }
      if (e.key === 'ArrowLeft') { this.player.prev(); return true; }
      return false;
    },
  };
  BB.Watch = Watch;
})();
