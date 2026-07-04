/* =====================================================================
   ambient.js — a calm, on-brand background: sparse nucleotides drifting
   downward like slow sequencing lanes. Deliberately low-contrast so it
   never competes with content. Fully gated on motion preference/toggle
   and paused when the tab is hidden (battery-friendly).
   ===================================================================== */
window.Ambient = (function () {
  "use strict";

  const BASES = ["A", "C", "G", "T"];
  const COLORS = { A: "78,227,107", C: "106,208,255", G: "255,179,71", T: "255,107,139" };

  let canvas, ctx, raf = null, cols = [], w = 0, h = 0, dpr = 1;
  let enabled = false, last = 0;

  function build() {
    const spacing = 26;
    const n = Math.ceil(w / spacing);
    cols = [];
    for (let i = 0; i < n; i++) {
      cols.push({
        x: i * spacing + spacing / 2,
        y: -Math.random() * h,
        speed: 10 + Math.random() * 18,       // px/s — slow
        gap: 16 + Math.floor(Math.random() * 8),
        seed: Math.floor(Math.random() * 4),
        alpha: 0.05 + Math.random() * 0.06,
      });
    }
  }

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "12px 'DM Mono', monospace";
    ctx.textAlign = "center";
    build();
  }

  function frame(t) {
    if (!enabled) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    ctx.clearRect(0, 0, w, h);
    for (const c of cols) {
      c.y += c.speed * dt;
      if (c.y - c.gap * 10 > h) c.y = -Math.random() * h * 0.5;
      // draw a short trailing run of bases per column
      for (let k = 0; k < 10; k++) {
        const yy = c.y - k * c.gap;
        if (yy < -12 || yy > h + 12) continue;
        const base = BASES[(c.seed + Math.floor((yy + c.x) / c.gap)) % 4];
        const fade = c.alpha * (1 - k / 12);
        ctx.fillStyle = `rgba(${COLORS[base]},${fade.toFixed(3)})`;
        ctx.fillText(base, c.x, yy);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !enabled) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf), (raf = null);
    if (ctx) ctx.clearRect(0, 0, w, h);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) start(); else stop();
  }

  function init() {
    canvas = document.createElement("canvas");
    canvas.className = "ambient";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop(); else if (enabled) start();
    });
  }

  init();
  return { setEnabled };
})();
