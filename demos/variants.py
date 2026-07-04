# Variant-calling toolkit — minimal SNP caller.
# Compares a sample against a reference and reports substitutions.
# Pure Python, no dependencies. Edit the sequences and re-run.
reference = "ACGTACGTACGTACGTACGTACGT"
sample    = "ACGTACCTACGTACGTAGGTACGT"

def call_snps(ref, alt):
    n = min(len(ref), len(alt))
    variants = [(i + 1, ref[i], alt[i]) for i in range(n) if ref[i] != alt[i]]
    identity = 100 * (1 - len(variants) / n) if n else 0.0
    return variants, identity, n

variants, identity, n = call_snps(reference, sample)

print(f"Reference length : {len(reference)} bp")
print(f"Aligned positions: {n}")
print(f"Sequence identity: {identity:.1f}%")
print(f"Variants found   : {len(variants)}")
print("-" * 32)
print("POS\tREF\tALT")
for pos, r, a in variants:
    print(f"{pos}\t{r}\t{a}")
if not variants:
    print("(no substitutions)")
