"""Erzeugt fehlende MP3s für alle Karten (Microsoft-Neural-Stimmen via edge-tts) und die Pausen-WAVs.
Aufruf (im Ordner app):  python tools/audio.py
"""
import asyncio, json, re, struct, wave
from pathlib import Path
import edge_tts

APP = Path(__file__).resolve().parent.parent
AUDIO = APP / "audio"
VOICE = {"fr": "fr-FR-DeniseNeural", "de": "de-DE-KatjaNeural"}
PAUSES = [500, 1000, 1500, 2000, 2500, 3000]


def speak_text(t):
    t = re.sub(r"\([^)]*\)", "", t)          # (m), (f), (e), (umgs.) ...
    t = t.replace(" / ", ", ").replace("/", ", ")
    return re.sub(r"\s+", " ", t).strip(" ,")


def make_pauses():
    d = AUDIO / "p"; d.mkdir(parents=True, exist_ok=True)
    for ms in PAUSES:
        f = d / f"{ms}.wav"
        if f.exists():
            continue
        with wave.open(str(f), "wb") as w:
            w.setnchannels(1); w.setsampwidth(1); w.setframerate(8000)
            w.writeframes(bytes([128]) * (8 * ms))


async def tts(sem, text, voice, path):
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, voice).save(str(path))
                return True
            except Exception as e:  # Netzwerkfehler: kurz warten, neu versuchen
                if attempt == 2:
                    print("FEHLER", path.name, text[:40], e)
                    path.unlink(missing_ok=True)
                    return False
                await asyncio.sleep(2)


async def main():
    make_pauses()
    cards = json.loads((APP / "content" / "data.json").read_text(encoding="utf-8"))["cards"]
    for f in list(AUDIO.glob("fr/*.mp3")) + list(AUDIO.glob("de/*.mp3")):
        if f.stem not in cards:  # Karte gelöscht oder Text geändert
            f.unlink()
    jobs = []
    for cid, c in cards.items():
        for lang in ("fr", "de"):
            p = AUDIO / lang / f"{cid}.mp3"
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                jobs.append((speak_text(c[lang]), VOICE[lang], p))
    print(f"{len(jobs)} Dateien zu erzeugen")
    sem = asyncio.Semaphore(8)
    res = await asyncio.gather(*(tts(sem, *j) for j in jobs))
    print(f"fertig: {sum(1 for r in res if r)} ok, {sum(1 for r in res if not r)} Fehler")


if __name__ == "__main__":
    asyncio.run(main())
