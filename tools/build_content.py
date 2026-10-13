"""Baut content/data.json aus den Quelltexten.
Aufruf (im Ordner app):  python tools/build_content.py
"""
import hashlib, json, re, shutil
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
SRC = APP / "content-src"
OUT = APP / "content"
VOCAB_MD = APP.parent / "03 Wortschatz.md"
GRAMMAR_MD = APP.parent / "01 Grammatik & Strukturen.md"
SKIP_SUB = ("Pronomen", "Wochentage", "Monate", "Jahreszeiten")
BLOCK_S, BLOCK_V = 10, 30


def hid(prefix, text):
    return prefix + hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def clean_cell(c):
    c = c.replace("**ê**", "").replace("★", "").replace("**", "").replace("*", "")
    return re.sub(r"\s+", " ", c).strip()


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
            cur = {"id": gid.strip(), "title": (title or gid).strip(), "items": []}
            if not title:
                cur["id"] = re.sub(r"\W+", "-", gid.lower()).strip("-")
            groups.append(cur)
        elif "|" in line and cur is not None:
            fr, de = (p.strip() for p in line.split("|", 1))
            if fr and de:
                cur["items"].append((fr, de))
    return groups


def parse_vocab_md():
    groups, cur, skip = [], None, False
    lines = VOCAB_MD.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^## (\d+)\. (.+)", line)
        if m:
            cur = {"id": "w" + m.group(1), "title": m.group(2).strip(), "items": []}
            groups.append(cur); skip = False
            continue
        if line.startswith("### "):
            skip = line[4:].startswith(SKIP_SUB)
            continue
        if cur is None or skip or not line.startswith("|"):
            continue
        if re.match(r"^\|[\s\-|]+\|$", line):
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if re.match(r"^\|[\s\-|]+\|$", nxt):  # Kopfzeile
            continue
        cells = [clean_cell(c) for c in line.strip().strip("|").split("|")]
        pairs = [(cells[0], cells[1])] if len(cells) == 2 else \
                [(cells[0], cells[1]), (cells[2], cells[3])] if len(cells) == 4 else []
        for fr, de in pairs:
            if fr and de:
                cur["items"].append((fr, de))
    return [g for g in groups if g["items"]]


def blocks(group, prefix, size, kind):
    seen, items = set(), []
    for fr, de in group["items"]:
        i = hid(prefix, fr if prefix == "s" else fr + "|" + de)
        if i not in seen:
            seen.add(i); items.append({"id": i, "fr": fr, "de": de})
    bl = [items[k:k + size] for k in range(0, len(items), size)]
    return {"id": group["id"], "title": group["title"], "kind": kind,
            "blocks": [[c["id"] for c in b] for b in bl]}, items


# Lernreihenfolge der neuen Wörter: zuerst die, die in den Sätzen vorkommen (in Insel-Reihenfolge),
# danach der Rest gemischt über die Gruppen (keine Bedeutungsreihen wie alle Farben am Stück).
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


def vocab_order(islands, vocab, cards):
    vids = list(dict.fromkeys(i for g in vocab for b in g["blocks"] for i in b))
    vk = {i: keys(cards[i]["fr"]) for i in vids}
    order, done = [], set()
    for isl in islands:
        for sid in (i for b in isl["blocks"] for i in b):
            low = cards[sid]["fr"].lower().replace("’", "'")
            toks = set(re.findall(r"[a-zà-ÿœæ]+", low))
            for vid in vids:
                if vid in done:
                    continue
                if any((t == "w" and k in toks) or (t == "s" and k in low) or
                       (t == "p" and any(x.startswith(k) for x in toks)) for t, k in vk[vid]):
                    order.append(vid); done.add(vid)
    rest = [[i for b in g["blocks"] for i in b if i not in done] for g in vocab]
    while any(rest):
        for r in rest:
            if r:
                i = r.pop(0)
                if i not in done:
                    order.append(i); done.add(i)
    return order


def main():
    OUT.mkdir(exist_ok=True)
    cards, islands, vocab = {}, [], []
    for g in parse_pipe_file(SRC / "inseln.txt") + parse_pipe_file(SRC / "ich.txt"):
        isl, items = blocks(g, "s", BLOCK_S, "s")
        if items:
            islands.append(isl); cards.update({c["id"]: c for c in items})
    for g in parse_vocab_md() + parse_pipe_file(SRC / "vokabeln-extra.txt"):
        voc, items = blocks(g, "v", BLOCK_V, "v")
        vocab.append(voc); cards.update({c["id"]: c for c in items})
    data = {"islands": islands, "vocab": vocab, "cards": cards, "vorder": vocab_order(islands, vocab, cards)}
    (OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(GRAMMAR_MD, OUT / "grammatik.md")
    ns = sum(1 for k in cards if k[0] == "s")
    print(f"{len(islands)} Inseln, {ns} Sätze, {len(vocab)} Vokabelgruppen, {len(cards) - ns} Wörter")


if __name__ == "__main__":
    main()
