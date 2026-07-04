# RNA-seq pipeline — core step: DNA -> mRNA -> protein.
# Pure Python, no dependencies. Edit `dna` and re-run.
dna = "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG"

CODONS = {
    'TTT':'F','TTC':'F','TTA':'L','TTG':'L','CTT':'L','CTC':'L','CTA':'L','CTG':'L',
    'ATT':'I','ATC':'I','ATA':'I','ATG':'M','GTT':'V','GTC':'V','GTA':'V','GTG':'V',
    'TCT':'S','TCC':'S','TCA':'S','TCG':'S','CCT':'P','CCC':'P','CCA':'P','CCG':'P',
    'ACT':'T','ACC':'T','ACA':'T','ACG':'T','GCT':'A','GCC':'A','GCA':'A','GCG':'A',
    'TAT':'Y','TAC':'Y','TAA':'*','TAG':'*','CAT':'H','CAC':'H','CAA':'Q','CAG':'Q',
    'AAT':'N','AAC':'N','AAA':'K','AAG':'K','GAT':'D','GAC':'D','GAA':'E','GAG':'E',
    'TGT':'C','TGC':'C','TGA':'*','TGG':'W','CGT':'R','CGC':'R','CGA':'R','CGG':'R',
    'AGT':'S','AGC':'S','AGA':'R','AGG':'R','GGT':'G','GGC':'G','GGA':'G','GGG':'G',
}

def clean(s):
    return "".join(c for c in s.upper() if c in "ACGT")

def translate(s):
    s = clean(s)
    aa = []
    for i in range(0, len(s) - 2, 3):
        residue = CODONS.get(s[i:i+3], 'X')
        if residue == '*':
            break
        aa.append(residue)
    return "".join(aa)

seq = clean(dna)
mrna = seq.replace("T", "U")
protein = translate(seq)
gc = 100 * (seq.count("G") + seq.count("C")) / len(seq)

print(f"DNA      ({len(seq)} nt): {seq}")
print(f"mRNA             : {mrna}")
print(f"Protein  ({len(protein)} aa): {protein}")
print(f"GC content       : {gc:.1f}%")
