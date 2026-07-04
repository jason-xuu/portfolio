/* =====================================================================
   browser.js — the canvas genome browser.
   Renders an ideogram, coordinate ruler, reference-sequence strip, and
   a gene feature track for one chromosome at a time. Smooth eased
   zoom/pan via requestAnimationFrame; gene search animates to a locus.
   All motion is gated on `motion` (prefers-reduced-motion + toggle).
   ===================================================================== */
window.GenomeBrowser = (function () {
  "use strict";

  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const STAIN = {
    gneg: "--gie-gneg", gpos25: "--gie-gpos25", gpos50: "--gie-gpos50",
    gpos75: "--gie-gpos75", gpos100: "--gie-gpos100", acen: "--gie-acen",
  };
  const BASES = ["A", "C", "G", "T"];
  const BASE_COLOR = { A: "#4ee36b", C: "#6ad0ff", G: "#ffb347", T: "#ff6b8b" };

  // deterministic base for a position so the sequence strip is stable
  function baseAt(chromId, pos) {
    let h = 2166136261 ^ pos;
    for (let i = 0; i < chromId.length; i++) { h ^= chromId.charCodeAt(i); h = Math.imul(h, 16777619); }
    return BASES[(h >>> 0) % 4];
  }

  function GenomeBrowser(opts) {
    this.model = opts.model;
    this.motion = opts.motion !== false;
    this.onSelect = opts.onSelect || function () {};
    this.onView = opts.onView || function () {};

    this.els = {
      ideogram: document.getElementById("ideogram"),
      ruler: document.getElementById("ruler"),
      seq: document.getElementById("seqstrip"),
      tracks: document.getElementById("tracks"),
      hud: document.getElementById("hud"),
      tooltip: document.getElementById("tooltip"),
      readout: document.getElementById("locusReadout"),
    };

    this.chromIndex = 0;
    this.view = { start: 0, end: 1 };     // current (animated) bp window
    this.target = { start: 0, end: 1 };   // tween destination
    this.anim = null;
    this.selectedId = null;
    this.playhead = null;                 // animated bp x of selection
    this.playheadTarget = null;
    this.hoverGene = null;
    this.cursorBp = null;
    this.lanes = [];                      // per-render gene lane cache

    this._bind();
    this.resize();
    this.setChromosome(0, true);
    window.addEventListener("resize", () => { this.resize(); this.renderAll(); });
  }

  GenomeBrowser.prototype.chrom = function () { return this.model.chromosomes[this.chromIndex]; };

  /* ---------------- canvas sizing (crisp on HiDPI) ------------------ */
  GenomeBrowser.prototype._fit = function (canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };
  GenomeBrowser.prototype.resize = function () {
    this._ideo = this._fit(this.els.ideogram);
    this._rule = this._fit(this.els.ruler);
    this._seq = this._fit(this.els.seq);
    this._trk = this._fit(this.els.tracks);
  };

  /* --------------------- coordinate helpers ------------------------ */
  GenomeBrowser.prototype.span = function () { return this.view.end - this.view.start; };
  GenomeBrowser.prototype.bpToX = function (bp, w) {
    return ((bp - this.view.start) / this.span()) * w;
  };
  GenomeBrowser.prototype.xToBp = function (x, w) {
    return this.view.start + (x / w) * this.span();
  };

  /* ------------------------- navigation ---------------------------- */
  GenomeBrowser.prototype.setChromosome = function (i, instant) {
    this.chromIndex = clamp(i, 0, this.model.chromosomes.length - 1);
    const c = this.chrom();
    document.documentElement.style.setProperty(
      "--view-accent", GenomeData.cssColor(c.accentVar));
    this.selectedId = null;
    this.playhead = this.playheadTarget = null;
    this.tweenTo(0, c.length, instant);
    this.onView(this);
  };

  GenomeBrowser.prototype.tweenTo = function (start, end, instant) {
    const c = this.chrom();
    // keep a sane minimum window and clamp inside the chromosome
    const minSpan = 60;
    let s = start, e = end;
    if (e - s < minSpan) { const m = (s + e) / 2; s = m - minSpan / 2; e = m + minSpan / 2; }
    s = clamp(s, 0, c.length - minSpan);
    e = clamp(e, s + minSpan, c.length);
    this.target = { start: s, end: e };

    if (instant || !this.motion) {
      this.view = { start: s, end: e };
      this._afterView();
      this.renderAll();
      return;
    }
    const from = { start: this.view.start, end: this.view.end };
    const dur = 520, t0 = performance.now();
    if (this.anim) cancelAnimationFrame(this.anim);
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1), k = easeOutQuint(t);
      this.view.start = lerp(from.start, s, k);
      this.view.end = lerp(from.end, e, k);
      this._tickPlayhead(k);
      this.renderAll();
      if (t < 1) this.anim = requestAnimationFrame(step);
      else { this.anim = null; this._afterView(); }
    };
    this.anim = requestAnimationFrame(step);
  };

  GenomeBrowser.prototype._afterView = function () { this.onView(this); };

  GenomeBrowser.prototype.zoomBy = function (factor, anchorBp) {
    const s = this.target.start, e = this.target.end;
    const a = anchorBp == null ? (s + e) / 2 : anchorBp;
    const ns = a - (a - s) * factor, ne = a + (e - a) * factor;
    this.tweenTo(ns, ne);
  };
  GenomeBrowser.prototype.panByFraction = function (frac) {
    const d = this.span() * frac;
    this.tweenTo(this.target.start + d, this.target.end + d);
  };

  GenomeBrowser.prototype.goToGene = function (gene, instant) {
    if (gene.chrom !== this.chrom().id) {
      const idx = this.model.chromosomes.findIndex((c) => c.id === gene.chrom);
      if (idx > -1) this.chromIndex = idx;
      const c = this.chrom();
      document.documentElement.style.setProperty("--view-accent", GenomeData.cssColor(c.accentVar));
    }
    const pad = Math.max((gene.end - gene.start) * 1.4, 300);
    this.select(gene.id, true);
    this.tweenTo(gene.start - pad, gene.end + pad, instant);
  };

  GenomeBrowser.prototype.select = function (id, silent) {
    this.selectedId = id;
    const g = this.chrom().genes.find((x) => x.id === id) ||
              this.model.allGenes.find((x) => x.id === id);
    if (g) {
      this.playheadTarget = g.mid;
      if (this.playhead == null) this.playhead = g.mid;
      if (!silent) this.onSelect(g);
      else this.onSelect(g);
    }
  };
  GenomeBrowser.prototype._tickPlayhead = function (k) {
    if (this.playheadTarget != null && this.playhead != null)
      this.playhead = lerp(this.playhead, this.playheadTarget, this.motion ? Math.min(1, k + 0.15) : 1);
  };

  GenomeBrowser.prototype.currentGenes = function () { return this.chrom().genes; };
  GenomeBrowser.prototype.stepGene = function (dir) {
    const genes = this.currentGenes();
    if (!genes.length) return;
    let i = genes.findIndex((g) => g.id === this.selectedId);
    i = i === -1 ? (dir > 0 ? 0 : genes.length - 1) : clamp(i + dir, 0, genes.length - 1);
    this.goToGene(genes[i]);
  };

  /* --------------------------- rendering --------------------------- */
  GenomeBrowser.prototype.renderAll = function () {
    this._drawIdeogram();
    this._drawRuler();
    this._drawSeq();
    this._drawTracks();
    this._updateReadout();
  };

  GenomeBrowser.prototype._drawIdeogram = function () {
    const { ctx, w, h } = this._ideo, c = this.chrom();
    ctx.clearRect(0, 0, w, h);
    const y = 14, bh = 20, pad = 6, iw = w - pad * 2;
    const toX = (bp) => pad + (bp / c.length) * iw;

    // band body
    c.bands.forEach((b) => {
      const x0 = toX(b.start), x1 = toX(b.end);
      ctx.fillStyle = GenomeData.cssColor(STAIN[b.stain] || "--gie-gpos50");
      if (b.stain === "acen") {
        ctx.beginPath();
        ctx.moveTo(x0, y); ctx.lineTo(x1, y + bh / 2); ctx.lineTo(x0, y + bh);
        ctx.lineTo(x1, y); ctx.lineTo(x0, y + bh / 2); ctx.lineTo(x1, y + bh);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(x0, y, Math.max(1, x1 - x0), bh);
      }
    });
    // outline
    ctx.strokeStyle = GenomeData.cssColor("--grid");
    ctx.lineWidth = 2; ctx.strokeRect(pad, y, iw, bh);

    // gene ticks
    ctx.fillStyle = GenomeData.cssColor(c.accentVar);
    c.genes.forEach((g) => {
      const x = toX(g.mid);
      ctx.globalAlpha = g.id === this.selectedId ? 1 : 0.6;
      ctx.fillRect(x - 1, y + bh + 3, 2, 6);
    });
    ctx.globalAlpha = 1;

    // current viewport rectangle
    const vx0 = toX(this.view.start), vx1 = toX(this.view.end);
    ctx.fillStyle = "rgba(78,227,107,0.16)";
    ctx.fillRect(vx0, y - 4, Math.max(3, vx1 - vx0), bh + 8);
    ctx.strokeStyle = GenomeData.cssColor("--accent");
    ctx.lineWidth = 2; ctx.strokeRect(vx0, y - 4, Math.max(3, vx1 - vx0), bh + 8);

    // label
    ctx.fillStyle = GenomeData.cssColor("--muted");
    ctx.font = "10px 'DM Mono', monospace";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${c.id}  ${c.label}`, pad, 10);
    ctx.textAlign = "right";
    ctx.fillText(`${fmtBp(c.length)}`, w - pad, 10);
    ctx.textAlign = "left";
  };

  GenomeBrowser.prototype._drawRuler = function () {
    const { ctx, w, h } = this._rule;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = GenomeData.cssColor("--grid");
    ctx.fillStyle = GenomeData.cssColor("--muted");
    ctx.font = "10px 'DM Mono', monospace";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();

    const span = this.span();
    const step = niceStep(span, w);
    const first = Math.ceil(this.view.start / step) * step;
    ctx.beginPath();
    for (let bp = first; bp <= this.view.end; bp += step) {
      const x = this.bpToX(bp, w);
      ctx.moveTo(x + 0.5, h); ctx.lineTo(x + 0.5, h - 8);
      ctx.fillText(fmtBp(bp), x + 3, h - 11);
    }
    ctx.stroke();

    // cursor tick
    if (this.cursorBp != null) {
      const x = this.bpToX(this.cursorBp, w);
      ctx.strokeStyle = GenomeData.cssColor("--accent-amber");
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
  };

  GenomeBrowser.prototype._drawSeq = function () {
    const { ctx, w, h } = this._seq, c = this.chrom();
    ctx.clearRect(0, 0, w, h);
    const span = this.span(), bpPerPx = span / w;
    const on = bpPerPx <= 0.7;          // ~ show when a base is >= ~1.4px wide
    this.els.seq.classList.toggle("is-on", on);
    if (!on) return;
    ctx.font = "bold 12px 'DM Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const s = Math.floor(this.view.start), e = Math.ceil(this.view.end);
    for (let bp = s; bp <= e; bp++) {
      const x = this.bpToX(bp + 0.5, w);
      if (x < -6 || x > w + 6) continue;
      const b = baseAt(c.id, bp);
      ctx.fillStyle = BASE_COLOR[b];
      ctx.fillText(b, x, h / 2);
    }
    ctx.textAlign = "left";
  };

  GenomeBrowser.prototype._layoutLanes = function (w) {
    // greedy lane packing on pixel extents (box + label)
    const c = this.chrom(), ctx = this._trk.ctx;
    ctx.font = "11px 'DM Mono', monospace";
    const laneEnds = [];
    const placed = [];
    c.genes.forEach((g) => {
      const x0 = this.bpToX(g.start, w);
      const x1 = this.bpToX(g.end, w);
      const label = (g.content && g.content.title) || g.name;
      const labelW = ctx.measureText(label).width + 14;
      const left = Math.min(x0, x0);          // box left
      const right = Math.max(x1, x0 + labelW); // whichever extends further
      if (right < -40 || left > w + 40) return; // offscreen — skip
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > left - 8) lane++;
      laneEnds[lane] = right;
      placed.push({ g, x0, x1, lane, label, labelW });
    });
    this.laneCount = Math.max(1, laneEnds.length);
    return placed;
  };

  GenomeBrowser.prototype._drawTracks = function () {
    const { ctx, w, h } = this._trk, c = this.chrom();
    ctx.clearRect(0, 0, w, h);

    const placed = this._layoutLanes(w);
    const top = 24;
    const laneH = Math.min(64, (h - top - 16) / this.laneCount);
    const boxH = Math.min(30, laneH - 18);

    // playhead (under features)
    if (this.playhead != null) {
      const px = this.bpToX(this.playhead, w);
      if (px >= -2 && px <= w + 2) {
        ctx.strokeStyle = "rgba(78,227,107,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h); ctx.stroke();
        // pixel playhead cap
        ctx.fillStyle = GenomeData.cssColor("--accent");
        ctx.fillRect(px - 4, 0, 9, 5); ctx.fillRect(px - 2, 5, 5, 3);
      }
    }

    const accent = GenomeData.cssColor(c.accentVar);
    placed.forEach(({ g, x0, x1, lane, label }) => {
      const y = top + lane * laneH + (laneH - boxH) / 2;
      const bx = clamp(x0, -20, w + 20);
      const bw = Math.max(4, clamp(x1, -20, w + 20) - bx);
      const selected = g.id === this.selectedId;
      const hovered = this.hoverGene === g.id;

      // body
      ctx.fillStyle = accent;
      ctx.globalAlpha = selected ? 1 : hovered ? 0.92 : 0.8;
      ctx.fillRect(bx, y, bw, boxH);
      // top pixel highlight
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(bx, y, bw, 2);
      // bottom shade
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(bx, y + boxH - 2, bw, 2);

      // strand chevrons
      if (bw > 16) {
        ctx.fillStyle = "rgba(4,20,10,0.55)";
        const dir = g.strand;
        for (let cx = bx + 6; cx < bx + bw - 4; cx += 12) {
          ctx.beginPath();
          if (dir > 0) { ctx.moveTo(cx, y + 6); ctx.lineTo(cx + 5, y + boxH / 2); ctx.lineTo(cx, y + boxH - 6); }
          else { ctx.moveTo(cx + 5, y + 6); ctx.lineTo(cx, y + boxH / 2); ctx.lineTo(cx + 5, y + boxH - 6); }
          ctx.stroke();
        }
      }

      // selection / hover outline
      if (selected || hovered) {
        ctx.strokeStyle = selected ? GenomeData.cssColor("--ink") : accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 1, y - 1, bw + 2, boxH + 2);
      }
      if (selected) {
        ctx.shadowColor = accent; ctx.shadowBlur = 14;
        ctx.strokeRect(bx - 1, y - 1, bw + 2, boxH + 2);
        ctx.shadowBlur = 0;
      }

      // runnable badge
      if (g.runnable && bw > 10) {
        ctx.fillStyle = GenomeData.cssColor("--accent-amber");
        ctx.fillRect(bx + bw - 7, y + 3, 4, 4);
      }

      // label above box
      ctx.fillStyle = selected ? GenomeData.cssColor("--ink") : GenomeData.cssColor("--muted");
      ctx.font = "11px 'DM Mono', monospace";
      ctx.textBaseline = "alphabetic";
      const lx = clamp(bx, 2, w - 4);
      ctx.fillText(label, lx, y - 5);
    });

    // empty state
    if (!placed.length) {
      ctx.fillStyle = GenomeData.cssColor("--dim");
      ctx.font = "12px 'DM Mono', monospace";
      ctx.fillText("no features in view — press 0 to fit the chromosome", 12, h / 2);
    }
    this._placed = placed;
    this._geo = { top, laneH, boxH };
  };

  GenomeBrowser.prototype._updateReadout = function () {
    const c = this.chrom();
    this.els.readout.innerHTML =
      `<b>${c.id}</b> ${c.label} &nbsp;·&nbsp; ${fmtBp(Math.round(this.view.start))}–${fmtBp(Math.round(this.view.end))} bp` +
      (this.cursorBp != null ? ` &nbsp;·&nbsp; @${fmtBp(Math.round(this.cursorBp))}` : "");
  };

  /* ---------------------------- input ------------------------------ */
  GenomeBrowser.prototype._geneAt = function (px, py) {
    if (!this._placed) return null;
    const { top, laneH, boxH } = this._geo;
    for (const p of this._placed) {
      const y = top + p.lane * laneH + (laneH - boxH) / 2;
      const bx = clamp(p.x0, -20, this._trk.w + 20);
      const bw = Math.max(4, clamp(p.x1, -20, this._trk.w + 20) - bx);
      if (px >= bx - 3 && px <= bx + bw + 3 && py >= y - 14 && py <= y + boxH + 4) return p.g;
    }
    return null;
  };

  GenomeBrowser.prototype._bind = function () {
    const trk = this.els.tracks, ideo = this.els.ideogram;
    let dragging = false, lastX = 0, moved = 0;

    const localX = (e, el) => (e.clientX - el.getBoundingClientRect().left);
    const localY = (e, el) => (e.clientY - el.getBoundingClientRect().top);

    // ---- tracks: drag-pan, click-select, hover ----
    trk.addEventListener("pointerdown", (e) => {
      dragging = true; moved = 0; lastX = e.clientX;
      trk.classList.add("is-panning"); trk.setPointerCapture(e.pointerId);
    });
    trk.addEventListener("pointermove", (e) => {
      const w = this._trk.w;
      const x = localX(e, trk), y = localY(e, trk);
      this.cursorBp = this.xToBp(x, w);
      if (dragging) {
        const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
        const dbp = (dx / w) * this.span();
        this.view.start -= dbp; this.view.end -= dbp;
        this.target = { start: this.view.start, end: this.view.end };
        // clamp
        const c = this.chrom();
        if (this.view.start < 0) { const o = -this.view.start; this.view.start += o; this.view.end += o; }
        if (this.view.end > c.length) { const o = this.view.end - c.length; this.view.start -= o; this.view.end -= o; }
        this.target = { start: this.view.start, end: this.view.end };
        this.renderAll();
      } else {
        const g = this._geneAt(x, y);
        const id = g ? g.id : null;
        if (id !== this.hoverGene) {
          this.hoverGene = id;
          trk.style.cursor = g ? "pointer" : "grab";
          this._tooltip(g, x, y);
          this._drawTracks();
        } else if (g) { this._tooltip(g, x, y); }
      }
      this.els.hud.textContent = `${this.chrom().id}:${fmtBp(Math.round(this.cursorBp))}`;
      this.els.hud.setAttribute("aria-hidden", "false");
      this._drawRuler(); this._updateReadout();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false; trk.classList.remove("is-panning");
      trk.style.cursor = this.hoverGene ? "pointer" : "grab";
      if (moved < 5) {
        const g = this._geneAt(localX(e, trk), localY(e, trk));
        if (g) this.goToGene(g); // select + frame
      } else { this._afterView(); }
    };
    trk.addEventListener("pointerup", endDrag);
    trk.addEventListener("pointercancel", () => { dragging = false; trk.classList.remove("is-panning"); });
    trk.addEventListener("pointerleave", () => {
      this.cursorBp = null; this.hoverGene = null;
      this.els.tooltip.hidden = true; this.els.hud.setAttribute("aria-hidden", "true");
      this._drawRuler(); this._drawTracks(); this._updateReadout();
    });

    // wheel zoom (anchored at cursor)
    trk.addEventListener("wheel", (e) => {
      e.preventDefault();
      const w = this._trk.w, x = localX(e, trk);
      const anchor = this.xToBp(x, w);
      this.zoomBy(e.deltaY > 0 ? 1.18 : 0.85, anchor);
    }, { passive: false });

    // ---- ideogram: click / drag to navigate ----
    let ideoDrag = false;
    const ideoNav = (e) => {
      const c = this.chrom(), pad = 6, iw = this._ideo.w - pad * 2;
      const x = clamp(localX(e, ideo) - pad, 0, iw);
      const centerBp = (x / iw) * c.length;
      const half = this.span() / 2;
      this.tweenTo(centerBp - half, centerBp + half, ideoDrag);
    };
    ideo.addEventListener("pointerdown", (e) => { ideoDrag = true; ideo.setPointerCapture(e.pointerId); ideoNav(e); });
    ideo.addEventListener("pointermove", (e) => { if (ideoDrag) ideoNav(e); });
    ideo.addEventListener("pointerup", () => { ideoDrag = false; });
  };

  GenomeBrowser.prototype._tooltip = function (g, x, y) {
    const tip = this.els.tooltip;
    if (!g) { tip.hidden = true; return; }
    const title = (g.content && g.content.title) || g.name;
    const sub = (g.content && g.content.subtitle) || g.chromLabel || "";
    tip.innerHTML = `<span class="tooltip__t">${esc(title)}</span><span class="tooltip__s">${esc(sub)}${g.runnable ? " · runnable ▸" : ""}</span>`;
    tip.style.left = clamp(x, 60, this._trk.w - 60) + "px";
    tip.style.top = Math.max(28, y) + "px";
    tip.hidden = false;
  };

  GenomeBrowser.prototype.setMotion = function (on) { this.motion = on; };

  /* ------------------------- small utils --------------------------- */
  function fmtBp(bp) {
    if (bp >= 1000) return (bp / 1000).toFixed(bp % 1000 === 0 ? 0 : 1) + "k";
    return String(Math.round(bp));
  }
  function niceStep(span, w) {
    const targetTicks = Math.max(4, Math.floor(w / 90));
    const raw = span / targetTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
    return Math.max(1, step * pow);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  return GenomeBrowser;
})();
