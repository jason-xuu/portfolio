/* =====================================================================
   app.js — boot the portfolio, wire the UI to the browser engine.
   Owns: boot sequence, chromosome tabs, locus panel, search, list view,
   keyboard shortcuts, motion + view toggles, footer.
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = { model: null, browser: null, motion: !prefersReduced };

  const ICONS = { gradcap: "ic-gradcap", flask: "ic-flask", folder: "ic-folder",
    dna: "ic-dna", book: "ic-book", mail: "ic-mail" };
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="sprites.svg#${ICONS[name] || "ic-gene"}"/></svg>`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ----------------------------- boot ------------------------------ */
  async function boot() {
    const bootEl = $("#boot"), log = $("#bootLog");
    let model;
    try {
      model = await GenomeData.load();
    } catch (err) {
      bootEl.classList.remove("boot--done");
      log.innerHTML = `<span class="cell__status err">boot error:</span>\n${esc(err.message)}\n\nIf you opened this as a file://, run a local server:\n  python3 -m http.server`;
      return;
    }
    state.model = model;

    hydrateStatic(model);
    buildChromTabs(model);
    buildListView(model);

    state.browser = new GenomeBrowser({
      model,
      motion: state.motion,
      onSelect: openLocus,
      onView: syncTabs,
    });

    wireControls();
    wireSearch(model);
    wireKeyboard();
    if (window.Ambient) Ambient.setEnabled(state.motion);

    // boot animation, then reveal
    const lines = [
      "> loading genome  jason_xu.gff3",
      `> parsed ${model.allGenes.length} features across ${model.chromosomes.length} chromosomes`,
      "> rendering ideogram + tracks",
      "> ready — welcome to the genome.",
    ];
    if (prefersReduced) { bootEl.classList.add("boot--done"); setTimeout(() => bootEl.remove(), 400); return; }
    typeLines(log, lines, () => {
      bootEl.classList.add("boot--done");
      setTimeout(() => bootEl.remove(), 700);
    });
  }

  function typeLines(el, lines, done) {
    let li = 0, ci = 0, acc = "";
    const tick = () => {
      if (li >= lines.length) { el.innerHTML = esc(acc); done(); return; }
      const line = lines[li];
      if (ci <= line.length) {
        el.innerHTML = esc(acc + line.slice(0, ci)) + '<span class="boot__cursor">▋</span>';
        ci++; setTimeout(tick, 14);
      } else { acc += line + "\n"; li++; ci = 0; setTimeout(tick, 130); }
    };
    tick();
  }

  /* ------------------------- static copy --------------------------- */
  function hydrateStatic(model) {
    const p = model.profile;
    $("#brandName").textContent = (p.name || "").toUpperCase();
    $("#brandTagline").textContent = p.tagline || "";
    $("#resumeLink").href = p.resume || "assets/resume.pdf";
    document.title = `${p.name} — Genome Browser Portfolio`;
    $("#footText").textContent = `${p.name} · ${p.location || ""}`.trim();
    $("#footLinks").innerHTML = [
      p.email ? `<a href="mailto:${esc(p.email)}">email</a>` : "",
      p.github ? `<a href="${esc(p.github)}" target="_blank" rel="noopener">github</a>` : "",
      p.linkedin ? `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">linkedin</a>` : "",
    ].filter(Boolean).join("");
  }

  /* ------------------------ chromosome tabs ------------------------ */
  function buildChromTabs(model) {
    const wrap = $("#chromTabs");
    wrap.innerHTML = "";
    model.chromosomes.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "chrom-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.style.setProperty("--tab-accent", GenomeData.cssColor(c.accentVar));
      b.innerHTML = `${icon(c.icon)}<span><span class="chrom-tab__id">${esc(c.id)}</span> ${esc(c.label)}</span>`;
      b.addEventListener("click", () => state.browser.setChromosome(i));
      wrap.appendChild(b);
    });
  }
  function syncTabs(browser) {
    document.querySelectorAll(".chrom-tab").forEach((t, i) =>
      t.setAttribute("aria-selected", i === browser.chromIndex ? "true" : "false"));
  }

  /* --------------------------- locus panel ------------------------- */
  function openLocus(gene) {
    const panel = $("#locus"), body = $("#locusBody");
    const c = gene.content;
    const accent = GenomeData.cssColor(gene.accentVar);
    panel.style.setProperty("--locus-accent", accent);

    if (!c) {
      body.innerHTML = `<div class="locus__title">${esc(gene.name)}</div>
        <p class="locus__summary">No detail recorded for <code>${esc(gene.id)}</code>.</p>`;
      panel.hidden = false; return;
    }
    const tags = (c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const links = (c.links || []).filter((l) => l.url && l.url !== "#")
      .map((l) => `<a class="btn btn--ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("");

    body.innerHTML = `
      <div class="locus__eyebrow">${esc(gene.chrom)} · ${esc(gene.chromLabel || "")} · locus ${gene.start}–${gene.end}</div>
      <h2 class="locus__title">${esc(c.title)}</h2>
      ${c.subtitle ? `<div class="locus__sub">${esc(c.subtitle)}</div>` : ""}
      ${c.dates ? `<div class="locus__dates">${esc(c.dates)}</div>` : ""}
      ${c.summary ? `<p class="locus__summary">${esc(c.summary)}</p>` : ""}
      ${tags ? `<div class="locus__tags">${tags}</div>` : ""}
      ${links ? `<div class="locus__links">${links}</div>` : ""}
      <div class="locus__cell"></div>`;

    panel.hidden = false;
    if (c.runnable && c.runnable.src) {
      PyCells.attach(body.querySelector(".locus__cell"), c.runnable);
    }
    // bring panel into view without yanking on keyboard users
    if (state.motion) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function closeLocus() { $("#locus").hidden = true; }

  /* ----------------------------- search ---------------------------- */
  function wireSearch(model) {
    const input = $("#search"), list = $("#searchResults");
    let sel = -1, results = [];

    function score(g, q) {
      const c = g.content || {};
      const hay = [c.title, c.subtitle, c.summary, (c.tags || []).join(" "), g.chromLabel, g.name]
        .filter(Boolean).join(" ").toLowerCase();
      const i = hay.indexOf(q);
      if (i === -1) return -1;
      // prefer title matches and earlier positions
      const titleHit = (c.title || g.name).toLowerCase().includes(q) ? 1000 : 0;
      return titleHit + (500 - Math.min(500, i));
    }
    function render() {
      list.innerHTML = results.map((g, i) => {
        const c = g.content || {};
        const accent = GenomeData.cssColor(g.accentVar);
        return `<li role="option" data-i="${i}" aria-selected="${i === sel}">
          <span class="r__chr" style="background:${accent}">${esc(g.chrom)}</span>
          <span class="r__title">${esc(c.title || g.name)}</span>
          <span class="r__sub">${esc(g.chromLabel || "")}</span></li>`;
      }).join("");
      list.hidden = results.length === 0;
    }
    function commit(i) {
      const g = results[i]; if (!g) return;
      input.value = ""; list.hidden = true; sel = -1; results = [];
      setView("browser");
      state.browser.goToGene(g);
    }

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results = []; list.hidden = true; return; }
      results = model.allGenes.map((g) => ({ g, s: score(g, q) }))
        .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.g);
      sel = results.length ? 0 : -1; render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === "Enter") { e.preventDefault(); commit(sel); }
      else if (e.key === "Escape") { input.value = ""; results = []; list.hidden = true; input.blur(); }
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li"); if (li) { e.preventDefault(); commit(+li.dataset.i); }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".topbar__search")) list.hidden = true;
    });
  }

  /* --------------------------- list view --------------------------- */
  function buildListView(model) {
    const inner = $("#listInner"), p = model.profile;
    let html = `<div class="profile-head">
        <h1>${esc(p.name)}</h1>
        <p>${esc(p.tagline)}</p>
        <p>${esc(p.blurb || "")}</p>
        <p>${[p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`,
             p.github && `<a href="${esc(p.github)}" target="_blank" rel="noopener">GitHub</a>`,
             p.linkedin && `<a href="${esc(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
             `<a href="${esc(p.resume)}" target="_blank" rel="noopener">Résumé (PDF)</a>`]
            .filter(Boolean).join(" · ")}</p>
      </div>`;

    model.chromosomes.forEach((c) => {
      const accent = GenomeData.cssColor(c.accentVar);
      html += `<section class="list-sec" style="--sec-accent:${accent}">
        <h2 class="list-sec__h">${icon(c.icon)} ${esc(c.label)}
          <span class="chip">${esc(c.id)}</span></h2>`;
      c.genes.forEach((g) => {
        const d = g.content || { title: g.name };
        const tags = (d.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
        const links = (d.links || []).filter((l) => l.url && l.url !== "#")
          .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(" · ");
        html += `<article class="list-card" id="list-${esc(g.id)}">
          <h3>${esc(d.title || g.name)}</h3>
          ${d.subtitle ? `<div class="lc__sub">${esc(d.subtitle)}</div>` : ""}
          ${d.dates ? `<div class="lc__dates">${esc(d.dates)}</div>` : ""}
          ${d.summary ? `<p>${esc(d.summary)}</p>` : ""}
          ${tags ? `<div class="locus__tags">${tags}</div>` : ""}
          ${links ? `<p>${links}</p>` : ""}
          ${d.runnable ? `<p class="lc__sub">▸ interactive demo available in browser view</p>` : ""}
        </article>`;
      });
      html += `</section>`;
    });
    inner.innerHTML = html;
  }

  /* -------------------------- view + motion ------------------------ */
  function setView(view) {
    document.body.dataset.view = view;
    const t = $("#viewToggle");
    t.setAttribute("aria-pressed", view === "list" ? "true" : "false");
    t.textContent = view === "list" ? "Browser view" : "List view";
    if (view === "browser" && state.browser) { state.browser.resize(); state.browser.renderAll(); }
  }

  function wireControls() {
    $("#viewToggle").addEventListener("click", () =>
      setView(document.body.dataset.view === "list" ? "browser" : "list"));

    const mt = $("#motionToggle");
    mt.addEventListener("click", () => {
      state.motion = !state.motion;
      state.browser.setMotion(state.motion);
      if (window.Ambient) Ambient.setEnabled(state.motion);
      mt.textContent = "Motion: " + (state.motion ? "on" : "off");
      mt.setAttribute("aria-pressed", String(state.motion));
    });
    if (prefersReduced) {
      state.motion = false;
      mt.textContent = "Motion: off"; mt.setAttribute("aria-pressed", "false");
    }

    $("#zoomIn").addEventListener("click", () => state.browser.zoomBy(0.6));
    $("#zoomOut").addEventListener("click", () => state.browser.zoomBy(1.7));
    $("#resetView").addEventListener("click", () => {
      const c = state.browser.chrom(); state.browser.tweenTo(0, c.length);
    });
    $("#prevGene").addEventListener("click", () => state.browser.stepGene(-1));
    $("#nextGene").addEventListener("click", () => state.browser.stepGene(1));
    $("#locusClose").addEventListener("click", closeLocus);
    $("#keyhelpClose").addEventListener("click", () => { $("#keyhelp").hidden = true; });
  }

  /* --------------------------- keyboard ---------------------------- */
  function wireKeyboard() {
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); $("#search").focus(); return; }
      if (typing) return;
      const b = state.browser; if (!b) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); b.panByFraction(-0.18); break;
        case "ArrowRight": e.preventDefault(); b.panByFraction(0.18); break;
        case "+": case "=": b.zoomBy(0.6); break;
        case "-": case "_": b.zoomBy(1.7); break;
        case "0": { const c = b.chrom(); b.tweenTo(0, c.length); break; }
        case "j": b.stepGene(-1); break;
        case "k": b.stepGene(1); break;
        case "[": b.setChromosome(b.chromIndex - 1); break;
        case "]": b.setChromosome(b.chromIndex + 1); break;
        case "l": case "L": setView(document.body.dataset.view === "list" ? "browser" : "list"); break;
        case "?": $("#keyhelp").hidden = !$("#keyhelp").hidden; break;
        case "Escape":
          if (!$("#keyhelp").hidden) $("#keyhelp").hidden = true;
          else closeLocus();
          break;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
