// Validates content/chapters/*.json and content/*.json against the schema in content/SCHEMA.md.
// Usage: node tools/validate-content.mjs [file ...]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGIONS = ['africa', 'europe', 'asia', 'oceania', 'americas'];
const THEMES = ['species', 'technology', 'fire', 'art', 'ornament', 'burial', 'genetics', 'climate', 'migration',
  'seafaring', 'food', 'farming', 'animals', 'settlement', 'monuments', 'metal', 'violence', 'society', 'music', 'language'];
const SITE_TYPES = ['fossil', 'tools', 'art', 'burial', 'settlement', 'dna', 'footprints', 'monument', 'farming', 'metal', 'fire', 'other'];
const EMBLEMS = ['skull', 'footprints', 'chopper', 'handaxe', 'point', 'spear', 'fire', 'hand', 'beads', 'engraving', 'venus',
  'lionman', 'flute', 'horse', 'mammoth', 'bison', 'boat', 'dog', 'harpoon', 'pottery', 'wheat', 'pillar', 'megalith',
  'copperaxe', 'cattle', 'dna', 'volcano', 'ice', 'sun', 'sickle', 'maize', 'rice', 'house', 'needle', 'bow', 'fishhook', 'pig', 'wheel', 'globe'];
const ACTS = ['prologue', 'roots', 'toolmakers', 'many-humans', 'one-species', 'warming', 'transition', 'metal'];

const errors = [];
const warn = [];
function err(file, msg) { errors.push(`${file}: ${msg}`); }

// Prose checks: user style rules.
function checkText(file, where, s) {
  if (typeof s !== 'string') { err(file, `${where} is not a string`); return; }
  if (/—|―/.test(s)) err(file, `${where}: contains an em dash (not allowed)`);
  if (/"/.test(s)) err(file, `${where}: straight double quote, use “ ” instead`);
  if (/'/.test(s)) err(file, `${where}: straight apostrophe/quote, use ’ or ‘ ’ instead`);
  if (/\s--\s|\s-\s/.test(s)) err(file, `${where}: hyphen used as a dash`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) err(file, `${where}: emoji`);
  if (/\b[A-Z]{5,}\b/.test(s.replace(/\b(UNESCO|ORCID|BCE|FOXP2|EPAS1|MIS|LGM|DNA|OSL|ESR|IRSL|TT-OSL|AMS|PPNA|PPNB|LBK|MSA|LSA|IUP|NASA|CNRS|MNHN)\b/g, ''))) warn.push(`${file}: ${where}: possible all-caps word`);
}
function checkSpeech(file, where, s) {
  checkText(file, where, s);
  if (/[()\[\]\/%~±≈<>]/.test(s)) err(file, `${where}: narration should avoid brackets, slashes and symbols`);
  if (/–/.test(s)) err(file, `${where}: narration should avoid en dashes (say “between X and Y”)`);
  if (/\b(ka|Ma|kyr|BP|cal|c\.|ca\.|e\.g\.|i\.e\.|et al)\b/.test(s)) err(file, `${where}: narration contains an abbreviation`);
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function validateChapter(file, c) {
  for (const k of ['id', 'order', 'act', 'title', 'subtitle', 'era', 'start', 'end', 'dateLabel', 'regions', 'focus', 'emblem', 'summary', 'narration', 'body', 'debates', 'keyFacts', 'sites', 'sources', 'themes'])
    if (!(k in c)) err(file, `missing field ${k}`);
  if (!/^[a-z0-9-]+$/.test(c.id || '')) err(file, 'id must be kebab-case');
  if (!num(c.order)) err(file, 'order must be a number');
  if (!ACTS.includes(c.act)) err(file, `act must be one of ${ACTS.join(', ')}`);
  for (const k of ['title', 'subtitle', 'era', 'dateLabel', 'summary']) checkText(file, k, c[k]);
  if (!num(c.start) || !num(c.end) || c.start < c.end) err(file, 'start/end must be numbers in years ago with start >= end');
  if (!Array.isArray(c.regions) || !c.regions.length || c.regions.some(r => !REGIONS.includes(r))) err(file, `regions must be from ${REGIONS}`);
  const f = c.focus;
  if (!Array.isArray(f) || f.length !== 4 || !f.every(num) || f[1] >= f[3] || f[1] < -90 || f[3] > 90) err(file, 'focus must be [west, south, east, north]');
  if (!EMBLEMS.includes(c.emblem)) err(file, `emblem must be one of ${EMBLEMS.join(', ')}`);
  if (!Array.isArray(c.narration) || !c.narration.length) err(file, 'narration must be a non-empty array of paragraphs');
  else {
    c.narration.forEach((p, i) => checkSpeech(file, `narration[${i}]`, p));
    const words = c.narration.join(' ').split(/\s+/).length;
    if (words < 140 || words > 420) warn.push(`${file}: narration has ${words} words (target 180–280)`);
  }
  if (!Array.isArray(c.body) || c.body.length < 3) err(file, 'body needs at least 3 sections');
  else {
    let words = 0;
    c.body.forEach((s, i) => {
      checkText(file, `body[${i}].heading`, s.heading);
      if (!Array.isArray(s.paragraphs) || !s.paragraphs.length) err(file, `body[${i}].paragraphs missing`);
      else s.paragraphs.forEach((p, j) => { checkText(file, `body[${i}].paragraphs[${j}]`, p); words += p.split(/\s+/).length; });
    });
    if (words < 700) warn.push(`${file}: body has only ${words} words (target 900–1500)`);
  }
  if (!Array.isArray(c.debates) || c.debates.length < 1) err(file, 'debates needs at least 1 entry');
  else c.debates.forEach((d, i) => {
    checkText(file, `debates[${i}].question`, d.question);
    checkText(file, `debates[${i}].status`, d.status);
    if (!Array.isArray(d.views) || d.views.length < 2) err(file, `debates[${i}].views needs 2+ views`);
    else d.views.forEach((v, j) => { checkText(file, `debates[${i}].views[${j}].label`, v.label); checkText(file, `debates[${i}].views[${j}].text`, v.text); });
  });
  if (!Array.isArray(c.keyFacts)) err(file, 'keyFacts must be an array');
  else c.keyFacts.forEach((k, i) => { checkText(file, `keyFacts[${i}].label`, k.label); checkText(file, `keyFacts[${i}].value`, k.value); });
  if (!Array.isArray(c.sites) || c.sites.length < 3) err(file, 'sites needs at least 3 entries');
  else c.sites.forEach((s, i) => {
    const w = `sites[${i}] (${s.id})`;
    if (!/^[a-z0-9-]+$/.test(s.id || '')) err(file, `${w}: id must be kebab-case`);
    checkText(file, `${w}.name`, s.name); checkText(file, `${w}.country`, s.country); checkText(file, `${w}.summary`, s.summary);
    if (s.dateLabel !== undefined) checkText(file, `${w}.dateLabel`, s.dateLabel);
    if (!num(s.lat) || !num(s.lon) || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180) err(file, `${w}: bad lat/lon`);
    if (!num(s.start) || !num(s.end) || s.start < s.end) err(file, `${w}: start/end must be years ago, start >= end`);
    if (!SITE_TYPES.includes(s.type)) err(file, `${w}: type must be one of ${SITE_TYPES}`);
    if (!REGIONS.includes(s.region)) err(file, `${w}: region must be one of ${REGIONS}`);
  });
  if (c.routes !== undefined) {
    if (!Array.isArray(c.routes)) err(file, 'routes must be an array');
    else c.routes.forEach((r, i) => {
      checkText(file, `routes[${i}].label`, r.label);
      if (!Array.isArray(r.path) || r.path.length < 2 || !r.path.every(p => Array.isArray(p) && p.length === 2 && p.every(num))) err(file, `routes[${i}].path must be [[lon,lat],...]`);
      if (!num(r.start) || !num(r.end)) err(file, `routes[${i}] start/end`);
      if (!['established', 'debated'].includes(r.certainty)) err(file, `routes[${i}].certainty must be established|debated`);
    });
  }
  if (!Array.isArray(c.sources) || c.sources.length < 3) err(file, 'sources needs at least 3 entries');
  else c.sources.forEach((s, i) => { if (typeof s.cite !== 'string' || s.cite.length < 20) err(file, `sources[${i}].cite missing`); });
  if (!Array.isArray(c.themes) || c.themes.some(t => !THEMES.includes(t))) err(file, `themes must be from ${THEMES.join(', ')}`);
  if (c.pronounce !== undefined && (typeof c.pronounce !== 'object' || Array.isArray(c.pronounce))) err(file, 'pronounce must be an object');
}

// Non-chapter files (species, glossary, methods): apply the prose rules to every string.
function walkStrings(file, v, where) {
  if (typeof v === 'string') { if (!/^(id|group|status|chapter|from|to|confidence|region)$/.test(where.split('.').pop())) checkText(file, where, v); }
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(file, x, `${where}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkStrings(file, x, where ? `${where}.${k}` : k);
}

let files = process.argv.slice(2);
if (!files.length) {
  const dir = path.join(root, 'content/chapters');
  files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));
}
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `invalid JSON: ${e.message}`); continue; }
  if (f.includes('chapters')) validateChapter(path.basename(f), data);
  else walkStrings(path.basename(f), data, '');
}
warn.forEach(w => console.log('warn  ' + w));
errors.forEach(e => console.log('ERROR ' + e));
console.log(`${files.length} file(s), ${errors.length} error(s), ${warn.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
