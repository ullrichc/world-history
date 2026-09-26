# Before Bronze

A narrated, interactive history of the Stone Age around the world, from the first hominins about 7 million years ago
and the first stone tools 3.3 million years ago to the arrival of metal, which came to each region at a different time
or, in many places, not at all before recent centuries.

The story is told on a globe that moves through time: sea level falls and rises with the ice ages, the great ice sheets
grow and melt, the continental shelves appear and drown, and archaeological sites light up as the narrator reaches them.

* **Journey**: 44 narrated chapters (about 70 minutes) that play through time and across the continents. The globe
  flies to each region, the timeline advances with the narrator, and captions follow the voice sentence by sentence.
  Cinema mode hides the panels.
* **Explore**: drag the timeline to any moment and see which sites and which kinds of humans existed then. Filter by
  region and type of evidence, search sites, open any site for details.
* **Read**: every chapter as a full article (about 57,000 words in all), with key facts, a table of sites and, where
  researchers disagree, a section setting out each view and the state of the debate. Every chapter lists its sources,
  with DOI links where they exist.
* **Family tree**: 27 hominin species on a time axis, with their fossils, debates and the gene flow between
  Neanderthals, Denisovans, modern humans and unknown “ghost” populations.
* **Sources**: how the dating methods work, a glossary of 127 terms, notes on the maps and a combined bibliography.

The content reflects published research through 2026. Each chapter says which views are established and which are
contested, and names the researchers behind competing interpretations.

## Running it

The app is a static site with no build step and no server code. Any static file server works:

```sh
npm run serve                 # http://localhost:8080
# or
python3 -m http.server 8080
```

Opening `index.html` directly from disk works too, although some browsers then refuse the self-hosted fonts and fall
back to system ones. Deep links: `#explore`, `#tree`, `#sources`,
`#chapters`, or a chapter id such as `#gobekli-tepe`.

Keyboard: space plays and pauses, the left and right arrows move between chapters in the journey, Escape closes panels,
and the arrow keys move through time when the timeline has focus.

## The narrator

The narration is a synthetic voice, not a human recording. It was rendered for every chapter with
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), an open-weight neural text-to-speech model (voice `af_heart`),
through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx). Names that the phonemizer gets wrong, such as
Göbekli Tepe, Châtelperronian or Denisovan, are pronounced from IPA listed in `tools/lexicon.json`.

The app chooses a narrator in this order: the recorded MP3 files in `audio/`, then the best voice your browser offers,
then silent captions. You can switch in the settings.

To regenerate the audio after editing the text:

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install kokoro-onnx soundfile lameenc
# put kokoro-v1.0.onnx and voices-v1.0.bin from the kokoro-onnx releases into tools/raw/
npm run build:content
python tools/narrate.py                 # only chapters whose text changed are rendered
python tools/narrate.py --check         # print the phonemes of every sentence that uses the lexicon
```

### Replacing the voice with a human narrator

1. Record each chapter’s `narration` text (see `content/chapters/*.json`, or `tools/raw/narration-script.json` after
   `npm run build:content`, which has it split into sentences) as `audio/<chapter-id>.mp3`.
2. For each chapter, write the start and end time of every sentence, in seconds, into `data/narration.js`, keeping its
   format: `window.LD_NARRATION = {"<chapter-id>": {"file": "audio/<chapter-id>.mp3", "duration": 123.4,
   "sentences": [[0.0, 4.2], [4.6, 9.8], ...]}}`. A forced aligner such as
   [aeneas](https://github.com/readbeyond/aeneas) or WhisperX can produce these times from the recording and the text.
3. Update the narrator credit in `js/about.js`.

The captions, the timeline and the appearance of sites all follow those sentence times.

## Content

All text lives in `content/`:

* `chapters/NN-id.json`: 44 chapters with narration, article sections, debates, key facts, sites, routes and sources.
  The format and the style rules are described in `content/SCHEMA.md`.
* `species.json`: hominin species and gene flow for the family tree.
* `glossary.json` and `methods.json`: terms and dating methods for the Sources page.

After editing, run `npm run build:content`. It validates every file (fields, dates, coordinates, and style rules such as
typographic quotation marks and no em dashes) and compiles everything into `data/content.js`.

## Project layout

```
index.html            the page
css/                  styles and self-hosted font faces
js/                   app code: globe, timeline, narrator, reader, tree, sources, emblems
data/                 generated data: content, map geometry, climate curve, narration timings
audio/                narration, one MP3 per chapter
content/              the source text (JSON)
tools/                build scripts: content, map data, vendor files, narration
vendor/, fonts/       D3, TopoJSON client and the fonts, copied from npm packages
```

`npm run build:geo` rebuilds `data/geo.js` and `data/climate.js` from Natural Earth, the LR04 stack and the hand-traced
ice-sheet outlines in `tools/build-geo.mjs`; the header of that script lists the source files to place in `tools/raw/`
first. `npm run build:vendor` copies D3, TopoJSON client and the fonts from `node_modules`.

## Credits

* Map data: [Natural Earth](https://www.naturalearthdata.com) (public domain), via
  [world-atlas](https://github.com/topojson/world-atlas).
* Climate: LR04 benthic stack, Lisiecki and Raymo (2005), Paleoceanography 20, PA1003; sea level for the last
  35,000 years after Lambeck et al. (2014), PNAS 111, 15296–15303.
* Narration: Kokoro-82M by hexgrad (Apache 2.0), run with kokoro-onnx (MIT).
* Libraries: [D3](https://d3js.org) and TopoJSON client (ISC licence).
* Fonts: Fraunces, Literata and IBM Plex Mono (SIL Open Font License), see `fonts/README.md`.

Code and text are released under the Apache License 2.0 (see `LICENSE`).
