# Anleitung (Deutsch)

Kurze Anleitung für alles, was dieser Fork zu POE2 Prices hinzufügt. Die ausführliche
Liste aller Änderungen mit Begründungen und Messwerten steht in
[FORK-CHANGES.md](FORK-CHANGES.md) (Englisch).

Getestet von einem Spieler mit deutschem Client bei 5120×2880, 2560×1440 und 1920×1080,
mit DualSense-Controller und mit Maus/Tastatur.

---

## 1. Deutscher Client

Preisabfragen funktionieren jetzt auch für Dinge, die vorher am deutschen Namen
scheiterten: seltene Tafeln (z. B. *Aufseher-Tafel*), Unikate, „Außergewöhnliche“
Gegenstände und die umbenannten Wiederbelebungs-Runen. Nichts einzustellen.

---

## 2. Controller (DualSense, per USB)

- **Einstellungen → neben jedem Hotkey das Feld „Controller“**: anklicken, Taste drücken.
  Jede Aktion geht so: Overlay auf/zu, Overlay schließen, Item prüfen, Stash scannen,
  Chat-Befehle usw.
- **Kombinationen**: mehrere Tasten zusammen drücken und loslassen, z. B. **PS + L2** –
  die PS-Taste benutzt das Spiel nicht. Eine einzelne Taste löst nicht aus, solange PS
  gedrückt ist.
- **Mute-Taste** (Mikrofon) ist auch belegbar – das Spiel liest sie nicht.
- **„Overlay im Vordergrund öffnen“**: öffnet das Overlay und macht es zum aktiven
  Fenster; nochmal drücken schließt es und gibt das Spiel zurück.

---

## 3. Vermögen (Stash lesen)

### 3.1 Einrichten – der schnelle Weg

1. Im Spiel das **Währungs-Fach** öffnen (ganz sichtbar).
2. **Einstellungen → Vermögen → „Kalibrieren“**. Die Einstellungen gehen zu, im Vermögen
   steht, was passiert. Das Programm sucht den Stash selbst – mit Controller- oder
   Tastatur-Ansicht, egal wo er liegt – an den Zellen des Währungs-Fachs und liest das Fach
   gleich zum Test.
   - Meldung „Automatisch kalibriert … (37 von 38 Zellen) ✓“ = alles gut.
   - Wird es nicht gefunden, öffnet sich ein Fenster: Rahmen **ungefähr** um den Stash
     ziehen, bestätigen – genau muss es nicht sein.
3. **„Fächer scannen“** (wird nach dem Test angeboten): das Programm sagt, welches Fach du
   öffnen sollst; mit der **Scan-Taste** (F7 bzw. deine Controller-Taste) das Bild
   aufnehmen – so bleibt der Stash offen. Die Kästchen jedes Fachs werden dabei
   **automatisch auf die Zellen gesetzt**. Fächer, die du nicht hast: überspringen.
4. Nur wo eine Zahl falsch gelesen wird: **Ausrichten** (3.2) oder **Debug** (3.3).

Andere Auflösung oder UI-Größe? Einfach neu kalibrieren.

### 3.2 Ausrichten (Kästchen auf die Zahlen setzen)

Beim Fach auf **„Ausrichten“** klicken. Jedes Kästchen ist die Stelle, an der gelesen wird.

**Der schnellste Weg:**
1. Auf freier Fläche einen **Rahmen um alle Kästchen** ziehen (alle markiert).
2. **V** – alte Vorbilder (★) aufheben.
3. **G** – „Nach Regel setzen“: jedes Kästchen springt an den Innenrahmen seiner Zelle.
4. Ist etwas verrutscht: vom richtig sitzenden Kästchen aus **R** (Reihe) bzw. **S**
   (Spalte) angleichen.
5. **Speichern & übernehmen**, Fach neu scannen.

Weitere Tasten: Pfeile = 1 px, Shift+Pfeil = 5 px, Strg+Z = rückgängig, **F** = am Rahmen
einrasten (nach einem von Hand gesetzten Vorbild), **H** = Hilfe. Gestrichelte Kästchen =
unsicher, Maus darauf zeigt warum.

### 3.3 Debug: eine Zahl sauber lesen

**Einstellungen → „OCR-Debug-Bilder zeigen“** an, dann beim Fach **„Debug“** und in der
Zeile die **Lupe 🔍**. Du siehst drei Bilder: Original · was der Leser bekommt · Schwarz/Weiß.
**Ziel:** im rechten Bild nur die Zahl, weiß auf schwarz, jede Ziffer ein eigenes Stück.

1. **Farb-Grenze ganz runter** (5) – farbiges Item-Leuchten fliegt raus.
2. Noch helle Stellen vom Item-Bild? **Flecken** hoch, **Helligkeit** runter,
   **Kontrast / Bild-Kontrast** hoch – bis nur die Ziffern bleiben (ohne dass sie
   zerbrechen oder zusammenwachsen).
3. Hilft das nicht: **floor** von Hand setzen, oder **lokaler Schnitt** bei ungleich
   hellem Hintergrund.
4. Steht bei „würde lesen“ die richtige Zahl: **Speichern**. Gleicher Hintergrund bei
   anderen Plätzen: **„Kopieren“ → „Einfügen“** oder **„Auf ganzes Fach anwenden“**.
5. **Lernen:** richtig gelesen, aber unter 85 % → **✓** in der Zeile. Falsch gelesen →
   richtige Zahl bei **„Aus diesem Bild lernen“** eintragen. Das klappt nur, wenn im
   rechten Bild jede Ziffer ein eigenes Stück ist – sonst steht da, wie viele Teile es
   gefunden hat.
6. Ziffer falsch gelernt: **„Vorlage vergessen“**, neu lernen.

Die Anleitung steht auch aufklappbar direkt über den Reglern.

Für 1080p, 1440p und 4K/5K liefert das Programm abgestimmte Filter mit; deine eigenen
Einstellungen haben immer Vorrang.

### 3.4 Preise und Zählen

- **Eigener Preis**: auf den Wert einer Zeile klicken – gilt pro Stück für alle Fächer.
- **Preise mit poe.ninja abgeglichen**: weicht der Preis mehr als 1,5× von poe.ninja ab
  (und poe.ninja hat genug Handel dafür), nimmt das Programm den poe.ninja-Preis – Zeichen
  ≈, beim Drüberfahren stehen alle Quellen. Dein eigener Preis gewinnt immer.
- **„Nicht mitzählen“**: Listen von Items, die nicht in die Summe sollen (z. B. „Kleine
  & normale Runen“), oben im Vermögen an- und ausschaltbar.
- **Anzahl korrigieren**: auf die Anzahl klicken – eine echte Korrektur lehrt den Leser.
- **„Falsches Fach?“**: wenn ein Fach als ein anderes erkannt wurde – das Programm merkt
  sich das für deinen Bildschirm.

### 3.5 Zurücksetzen, Support

- **„Kalibrierung & Fächer zurücksetzen“** (Einstellungen → Weitere Wege; zweimal
  klicken): Kalibrierung, alle Kästchen und Filter, gelernte Fach-Erkennung auf Anfang.
  Vorher wird **alles gesichert** (`einstellungen-sicherung-<Zeit>.json` im
  Support-Ordner). Gelernte Ziffern bleiben.
- **„Fach-Bilder für Support“**: nimmt von jedem Fach ein Bild auf, „Fertig“ öffnet den
  Ordner – für Fehlerberichte.
- **„Einstellungen exportieren“**: deine Einstellungen als `einstellungen.json` in den
  Support-Ordner.

---

## 4. Währung

- **„Kurs fixieren“** im Tooltip einer Arbitrage-Zeile (Zeile anklicken = Tooltip
  festhalten): eigenen Kurs so eingeben, wie das Spiel ihn zeigt („22,5 : 1“), Enter.
  ✕ löscht ihn. Eigene Kurse bleiben gespeichert.
- **Alle Wege zur Basiswährung**, günstigster zuerst (★), mit Kosten pro Stück.
- **Händler-Aufteilung** (Einstellungen → Währung, aus = Standard): ein Händler teilt eine
  höhere Stufe gratis in 3 der Stufe darunter (nie umgekehrt) – Routen damit sind mit ⚒
  markiert.
- **📌 Anpinnen**: die Route in einem eigenen kleinen Fenster, das offen bleibt, auch
  wenn das Overlay zu ist. Menge im Feld eintragen, Enter.

---

## 5. Rezepte

Lohnt es sich, Teile zu kaufen, zu kombinieren (oder beim Händler aufzuteilen) und zu
verkaufen? Übersicht nach Gewinn pro Runde, pro Rezept eine Karte mit Kursen, Menge,
Gold und Anpinnen. Kurse lassen sich wie bei der Währung fixieren. Den Tab kann man in
den Einstellungen ausblenden.
