# Series plan: “Before Bronze” as a documentary series to watch

Agreed with the user on 2026-09-27. Read `CLAUDE.md` first for the standing preferences and the technical notes.

## Decisions already made

* **Format:** a “Watch” mode inside the existing app, not exported video files. Episode list, full-screen playback,
  scene markers, captions, and the option to pause and explore any site on the globe.
* **Length:** 8 episodes of about 45 minutes each, about 6 hours in total.
* **Voices:** several voices, if the speech model allows (it does; see the voice list in `CLAUDE.md`).
* **Viewpoints:** include non-orthodox viewpoints and present every view neutrally: what its proponents argue, the
  evidence they cite, what critics answer, and how the field has responded, stated as facts. The viewer comes to
  their own conclusion. The user liked how the first version handled debates; keep that approach.
* **Model:** this work runs on Fable, with web searches raised to 500 for the session.

## Episodes

At the measured pace of about 149 words per minute, 45 minutes is roughly 6,500 to 6,700 words of narration per
episode (about 53,000 in all). Each episode opens with a short recap of how people reached the region, so it can be
watched on its own; plan that overlap deliberately. The existing chapters (content/chapters) are raw material to
rewrite as a script, not to read out.

| # | Title (working) | Scope | Draw on chapters |
|---|---|---|---|
| 1 | The Longest Age | What the Stone Age is and why the name misleads; how we know (dating, ancient DNA, proteins, ice and ocean cores); the ice ages and sea level; the whole story in one sweep; the questions the series will follow | 00, 17, 28, parts of 43; methods.json |
| 2 | Africa I: the Cradle | 7 million to 300,000 years ago: first hominins, australopiths, first tools, early Homo, erectus and handaxes, fire, Homo naledi | 01, 02, 03, 04, 05, 09, 10 |
| 3 | Africa II: Our Species | Origin of Homo sapiens, Middle Stone Age symbols, Toba, leaving Africa, Later Stone Age, the Green Sahara and herders, the move from stone to iron | 11, 14, 15, 17, 18, 26, 36, Africa part of 42 |
| 4 | Europe | First Europeans, Neanderthals and their end, Aurignacian art and music, the Ice Age and its refuges, Magdalenians, Mesolithic, first farmers, megaliths, copper, steppe migrations, Beakers | 07, 09, 12, 20, 21, 23, 25, 31, 34, 35, 41, Europe part of 42 |
| 5 | West and South Asia | Dmanisi and the first exits, the Levant (Misliya, Skhul, Qafzeh, Shanidar), Arabia, Natufians, Göbekli Tepe and Taş Tepeler, the first farmers, Çatalhöyük, Mehrgarh and the Indus, Uruk and early copper | 06, 12, 16, 29, 30, 33, 38, 41, Near East part of 42 |
| 6 | East and North Asia | Homo erectus in China, Denisovans, Siberia and Mal’ta, dogs, the world’s first pottery, Jōmon, rice and millet, Liangzhu, Qijia and Erlitou bronze | 06, 13, 22, 24, 32, 37, East Asia part of 42 |
| 7 | The Americas | First arrivals and the dating debates, Clovis and older sites, megafauna, domestication (maize, potato, squash, llama), Caral, Chinchorro, late and independent metallurgy | 27, 40, Americas part of 42 |
| 8 | Sahul and the Pacific | Island Southeast Asia and the island hominins (Flores, Luzon), the first Australians, Sahul through the ice age, New Guinea farming, Lapita and the Pacific voyages to the last uninhabited islands; closing reflection on what the Stone Age left us | 08, 19, 39, Oceania part of 42, 43 |

Adjust the boundaries where the research suggests a better cut, but keep 8 episodes of about 45 minutes unless the
user agrees otherwise.

## Non-orthodox and contested views to cover

Treat each with the same structure: the claim in its proponents’ strongest terms; the evidence they cite; the
critics’ responses; the current position of the field as verifiable facts (reviews, replications, retractions,
surveys of specialists). Use the same neutral tone as for mainstream debates, name people and years, and never
describe a view with loaded words. Research each one fresh; the notes below are starting points, not conclusions.

* **Younger Dryas impact hypothesis** (Firestone et al. 2007 and the Comet Research Group; later work at Abu Hureyra
  and elsewhere; critiques such as Holliday et al. 2023). Episodes 1 and 5, and 7 for the Clovis connection.
* **Göbekli Tepe as an astronomical record** (Sweatman and Tsikritsis 2017 and replies) and **“lost civilisation”**
  readings of Göbekli Tepe and the end of the ice age (Graham Hancock and critics, including the debate around the
  2022 series “Ancient Apocalypse”). Episode 5.
* **Gunung Padang** (Natawidjaja et al. 2023, retracted in 2024, and the arguments on both sides). Episode 8.
* **Solutrean hypothesis** (Stanford and Bradley 2012; the genetic and archaeological responses). Episodes 4 and 7.
* **Very early people in the Americas:** Cerutti Mastodon (Holen et al. 2017), Pedra Furada, Chiquihuite Cave
  (Ardelean et al. 2020), alongside White Sands. Episode 7.
* **Aquatic ape hypothesis** (Hardy, Morgan) and responses. Episode 2.
* **Multiregional evolution** versus recent African origin, and how genomes changed that debate. Episode 3.
* **Homo naledi burial and engraving claims** (Berger et al. 2023 and the eLife reviews). Episode 2.
* **Marija Gimbutas’s “Old Europe”** and goddess interpretations, and the Kurgan versus Anatolian debate. Episode 4.
* **Sundaland as an early cradle** (Stephen Oppenheimer, “Eden in the East”). Episode 8.
* Others worth weighing: very old dates for rock art and hominin presence that remain contested; the “stoned ape”
  idea; claims of pre-Clovis transatlantic or transpacific crossings. Include a view when it has published
  proponents or a real public presence; say so briefly when a view is widely discussed but has little published
  evidence, as a fact about the evidence, not a judgment of the people.

## Voices

* Assign voices by role, never by camp, so no view sounds “official” or “fringe”:
  * **Narrator:** the main storytelling voice (currently `af_heart`).
  * **Researchers:** a second voice for direct statements of positions and quotations of scholars (for example a
    British voice such as `bm_george` or `bf_emma`).
  * **Historical sources:** optionally a third voice for historical texts (Thomsen, Lubbock, early explorers).
* Try a few combinations on a short sample and let the user choose before rendering everything. British voices
  should use the `en-gb` phonemizer for ordinary text; lexicon IPA works for both.
* Show the speaker in the captions (a small label or colour per role).

## Watch mode (app design sketch)

* A “Watch” entry in the top bar and on the intro screen. Episode list: title, running time, regions, one-line
  summary, progress per episode (remembered in localStorage through `BB.store`).
* Player: full-screen globe (cinema layout), captions with speaker labels, a scrubber with scene markers and the
  current scene title, play and pause, previous and next scene, speed, and “explore here”, which pauses and opens
  the Explore panel at the current time and place.
* On-screen cards timed to the script: scene titles, site cards (name, date, what was found), key numbers, debate
  cards that show each view side by side, species cards from the family tree, migration routes drawn on the globe,
  and the timeline advancing with the story.
* Reuse Globe (flyTo, fitBox, setTime, setSites, setRoutes), Timeline and the recorded narrator engine; extend the
  narrator so one episode can be a sequence of scene audio files with cue timings.

## Script and audio format (proposal)

* `content/series/NN-id.json` per episode: metadata, then scenes. Each scene: id, title, time range, camera (a site
  id list or a focus box), and cues. Each cue: speaker role, text, and optional visuals (site ids to highlight,
  a card, a route, a time to move to). Sources per scene, with DOIs where they exist.
* Extend `tools/validate-content.mjs` and `tools/build-content.mjs` (same style rules as now: no em dashes,
  typographic quotes, narration free of brackets, symbols and abbreviations, years and numbers written so the voice
  reads them well).
* Render one MP3 per scene (keeps files small, allows re-rendering one scene, and stays under the preview’s
  per-file limit), plus a manifest with cue start and end times. Consider about 40 kbps mono for speech;
  six hours at that rate is about 110 MB.

## Claims to verify (web searches ran out during the first version)

These came from research agents or memory and could not be checked online at the end of the first version:

* A 2026 Science Advances study led by Scott Williams on a femoral tubercle in Sahelanthropus (chapter 01, species).
* A 2.6-million-year-old Paranthropus jaw from Ethiopia’s Afar region reported in 2026 (species.json).
* Hominin fossils from Thomas Quarry near Casablanca dated to about 773,000 years with the Matuyama–Brunhes
  reversal, reported in 2026 (methods.json).
* The November 2025 assignment of the Burtele foot to Australopithecus deyiremeda (species.json, chapter 02).
* The 2025 study led by Jesse Martin on Little Foot’s species (chapter 02, species.json).
* Pınarbaşı as the oldest genetically confirmed dog, about 15,800 years ago, reported 2026 (chapter 24).
* Any other 2025 and 2026 findings cited in the chapters; recheck them while writing the matching episode.

## State of work (2026-09-27, end of the second session)

* Done: the script format (`content/series/SCHEMA.md`), the validator and compiler (`tools/build-series.mjs`),
  the multi-voice renderer (`tools/narrate-series.py`), the Watch mode (`js/watch.js`, styles in `css/app.css`,
  wiring in `js/app.js` and `index.html`), voice audition clips, and a full draft of episode 1 (18 scenes, about
  6,200 words, about 42 minutes with pauses) with default voices af_heart (narrator), bm_george (research) and
  bf_emma (sources).
* Waiting for the user: choice of voices (the Watch page has an audition of 14 voices), and feedback on tone,
  pacing, card density and the handling of contested views in episode 1, before episodes 2 to 8 are written.
* Known limits: a debate card on a phone is tall and scrolls inside its box; the timeline keyframes of a scene run
  through cue `time` values, so a scene that jumps back and forth in time (the dating methods) should keep
  `start` equal to `end`; the `.venv/` directory was committed and then untracked in this branch, so the history
  of `claude/before-bronze-series` carries about 100 MB it does not need (a history rewrite needs the user’s consent).
* Facts in episode 1 that came from search snippets rather than the papers themselves and deserve a second look
  when the episode is finalised: the exact wording of the Prestwich quotation of 26 May 1859; the Muna Island hand
  stencil age of 67,800 years (from chapter 19); the Thackeray 2024 biochronological estimate for Little Foot;
  the reasons given in the PLOS One retractions of February 2026.

## Suggested order of work

1. Research and design the script format and the Watch mode; build a short sample (two or three minutes of
   episode 1 with two voices and cards) and show it to the user in the preview before writing everything.
2. Write the episodes one at a time with fresh research, validating as you go. Show the user episode 1 in full
   before continuing, so tone, pacing and the handling of contested views can be adjusted.
3. Render the audio, integrate, and test on desktop and phone.
4. Update README and the preview artifact; commit and push throughout.
