# Series schema

Each episode of the documentary series is one JSON file in `content/series/`, named `NN-id.json`.
`content/series/series.json` holds the series title and the speakers (voice per role).
`node tools/build-series.mjs` validates every file (same style rules as the chapters, see `content/SCHEMA.md`)
and writes `data/series.js` for the app and `tools/raw/series-script.json` for the speech renderer;
`python tools/narrate-series.py` renders one MP3 per scene into `audio/series/<episode>/` and writes the cue
and sentence timings to `data/series-audio.js`.

## Episode

```jsonc
{
  "id": "the-longest-age", "number": 1,
  "title": "…", "subtitle": "…", "summary": "…",
  "regions": ["africa", "europe"],        // continents covered
  "emblem": "chopper",                    // an emblem key from content/SCHEMA.md
  "status": "draft",                      // sample | draft | final
  "statusNote": "…",                      // optional, shown on the episode card
  "sites": [ /* sites not defined in any chapter, same fields as chapter sites */ ],
  "routes": [ /* same fields as chapter routes; referenced by cues */ ],
  "scenes": [ /* see below */ ]
}
```

## Scene

```jsonc
{
  "id": "an-edge-in-the-desert", "title": "An edge in the desert",
  "start": 3300000, "end": 3300000,       // years ago. The timeline moves from start to end through the scene,
                                          // passing through the cue keyframes below; if start equals end the time
                                          // holds after the last keyframe.
  "camera": { "sites": ["lomekwi-3"], "zoom": 4.5 },   // or {"box": [w, s, e, n]} or {"lon", "lat", "zoom"}
  "cues": [ /* see below */ ],
  "sources": [ {"cite": "…", "doi": "…"} ]
}
```

## Cue

One speaker, one passage of text. Everything else is optional and happens when the cue starts.

```jsonc
{
  "speaker": "narrator",                  // a speaker id from series.json
  "text": "…",                            // read aloud and shown as captions, sentence by sentence
  "sites": ["lomekwi-3"],                 // sites to light up on the globe (they stay lit for the scene)
  "camera": { … },                        // fly the globe
  "time": 5000,                           // timeline keyframe: the timeline reaches this age at the cue start
  "route": "sweep-sapiens",               // animate this route over the cue
  "card": { … } | null                    // show a card (it stays until replaced); null clears it
}
```

## Cards

* `title`: `kicker`, `title`, `sub`
* `number`: `value`, `label`, `note`
* `quote`: `text`, `attribution`
* `site`: `site` (a site id from the chapters or the episode)
* `species`: `species` (a species id)
* `debate`: `question`, `views` (2 to 4 of `label`, `text`), `status`
* `text` and `place`: `kicker`, `title`, `sub`, `items` (a list), `note`

The narration rules of `content/SCHEMA.md` apply to every `text`: no brackets, slashes, symbols, en dashes or
abbreviations; numbers as digits (years such as 1836 and 2015 are spoken correctly by the renderer).
British voices are phonemized as en-gb; hard names go into `tools/lexicon.json`.
