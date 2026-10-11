# Français A1 – Lern-App

Handy-Web-App nach der HyperLingua-/Mikel-Methode: Kennenlernen, Nachsprechen, Abrufen in 10er-Runden, Audio-Abrufen, Hintergrund-Hören. Fortschritt wird über Supabase abgeglichen (gleiches Konto wie PARA Cockpit, Tabelle `fr_progress`).

## Eigene Sätze hinzufügen
1. In `content-src/ich.txt` unter der ersten Zeile pro Satz eine Zeile `Französisch | Deutsch` schreiben.
2. Im Ordner `app`:
   ```
   python tools/build_content.py
   python tools/audio.py
   git add -A && git commit -m "Eigene Sätze" && git push
   ```
Weitere Inseln: in `content-src/inseln.txt` mit `# id | Titel` beginnen. Vokabeln kommen aus `../03 Wortschatz.md` und `content-src/vokabeln-extra.txt`.

## Einmalig
- `supabase-setup.sql` im Supabase SQL Editor ausführen.
- Test der Wiederholungslogik: `node tools/srs.test.mjs`
- Nach Änderungen an App-Dateien in `sw.js` die Version `fra1-v1` hochzählen, damit Handys die neue Version laden.
