/* The globe: two stacked canvases. The base layer (sea, exposed shelves, land, ice, rivers) is redrawn only when the
   camera or the time changes; the overlay (sites, routes, labels) is redrawn every frame while something moves. */
(function () {
  const BB = window.BB;
  const RAD = Math.PI / 180;

  const COLORS = {
    sea: '#091216',
    seaLit: '#13242b',
    shelf: '#2b3430',
    land: '#5c5143',
    landLit: '#6a5e4d',
    coast: 'rgba(238, 226, 206, 0.28)',
    ice: 'rgba(222, 234, 240, 0.92)',
    lgmIce: '222, 234, 240',
    lake: '#10202a',
    river: 'rgba(120, 170, 190, 0.38)',
    border: 'rgba(238, 226, 206, 0.16)',
    graticule: 'rgba(238, 226, 206, 0.05)',
    halo: 'rgba(212, 140, 90, 0.10)',
  };

  class Globe {
    constructor(base, overlay) {
      this.base = base;
      this.overlay = overlay;
      this.bctx = base.getContext('2d');
      this.octx = overlay.getContext('2d');
      this.events = BB.emitter();
      this.mode = BB.store.get('projection', 'globe');
      this.cam = { lon: 20, lat: 12, zoom: 1 };
      this.stage = { x: 0, y: 0, w: 800, h: 600 };
      this.time = 3300000;
      this.sites = [];          // {site, alpha, emphasis, appearedAt}
      this.routes = [];         // {route, progress}
      this.selected = null;
      this.hovered = null;
      this.showBorders = BB.store.get('borders', false);
      this.labelAll = false;
      this.anim = null;
      this.dirtyBase = true;
      this.dirtyOverlay = true;
      this.autoSpin = false;
      this.prepareGeo();
      this.noise = this.makeNoise();
      this.bindInput();
      this.resize();
      const loop = (ts) => { this.frame(ts); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    prepareGeo() {
      const t = window.LD_GEO;
      const f = (k) => topojson.feature(t, t.objects[k]);
      this.geo = {
        sphere: { type: 'Sphere' },
        land: f('land'),
        deep: f('deep'),
        glaciers: f('glaciers'),
        ice: f('ice'),
        lakes: f('lakes'),
        rivers: f('rivers'),
        borders: topojson.feature(t, t.objects.borders),
        graticule: d3.geoGraticule10(),
      };
    }

    makeNoise() {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const x = c.getContext('2d');
      const img = x.createImageData(192, 192);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random();
        const g = v > 0.5 ? 255 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
        img.data[i + 3] = Math.floor(Math.pow(Math.random(), 3) * 70);
      }
      x.putImageData(img, 0, 0);
      return this.bctx.createPattern(c, 'repeat');
    }

    /* Layout ------------------------------------------------------------------------------------ */
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
      this.dpr = dpr;
      this.W = w; this.H = h;
      for (const c of [this.base, this.overlay]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      this.dirtyBase = this.dirtyOverlay = true;
    }
    setStage(rect) {
      this.stage = rect;
      this.dirtyBase = this.dirtyOverlay = true;
    }
    setMode(mode) {
      this.mode = mode;
      BB.store.set('projection', mode);
      this.cam.zoom = BB.clamp(this.cam.zoom, 1, 14);
      this.dirtyBase = this.dirtyOverlay = true;
    }
    baseRadius() { return Math.min(this.stage.w, this.stage.h) * 0.44; }

    projection(cam = this.cam) {
      const cx = this.stage.x + this.stage.w / 2, cy = this.stage.y + this.stage.h / 2;
      if (this.mode === 'globe') {
        return d3.geoOrthographic().clipAngle(90).precision(0.6)
          .rotate([-cam.lon, -cam.lat]).scale(this.baseRadius() * cam.zoom).translate([cx, cy]);
      }
      const p = d3.geoEqualEarth().precision(0.6).rotate([-cam.lon, 0]);
      p.fitSize([this.stage.w * 0.96, this.stage.h * 0.96], this.geo.sphere);
      const s0 = p.scale();
      p.scale(s0 * cam.zoom).center([0, cam.lat]).translate([cx, cy]);
      return p;
    }

    // Camera that frames a [west, south, east, north] box inside the stage.
    fitBox(box) {
      let [w, s, e, n] = box;
      if (e < w) e += 360;
      const lon = ((w + e) / 2 + 540) % 360 - 180, lat = (s + n) / 2;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const x = w + (e - w) * (i / 12), y = s + (n - s) * (i / 12);
        pts.push([x, s], [x, n], [w, y], [e, y]);
      }
      const mp = { type: 'MultiPoint', coordinates: pts.map(([x, y]) => [((x + 540) % 360) - 180, y]) };
      const pad = Math.min(this.stage.w, this.stage.h) * 0.08;
      const cam = { lon, lat, zoom: 1 };
      const p = this.projection(cam);
      const b = d3.geoPath(p).bounds(mp);
      const bw = Math.max(1, b[1][0] - b[0][0]), bh = Math.max(1, b[1][1] - b[0][1]);
      const k = Math.min((this.stage.w - 2 * pad) / bw, (this.stage.h - 2 * pad) / bh);
      cam.zoom = BB.clamp(k, 1, 14);
      if (this.mode === 'globe' && Math.max(e - w, n - s) > 150) cam.zoom = 1;
      return cam;
    }

    flyTo(target, duration) {
      const start = { ...this.cam };
      const dist = d3.geoDistance([start.lon, start.lat], [target.lon, target.lat]);
      const interp = d3.geoInterpolate([start.lon, start.lat], [target.lon, target.lat]);
      const dur = BB.reducedMotion() ? 0 : duration ?? 1300 + 1500 * Math.min(1, dist / 2);
      const dip = BB.clamp(dist / 1.3, 0, 1);
      this.autoSpin = false;
      if (!dur) { this.cam = { ...target }; this.dirtyBase = this.dirtyOverlay = true; return Promise.resolve(); }
      return new Promise((resolve) => {
        this.anim = {
          t0: performance.now(), dur,
          step: (u) => {
            const e = BB.easeInOut(u);
            const [lon, lat] = interp(e);
            let z = Math.exp(BB.lerp(Math.log(start.zoom), Math.log(target.zoom), e));
            z = Math.min(z, BB.lerp(z, 1, dip * Math.sin(Math.PI * e)));
            this.cam = { lon, lat, zoom: Math.max(z, 0.9) };
          },
          done: () => { this.cam = { ...target }; resolve(); },
        };
      });
    }

    setTime(t) {
      if (t === this.time) return;
      const oldSea = BB.seaLevel(this.time), sea = BB.seaLevel(t);
      this.time = t;
      if (Math.abs(oldSea - sea) > 0.4) this.dirtyBase = true;
      this.dirtyOverlay = true;
    }

    setSites(entries) { this.sites = entries; this.dirtyOverlay = true; }
    setRoutes(entries) { this.routes = entries; this.dirtyOverlay = true; }
    select(site) { this.selected = site; this.dirtyOverlay = true; }

    /* Input ------------------------------------------------------------------------------------- */
    bindInput() {
      const el = this.overlay;
      const pointers = new Map();
      let drag = null, pinch = null, moved = false;
      const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, pos(e));
        this.anim = null; this.autoSpin = false;
        moved = false;
        if (pointers.size === 1) drag = { p: pos(e), cam: { ...this.cam } };
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: this.cam.zoom };
          drag = null;
        }
      });
      el.addEventListener('pointermove', (e) => {
        const p = pos(e);
        if (!pointers.has(e.pointerId)) { this.hover(p); return; }
        pointers.set(e.pointerId, p);
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          this.cam.zoom = BB.clamp(pinch.zoom * d / pinch.d, 1, 14);
          this.dirtyBase = this.dirtyOverlay = true; moved = true;
          this.events.emit('interact');
          return;
        }
        if (drag) {
          const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
          if (Math.hypot(dx, dy) > 3) { moved = true; el.classList.add('dragging'); }
          if (!moved) return;
          const scale = this.mode === 'globe' ? this.baseRadius() * this.cam.zoom : this.projection().scale();
          const k = 1 / scale / RAD;
          this.cam.lon = drag.cam.lon - dx * k;
          this.cam.lat = BB.clamp(drag.cam.lat + dy * k, -75, 80);
          this.dirtyBase = this.dirtyOverlay = true;
          this.events.emit('interact');
        }
      });
      const end = (e) => {
        pointers.delete(e.pointerId);
        el.classList.remove('dragging');
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 0) {
          if (!moved) {
            const hit = this.hitTest(pos(e));
            this.events.emit('click', hit ? hit.site : null, pos(e));
          }
          drag = null;
        }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', () => { if (this.hovered) { this.hovered = null; this.dirtyOverlay = true; el.classList.remove('hovering'); } });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.anim = null; this.autoSpin = false;
        const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015));
        this.cam.zoom = BB.clamp(this.cam.zoom * f, 1, 14);
        this.dirtyBase = this.dirtyOverlay = true;
        this.events.emit('interact');
      }, { passive: false });
    }

    hover(p) {
      const hit = this.hitTest(p);
      const s = hit ? hit.site : null;
      if (s !== this.hovered) {
        this.hovered = s;
        this.overlay.classList.toggle('hovering', !!s);
        this.dirtyOverlay = true;
      }
    }

    hitTest(p) {
      let best = null, bd = 14;
      for (const e of this.sites) {
        if (!e.xy || e.alpha < 0.2) continue;
        const d = Math.hypot(e.xy[0] - p[0], e.xy[1] - p[1]);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /* Rendering --------------------------------------------------------------------------------- */
    frame(ts) {
      if (this.anim) {
        const u = BB.clamp((ts - this.anim.t0) / this.anim.dur, 0, 1);
        this.anim.step(u);
        this.dirtyBase = this.dirtyOverlay = true;
        if (u >= 1) { const a = this.anim; this.anim = null; a.done(); }
      } else if (this.autoSpin && !BB.reducedMotion()) {
        this.cam.lon += 0.035;
        this.dirtyBase = this.dirtyOverlay = true;
      }
      const animated = this.sites.some((e) => e.emphasis > 0) || this.routes.length > 0 || this.selected;
      if (this.dirtyBase) { this.drawBase(); this.dirtyBase = false; this.dirtyOverlay = true; }
      if (this.dirtyOverlay || animated) { this.drawOverlay(ts); this.dirtyOverlay = false; }
    }

    drawBase() {
      const ctx = this.bctx, dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      const p = this.projection();
      this.proj = p;
      const path = d3.geoPath(p, ctx);
      const globe = this.mode === 'globe';
      const [cx, cy] = p.translate();
      const R = p.scale();
      const sea = BB.seaLevel(this.time);
      const shelf = BB.shelfFactor(sea), ice = BB.iceFactor(sea);

      // Halo
      if (globe) {
        const g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
        g.addColorStop(0, 'rgba(214, 150, 100, 0.16)');
        g.addColorStop(0.25, 'rgba(214, 150, 100, 0.05)');
        g.addColorStop(1, 'rgba(214, 150, 100, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);
      }

      // Sea
      ctx.beginPath(); path(this.geo.sphere);
      if (globe) {
        const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
        g.addColorStop(0, COLORS.seaLit); g.addColorStop(1, COLORS.sea);
        ctx.fillStyle = g;
      } else ctx.fillStyle = COLORS.sea;
      ctx.fill();
      ctx.save(); ctx.beginPath(); path(this.geo.sphere); ctx.clip();

      // Graticule
      ctx.beginPath(); path(this.geo.graticule);
      ctx.strokeStyle = COLORS.graticule; ctx.lineWidth = 0.6; ctx.stroke();

      // Exposed continental shelf: sphere minus the deep ocean, filled even-odd.
      if (shelf > 0.02) {
        ctx.beginPath(); path(this.geo.sphere); path(this.geo.deep);
        ctx.globalAlpha = 0.25 + 0.75 * shelf;
        ctx.fillStyle = COLORS.shelf;
        ctx.fill('evenodd');
        ctx.globalAlpha = 1;
      }

      // Land
      ctx.beginPath(); path(this.geo.land);
      ctx.fillStyle = COLORS.land; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.globalAlpha = 0.4; ctx.fillStyle = this.noise; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
      ctx.restore();

      // Lakes and rivers
      ctx.beginPath(); path(this.geo.lakes); ctx.fillStyle = COLORS.lake; ctx.fill();
      if (R > 260) {
        ctx.beginPath(); path(this.geo.rivers);
        ctx.strokeStyle = COLORS.river; ctx.lineWidth = BB.clamp(R / 900, 0.5, 1.3); ctx.stroke();
      }

      // Present-day ice and glacial ice sheets
      ctx.beginPath(); path(this.geo.glaciers); ctx.fillStyle = COLORS.ice; ctx.fill();
      if (ice > 0.01) {
        ctx.beginPath(); path(this.geo.ice);
        ctx.fillStyle = `rgba(${COLORS.lgmIce}, ${0.1 + 0.72 * ice})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${COLORS.lgmIce}, ${0.5 * ice})`; ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Coastline
      ctx.beginPath(); path(this.geo.land);
      ctx.strokeStyle = COLORS.coast; ctx.lineWidth = 0.6; ctx.stroke();

      if (this.showBorders) {
        ctx.beginPath(); path(this.geo.borders);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = COLORS.border; ctx.lineWidth = 0.6; ctx.stroke(); ctx.setLineDash([]);
      }

      // Light from the upper left, shadow toward the limb
      if (globe) {
        const g = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.05, cx, cy, R * 1.05);
        g.addColorStop(0, 'rgba(255, 236, 205, 0.10)');
        g.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      }
      ctx.restore();

      if (globe) {
        ctx.beginPath(); path(this.geo.sphere);
        ctx.strokeStyle = 'rgba(238, 226, 206, 0.16)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    visible(lon, lat) {
      if (this.mode !== 'globe') return 1;
      const d = d3.geoDistance([lon, lat], [this.cam.lon, this.cam.lat]);
      return BB.clamp((Math.PI / 2 - d) / 0.12, 0, 1);
    }

    drawOverlay(ts) {
      const ctx = this.octx, dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      const p = this.proj || this.projection();
      const path = d3.geoPath(p, ctx);
      const zoomK = BB.clamp(Math.sqrt(this.cam.zoom), 1, 2.4);

      // Routes
      for (const r of this.routes) {
        const pts = r.coords;
        if (!pts || r.progress <= 0) continue;
        const n = Math.max(2, Math.ceil(pts.length * r.progress));
        const part = pts.slice(0, n);
        const line = { type: 'LineString', coordinates: part };
        ctx.save();
        ctx.beginPath(); path(line);
        ctx.strokeStyle = r.debated ? 'rgba(227, 177, 92, 0.75)' : 'rgba(212, 105, 74, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash(r.debated ? [3, 6] : [10, 6]);
        ctx.lineDashOffset = -(ts / 40) % 64;
        ctx.shadowColor = 'rgba(212, 105, 74, 0.6)'; ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
        // Arrow head at the tip
        const a = part[part.length - 1], b = part[Math.max(0, part.length - 3)];
        const pa = p(a), pb = p(b);
        if (pa && pb && this.visible(a[0], a[1]) > 0.5) {
          const ang = Math.atan2(pa[1] - pb[1], pa[0] - pb[0]);
          ctx.save(); ctx.translate(pa[0], pa[1]); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-7, -5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 5); ctx.closePath();
          ctx.fillStyle = r.debated ? '#e3b15c' : '#d4694a'; ctx.fill();
          ctx.restore();
        }
        // Route label near the middle
        if (r.label && r.progress > 0.35 && this.cam.zoom > 1.3) {
          const mid = part[Math.floor(part.length * 0.55)];
          const pm = p(mid);
          if (pm && this.visible(mid[0], mid[1]) > 0.6) {
            ctx.font = 'italic 12px Literata, Georgia, serif';
            ctx.fillStyle = r.debated ? 'rgba(227, 177, 92, 0.95)' : 'rgba(240, 190, 170, 0.95)';
            ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 6;
            ctx.fillText(r.label, pm[0] + 8, pm[1] - 6);
            ctx.shadowBlur = 0;
          }
        }
      }

      // Sites
      const labels = [];
      const order = this.sites.slice().sort((a, b) => a.emphasis - b.emphasis);
      for (const e of order) {
        const s = e.site;
        const vis = this.visible(s.lon, s.lat);
        const xy = vis > 0 ? p([s.lon, s.lat]) : null;
        e.xy = xy && vis > 0.05 ? xy : null;
        if (!e.xy || e.alpha <= 0.01) continue;
        const a = e.alpha * vis;
        const col = e.color;
        const isSel = this.selected === s, isHov = this.hovered === s;
        const r = (e.emphasis > 0 ? 4.2 : 2.6) * zoomK * (isSel || isHov ? 1.25 : 1);
        ctx.globalAlpha = a;
        if (e.emphasis > 0) {
          const breathe = 0.55 + 0.45 * Math.sin(ts / 700 + s.lon);
          const g = ctx.createRadialGradient(xy[0], xy[1], 0, xy[0], xy[1], r * 4.5);
          g.addColorStop(0, hexA(col, 0.55 * breathe)); g.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xy[0], xy[1], r * 4.5, 0, 2 * Math.PI); ctx.fill();
          if (e.appearedAt != null) {
            const age = (ts - e.appearedAt) / 1600;
            if (age >= 0 && age < 1) {
              ctx.beginPath(); ctx.arc(xy[0], xy[1], r + age * 26, 0, 2 * Math.PI);
              ctx.strokeStyle = hexA(col, 1 - age); ctx.lineWidth = 1.5; ctx.stroke();
            }
          }
        }
        ctx.beginPath(); ctx.arc(xy[0], xy[1], r, 0, 2 * Math.PI);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(10, 9, 8, 0.8)'; ctx.stroke();
        if (isSel) {
          ctx.beginPath(); ctx.arc(xy[0], xy[1], r + 5 + Math.sin(ts / 300) * 1.2, 0, 2 * Math.PI);
          ctx.strokeStyle = '#f0c27a'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (isSel || isHov || (e.emphasis > 0 && a > 0.5) || (this.labelAll && a > 0.5 && this.cam.zoom > 2.2)) {
          labels.push({ e, xy, r, pri: isSel ? 3 : isHov ? 2.5 : e.emphasis > 0 ? 2 : 1, a });
        }
      }

      // Labels with greedy collision avoidance
      labels.sort((a, b) => b.pri - a.pri);
      const boxes = [];
      for (const l of labels) {
        const name = l.e.site.name;
        const big = l.pri >= 2;
        ctx.font = `${big ? 500 : 400} ${big ? 13 : 11.5}px 'IBM Plex Mono', ui-monospace, monospace`;
        const w = ctx.measureText(name).width;
        const cands = [[l.r + 7, 4], [-(w + l.r + 7), 4], [-w / 2, -l.r - 8], [-w / 2, l.r + 16]];
        let placed = null;
        for (const [dx, dy] of cands) {
          const bx = { x: l.xy[0] + dx - 3, y: l.xy[1] + dy - 12, w: w + 6, h: 16 };
          if (bx.x < 4 || bx.x + bx.w > this.W - 4) continue;
          if (!boxes.some((b) => bx.x < b.x + b.w && bx.x + bx.w > b.x && bx.y < b.y + b.h && bx.y + bx.h > b.y)) { placed = [dx, dy, bx]; break; }
        }
        if (!placed) continue;
        boxes.push(placed[2]);
        ctx.globalAlpha = l.a;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10, 9, 8, 0.85)'; ctx.lineJoin = 'round';
        ctx.strokeText(name, l.xy[0] + placed[0], l.xy[1] + placed[1]);
        ctx.fillStyle = l.pri >= 2.5 ? '#f0c27a' : big ? '#eee5d4' : '#bcb09c';
        ctx.fillText(name, l.xy[0] + placed[0], l.xy[1] + placed[1]);
        ctx.globalAlpha = 1;
      }
    }

    screenPos(site) {
      const e = this.sites.find((x) => x.site === site);
      return e && e.xy ? e.xy : null;
    }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${BB.clamp(a, 0, 1).toFixed(3)})`;
  }
  BB.hexA = hexA;

  // Densify a route polyline along great circles so it can be drawn progressively.
  BB.densifyRoute = function (path) {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const d = d3.geoDistance(a, b);
      const n = Math.max(2, Math.ceil(d / 0.02));
      const f = d3.geoInterpolate(a, b);
      for (let k = 0; k < n; k++) out.push(f(k / n));
    }
    out.push(path[path.length - 1]);
    return out;
  };

  BB.Globe = Globe;
})();
