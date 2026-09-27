// The user’s style rules for every piece of text in the app, shared by the content and series validators.
// checkText: prose shown on screen. checkSpeech: text that is also read aloud by the speech engine.

const CAPS_OK = /\b(UNESCO|ORCID|BCE|FOXP2|EPAS1|MIS|LGM|DNA|OSL|ESR|IRSL|TT-OSL|AMS|PPNA|PPNB|LBK|MSA|LSA|IUP|NASA|CNRS|MNHN|EPICA|PLOS|GISP)\b/g;

export function checkText(err, warn, file, where, s) {
  if (typeof s !== 'string') { err(file, `${where} is not a string`); return; }
  if (/—|―/.test(s)) err(file, `${where}: contains an em dash (not allowed)`);
  if (/"/.test(s)) err(file, `${where}: straight double quote, use “ ” instead`);
  if (/'/.test(s)) err(file, `${where}: straight apostrophe/quote, use ’ or ‘ ’ instead`);
  if (/\s--\s|\s-\s/.test(s)) err(file, `${where}: hyphen used as a dash`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) err(file, `${where}: emoji`);
  if (/\b[A-Z]{5,}\b/.test(s.replace(CAPS_OK, ''))) warn(`${file}: ${where}: possible all-caps word`);
}

export function checkSpeech(err, warn, file, where, s) {
  checkText(err, warn, file, where, s);
  if (typeof s !== 'string') return;
  if (/[()\[\]\/%~±≈<>]/.test(s)) err(file, `${where}: narration should avoid brackets, slashes and symbols`);
  if (/–/.test(s)) err(file, `${where}: narration should avoid en dashes (say “between X and Y”)`);
  if (/\b(ka|Ma|kyr|BP|cal|c\.|ca\.|e\.g\.|i\.e\.|et al)\b/.test(s)) err(file, `${where}: narration contains an abbreviation`);
}

// Split a paragraph into sentences. Decimal points and a few abbreviations are protected.
const ABBR = /\b(?:Mr|Mrs|Ms|Dr|St|Mt|vs|approx|H|A|P|Au|Ar|No)\.$/;
export function sentences(par) {
  const out = [];
  let buf = '';
  const re = /([.!?…][”’)]?)\s+/g;
  let last = 0, m;
  const pieces = [];
  while ((m = re.exec(par))) { pieces.push(par.slice(last, m.index + m[1].length)); last = m.index + m[0].length; }
  pieces.push(par.slice(last));
  for (const p of pieces) {
    buf = buf ? `${buf} ${p}` : p;
    if (ABBR.test(buf.trim())) continue;
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
