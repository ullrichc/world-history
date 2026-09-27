// Validates content/series/*.json (the documentary episodes) and compiles them into data/series.js for the app,
// plus tools/raw/series-script.json for the speech renderer (tools/narrate-series.py).
// Usage: node tools/build-series.mjs [--check]        (--check validates without writing)
import fs from 'node:fs';
import path from 'node:path';
import { checkText, checkSpeech, sentences } from './style-rules.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const REGIONS = ['africa', 'europe', 'asia', 'oceania', 'americas'];
const CARD_TYPES = ['title', 'site', 'number', 'quote', 'debate', 'text', 'place', 'species', 'route'];
const STATUS = ['sample', 'draft', 'final'];
const WORDS_PER_MINUTE = 149;

const errors = [], warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (msg) => warnings.push(msg);
const text = (file, where, s) => checkText(err, warn, file, where, s);
const speech = (file, where, s) => checkSpeech(err, warn, file, where, s);
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Sites and species from the chapters, so that episodes can refer to them by id
const contentJs = fs.readFileSync(path.join(root, 'data/content.js'), 'utf8');
const C = JSON.parse(contentJs.slice(contentJs.indexOf('{'), contentJs.lastIndexOf('}') + 1));
const siteIds = new Set(C.sites.map((s) => s.id));
const speciesIds = new Set(C.species.map((s) => s.id));

const series = read('content/series/series.json');
const sfile = 'series.json';
text(sfile, 'title', series.title);
text(sfile, 'tagline', series.tagline);
if (!Array.isArray(series.speakers) || series.speakers.length < 1) err(sfile, 'speakers must be a non-empty array');
const speakers = new Map();
for (const [i, sp] of (series.speakers || []).entries()) {
  for (const k of ['id', 'label', 'voice', 'lang', 'color']) if (!(k in sp)) err(sfile, `speakers[${i}] missing ${k}`);
  if (!/^[a-z][a-z0-9-]*$/.test(sp.id || '')) err(sfile, `speakers[${i}].id must be kebab-case`);
  if (!/^[abz][fm]_[a-z]+$/.test(sp.voice || '')) err(sfile, `speakers[${i}].voice is not a Kokoro voice id`);
  if (!['en-us', 'en-gb'].includes(sp.lang)) err(sfile, `speakers[${i}].lang must be en-us or en-gb`);
  text(sfile, `speakers[${i}].label`, sp.label);
  if (sp.role) text(sfile, `speakers[${i}].role`, sp.role);
  speakers.set(sp.id, sp);
}
if (series.audition) speech(sfile, 'audition.text', series.audition.text);

function validateCamera(file, where, cam) {
  if (!cam || typeof cam !== 'object') { err(file, `${where}: camera must be an object`); return; }
  if (cam.sites) {
    if (!Array.isArray(cam.sites) || !cam.sites.length) err(file, `${where}: camera.sites must be a non-empty array`);
    if (cam.zoom !== undefined && !num(cam.zoom)) err(file, `${where}: camera.zoom must be a number`);
  } else if (cam.box) {
    const f = cam.box;
    if (!Array.isArray(f) || f.length !== 4 || !f.every(num) || f[1] >= f[3]) err(file, `${where}: camera.box must be [west, south, east, north]`);
  } else if (!(num(cam.lon) && num(cam.lat) && num(cam.zoom))) err(file, `${where}: camera needs sites, box, or lon, lat and zoom`);
}

function validateCard(file, where, card, epSites, epSpecies, epRoutes) {
  if (card === null) return;
  if (!card || typeof card !== 'object') { err(file, `${where}: card must be an object or null`); return; }
  if (!CARD_TYPES.includes(card.type)) { err(file, `${where}: card.type must be one of ${CARD_TYPES.join(', ')}`); return; }
  for (const k of ['kicker', 'title', 'sub', 'value', 'label', 'note', 'text', 'attribution', 'question', 'status']) if (card[k] !== undefined) text(file, `${where}.${k}`, card[k]);
  if (card.items !== undefined) {
    if (!Array.isArray(card.items)) err(file, `${where}.items must be an array`);
    else card.items.forEach((it, i) => text(file, `${where}.items[${i}]`, it));
  }
  if (card.type === 'site' && !(siteIds.has(card.site) || epSites.has(card.site))) err(file, `${where}: unknown site ${card.site}`);
  if (card.type === 'species' && !(speciesIds.has(card.species) || epSpecies.has(card.species))) err(file, `${where}: unknown species ${card.species}`);
  if (card.type === 'route' && !epRoutes.has(card.route)) err(file, `${where}: unknown route ${card.route}`);
  if (card.type === 'title' && !card.title) err(file, `${where}: title card needs a title`);
  if (card.type === 'number' && !(card.value && card.label)) err(file, `${where}: number card needs value and label`);
  if (card.type === 'quote' && !(card.text && card.attribution)) err(file, `${where}: quote card needs text and attribution`);
  if (card.type === 'debate') {
    if (!card.question) err(file, `${where}: debate card needs a question`);
    if (!Array.isArray(card.views) || card.views.length < 2) err(file, `${where}: debate card needs at least two views`);
    else card.views.forEach((v, i) => { text(file, `${where}.views[${i}].label`, v.label); text(file, `${where}.views[${i}].text`, v.text); });
  }
}

function validateEpisode(file, e) {
  for (const k of ['id', 'number', 'title', 'subtitle', 'summary', 'regions', 'emblem', 'status', 'scenes']) if (!(k in e)) err(file, `missing field ${k}`);
  if (!/^[a-z0-9-]+$/.test(e.id || '')) err(file, 'id must be kebab-case');
  if (!num(e.number)) err(file, 'number must be a number');
  if (!STATUS.includes(e.status)) err(file, `status must be one of ${STATUS.join(', ')}`);
  for (const k of ['title', 'subtitle', 'summary', 'statusNote']) if (e[k] !== undefined) text(file, k, e[k]);
  if (!Array.isArray(e.regions) || e.regions.some((r) => !REGIONS.includes(r))) err(file, `regions must be from ${REGIONS}`);
  const epSites = new Set(), epSpecies = new Set(), epRoutes = new Set();
  for (const [i, s] of (e.sites || []).entries()) {
    const w = `sites[${i}] (${s.id})`;
    if (!/^[a-z0-9-]+$/.test(s.id || '')) err(file, `${w}: id must be kebab-case`);
    if (siteIds.has(s.id)) err(file, `${w}: already defined in the chapters; refer to it by id instead`);
    for (const k of ['name', 'country', 'summary']) text(file, `${w}.${k}`, s[k]);
    if (s.dateLabel !== undefined) text(file, `${w}.dateLabel`, s.dateLabel);
    if (!num(s.lat) || !num(s.lon) || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180) err(file, `${w}: bad lat/lon`);
    if (!num(s.start) || !num(s.end) || s.start < s.end) err(file, `${w}: start/end must be years ago, start >= end`);
    if (!REGIONS.includes(s.region)) err(file, `${w}: region must be one of ${REGIONS}`);
    epSites.add(s.id);
  }
  for (const [i, r] of (e.routes || []).entries()) {
    text(file, `routes[${i}].label`, r.label);
    if (!/^[a-z0-9-]+$/.test(r.id || '')) err(file, `routes[${i}].id must be kebab-case`);
    if (!Array.isArray(r.path) || r.path.length < 2 || !r.path.every((p) => Array.isArray(p) && p.length === 2 && p.every(num))) err(file, `routes[${i}].path must be [[lon,lat],...]`);
    if (!['established', 'debated'].includes(r.certainty)) err(file, `routes[${i}].certainty must be established|debated`);
    epRoutes.add(r.id);
  }
  if (!Array.isArray(e.scenes) || !e.scenes.length) { err(file, 'scenes must be a non-empty array'); return { epSites }; }
  const ids = new Set();
  let words = 0;
  e.scenes.forEach((sc, si) => {
    const w = `scenes[${si}] (${sc.id})`;
    if (!/^[a-z0-9-]+$/.test(sc.id || '')) err(file, `${w}: id must be kebab-case`);
    if (ids.has(sc.id)) err(file, `${w}: duplicate scene id`);
    ids.add(sc.id);
    text(file, `${w}.title`, sc.title);
    if (!num(sc.start) || !num(sc.end) || sc.start < sc.end) err(file, `${w}: start/end must be years ago with start >= end`);
    validateCamera(file, w, sc.camera);
    if (!Array.isArray(sc.cues) || !sc.cues.length) { err(file, `${w}: cues must be a non-empty array`); return; }
    let lastTime = sc.start;
    sc.cues.forEach((cue, ci) => {
      const cw = `${w}.cues[${ci}]`;
      if (!speakers.has(cue.speaker)) err(file, `${cw}: unknown speaker ${cue.speaker}`);
      speech(file, `${cw}.text`, cue.text);
      if (typeof cue.text === 'string') words += cue.text.split(/\s+/).length;
      if (cue.sites) {
        if (!Array.isArray(cue.sites)) err(file, `${cw}.sites must be an array`);
        else cue.sites.forEach((id) => { if (!(siteIds.has(id) || epSites.has(id))) err(file, `${cw}: unknown site ${id}`); });
      }
      if (cue.camera !== undefined) validateCamera(file, cw, cue.camera);
      if (cue.card !== undefined) validateCard(file, `${cw}.card`, cue.card, epSites, epSpecies, epRoutes);
      if (cue.route !== undefined && !epRoutes.has(cue.route)) err(file, `${cw}: unknown route ${cue.route}`);
      if (cue.time !== undefined) {
        if (!num(cue.time)) err(file, `${cw}.time must be a number of years ago`);
        else if (cue.time > lastTime && sc.start >= sc.end) warn(`${file}: ${cw}: time ${cue.time} runs backwards within the scene`);
        else lastTime = cue.time;
      }
    });
    for (const cam of [sc.camera, ...sc.cues.map((c) => c.camera)]) {
      if (cam && cam.sites) cam.sites.forEach((id) => { if (!(siteIds.has(id) || epSites.has(id))) err(file, `${w}: camera refers to unknown site ${id}`); });
    }
    if (!Array.isArray(sc.sources) || !sc.sources.length) warn(`${file}: ${w}: no sources`);
    else sc.sources.forEach((s, i) => { if (typeof s.cite !== 'string' || s.cite.length < 20) err(file, `${w}.sources[${i}].cite missing`); });
  });
  const minutes = words / WORDS_PER_MINUTE;
  if (e.status === 'final' && (minutes < 40 || minutes > 50)) warn(`${file}: ${words} words is about ${minutes.toFixed(0)} minutes; the target is 45`);
  return { epSites, words, minutes };
}

const dir = path.join(root, 'content/series');
const files = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
const episodes = [];
for (const f of files) {
  let e;
  try { e = read(`content/series/${f}`); } catch (ex) { err(f, `invalid JSON: ${ex.message}`); continue; }
  const { words = 0, minutes = 0 } = validateEpisode(f, e) || {};
  if (e.id && f.slice(3, -5) !== e.id) err(f, `file name should be ${String(e.number).padStart(2, '0')}-${e.id}.json`);
  episodes.push({ ...e, words, minutes: Math.round(minutes * 10) / 10 });
}
episodes.sort((a, b) => a.number - b.number);

warnings.forEach((w) => console.log('warn  ' + w));
errors.forEach((e) => console.log('ERROR ' + e));
console.log(`${files.length} episode file(s), ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length) process.exit(1);
if (process.argv.includes('--check')) process.exit(0);

// App data: cue texts are split into sentences for captions.
const out = {
  title: series.title,
  tagline: series.tagline,
  speakers: series.speakers,
  audition: series.audition || null,
  episodes: episodes.map((e) => ({
    id: e.id, number: e.number, title: e.title, subtitle: e.subtitle, summary: e.summary, regions: e.regions,
    emblem: e.emblem, status: e.status, statusNote: e.statusNote || '', words: e.words, minutes: e.minutes,
    sites: e.sites || [], routes: e.routes || [],
    scenes: e.scenes.map((sc) => ({
      id: sc.id, title: sc.title, start: sc.start, end: sc.end, camera: sc.camera,
      cues: sc.cues.map((c) => ({ ...c, sentences: sentences(c.text) })),
      sources: sc.sources || [],
    })),
  })),
};
fs.writeFileSync(path.join(root, 'data/series.js'), `// Generated by tools/build-series.mjs from content/series/. Do not edit by hand.\nwindow.LD_SERIES=${JSON.stringify(out)};\n`);

// Speech script: one entry per scene, each cue with its voice.
fs.mkdirSync(path.join(root, 'tools/raw'), { recursive: true });
const script = {
  speakers: series.speakers,
  audition: series.audition || null,
  scenes: out.episodes.flatMap((e) => e.scenes.map((sc) => ({
    episode: e.id, scene: sc.id,
    cues: sc.cues.map((c) => { const sp = speakers.get(c.speaker); return { speaker: c.speaker, voice: sp.voice, lang: sp.lang, sentences: c.sentences }; }),
  }))),
};
fs.writeFileSync(path.join(root, 'tools/raw/series-script.json'), JSON.stringify(script, null, 1));
const total = episodes.reduce((a, e) => a + e.words, 0);
console.log(`${episodes.length} episodes, ${episodes.reduce((a, e) => a + e.scenes.length, 0)} scenes, ${total} words (about ${Math.round(total / WORDS_PER_MINUTE)} minutes)`);
for (const e of episodes) console.log(`  ${e.number}. ${e.title}: ${e.scenes.length} scenes, ${e.words} words, about ${e.minutes} minutes (${e.status})`);
