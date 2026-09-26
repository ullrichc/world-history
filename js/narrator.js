/* Narrator: plays a chapter's script sentence by sentence and reports which sentence is current.
   Three engines:
   - "recorded": pre-rendered audio in audio/<chapter>.mp3 with sentence timings (data/narration.js). Drop in
     recordings of a human narrator with the same file names and timings to replace the synthetic voice.
   - "browser": the browser's own speech synthesis (voice quality depends on the device).
   - "captions": no sound; sentences advance at reading pace. */
(function () {
  const BB = window.BB;

  class Narrator {
    constructor() {
      this.events = BB.emitter();
      this.engine = BB.store.get('engine', 'recorded');
      this.rate = BB.store.get('rate', 1);
      this.volume = BB.store.get('volume', 1);
      this.voiceName = BB.store.get('voice', '');
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.volume = this.volume;
      this.playing = false;
      this.chapter = null;
      this.sentences = [];
      this.index = -1;
      this.timer = null;
      this.raf = null;
      this.recordedOk = !!window.LD_NARRATION;
      // Audio is also fetched whole into blob URLs, so that seeking works even on servers without range requests
      this.blobs = new Map();
      this.audioKey = null;
      this.audio.addEventListener('ended', () => this.finish());
      this.audio.addEventListener('error', () => {
        // A host that refuses blob: media gets the plain file instead
        if (this.timing && (this.audio.getAttribute('src') || '').startsWith('blob:')) {
          const wasPlaying = this.playing, t = this.audio.currentTime;
          this.noBlobs = true;
          this.audio.src = this.timing.file;
          if (t) this.audio.currentTime = t;
          if (wasPlaying) this.audio.play().catch(() => {});
          return;
        }
        if (this.engineInUse() === 'recorded' && this.chapter) {
          this.recordedFailed = true;
          const wasPlaying = this.playing;
          this.stopAll();
          BB.toast('Recorded narration is unavailable here, switching to the browser voice.');
          if (wasPlaying) this.play();
        }
      });
      if ('speechSynthesis' in window) {
        const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang)); this.events.emit('voices', this.voices); };
        load();
        speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', load);
      } else this.voices = [];
    }

    hasRecording(ch = this.chapter) { return !!(ch && window.LD_NARRATION && window.LD_NARRATION[ch.id]) && !this.recordedFailed; }
    engineInUse() {
      if (this.engine === 'recorded' && this.hasRecording()) return 'recorded';
      if ((this.engine === 'recorded' || this.engine === 'browser') && 'speechSynthesis' in window && this.voices && this.voices.length) return 'browser';
      return 'captions';
    }

    setEngine(e) { const was = this.playing; this.stopAll(); this.engine = e; BB.store.set('engine', e); if (was) this.play(); this.events.emit('state'); }
    setRate(r) {
      this.rate = r; BB.store.set('rate', r);
      this.audio.playbackRate = r;
      if (this.playing && this.engineInUse() !== 'recorded') { this.stopAll(); this.play(); }
    }
    setVolume(v) { this.volume = v; BB.store.set('volume', v); this.audio.volume = v; }
    setVoice(name) { this.voiceName = name; BB.store.set('voice', name); if (this.playing && this.engineInUse() === 'browser') { this.stopAll(); this.play(); } }

    bestVoice() {
      const vs = this.voices || [];
      if (this.voiceName) { const v = vs.find((x) => x.name === this.voiceName); if (v) return v; }
      const rank = (v) => {
        const n = v.name;
        let s = 0;
        if (/natural|neural|online/i.test(n)) s += 50;
        if (/google uk english|google us english/i.test(n)) s += 30;
        if (/premium|enhanced|siri/i.test(n)) s += 25;
        if (/samantha|daniel|serena|karen|moira|arthur|ava|allison|susan|tom/i.test(n)) s += 12;
        if (/en-gb|en_gb/i.test(v.lang)) s += 3;
        if (v.localService === false) s += 2;
        return s;
      };
      return vs.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
    }

    load(chapter) {
      this.stopAll();
      this.chapter = chapter;
      this.sentences = chapter.sentences;
      this.index = -1;
      this.elapsed = 0;
      const rec = window.LD_NARRATION && window.LD_NARRATION[chapter.id];
      this.timing = rec || null;
      if (rec && this.engine === 'recorded' && !this.recordedFailed) {
        this.useSource(true);
        this.prefetch(chapter).then(() => { if (this.timing === rec && !this.playing && !this.audio.currentTime) this.useSource(true); });
      }
      this.events.emit('sentence', -1);
      this.events.emit('progress', 0);
      this.events.emit('state');
    }

    prefetch(chapter) {
      const rec = chapter && window.LD_NARRATION && window.LD_NARRATION[chapter.id];
      if (!rec || !window.fetch || location.protocol === 'file:') return Promise.resolve(null);
      if (!this.blobs.has(rec.file)) {
        const entry = { url: null };
        entry.promise = fetch(rec.file)
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => (entry.url = b ? URL.createObjectURL(b) : null))
          .catch(() => null);
        this.blobs.set(rec.file, entry);
        // Keep the three most recent recordings in memory
        for (const [file, e] of this.blobs) {
          if (this.blobs.size <= 3) break;
          if (file === this.audioKey || file === rec.file) continue;
          if (e.url) URL.revokeObjectURL(e.url);
          this.blobs.delete(file);
        }
      }
      return this.blobs.get(rec.file).promise;
    }

    // Points the audio element at the current chapter, preferring the fetched blob. Switching the source restarts
    // playback, so it happens only for a fresh chapter or right before a seek.
    useSource(allowSwap) {
      const rec = this.timing;
      if (!rec) return;
      const blob = this.blobs.get(rec.file);
      const src = (!this.noBlobs && blob && blob.url) || rec.file;
      const current = this.audio.getAttribute('src');
      if (this.audioKey !== rec.file || (allowSwap && current !== src)) {
        this.audio.src = src;
        this.audioKey = rec.file;
        this.audio.playbackRate = this.rate;
      }
    }

    seekTo(t) {
      this.useSource(true);
      this.audio.currentTime = t;
    }

    // Estimated or recorded duration in seconds at the current rate
    duration() {
      if (this.engineInUse() === 'recorded' && this.timing) return this.timing.duration / this.rate;
      return this.sentences.reduce((a, s) => a + this.readTime(s), 0);
    }
    readTime(s) { return Math.max(1.8, s.split(/\s+/).length / 2.55) / this.rate; }

    play(fromIndex) {
      if (!this.chapter) return;
      this.playing = true;
      this.events.emit('state');
      const eng = this.engineInUse();
      if (eng === 'recorded') {
        this.useSource(!this.audio.currentTime);
        this.audio.playbackRate = this.rate;
        if (fromIndex != null) this.seekTo(this.timing.sentences[fromIndex] ? this.timing.sentences[fromIndex][0] : 0);
        const pr = this.audio.play();
        if (pr && pr.catch) pr.catch((err) => {
          if (err && err.name === 'NotAllowedError') { this.playing = false; this.events.emit('state'); BB.toast('Press play to start the narration.'); }
        });
        const tick = () => {
          if (!this.playing) return;
          const t = this.audio.currentTime;
          const ss = this.timing.sentences;
          let i = ss.findIndex((x) => t >= x[0] && t < x[1]);
          if (i < 0) i = ss.findIndex((x) => t < x[0]) - 1;
          if (i < -1) i = ss.length - 1;
          if (i !== this.index && i >= 0) { this.index = i; this.events.emit('sentence', i); }
          this.events.emit('progress', BB.clamp(t / this.timing.duration, 0, 1));
          this.raf = requestAnimationFrame(tick);
        };
        tick();
        return;
      }
      const start = fromIndex != null ? fromIndex : Math.max(0, this.index);
      this.speakFrom(start, eng);
    }

    speakFrom(i, eng) {
      if (!this.playing) return;
      if (i >= this.sentences.length) { this.finish(); return; }
      this.index = i;
      this.events.emit('sentence', i);
      const total = this.duration();
      const before = this.sentences.slice(0, i).reduce((a, s) => a + this.readTime(s), 0);
      const len = this.readTime(this.sentences[i]);
      const t0 = performance.now();
      const prog = () => {
        if (!this.playing || this.index !== i) return;
        const f = BB.clamp((performance.now() - t0) / 1000 / len, 0, 1);
        this.events.emit('progress', BB.clamp((before + f * len) / total, 0, 1));
        this.raf = requestAnimationFrame(prog);
      };
      prog();
      if (eng === 'browser') {
        let text = this.sentences[i];
        const pr = this.chapter.pronounce || {};
        for (const [k, v] of Object.entries(pr)) text = text.split(k).join(v);
        const u = new SpeechSynthesisUtterance(text);
        const v = this.bestVoice();
        if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = this.rate * 0.97;
        u.volume = this.volume;
        u.onend = () => { if (this.playing && this.index === i) this.speakFrom(i + 1, eng); };
        u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled' && this.playing && this.index === i) this.speakFrom(i + 1, eng); };
        this.utterance = u;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } else {
        this.timer = setTimeout(() => this.speakFrom(i + 1, eng), len * 1000);
      }
    }

    pause() {
      if (!this.playing) return;
      this.playing = false;
      if (this.engineInUse() === 'recorded') this.audio.pause();
      else this.stopSpeech();
      cancelAnimationFrame(this.raf);
      this.events.emit('state');
    }
    toggle() { this.playing ? this.pause() : this.play(); }

    stopSpeech() {
      clearTimeout(this.timer);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
    stopAll() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.stopSpeech();
      try { this.audio.pause(); } catch (e) { /* ignore */ }
    }
    finish() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.events.emit('progress', 1);
      this.events.emit('state');
      this.events.emit('end');
    }
    jumpTo(i) {
      if (!this.chapter) return;
      const was = this.playing;
      this.stopAll();
      this.index = i;
      this.events.emit('sentence', i);
      if (this.engineInUse() === 'recorded' && this.timing && this.timing.sentences[i]) this.seekTo(this.timing.sentences[i][0]);
      if (was) this.play(i);
    }
  }
  BB.Narrator = Narrator;
})();
