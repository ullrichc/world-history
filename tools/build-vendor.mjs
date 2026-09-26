// Copies third-party browser files (d3, topojson-client, fonts) from node_modules into vendor/ and fonts/.
// Usage: npm install && node tools/build-vendor.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  fs.copyFileSync(nm(from), path.join(root, to));
  console.log('copied', to);
};

copy('d3/dist/d3.min.js', 'vendor/d3.min.js');
copy('topojson-client/dist/topojson-client.min.js', 'vendor/topojson-client.min.js');

const fonts = [
  ['@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2', 'fonts/fraunces-latin.woff2'],
  ['@fontsource-variable/fraunces/files/fraunces-latin-ext-full-normal.woff2', 'fonts/fraunces-latin-ext.woff2'],
  ['@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2', 'fonts/fraunces-italic-latin.woff2'],
  ['@fontsource-variable/fraunces/files/fraunces-latin-ext-full-italic.woff2', 'fonts/fraunces-italic-latin-ext.woff2'],
];
for (const w of [400, 600]) for (const s of ['normal', 'italic']) for (const sub of ['latin', 'latin-ext'])
  fonts.push([`@fontsource/literata/files/literata-${sub}-${w}-${s}.woff2`, `fonts/literata-${sub}-${w}-${s}.woff2`]);
for (const w of [400, 500]) for (const sub of ['latin', 'latin-ext'])
  fonts.push([`@fontsource/ibm-plex-mono/files/ibm-plex-mono-${sub}-${w}-normal.woff2`, `fonts/plex-mono-${sub}-${w}.woff2`]);
fonts.forEach(([a, b]) => copy(a, b));
