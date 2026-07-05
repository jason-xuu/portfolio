# Jason Xu — Genome Browser Portfolio

My résumé, encoded as a genome and rendered like a real genome browser
(IGV / UCSC). Each chromosome is a section of my career; each **gene** is
one item — a degree, a role, a project, an award. The whole site draws
itself from three data files, is pixel-art styled with smooth 60 fps
motion, and runs real bioinformatics in the browser via Pyodide.

**Live:** https://jason-xuu.github.io/portfolio/

No backend, no build step — static files served straight from GitHub Pages.

---

## What it does

- **Genome browser view** — a Giemsa-banded chromosome ideogram/minimap,
  a base-pair coordinate ruler, and gene feature tracks, all drawn from the
  data files. Eased zoom/pan, a reference-sequence strip that appears as you
  zoom in, drag-to-pan, wheel-zoom, and a live coordinate readout.
- **Search** jumps and animates to a locus. Click any gene to open its
  **locus panel** with the full write-up.
- **Runnable cells** — three project loci execute real Python client-side
  (DNA→protein translation, a minimal SNP caller, and a matplotlib GC-content
  plot). Pyodide is lazy-loaded on the first Run.
- **List view** — a plain, semantic, keyboard-navigable rendering of every
  item, so nothing is trapped inside the canvas. Toggle with the button or `L`.
- **Accessible & mobile** — semantic fallbacks, focus states, a motion
  toggle, and full `prefers-reduced-motion` support.

## Keyboard

`←/→` pan · `+/−` zoom · `0` fit chromosome · `j/k` prev/next gene ·
`[ ]` prev/next chromosome · `/` search · `L` list view · `?` shortcuts ·
`Esc` close.

---

## How the genome maps to the résumé

| Chromosome | Section          |
|------------|------------------|
| `chr1`     | Education        |
| `chr2`     | Experience       |
| `chr3`     | Projects         |
| `chr4`     | Skills           |
| `chr5`     | Awards & Writing |
| `chrM`     | About / Contact  |

## Editing content

Everything is data-driven from three files at the repo root:

- **`genome.gff3`** — the features. Each `gene` line places an item on a
  chromosome at some `start..end` coordinate and carries its `ID`.
- **`content.json`** — all copy and links, keyed by that same `ID`
  (`profile`, `chromosomes`, and `genes`). Runnable cells point at a
  `demos/*.py` script via `runnable.src`.
- **`cytobands.bed`** — the ideogram's Giemsa bands (rarely needs editing).

> **A gene lives in two places.** To add or rename an item, edit **both**
> `genome.gff3` (a feature line) **and** `content.json` (an entry with the
> **same `ID`**). Keep coordinates inside the chromosome's
> `##sequence-region` length and non-overlapping for a clean layout.

Theme colors and motion easing live in **`palette.css`**; pixel icons in
**`sprites.svg`** (referenced as `<use href="sprites.svg#ic-…">`).

## Project layout

```
index.html          markup, meta tags, favicon, font + script wiring
palette.css         theme tokens (colors, motion) — imported first
css/style.css       app styles, built on the palette tokens
js/data.js          parse genome.gff3 + cytobands.bed + content.json
js/browser.js       canvas engine: ideogram, ruler, sequence, tracks
js/cells.js         Pyodide-powered runnable cells
js/ambient.js       ambient nucleotide background
js/app.js           boot, tabs, locus panel, search, list view, keyboard
genome.gff3         résumé encoded as genes
cytobands.bed       ideogram bands
content.json        page copy + links, keyed by gene ID
demos/*.py          the scripts the runnable cells execute
assets/             résumé PDF + OG social image
```

## Run locally

Because the page fetches the data files, open it through a local server
(not `file://`):

```bash
python3 -m http.server
# then visit http://localhost:8000
```

## Enable GitHub Pages

Repo → **Settings → Pages → Source: “Deploy from branch” → `main` / `root`**
→ Save. The site publishes at `https://jason-xuu.github.io/portfolio/`.
A `.nojekyll` file is included so Pages serves the files as-is.

---

Built as an interactive genome browser — because a bioinformatician's
résumé should read like a genome.
