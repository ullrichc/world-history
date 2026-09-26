// Builds data/geo.js (map layers) and data/climate.js (climate and sea-level curves).
//
// Raw inputs go in tools/raw/ (not committed):
//   Natural Earth (public domain), from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//     ne_10m_bathymetry_K_200.geojson   ocean deeper than 200 m (used to show exposed glacial shelves)
//     ne_50m_rivers_lake_centerlines.geojson, ne_50m_lakes.geojson, ne_50m_glaciated_areas.geojson
//   LR04 benthic d18O stack (Lisiecki & Raymo 2005, doi:10.1029/2004PA001071) as LR04.csv
//     (a copy ships in the pyleoclim Python package: pyleoclim/data/LR04.csv)
//   Land and borders come from the world-atlas npm package (Natural Earth 50m / 110m).
//
// Usage: node tools/build-geo.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as d3 from 'd3';
import * as topojsonServer from 'topojson-server';
import * as topojsonClient from 'topojson-client';
import mapshaper from 'mapshaper';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const raw = (f) => path.join(root, 'tools/raw', f);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

async function simplify(geojson, commands) {
  const out = await mapshaper.applyCommands(`-i in.json ${commands} -o out.json format=geojson geojson-type=FeatureCollection precision=0.001`, { 'in.json': geojson });
  return JSON.parse(out['out.json']);
}

// d3-geo wants clockwise exterior rings; fix any polygon whose area covers more than a hemisphere.
function fixWinding(fc) {
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const rings of polys) {
      const area = d3.geoArea({ type: 'Polygon', coordinates: [rings[0]] });
      if (area > 2 * Math.PI) rings.forEach((r) => r.reverse());
    }
  }
  return fc;
}

// Chaikin smoothing for hand-drawn outlines.
function chaikin(ring, iterations = 3) {
  let pts = ring.slice(0, -1);
  for (let k = 0; k < iterations; k++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = next;
  }
  pts = pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  return [...pts, pts[0]];
}

// Approximate ice-sheet margins at the Last Glacial Maximum (about 26,000–19,000 years ago), traced by hand
// from published syntheses (Ehlers & Gibbard; Dyke 2004 for North America; Hughes et al. 2016 DATED-1 for
// Eurasia; Davies et al. 2020 for Patagonia). Margins were not synchronous; this is an illustration, not data.
const LGM_ICE = {
  'North American ice sheets': [[-124.5, 47.5], [-122.8, 47.0], [-121, 47.8], [-119.5, 47.6], [-117.3, 47.7], [-115.5, 48.3], [-113.5, 48.6], [-111, 48.2], [-108, 47.8], [-104, 47.5], [-100.5, 46.5], [-98, 43.5], [-97.3, 43.0], [-96.5, 44.0], [-95.0, 43.6], [-93.6, 41.6], [-92.5, 43.0], [-90.5, 43.5], [-89.2, 42.5], [-89.0, 40.7], [-87.5, 39.6], [-86.0, 39.3], [-84.6, 39.1], [-83.0, 39.8], [-81.5, 40.6], [-80.0, 41.0], [-77.5, 41.3], [-75.5, 41.0], [-74.3, 40.5], [-72.5, 40.8], [-70.0, 41.2], [-67.5, 41.3], [-65.0, 42.5], [-61.0, 43.5], [-57.0, 44.5], [-52.5, 46.0], [-50.5, 48.5], [-53.0, 52.5], [-55.0, 56.0], [-60.0, 60.5], [-63.5, 63.0], [-61.5, 66.5], [-63, 70], [-68, 74.5], [-72, 77.5], [-70, 80.5], [-62, 82.5], [-75, 83.2], [-90, 82.5], [-105, 80.5], [-118, 78.5], [-124, 76], [-126, 73], [-130, 70.5], [-135, 69.3], [-133.5, 67.5], [-131, 65.5], [-130, 64.5], [-133, 63.8], [-137, 63.0], [-141, 62.3], [-146, 62.8], [-150, 63.3], [-153, 62.3], [-156, 60], [-160, 57.5], [-164, 55.2], [-162, 54.4], [-157, 56], [-152, 58.3], [-148, 59.4], [-143, 59.6], [-139, 58.6], [-136, 56.8], [-134, 55], [-132.5, 53], [-131, 51.5], [-129, 50.2], [-126.5, 48.8], [-124.8, 47.8], [-124.5, 47.5]],
  'Greenland ice sheet': [[-44, 58.8], [-49, 60.5], [-53, 64], [-55, 67], [-56, 70], [-60, 74], [-67, 76.5], [-73, 78.2], [-68, 80.5], [-60, 82.3], [-45, 83.5], [-30, 83.8], [-18, 82.5], [-10, 81], [-12, 78], [-15, 75], [-18, 72], [-20, 69.5], [-26, 68], [-32, 66.5], [-38, 64.5], [-42, 61], [-44, 58.8]],
  'Eurasian ice sheets': [[-11.5, 51.5], [-10, 54.5], [-10.5, 56.5], [-8, 58.8], [-5, 60], [-2, 61.5], [2, 62.5], [5, 63.5], [9, 65.5], [12, 68], [15, 69.5], [18, 70.8], [18, 74], [14, 77], [10, 79.5], [15, 81], [25, 81.5], [35, 81.5], [50, 82], [65, 81.5], [75, 80], [78, 77], [70, 75.5], [66, 72.5], [60, 70], [55, 68.5], [48, 67.3], [44, 66.5], [42, 64.5], [40, 62.5], [38, 61], [36, 59.5], [33.5, 57.8], [30, 56.5], [27, 55.2], [24, 54.2], [22, 53.8], [19, 53.0], [16.5, 52.2], [14, 52.3], [12.5, 52.8], [10.5, 53.5], [9.5, 54.2], [9.2, 55.5], [9.0, 56.4], [8.2, 56.7], [7, 57.2], [4, 56], [1.5, 55.5], [0, 54.5], [0.2, 53.2], [-1, 53.2], [-2.5, 52.8], [-3.5, 52.2], [-4.5, 51.7], [-6, 51.9], [-6.4, 50.0], [-7.5, 50.5], [-9, 51.0], [-11.5, 51.5]],
  'Icelandic ice sheet': [[-25, 64], [-24, 66.8], [-19, 67.5], [-13, 66.3], [-12.5, 64.5], [-16, 63], [-20.5, 62.8], [-24, 63.3], [-25, 64]],
  'Alpine ice cap': [[5.6, 45.0], [5.0, 45.7], [5.9, 46.8], [7, 47.3], [8.3, 47.7], [9.5, 47.9], [11, 47.9], [12.5, 47.9], [13.5, 47.6], [15, 47.3], [15.3, 46.7], [13.8, 46.1], [12, 45.9], [10.5, 45.6], [9, 45.7], [7.8, 45.3], [7.0, 44.3], [6.2, 44.2], [5.6, 45.0]],
  'Pyrenean glaciers': [[-1.5, 42.9], [0, 42.5], [2.5, 42.4], [2.3, 42.9], [0, 43.1], [-1.5, 43.1], [-1.5, 42.9]],
  'Patagonian ice sheet': [[-73.5, -38], [-71, -38], [-70.8, -41], [-71, -44], [-70.5, -47], [-71.0, -50], [-70, -52.5], [-68.5, -53.5], [-67.5, -55], [-69.5, -55.7], [-72, -55], [-75.5, -53], [-76, -49], [-75.5, -45], [-74.5, -42], [-74, -39.5], [-73.5, -38]],
  'Southern Alps ice': [[166.5, -46], [167.5, -45.2], [169.8, -43], [171.5, -41.5], [172.5, -41.8], [170.5, -43.6], [168.5, -45.8], [166.5, -46]],
};

async function main() {
  const land50 = readJSON(path.join(root, 'node_modules/world-atlas/land-50m.json'));
  const countries110 = readJSON(path.join(root, 'node_modules/world-atlas/countries-110m.json'));
  const land = fixWinding(await simplify(topojsonClient.feature(land50, land50.objects.land), '-simplify 45% keep-shapes'));
  const borders = topojsonClient.mesh(countries110, countries110.objects.countries, (a, b) => a !== b);

  const deep = fixWinding(await simplify(readJSON(raw('ne_10m_bathymetry_K_200.geojson')), '-simplify 2% keep-shapes -filter-islands min-area=3000km2'));

  const riversRaw = readJSON(raw('ne_50m_rivers_lake_centerlines.geojson'));
  riversRaw.features = riversRaw.features.filter((f) => f.properties.scalerank <= 4);
  riversRaw.features.forEach((f) => { f.properties = { name: f.properties.name || '', rank: f.properties.scalerank }; });
  const rivers = await simplify(riversRaw, '-simplify 25%');

  const lakesRaw = readJSON(raw('ne_50m_lakes.geojson'));
  lakesRaw.features = lakesRaw.features.filter((f) => d3.geoArea(f) > 8e-6);
  lakesRaw.features.forEach((f) => { f.properties = { name: f.properties.name || '' }; });
  const lakes = fixWinding(await simplify(lakesRaw, '-simplify 30% keep-shapes'));

  const glaciers = fixWinding(await simplify(readJSON(raw('ne_50m_glaciated_areas.geojson')), '-simplify 15% keep-shapes -filter-islands min-area=500km2'));
  glaciers.features.forEach((f) => { f.properties = {}; });

  const ice = fixWinding({
    type: 'FeatureCollection',
    features: Object.entries(LGM_ICE).map(([name, ring]) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [chaikin(ring)] } })),
  });

  const topology = topojsonServer.topology({ land, deep, rivers, lakes, glaciers, ice, borders: { type: 'Feature', properties: {}, geometry: borders } }, 1e5);
  const js = `// Generated by tools/build-geo.mjs. Natural Earth (public domain); ice sheets approximate.\nwindow.LD_GEO=${JSON.stringify(topology)};\n`;
  fs.writeFileSync(path.join(root, 'data/geo.js'), js);
  console.log('data/geo.js', (js.length / 1024).toFixed(0), 'KB');

  // Climate: LR04 benthic d18O stack plus a sea-level curve.
  const lr04 = fs.readFileSync(raw('LR04.csv'), 'utf8').split(/\r?\n/)
    .map((l) => l.split(',').map(Number)).filter((r) => r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > 1);
  // Sea level for the last 35,000 years: rounded values after Lambeck et al. 2014 (PNAS) and related syntheses.
  const recentSea = [[0, 0], [4000, -0.5], [6000, -2], [7000, -6], [8000, -15], [9000, -26], [10000, -40], [11400, -55], [12000, -62], [13000, -72], [14200, -82], [14600, -100], [15000, -105], [16000, -112], [17000, -118], [19000, -125], [21000, -132], [25000, -125], [27000, -120], [29000, -105], [30000, -90], [35000, -80]];
  // Older sea level estimated from d18O: a linear scaling calibrated on the Holocene (0 m) and the LGM (about −130 m),
  // capped at +10 m. Deep-water temperature also affects d18O, so treat these values as rough.
  const d0 = 3.23, dLGM = 4.99;
  const toSea = (d) => Math.min(10, Math.round(-130 * (d - d0) / (dLGM - d0)));
  const sea = recentSea.slice();
  for (const [ka, d] of lr04) if (ka * 1000 > 35000) sea.push([Math.round(ka * 1000), toSea(d)]);
  const climate = {
    source: 'LR04 benthic δ18O stack (Lisiecki & Raymo 2005); sea level after Lambeck et al. 2014 for the last 35,000 years, older values scaled from δ18O',
    d18o: lr04.map(([ka, d]) => [Math.round(ka * 1000), d]),
    sea,
  };
  fs.writeFileSync(path.join(root, 'data/climate.js'), `// Generated by tools/build-geo.mjs\nwindow.LD_CLIMATE=${JSON.stringify(climate)};\n`);
  console.log('data/climate.js', lr04.length, 'LR04 points');
}
main().catch((e) => { console.error(e); process.exit(1); });
