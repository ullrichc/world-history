# Content schema

Every chapter of *Before Bronze* is one JSON file in `content/chapters/`, named
`NN-id.json` (for example `03-first-tools.json`). `tools/build-content.mjs` compiles all
chapters, species, glossary and methods into `data/content.js`, which the app loads. Run
`node tools/validate-content.mjs` after every edit.

## Conventions

* **Time** is always a number of **years ago, counted back from 2000 CE**.
  So 9600 BCE is `11600`, 3.3 million years ago is `3300000`. `start` is the older
  value, `end` the younger one (`start >= end`).
* **Coordinates** are decimal degrees, `lon` east positive, `lat` north positive,
  rounded to 0.01. Sites belong on land (the modern coastline or the exposed
  glacial shelf); drowned landscapes such as Doggerland are the only exceptions.
* **Regions** are continents: `africa`, `europe`, `asia` (includes West Asia and
  Arabia), `oceania` (Sahul, Wallacea, the Pacific), `americas`.

## Style rules (enforced by the validator)

* No em dashes anywhere. Use commas, colons, parentheses or separate sentences.
  En dashes (–) are correct for ranges in written text: `3.3–2.6 million years ago`.
* Typographic quotation marks and apostrophes only: “quoted”, ‘inner’, Neanderthal’s,
  Mal’ta. Never `"` or `'` inside text.
* No emojis, no capitals for emphasis.
* Correct diacritics: Çatalhöyük, Göbekli Tepe, Dolní Věstonice, Zlatý kůň, Ġgantija,
  Schöningen, Pločnik, Vedbæk, Ertebølle, Předmostí, Tam Pà Ling.
* Write for curious non-specialists, precisely and concretely: site names, dates, how
  they were dated, who found what, what it shows. Give the latest research through
  2026 and name when a view is new (“A 2025 study led by …”).
* Where scholars disagree, say so and explain each view fairly in `debates`.

## Narration rules

`narration` is read aloud by a speech engine and shown as captions.

* 180–280 words in 2–4 paragraphs; documentary tone, vivid but accurate.
* No brackets, slashes, `%`, `~`, `±`, en or em dashes. For ranges say
  “between 300,000 and 200,000 years ago”.
* No abbreviations (`ka`, `Ma`, `BP`, `c.`, `e.g.`, `et al`). Use “years ago”.
  Numbers as digits with thousands separators are fine: `1.8 million`, `11,600`.
* `pronounce` (optional) maps a hard name in the narration to an English respelling
  for the browser’s own speech voices, e.g. `{"Göbekli Tepe": "Guh-beck-lee Teh-peh"}`.
  The recorded neural narration uses exact IPA from `tools/lexicon.json` instead; add
  new hard names there too (`python tools/narrate.py --check` prints the phonemes).

## Fields

```jsonc
{
  "id": "first-tools",                 // kebab-case, equals the file name without NN-
  "order": 3,                          // play order
  "act": "toolmakers",                 // prologue | roots | toolmakers | many-humans | one-species | warming | transition | metal
  "title": "The First Toolmakers",
  "subtitle": "Lomekwi, Nyayanga and the Oldowan",
  "era": "Early Stone Age",            // conventional period name(s)
  "start": 3300000, "end": 1700000,     // years ago
  "dateLabel": "3.3–1.7 million years ago",   // Holocene chapters: "c. 9600–8200 BCE"
  "regions": ["africa"],
  "focus": [28, -5, 45, 14],           // camera box [west, south, east, north]
  "emblem": "chopper",                 // one of the emblem keys listed below
  "summary": "One or two sentences for chapter cards.",
  "narration": ["Paragraph one.", "Paragraph two."],
  "pronounce": {"Lomekwi": "Lo-meh-kwee"},
  "body": [
    {"heading": "Section heading", "paragraphs": ["…", "…"]}
  ],                                   // 5–8 sections, 900–1500 words in total
  "debates": [
    {
      "question": "Who made the first tools?",
      "views": [
        {"label": "Early Homo", "text": "Who argues this, and on what evidence."},
        {"label": "Australopiths or Paranthropus", "text": "…"}
      ],
      "status": "Where the debate stands now, and what evidence would settle it."
    }
  ],                                   // 2–4 debates
  "keyFacts": [{"label": "Oldest tools", "value": "3.3 million years, Lomekwi 3 (Kenya)"}],  // 4–6
  "sites": [
    {
      "id": "lomekwi-3",               // canonical kebab-case site name; the same site in two chapters uses the same id
      "name": "Lomekwi 3",
      "country": "Kenya",
      "region": "africa",
      "lat": 3.91, "lon": 35.87,
      "start": 3300000, "end": 3300000,  // years ago the evidence spans
      "dateLabel": "3.3 million years ago",
      "type": "tools",                 // fossil | tools | art | burial | settlement | dna | footprints | monument | farming | metal | fire | other
      "summary": "One to three sentences: what was found and why it matters."
    }
  ],                                   // 5–12 sites
  "routes": [                          // optional movements to animate on the map
    {"id": "ooa-southern", "label": "Southern dispersal", "start": 70000, "end": 50000,
     "certainty": "debated", "path": [[43.3, 12.6], [55, 17], [72, 20]]}
  ],
  "themes": ["technology", "species"], // species technology fire art ornament burial genetics climate migration seafaring food farming animals settlement monuments metal violence society music language
  "sources": [
    {"cite": "Harmand, S. et al. (2015). 3.3-million-year-old stone tools from Lomekwi 3, West Turkana, Kenya. Nature 521, 310–315.", "doi": "10.1038/nature14464"}
  ]                                    // 4–10 real references; add "doi" only when verified
}
```

## Emblems

`skull footprints chopper handaxe point spear fire hand beads engraving venus lionman
flute horse mammoth bison boat dog harpoon pottery wheat pillar megalith copperaxe
cattle dna volcano ice sun sickle maize rice house needle bow fishhook pig wheel globe`
