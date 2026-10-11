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
    data = {"islands": islands, "vocab": vocab, "cards": cards}
    (OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(GRAMMAR_MD, OUT / "grammatik.md")
    ns = sum(1 for k in cards if k[0] == "s")
    print(f"{len(islands)} Inseln, {ns} Sätze, {len(vocab)} Vokabelgruppen, {len(cards) - ns} Wörter")


if __name__ == "__main__":
    main()
