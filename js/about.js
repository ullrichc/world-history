/* Sources: about the project, dating methods, glossary, map notes, bibliography and credits. */
(function () {
  const BB = window.BB;
  const C = window.LD_CONTENT;
  let built = false;

  function build() {
    const root = document.getElementById('ov-about');
    const biblio = new Map();
    for (const c of C.chapters) for (const s of c.sources) {
      const key = s.cite.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 90);
      if (!biblio.has(key)) biblio.set(key, s);
    }
    const refs = [...biblio.values()].sort((a, b) => a.cite.localeCompare(b.cite));
    const voice = (window.LD_NARRATION_META && window.LD_NARRATION_META.voice) || 'af_heart';
    root.innerHTML = `
      <div class="overlay-bar"><h2>Sources and methods</h2>
        <button class="chip-btn close" id="about-close">${BB.icons.close}<span>Back to the globe</span></button></div>
      <div class="overlay-body"><div class="about">
        <section>
          <h3>About this history</h3>
          <p>Before Bronze tells the story of the Stone Age on every continent, from the first known stone tools, made about 3.3 million years ago, to the arrival of bronze, which happened at very different times in different places and never happened at all in some. It is written for curious readers who want the evidence, the dates and the arguments, not a tidy myth. Each chapter has a narrated summary, a long-form text, a set of debates that lays out competing interpretations, the key sites with coordinates, and the references behind it.</p>
          <p><strong>Journey</strong> plays the chapters in order: the globe flies to each region and the timeline runs through the chapter’s span while the narrator speaks. <strong>Explore</strong> lets you drag through time yourself and filter sites by continent and type of evidence. <strong>Chapters</strong> is the full text. <strong>Family tree</strong> shows which hominin species lived when.</p>
          <p>Conventions: dates older than about 12,000 years are given in years ago; younger ones as BCE, with “years ago” counted from 2000 CE. Sea level, ice sheets and the exposed continental shelves on the map change with the time you are looking at. The text reflects published research as of 2026. Archaeology moves quickly, and several dates in this history are actively disputed; the debates sections say where.</p>
        </section>
        <section>
          <h3>The narrator</h3>
          <p>The narration you hear is a synthetic voice, not a recording of a person. It was produced for every chapter with Kokoro, an open-weight neural text-to-speech model (voice “${BB.esc(voice)}”), and each sentence is time-stamped so the captions follow the audio. You can switch to your browser’s own voices or to silent captions in the settings.</p>
          <p>The app is built so a human narrator can replace the synthetic voice: record each chapter’s script (the narration text in <code>content/chapters</code>), save it as <code>audio/&lt;chapter-id&gt;.mp3</code>, and regenerate the sentence timings. The README explains the steps.</p>
        </section>
        <section>
          <h3>How we know: dating and analysis</h3>
          <div class="methods">${(C.methods || []).map((m) => `
            <div class="method"><h4>${BB.esc(m.name)}</h4><div class="range">${BB.esc(m.range)}</div>
            <p>${BB.esc(m.how)}</p><p>${BB.esc(m.strengths)}</p><p class="cav">${BB.esc(m.caveats)}</p><p class="cav"><em>${BB.esc(m.example)}</em></p></div>`).join('')}</div>
        </section>
        <section>
          <h3>Glossary</h3>
          <div class="search glossary-search">${BB.icons.search}<label class="sr-only" for="gq">Filter the glossary</label><input id="gq" type="search" placeholder="Filter ${(C.glossary || []).length} terms"></div>
          <dl class="glossary" id="glossary">${(C.glossary || []).map((g) => `<div data-k="${BB.esc((g.term + ' ' + g.definition).toLowerCase())}"><dt>${BB.esc(g.term)}</dt><dd>${BB.esc(g.definition)}</dd></div>`).join('')}</dl>
        </section>
        <section>
          <h3>About the map</h3>
          <p>Coastlines, lakes and rivers come from Natural Earth. The pale band that appears around the continents when sea level falls is the continental shelf shallower than 200 metres, a simple stand-in for land exposed during glacial periods, when the sea stood up to about 130 metres lower than today. The ice sheets are hand-traced approximations of their greatest extent around 26,000 to 19,000 years ago, drawn from published reconstructions; they fade in and out with global ice volume. Real ice sheets grew and shrank unevenly, so treat them as an illustration.</p>
          <p>The climate strip on the timeline is an estimated global sea-level curve. For the last 35,000 years it follows reconstructions by Kurt Lambeck and colleagues (2014). Before that it is scaled from the LR04 stack of 57 deep-sea oxygen-isotope records (Lisiecki and Raymo 2005), which mixes ice volume with deep-water temperature, so the older values are rough. Site coordinates are rounded and some are approximate.</p>
        </section>
        <section>
          <h3>Bibliography</h3>
          <p>${refs.length} works cited across the chapters.</p>
          <ol class="biblio">${refs.map((s) => `<li>${BB.esc(s.cite)}${s.doi ? ` <a href="https://doi.org/${BB.esc(s.doi)}" target="_blank" rel="noopener">doi:${BB.esc(s.doi)}</a>` : ''}</li>`).join('')}</ol>
        </section>
        <section>
          <h3>Credits</h3>
          <ul class="credits">
            <li>Text researched and written with Claude (Anthropic), from the published literature listed above.</li>
            <li>Narration: Kokoro-82M by hexgrad (Apache 2.0), run with kokoro-onnx.</li>
            <li>Map data: Natural Earth (public domain), via world-atlas and the natural-earth-vector repository.</li>
            <li>Climate data: LR04 benthic stack, Lisiecki and Raymo (2005), Paleoceanography 20, PA1003.</li>
            <li>Code libraries: D3 (ISC licence) and TopoJSON client (ISC licence) by Mike Bostock and contributors.</li>
            <li>Type: Fraunces by Undercase Type, Literata by TypeTogether, IBM Plex Mono by IBM, all under the SIL Open Font License.</li>
          </ul>
        </section>
      </div></div>`;
    root.querySelector('#about-close').addEventListener('click', () => BB.closeOverlay());
    root.querySelector('#gq').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      root.querySelectorAll('#glossary > div').forEach((d) => { d.hidden = q && !d.dataset.k.includes(q); });
    });
    built = true;
  }

  BB.About = { open() { if (!built) build(); } };
})();
