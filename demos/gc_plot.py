# Genome GC Visualizer — sliding-window GC content.
# Uses matplotlib (bundled with Pyodide). The site captures the figure
# and shows it under the cell. Edit `seq` / `window` and re-run.
import matplotlib
matplotlib.use("AGG")
import matplotlib.pyplot as plt

seq = ("GCGCATATCGCGGCTATATAGCGCGCGCATATATGCGCTAGCTAGCGCGC"
       "ATATATGCGCGCATGCATGCTAGCTAGCGCGCGCTATATATAGCGCGCGC") * 2
window = 12

def gc_track(s, w):
    xs, ys = [], []
    for i in range(0, len(s) - w + 1):
        sub = s[i:i + w]
        gc = 100 * (sub.count("G") + sub.count("C")) / w
        xs.append(i)
        ys.append(gc)
    return xs, ys

xs, ys = gc_track(seq.upper(), window)
mean_gc = sum(ys) / len(ys)

fig, ax = plt.subplots(figsize=(6.4, 3.0), dpi=110)
ax.plot(xs, ys, linewidth=2)
ax.axhline(mean_gc, linestyle="--", linewidth=1)
ax.fill_between(xs, ys, alpha=0.15)
ax.set_title(f"GC content — {window} bp window (mean {mean_gc:.0f}%)")
ax.set_xlabel("Position (bp)")
ax.set_ylabel("GC %")
ax.set_ylim(0, 100)
fig.tight_layout()
plt.show()
print(f"Windows: {len(xs)}  Mean GC: {mean_gc:.1f}%")
