# Anleitung (Deutsch)

Kurze Anleitung für alles, was dieser Fork zu POE2 Prices hinzufügt. Die ausführliche
Liste aller Änderungen mit Begründungen und Messwerten steht in
[FORK-CHANGES.md](FORK-CHANGES.md) (Englisch).

Getestet von einem Spieler mit deutschem Client bei 5120×2880, 2560×1440 und 1920×1080,
mit DualSense-Controller und mit Maus/Tastatur.

---

## Was dieser Fork kann – auf einen Blick

Alles läuft nur auf deinen Tastendruck; das Programm steuert das Spiel nie.

**Vermögen (Stash lesen) – richtet sich selbst ein**
- **Findet den Stash selbst**: ein Klick auf „Kalibrieren“ bei offenem Währungs-Fach –
  Controller- oder Tastatur-Ansicht, egal wo, 1080p bis 5K. Rahmen von Hand ziehen nur
  als Notlösung.
- **Führung durch die Einrichtung**: Meldungen, Testlesung, dann „andere Fächer scannen?“.
  Die Fächer-Tour sagt, welches Fach dran ist; die Scan-Taste (auch am Controller) nimmt
  das Bild.
- **Vorlagen für jedes Fach, automatisch ausgerichtet**: die Kästchen springen von selbst
  auf die Zellen; mit „Ausrichten“ jederzeit von Hand anpassbar.
- **Sehen, was der Leser sieht**: der Debug-Modus zeigt Original · Leser-Bild ·
  Schwarz/Weiß und hat einstellbare Filter – so sieht man, warum eine Zahl falsch
  gelesen wird, und behebt es (Anleitung in 3.3).
- **Lernt selbst dazu**: richtige Zahl mit ✓ bestätigen oder die richtige eintragen – der
  Leser lernt die Ziffern.
- **Zuverlässig in jeder Auflösung**: Filter für 1080p, 1440p und 4K/5K eingebaut,
  Schalter für hohe Auflösung (4K/5K), 5K-Scan in etwa 4 statt 17 Sekunden.
- **„Nicht mitzählen“-Listen**: Items aus der Summe nehmen, oben an-/ausschalten; mit ⊘
  in der Zeile per Klick.
- **Preise mit Gegenprüfung**: eigener Preis pro Item; unplausible Preise werden durch den
  Kurs von GGGs Währungsmarkt ersetzt, poe.ninja als zweite Meinung.

**Währung**
- **Kurs fixieren** so, wie das Spiel ihn zeigt; das angepinnte Fenster geht beim
  Tippen nicht mehr zu (Fehler behoben).
- **Alle Wege zur Basiswährung**, günstigster zuerst, mit „Warum“.
- **Entzaubern/Aufteilen beim Händler im Arbitrage-Kreislauf** (Große → 3 normale),
  an- und ausschaltbar.
- **📌 Anpinnen** als eigenes Fenster, bleibt offen, wenn das Overlay zu ist.

**Tauschen** (neuer Reiter): „Ich habe Chaos, ich will 10 Div“ – das Programm zeigt den
günstigsten Weg (direkt oder über Ex/Div/Annul) als einzelne Tausch-Schritte mit Mengen.

**Rezepte** (neuer Reiter): lohnt sich Kaufen, Kombinieren und Verkaufen? Gewinn pro
Runde, Gold, Anpinnen.

**Controller**: jede Hotkey-Aktion auf eine Taste oder Kombination – Preis prüfen,
Stash scannen, Overlay im Vordergrund usw. Bei offener Preisprüfung prüft das
Steuerkreuz das nächste Item, der rechte Stick schließt.

**Preisprüfung**: dasselbe Item nochmal zeigt 3 Stunden lang das gespeicherte Ergebnis –
keine neue Abfrage („Suchen“ fragt live neu ab).

**Deutscher Client**: Preisabfragen für Tafeln, Unikate (auch Trephina, Volls Protektor,
Wylunds Pfahl), Außergewöhnliche Items und umbenannte Runen.

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
- **Items nacheinander prüfen**: Preisprüfung mit der Controller-Taste öffnen, dann mit dem
  **Steuerkreuz** zum nächsten Item – es wird geprüft, sobald der Cursor kurz steht.
  **Rechter Stick** oder die Taste nochmal schließt. Leeres Feld: das letzte Ergebnis
  bleibt stehen. Abschaltbar in Einstellungen → Allgemein.
  **Mit dem Controller geöffnet = mit dem Controller zu**: PS (bzw. deine Taste) nochmal
  oder den rechten Stick bewegen – das gilt auch, wenn das Blättern abgeschaltet ist.
  Mit F6 / Strg+F geöffnet reagiert das Fenster nicht auf den Stick.
- **PS allein und PS + Taste gleichzeitig belegt?** Geht: gibt es eine Kombination mit PS,
  löst PS allein erst beim **Loslassen** aus – und nur, wenn keine andere Taste dazu kam.
  Beispiel: PS = Preisprüfung, **PS + Mute = Item ins Tauschen**, Mute = Stash-Scan.
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

**F7 und „Fächer scannen“ – der Unterschied:**
- **„Fächer scannen“** (die Tour) ist zum **Kennenlernen**: das Programm sagt, welches Fach
  dran ist, und fragt „Ist das wirklich dieses Fach?“ – mit Ja lernt es das Aussehen des
  Fachs (es wird „gepaart“) und setzt die Kästchen auf die Zellen.
- **F7** (bzw. deine Scan-Taste) liest danach **jedes gepaarte Fach** jederzeit, auch
  außerhalb der Tour. Kennt F7 ein Fach nicht, **fragt es sofort „Welches Fach ist
  das?“** – Fach wählen, fertig (es ist gepaart) – oder „+ Neues Fach anlegen“.

**Ein neues Fach in Betrieb nehmen** (z. B. das **Fragment-Fach**, Unter-Reiter
„Fragmente“ – es ist der letzte Schritt der Tour):
1. **„Fächer scannen“** starten, bis zum neuen Fach durchklicken (vorhandene Fächer
   überspringen), im Spiel das Fach öffnen, **Scan-Taste**.
2. Die Frage **„Ist das dieses Fach?“ mit Ja** beantworten – jetzt ist es gepaart, die
   Kästchen sitzen auf den Zellen.
3. Ein neues Fach hat noch **keine eigenen Leser-Einstellungen**: jede Zahl prüfen. Wo
   eine falsch oder unsicher ist → **Debug** (3.3): Filter einstellen, „Auf ganzes Fach
   anwenden“, Ziffern anlernen.
4. Ab jetzt reicht **F7**.

**Ein Fach, das das Programm nicht kennt, selbst anlegen** (Einstellungen → Vermögen →
„Eigene Fächer“ → **„+ Neues Fach anlegen“**):
1. Das Fach im Spiel öffnen, dann klicken. Das Programm macht ein Bild und **findet die
   Zellen selbst** – sie sind nummeriert.
2. Die erste Zelle ist ausgewählt: **ein paar Buchstaben tippen** (z. B. „krisen“), das
   Item aus der Liste wählen (**Enter** = erster Treffer). Es springt zur nächsten Zelle.
   Namen unklar? Im Spiel mit der Maus drüber – auch leere Felder zeigen ihren Namen.
3. Zellen ohne Namen werden nicht gespeichert – einfach frei lassen. Fehlt eine Zelle
   (volle Zellen mit hellem Item findet es manchmal nicht): **„+ Zelle“**, ins Bild klicken.
4. Oben dem Fach einen **Namen** geben, **„Speichern & paaren“**: das Fach ist gepaart, die
   Kästchen sitzen auf den Zellen. Ab jetzt liest **F7** es.
5. Zahlen im Vermögen prüfen, wo nötig **Debug** (3.3).
6. **Exportieren** legt das Fach als Datei in den Support-Ordner – schick sie ein, dann
   kommt das Fach fest ins Programm. **Bearbeiten** (Fach im Spiel offen) ändert Namen.

### 3.2 Ausrichten (Kästchen auf die Zahlen setzen)

Am Fach auf **⚙ → „Ausrichten“** klicken (oder in der Prüf-Meldung / Prüfleiste). Jedes
Kästchen ist die Stelle, an der gelesen wird.

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

### 3.0a Fach für Fach scannen (Marathon)

Im Spiel ein Fach anklicken → **F7** (oder Mute) → nächstes Fach → F7 … Das Programm
erkennt jedes Fach selbst. Nach jedem Scan steht oben kurz ein grünes **„✓ Essenzen ·
23:41:05“**, und an jedem Fach die Uhrzeit seines letzten Scans (**✓ 23:41**). Ein Fach
nochmal scannen ersetzt seine Karte, es wird nichts doppelt gezählt.

### 3.3a Unsichere Zahlen – meldet das Programm selbst

Nach jedem Scan (F7, Tour, neues Fach) zählt das Programm die **unsicheren Zahlen** (unter
85 %) und meldet sie: „2 Zahlen unsicher in Fragmente: Riss-Splitter 62 %, …“ →
**„Jetzt prüfen“**. Dann geht eine Leiste über dem Fach die Zahlen **einzeln** durch: Bild,
Filter, ✓ (richtig → lernt sie) oder „Aus diesem Bild lernen“ (falsch → richtige Zahl
eintragen), **Weiter**, zum Schluss **Fertig**. Der Debug-Schalter muss dafür **nicht** an
sein. Ohne Prozentanzeige steht neben einer unsicheren Zahl ein kleines **?** – anklicken
prüft genau diese Zahl.

Beim Prüfen steht das Item **direkt unter der Leiste**, bis du fertig bist – du musst es
nicht in der Liste suchen. **Lernt er eine Zahl nicht?** Das ist Absicht: Er lernt nur,
wenn im rechten Schwarz-Weiß-Bild **jede Ziffer einzeln und ganz** zu sehen ist. Kleben
zwei zusammen, sind sie zerbrochen oder hängt ein Stück Icon dran, lernt er lieber nichts
Falsches. Dann die Filter ein wenig verstellen, bis jede Ziffer sauber einzeln steht, und
nochmal ✓. Die Leiste sagt dir, was los war („1 Teile gefunden, 2 Ziffern erwartet“).

**Bestätigt = Ruhe:** Drückst du bei einer Zahl ✓ (oder tippst die richtige ein), merkt
sich das Programm: *in diesem Feld steht diese Zahl*. Liest der nächste Scan dort dieselbe
Zahl, wird **nicht mehr gefragt** – egal ob 78 % oder 88 %. Die Prozentzahl steht dann grün
mit ✓. Erst wenn sich die Zahl ändert, wird wieder geprüft.

**Verschluckte Ziffer:** Sieht das Programm im Bild mehr Ziffern, als es gelesen hat
(„61“ gelesen als „6“), fragt es nach – auch bei 90 %: „Achtung: Im Bild stehen 2 Ziffern,
gelesen wurde 6“. Beim Lernen passt es doppelt auf: Stehen im Bild mehr Ziffern als du
sagst, oder sieht eine Ziffer klar wie eine andere aus, lernt es **nicht** und sagt dir
warum. Stimmt es trotzdem: nochmal drücken. **Einstellungen → „Gelernte Ziffern prüfen“**
vergleicht alle schon gelernten Ziffern mit den mitgelieferten und zeigt verdächtige (z. B.
eine als „1“ gelernte 4) zum Entfernen.

**Automatisch einstellen** (⚙ am Fach oder in der Prüf-Leiste) macht es wie du: Sättigung
200 %, Farb-Grenze 5, Helligkeit −20 fest, dann Flecken (bis 20), Kontrast und floor
probieren, bis im Schwarz-Weiß-Bild **jede Ziffer einzeln und ganz** steht und daneben
nichts übrig bleibt. Gemessen an den Zahlen, die sicher stimmen (von dir bestätigt oder
90 %+). Danach **lernt** es die Ziffern aus den sauberen Bildern und **prüft alles nach**:
Liest ein Feld danach eine andere Zahl, bekommt es seine alten Einstellungen zurück; hätte
das Lernen andere Zahlen verändert (dünne 1en an Icon-Kanten), wird es zurückgenommen;
werden die bekannten Zahlen nicht besser, bleibt alles, wie es war. Ein Fach, dessen
Bilder schon sauber sind, wird nicht angefasst. Oben steht der Fortschritt, danach das
Ergebnis und **Rückgängig**.

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
- **Preise abgeglichen**: weicht der Preis mehr als 1,5× vom direkten Tausch gegen
  Erhabene ab (GGGs Währungsmarkt, genug gehandelt), gilt der Tauschkurs; poe.ninja wird
  als weitere Quelle gezeigt. Zeichen ≈, beim Drüberfahren stehen alle Quellen. Dein
  eigener Preis gewinnt immer.
- **„Nicht mitzählen“**: Listen von Items, die nicht in die Summe sollen (z. B. „Kleine
  & normale Runen“), oben im Vermögen an- und ausschaltbar.
  **Mit einem Klick**: in der Zeile auf **⊘** (erscheint beim Drüberfahren) – das Item
  kommt in die Liste „Aussortiert“ (wird beim ersten Mal angelegt und ist an). Gibt es
  mehrere Listen, fragt ein kleines Menü, in welche. Zurückholen: auf das **⊘ Name ✕**
  in der Zeile klicken.
- **Anzahl korrigieren**: auf die Anzahl klicken – eine echte Korrektur lehrt den Leser.
- **⚙ → „Falsches Fach?“**: wenn ein Fach als ein anderes erkannt wurde – das Programm merkt
  sich das für deinen Bildschirm.

- **Werte anzeigen in**: Einstellungen → Vermögen → **Exalted / Divine / Chaos** – beliebig
  viele anhaken (mindestens einer). Gilt für jede Zeile, jedes Fach und die Summe.

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

## 5. Tauschen

Oben **„Ich habe“** und **„Ich will“** wählen (⇄ vertauscht beide), darunter **„Ich brauche
10“** oder **„Ich gebe aus 100“**. Darunter stehen alle Wege, der günstigste zuerst (★,
grün): jeder Schritt mit „so viel geben → so viel bekommen“ und dem Kurs, wie er im Spiel
steht, dazu wie viel günstiger als direkt. ✎ = dein fixierter Kurs, ⚠ = Kurs nicht
aktuell, „wenig Umsatz“ = deine Menge ist ein großer Teil dessen, was in der letzten
Stunde gehandelt wurde. Zwischen zwei Tauschen kann sich der Kurs bewegen.

**Item direkt übernehmen:** Einstellungen → Allgemein → **„Item ins Tauschen übernehmen“**
eine Taste geben (Tastatur und/oder Controller). Im Spiel über eine Währung fahren, Taste
drücken – der Tauschen-Tab geht auf mit ihr als „Ich habe“ und der Stapelgröße als Menge.
Bei anderen Items passiert nichts. Tipp: nicht dieselbe Taste wie der Stash-Scan nehmen –
mit Controller steht der Cursor im Stash immer auf einem Item.

## 6. Rezepte

Lohnt es sich, Teile zu kaufen, zu kombinieren (oder beim Händler aufzuteilen) und zu
verkaufen? Übersicht nach Gewinn pro Runde, pro Rezept eine Karte mit Kursen, Menge,
Gold und Anpinnen. Kurse lassen sich wie bei der Währung fixieren. Den Tab kann man in
den Einstellungen ausblenden.
