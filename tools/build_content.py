"""Baut content/data.json aus den Quelltexten.
Aufruf (im Ordner app):  python tools/build_content.py
"""
import hashlib, json, re, shutil
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
SRC = APP / "content-src"
OUT = APP / "content"
GRAMMAR_MD = APP.parent / "01 Grammatik & Strukturen.md"
BLOCK_S, BLOCK_V = 10, 30


def hid(prefix, text):
    return prefix + hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def parse_pipe_file(path):
    """'# id | Titel' startet eine Gruppe, danach 'FR | DE' pro Zeile."""
    groups, cur = [], None
    if not path.exists():
        return groups
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            head = line.lstrip("#").strip()
            gid, _, title = head.partition("|")
            title, _, isl = title.partition("|")
            cur = {"id": gid.strip(), "title": (title or gid).strip(), "isl": isl.strip(), "items": []}
            if not title:
                cur["id"] = re.sub(r"\W+", "-", gid.lower()).strip("-")
            groups.append(cur)
        elif "|" in line and cur is not None:
            fr, de = (p.strip() for p in line.split("|", 1))
            if fr and de:
                cur["items"].append((fr, de))
    return groups


def blocks(group, prefix, size, kind):
    seen, items = set(), []
    for fr, de in group["items"]:
        i = hid(prefix, fr if prefix == "s" else fr + "|" + de)
        if i not in seen:
            seen.add(i); items.append({"id": i, "fr": fr, "de": de})
    bl = [items[k:k + size] for k in range(0, len(items), size)]
    out = {"id": group["id"], "title": group["title"], "kind": kind,
           "blocks": [[c["id"] for c in b] for b in bl]}
    if group.get("isl"):
        out["isl"] = group["isl"]
    return out, items


# Grobe Wortformen für die Prüfung auf Überschneidungen mit den Sätzen.
IRREG = {
    "être": "suis es est sommes êtes sont été", "avoir": "ai as a avons avez ont eu",
    "aller": "vais vas va allons allez vont allé", "faire": "fais fait faisons faites font",
    "pouvoir": "peux peut pouvez pourriez", "vouloir": "veux veut voulez voudrais",
    "devoir": "dois doit devez", "savoir": "sais sait savez", "prendre": "prends prend prenez pris",
    "venir": "viens vient venez venu", "boire": "bois boit buvez", "lire": "lis lit",
    "dormir": "dors dort", "partir": "pars part", "sortir": "sors sort", "mettre": "mets met",
    "voir": "vois voit vu", "connaître": "connais connaît", "dire": "dis dit",
}
ART = re.compile(r"^(le |la |les |l'|un |une |se |s')")


def keys(fr):
    out, fem = [], "(e)" in fr
    for alt in re.split(r" / |, |; ", re.sub(r"\([^)]*\)", "", fr.lower())):
        alt = alt.strip().rstrip(" !?.…")
        if alt.startswith("l'"):
            out.append(("s", alt))
            continue
        alt = ART.sub("", alt)
        if not alt:
            continue
        if alt in IRREG:
            out += [("w", w) for w in IRREG[alt].split()]
        if " " in alt or "-" in alt or "'" in alt:
            out.append(("s", alt))
        elif re.search(r"(er|ir|re)$", alt) and len(alt) >= 6:
            out.append(("p", alt[:-2]))
        else:
            out += [("w", alt)] + ([("w", alt + "s")] if len(alt) >= 4 else []) + \
                   ([("w", alt + "e"), ("w", alt + "es")] if fem else [])
    return out


def check_overlap(islands, vocab, cards):
    """Warnt, wenn ein Wort schon in den Sätzen vorkommt oder doppelt in der Wortliste steht."""
    sent = " ".join(cards[i]["fr"] for g in islands for b in g["blocks"] for i in b).lower().replace("’", "'")
    toks = set(re.findall(r"[a-zà-ÿœæ]+", sent))
    seen = {}
    for g in vocab:
        for vid in (i for b in g["blocks"] for i in b):
            fr = cards[vid]["fr"]
            n = re.sub(r"\([^)]*\)", "", fr).strip().lower()
            if n in seen:
                print("DOPPELT:", fr)
            seen[n] = 1
            if any((t == "w" and k in toks) or (t == "s" and k in sent) for t, k in keys(fr)):
                print("IN SÄTZEN?", fr)


def main():
    OUT.mkdir(exist_ok=True)
    cards, islands, vocab = {}, [], []
    for g in parse_pipe_file(SRC / "inseln.txt") + parse_pipe_file(SRC / "ich.txt"):
        isl, items = blocks(g, "s", BLOCK_S, "s")
        if items:
            islands.append(isl); cards.update({c["id"]: c for c in items})
    # Wörter: nur Ergänzungen zu den Sätzen, je Gruppe einer Insel zugeordnet, in Insel-Reihenfolge.
    pos = {g["id"]: k for k, g in enumerate(islands)}
    for g in sorted(parse_pipe_file(SRC / "vokabeln.txt"), key=lambda g: pos[g["isl"]]):
        voc, items = blocks(g, "v", BLOCK_V, "v")
        vocab.append(voc); cards.update({c["id"]: c for c in items})
    check_overlap(islands, vocab, cards)
    data = {"islands": islands, "vocab": vocab, "cards": cards}
    (OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(GRAMMAR_MD, OUT / "grammatik.md")
    ns = sum(1 for k in cards if k[0] == "s")
    print(f"{len(islands)} Inseln, {ns} Sätze, {len(vocab)} Vokabelgruppen, {len(cards) - ns} Wörter")


if __name__ == "__main__":
    main()
