/* =====================================================================
   data.js — load and parse the genome model.
   Sources (all live at repo root, kept as real, editable files):
     genome.gff3    résumé encoded as genes
     cytobands.bed  ideogram Giemsa bands
     content.json   page copy + links, keyed by gene ID
   Everything the site renders comes from these three files.
   ===================================================================== */
window.GenomeData = (function () {
  "use strict";

  async function text(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.text();
  }
  async function json(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.json();
  }

  /* ---- GFF3 ------------------------------------------------------- */
  function parseGFF3(raw) {
    const lengths = {};          // chrom -> length (from ##sequence-region)
    const genesByChrom = {};     // chrom -> [gene]
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith("##sequence-region")) {
        const p = line.split(/\s+/); // ##sequence-region chr1 1 6000
        if (p.length >= 4) lengths[p[1]] = parseInt(p[3], 10);
        continue;
      }
      if (line.startsWith("#")) continue;
      const f = line.split("\t");
      if (f.length < 9) continue;
      const [seqid, , type, start, end, , strand] = f;
      if (type !== "gene") continue;
      const attrs = {};
      for (const kv of f[8].split(";")) {
        const i = kv.indexOf("=");
        if (i > -1) attrs[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
      }
      const gene = {
        id: attrs.ID,
        name: attrs.Name || attrs.ID,
        category: attrs.category || "",
        runnable: attrs.runnable === "true",
        chrom: seqid,
        start: parseInt(start, 10),
        end: parseInt(end, 10),
        strand: strand === "-" ? -1 : 1,
      };
      gene.mid = (gene.start + gene.end) / 2;
      (genesByChrom[seqid] = genesByChrom[seqid] || []).push(gene);
    }
    for (const c in genesByChrom) genesByChrom[c].sort((a, b) => a.start - b.start);
    return { lengths, genesByChrom };
  }

  /* ---- cytoBand BED ---------------------------------------------- */
  function parseBED(raw) {
    const byChrom = {};
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("#")) continue;
      const f = line.split("\t");
      if (f.length < 5) continue;
      (byChrom[f[0]] = byChrom[f[0]] || []).push({
        start: parseInt(f[1], 10),
        end: parseInt(f[2], 10),
        name: f[3],
        stain: f[4],
      });
    }
    return byChrom;
  }

  /* ---- assemble --------------------------------------------------- */
  async function load() {
    const [gffRaw, bedRaw, content] = await Promise.all([
      text("genome.gff3"),
      text("cytobands.bed"),
      json("content.json"),
    ]);

    const { lengths, genesByChrom } = parseGFF3(gffRaw);
    const bands = parseBED(bedRaw);

    // Chromosome order + labels come from content.json.chromosomes.
    const chromMeta = content.chromosomes || {};
    const order = Object.keys(chromMeta);

    const chromosomes = order.map((id) => {
      const genes = (genesByChrom[id] || []).map((g) => ({
        ...g,
        content: content.genes[g.id] || null,
      }));
      // length: prefer sequence-region, else furthest feature/band.
      let length = lengths[id] || 0;
      const maxGene = genes.reduce((m, g) => Math.max(m, g.end), 0);
      const maxBand = (bands[id] || []).reduce((m, b) => Math.max(m, b.end), 0);
      length = Math.max(length, maxGene, maxBand, 1000);
      return {
        id,
        label: chromMeta[id].label,
        accentVar: chromMeta[id].accent,     // e.g. "--c-edu"
        icon: chromMeta[id].icon,            // e.g. "gradcap"
        length,
        genes,
        bands: bands[id] || [],
      };
    });

    // Flat gene index for search / next-prev, tagged with chromosome.
    const allGenes = [];
    chromosomes.forEach((c) => c.genes.forEach((g) => allGenes.push(Object.assign(g, {
      chromLabel: c.label, accentVar: c.accentVar,
    }))));

    return { profile: content.profile, chromosomes, allGenes, raw: content };
  }

  /* resolve a CSS custom property (e.g. "--c-edu") to a hex string */
  function cssColor(varName, fallback) {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
    return v || fallback || "#4ee36b";
  }

  return { load, cssColor };
})();
