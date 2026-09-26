/* Reader: every chapter as a long-form article with debates, sites and sources. */
(function () {
  const BB = window.BB;
  const C = window.LD_CONTENT;
  const chapters = C.chapters;
  const siteById = new Map(C.sites.map((s) => [s.id, s]));
  const acts = new Map(C.acts.map((a) => [a.id, a]));
  const VIEW_COLORS = ['var(--yellow-ochre)', 'var(--cat-monument)', 'var(--cat-burial)', 'var(--lichen)'];
  let built = false;
  let root, toc, article, body;

  function build() {
    root = document.getElementById('ov-read');
    root.innerHTML = `
      <div class="overlay-bar"><h2>Chapters</h2><span class="label">${chapters.length} chapters · ${C.sites.length} sites · ${C.stats.sources} references</span>
        <button class="chip-btn close" id="read-close">${BB.icons.close}<span>Back to the globe</span></button></div>
      <div class="overlay-body" id="read-body"><div class="reader"><nav class="toc" aria-label="Table of contents"></nav><article class="article"></article></div></div>`;
    toc = root.querySelector('.toc');
    article = root.querySelector('.article');
    body = root.querySelector('#read-body');
    let html = '';
    let lastAct = null;
    chapters.forEach((c, i) => {
      if (c.act !== lastAct) {
        if (lastAct) html += '</ol>';
        const a = acts.get(c.act);
        html += `<h3 class="label">${BB.esc(a.label)} · ${BB.esc(a.title)}</h3><ol>`;
        lastAct = c.act;
      }
      html += `<li><a href="#${c.id}" data-ch="${c.id}"><span>${String(i).padStart(2, '0')}</span>${BB.esc(c.title)}</a></li>`;
    });
    toc.innerHTML = html + '</ol>';
    toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.ch); }));
    root.querySelector('#read-close').addEventListener('click', () => BB.closeOverlay());
    built = true;
  }

  function show(arg) {
    const [id, anchor] = String(arg || chapters[0].id).split('--');
    const i = Math.max(0, chapters.findIndex((c) => c.id === id));
    const c = chapters[i];
    const act = acts.get(c.act);
    toc.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.ch === c.id)));
    const prev = chapters[i - 1], next = chapters[i + 1];
    const sites = c.siteIds.map((s) => siteById.get(s)).filter(Boolean);
    article.innerHTML = `
      <header>
        <div class="chapter-kicker label"><span class="act">${BB.esc(act.label)}</span><span>${BB.esc(act.title)}</span>${i > 0 && i < chapters.length - 1 ? `<span>Chapter ${i} of ${chapters.length - 2}</span>` : ''}</div>
        <h1 class="chapter-title">${BB.esc(c.title)}</h1>
        <p class="chapter-sub">${BB.esc(c.subtitle)}</p>
        <div class="chapter-meta"><span class="date">${BB.esc(c.dateLabel)}</span><span>${BB.esc(c.era)}</span><span>${c.regions.map((r) => BB.REGIONS[r]).join(', ')}</span></div>
      </header>
      <div class="lede">${c.paragraphs.map((p) => `<p>${BB.esc(p.join(' '))}</p>`).join('')}</div>
      <div class="actions">
        <button class="btn primary" data-play>${BB.icons.play}Play this chapter</button>
        <button class="btn" data-globe>${BB.icons.globe}Show on the globe</button>
      </div>
      ${c.body.map((s) => `<section><h4>${BB.esc(s.heading)}</h4>${s.paragraphs.map((p) => `<p>${BB.esc(p)}</p>`).join('')}</section>`).join('')}
      <div class="block-label label" id="debates-${c.id}">Interpretations and debates</div>
      ${c.debates.map((d) => `
        <div class="debate">
          <h5>${BB.esc(d.question)}</h5>
          <div class="views">${d.views.map((v, k) => `<div class="view" style="--vc:${VIEW_COLORS[k % VIEW_COLORS.length]}"><b>${BB.esc(v.label)}</b><p>${BB.esc(v.text)}</p></div>`).join('')}</div>
          <p class="status"><b>Where it stands</b>${BB.esc(d.status)}</p>
        </div>`).join('')}
      <div class="block-label label">Key facts</div>
      <dl class="facts" style="max-width:66ch">${c.keyFacts.map((k) => `<div><dt>${BB.esc(k.label)}</dt><dd>${BB.esc(k.value)}</dd></div>`).join('')}</dl>
      <div class="block-label label">Sites in this chapter</div>
      <div style="overflow-x:auto"><table class="site-table"><tbody>
        ${sites.map((s) => `<tr><td><button data-site="${s.id}">${BB.esc(s.name)}</button><small>${BB.esc(s.dateLabel || BB.formatAge(s.start))}</small><span class="c">${BB.esc(s.country)}</span></td><td>${BB.esc(s.summary)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="block-label label">Sources</div>
      <ol class="sources">${c.sources.map((s) => `<li>${BB.esc(s.cite)}${s.doi ? ` <a href="https://doi.org/${BB.esc(s.doi)}" target="_blank" rel="noopener">doi:${BB.esc(s.doi)}</a>` : ''}</li>`).join('')}</ol>
      <nav class="next-chapter">
        ${prev ? `<a href="#${prev.id}" data-ch="${prev.id}"><span class="label">Previous</span><b>${BB.esc(prev.title)}</b></a>` : '<span></span>'}
        ${next ? `<a href="#${next.id}" data-ch="${next.id}" style="text-align:right"><span class="label">Next</span><b>${BB.esc(next.title)}</b></a>` : ''}
      </nav>`;
    article.querySelector('[data-play]').addEventListener('click', () => { BB.goToChapter(i, { autoplay: true }); });
    article.querySelector('[data-globe]').addEventListener('click', () => { BB.goToChapter(i, { autoplay: false }); });
    article.querySelectorAll('[data-site]').forEach((b) => b.addEventListener('click', () => BB.showSite(b.dataset.site)));
    article.querySelectorAll('.next-chapter [data-ch]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.ch); }));
    if (anchor === 'debates') {
      requestAnimationFrame(() => document.getElementById(`debates-${c.id}`).scrollIntoView({ block: 'start' }));
    } else body.scrollTop = 0;
    const cur = toc.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    try { history.replaceState(null, '', `#${c.id}`); } catch (e) { /* sandboxed */ }
  }

  BB.Reader = {
    open(arg) { if (!built) build(); show(arg); },
  };
})();
