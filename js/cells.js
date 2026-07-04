/* =====================================================================
   cells.js — runnable code cells powered by Pyodide (Python in WASM).
   Pyodide is lazy-loaded from a CDN on the first Run, then reused. The
   demo scripts (demos/*.py) execute client-side; stdout and any
   matplotlib figure are captured and shown under the cell.
   No backend, no build step.
   ===================================================================== */
window.PyCells = (function () {
  "use strict";

  const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  let pyodidePromise = null;
  const pkgLoaded = new Set();

  function loadPyodide_() {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PYODIDE_URL + "pyodide.js";
      s.onload = async () => {
        try { resolve(await window.loadPyodide({ indexURL: PYODIDE_URL })); }
        catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error("Could not load Pyodide (offline?)"));
      document.head.appendChild(s);
    });
    return pyodidePromise;
  }

  async function fetchSrc(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`missing ${path}`);
    return r.text();
  }

  const CAPTURE = `
import sys, io, base64
try:
    import matplotlib.pyplot as _plt
    _figs = [_plt.figure(n) for n in _plt.get_fignums()]
    if _figs:
        _b = io.BytesIO()
        _figs[-1].savefig(_b, format="png", dpi=110, facecolor="white", bbox_inches="tight")
        _img = base64.b64encode(_b.getvalue()).decode()
        _plt.close("all")
    else:
        _img = ""
except Exception:
    _img = ""
`;

  /* Build a cell UI inside `mount`, wired to run `src` (a demos/*.py path). */
  async function attach(mount, runnable) {
    const src = await fetchSrc(runnable.src).catch(() => null);
    const wrap = document.createElement("div");
    wrap.className = "cell";
    wrap.innerHTML = `
      <div class="cell__head">
        <span class="cell__label">▸ ${escapeHtml(runnable.label || "Run")}</span>
        <button class="cell__run" type="button">
          <svg class="ico" aria-hidden="true"><use href="sprites.svg#ic-play"/></svg> Run
        </button>
      </div>
      <pre><code class="src">${escapeHtml(src || "// source unavailable")}</code></pre>
      <div class="cell__out" hidden></div>`;
    mount.appendChild(wrap);

    const btn = wrap.querySelector(".cell__run");
    const out = wrap.querySelector(".cell__out");

    btn.addEventListener("click", async () => {
      if (!src) return;
      btn.disabled = true;
      out.hidden = false;
      out.innerHTML = `<pre><span class="cell__status">booting Python runtime… (first run downloads Pyodide, ~ once)</span></pre>`;
      const buffer = [];
      try {
        const py = await loadPyodide_();
        py.setStdout({ batched: (t) => buffer.push(t) });
        py.setStderr({ batched: (t) => buffer.push(t) });

        if (/matplotlib|pyplot/.test(src) && !pkgLoaded.has("matplotlib")) {
          out.querySelector(".cell__status").textContent = "loading matplotlib…";
          await py.loadPackage("matplotlib");
          pkgLoaded.add("matplotlib");
        }
        // dependencies referenced by any demo, loaded on demand
        if (/\bimport numpy\b|\bfrom numpy\b/.test(src) && !pkgLoaded.has("numpy")) {
          await py.loadPackage("numpy"); pkgLoaded.add("numpy");
        }

        await py.runPythonAsync(src);
        await py.runPythonAsync(CAPTURE);
        const img = py.globals.get("_img");

        const text = buffer.join("").replace(/\n+$/, "");
        let html = `<pre>${escapeHtml(text) || "<span class=\"cell__status\">(ran with no text output)</span>"}</pre>`;
        if (img) html += `<img alt="figure output" src="data:image/png;base64,${img}">`;
        out.innerHTML = html;
      } catch (err) {
        out.innerHTML = `<pre><span class="cell__status err">error:</span>\n${escapeHtml(String(err.message || err))}</pre>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg class="ico" aria-hidden="true"><use href="sprites.svg#ic-play"/></svg> Run again`;
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  return { attach };
})();
