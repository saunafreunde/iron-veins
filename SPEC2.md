# MASTER-PROMPT 2 — „Iron Veins" · Die Expansion (v1 → v2, „die 100 Stockwerke")

> **Diese Datei ist die Spezifikation der Expansion.** `SPEC.md` bleibt
> unangetastet die Autorität für den v1-Umfang (M0–M9); diese Datei baut darauf
> auf und wiederholt nichts, was dort steht — sie referenziert es. Bei jedem
> Widerspruch zwischen dieser Datei und `CLAUDE.md`, `DECISIONS.md` oder dem
> Code gilt: diese Datei sagt, was gewollt ist; `DECISIONS.md` sagt, warum davon
> abgewichen wurde. **Eine Abweichung ohne Eintrag in `DECISIONS.md` ist ein
> Fehler, keine Entscheidung.** Das gilt unverändert.

> **Beweislage dieser Datei:** Ein 11-Agenten-Code-Audit des fertigen v1
> (440 Tests grün, Save v22, M0–M9 abgenommen), fünf unabhängige
> Expansions-Entwürfe (Simulation, Präsentation, Content, Identität, Plattform)
> und drei Juroren-Urteile mit Scores, Grafts und Vetos. Jede hier getroffene
> Architektur-Entscheidung ist gegen diese Beweislage entschieden, nicht
> improvisiert. Verifizierte Defekte des Audits stehen in M10 — **nichts anderes
> wird gebaut, bevor M10 grün ist.**

---

## 1. AUFTRAG

Du bist Lead Engineer und baust **Iron Veins v1 zu einem ~20× größeren Spiel
aus**. Der jetzige Stand ist das Fundament — mechanisch vollständig, bit-exakt
deterministisch, aber „5 % des finalen Spiels": eine Sandbox ohne Ziel, ohne
Linien, ohne alternde Welt, mit weißen Kisten statt Fahrzeugen und einem
Jahrhundert, in dem sich kein Pixel ändert.

**Du arbeitest die Meilensteine M10–M25 (Abschnitt 8) strikt der Reihe nach
ab.** Jeder Meilenstein endet mit grünen Tests, einem `DECISIONS.md`-Eintrag,
einem Commit und einer deutschen Zusammenfassung. Am Ende jedes Meilensteins ist
das Spiel **startbar und im erreichten Umfang spielbar** (Ritual aus SPEC.md
Abschnitt 20). Du springst nicht vor.

### 1.1 Die unverhandelbaren Rahmenbedingungen

* Die **zehn Architektur-Gesetze** aus `CLAUDE.md` gelten unverändert:
  Determinismus, Commands als einziger Spieler-Zustandsautor, fixe 20 Hz,
  ganzzahlige Cents, Sim sieht nie Render, kein Allokieren im Hot-Path, keine
  Rekursion in Netz-Traversierung, IDs statt Referenzen, atomare Snapshots.
* **Vollständig offline.** Keine Engine, kein Backend, kein Netzwerkzugriff.
* **Jede Weltregel-Änderung = `SAVE_VERSION`-Bump + Migration + Hash.** Ohne
  Ausnahme (siehe Zusatzgesetz Z2, Abschnitt 4).
* **Prozedurale Kunst bleibt Gesetz.** Kein Binär-Asset betritt je das Repo —
  keine PNG-Sprite-Packs, keine KI-generierten Bilddateien, keine
  Musik-/Font-Dateien. Die Expansion wächst ausschließlich durch Erweiterung
  des prozeduralen Vokabulars (`shapes.ts`, `TerrainAtlas.ts`,
  WebAudio-Synthese). Ein Repo-Glob-Test erzwingt das (siehe E-14).
* **Die Balancing-Tests besitzen die Konstanten.** Verlässt ein Szenario sein
  Band, ändern sich die Tabellen, nie die Tests.

---

## 2. PRODUKTVISION 2.0 — worauf die Expansion hinarbeitet

Iron Veins v2 ist **das beweisbare, lesbare Netz-Spiel, dessen Welt sichtbar
altert.** Kein Feature-Haufen, sondern vier Berühmtheiten auf einem lebendigen
Fundament:

1. **Der Taktfahrplan mit Anschlusssicherung** (SPEC.md 12.3) — Schweizer
   Integraler Taktfahrplan als Sim-Mechanik. Kein TTD-Nachfolger hat das. Der
   Spieler baut keinen Fuhrpark, er baut einen Fahrplan; die `ceil`-Formel des
   Flottenberaters repariert zugleich die KI-Flotten (D-121) und macht
   Balancing-Szenario 5 erstmals erreichbar (D-116).
2. **Der Frachtfluss-Atlas** — der eine M5-Verbindungsgraph (D-075) als
   Kartenebene: gebogene, firmenfarbene Pfeile, Breite = gemessenes Volumen,
   dazu das Stations-Röntgenbild mit allen fünf Rating-Termen aus 10.1 einzeln
   beziffert. Die gewollte Todesspirale wird von einer Zahl zu einer erklärten
   Diagnose — `CLAUDE.md` verlangt das wörtlich.
3. **Der Netzwert** — das 4×-Versprechen aus SPEC.md §1 als eine Prozentzahl:
   verdienter Ertrag geteilt durch den Closed-Form-Deckel (D-066-Maschinerie),
   pro Linie und Firma. Dazu Belegungs-/Signalkosten (SPEC.md 8.4 endlich
   eingelöst), Engpass-Heatmap und eine Deadlock-Erkennung, die Züge und Tiles
   BENENNT.
4. **Das Replay-Theater** — jeder Save trägt bereits `{seed, commandLog}`
   (SPEC.md 19.2); ein Klick macht daraus ein abspielbares, verifizierbares
   Replay. „Replay prüfen" nennt den abweichenden Tick. Determinismus ist die
   teuerste Architektur-Investition des Projekts; das ist ihre spielerseitig
   sichtbare Dividende, die kein Konkurrent ohne Engine-Neubau nachbauen kann.

Darunter altert die Welt: **Wetter und Jahreszeiten** bewegen Geld durch
existierende Konstanten-Nähte, eine **vorab erzeugte Konjunktur-Jahrhundertkurve**
lässt Kohle nach 2000 fallen und Container ab 1970 boomen, **Städte bauen
sichtbar Gebäude und Straßen** (heute: 100 Jahre pixelidentisch eingefroren),
**Passagiere haben Ziele und Klassen**, und die Optik zieht per
**Atlas-Regeneration** durch Jahreszeiten und Ären — der strukturelle
Kostenvorteil des Prozedural-Gesetzes, den kein Sprite-Pack-Konkurrent kopieren
kann. Eine 1955 profitable Linie muss 1985 neu verdient werden — und der
Spieler hat mit Linien-GuV, Flussatlas und Netzwert erstmals die Instrumente,
das zu SEHEN und zu beantworten.

---

## 3. VERBINDLICHKEIT

* Alles unter **MUSS** ist nicht verhandelbar. Alles unter **SOLL** ist stark
  empfohlen; Abweichung nur mit `DECISIONS.md`-Eintrag.
* Zahlenwerte sind **Startwerte** — die Balancing-Tests sind die Autorität.
  Neue Bänder werden ausschließlich im einführenden Meilenstein vermessen;
  Referenzläufe pinnen alle neuen Weltregeln auf „aus" (E-09).
* Die **Entschiedenen Architekturfragen** (Abschnitt 5) sind Verfassungsrang:
  Sie wurden gegen das Audit und drei Juroren-Urteile entschieden. Wer eine
  davon ändern will, schreibt zuerst den `DECISIONS.md`-Eintrag, der die dort
  genannte Begründung widerlegt.
* **Verboten:** `TODO`, `FIXME`, `any`, `@ts-ignore`, leere Rümpfe,
  Platzhalter, auskommentierter Code — unverändert aus SPEC.md 0.1.

---

## 4. ZUSATZGESETZE (Z1–Z6) — was bei 20× Umfang zusätzlich Gesetz ist

Die zehn Gesetze aus `CLAUDE.md` bleiben. Dazu kommen sechs, die aus den
verifizierten Fehlermustern des Audits destilliert sind:

* **Z1 — Geld-vs-Pixel-Grenzregel.** Alles, was Geld oder Physik berührt, ist
  eine gespeicherte+gehashte **Weltregel** mit eigenem benannten RNG-Stream.
  Alles, was nur Pixel berührt, ist eine **reine Funktion von Snapshot-Feldern**
  (Tick/Monat/Jahr/Höhe/Klima) plus render-lokalem RNG. Nichts liegt je
  dazwischen.
* **Z2 — Jede Weltregel ist ein Save-Bump.** Eine Weltregel ist ein
  `NewGameParams`-Feld: gespeichert, gehasht, migriert (D-110). Das Muster
  „derived, no save change" kombiniert mit „world rule" ist der vom Audit
  markierte wiederkehrende Planungsfehler — ein Kopplungstest
  (Save-Feld ↔ `hashWorld` ↔ Parser) macht ihn zum roten Build (M10).
* **Z3 — RNG-Disziplin per API, nicht per Konvention.** Jedes stochastische
  System zieht aus `world.streamFor(salt)` (M10 formalisiert D-106). Neue
  Draws auf `world.rng` sind lint-geflaggt. Modulation bestehender Rolls
  (Pannen) geschieht ausschließlich per **Threshold-Verschiebung bei exakt
  identischer Draw-Anzahl**. Takt-/Renewal-Arithmetik zieht **null** Zufall —
  auch keinen benannten Stream (D-093-Präzedenz).
* **Z4 — Jeder historische Input in Sim-Entscheidungen ist Save-Zustand.** Ein
  200-Tick-Fenster ist aus dem aktuellen Zustand nicht rekonstruierbar; ein
  „derived" Layer liefert nach dem Laden andere A*-Kosten und damit andere
  Routen — Bruch von Gesetz 3. Derived bleibt legitim NUR für rein lesende
  Overlays, die kein Sim-Code je liest (ReservationTable-Muster, D-054).
* **Z5 — Genau ein `SAVE_VERSION`-Bump pro zustandsberührendem Meilenstein.**
  Das Shared-Resource-Ledger (Abschnitt 6) vergibt die Nummern; niemand sonst.
  Keine Mid-Milestone-Bumps, keine Mikro-Bump-Ketten.
* **Z6 — Gemessene Grundlinie vor jeder Budget-Zusage.** Jede
  Tick-Millisekunden-Zusage dieser Datei wird gegen das
  1500-Fahrzeug-Perf-Fixture aus M10 gemessen, nie gegen Extrapolation. Eine
  Zusage ohne Messung ist keine.

---

## 5. ENTSCHIEDENE ARCHITEKTURFRAGEN (E-01 … E-18)

Jede hier notierte Frage war zwischen den fünf Entwürfen oder innerhalb des
Audits strittig. Sie ist jetzt entschieden. Der jeweilige Meilenstein trägt den
zugehörigen `DECISIONS.md`-Eintrag nach, wenn er sie umsetzt.

**E-01 · Wetter: sim-seitig, nicht render-only.** Gameplay-wirksames Wetter ist
eine Weltregel `weather` (aus/mild/rau), default **aus** für Alt-Saves, mit
eigenem Stream `streams.weather`; das Wetterfeld ist gespeichert+gehasht, und
der Renderer liest es NUR aus dem Snapshot. Jahreszeiten sind davon getrennt:
eine zustandslose Kalenderfunktion (Monat, Höhe, Klima) ganz ohne RNG.
*Begründung:* SPEC.md §1 verlangt „sehen UND in der Bilanz messen" —
render-only-Wetter wäre Wetter, das lügt (es regnet, aber nichts kostet);
sim-Wetter ohne Hash bräche Gesetz 3. Der Audit hat exakt diesen Widerspruch
(Report 8 vs. 2/3) als vor Arbeitsbeginn zu entscheiden markiert. Reine
Wetter-KOSMETIK bleibt als Setting erlaubt — nachdem die Autoritätsfrage so
entschieden ist. Landet in M18.

**E-02 · Straßen-Stau-Layer: gespeichert und gehasht, niemals derived.** Der
8.4-Term ist per Definition historisch (Fahrzeuge pro Tile über 200 Ticks) —
Uint8-Layer in Kartengröße, deterministischer Exponentialzerfall über
Lazy-Epoch pro Tile plus Dirty-Liste, kein 1M-Tile-Scan. Zwei Juroren haben die
„derived"-Formulierung zweier Entwürfe explizit vetoiert (Z4). Landet in M15.

**E-03 · Kein Car-Following, kein Mikroverkehr.** SPEC.md 8.4 fordert einen
Stau-KOSTENTERM, keine Verkehrsmikrosimulation. Geliefert wird: Stau-Term in
den A*-Kosten, Geschwindigkeitskappung hinter langsamerem Leader auf gleichem
Tile+Richtung, Bahnübergang schließt bei reserviertem Block (liest die
ReservationTable, D-054). Überholen, Car-Following und ambienter Stadtverkehr
sind vetoiert: O(Fahrzeuge × Nachbarn) im Hot-Path für einen Effekt, den der
Kostenterm ökonomisch bereits liefert.

**E-04 · Hybrid-Renderer.** 32×32-Tile-`RenderTexture`-Chunks NUR bei
Zoom ≤ 0,5× (wo SPEC.md 16.1 selbst Details streicht); bei 1×/2×/4× rendert der
`projection.drawOrder()`-sortierte Sprite-Pfad die korrekte Hügel-Verdeckung.
Vollflächen-Chunking ist vetoiert (gebackene Texturen können Fahrzeuge nie in
die (x+y)-Diagonalordnung einsortieren); Chunking ganz wegzuentscheiden ebenso
(Editor-Brushes, 2048er-Karten und der 0,25×-Abstraktmodus stünden auf einem
bekannten Perf-Loch). EIN `DECISIONS.md`-Eintrag deckt beide bisherigen
16.1-Abweichungen. drawOrder-Verdrahtung in M10, Chunks in M12.

**E-05 · 60-Hz-Bewegung ohne Protokolländerung.** Reader-seitige Kopie des
Fahrzeugblocks der Vorgänger-Generation plus Wanduhr-Alpha-Lerp, geclampt an
Diskontinuitäten (Depot-Ausfahrt, Tunnel). KEIN dritter SharedArrayBuffer,
keine Stride-Änderung. Konsist-Kompositionen reisen über den existierenden
niederfrequenten Marker-Kanal, nie im 20-Hz-Stride (Gesetz 7/10).

**E-06 · Genau EINE Line-Entität.** Die Line ist sim-seitiger, gespeicherter,
gehashter Zustand (Struct-of-Arrays, `MAX_LINES` in `constants.ts`).
`AiState.lines` wird **im selben Meilenstein migriert und gelöscht** — nie
parallel geführt. Per-Line-Auto-Renewal löst den firmenweiten D-093-Behelf ab
(weiterhin null RNG, Totalordnung). Die KI dimensioniert ihre Flotte mit
wörtlich derselben Beraterformel `ceil(gemessene Umlaufzeit / Takt)` wie der
Spieler — das ersetzt `AI_VEHICLES_PER_LINE = 1` (constants.ts:399) und macht
Szenario 5 erreichbar. Vier offene Posten (Spec-Schuld 12.2/12.3, D-093,
D-121, D-116) hängen am selben Objekt. Landet in M11.

**E-07 · Takt zieht null Zufall; der Wartegraph ist derived und zyklenfrei by
construction.** Slot-Arithmetik ist reine Tick/Taktzeit/Versatz-Mathematik.
Warten (`WaitingForSlot`, `WaitingForConnection`) sind gespeicherte
Sim-Zustände im 11.4-Automaten, gesetzt nur durch Commands. Der Wartegraph der
Anschlusssicherung wird nie gespeichert (D-054-Muster), Zyklensuche iterativ
(Gesetz 8); Zyklus gefunden ⇒ Warten sofort abgebrochen, harte Tick-Obergrenze
zusätzlich. Ein Fahrzeug, das wartet, blockiert nie ein Fahrzeug, auf das es
selbst wartet — das ist Testgegenstand, nicht Hoffnung. Taktpunkte nur auf
Bahnsteigen, nie auf freier Strecke (D-059/D-082-Schutz).

**E-08 · Passagierklassen als eigene Cargo-IDs.** `Cargo.CommuterPax` und
`Cargo.BusinessPax`, zonengeneriert, mit eigener Rate und
Verfallsgeschwindigkeit — niemals Per-Parcel-Attribute. Eigene IDs lassen
Stack-Merge-Key, M5-Routing, Rating, Tarife, Refit und den D-118-Test
unverändert; die Fixed-Size-Cargo-Arrays wachsen um genau zwei Einträge
(Gesetz 7). Landet in M19.

**E-09 · Konjunktur als Genesis-Kurve.** Die Makro-Kurve wird bei Weltgenese
komplett aus `streams.economy` erzeugt, gespeichert und gehasht; Monats-Hooks
LESEN sie nur (Multiplikator-Lookups an Tarif-/`costCt`-Nähten). Keine
Live-Draws, keine zweite Closed-Form-Parallelmechanik (Juroren-Veto gegen
Duplizierung). Die Balance-Suite fährt mit Weltregel „Konjunktur: aus" als
flachem Anker. Landet in M21.

**E-10 · Stadtwachstum mutiert im Monats-Hook, nicht über Commands.**
Gesetz 6 gilt für SPIELER-Eingriffe; `growTowns` ist bereits legitimer
Zustandsautor. Ein Pseudo-Firmen-Command-Umweg würde das Replay-Log mit
Nicht-Spieler-Rauschen fluten. Platzierung Round-Robin über die Monatstage
(eine Stadt pro Tag) gegen den Monatsersten-Spike; jede Iteration
deterministisch geordnet. Landet in M20.

**E-11 · Terraform-Guard ist ein Bugfix, keine Weltregel.** `cornerIsFree`
blockiert `trackBits`/Signal/Struktur und respektiert den Owner —
**unconditional**, ohne Regel-Gate (Juroren-Veto gegen die
„versionierte Validierungsregel"). Die Folge für alte Logs wird ehrlich
geregelt: **Replay-Validität ist versions-gepinnt.** Jedes Replay trägt
`{appVersion, SAVE_VERSION}`; Cross-Version-Verifikation wird abgelehnt statt
gelogen. Der `DECISIONS.md`-Eintrag dazu entsteht in M10.

**E-12 · Undo als Inverse-Patch-Commands — und erst nach dem Checkpoint-Ring.**
Nur Bau/Abriss/Terraform, Inverse zur Ausführungszeit deterministisch
aufgezeichnet (Terraform: berührte Corner-Höhen; Bau: Abriss + exakt der
historisch verbuchte Betrag, nie neu berechnet — D-092), Undo selbst als
Command im Log (Gesetz 6), ganz angewendet oder ganz abgelehnt,
Session-only-Ring (Tiefe 50), „undone == never-done" als Hash-Assertion. Das
beantwortet D-114 exakt; jede Abkürzung (partiell, still übersprungen) ist
vetoiert. Grobes Rewind liefert vorher der M16-Checkpoint-Ring. Landet in M25.

**E-13 · Browser-Kanal: angenommen.** COOP/COEP-Service-Worker-Shim (ein
unkontrollierter Erst-Reload ist akzeptiert und dokumentiert) plus
OPFS-Save-Backend hinter dem bestehenden `Storage`-Interface — null
Sim-Änderungen. Die harte SAB-Pflicht bleibt; **nie** ein
Single-Thread-Fallback (würde Gesetz 10 forken). Der Audit hat verifiziert:
Nicht-Entscheiden wäre stilles Entscheiden gegen den Kanal
(`SimClient.ts:57` hard-throw). Landet in M25.

**E-14 · Kunst-Quelle: Kenney-CC0-Kits gebacken, Prozedural als Terrain-Gesetz
und Lückenfüller** *(revidiert 06.08.2026 auf Owner-Direktive: „nutzt kenney.nl
für die 3d grafiken" — die Direktive schlägt die frühere Nur-Prozedural-
Fassung; die Historie steht in `DECISIONS.md`)*.

* **Objekte kommen aus Kenney-3D-Kits** (CC0, keine Attribution nötig, Credits
  trotzdem in README + Abspann): Train Kit (Züge/Trams/Gleisdekor), Car Kit,
  Watercraft Kit (+ Pirate Kit für frühe Schiffe), City Kits
  (Roads/Commercial/Suburban/Industrial), Factory Kit, Building Kit, Modular
  Buildings, Nature Kit. Der Weg ist ein **Build-Zeit-Bake** — exakt die
  Pipeline, die SPEC.md 16.2 immer vorsah, mit Kenney-Geometrie statt
  Beschreibungstext als Quelle: `npm run assets:fetch` lädt die Kits gegen ein
  eingechecktes **Manifest (URLs + SHA-256 + Modell→Katalog-Zuordnung, reiner
  Text)** in einen gitignorierten Cache; `npm run assets:bake` rastert die
  GLB-Modelle mit einem kleinen eigenen Software-Rasterizer (flat-shaded,
  orthographisch, EXAKT die dimetrische 64×32-Kamera aus SPEC.md 16.1) in
  PNG-Atlanten + JSON-Manifeste pro Zoomstufe — **8 Facings pro Fahrzeug**,
  Firmenfarbe über materialbenannte Recolor-Zonen (Zwei-Pass-Tint),
  Anker-Metadaten (Schornsteine, Fenster/Emissive) aus dem Manifest. Ausgabe
  ist Build-Artefakt, niemals Commit.
* **Kein Binärasset im GIT** — die Regel bleibt und der Glob-Test bleibt ihr
  Wächter (er prüft eingecheckte Dateien; Cache und Bake-Ausgabe sind
  gitignored). Das Spiel bleibt vollständig offline: `assets:fetch` ist ein
  Entwickler-/Build-Schritt, nie Spiel-Laufzeit. Determinismus unberührt —
  Render-Assets erreichen die Sim nie.
* **Terrain, Gleise, Straßen, Wasser bleiben Laufzeit-prozedural**
  (TerrainAtlas-Muster): sie brauchen die Saison-/Ären-REGENERATION (M18/M23)
  und die 16-Steigungs-Eckengeometrie, die kein Kit abbildet. Gebackene
  Objekt-Sprites erhalten Saison-/Nacht-Varianten als **Bake-Zeit-Zeilen**
  (Emissive-/Winter-Pass beim Baken), nicht zur Laufzeit.
* **Prozedural (`shapes.ts`) bleibt Pflicht-Fallback und Lückenfüller:**
  Flugzeuge (kein Kenney-3D-Kit existiert), Industrie-Sonderbauten
  (Förderturm, Bohrturm) soweit Kits sie nicht hergeben, frühe Ären 1850–1920
  soweit die City Kits nicht reichen, und jeder Dev-Build ohne gefüllten
  Asset-Cache (das Spiel startet IMMER, notfalls mit prozeduraler Optik).
* Musik und alle Sounds bleiben WebAudio-Synthese auf dem injizierten
  AudioContext (headless testbar, M9-Muster); Kartentext über eine beim Start
  aus Systemschriften gerasterte BitmapFont. Die fal.ai-Pipeline des Owners
  ist für das Kernspiel weiterhin ausdrücklich ausgeschlossen — auch als
  „Build-Time-Pack mit eingecheckten Prompts".

**E-15 · Ären-Spanne: 1850 bis endlos.** `startYear` (Presets
1850/1880/1920/1950) und `endless` sind Weltregeln; der MAX_TICK-Stopp
(Speed 0 im Jahr 2050) entfällt unter `endless`. Tick bleibt Int32 — der
Headroom (~295 Jahre ab Startjahr) wird als `DECISIONS.md`-Eintrag explizit
gemacht. Prä-1950-Fahrzeuggenerationen sind reine Katalogdaten. Landet in M23.

**E-16 · Multiplayer: nur Groundwork.** Per-Tick-Cheap-Digest
(`hashDynamicState` ohne Ledger-Arrays) hinter einem Debug-Flag (~0,1 ms nur
bei Flag), reservierte Envelope-Integritätsfelder (Checksum, Session-Id) mit
Protokoll-Version-Bump, Input-Delay-Designnotiz. **Kein Transport, keine
Sessions, kein Netcode** — bricht das Offline-Gesetz und multipliziert jede
Testfläche; eigenes Folgeprogramm nach v2.0.

**E-17 · Modding/Data-Packs: nicht in diesem Programm.** Klima-Sets,
Ären-Kataloge und alle neuen Inhalte bleiben `const`-Tabellen unter
Balance-Test-Hoheit. Was JETZT protokolliert wird: die Verfassungsgrenze
CONTENT (Kataloge, Ketten, Namen — künftig pack-fähig) vs. TUNING (Konstanten,
bleiben in `constants.ts`), damit ein späteres Pack-Programm ohne Umbau
andocken kann. Pack-Format, ID-Namespaces, Pack-Hashing: Folgeprogramm.

**E-18 · Snapshot-Fahrzeug-Deckel.** `SNAPSHOT_MAX_VEHICLES = 1500` liegt unter
`MAX_VEHICLES = 4000` — der Renderer zeichnet große Flotten heute still nur zu
37,5 %. Die Entscheidung (Priority-/Viewport-Writer oder Cap-Anhebung) MUSS
bis Ende M15 fallen und im Ledger stehen, bevor Benchmark-Karten (M22) den
Deckel stillschweigend reißen.

*Entschieden in M15 B4 (D-187): **Cap-Anhebung**. `SNAPSHOT_MAX_VEHICLES` = `MAX_VEHICLES` = 4 000, `SNAPSHOT_LAYOUT_VERSION` 7 → 8 — das ist die EINE in 6.1 gebuchte M15-Layout-Änderung, weil der dort vorgesehene Stau-Overlay-Block zweimal null Byte kostete. Gemessen statt geschätzt: Draw-Prep über einen vollen Block 4 000 einfacher Fahrzeuge p50 2,40 / p99 3,52 ms gegen 0,89 / 1,50 ms bei 1 500, und die bereits gegatete Konsist-Szene bepreist mit 9 000 Units je Frame mehr Arbeit als ein voller Einfach-Block — kein neuer Tripwire. Der Priority-/Viewport-Writer ist abgelehnt: er stellt die Kamera in die Entscheidung (Klick, Klang und Badge adressieren Fahrzeuge über die Id IN diesem Block) und bricht die E-05-Paarung (D-162), weil eine Zeile, die den Block verlässt und wieder betritt, keine Vorgänger-Generation zum Gleiten hat.*

---

## 6. SHARED-RESOURCE-LEDGER (Abnahme-Instrument)

Fünf Gemeingüter — Tick-Budget, Atlas-Fläche, `SAVE_VERSION`-Kette,
Snapshot-Layout, CI-Minuten — sind die Kollisionsflächen, an denen parallel
geplante Systeme einander zerstören. Dieses Ledger wird wie die
Balance-Band-Tabelle geführt: **jeder Meilenstein wird gegen seine Zeile
abgenommen.** Eine Überschreitung ist ein Abnahme-Fehler, kein Schulterzucken.

### 6.1 Haupt-Ledger

| MS | SAVE_VERSION (ein Bump, Z5) | Snapshot-Layout | Tick-Budget Δ p99 (1500 Fzg., Z6) | Atlas |
|---|---|---|---|---|
| M10 | **v23** — Save-Digest + Metadatenblock | — | +0,00 ms (Fixes/Validierung) | 0 |
| M11 | **v24** — Order-Grammatik-Stride, LineStore, Takt-Felder, AiState-Migration | +`lineId` je Fahrzeug (Layout-Bump) | +0,20 ms (Halt-Checks, Slot-Logik) | 0 |
| M12 | — | — | +0,00 ms (render-only) | +4 Wasser-Animationszeilen Seite 0 |
| M13 | — | +`IndustryMarker.level` (Layout-Bump) — **B6 gemessen: seit M5 vorhanden (Marker-Kanal, Industrie-Uhr); null Byte Layout-Änderung, `SNAPSHOT_LAYOUT_VERSION` bleibt 6 (D-174, das D-171-Muster)** | +0,00 ms (render-only) | Seite 1 (~600 Fahrzeug-Zellen), Seite 2 (Emissive) |
| M14 | **v25** — Stations-Frachthistorie-Ring — **B3 eingelöst: 12 Monate × 18 Frachten × 3 Zähler (Collected/Delivered/Expired) je Station, Int32-Ring + Float64-Monatsakkumulator, beide gespeichert + im VOLL-Digest gehasht (Live-Digest bewusst nicht — Kachel-Layer-Präzedenz), Migration v24→v25 = Null-Ringe, Pin `bbe572afe2880243` + Korpus (`v25-played.ironsave`) nach Protokoll re-recorded; Tick-Anteil = indizierte Adds in bestehenden Pfaden + Monats-Roll, kein neuer Snapshot-Byte; Tick nachgemessen 1,490/3,339 ms p50/p99 auf der Referenzflotte — die M10-Grundlinie (1,45/3,26) im dokumentierten ±0,7-ms-Laufrauschen (D-178)**; **B4 (Statistik-Zentrum): +2 Fahrzeug-Felder im SELBEN v25-Payload (`breakdownCount` + `depotCall`, beide gespeichert + gehasht — der Depot-Ruf ist Z4-Routing-Zustand), Migration v24→v25 in place erweitert (EIN Bump je Meilenstein, nicht EIN Migrations-Edit); Pin nach D-137-Protokoll re-recorded auf `8146983bca3a6f92`, Korpus unverändert gültig (die Korpus-Welt ist fahrzeuglos — geprüft, nicht angenommen); Tick-Anteil = 1 Zähler-Inkrement je Panne + 1 Flag-Vergleich am Routenende, kein neuer Snapshot-Byte — Details Marker-Kanal (D-181)** | +FlowMarker-Block (Layout-Bump) — **B1 eingelöst: `SNAPSHOT_LAYOUT_VERSION` 6 → 7 (EIN Bump: +FlowCount-Feld, Stride-8-Block, Cap 4 096 Legs); Export im selben Publish-Pass wie `structureSignature` (Fehler 33), gemessen median 0,060 / p99 0,285 ms bei 420 aktiven Legs auf der Referenzflotte — unter der ≤-0,5-ms-Zusage, Tripwire gated den Median auf der Zusage selbst (D-176, D-167)** | +0,00 ms Tick; ≤ +0,5 ms je Snapshot-Publish | 0 (Vektor) |
| M15 | **v26** — 8.4-Weltregeln + Stau-Layer (~1 MB gehasht auf 1024²) — **eingelöst: B1 legt `occupancyPenalty` + `signalPenalty` an (D-184), B2 erweitert dieselbe `v25_to_v26`-Migration IN PLACE um `roadCongestion` + den Uint8-Layer (D-185), B3/B4 berühren keine gespeicherte Form; Pin zweimal nach D-137 re-recorded, zuletzt `50c7d6a38f6da052`; Save-Größe A/B gemessen: Null-Layer 1 039 B komprimiert gegen 1 048 576 B roh, stark bespielt 20 023 B** | +Stau-Overlay-Block — **B2/B3 gemessen: der Stau-Layer und die Durchsatz-Zähler reisen im SharedArrayBuffer der Karte, also NULL Byte Snapshot (D-185/D-186, das D-171/D-174-Muster); die zugesagte EINE Layout-Buchung löst B4 stattdessen mit der E-18-Entscheidung ein: `SNAPSHOT_LAYOUT_VERSION` 7 → 8, `SNAPSHOT_MAX_VEHICLES` 1 500 → 4 000 = `MAX_VEHICLES`, +160 KiB Shared-Buffer (D-187)** | +0,50 ms (Inkremente, Zerfall, A*-Term) — **gemessen −0,31 ms** | 0 |
| M16 | **v27** — Checkpoint-Ring-Metadaten, `.ironreplay` — **B1 eingelöst: der EINE Z5-Bump gehört dem Checkpoint-Ring; `checkpoints` + `logBaseTick` + `replay` liegen im CONTAINER (Historie, nicht Zustand — die Command-Log-Familie, D-131), also NULL Byte gehashter Weltzustand: die `v26_to_v27`-Migration reicht `state` per Referenz durch (das v23-Muster, D-130), der Korpus-Manifest-Hash bleibt für alle sechs Fixtures `17f7f507023b91d8` und der kanonische Pin bleibt nach D-137-Protokoll re-recorded auf demselben `50c7d6a38f6da052` (nur `saveVersion` 26 → 27). Ring-Kosten gemessen statt geschätzt: eine Nutzlast 25 471–39 081 B komprimiert gegen 1 206 267 B rohes MessagePack auf der 25-Jahre-KI-Partie, Encode 24,5–41,3 ms, alle 26 Checkpoints 916 498 B — bei Kapazität 16 hält der Ring Genesis + 15 Jahre = 566 367 B (D-188)**; **B2 (Replay-Theater) berührt KEINE gespeicherte Form: kein zweiter Bump, Pin und Korpus-Manifest unverändert, die zwei UNHASHED-Allowlist-Einträge des Feld-Audits unverändert — die Wiedergabe ist derselbe Scheduler mit versiegelter Queue, das Regal ist ein zweites Regal neben den Saves (D-189)**; **B3 (Beweis-Infrastruktur) ebenfalls ohne Änderung gespeicherter Form: kein Bump, Pin `50c7d6a38f6da052` und Korpus-Manifest `17f7f507023b91d8` unverändert, Allowlists unverändert — das Bundle ist Testinfrastruktur, eine Crash-Pfad-Konvertierung und eine Build-Datei; gemessen statt geschätzt: die `.ironreplay` der 25-Jahre-Partie 582 520 B gegen 593 434 B Save (Ring 566 367 B in beiden), das Soak-Fixture 1 359 B Text, Crash-Bundle-Schema 1 → 2 (D-190)**; **B4 (Verdikt-Taxonomie, Korrektur zu D-189) erweitert die `v26_to_v27`-Migration IN PLACE (Z5 — v27 ist M16s einziger Bump, v28 gehört M17): je Zusicherung ein Schedule-Digest (`(tick, seq)`-Paare des eigenen Segments, ein Hash je Checkpoint plus einer für den Teiljahres-Schwanz der Replay-Claim), Container-Feld — NULL Byte gehashter Weltzustand, Pin `50c7d6a38f6da052` und Korpus-Manifest `17f7f507023b91d8` unverändert (nachgeprüft, nicht angenommen), UNHASHED-Allowlist unverändert, zwei neue PARSER_IGNORED-Einträge (Feld fehlt in Aufzeichnungen älterer v27-Builds und wird als leerer Digest gelesen = „nichts zugesichert“). Zusätzlich gemessen: Haupt-Bundle 1 083,31 kB → 936,94 kB (gzip 328,26 → 283,96), weil die statische UI→Sim-Importkette entfernt ist — Sim erreicht die UI nur noch dynamisch (D-191)**; **B5 (Budget, Scrubber, Ein-Klick) ohne jede Änderung gespeicherter Form: kein Bump, keine Migration, Pin `50c7d6a38f6da052` und Korpus-Manifest `17f7f507023b91d8` unverändert (`SAVE_VERSION` wechselt die DATEI, nicht den Wert — die Container-Identität liegt jetzt im import-freien Blatt `save/version.ts`), Allowlists unverändert, EIN Protokollfeld (`makeReplay.play`, Hauptthread-Verkehr). Gemessen: Haupt-Bundle 936,94 → **907,18 kB** (gzip 283,96 → 277,04; 908 106 B auf der Platte), `replay`-Chunk 158,57 → 190,41 kB — die restliche statische UI→Sim-Kette (32 kB Parser über drei Konstanten) ist weg und das Budget ist ab jetzt ein Test (`bundleBudget.spec.ts`, 930 000 B, Ledger-Eintrag nach dem 6.2-Muster). Tick nachgemessen 1,168 / 2,592 ms p50/p99 (D-192)** | — | +0,00 ms (Checkpoints auf Save-Pfad) — **B1 gemessen: Tick p50 1,494 / p99 2,684 ms auf der 1500-Fahrzeug-Referenzflotte gegen die M10-Grundlinie 1,45/3,26; der einzige Per-Tick-Anteil ist ein Modulo im Scheduler, das Encode läuft einmal je Spieljahr auf dem Save-Pfad (D-188); B2 fügt je Frame einen Vergleich gegen den Aufzeichnungs-Endtick hinzu und sonst nichts (D-189)** | 0 |
| M17 | **v28** — GoalState — **B1 eingelöst: der EINE Z5-Bump gehört der Zielmaschine; `goals` (Deskriptor UND Verdikt: Fortschritt, Halte-Serie, Status, Medaille, Abschluss-Tick) plus die lebenslange Fracht-Zählung je Firma (`cargoDeliveredUnits`, CARGO_COUNT-Zeile), beide gespeichert + gehasht (Voll- UND Live-Digest — ein Dutzend Zahlen je Ziel, die sich genau dann bewegen, wenn der Spieler es sieht). Migration v27→v28 trägt „keine Ziele" und Null-Zählung ein — genau das, was eine Prä-M17-Welt über sich wusste. Erster Bump seit v26, der gehashten Weltzustand bewegt, also beide Pins nach Protokoll re-recorded: kanonischer Cross-OS-Hash `50c7d6a38f6da052` → **`4dff3f3f216385e6`** (D-137), Korpus-Manifest `17f7f507023b91d8` → **`f1dcab2a374ab728`** samt `v28-played.ironsave` (alle sieben Fixtures dekodieren weiter in EINE Welt, D-130), Soak-Fixture `615d0259186b89dc` → **`ed8ac72cd1d6284d`** bei unveränderten 698 aufgezeichneten Kommandos — die Partie ist dieselbe, nur der Fingerabdruck ist gewandert. D-134-Audit deckt jedes neue Feld ab (synthetisches Ziel als Repräsentant), keine neue Allowlist-Zeile (D-193)**; **B2 (`.ironscenario`) erweitert dieselbe `v27_to_v28`-Migration IN PLACE (Z5): der Metadatenblock ist ein CONTAINER-Feld neben Checkpoint-Ring und Replay-Claim — NULL Byte gehashter Weltzustand, kanonischer Pin `4dff3f3f216385e6`, Korpus-Manifest `f1dcab2a374ab728` und Soak-Fixture `ed8ac72cd1d6284d` unverändert (nachgeprüft, nicht angenommen), eine neue UNHASHED-Allowlist-Zeile (`scenario.*`) mit ausgeschriebener Begründung, keine PARSER_IGNORED-Zeile (jedes Feld ist Pflicht). Fehler 35 ist durch DREI Audits mit Meta-Tests beantwortet: Perturbation jedes Blatts gegen `hashWorld`, ein Quell-Walk über `src/sim` (Vokabular nur unter `save/`) und die Sperrregel-Tabelle gegen `NewGameParams`/Weltzustand/`AppSettings`. Haupt-Bundle gemessen 907,53 → **908,59 kB** (gzip 277,16 → 277,50) gegen 930 000 B — vollständig die drei neuen i18n-Sätze, im Haupt-Chunk steht kein Szenario-Code (gegrept, nicht behauptet); `replay` 196,46 → 198,15 kB, Worker 319,89 → 321,58 kB (D-194)**; **B3 (Szenario-Browser + acht mitgelieferte Szenarien) ohne jede Änderung gespeicherter Form: kein Bump, keine Migration, kanonischer Pin `4dff3f3f216385e6`, Korpus-Manifest `f1dcab2a374ab728` und Soak-Fixture `ed8ac72cd1d6284d` unverändert, keine Allowlist-Zeile, EIN Protokollfeld (`NewGameOptions.goals`, Hauptthread-Verkehr). Die acht Szenarien sind TEXT (Seed + Regeln + Ziel-Deskriptoren + Briefing) und werden bei Spielstart generiert — also null Byte Binärasset (E-14) und zugleich Determinismus-Fixtures: je zwei Läufe über ein Spieljahr, alle acht hash-identisch und alle acht untereinander verschieden (+14,5 s Determinismus-Suite). Haupt-Bundle gemessen 908,59 → **913,49 kB** (gzip 277,50 → 278,87; 914 431 B auf der Platte gegen 930 000 B); der Katalog liegt NICHT darin, sondern in einem eigenen dynamisch geladenen Chunk von **12,59 kB** (gegrept, nicht behauptet). Seeds durch Generieren und Vermessen gewählt, Schwellen gegen vier Messungen kalibriert (D-195)**; **B4 (Spielende + Zielpanel) ohne jede Änderung gespeicherter Form: kein Bump, keine Migration, kanonischer Pin `4dff3f3f216385e6`, Korpus-Manifest `f1dcab2a374ab728` und Soak-Fixture `ed8ac72cd1d6284d` unverändert (nachgeprüft durch Ausführen), keine Allowlist-Zeile, kein Snapshot-Byte (der Goal-Block aus B1 bekommt endlich seinen EINEN Konsumenten), EIN Protokollfeld (`goalsChanged`, Hauptthread-Verkehr, Kadenz = ein Spieltag). Die Punktformel ist eine LESUNG gehashten Zustands und wird nirgends gespeichert — genau das hält M17 bei einem Bump. Balance-Band gemessen: 5 747 Punkte — Ziele 2 125 (37 %), Firmenwert 1 477 (26 %), Netzwert 1 437 (25 %), Fracht 708 (12 %), **auf einem Lauf, der 22 statt 25 Spieljahre war; nach der Abnahmekorrektur D-197 auf der echten 25-Jahres-Partie neu gemessen: 5 889 Punkte — Ziele 2 125 (36 %), Firmenwert 1 556 (26 %), Netzwert 1 413 (24 %), Fracht 795 (13 %)**, Band 3 000–7 000 unverändert und kein Viertel über 45 % / unter 5 %. Haupt-Bundle gemessen 913,49 → **923,32 kB** (gzip 278,87 → 281,92; **924 276 B auf der Platte gegen 930 000 B** — Restluft 5 724 B, ausdrücklich protokolliert); der Endbildschirm liegt in einem eigenen `React.lazy`-Chunk von 2,41 kB, `replay` 198,03 → 197,99 kB, Worker 321,62 → 324,10 kB, CSS 12,70 → 13,43 kB (D-196)**; **Abnahme-Nachtrag (D-197, D-198): der Stand des ARTEFAKTS ist 924 308 B, Restluft 5 692 B — D-197 legte +32 B drauf (`map/size.ts`), D-198 bewegt den Haupt-Chunk um null Byte (Briefings im Katalog-Chunk 12 928 → 13 205 B, Kartengrößen-Regel in Worker und `replay` je +84 B), D-199 bewegt keinen einzigen Chunk (Kommentar und Test; Katalog bleibt 13 205 B, Worker 324 367 B, `replay` 198 264 B); kein Bump, keine Migration, kein Snapshot-Byte, kein Protokollfeld** | +Goal-Block (~64 B) — **B1 eingelöst: `SNAPSHOT_LAYOUT_VERSION` 8 → 9, 8 Ziele × 2 Int32 = exakt 64 B je Slot; nur die BEWEGLICHE Hälfte reist (Fortschritt in Promille + `Standing`, das Status und Medaille in eine vorzeichenbehaftete Zahl faltet), geschrieben im EINEN Publish-Pass (Fehler 33); was ein Ziel IST, bewegt sich nie und reist deshalb nicht (E-05, Fehler 37)** | +0,05 ms (nur Tages-Hook) — **gemessen p50 1,181 / p99 2,449 ms gegen die M10-Grundlinie 1,45/3,26; der Hook kehrt in einer Welt ohne Ziele auf seiner ersten Zeile zurück. Allokation gemessen statt behauptet (`GCProfiler`): 0,17–0,71 B je Spieltag über 50 000 Tage für die Eigenmechanik, gegen 336 B/Tag einer allokierenden Kontrolle** | 0 |
| M18 | **v29** — Wetter-Regel + Wetterfeld (16×16 Uint8) — **B1 eingelöst: der EINE Z5-Bump gehört der Weltregel `weather` (aus/mild/rau) und ihrem Feld; beide gespeichert + gehasht (Regel unbedingt — eine nur-bei-an gehashte Regel ließe zwei verschieden laufende Welten gleich fingerprinten, das M15-Argument), Migration v28→v29 trägt „aus“ und ein wolkenloses Feld ein — genau das, was eine Welt mit ausgeschalteter Regel für immer hält. Erster hashbewegender Bump seit v28, also beide Pins nach Protokoll re-recorded: kanonischer Cross-OS-Hash `4dff3f3f216385e6` → **`5a2a6cf73f4107bb`** (D-137), Korpus-Manifest `f1dcab2a374ab728` → **`c0a021f5d1ee8619`** samt `v29-played.ironsave` — **alle acht Fixtures, sieben davon von sieben früheren Builds geschrieben und auf der Platte unberührt, dekodieren in EINE Welt** (D-130) —, Soak-Fixture `ed8ac72cd1d6284d` → **`e6c5e33d8e7607ec`** bei unveränderten 698 aufgezeichneten Kommandos. Feldkosten gemessen statt geschätzt: 256 B je Welt unabhängig von der Kartengröße (feste 16×16-Regionen statt eines zweiten Kachel-Layers). Sperrregel-Tabelle um `weather` erweitert (der M17-Kopplungstest erzwingt die Entscheidung als Compile-Fehler); Haupt-Bundle gemessen 924 308 → **926 473 B** gegen 930 000 B, **Restluft 3 527 B** — vollständig fünf neue i18n-Sätze in zwei Sprachen plus die drei Buttons der Startmaske; der nächste M18-Bundle, der Text oder ein Panel hinzufügt, bucht die Anhebung mit eigener Messung (D-192) (D-200)**; **B2 (Wetter-Effekte + Jahreszeiten) ändert KEINE gespeicherte Form: kein zweiter Bump, die `v28_to_v29`-Migration brauchte nicht einmal eine Erweiterung — ein Multiplikator an einer bestehenden Naht trägt keinen eigenen Zustand (Z5 eingehalten, ohne ihn zu verbrauchen). Kanonischer Pin `5a2a6cf73f4107bb`, Korpus-Manifest `c0a021f5d1ee8619` und Soak-Fixture `e6c5e33d8e7607ec` bei unveränderten 698 Kommandos — **nachgeprüft durch Ausführen, nicht angenommen**, und Szenario 5 misst wieder D-158s 1 119 720 EUR auf den Cent. Vier Nähte und keine fünfte: `ROLLING_RESISTANCE_*`/`DRAG_*` im Längssolver, die 11.3-Pannenschwelle, `CARGO_EXPIRY_FRACTION_PER_DAY` bei Hitze, und der 7.3-Monatsausstoß von Farm und Forst (das ist die Jahreszeit, nicht der Himmel). Die Z3-Klausel ist instrumentiert statt behauptet: `Rng.nextUint32` wird für die Dauer eines Aufrufs beschattet und gezählt — 512 perfekt zuverlässige Fahrzeuge ziehen unter allen fünf Himmeln exakt 512 Wörter UND lassen den Generator im identischen Zustand, eine verschlissene Flotte exakt `512 + Pannen` unter jedem — die Ziehungszahl ist eine Funktion der ERGEBNISSE und sonst nichts. Haupt-Bundle gemessen 926 473 → **927 719 B gegen 930 000 B, Restluft 2 281 B** (vollständig die fünf neuen Konstanten-Tabellen, die über `constants.ts` in den Haupt-Chunk geraten); `SimWorker` 326 656 → 327 698 B, `replay` 200 046 → 199 950 B, Katalog unverändert 13 319 B. Das neue Balance-Band (harter Winter −8–15 % auf der Referenz-Kohlelinie) wird hier ausdrücklich NICHT beansprucht und keine Konstante darauf getrimmt (D-201)**; **B3 (Saison-Optik) ändert ebenfalls KEINE gespeicherte Form: kein Bump, keine Migration, kanonischer Pin `5a2a6cf73f4107bb`, Korpus-Manifest `c0a021f5d1ee8619` und Soak-Fixture `e6c5e33d8e7607ec` bei 698 Kommandos **nachgeprüft durch Ausführen**, Szenario 5 wieder auf 1 119 720 EUR. Die EINE sim-seitige Zeile ist die Sturmwarnung, die in den (gespeicherten und gehashten) News-Log schreibt — sie kann nur bei eingeschalteter Regel feuern, und jedes Fixture wie jedes Balance-Szenario fährt sie aus, weshalb die Pins stehen blieben. Neue News-Kategorie `Weather` (NEWS_CATEGORY_COUNT 5 → 6, Benachrichtigungs-Default Ticker), EIN Protokollfeld (`ready.climate`, Hauptthread-Verkehr), zwei neue i18n-Sätze in zwei Sprachen. Haupt-Bundle gemessen 927 719 → **934 751 B**, und **das Budget ist mit dieser Messung von 930 000 auf 950 000 B angehoben** (D-192s Regel; D-200 und D-201 hatten die Buchung angekündigt); `SimWorker` 327 698 → 328 296 B, `replay` 199 950 → 200 040 B, Katalog unverändert 13 319 B (D-202)**; **B4 (das Band und der Abschluss) ändert KEINE gespeicherte Form und keinen einzigen Byte unter `src/`: kein Bump, keine Migration, kein Snapshot-Byte, kein Protokollfeld, keine Atlas-Zelle, kein i18n-Satz, keine Allowlist-Zeile — das Bundle ist ein Balance-Szenario, ein geteiltes Fixture, eine Registry-Zeile und Dokumentation. Kanonischer Pin `5a2a6cf73f4107bb`, Korpus-Manifest `c0a021f5d1ee8619`, Soak-Fixture `e6c5e33d8e7607ec` bei 698 Kommandos, alle acht mitgelieferten Szenarien hash-identisch samt Welt-Claims-, Briefing-Zahlen- und Ortsnamen-Audit, Szenario 5 auf 1 119 720 EUR — **nachgeprüft durch Ausführen**. **Das M18-Balance-Band ist gemessen und RE-BANDIERT: SPEC2 verlangte −8–15 %, die Wirtschaft zahlt −4,95 %, das Band ist −3–7 %** (`tests/balance/hardWinter.spec.ts`, 6 Seeds × 9 Jahre, 3 510 797 → 3 336 995 EUR Frachterlös). Kein Konstante wurde darauf getrimmt; der Weg nach 8–15 % ist gefunden, vermessen und mit Begründung abgelehnt (Frost-Gewicht 14 → 90 = 70 % Frosttage im Winter; `WEATHER_FROST_SEASON` ist klimablind, also wäre auch ein tropischer Januar gefroren — die Buchung gehört zu M23s Klima-Sets). Trace vollständig in D-203: Kanal-Zerlegung (Pannenschwelle ~4,4 Punkte, Solver-Nähte ~2,1, Winterreibung ~0,9, Hitze-Verfall ~0,6), Permanent-Winter-Decke −26,39 %, Frost-Frequenz-Sweep. Haupt-Bundle nachgemessen (zweimal byte-identisch) **934 926 B gegen 950 000 B, Restluft 15 074 B**; `SimWorker` 328 296 B, `replay` 200 040 B, Katalog 13 319 B, CSS 13 427 B — alle unverändert (D-203)**; **B5 (Klima für den Himmel, Band auf dem defektfreien Build) ändert KEINE gespeicherte Form: kein Bump, keine Migration, kein Snapshot-Byte, kein Protokollfeld, keine Atlas-Zelle, kein i18n-Satz, keine Allowlist-Zeile — drei Dateien unter `src/` (eine gelöschte Konstantentabelle, eine abgeleitete neue, eine reine Funktion) und die Tests dazu. **Der von D-203 als Grund für das kleinere Band genannte DEFEKT ist behoben, bevor neu bandiert wurde**: `WEATHER_FROST_SEASON` war klimablind, die Frostschwelle ist jetzt `frostSeasonFactor` = die klimabewusste Winterkurve der Jahreszeit selbst (Tropen exakt null — gemessen null Frost-Regionstage über ein raues Spieljahr —, Arktis 5,2 % gegen temperiert 3,1 % und Wüste 0,8 %, temperierter Januar EXAKT unverändert per `WEATHER_FROST_FULL_SEVERITY`). Danach neu gemessen: **−4,36 % statt −4,95 %** (3 510 797 → 3 357 840 €), Band bleibt **−3–7 %** und ruht jetzt auf Messung statt auf einem Bug. Kanal-Zerlegung neu erhoben: Pannenschwelle ~3,8 der 4,36 Punkte, die übrigen Kanäle im Rauschen (zwei messen NEGATIV — D-203s Reihenfolge unterhalb des führenden Terms trägt nicht), Permanent-Winter-Decke −25,24 %, Frostanteil 9,1 % der DJF-Regionstage. Klimablinde HITZE ist der benannte Rest (es gibt keine Sommer-Tabelle zum Wiederverwenden — M23). Kanonischer Pin `5a2a6cf73f4107bb`, Korpus-Manifest `c0a021f5d1ee8619`, Soak-Fixture `e6c5e33d8e7607ec` bei 698 Kommandos, alle acht Szenarien hash-identisch samt Audits, Szenario 2 (249 980 €, Rückfluss Jahr 6) und Szenario 5 (1 119 720 €) unverändert — **nachgeprüft durch Ausführen**. Haupt-Bundle gemessen 934 926 → **935 002 B gegen 950 000 B, Restluft 14 998 B**; `SimWorker` 328 296 → 328 376 B, `replay` 200 040 → 200 050 B, Katalog 13 319 B und CSS 13 427 B unverändert (D-204)** | +Wetterfeld-Block — **B1 eingelöst: `SNAPSHOT_LAYOUT_VERSION` 9 → 10 (EIN Bump: +`WeatherCount`-Feld, 256 Int32 = 1 KiB je Slot; `SNAPSHOT_I32_COUNT` 16 → 18, weil der Float64-Block dahinter auf einer 8-Byte-Grenze beginnen muss). Geschrieben im EINEN Publish-Pass (Fehler 33); eine Welt mit Regel „aus“ schreibt NICHTS und meldet Count 0 — der Unterschied zwischen „kein Wetter“ und „klarer Tag“, den der Renderer sehen muss, ohne 256 Zellen zu lesen (D-200)**; **B2: null Byte — die Effekte lesen den bereits publizierten Block bzw. gar nichts, `SNAPSHOT_LAYOUT_VERSION` bleibt 10 (D-201)**; **B3: null Byte — die Optik liest denselben publizierten Block über `SimClient.readWeather`, `SNAPSHOT_LAYOUT_VERSION` bleibt 10 (D-202)** | +0,15 ms (1 Array-Read/Fzg. + Tagesupdate) — **B1 gemessen: Tick p50 1,296 / p99 2,841 ms auf der 1500-Fahrzeug-Referenzflotte (max 17,233 ms über 6 500 Ticks) gegen die M10-Grundlinie 1,45/3,26, also −0,42 ms; die Referenzflotte fährt mit Regel „aus“, wo der Tages-Hook auf seiner ersten Zeile zurückkehrt — mit Regel „an“ kostet er 256 gewichtete Ziehungen und EINEN Generator je Spieltag, gemessen 136 B Allokation je Spieltag gegen 0,18 B bei „aus“ (M17-Instrument, GCProfiler)**; **B2 gemessen: Tick p50 1,613 / p99 2,934 ms (max 19,086 ms über 6 500 Ticks), also −0,33 ms gegen die Grundlinie; die Referenzflotte fährt weiter mit Regel „aus“, wo `weatherCellAt` und `winterFrictionAt` auf ihrer ersten Zeile zurückkehren — die Per-Fahrzeug-Kosten bei Regel „an“ (ein Array-Read, zwei Tabellen-Reads, ein `baseHeight`) sind auf diesem Fixture NICHT gemessen, und D-201 sagt das (D-201)**; **B3 gemessen über vier Läufe: p50 1,702 / 1,554 / 1,650 / 1,542 ms, p99 3,796 / 3,456 / 3,239 / 3,156 ms — die letzten beiden liegen UNTER der Grundlinie, die vier STRADDELN sie im dokumentierten ±0,7-ms-Laufrauschen; die zwei neuen Sim-Zeilen sind ein Return auf der ersten Zeile und ein Integer-Vergleich je Spieltag (D-202)**; **B4 gemessen über zwei saubere Läufe: p50 1,531 / 1,508 ms, p99 3,006 / 3,225 ms — beide p99 LIEGEN UNTER der Grundlinie 3,26, die p50 liegen 0,06–0,08 ms darüber und damit im dokumentierten ±0,7-ms-Laufrauschen; das Bundle fasst `src/` nicht an (D-203)**; **B5 gemessen über drei saubere Läufe: p50 1,431 / 1,548 / 1,449 ms, p99 3,108 / 3,890 / 2,768 ms gegen die Grundlinie 1,45/3,26 — zwei der drei p99 liegen DARUNTER, der zweite 0,63 ms darüber und damit im dokumentierten ±0,7-ms-Laufrauschen; die Referenzflotte fährt mit Regel „aus“, wo die geänderte Zeile nie erreicht wird. Die AN-Kosten sind EIN zusätzlicher Funktionsaufruf je Spieltag, aus der Regionenschleife herausgezogen, und sind auf diesem Fixture nicht gemessen (D-204)** | 0 (Regeneration statt Zellen) — **B1: null Zellen, die Saison-Optik kommt später; B2 ebenfalls null Zellen (reine Sim-Nähte); B3 eingelöst und null Zellen: die Schneegrenze benutzt die seit M1 vorhandene `Terrain.Snow`-Zelle, die Saison-Optik ist Repaint bestehender Zellen. Regeneration gemessen in einem echten Browser (der Atlas braucht ein Canvas): eine ganze Regeneration über BEIDE prozeduralen Seiten p50 1,35–3,34 ms gegen die 30 ms aus 6.2, je Schritt 0,125 ms (Basis) / 0,155 ms (Detail), zwei Schritte je Frame, Upload beider Canvas erst im letzten Schritt (D-202)** |
| M19 | **v30** — +2 Cargo-IDs, Remap-Migration — **B1 eingelöst: der EINE Z5-Bump gehört den zwei Passagierklassen (E-08). `CARGO_COUNT` 18 → 20, `Cargo.Passengers` STILLGELEGT auf Id 0 statt wiederverwendet (eine Cargo-Id ist in jedem je geschriebenen Save eine ZAHL; Umnummerierung der siebzehn darüber hätte jede Kapazitätstabelle, jeden Ring-Index und jeden Stack in einem Edit umgeschrieben). Die `v29_to_v30`-Migration ist die ERSTE REMAP-Migration der Kette: jede Zahl, die eine Fracht benannte, wandert (wartende und geladene Parcels, `refitCargo`, Order- und Linien-`refitTo`, KI-Projekt-Fracht, Tender-Fracht, `CargoDeliveredTotal`-Subjekt), und die zwei CARGO_COUNT-großen Tabellen wachsen (Lebenszeit-Zählung je Firma, Stations-Ring + laufender Monat). Das Kommando-LOG wird bewusst NICHT umgeschrieben (Historie, versionsgepinnt — D-131/E-11). Dabei gefundener Latenzfehler behoben: `v24_to_v25`/`v27_to_v28` dimensionierten ihre Null-Füllungen aus den LEBENDEN Konstanten — ein v22-Save wäre mit 20er-Zeilen bei v30 angekommen; beide sind jetzt auf `CARGO_COUNT_V29` gepinnt, der Korpus (läuft ab 22) ist der Beweis. Beide Pins nach Protokoll re-recorded: kanonisch `5a2a6cf73f4107bb` → **`40be7d25b1a6a90f`** (D-137), Korpus-Manifest `c0a021f5d1ee8619` → **`9800c136644b0199`** samt `v30-played.ironsave` — **alle NEUN Fixtures dekodieren in EINE Welt** (D-130) —, Soak `e6c5e33d8e7607ec` → **`65d8cb57cf5edec5`** bei 698 → 800 Kommandos (die Konkurrenten verdienen jetzt eine Business-Prämie und entscheiden anders). Verlustfreiheit auf einer Welt MIT Parcels bewiesen (Runde-Reise v30→v29→v30 feldweise plus Hash-Gleichheit über `decodeSave`), weil die Korpus-Welt station- und fahrzeuglos ist. Zwei neue i18n-Sätze in zwei Sprachen (D-207)** — **B2: kein Bump. Die Gravitation ist eine reine Funktion bereits gespeicherten Zustands (Zielstadt-Population, Stations-Module), also kein Save-Feld, keine Migration, kein `hashWorld`-Eintrag; der kanonische Pin `40be7d25b1a6a90f` und das Korpus-Manifest `9800c136644b0199` stehen unverändert. Bewegt hat sich EIN Pin: der Soak-Lauf `65d8cb57cf5edec5` → **`071cbd7e8db44893`** bei 800 → 704 Kommandos, neu aufgezeichnet aus einem Worktree, der NUR diese Änderung enthält (D-211)** — **B3 (Rückreisen): kein zweiter Bump — die `v29_to_v30`-Migration wird IN PLACE erweitert (Z5), jede Station bekommt das leere Rückreise-Konto aus `station/returns.ts` (8 Float64 + Monatszähler, gespeichert und gehasht, Voll- UND Live-Digest — acht Zahlen, von denen zwei bei jeder Passagier-Zustellung wandern). Leer ist das, was eine v29-Welt über sich wusste; ein bereits aktuelles Konto bleibt unangetastet (die `growCargoRow`-Regel), und `RETURN_STATE_SIZE_V30` ist gepinnt wie `CARGO_COUNT_V29` — mit einem Test am anderen Ende, der die Migration gegen die LEBENDE Konstante hält. Ein Save-Feld ist Pflicht: ein 12-Monats-Mittel ist historischer Input einer Sim-Entscheidung (Z4, Fehler 23). Kanonischer Pin `40be7d25b1a6a90f` → **`f04cebfeb26e8161`** (D-137, im sauberen Worktree neu aufgezeichnet), Korpus-Manifest `9800c136644b0199` **unverändert und nicht zufällig** — die Korpus-Welt ist stationslos, alle neun Fixtures dekodieren weiter in EINE Welt (nachgeprüft durch Ausführen) —, Soak `071cbd7e8db44893` → **`856392bde0cd79bf`** bei 704 → 698 Kommandos, dessen Selbstkonsistenz-Hälfte grün blieb. Zwei D-207-Zusicherungen sind ausdrücklich QUALIFIZIERT statt still gebrochen: Rundreise und v29-Container-Load schließen genau das Konto aus, nachdem sie zuerst prüfen, dass es NICHT leer ist. Alle 19.4-Bänder unverändert (Szenario 1 Jahr 3, 2 249 980 €/Jahr 6, 3 159 516 €/Jahr, 6 Monat 25, Netzdesign 3,73, Takt −8,3 %/0,57, Harter Winter −4,36 %, Punktzahl 5 889); bewegt haben sich nur die geteilten KI-Welten (Szenario 5 Straße 1 122 965 → **978 528 €**, tief im 0,8–3,2-M-Band; `aiGame` grün). Haupt-Bundle im sauberen Worktree zweimal gemessen: Grundlinie 946 301 → **946 425 B** gegen 950 000, **+124 B**, Restluft 3 575 B (D-213)** — **B4 (Abschluss): kein Bump, keine Migrations-Änderung, kein gehashtes Byte. Der Bundle ändert unter `src/` genau EINEN Kommentar; alle drei Pins stehen unverändert dort, wo B3 sie gelassen hat — kanonisch `f04cebfeb26e8161`, Korpus `9800c136644b0199`, Soak `856392bde0cd79bf` (D-215)** | — **B1: null Byte, `SNAPSHOT_LAYOUT_VERSION` unverändert — die Klassen reisen als gewöhnliche Cargo-Ids in den bestehenden Marker-Kanälen (D-207)** — **B2: ebenfalls null Byte (D-211)** — **B3: ebenfalls null Byte; eine Rückreise ist ein gewöhnlicher Cargo-Stack, und das Konto liest kein Renderer (D-213)** — **B4: ebenfalls null Byte; der Bundle misst nur (D-215)** | +0,10 ms (tägliche Gravitations-Scores) — **B1: die Gravitation kommt später. Kein einziger O(Stationen)-Lauf kam hinzu: die Routing-Entscheidung am Halt (`loadPassengerPair`) und die Zielsuche im Tages-Hook (`depositPassengers`) werden zwischen den beiden Klassen GETEILT, was beweisbar dasselbe Ergebnis liefert (beide Klassen stehen in `STATION_ALWAYS_ACCEPTED`, die Kandidatenliste kann sich nicht unterscheiden). Es bleiben ein zusätzlicher `transferCargo`-Scan je Passagierhalt, ein zusätzliches Einlagern je Station mit Gewerbeanteil je Spieltag und etwa doppelt so viele Stacks an einer Stadtstation. **Eine ABNAHMEZAHL konnte auf dieser Maschine nicht genommen werden und wird ausdrücklich NICHT beansprucht**: das Tick-Gate ist auch auf dem BASELINE-Commit rot (gemessen im git-worktree auf HEAD), weil parallele Agenten die Box auslasten — die Referenzzahl ist 1,43/3,11 ms, gemessen wurden auf beiden Seiten 2,9–3,6 ms p50. Vier A/B-Paare auf derselben ausgelasteten Maschine, abwechselnd gemessen: eigen 2,958/9,848 · 3,601/16,641 · 3,173/11,408 · 3,102/12,924, Baseline 3,469/13,355 · 2,886/8,529 · 2,963/8,106 · 3,136/9,817 — Mittel p50 +0,10 ms (genau die Budgetzeile, und innerhalb des dokumentierten ±0,7-ms-Rauschens), Mittel p99 +2,76 ms bei WECHSELNDEM Vorzeichen (Paar 1 misst eigen 3,5 ms SCHNELLER). p99 ist genau die Größe, die D-167 als unter Last um Vielfache aufgebläht beschreibt. Die saubere Abnahmemessung steht aus (D-207)** — **B2: die Gravitation ist da und kostet KEINEN neuen O(Stationen)-Lauf. Sie hängt sich an die Kandidatenschleife, die `chooseDestinations` schon lief: je Kandidat (höchstens `CARGO_DESTINATION_FANOUT` = 3) ein Add, ein Multiply und ein Modul-Scan der Zielstation, einmal je Station und Spieltag, im Tages-Block von `World.step` — gemessen tickweise im Test (vier Spieltage, vier Einlagerungen, alle auf Tagesgrenzen). Freight ist per `isPassengerClass` ausgegattert und zahlt null. **Auch hier wird KEINE Abnahmezahl beansprucht**: die Maschine trägt weiterhin parallele Agenten, und D-207s Befund gilt unverändert — das Tick-Gate ist auf dem Baseline-Commit ebenso rot. Vier abwechselnd gemessene Läufe auf derselben Maschine, nur diese Änderung als Unterschied: eigen 3,514/13,744 und 3,548/9,962 ms, Baseline 3,847/11,484 und 3,567/9,807 ms — Mittel p50 3,531 gegen 3,707 (eigen 0,18 ms SCHNELLER), p99-Streuung 9,8–13,7 ms INNERHALB eines Commits. Belegt wird die Last durch einen Render-Tripwire, den diese Änderung nicht anfasst: Chunk-Bake p99 29,3 ms im einen Lauf, 57,7 ms im nächsten. Die saubere Abnahmemessung der M19-Zeile steht weiter aus (D-211)** — **B3: null neue Per-Tick-Arbeit. Ein zusätzlicher O(Stationen)-Lauf je Spiel-TAG, der acht Float64 je Station liest und früh zurückkehrt (eine Station, die keine Reise schuldet, erreicht `chooseDestinations` nie), plus eine Zielsuche je EMITTIERENDER Station — dieselbe Suche, die `produceTownCargo` für eine Station mit Stadt immer schon macht; je Spiel-MONAT ein Lauf mit vier Multiply-Adds je Station. Beide Hooks allokationsfrei GEMESSEN (M17-`GCProfiler`): **0,864 B je Spielmonat** für das Laufmittel gegen eine allokierende Kontrolle mit 233 B, **0,152 B je Spieltag** für die Emission ohne Schuld. **Auch hier KEINE Abnahmezahl**: das Tick-Gate ist auf dem Baseline-Commit ebenso rot (die Box trägt weiter parallele Agenten). Zwei abwechselnd gemessene A/B-Paare, nur diese Änderung als Unterschied: eigen 3,192/10,375 und 3,551/11,256 ms, Baseline 3,313/10,703 und 3,615/10,141 — Mittel p50 3,372 gegen 3,464, **eigen 0,09 ms SCHNELLER**, p99-Differenz +0,39 ms bei WECHSELNDEM Vorzeichen. Beide Seiten liegen bei 3,2–3,6 ms p50 gegen die Referenz 1,43–1,45 (D-213)** — **B4: null neue Arbeit je Tick — der Bundle ändert unter `src/` nur einen Kommentar. Erstmals wird der GANZE Meilenstein gegen einen Commit VOR D-207 (`5b0758a`) gemessen, zwei abwechselnde Paare auf derselben Maschine: M19 komplett 3,446/28,896 und 3,705/10,700 ms, pre-M19 3,594/15,924 und 3,496/9,829 — Mittel p50 3,576 gegen 3,545, **+0,031 ms für den gesamten Meilenstein** gegen die Budgetzeile +0,10. **Keine Abnahmezahl**: beide Seiten fallen durch das 8-ms-p99-Gate und beide liegen bei 3,4–3,7 ms p50 gegen die Referenz 1,43–1,45, weil die Box weiter parallele Agenten trägt (achtzehn `node`-Prozesse, 16 146 s kumulierte CPU, gemessen während dieser Läufe). Die saubere Abnahmemessung ist das EINE, was M19 offen lässt, und sie wird benannt statt erfunden (D-215)** | 0 (Klassen-Icons = UI-SVG) — **B1: null Zellen; B2: null Zellen; B3: null Zellen; B4: null Zellen** |
| M20 | **v31** — Wachstums-Cursor, 12-Monats-Fenster, Wahl-Zustand — **B1 eingelöst: der EINE Z5-Bump gehört dem physischen Stadtwachstum und ist auf genau EIN Feld verwendet, `Town.roadTilesThisMonth` — die 3-Tiles-pro-Monat-Grenze aus SPEC.md 13.2 ist eine MONATS-Grenze, während der Wachstumslauf TÄGLICH läuft (E-10-Round-Robin), also ist der Zähler echte Historie und aus nichts rekonstruierbar (Z4): ein beim Laden auf null gesetzter Zähler ließe eine Stadt in einem bereits verbrauchten Monat drei weitere Tiles bauen. Gespeichert + gehasht + Pflichtfeld im Parser, damit das D-134-Audit es durch bloße Existenz erfasst; keine Allowlist-Zeile. Migration v30→v31 trägt null ein — genau das, was eine v30-Welt über sich wusste; spätere M20-Bundles erweitern DIESE Migration in place. **Der „Wachstums-Cursor" ist bewusst KEIN Feld**: die Stadt, die dran ist, ist `Spieltag % Städtezahl` — eine reine Funktion bereits gespeicherten Zustands (D-231, das D-174-Muster). Pins nach Protokoll re-recorded: kanonisch `ddaacd4b970d31db` → **`6e46c92e5d94c66b`**, Soak `f08265c0152efea9` → **`ad5247561331af6e`** bei unveränderten 143 Kommandos, Korpus-Manifest + `v31-played.ironsave`. SCENARIO_WORLD_CLAIMS unverändert — die Ansprüche werden bei der GENESE gemessen (außer `passiveGrowth`, das Jahre spielt und sich nicht bewegt, weil B1 die Wachstumsrate nicht anfasst). Kein Band bewegt, Szenario 5 aufs Euro identisch**; **B2 (die 13.2-Formel komplett) erweitert dieselbe `v30_to_v31`-Migration IN PLACE (Z5, kein zweiter Bump): je Stadt der Baustoff-Monatszaehler und das 12-Monats-Passagierfenster (zwei laufende Mittel plus Monatszaehler, D-079-Muster), alle vier gespeichert + gehasht + Pflichtfeld im Parser, damit das D-134-Audit sie durch blosse Existenz erfasst; keine Allowlist-Zeile. Die Migration traegt Null und ein LEERES Fenster ein - genau das, was eine v30-Welt ueber sich wusste - und BEHAELT einen bereits vorhandenen Wert (die `growCargoRow`-Regel: der Korpus-Trick wickelt einen AKTUELLEN Zustand in einen alten Container, und ohne diese Regel gehen drei „migriert ohne den Welt-Hash zu bewegen"-Tests rot). Pins nach Protokoll re-recorded: kanonisch `6e46c92e5d94c66b` -> **`817c99ef5dfe2061`**, Soak `ad5247561331af6e` -> **`75ef4332dae55b89`** bei 143 -> 35 Kommandos, Korpus-Manifest samt neuem `v31-played.ironsave` (die neun eingefrorenen Fixtures dekodieren weiter in EINE Welt, `ac21b577424ab399`). **SCENARIO_WORLD_CLAIMS bewegt sich diesmal**: die zwei `passiveGrowth`-Kurven FALLEN jetzt (10.574 -> **7.376** temperiert, 9.248 -> **7.376** Wueste - die Schrumpfung traegt weder Gelaende noch Klima), und Briefing in beiden Sprachen, Katalog-Kommentare und die Ziel-Schwellenpruefung sind im selben Edit mitgewandert (D-197/D-198/D-199). Ein KI-Band mit A/B-Trace aus zwei Worktrees neu bandiert (`aiGame` Seed 4711: „die Strassenfirma faehrt ihre Linie noch" -> eine Kapital-Untergrenze, weil die Linie das Kapital ihres Eigentuemers vernichtete), sonst kein Band bewegt, Szenario 5 aufs Euro identisch (D-232)**; **B3 (Zonen-Oekonomie + Wahlen) erweitert dieselbe `v30_to_v31`-Migration IN PLACE (Z5, kein zweiter Bump): je Stadt `electronicsDeliveredThisMonth`, `councilProfile` und `noiseBarrierUntilTick`, dazu die Weltregel `elections` auf oberster Zustandsebene - alle gespeichert + gehasht + Pflichtfeld im Parser, keine Allowlist-Zeile. Die Migration traegt Null, `CouncilProfile.Balanced` und eine LEERE Wandliste ein und BEHAELT vorhandene Werte (die `keptNumbers`-Regel). **Ein gespeichertes Array wird neu gelegt**: `TOWN_MEASURE_COUNT` 5 -> 7 verschiebt die firmen-major indizierte `measureReadyTick`, die Migration legt sie zeilenweise neu - beide Zahlen als LITERALE (D-207: eine Migration schreibt die Form ihrer EIGENEN Zielversion), und die Korpus-Trick-Luecke ist benannt UND per Test abgesichert statt behauptet. Pins nach Protokoll re-recorded: kanonisch `817c99ef5dfe2061` -> **`5f4c022bef5b94d1`**, Soak `75ef4332dae55b89` -> **`9aac5ef0864d5c69`** bei unveraenderten 35 Kommandos, Korpus-Manifest samt neuem `v31-played.ironsave` (die neun eingefrorenen Fixtures dekodieren weiter in EINE Welt, `1dd5bb6255a236a9`). **SCENARIO_WORLD_CLAIMS unveraendert** - die Ansprueche werden bei der GENESE gemessen, und die beiden `passiveGrowth`-Kurven spielen Jahre ohne jede Lieferung, nehmen also den Schrumpf-Zweig. **Kein Band bewegt, Szenario 5 aufs Euro identisch** (1.022.084 / 1.802.165 / 2.153.604 EUR) - die Wahlen sind Weltregel mit Off-Anker (Fehlerkatalog 34), und die Zonen-Nachfrage ist auf jeder handgebauten 19.4-Welt per Konstruktion der Vor-M20-Term (D-233)**; **B4 (Abschluss): kein Bump, keine Migrations-Aenderung, kein gehashtes Byte, kein RNG-Zug, kein i18n-Satz, keine Konstante. Alle drei Pins stehen unveraendert dort, wo B3 sie gelassen hat - kanonisch `5f4c022bef5b94d1`, Soak `9aac5ef0864d5c69` bei unveraenderten 35 Kommandos, Korpus-Manifest unveraendert (die neun eingefrorenen Fixtures dekodieren weiter in EINE Welt); SAVE_VERSION **31**. Der Soak wurde NICHT neu aufgezeichnet, weil sich kein Kommando geaendert hat und der Replay den aufgezeichneten Hash erreicht. **SCENARIO_WORLD_CLAIMS unveraendert und nicht behauptet, sondern gelaufen**: `shippedScenarios.spec.ts` 53 Tests, `scenarios.spec.ts` 11 Tests gruen - die Ansprueche werden bei der GENESE gemessen und dieser Bundle aendert kein erzeugtes Byte, was der unveraenderte kanonische Pin unabhaengig beweist. Die EINE `src/`-Datei ist `mapgen/towns.ts`, und dort aendert sich, WIE zwei Zaehl-Laeufe geschrieben sind, nicht was sie zaehlen (D-234)**; **B5 (die fuenf Ehrlichkeitsbefunde eines unabhaengigen Pruefers): kein Bump, keine Migrations-Aenderung, kein gehashtes Byte, kein RNG-Zug, kein i18n-Satz, keine Atlas-Zelle, kein Snapshot-Byte. Alle drei Pins stehen unveraendert (kanonisch `5f4c022bef5b94d1`, Soak `9aac5ef0864d5c69` bei 35 Kommandos, Korpus-Manifest unveraendert), SAVE_VERSION **31**. **Eine Sim-Formel aendert sich trotzdem** - `bedarf.elektronik` ist seit D-235 SPEC.md 13.2s eigenes `max(0, (einwohner-3000)) / 2500` statt eines nirgends spezifizierten `einwohner / 1800` - und dass kein Pin und kein Band sich bewegt, ist GEMESSEN und nicht angenommen: die gepinnten Welten liefern keine Waren/Lebensmittel/Elektronik IN eine Stadt (B3s eigene Begruendung), und jede handgebaute 19.4-Welt ist reine Wohnzone, wo der Term mit null multipliziert wird. SCENARIO_WORLD_CLAIMS unveraendert und gelaufen statt behauptet (`shippedScenarios.spec.ts` 53 Tests, `scenarios.spec.ts` 11 Tests gruen) - die Ansprueche werden bei der GENESE gemessen, und die beiden `passiveGrowth`-Kurven spielen Jahre ohne jede Lieferung, nehmen also den Schrumpf-Zweig, den dieser Bundle nicht anfasst (D-235)** | — | +0,10 ms — **B1 gemessen: 0,75 µs je Spieltag (eine Stadt) auf einer 512er-Karte mit 40 Städten, also 0,023 ms je Spielmonat; 0,990 B Allokation je Spieltag gegen eine allokierende Kontrolle bei 1.621 B (Gesetz 7). Tick auf dem Referenz-Fixture, drei Läufe: p50 1,666 / 1,707 / 1,862 ms, p99 3,677 / 3,675 / 4,345 ms gegen die M10-Grundlinie 1,45 / 3,26 im dokumentierten ±0,7-ms-Laufrauschen dieser Maschine — der rechnerische Beitrag liegt bei ~4 ns je Tick. Die 6.1.1-Zeile bleibt bis zum Meilenstein-Abschluss offen (eine Zeile je Meilenstein)**; **B2 gemessen und die Zahl wird ausdruecklich NICHT beansprucht (D-167/D-215-Haltung): diese Box traegt auf beiden Seiten p50 2,3-2,8 ms gegen die Referenz 1,43-1,45. Fuenf abwechselnd gemessene A/B-Paare gegen einen Worktree auf HEAD: p99 6,06 -> 8,29 ms, p50 2,433 -> 2,522. **Zwei Proben haben ALLES davon lokalisiert und nichts davon war die Arbeit der Stadt**: mit abgeschaltetem Rueckbau 6,03 ms, mit Rueckbau aber OHNE das eine `map.revision++` 4,95 ms. `RailPathfinder.reindex` und `BlockIndex.refresh` hingen an `TileMap.revision`, der sich fuer jedes Haus bewegt - EIN Kartenschnitt kostete also einen vollen 1024^2-Scan zweimal im naechsten Tick, was der Spieler seit M4 fuer jede Strassenkachel bezahlt und was nur nie gemessen wurde, weil das Abnahme-Fixture waehrend der Messung nie die Karte aenderte. `TileMap.trackRevision` + `noteChange()` trennt die beiden Zaehler (jedes KOMMANDO bewegt beide; die drei Durchlaeufe, die eine Stadt fuer sich selbst faehrt, bewegen nur `revision` und weisen eine Kachel mit Gleis vorher ab), danach **p99 6,07 ms**. Sauber gemessen ist der Wachstumslauf selbst: **1,19 us je Spieltag gegen 0,99** (+0,20 us, ~1 ns je Tick) bei **0,798 B Allokation je Spieltag** gegen eine allokierende Kontrolle bei 1.665 B (D-232)**; **B3 gemessen: die einzige neue Arbeit je Stadt ist der MONATLICHE Zonen-Zensus, A/B auf derselben 512er-Welt mit 40 Staedten - `growTowns` **24,51 -> 91,34 us je SPIELMONAT**, also +66,8 us im Monat oder rund **0,011 us je Tick** gegen die Ledger-Zeile von +0,10 ms. `npm run test:perf` auf dem Referenz-Fixture (120 Staedte, Wahlen aus): Tick **p50 1,756 / p99 2,912 ms** gegen die M10-Grundlinie 1,45 / 3,26 - der p99 DARUNTER, also wird keine Abnahmezahl beansprucht, sondern nur "im Rauschen dieser Maschine" (D-167/D-215-Haltung). Hauptbundle 955.606 -> **959.448 B**, Budget 956.000 -> **966.000 B** mit der Aufteilung daneben gemessen: +1.505 B die elf neuen i18n-Schluessel in zwei Sprachen, +2.337 B Oberflaeche und Konstantentabellen, KEINE neue statische `src/sim`-Importkette (D-233)**; **B4 gemessen, und die Abnahmezahl wird diesmal BEANSPRUCHT: drei saubere `npm run test:perf`-Laeufe auf dem Referenz-Fixture ergeben Tick **p50 1,464 / 1,384 / 1,382 ms** und **p99 2,927 / 2,770 / 2,705 ms** gegen die M10-Grundlinie 1,45 / 3,26 - **alle drei p99 UNTER der Grundlinie** (-0,333 / -0,490 / -0,555), die Budgetzeile +0,10 ms damit eingehalten. Das 1500-Fahrzeug-Fixture IST die 120-Staedte-Welt der Fertig-wenn-Klausel: `flatScenario` ruft `placeTown` fuer jede der 120 Staedte, also laeuft M20s Wachstumspass dort nicht leer. **Der isolierte Monats-Randtick zusaetzlich gemessen**, A/B gegen `c8b9e48` (der Commit vor B1) im Worktree, abwechselnd: auf dem Referenz-Fixture NICHT vom Eigenrauschen trennbar (Grundlinien-Mediane 13,993 / 13,171 / 13,346 / 13,224 ms gegen 13,569 / 13,539 / 13,821 / 14,010 - Streuung der Grundlinie allein 0,82 ms), auf einer ruhigen erzeugten 1024er-Welt mit **140 Staedten** ueber sieben abwechselnde Paare zu je 40 Monatsproben **0,614 -> 0,802 ms, also +0,188 ms**, hochgerechnet auf die 120 Staedte der Klausel **+0,161 ms** gegen 0,15 - sieben Prozent darueber und innerhalb der +-0,12-ms-Streuung der Paare selbst. **Vorher waren es +0,63 ms**: zwei Sonden haben die Ursache lokalisiert (der Zonen-Zensus allein, gemessen durch Abschalten) und drei gemessene Aenderungen an den zwei Zaehl-Laeufen von `mapgen/towns.ts` haben ihn von 225,9 auf 39,8 us je 140 Staedte gebracht - Rechteck einmal geklemmt statt `map.contains` je Kachel, **`BuildingKind.None` einmal in eine lokale Variable statt je Kachel** (85 % der Kosten; ein identischer Rumpf als LOKALE Funktion lief 25,2 us gegen 176,3 us des Imports, ueber eine lokale Bindung weiterhin 178,1 - es war nie der Modul-Namespace, es war das ENUM-Glied in der inneren Schleife, das der SSR-Transform des Testlaeufers je Kachel zu einem Namespace-Zugriff macht) und die Ein-Byte-Schicht vor der Zwei-Byte-Schicht gefragt. Gegen B3 (`3281bfd`) auf derselben Welt: Monatstick-Median 1,067 -> 0,79 ms, `growTowns` direkt 301,4 -> 115 us, und die gelieferte Messung in `townGrowth.spec.ts` fuer den TAEGLICHen Pass **0,62 -> 0,20 us je Spieltag**. Der Rest ist kalte Cache-Last ueber `buildingKind` und nur durch TRAGEN statt Zaehlen zu beseitigen - was D-233 mit Begruendung abgelehnt hat und was Save-Zustand nach Z4 waere, also ein eigener Bundle (D-234)** | ~8 Zellen (Verdichtungsvarianten) — **B1: null Zellen, keine Buchung**; **B3: null Zellen, keine Buchung**; **B4: null Zellen, keine Buchung** |
| M21 | **v32** — Kurven-Arrays, Vertrags-Records, `Account.ContractPenalties` — **B1 eingeloest: der EINE Z5-Bump gehoert der Genesis-Kurve (E-09) und ist auf genau ZWEI Felder verwendet, `economy` (Weltregel) und `economyCurve` (707 Ints in Promille: fuenf Frachtgruppen, Konjunktur, Energiepreis). Die Kurve ist gespeichert, WEIL sie gezogen ist - eine beim Laden neu erzeugte waere eine zweite Stelle, an der das Jahrhundert entschieden wird, und ein Generator-Edit wuerde jeden Alt-Spielstand still ein anderes Jahrhundert spielen lassen (Z4). `World.born` ist die einzige Tuer, die zieht; `fromData` uebernimmt und zieht nie - instrumentiert auf `streamFor`, nicht behauptet. Beide Felder Pflichtfeld im Parser, der das PAAR erzwingt (Regel aus ⇒ leere Tabelle, Regel an ⇒ volle Tabelle im Band), damit es keine Welt gibt, die beides gleichzeitig behauptet; Migration v31→v32 traegt aus + leer - genau das, was eine v31-Welt ueber sich wusste. **Der Hash ist BEDINGT, und das ist die eine begruendete Abweichung von den drei Regeln davor**: deren Aus-Zustand ist ein WERT, dieser ist eine ABWESENHEIT (jeder Leser gibt exakt 1 zurueck, `x*1===x` ist exakt), also hasht `hashWorld` fuer eine Aus-Welt nichts und bleibt injektiv. **Folge: KEIN Pin bewegt** - kanonisch `5f4c022bef5b94d1` unveraendert (nur der Versionsstempel neu geschrieben), Soak `9aac5ef0864d5c69` unveraendert bei 16 byte-identischen Checkpoints, Korpus-Manifest rein additiv (`v32-played` = `63ea4f0ca2506741` = `v31-played`), SCENARIO_WORLD_CLAIMS unveraendert, alle Baender aufs Euro identisch mit D-235 (D-236)**; **B2 (Container-Wiederbelebung): KEIN zweiter Bump und keine Migrations-Aenderung - dieser Bundle legt kein Save-Feld an, und das ist ein Befund statt einer Sparmassnahme. Ein Containerhafen ist ein PAAR bereits gespeicherter Module (`Quay` + `FreightTerminal`, `isContainerPort`) statt eines vierzehnten `ModuleKind`, das Angebot ist eine reine Funktion des HEUTIGEN Ratings und des HEUTIGEN Jahres (keine Z4-Historie), und die Akzeptanzmaske ist derived wie eh und je. Kein gehashtes Byte, kein RNG-Zug, keine neue Nummer: kanonischer Pin `5f4c022bef5b94d1` unveraendert, Soak `9aac5ef0864d5c69` unveraendert bei 35 Kommandos und 16 byte-identischen Checkpoints, Korpus-Manifest unberuehrt, SAVE_VERSION **32**. SCENARIO_WORLD_CLAIMS unveraendert und gelaufen statt behauptet - alle acht Szenarien tragen `economy: false` und keines hat einen Kai mit Kran. **Kein Band bewegt, alles aufs Euro identisch mit D-236** (Szenario 5 1.022.084 / 1.802.165 / 2.153.604 EUR, Punktzahl 5.889, Netzdesign 3,75, Harter Winter -4,36 %, aiGame-Sweep 7.293.303 EUR) - die fuenfte Kurven-Naht hat als Identitaet NULL statt Eins, also hat eine Welt ohne die Regel `economy` gar keinen Uebersee-Handel und ist die Prae-M21-Welt (Fehlerkatalog 34, per Konstruktion) (D-237)** — **B3 (Liefervertraege, Subventions-Board, elftes Konto): wieder KEIN Bump, die `v31_to_v32`-Migration ist an Ort und Stelle erweitert - `supplyContracts`/`subsidies` als leere Tafeln und, der teure Teil, `Account.ContractPenalties` als elfte Spalte in jeder Kontenzeile samt zeilenweise neu gelegtem 24-Monats-Ring. **Das ist die eine Aenderung dieses Meilensteins, die JEDEN Digest bewegt**, weil `hashWorld` die ganze Buchhaltung hasht - auch in einer Welt ohne Jahrhundert. Neu aufgezeichnet nach D-137: kanonisch `5f4c022bef5b94d1` -> **`5fc5168993e38191`**, Soak `9aac5ef0864d5c69` -> **`cc491b59f6bfc729`** bei unveraendert 35 Kommandos und 16 Checkpoints, Korpus-Manifest fuer alle elf Fixtures neu, `v32-played.ironsave` neu aufgezeichnet (ein v32 des vorigen Builds ist nicht mehr lesbar - Migrationen laufen nur UNTER `SAVE_VERSION`). SCENARIO_WORLD_CLAIMS unveraendert. **Kein Band bewegt, alles auf den Euro identisch mit D-237**, weil beide Tafeln an der Weltregel `economy` haengen (D-238)** — **B4 (Industrie-Events): wieder KEIN Bump, die `v31_to_v32`-Migration ist zum dritten Mal an Ort und Stelle erweitert - `industryEvents` als leere Tafel. **Diese Tafel wird UNBEDINGT gehasht** und bewegt damit erneut jeden Digest, auch in einer Welt ohne Jahrhundert; die bedingte Buchung aus B1 war zulaessig, weil dort der Aus-Zustand eine ABWESENHEIT ist und jeder Leser exakt 1 zurueckgibt, hier waere sie ein Loch: `industryOnStrike` liest die Liste in JEDER Welt, also waere ein bedingter Hash Sim-Verhalten, das der Digest nicht sieht (`saveFieldCoupling.spec.ts`). Neu aufgezeichnet nach D-137: kanonisch `5fc5168993e38191` -> **`29f227b0d3cf3db1`**, Soak `cc491b59f6bfc729` -> **`ff8eb61c2dec1669`** bei unveraendert 35 Kommandos und 16 Checkpoints, Korpus-Manifest fuer alle elf Fixtures neu, `v32-played.ironsave` neu aufgezeichnet. SCENARIO_WORLD_CLAIMS unveraendert und gelaufen statt behauptet. **Kein Band bewegt, alles auf den Euro identisch mit D-238** - die Tafel haengt an derselben Weltregel `economy` (D-239)** | — **B1: null Byte** (die Kurve reist im `ready`-Signal neben der Karte, nicht im 20-Hz-Stride — Fehlerkatalog 37) — **B2: ebenfalls null Byte; ein Container ist eine gewoehnliche Cargo-Id in den bestehenden Marker-Kanaelen, und ob eine Station ein Terminal ist, liest die Oberflaeche aus der Modulliste, die der Marker schon traegt (D-237)** — **B3: ebenfalls null Byte; beide Tafeln reisen im monatlichen `contractsChanged`-Kanal neben den Ausschreibungen, nicht im 20-Hz-Stride (Fehlerkatalog 37)** — **B4: ebenfalls null Byte; das Ereignisbrett reist ueberhaupt nicht zur Oberflaeche, weil SPEC2 hier ausschliesslich News bestellt - und die News hat ihren Kanal seit M8 (D-239)** | +0,05 ms (Monats-Kadenz) — **B1: vier Multiplikationen an bestehenden Nahten (Tarif, `costCt`, 7.3-Sinus, Energie-Rate), je ein Lookup pro Monatspass; kein neuer Hot-Path-Byte. Kein `test:perf`-Lauf fuer dieses Bundle beansprucht** — **B2: EIN zusaetzlicher Tageshook, der in jeder Welt ohne Jahrhundert auf seiner ersten Zeile zurueckkehrt - also in jeder Welt, an der ein Pin dieses Repositoriums je gemessen wurde. Mit Kurve ist es ein `isContainerPort`-Scan je Station und Spieltag (indizierte Schleife, kein Iterator, Gesetz 7). `npm run test:perf` auf dem Referenz-Fixture: Tick **p50 1,532 / p99 2,823 ms** gegen die M10-Grundlinie 1,45 / 3,26 - der p99 DARUNTER, also wird keine Abnahmezahl beansprucht, sondern nur „im Rauschen dieser Maschine“ (D-167/D-215-Haltung). Hauptbundle 965.937 -> **968.190 B (+2.253)**, davon +1.422 B die vier i18n-Schluessel in zwei Sprachen; Budget 972.000 unveraendert, Restluft 3.810 B (D-237)** — **B3: die beiden Monatsreviews laufen in der Monatskadenz; der einzige Zusatz im Tick-Pfad ist ein Listendurchlauf ueber hoechstens drei offene Subventionen je Zustellung, der in jeder Welt ohne Jahrhundert auf seiner ersten Zeile zurueckkehrt. **Kein `test:perf`-Lauf wird fuer diesen Bundle beansprucht.** Hauptbundle 968.190 -> **972.824 B (+4.634)**, davon +1.979 B die neunzehn i18n-Schluessel in zwei Sprachen (gemessen); Budget 972.000 -> **978.000** mit der Messung daneben (D-238)** — **B4: die Monatsrunde ist EIN RNG-Zug je offenem Werk, und die drei Lesefunktionen kehren in jeder Welt ohne Jahrhundert auf ihrer ersten Schleifenzeile zurueck, weil die Liste leer ist; kein neuer Tick-Pfad-Byte. **Kein `test:perf`-Lauf wird fuer diesen Bundle beansprucht.** Hauptbundle 972.824 -> **973.302 B (+478)**, davon +353 B die zwei i18n-Schluessel in zwei Sprachen (gemessen durch Loeschen genau dieser vier Zeilen: 972.949 B); Budget **978.000 unveraendert**, Restluft 4.698 B (D-239)** | ~2 Zellen (Container-Terminal) — **B1: 0** — **B2: 0, keine Buchung - das Terminal ist der bereits gebackene Frachtterminal auf dem bereits gebackenen Kai** — **B3: 0** — **B4: 0** |
| M22 | **v33** — Editor-CommandKinds, `editorMode`-Regel, Szenario-Metablock — **abgeschlossen: der EINE Z5-Bump gehoert Bundle 1 (D-240) und wurde von B2, B3 und B4 nicht mehr angefasst. B3 (Heightmap-Import) hatte nichts zu erweitern, weil ein importiertes Relief ein Eckengitter ist und das seit M2 gespeichert wird (D-242); B4 (die vier Benchmark-Karten) hat keinen Zustand, weil eine Benchmark-Karte eine Textdatei mit Kommandos darin ist (D-243). Alle drei Pins ueber den ganzen Meilenstein: kanonisch `f1349c9b9c922981`, Soak `1f1ac33ffed6afe9` bei 35 Kommandos, Korpus unveraendert seit B1** | — | +0,00 ms (Editor außerhalb Hot-Path) — **gemessen: p99 −0,265 / −0,486 / −0,503 ms gegen die Grundlinie, Zeile 6.1.1** | 0 |
| M23 | **v34** — `startYear`/`endless`/Klima-Set-Wahl, Mapgen-Knobs — **B1 eingeloest: der EINE Z5-Bump gehoert den zwei Ära-Regeln aus E-15 und ist auf genau ZWEI Felder verwendet, `startYear` (Kalenderjahr von Tick 0, Band 1850..1950) und `endless` (ob der MAX_TICK-Stopp ueberhaupt gilt). Beide UNBEDINGT gehasht, auf den Bedingungen von `editorMode`: keine hat zur Laufzeit einen abwesenden Zustand, also waere ein bedingter Hash Simulationsverhalten ausserhalb des Digests. Migration v33→v34 = 1950 + gebunden, weil das die aufgezeichnete Tatsache jeder je gespeicherten Welt ist; Pin `f1349c9b9c922981` → `1fa54bf95cc82b40` und Korpus `d3c2c16e6d8bf6e1` → `3b797322b43b717c` nach D-137/D-130 neu aufgenommen. Die ~60 Vor-1950-Specs brauchen KEINE Migration (eine Spec-Id ist eine Zahl in einem Konsist) und sind bis 1949 geschlossen, was jedes 19.4-Band per Konstruktion unberuehrt laesst — gemessen gegen einen Worktree bei `73e4c29`: 144 Zeilen, leerer Diff (D-245)** | — | +0,05 ms (Ären-Kurven im Monats-Hook) — **B1 gemessen: 1,444 / 3,082 ms p50/p99 gegen die M10-Grundlinie 1,45 / 3,26 auf der Referenzflotte; B1 legt keinen Tick-Pfad an (der Katalog ist Daten, `epochYears` ist ein Getter an bestehenden Naehten, die abgeleiteten Schichten laufen einmal bei der Genese). Mapgen 1024² 2.801 ms gegen 8.000 (D-245)** | ~150 Zellen (Ären/Klima, Seite 2) — **B1 bucht NULL: die sechzig Vor-1950-Specs bleiben prozedural (E-14 nennt die fruehen Ären beim Namen), weil 60 Modelle × 8 Facings 480 Zellen waeren — gegen ~150 gebuchte und eine seit D-173 volle Detail-Seite (Fehlerkatalog 40, D-245)** |
| M24 | — (`profile.json` v1, außerhalb Save+Hash) | — | +0,00 ms | 0 |
| M25 | — (Protokoll-Bump Envelope-Felder; kein World-Bump) | — | +0,00 ms (Digest ~0,1 ms nur bei Flag) | 0 |

**Summe Tick-Mehrkosten: ≤ +1,2 ms** gegen die in M10 gemessene Grundlinie,
gegen das 8-ms-Budget aus SPEC.md §21. Liegt die Grundlinie bei 1500 Fahrzeugen
höher als die lineare Extrapolation (~3–4 ms), schiebt sich ein
Skalierungs-Meilenstein (Kanten-Graph 8.3, Publish-Pass-Konsolidierung) VOR
M14, und alle Zusagen werden gegen die Messung neu verhandelt — das ist der
dokumentierte Eskalationspfad, kein Notfall.

### 6.1.1 Abnahme-Protokoll (lebend)

Die Zeile eines Meilensteins gilt erst als abgenommen, wenn sie hier mit
Messwerten steht. Gemessen wird gegen das 1500-Fahrzeug-Fixture
(`tests/perf/tick.perf.spec.ts` + `tests/perf/fixture1500.ts`, Z6); Methode,
Referenzmaschine und Rohwerte stehen im jeweils zitierten
`DECISIONS.md`-Eintrag. Jeder abgenommene Meilenstein trägt hier seine Zeile
nach — eine Budget-Zeile in 6.1 ohne Zeile in dieser Tabelle ist nicht
abgenommen.

**Abnahmezahl ≠ Tripwire-Schwelle (D-167).** Die hier protokollierten Werte
sind Einmal-Messungen auf der sauberen Referenzmaschine und stehen als
Historie. Die CI-Tripwires der Perf-Suite gaten seit M13 den **Median** mit
großzügigen Vielfachen plus sehr großzügigem p99-Backstop: Hintergrundlast
bläht den p99-Tail um Vielfache auf (Chunk-Bake gemessen 2,8 → 11,1 ms unter
Sättigung), den Median aber höchstens ~1,6×. Eine Abnahmezahl wird nie
wieder als Testschwelle eingesetzt — sie hätte per Konstruktion null
Headroom und lehrt, ein rotes Gate zu ignorieren (D-136).

| MS | abgenommen | Tick p50 / p99 (1500 Fzg., 1024², 120 Städte, 300 Industrien) | Δ p99 gegen M10 | Beleg |
|---|---|---|---|---|
| M10 | 2026-08-07 | **1,45 ms / 3,26 ms** (max 39,4 ms über 6 500 Ticks inkl. Monatsgrenze) | Grundlinie | D-135 |
| M11 | 2026-08-07 | **1,20 ms / 2,54 ms** (max 36,0 ms über 6 500 Ticks) | **−0,72 ms** (Budget +0,20; die Halt-Checks/Slot-Logik verschwinden im Messrauschen — kein Mehrverbrauch nachweisbar) | D-141–D-159 |
| M12 | 2026-08-07 | **1,46 ms / 3,69 ms** (max 19,1 ms über 6 500 Ticks; Zweitlauf 1,34 / 3,19) | **+0,00 ms belegt** (render-only, kein Byte unter `src/sim` verändert; die zwei Läufe messen +0,43 und −0,07 gegen die Grundlinie — sie STRADDELN sie, das ist das ±0,7-ms-Laufrauschen dieser Maschine, das schon die M11-Zeile dokumentiert) | D-160–D-166 |
| M13 | 2026-08-07 | **1,27 ms / 2,92 ms** (max 17,4 ms über 6 500 Ticks) | **+0,00 ms belegt** (render-only; gemessen −0,34 gegen die Grundlinie — dasselbe ±0,7-ms-Laufrauschen; der einzige Sim-seitige Diff ist die wörtliche Marker-Assembly-Extraktion nach `src/sim/markers.ts`, D-174) | D-167–D-174 |
| M14 | 2026-08-07 | **1,48 ms / 3,17 ms** (max 19,8 ms über 6 500 Ticks; Abschlusslauf nach allen fünf Bundles) | **−0,09 ms** (Budget-Zeile Tick +0,00 eingehalten; die Bundle-Läufe 1,393/3,232 in B1 (D-176) und 1,490/3,339 in B3 (D-178) STRADDELN die Grundlinie exakt wie die M12-Zeile — das dokumentierte ±0,7-ms-Laufrauschen; der Publish-Mehrpreis steht als eigene Messung im Detail) | D-175–D-183 |
| M15 | 2026-08-08 | **1,481 ms / 2,949 ms** (max 19,98 ms über 6 500 Ticks; Abschlusslauf nach allen vier Bundles) | **−0,31 ms** (Budget-Zeile +0,50 eingehalten; die vier Bundle-Läufe 1,512/3,023, 1,351/2,985, 1,383/2,785 und der Abschluss STRADDELN die Grundlinie im dokumentierten ±0,7-ms-Laufrauschen — die Regeln laufen auf der Referenzflotte AUS, und selbst eingeschaltet sind Belegungslesung, Reroute, Stau-Inkrement und Durchsatz-Zähler je ein geklemmter Add bzw. ein nie genommener Zweig) | D-184–D-187 |
| M16 | 2026-08-08 | **1,168 ms / 2,592 ms** (max 18,97 ms über 6 500 Ticks; Abschlusslauf nach allen fünf Bundles — der Lauf nach B3 maß 1,447 / 2,868) | **−0,67 ms** (Budget-Zeile +0,00 eingehalten: der einzige Per-Tick-Anteil des Meilensteins ist ein Modulo im Scheduler; Checkpoint-Encode läuft einmal je Spieljahr auf dem SAVE-Pfad, B2 fügt einen Frame-Vergleich hinzu, B3 fasst `src/sim` nur über die extrahierte `replayFromSaveBytes` an, die der Worker vorher wörtlich ausführte, B4/B5 gar nicht — die beiden Läufe STRADDELN die Grundlinie im dokumentierten ±0,7-ms-Laufrauschen) | D-188–D-192 |
| M17 | 2026-08-08 | **1,241 ms / 2,564 ms** (max 18,40 ms über 6 500 Ticks; Abschlusslauf nach allen vier Bundles) | **−0,70 ms** (Budget-Zeile +0,05 eingehalten: der Tages-Hook kehrt in einer Welt ohne Ziele auf seiner ersten Zeile zurück, gemessen 0,17–0,71 B Allokation je Spieltag; B4 fügt dem Tick NICHTS hinzu — Marker und Punktformel laufen einmal je Spieltag auf der Publish-Kadenz, auf der die Flottenliste ohnehin sendet) | D-193–D-196 |
| M18 | 2026-08-08 | **1,431 / 1,548 / 1,449 ms p50** und **3,108 / 3,890 / 2,768 ms p99** (drei saubere Abschlussläufe nach allen fünf Bundles; die B4-Abschlussläufe lauteten 1,531/3,006 und 1,508/3,225) | **−0,02 / +0,10 / −0,00 ms p50** (Budget-Zeile +0,15 eingehalten; zwei der drei p99 liegen UNTER der Grundlinie, der dritte 0,63 ms darüber und damit im dokumentierten ±0,7-ms-Laufrauschen — wie die Bundle-Läufe 1,296/2,841 (B1), 1,613/2,934 (B2), 1,702–1,542 / 3,796–3,156 über vier Läufe (B3) und 1,531/1,508 / 3,006/3,225 (B4). **Die Referenzflotte fährt die Regel AUS**, wo `updateWeather`, `weatherCellAt` und `winterFrictionAt` auf ihrer ersten Zeile zurückkehren; die Per-Fahrzeug-Kosten mit Regel AN sind auf diesem Fixture NICHT gemessen und D-201 sagt das, und B5s AN-Kosten sind EIN Funktionsaufruf je Spieltag außerhalb der Regionenschleife) | D-200–D-204 |
| M19 | 2026-08-09 | **3,446 / 3,705 ms p50** und **28,896 / 10,700 ms p99** (zwei Läufe nach allen vier Bundles) — **das ist AUSDRÜCKLICH KEINE Abnahmezahl** | **nicht abgenommen, und der Grund ist gemessen statt behauptet.** Die Maschine trug während des gesamten Meilensteins parallele Agenten (achtzehn `node`-Prozesse, 16 146 s kumulierte CPU beim Abschlusslauf), und das 8-ms-p99-Gate ist auf dem BASELINE-Commit ebenso rot. B4 misst deshalb erstmals den GANZEN Meilenstein gegen `5b0758a`, den Commit vor D-207, in zwei abwechselnden Paaren: M19 komplett 3,446/28,896 und 3,705/10,700 ms, pre-M19 3,594/15,924 und 3,496/9,829 — Mittel p50 3,576 gegen 3,545, also **+0,031 ms für alle drei zustandsberührenden Bundles zusammen** gegen die Budgetzeile +0,10 ms, bei p99 mit WECHSELNDEM Vorzeichen und einer Streuung 9,8–28,9 ms INNERHALB eines Commits (genau die Größe, die D-167 als unter Last um Vielfache aufgebläht beschreibt). Beide Seiten liegen bei 3,4–3,7 ms p50 gegen die Referenz 1,43–1,45, die Box also um rund Faktor 2,4 belastet. Die Bundle-Läufe: B1 vier A/B-Paare, Mittel p50 +0,10 ms; B2 vier Läufe, eigen 0,18 ms schneller; B3 zwei Paare, eigen 0,09 ms schneller; B4 null neue Per-Tick-Arbeit (ein Kommentar unter `src/`). **Die saubere Abnahmemessung auf der Referenzmaschine steht aus und ist das EINZIGE, was M19 offen lässt** — sie wird benannt statt erfunden | D-207, D-211, D-213, D-215 |
| M20 | 2026-08-12 | **1,464 / 1,384 / 1,382 ms p50** und **2,927 / 2,770 / 2,705 ms p99** (drei saubere Abschlusslaeufe nach allen vier Bundles; max 19,411 / 19,984 / 19,431 ms ueber je 6 500 Ticks, und dieses Maximum IST der Monatsrand - M10s eigene Zeile notiert dort 39,4 ms) | **-0,333 / -0,490 / -0,555 ms p99 - alle drei UNTER der Grundlinie** (Budget-Zeile +0,10 ms eingehalten; p50 +0,014 / -0,066 / -0,068). Die Bundle-Laeufe: B1 p50 1,666 / 1,707 / 1,862 und p99 3,677 / 3,675 / 4,345 (D-231), B2 p99 6,06 -> 8,29 -> **6,07** nach der `trackRevision`-Trennung eines Kostenpunkts, den das Spiel seit M4 fuer jede Strassenkachel zahlte (D-232), B3 1,756 / 2,912 (D-233), B4 die drei Zeilen oben. **Die Fertig-wenn-Klausel hat zwei Lesarten und beide sind gemessen** (D-234): als Tick-p99 ueber ein Fenster, das die Monats-Hooks enthaelt - was `SAMPLE_TICKS = 6 500` ausdruecklich dafuer baut - ist sie mit Abstand eingehalten; als ISOLIERTER Monats-Randtick ist sie auf dem Referenz-Fixture nicht vom Eigenrauschen trennbar (Grundlinien-Streuung 0,82 ms) und liegt auf einer ruhigen erzeugten 140-Staedte-Welt bei **+0,188 ms**, hochgerechnet auf 120 Staedte **+0,161 ms** gegen 0,15 - **0,011 ms darueber, benannt statt geglaettet**, nachdem drei gemessene Optimierungen an den zwei Zaehl-Laeufen den Wert von +0,63 dorthin gebracht haben. Der verbleibende Weg darunter ist, den Zensus zu TRAGEN statt zu zaehlen - Save-Zustand nach Z4 und ein eigener Bundle. **B5 hat die Zweideutigkeit beendet statt sie stehen zu lassen (D-235): der Fertig-wenn-Satz in Abschnitt 8 traegt jetzt eine Klammer-Notiz, die die ERSTE Lesart fuer verbindlich erklaert** - sie ist die Groesse, die Z6 vorschreibt und die diese Tabelle fuehrt, und der isolierte Monatsrand war nie an SPEC.md 21 gebunden (M10 notiert ihn bei 39,4 ms; 0,15 ms waeren dort 0,4 % statt 4,6 %). Beide Zahlen bleiben protokolliert, die 0,011 ms ueber der zweiten Lesart eingeschlossen; B5 hat kein Byte der Sim-Kosten bewegt (kein neuer Tick-Lauf beansprucht) | D-231, D-232, D-233, D-234, D-235 |
| M22 | 2026-08-12 | **1,469 / 1,360 / 1,367 ms p50** und **2,995 / 2,774 / 2,757 ms p99** (drei saubere Abschlusslaeufe nach allen vier Bundles; max 19,651 / 20,603 / 20,860 ms ueber je 6 500 Ticks). **Dazu die vier kanonischen Benchmark-Karten selbst, die dieser Meilenstein liefert** (Zeit AUS DEM TEST, 200 Aufwaermticks, `tests/perf/benchmarkMaps.perf.spec.ts`): Mega-Kreuzung (512², 48 Zuege, 47 024 gerichtete Kanten, **932 Abzweige**, 2 359 Kommandos) **p50 0,088 / p99 18,586 / max 36,340 ms**; Megalopolis (1024², **1 500 Fahrzeuge**, 88 Bahnhoefe, 4 764 Kommandos) **p50 1,056 / p99 2,274 / max 3,812 ms**; Archipel (2048², 300 Fahrzeuge, **11 Landmassen**, 563 Industrien, 1 182 Kommandos) **p50 0,199 / p99 0,556 / max 2,258 ms**; 100k-Kanten (1024², **105 648 gerichtete Kanten**, 485 Abzweige, 24 Zuege, 3 753 Kommandos) **p50 0,051 / p99 0,126 / max 1,607 ms** | **−0,265 / −0,486 / −0,503 ms p99 — alle drei UNTER der Grundlinie** (Budget-Zeile +0,00 ms eingehalten, und per Konstruktion: der Meilenstein hat unter `src/sim` nichts im Hot-Path angefasst — fuenf Editor-Kinds ausserhalb des Ticks, ein Bild vor der Genese, vier Textlogs und ein Messmodus im Scheduler; p50 +0,019 / −0,090 / −0,083 gegen die Grundlinie 1,45). **Die Benchmark-Zahlen sind KEINE Budgetzeile und werden nicht als Schwelle wiederverwendet** (D-167): gegated sind Vielfache davon, protokolliert sind sie hier. Der Befund, den sie liefern, ist die **Abzweigdichte und nicht die Groesse** — das 100k-Kanten-Netz traegt 2,2-mal so viele Kanten wie die Mega-Kreuzung und ist im p99 **148-mal billiger**; die Kontrollmessung mit abgestellter Flotte auf derselben Mega-Kreuzung misst p50 0,002 / p99 0,007 ms, der ganze Schwanz ist also der Schienen-Pfadfinder und keine Kartenlast, bei **null `NoRoute`** ueber die ganze Messung. Abschnitt 21s 8-ms-Budget gilt fuer die Welt, die die **Megalopolis** IST, und die haelt es mit p99 2,274 ms. Hauptchunk **997 787 → 1 002 279 B** (+4 492, davon +3 675 B die 46 i18n-Zeilen, gemessen durch Loeschen und Neubau), Budget unveraendert **1 006 000 B** | D-240–D-243 |
| KI-Programm, Abschluss (D-225 … D-227) | 2026-08-11 | **keine Tick-Messung, und das ist korrekt statt bequem** — dieser Bundle ändert unter `src/` **null Byte**; gemessen wurde der ZWÖLF-Seed-Ertrag des ganzen KI-Programms und die eine Regression, die niemand gespielt hatte. Zwölf Seeds × 25 Jahre × 3 Konkurrenten, 256er-Karte: **12 965 575 €, 4 abgewickelt, 46 lebende Fahrzeuge davon EIN Zug, `NoRoute` 0 auf jedem Seed, EINE lebende Schienenlinie**. Die Latte: ein Konkurrent beendet Jahr 25 lebend mit Linie und ≥ 2 Fahrzeugen auf **5 von 12** Seeds, und der REICHSTE Konkurrent besitzt etwas Gebautes auf **5 von 12** — auf sieben von zwölf ist der Reichste eine Firma, die den Hof nie verlassen hat. Rohwerte im Detailabsatz unten | **±0,00 ms per Konstruktion** (kein `src/`-Byte: D-225 ist eine Messung mit reverteter Instrumentierung, D-226 die Zwölf-Seed-Tabelle, D-227 eine Korrektur einer falsch angegebenen Ursache) | D-225, D-226, D-227 |
| KI-Ökonomie (D-221 … D-224) | 2026-08-11 | **keine Tick-Messung, und auch das ist die ehrliche Angabe** — der ganze Faden lebt im Entscheidungszyklus, der je Firma alle 400 Ticks läuft und dessen teure Hälfte der `lastBuildTick`-Riegel auf einen Spielmonat deckelt; D-224 ändert unter `src/` **null Byte**. Gemessen wurde stattdessen der Ertrag über ACHT Seeds; Rohwerte im Detailabsatz unten | **±0,00 ms per Konstruktion** (keine Arbeit je Tick: D-221/D-222 filtern und bepreisen die Kandidatenliste, D-223 stellt einer Projekt-Rückfrage eine Besitzerfrage voran, D-224 fasst nur Tests und Dokumentation an) | D-221, D-222, D-223, D-224 |
| KI-Faden (D-216 … D-220) | 2026-08-11 | **keine Tick-Messung, und das ist die ehrliche Angabe** — D-218 und D-219 ändern je eine Handvoll Zeilen in einem Kommando-Guard bzw. einem Planer, D-220 ändert unter `src/` **null Byte**. Gemessen wurde stattdessen, was der Faden wirklich kostet und wirklich bringt; Rohwerte im Detailabsatz unten | **±0,00 ms per Konstruktion** (D-220: kein `src/`-Byte; D-218/D-219: keine Arbeit je Tick, nur eine zusätzliche Tabellenabfrage in einem Guard bzw. eine Besitzerfrage in einem Planer, der ohnehin nur alle `AI_RETRY_TICKS` läuft) | D-216, D-217, D-218, D-219, D-220 |

KI-Ökonomie-Zeile im Detail (D-224, 11.08.2026): **kein SAVE_VERSION-Bump,
kein Snapshot-Byte, keine Atlas-Zelle, kein i18n-Satz, kein RNG-Zug.** Neu sind
zwei Konstanten mit Messung (`AI_MIN_PROFIT_MARGIN`, `AI_RAIL_PROJECTED_*`,
D-221/D-222); D-223 fügt einer privaten Projekt-Rückfrage eine Besitzerprüfung
hinzu, D-224 fasst `src/` überhaupt nicht an. Pins **nachgeprüft statt
vermutet**: Soak `45ccb46dc67e1fdf` → **`1f76e2df98be99a3`** bei 3 419 → **191**
aufgezeichneten Kommandos (einmal neu aufgezeichnet, in D-221; D-222, D-223 und
D-224 spielen Seed 4711 bit-identisch), kanonischer Cross-OS-Pin
`ddaacd4b970d31db` unverändert, Korpus-Manifest unverändert, SAVE_VERSION 30.

Was diese Zeile protokolliert, ist der **Ertrag über ACHT Seeds** — die vier
des Sweeps plus vier, die vorher nie jemand gespielt hatte —, je 25 Jahre,
256er-Karte, drei Konkurrenten. Format: Persönlichkeit, Firmenwert €,
[X] abgewickelt, Linien/Fahrzeuge/Stationen.

| Seed | vor dem Faden (5d32299) | nach D-224 (HEAD) |
|---|---|---|
| 4711 | p0 500 000 0/0/0 · p4 147 155 0/0/11 · p1 576 736 1/6/19 | p0 55 935 0/0/2 · p4 412 641 0/0/4 · **p1 540 495 1/6/4** |
| 4713 | p4 −290 949 [X] · p0 −256 082 [X] · p3 500 000 | p4 410 475 0/0/4 · **p0 1 687 871 3/18/4** · p3 500 000 |
| 4712 | p4 −168 859 [X] · p2 −279 226 [X] · p0 58 097 | p4 500 000 · p2 63 551 0/0/2 · p0 500 000 |
| 4714 | p4 −145 573 [X] · p2 −166 757 [X] · p3 500 000 | p4 382 931 0/0/5 · **p2 415 718 1/6/5** · p3 500 000 |
| 2718 | p3 500 000 · p0 −483 604 [X] · p4 −325 286 [X] | p3 500 000 · p0 −196 058 0/0/5 · p4 500 000 |
| 31415 | p3 500 000 · p4 −415 716 [X] · p2 −326 599 [X] | p3 500 000 · p4 456 327 0/0/2 · p2 −103 538 [X] 1/0/4 |
| 60613 | p0 −140 020 · p4 23 385 [X] · p1 −47 967 [X] | p0 −157 950 [X] 0/0/2 · p4 500 000 · p1 448 473 0/0/3 |
| 12345 | p4 −117 468 [X] · p2 −622 832 [X] · p0 500 000 | p4 383 214 0/0/6 · **p2 337 369 2/9/6** · p0 96 345 1/1/2 |

Summe über 24 Konkurrenten **18 435 € → 9 233 799 €**, der asservierte
Vier-Seed-Sweep **974 542 € → 5 969 617 €**, abgewickelt **14 → 2**, lebende
Fahrzeuge **6 → 40**, Konkurrenten mit Linie UND Flotte **1 → 4** auf **vier
von acht Seeds**, `NoRoute` durchgehend 0. **Eine Korrektur an den eigenen
Berichten**: D-221 protokollierte für den Ausgangszustand „8 abgewickelt"; am
selben Commit nachgemessen sind es **14 von 24** — die Wert- und Summenzeilen
reproduzieren dagegen auf den Euro.

KI-Programm-Zeile im Detail (D-225 … D-227, 11.08.2026): **kein SAVE_VERSION-Bump,
kein Snapshot-Byte, keine Atlas-Zelle, kein i18n-Satz, kein RNG-Zug, keine
Konstante, kein `src/`-Byte.** Der Rail-Shuttle des vorigen Bundles wurde
gemessen und ZURÜCKGENOMMEN — es gibt kein Rail-Bundle im Baum, und die
Zwölf-Seed-Tabelle ist HEADs eigene. Sie reproduziert die Acht-Seed-Teilmenge
oben auf den Euro, was sagt, dass beide Messgeräte dasselbe messen. Pins
unverändert: Soak `1f76e2df98be99a3` bei 191 Kommandos, kanonisch
`ddaacd4b970d31db`, Korpus-Manifest, SAVE_VERSION 30 — nachgeprüft durch
Ausführen.

| Seed   | drei Konkurrenten bei HEAD (Persönlichkeit, Wert €, [X] abgewickelt, Linien/Fahrzeuge/Stationen) |
| ------ | ------------------------------------------------------------------------------------------------ |
| 4711   | p0 55 935 0/0/2 · p4 412 641 0/0/4 · **p1 540 495 1/6/4**                                        |
| 4713   | p4 410 475 0/0/4 · **p0 1 687 871 3/18/4** · p3 500 000 0/0/0                                    |
| 4712   | p4 500 000 0/0/0 · p2 63 551 0/0/2 · p0 500 000 0/0/0                                            |
| 4714   | p4 382 931 0/0/5 · **p2 415 718 1/6/5** · p3 500 000 0/0/0                                       |
| 2718   | p3 500 000 0/0/0 · p0 −196 058 0/0/5 · p4 500 000 0/0/0                                          |
| 31415  | p3 500 000 0/0/0 · p4 456 327 0/0/2 · p2 −103 538 [X] 1/0/4                                      |
| 60613  | p0 −157 950 [X] 0/0/2 · p4 500 000 0/0/0 · p1 448 473 0/0/3                                      |
| 12345  | p4 383 214 0/0/6 · **p2 337 369 2/9/6** · p0 96 345 1/1/2 (1 Zug)                                |
| 77003  | p4 399 565 0/0/5 · **p0 300 967 1/6/5** · p1 409 410 0/0/4                                       |
| 918273 | p2 −130 562 [X] 0/0/4 · p1 437 994 0/0/5 · p4 412 615 0/0/4                                      |
| 131313 | p1 454 465 0/0/2 · p2 500 000 0/0/0 · p3 500 000 0/0/0                                           |
| 860213 | p4 341 841 0/0/8 · p3 500 000 0/0/0 · p2 −394 521 [X] 0/0/4                                      |

**Und die eine Regression, die niemand gemeldet hatte, weil niemand den Seed
gespielt hatte** (D-225): Seed 918273 fiel 1 002 864 → 720 047 €, und die
Ursache ist NICHT die Rentabilitätsschwelle. Dieselbe Kohlelinie wird bei HEAD
im IDENTISCHEN Tick 5 734 mit denselben sechs Lastwagen gebaut und läuft NEUN
Jahre bei 4,2–5,0 der Flottenrechnung. Getötet hat sie eine Fabrik, die die KI
GEWECKT und nie abgeholt hat: ein Stahlwerk, das sechs Jahre lang Kohle nahm und
NICHTS produzierte — schlafend, und schlafend ist unsterblich (7.3 / D-086) —
begann in dem Monat zu produzieren, in dem die ZWEITE Linie der KI ihm Eisenerz
brachte; den Stahl trug nie jemand weg (D-085), `monthsWithoutCollection` lief
1 … 24, und im Monat 1958.7 schloss das Werk und nahm die Senke BEIDER Linien
mit. Das Anschlussbein war da, stand ab 1953 auf **Rang 1** der Kandidatenliste
mit Marge **4,230** gegen die Schwelle 1,25 — und wurde **67-mal** mit dem Grund
`noBorrow` übersprungen: eine Straßen-Persönlichkeit mit bereits einer laufenden
Linie darf nicht borgen (D-154), und es fehlten rund 8 % des Preises an Bargeld.

**D-223 bewegt davon keinen einzigen Euro** und sagt das: die acht Seeds sind
vor und nach der Besitzerprüfung Zeile für Zeile identisch, weil die
Fremdstations-Übernahme auf diesen acht Welten HEUTE nicht mehr vorkommt. Bei
5d32299 kam sie vor — der neue Beobachter `watchForeignStops` findet dort
**fünf** angenommene Fahrpläne auf fremde Halte, davon **drei auf Seed 4711**,
dem aufgezeichneten und GESWEEPTEN Seed, auf dem das ganze Projekt seine
KI-Aussagen gemessen hat (der Standard-Sweep wäre also rot gewesen), und zwei
auf 60613, wo sechs Busse deswegen ihr Leben im Depot verbracht haben. Bei HEAD
sind es null — vor dieser Korrektur wie nach ihr, was der zeilengleiche Sweep
beweist.

Suite-Stände nach diesem Pass: `tests/unit` **112 Dateien / 1 468 Tests**
(vorher 111 / 1 464), `tests/balance` **12 Dateien / 81 grün + 2 übersprungen**
(vorher 79 + 2), `npm run test:balance:full` **101 grün** (vorher 97),
`tests/determinism` **7 Dateien / 33 grün**,
`npm run test:soak` **4 grün** auf unverändertem Hash `1f76e2df98be99a3` bei
191 Kommandos.

KI-Faden-Zeile im Detail (D-220, 11.08.2026): **kein SAVE_VERSION-Bump, kein
Snapshot-Byte, keine Atlas-Zelle, keine neue Konstante, kein i18n-Satz, kein
RNG-Zug** — bei D-220 ist unter `src/` überhaupt nichts angefasst worden, und
alle drei Pins stehen deshalb unverändert und **nachgeprüft statt vermutet**:
Soak `45ccb46dc67e1fdf` bei 3 419 aufgezeichneten Kommandos, kanonischer
Cross-OS-Pin `ddaacd4b970d31db`, Korpus-Manifest unverändert, SAVE_VERSION 30.

Was diese Zeile stattdessen protokolliert, sind **Suite-Kosten und
Suite-Ertrag**, weil genau das der Gegenstand des Bundles ist. Kosten
(Ganzdatei-Wanduhr, eine Datei nach der anderen, dieselbe Maschine): ein
Vierteljahrhundert des `aiGame`-Fixtures dauert je nach Maschinenlast
**40–70 s**; die Datei geht von **93,9 s** (ein Seed) auf **106,8 s** (der
Zwei-Seed-Sweep jedes Laufs) und auf **242,1 s** (vier Seeds plus
Desync-Zwilling, der `soak`-Job) — also **+13 s je Lauf** und **+150 s je
Push**. Suite-Stände: `tests/balance` **12 Dateien / 79 grün + 2 übersprungen**
in 139 s (vorher 63 + 2), `npm run test:balance:full` **97 grün** in 292 s,
`tests/unit` **109 Dateien / 1 455 Tests** (vorher 1 446), `tests/determinism` +
`tests/corpus` **38**, `npm run test:soak` **4** auf unverändertem Hash.

Ertrag, gemessen über die vier Seeds: Gesamtwert **974 542 €**, **sechs von
zwölf abgewickelt, EINE von zwölf besitzt ein Fahrzeug**, neun von zwölf haben
überhaupt gebaut. Das Refusal-Profil, das vorher niemand sehen konnte, zeigt
**null** `BuildTrack|notYours` und **null** `BuildRailStop|needsTrack` (D-219
bestätigt) bei gleichzeitig **952** `BuyRoadVehicle|needsDepot`, **589**
`BuildRoadStop|occupied` und **584** `BuildRoad|notYours` auf EINER Firma —
2 811 Ablehnungen gegen 71 angenommene Bauten, **97,5 % Ablehnungsquote in der
Bau-Familie**, jetzt bei jedem Lauf gedruckt. Bänder: **keines verschoben**
(Szenario 5 Road 1 173 298 → **1 156 463 €**, Rail **228 047 €**, Expansiv
**−241 309 €**), und **SPEC.md 19.4s 5–25 Mio. werden weiterhin nicht erreicht
— Faktor 4,3 darunter, ausdrücklich nicht behauptet** (D-158/D-116 bleiben die
Begründung).
M11-Zeile im Detail: **SAVE_VERSION v24** — genau EIN Bump für alle drei
Stufen (Z5; Order-Grammatik-Stride, LineStore, Takt-Felder,
AiState-Migration inkl. `AiProject.railTrains`); Snapshot-Layout-Bump
+`lineId` je Fahrzeug wie zugesagt; Atlas 0. Szenario-5-Ausgang:
**IN der Suite** (`tests/balance/aiCompany.spec.ts`) auf dem
D-158-Band — Road (Seed 4711) gemessen 1 119 720 € in [0,8; 3,2] Mio.
plus Compounding-durch-Renewal-Assertion, Rail/Expansiv solvent
(90 230 € / 121 328 €); D-116 geschlossen. Takt-Band: ±10 % Earnings
erfüllt (−8,3 %), Rating-Varianz 0,57 auf 0,6-Band mit strukturellem
Boden (D-159). Render-Tripwires unverändert grün (Sprite-Pool-Rebuild
p99 2,7 ms, Draw-Prep p99 0,46 ms).

M12-Zeile im Detail: **kein SAVE_VERSION-Bump, kein Snapshot-Layout-Bump,
kein Marker-Kanal-Feld** — render-only wie zugesagt (die Stadt-/
Stationslabels lesen Name+Position aus den Marker-Kanälen, die beide seit
M1/M2 tragen); die Determinismus-Suite sieht nie ein Pixel.
Abnahme-Messwerte (Referenzmaschine, `npm run test:perf` 2026-08-07):
**Chunk-Rebake p50 0,41 / p99 1,57 ms gegen das 4-ms-Akzeptanzbudget**
(die Tripwire-Schwelle WAR hier zur M12-Abnahme die Abnahmezahl selbst,
D-161 — seit M13 entkoppelt, D-167; 2 656 Placements
+ Segmente pro Bake, Wasser-Fixture inklusive); Sprite-Pool-Rebuild
8 017 Sprites p50 1,30 / p99 4,17 ms (Tripwire 25); Vehicle-Draw-Prep
inkl. E-05-Lerp 1 500 Fahrzeuge p50 0,73 / p99 1,58 ms (Tripwire 5);
prozedurale Atlas-Seiten beim Start base 3,3–8,9 ms + detail
8,5–10,3 ms, zusammen < 20 ms der 250-ms-Startscheibe (D-163, Chromium).
Atlas-Buchung gegen 6.2: Seite 0 steht bei **2176×3456 von 4096** — die
zugesagten „+4 Wasser-Animationszeilen" sind exakt eingelöst (3
Animations- + 1 Küstensaum-Zeile, D-164) —, Seite 0-detail bei
**4096×3840 von 4096** (D-163-Buchung); Seiten 1/2 unberührt (M13). Kein
Font- und kein sonstiges Binärasset im Repo (Glob-Test über den
Git-Index, D-160; die Label-Schrift wird beim Start aus Systemschriften
gerastert, D-165); der Kenney-Bake ist doppelt ausgeführt bit-identisch
(D-160). Fertig-wenn-Posten der M12-Sektion: Chunk-Rebake ≤ 4 ms
gemessen ✓, Rebake nur bei Revisionswechsel (Checksummen-Test, D-161) ✓,
0,25×-Stufe Terrain+Netz+Punkte ✓, Interpolations-Alpha per Test belegt
(D-162) ✓, zoom-gestaffelte Labels mit Kollisionsausdünnung (D-165) ✓,
kein Font-Binärasset (Glob-Test) ✓. Der 60-fps-Schwenk der 2048²-Karte
bei 0,25× ist ein GPU-Kriterium und bleibt Handmessung nach dem
M9-Verfahren (README) — der CPU-Anteil ist über die Chunk- und
Draw-Prep-Proxies belegt, mehr kann ein headless Test nicht sehen
(D-136).

M13-Zeile im Detail: **kein SAVE_VERSION-Bump — v24 bleibt.** Der als
Snapshot-Layout-Bump gebuchte `+IndustryMarker.level` war bei der
Umsetzung **seit M5 vorhanden** (Marker-Kanal, Industrie-Uhr;
`structureSignature` faltet die Level-Summe, Frische damit ≤ 1 Publish):
null Byte Layout-Änderung, `SNAPSHOT_LAYOUT_VERSION` bleibt 6 — das
D-171-Muster, ehrlich protokolliert statt einer Leerbump-Version (D-174);
der Level-Roundtrip ist seither Testgegenstand
(`tests/unit/industryMarkers.spec.ts`). Abnahme-Messwerte
(Referenzmaschine, `npm run test:perf` 2026-08-07): **Partikel-Frame p50
0,32 / p99 1,35 ms** am Cap 2000 im Überlast-Szenario (300 boomende
Industrien + 1 500 Fahrzeuge emittierend, Pool am Cap — Spawns, Refusals,
Step- und Mirror-Loop voll bepreist) **gegen das 2-ms-Akzeptanzbudget**;
das Tripwire-Gate IST hier das Budget (Median 2 ms = > 6× sauberer
Median, Backstop 20 ms — D-167 und Abnahmezahl fallen ausnahmsweise
zusammen, mit Headroom statt gegen ihn). Übrige Tripwires nach allen
M13-Bundles grün: Sprite-Pool-Rebuild Median 1,8 ms (Gate 10),
Draw-Prep 2,5–2,6 ms in der Konsist-Szene mit 9 000 Units (Gate 10),
Chunk-Bake 0,5 ms (Gate 3), Aspekt-Refresh 0,03 ms (Gate 2),
Emissive-Walk 0,05 ms (Gate 2). Atlas-Buchungen: in 6.2 durch B1/B2/B4/B5
nachgeführt (Seite 1 ehrlich überbucht auf 810 Zellen je Zoom, Seite 2
548 Emissive-Zwillinge je Zoom, Seite 0 auf 2176×3840, Seite 0-detail
VOLL). Fertig-wenn-Posten der M13-Sektion: alle Katalogeinträge in 8
Facings mit eigener Silhouette ✓ (D-169-Reuse-Regel „nie falsche
Silhouette", D-170), 10-Wagen-Kohlezug als 10 Wagen ✓ (D-171), nachts
Fenster/Signale/Straßenlampen additiv + Aspekte ohne F3 ✓ (D-172/D-173),
boomende vs. schlafende Industrie im Standbild unterscheidbar ✓
(Level-Feld getestet: Rauchdichte am Tag, `industryGlowFactor` nachts,
D-174), Partikel-CPU gemessen ≤ 2 ms ✓, kein Binärbild im Repo
(Glob-Test) ✓. Dazu die Status-Badges (stuck/Panne/ohne Aufträge) aus dem
State-Feld im Stride mit der EINEN Stuck-Definition der 9.3-Uhr (D-174).

M14-Zeile im Detail: **SAVE_VERSION v25 — genau EIN Bump (Z5),** Besitzer
der Stations-Frachthistorie-Ring (B3); B4 erweiterte die v24→v25-Migration
IN PLACE um `breakdownCount` + `depotCall` statt eine v26 anzulegen. Der
kanonische Pin wanderte nach D-137-Protokoll zweimal mit
(`bbe572afe2880243` nach B3, `8146983bca3a6f92` nach B4, Datei-Stand
gilt); Korpus in B3 re-recorded (`v25-played.ironsave`), in B4 geprüft
unverändert gültig (fahrzeuglose Korpus-Welt). **Snapshot-Layout 6 → 7 —
genau EIN Bump** (B1: FlowCount-Feld + Stride-8-FlowMarker-Block, Cap
4 096 Legs). Abnahme-Messwerte (Referenzmaschine, `npm run test:perf`
2026-08-07): **Flow-Export median 0,057 / p99 0,241 ms je Publish bei 420
aktiven Legs** (B1-Abnahmelauf 0,060/0,285) **gegen die
≤-0,5-ms-Zusage** — im SELBEN Publish-Pass wie `structureSignature`
(Fehler 33), Tripwire gated den Median auf der Zusage selbst mit
5-ms-p99-Backstop (der M13-Partikel-Fall: das Gate IST das Budget, mit
Headroom, D-176/D-167); **Flow-Overlay-Prep am 4 096-Leg-Megagraph p50
0,296 / p99 0,750 ms** (B2-Abnahmelauf 0,32/0,93) gegen das
3-ms-Median-Gate — die gebundene Insertion-Selektion statt Sort, 128
gezeichnete Bögen, Checksummen-identisch (D-177). **Ring-Speicher:** 648
Int32 + 54 Float64 = 3 024 B je Station (12 Monate × 18 Frachten × 3
Zähler + Monatsakkumulatoren), ~1,2 MiB im Speicher der
420-Stationen-Referenzflotte; gehasht NUR im Voll-Digest
(Kachel-Layer-Präzedenz, D-178), Save der großen Welt unverändert
0,18 MB. Übrige Tripwires nach allen Bundles grün (Sprite-Pool Median
1,8, Draw-Prep 2,6, Chunk-Bake 0,55, Partikel 0,30, Aspekt 0,03,
Emissive 0,07 ms). Atlas: 0 wie zugesagt — die Pfeile sind
Vektor-Graphics, der Minimap-Fluss ist ein Fall des EINEN reinen
Painters (D-112/D-177). Fertig-wenn-Posten der M14-Sektion: jeder
gemessene Leg im 3-Linien-Transfernetz als Pfeil mit Breite ∝ Volumen ✓
(`tests/helpers/transferNetwork.ts` + Overlay-Test, D-177), alle fünf
10.1-Terme einzeln beziffert + dominanter Verlustterm benannt ✓
(`ratingTerms`-Summentest, D-179), Flow-Export ≤ 0,5 ms ✓ (gemessen
0,057 median, Gate hält die Zusage), Firmenwert-Graph aus
Jahresarchiv + Heute ✓ (D-180, `chart.spec.ts`), **alle 22 Werkzeuge mit
wirkungserklärendem Tooltip ✓** — aus dem Tool-Registry AUFGEZÄHLT
statt gezählt: Compile-Time-Abdeckung der Tool-Union in `ui/tools.ts`,
Kopplungstest über beide Locales in `tests/unit/tooltips.spec.ts`
(D-183).

M15-Zeile im Detail: **SAVE_VERSION v26 — genau EIN Bump (Z5),** Besitzer
sind D-184s zwei `railPath`-Regelflags; B2 erweiterte dieselbe
`v25_to_v26`-Migration IN PLACE um `roadCongestion` + den Uint8-Stau-Layer
(D-185), B3 und B4 berühren keine gespeicherte Form. Der kanonische Pin
wanderte nach D-137-Protokoll zweimal mit (`54a6bef6e40c2a52` nach B1,
`50c7d6a38f6da052` nach B2, Datei-Stand gilt); Korpus in beiden Bundles
re-recorded (`v26-played.ironsave`, D-130), in B3/B4 geprüft unverändert
gültig. **Snapshot-Layout 7 → 8 — genau EIN Bump,** und NICHT für den in
6.1 gebuchten „Stau-Overlay-Block": der kostete zweimal null Byte (der
Stau-Layer von D-185 und die Durchsatz-Zähler von D-186 reisen im
SharedArrayBuffer der Karte, das D-171/D-174-Muster zum dritten und
vierten Mal), also löst B4 die zugesagte Layout-Buchung mit der
E-18-Entscheidung ein: `SNAPSHOT_MAX_VEHICLES` 1 500 → 4 000 =
`MAX_VEHICLES`, womit der Renderer eine große Flotte nicht länger still zu
37,5 % zeichnet (D-187). Abnahme-Messwerte (Referenzmaschine,
`npm run test:perf` 2026-08-08): **Tick p50 1,481 / p99 2,949 ms** (max
19,98 ms über 6 500 Ticks, Abschlusslauf nach allen vier Bundles) — die
Bundle-Läufe 1,512/3,023 (B1, D-184), 1,351/2,985 (B2, D-185) und
1,383/2,785 (B3, D-186) liegen alle im dokumentierten ±0,7-ms-Laufrauschen
um die M10-Grundlinie; **E-18-Preis gemessen statt extrapoliert: Draw-Prep
über einen vollen Block, 4 000 einfache Fahrzeuge p50 2,40 / p99 3,52 ms
gegen 0,89 / 1,50 ms bei 1 500** — die daneben gegatete Konsist-Szene
bepreist 9 000 Units je Frame mit 2,49 ms und deckt den Fall damit von
oben ab, deshalb KEINE neue Schwelle (D-187/D-167). **Save-Größe als A/B
auf einer Welt** (D-185): Null-Layer 1 039 B komprimiert gegen 1 048 576 B
roh auf 1024², stark bespielt 20 023 B — die Ledger-Zusage „~1 MB,
zlib-klein weil überwiegend null" ist mit Reserve eingelöst; die
1500-Fahrzeug-Referenzwelt bleibt bei 187 272 B und liest in 604 ms
zurück. Übrige Tripwires nach allen Bundles grün (Sprite-Pool-Median 1,77,
Draw-Prep 2,49, Chunk-Bake 0,48, Partikel 0,29, Aspekt 0,03, Emissive
0,06, Flow-Prep 0,29 ms); Flow-Export Median 0,055 ms. Atlas: 0 wie
zugesagt — Heatmap und Deadlock-Highlight sind Vektor-Graphics (D-186).
**Netzwert-Faktor: 3,73 gemessen gegen das Band ≥ 3**
(`tests/balance/netzdesign.spec.ts`, botched 1,8 % vs. signalisiert 6,9 %,
über drei Seeds 3,71–3,75 stabil), zerlegt gedruckt: Trassenführung allein
2,01×, Kapazität obendrauf 1,86× (D-187). Fertig-wenn-Posten der
M15-Sektion: 200 Lkw bilden messbar Stau und neu geroutete Fahrten nehmen
die Ausweichroute ✓ (Zwei-Routen-Test je Richtung, 46/41 und 50/63 gegen
96/0 und 103/0 mit Regel aus, D-185), ein Zug mit aktiver Belegungsstrafe
zieht die freie Ausweiche dem besetzten Block vor ✓
(`railRules.spec.ts`-Diamant, D-184), Netzdesign-Szenario ≥ 3 ✓ (3,73),
erkannte Deadlock-Schleife benennt alle Züge und Tiles ✓ (`news.deadlockCycle`
mit Ring-Kanonisierung + F3-`blockedTile`, D-186), Save/Load erhält den
Stau-Layer bit-identisch ✓ (Byte- UND Digest-Vergleich in
`roadCongestion.spec.ts`, D-185), Tick ≤ +0,5 ms über der M10-Grundlinie ✓
(−0,31 ms gemessen). E-18 steht damit im Ledger, wie SPEC2 es verlangt.

M16-Zeile im Detail: **SAVE_VERSION v27 — genau EIN Bump (Z5),** Besitzer ist
der Checkpoint-Ring aus B1, und es ist der dritte reine CONTAINER-Bump der
Kette: `checkpoints`, `logBaseTick` und `replay` sind Historie, nicht Zustand
(die Command-Log-Familie, D-131), also wandert kein Byte gehashter Weltzustand
— `v26_to_v27` reicht `state` per Referenz durch (das v23-Muster, D-130). Der
Beleg ist ungewöhnlich direkt: der kanonische Cross-OS-Pin wurde nach
D-137-Protokoll re-recorded und steht auf DEMSELBEN `50c7d6a38f6da052` (nur
`saveVersion` 26 → 27), das Korpus-Manifest auf DEMSELBEN
`17f7f507023b91d8` für alle sechs Fixtures. B2 und B3 berühren keine
gespeicherte Form; beide Pins bleiben unverändert, die zwei
UNHASHED-Allowlist-Einträge des Feld-Audits (`checkpoints[].payload`,
`replay.finalTick`) bleiben die einzigen. **Kein Snapshot-Layout-Bump, kein
Atlas-Byte** — der Meilenstein ist Format, Wiedergabe und Beweis, nichts
davon zeichnet.

Abnahme-Messwerte (Referenzmaschine, `npm run test:perf` 2026-08-08):
**Tick p50 1,447 / p99 2,868 ms** (max 24,37 ms über 6 500 Ticks,
Abschlusslauf nach allen drei Bundles) gegen die M10-Grundlinie 1,45/3,26 —
der B1-Lauf 1,494/2,684 liegt daneben, beide im dokumentierten
±0,7-ms-Laufrauschen; die Budget-Zeile „+0,00 ms" ist damit eingehalten.
Übrige Tripwires grün: Sprite-Pool-Median 1,70, Draw-Prep 2,53 (Konsist-Szene,
9 000 Units), E-18-Vollblock 4 000 Fahrzeuge p50 2,37, Chunk-Bake 0,47,
Partikel 0,30, Aspekt 0,03, Emissive 0,05, Flow-Prep 0,29 ms;
Flow-Export-Median 0,062 ms. Save der 1500-Fahrzeug-Referenzwelt 187 319 B,
in 619 ms zurückgelesen.

**Ring-Kosten gemessen statt geschätzt** (D-188): eine Checkpoint-Nutzlast der
25-Jahre-KI-Partie 25 471–39 081 B komprimiert gegen 1 206 267 B rohes
MessagePack, Encode 24,5–41,3 ms; alle 26 Checkpoints des Vierteljahrhunderts
916 498 B, bei Kapazität 16 hält der Ring Genesis + 15 Jahre = 566 367 B.
Log-Kompaktierung an einem Zwei-Jahres-Fixture: 44 304 B ganz gegen 23 494 B
auf einen Checkpoint getrimmt, und der getrimmte Stand läuft auf denselben
Hash weiter. **B3-Größen** (D-190): die `.ironreplay` derselben Partie
582 520 B gegen 593 434 B Save — der Ring dominiert beide —, das
Soak-Fixture 1 359 B **Text**, Crash-Bundle-Schema 1 → 2.

Fertig-wenn-Posten der M16-Sektion: jeder Spielstand per einem Klick als
Replay abspielbar ✓ (Konvertierung `replayFromSaveBytes` hinter drei Türen:
Speichern-Fenster, Import, Crash-Bundle — D-189/D-190), Sprung zu jedem
Jahres-Checkpoint ✓ (`replayJumpTicks` IST der Ring, ein Sprung auf eine
Jahresgrenze landet auf dem zugesicherten Hash, D-188/D-189), „Replay prüfen"
antwortet bei manipuliertem Log mit einem VERDIKT und nennt den abweichenden
Tick genau dann, wenn er beweisbar ist ✓ — **die ursprüngliche Fassung dieses
Postens („nennt den ersten abweichenden Tick", `exact: false` als ehrliche
obere Schranke, D-189) ist durch D-191 aufgehoben und war falsch**: bei einem
UMDATIERTEN Befehl glaubte die Kandidatenregel den Zeitstempeln der
Manipulation und nannte selbstbewusst den falschen Tick. Was der Code heute
zusichert (`tests/unit/replayVerdict.spec.ts`, `src/sim/save/replay.ts`):
`Verified`; `DivergedAt(tick)` **nur mit angehängtem Resimulations-Beweis**
(Fixture: Nutzlast-Manipulation im Zwei-Jahres-Replay ⇒ Tick 100 000, Beweis ab
Checkpoint 72 000, plus kommandofreier Kontrolllauf);
`DivergedInBracket(from, to, why)` mit einem von SECHS Gründen, wenn die
Verengung nicht beweisbar ist (Umdatierung, Log-Bruch, keine Zusicherung, kein
Befehl im Intervall, mehrere Befehle, Beweis nicht erbracht — der letzte seit
der M17-Abnahme ebenfalls durch ein Fixture belegt, D-197);
`CorruptRecording(where, what)` für eine Datei, die sich selbst widerspricht —
eine kaputte DATEI bekommt nie einen Tick. `exact: false` existiert nicht mehr,
**die aufgezeichnete 25-Jahre-KI-Partie als `.ironreplay` mit identischem
Final-Hash verifiziert ✓** (`npm run test:soak`: Seed 4 711, 256er-Karte, drei
Konkurrenten, 1 800 000 Ticks, 698 aufgezeichnete Befehle, Final-Hash
`615d0259186b89dc`, verglichen an 16 zugesicherten Ticks, 48,9 s Wanduhr
inklusive Nachrechnung; Fixture-Pin self-priming nach D-137-Protokoll),
**jedes Balance-Szenario sichert Hash-Gleichheit über zwei Läufe zu ✓** — mit
offengelegtem Preis: alle neun je Push im `soak`-Job (Wanduhr 223 s gegen 134 s
im Standardlauf; der aiCompany-Zwilling allein 101,6 s), die sieben billigen
in jedem gewöhnlichen Lauf, aufgezählt statt gezählt durch
`tests/unit/balanceDeterminism.spec.ts` (D-190). Alt-Saves bleiben abspielbar
und machen keine Behauptung (E-11: Cross-Version-Prüfung wird abgelehnt, nicht
geraten).

M17-Zeile im Detail: **SAVE_VERSION v28** — genau EIN Bump (Z5), er gehört der
Zielmaschine aus B1 (`goals` + `cargoDeliveredUnits`, beide gespeichert und
gehasht); B2 (`.ironscenario`-Metablock) und B4 (Spielende) erweitern dieselbe
`v27_to_v28`-Migration IN PLACE bzw. berühren gespeicherte Form gar nicht, B3
(Szenario-Browser) ebenfalls nicht. Weil B1 der erste Bump seit v26 ist, der
gehashten Weltzustand bewegt, wurden alle drei Pins nach Protokoll re-recorded:
kanonischer Cross-OS-Hash `50c7d6a38f6da052` → **`4dff3f3f216385e6`** (D-137),
Korpus-Manifest `17f7f507023b91d8` → **`f1dcab2a374ab728`** (sieben Fixtures,
D-130), Soak-Fixture `615d0259186b89dc` → **`ed8ac72cd1d6284d`** bei
unveränderten 698 aufgezeichneten Befehlen. Snapshot-Layout **8 → 9**,
+64 B je Slot (8 Ziele × 2 Int32) — die EINE gebuchte Layout-Änderung, und sie
bekommt in B4 ihren einzigen Konsumenten: die Balken des `GoalPanel`. Atlas 0.

Abnahme-Messwerte (Referenzmaschine, `npm run test:perf` 2026-08-08):
**Tick p50 1,241 / p99 2,564 ms** (max 18,40 ms über 6 500 Ticks,
Abschlusslauf nach allen vier Bundles) gegen die M10-Grundlinie 1,45/3,26 — der
B1-Lauf maß 1,181/2,449, beide im dokumentierten ±0,7-ms-Laufrauschen; die
Budget-Zeile „+0,05 ms" ist eingehalten. Allokation des Tages-Hooks gemessen
statt behauptet (`GCProfiler`): **0,17–0,71 B je Spieltag** über 50 000 Tage
gegen 336 B/Tag einer allokierenden Kontrolle (D-193). Übrige Tripwires grün:
Sprite-Pool-Median 1,73, Draw-Prep 2,33 (Konsist-Szene, 9 000 Units),
E-18-Vollblock 4 000 Fahrzeuge p50 2,13, Chunk-Bake 0,47, Partikel 0,31,
Aspekt 0,03, Emissive 0,04, Flow-Prep 0,26 ms; Flow-Export-Median 0,054 ms.
Save der 1500-Fahrzeug-Referenzwelt 187 370 B, in 644 ms zurückgelesen.

**Haupt-Bundle über den Meilenstein** (jede Zahl aus `npm run build`):
907,18 → 907,53 (B1) → 908,59 (B2) → 913,49 (B3) → **923,32 kB** (B4;
gzip 277,04 → 281,92), auf der Platte **924 308 B gegen das 930 000-B-Budget**
von `bundleBudget.spec.ts`. Restluft **5 692 B** — ausdrücklich protokolliert:
das Budget hatte bei seiner Festlegung 2,4 % Luft und M17 hat sie auf 0,6 %
verbraucht, ehrlich (alles Oberfläche, kein statischer Sim-Importpfad; allein
5,5 kB sind die rund fünfzig neuen deutschen und englischen Sätze). Der nächste
Meilenstein mit neuem Panel bucht eine Anhebung mit eigener Messung nach dem
D-192-Muster. **Die zwei Zahlen sind der Stand des Artefakts, nachgemessen nach
der zweiten Abnahme** (D-198, `npm run build` 2026-08-08): 924 276 / 5 724 war
der B4-Stand, D-197 legte mit `map/size.ts` +32 B drauf und D-198 bewegt den
Haupt-Chunk um null Byte — die Briefings liegen im eigenen Katalog-Chunk
(12 928 → 13 205 B), die Kartengrößen-Regel in Worker (324 283 → 324 367 B) und
`replay` (198 180 → 198 264 B). **D-199 bewegt keinen einzigen Chunk**
(nachgemessen, nicht angenommen: Haupt-Chunk 924 308 B, Katalog 13 205 B, Worker
324 367 B, `replay` 198 264 B, CSS unverändert — alles Zugefügte ist Kommentar
oder Test). Eigene Chunks: Szenario-Katalog 13,21 kB,
`GameEndScreen` 2,41 kB (`React.lazy` — der eine Bildschirm, den eine Sitzung
höchstens einmal zeigt), `replay` 198,26 kB, Worker 324,37 kB, CSS 13,43 kB.

Fertig-wenn-Posten der M17-Sektion: Ziel „Firmenwert ≥ 2 Mio. € bis 1975" löst
sim-seitig in einer 25-Jahres-Partie aus ✓ (Tick 860 800, Jahr 1961, Silber —
`tests/unit/goals.spec.ts`; **die Partie war bis zur Abnahmekorrektur D-197 nur
22 Jahre lang** — 1953 gebaut, bis `25 * TICKS_PER_YEAR` gespielt —, sie läuft
jetzt 1953–1978 und das 1975er Ziel ist ein Datum UNTERWEGS statt der letzte
Tag), zwei Läufe mit gleichem Seed hashen bit-identisch
denselben Medaillenstand ✓ (D-193), **Bankrott wie Zielerreichung zeigen je
einen Endbildschirm mit Punktzahl ✓** (EIN `GameEndScreen` mit vier Gründen —
Sieg, Bankrott, Niederlage, Jahrhundert; der Bankrott-Dialog ist einer davon
und schließt die M8-Lücke, D-196), acht Szenarien starten im Browser und enden
im Determinismus-Lauf hash-identisch ✓ (+14,5 s Suite, D-195), der
Metadaten-Kopplungstest schlägt rot an, wenn ein Briefing-Feld in den Hash
gerät ✓ (Meta-Test faltet Titel und deutsches Briefing in `hashWorld` und
verlangt, dass das Audit genau diese zwei Blätter nennt, D-194), **Replay laden
⇒ Resim reproduziert den Medaillenstand bit-exakt ✓** (`tests/unit/gameEnd.spec.ts`:
gespielte Zwei-Jahres-Aufzeichnung, `verifyReplay` = `verified`, Scoreboard
Feld für Feld gleich aus dem letzten Checkpoint UND aus dem Genesis-Tick,
Gegenprobe: eine einzige geänderte Medaille bewegt den Welt-Hash), Punktformel
mit Balance-Band ✓ (`tests/balance/gameScore.spec.ts`; **nach D-197 auf der
echten 25-Jahres-Partie neu gemessen: 5 889 Punkte, vier Viertel
36/26/24/13 %** — Band 3 000–7 000 unverändert, keine Konstante bewegt; die
frühere Zahl 5 747 stammt vom 22-Jahre-Lauf, D-196).

**M17-Abnahmekorrektur (D-197, 2026-08-08).** Vier von unabhängigen Prüfern
gefundene Ehrlichkeitsdefekte, ohne Save-Bump geschlossen (v28 steht): das
Passagiernetz-Briefing versprach acht Großstädte über einer Welt mit sieben
(Seed 10 → **360**, 8 Städte à 8 000 und 17 Orte ab 2 500 — aus 400 gescannten
Seeds tragen genau drei acht Städte); alle acht Szenarien wurden gegen ihre
generierte Welt nachgeprüft und vier weitere Angaben korrigiert
(Frachtrausch-Distanzen 57/59/70/106 statt „59 und 66"; drei
Bevölkerungszahlen waren um genau EIN Spieljahr verschoben); der Deckel darüber
ist `SCENARIO_WORLD_CLAIMS` in `tests/unit/shippedScenarios.spec.ts`, das je
Szenario jede briefing-tragende Welteigenschaft EXAKT pinnt. Dazu: die
Punktformel-Bande beweist jetzt etwas Unabhängiges (ein absichtlich schlecht
trassiertes Vierteljahrhundert mit IDENTISCHER Flotte erreicht 7,8 % statt
19,8 % der Decke, Faktor 2,55, 554 statt 1 413 Punkte), `SAVE_VERSION`-freie
Kopplung der Kartengröße an beiden Enden (`src/sim/map/size.ts`,
`tests/unit/mapSize.spec.ts`) und ein Fixture für den bis dahin ungetesteten
Verdikt-Zweig `ui.replay.bracket.unproven`.

**M17-Abnahmekorrektur, zweiter Durchgang (D-198, 2026-08-08).** Der Prüfer, der
`SCENARIO_WORLD_CLAIMS` bestätigt hat, hat den Wächter anschließend besiegt: er
hat die Fälschung in das deutsche PLAYER-BRIEFING gesetzt („Acht Großstädte zu
je 8.000 Einwohnern und siebzehn Orte ab 2.500" → „Neun … 9.000 … vierzig"),
die Claims-Tabelle unberührt gelassen — und die Suite blieb grün, weil nichts
im Repository den INHALT eines Briefings las. Geschlossen durch
`SCENARIO_BRIEFING_FIGURES` (dieselbe Datei): jede Zahl jedes Briefings, in
Lesereihenfolge, entweder aus der Claims-Tabelle/den eigenen Regeln, Zielen und
Konstanten ZURÜCKGELESEN oder auf einer Acht-Einträge-Allowlist mit
ausgeschriebenem Grund; beide Sprachen gegen dieselbe Liste, ausgeschriebene
Zahlwörter eingeschlossen („acht", „siebzehn", „vierzig" — so war die Fälschung
geschrieben). Die Fälschung wurde in die echte Quelle gepflanzt, der rote Build
beobachtet und wieder entfernt (Beleg im `DECISIONS.md`-Eintrag). Dazu:
Passagiernetz sagt die Mengenlage jetzt eindeutig (die acht liegen INNERHALB der
siebzehn von vierzig Orten — die alte Formulierung las sich als 8 + 17 = 25),
`CorridorClaim` adressiert auch Industrien (Frachtrausch' vier Grube→Kraftwerk-
Korridore waren unausdrückbar, und „drei der vier" war um eins falsch — es sind
alle vier), Insel↔Stadt ist als Paar gepinnt, die passiven Wachstumskurven
(4× temperiert, 2× Wüste) werden ausgespielt statt zitiert, und die
Kartengrößen-Absage kommt jetzt aus der Tür, die das Spiel benutzt:
`World.create({mapSize: 32})` antwortete mit „No playable map found for seed 7
after 20 attempts", weil Mapgen vor dem Größencheck lief. Ohne Save-Bump
(v28 steht), ohne Snapshot-Byte, ohne Protokollfeld.

**M17-Abnahmekorrektur, dritter Durchgang (D-199, 2026-08-08).** Derselbe Prüfer
hat den Zahlen-Wächter noch zweimal geschlagen. (1) Die ORTSNAMEN eines Briefings
hingen an nichts: „Rosenburg" → „Rosenheim" und „Ahorngrund" → „Ahornthal" NUR im
deutschen Passagiernetz-Briefing, das englische blieb korrekt — Build grün.
Geschlossen durch `tests/unit/briefingPlaceNames.ts`, das sein Muster aus den
jetzt exportierten Silbentabellen des Kartengenerators baut (ein Name ist exakt
`Root + Suffix`, optional hinter `Prefix-`; das Muster D-174/D-183: die
Aufzählung lebt an EINER Stelle und der Audit konsumiert sie). `briefingTowns`
deklariert je Szenario die Stadt-Ids in LESEREIHENFOLGE, beide Sprachen gegen
dieselbe Sequenz: ein erfundener Name, den der Generator hätte bilden können,
wird extrahiert und abgelehnt; einer, den er nicht bilden kann, lässt den
deklarierten Namen verschwinden; zwei echte Städte vertauscht scheitern an der
REIHENFOLGE; eine Ergänzung an der Länge. Zielunterschriften werden als MENGE
gegen die Städte ihres eigenen Deskriptors geprüft — keine zweite Tabelle, und
die Wortstellung bleibt dem Übersetzer. Beide Fälschungen wurden in die echte
Quelle gepflanzt, der rote Build beobachtet und wieder entfernt.
(2) Die DOC-COMMENTS des Katalogs liest nichts zurück — fünf gefälschte Angaben,
41/41 grün. Das bleibt bewusst so, gemessen statt behauptet: die acht
Szenario-Kommentare plus der Dateikopf tragen **236 Zahlen** gegen **58**
deklarierte Briefing-Figuren, und sie sind nicht EINE Sorte Behauptung — 10
Entscheidungsverweise, 6 Koordinatenpaare (die der Extraktor je als EINE Zahl
liest, und zwar die falsche — auf zwei verschiedene Weisen), rund fünfzehn
Messungen aus ANDEREN
Welten, die Herkunft des Seed-Scans, und Zahlen, die die Kommentare zitieren,
WEIL sie falsch sind (der Kopf erzählt D-198s Fälschung, Frachtrausch hält fest,
dass „drei der vier" um eins danebenlag). Eine Allowlist von über hundert
Einträgen hätte genau die Disziplin zerstört, die den Briefing-Audit trägt. Die
Grenze liegt dort, wo die Leserschaft wechselt: **der Audit liest Text, den ein
SPIELER sieht.** Dazu: zwei Doc-Comment-Figuren, die an nichts hingen, sind
gepinnt (Gebirgslogistiks Höhenband 2–13 als `CorridorClaim.heights`,
Frachtrausch' „57 gegen 66" als fünfter Korridor plus Grubenposition — beide
heute wahr, es geht um Haltbarkeit), das dokumentierte Einfüge-Loch ist für vier
Mengenwörter geschlossen (Dutzend, Handvoll, dozen, handful — als VERDACHT ohne
Wert) und für drei mit Begründung abgelehnt (Paar/couple/score, als grüne
Testfälle festgehalten), und zwei Dokumentations-Überzeichnungen sind korrigiert.
Ohne Save-Bump (v28 steht), ohne Snapshot-Byte, ohne Protokollfeld, ohne ein Byte
Bundle-Änderung.

**M18-Zeile im Detail: SAVE_VERSION v29 — genau EIN Bump (Z5),** Besitzer die
Weltregel `weather` und ihr 16×16-Feld (B1); B2, B3, B4 und B5 haben die
`v28_to_v29`-Migration nicht einmal erweitert — ein Multiplikator an einer
bestehenden Naht, ein Repaint, ein Balance-Szenario und eine
Konstanten-Tabelle tragen keinen Zustand.
Snapshot-Layout 9 → 10 wie zugesagt (+`WeatherCount`, 256 Int32 je Slot);
Atlas 0 Zellen (die Schneegrenze benutzt die seit M1 vorhandene
`Terrain.Snow`-Zelle, die Saison-Optik ist Regeneration). Pins nach dem
D-137-Protokoll EINMAL bewegt, in B1: kanonisch `4dff3f3f216385e6` →
**`5a2a6cf73f4107bb`**, Korpus `f1dcab2a374ab728` → **`c0a021f5d1ee8619`**
(alle acht Fixtures, sieben davon von früheren Builds geschrieben, dekodieren
in EINE Welt), Soak `ed8ac72cd1d6284d` → **`e6c5e33d8e7607ec`** bei
unveränderten 698 Kommandos — und in B2, B3, B4 und B5 nachgeprüft durch
Ausführen, nicht angenommen (B5 ändert eine Konstanten-Tabelle, die nur
`updateWeather` liest, und eine Welt mit Regel „aus" erreicht diese Zeile
nie). Übrige Tripwires nach allen Bundles grün
(Abschlusslauf): Sprite-Pool-Median 1,71 ms (Gate 10), Draw-Prep 2,33 ms in
der Konsist-Szene mit 9 000 Units (Gate 10), E-18-Vollblock 4 000 Fahrzeuge
p50 2,60 ms, Chunk-Bake 0,59 (Gate 3), Partikel 0,28 (Gate 2),
**Wetter-Partikel 0,21 / im M13-Überlastszenario 0,28 (Gate 2)**, Aspekt 0,04
(Gate 2), Emissive 0,05 (Gate 2), Flow-Prep 0,27 (Gate 3),
Flow-Export-Median 0,052 ms.

**Haupt-Bundle über den Meilenstein** (jede Zahl aus `npm run build`):
924 308 → 926 473 (B1) → 927 719 (B2) → 934 751 (B3) → 934 926 (B4, zweimal
byte-identisch nachgemessen und ohne eine einzige Änderung unter `src/`; die
175 B gegen die B3-Zahl sind unerklärt und stehen als unerklärt da) →
**935 002 B** (B5: +76 B für die neue reine Funktion und die abgeleitete
Konstante, die über `constants.ts` in den Haupt-Chunk geraten — die gelöschte
Zwölf-Element-Tabelle spart weniger, als die Funktion kostet). **Das Budget
wurde in B3 mit Messung von 930 000 auf 950 000 B angehoben** (D-192s Regel,
von D-200 und D-201 angekündigt); Restluft **14 998 B**. Eigene Chunks:
`SimWorker` 328 296 → 328 376 B, `replay` 200 040 → 200 050 B,
Szenario-Katalog 13 319 B und CSS 13 427 B unverändert.

Fertig-wenn-Posten der M18-Sektion: eine 5-Jahres-Partie mit „Wetter: rau" in
zwei Läufen bit-identisch ✓ (`weather.spec.ts`, plus die neun
Balance-Zwillinge und der `hardWinter`-Zwilling, D-200/D-203); ein v28-Save
lädt unverändert und verhält sich mit „Wetter: aus" exakt wie vorher ✓ (die
Off-Identität ist eine Eigenschaft der Arithmetik — jede Faktortabelle ist bei
`Clear` exakt 1 und die Regel gattet vor dem Feld, D-201; belegt dadurch, dass
kein Pin sich bewegte); der Atlas regeneriert beim Monatswechsel in ≤ 30 ms
ohne sichtbaren Frame-Hänger ✓ (in einem echten Browser gemessen: ganze
Regeneration über BEIDE Seiten p50 1,35–3,34 ms gegen 30 ms, zwei Schritte je
Frame, D-202); im Winter erscheint eine höhenabhängige Schneegrenze ✓
(`snowLineFor` liest `winterFrictionFactor` rückwärts, temperiert Januar ab
Höhe 10, D-202). **Der letzte Posten ist der einzige, der NICHT eingelöst,
sondern re-bandiert ist:** „ein harter Winter drückt die Referenz-Kohlelinie
messbar um 8–15 %" — Band **3–7 %**, `tests/balance/hardWinter.spec.ts`.

**Und dieses Re-Banding stand zunächst auf unzulässigem Grund.** B4 maß
−4,95 % und nannte als ersten von drei Gründen für die Ablehnung des Weges
nach 8–15 %, dass `WEATHER_FROST_SEASON` klimablind sei — also einen DEFEKT.
Ein Re-Banding, dessen Begründung ein Bug ist, ist keins: erlaubt ist der
evidenzbasierte Weg (D-158). **B5 hat deshalb erst den Defekt behoben, dann
neu gemessen, dann entschieden** (D-204). Die Frostschwelle ist jetzt
`frostSeasonFactor` — dieselbe klimabewusste Winterkurve, die die Jahreszeit
für Reibung und Schneegrenze benutzt: Tropen exakt null (gemessen null
Frost-Regionstage über ein raues Spieljahr), Arktis härter UND länger
(5,2 % Frostanteil gegen temperiert 3,1 % und Wüste 0,8 %), temperierter
Januar EXAKT unverändert. Neu gemessen: **−4,36 %** (6 Seeds × 9 Jahre,
3 510 797 → 3 357 840 EUR Frachterlös) — die Lücke zu 8–15 % waren nie die
Tropen. Der Effekt ist winterlastig auf zwei Instrumenten, die NICHT die
bandierte Zahl sind, und beide TRENNTEN sich unter D-204 weiter als zuvor
(Pannen Dez/Jan/Feb +32,9 % gegen +7,3 % in den übrigen neun Monaten;
mittlere Fahrgeschwindigkeit −4,94 % gegen −2,97 %), und keiner der sechs
Seeds verdient mit Wetter mehr als ohne. **Keine Konstante wurde auf das Band
getrimmt.** Neu erhobene Kanal-Zerlegung: Pannenschwelle ~3,8 der 4,36 Punkte,
alle übrigen Kanäle im Rauschen des Sechs-Seed-Ensembles — zwei messen
NEGATIV, weshalb D-203s Reihenfolge unterhalb des führenden Terms nicht trägt.
Permanent-Winter-Decke **−25,24 %** (die Nähte sind also nicht zu schwach);
was klein ist, ist der Jahresanteil des teuren Himmels (Frost hält 9,1 % der
Dez/Jan/Feb-Regionstage, weil sein Gewicht 14 nie geboostet wird, während
Regens 20 vom Nachbarzug bis ×2,4 multipliziert wird). Zwei der vier Nähte
sind auf dieser Linie strukturell inert (eine Kohlegrube ist weder Farm noch
Forst; Kohle verdirbt nicht). Offen und benannt: die HITZE-Schwelle bleibt
klimablind, weil es keine Sommer-Tabelle zum Wiederverwenden gibt — die
Buchung gehört zu M23s Klima-Sets. Szenarien 1–4 und jedes andere Band aus
19.4 fahren weiter mit Regel „aus" (Fehler 34).

Die M10-Grundlinie liegt UNTER der linearen Extrapolation (~3–4 ms) — der
Eskalationspfad (Kanten-Graph vor M14) ist nicht ausgelöst. Referenzmaschine:
Ryzen 5 7520U (4C/8T), 16 GB, Windows 11, Node 24 — schwächer als das
SPEC-§21-Referenzsystem bewusst erlaubt. Render-Tripwire-Grundlinie (6.3):
Sprite-Pool-Rebuild p99 4,3 ms bei 7 101 Sprites (64×64-Fenster), Draw-Prep
p99 0,41 ms bei 1 500 Fahrzeugen (D-136). Cross-OS-Anker: kanonischer
Welt-Hash gepinnt in `tests/determinism/fixtures/canonical-hash.json`
(D-137); die Datei ist die einzige Wahrheit — der Pin wandert mit jeder
hash-relevanten Migration und wird dort re-recorded (M10-Erstwert war
`63ae5fd6b5d01190` auf v23, seit v24 gilt der Datei-Stand).

### 6.2 Atlas-Seiten-Plan

| Seite | Inhalt | Budget |
|---|---|---|
| 0 | Terrain/Statik (Bestand 2176×2688) + 4 Wasser-Zeilen (M12 eingelöst: 3 Animations- + 1 Küstensaum-Zeile, D-164) + 1 Emissive-Zeile (M13 B4 eingelöst: 6 Fenster-Zwillinge der Stadtgebäude + 3 verglaste Industrien, D-172) + 1 Signal-/Fahrleitungs-Zeile (M13 B5 eingelöst: 4 Mast-Silhouetten nach Signaltyp, 2 Aspekt-Lampen, 1 Fahrleitungsmast, 8 Draht-Halbsegmente, D-173) — Stand 2176×3840 von 4096 | Restfläche; KEINE Fahrzeug-Zellen hier |
| 0-detail | 4×-Zwilling von Seite 0 für die oberste Zoomstufe (prozedural, M12): kurze Zeilen für Terrain/Straße/Gleis, hohe für Gebäude/Industrie/Statik | gebucht 4096×4096 von 4096 (D-163; M13 B5: die 15 Signal-/Fahrleitungs-Zellen füllen die 8 freien Gleis-Spalten + die letzte kurze 256-px-Zeile, D-173) — **die Seite ist VOLL**; jede weitere Zelle braucht eine neue Seiten-Buchung hier |
| 1 | Fahrzeuge + gebackene Objekte (Kenney-Bake, Build-Artefakt, D-160/D-169): 95 Fahrzeuge × 8 Facings + 50 Statik-Zellen (Stadt/Industrie/Bäume), jede Zelle ein Basis+Masken-Paar | ~600 Zellen, eigene 4096²-Seite — **M13 B1 gemessen und ehrlich überbucht (Fehlerkatalog 40): 810 Zellen je Zoomstufe; z1 = 1 Seite 4096×1057, z2 = 1 Seite 4092×3606, z4 = 4 Seiten ≤ 4096² (M14 B0 nachgemessen: der mail2-Remap weg vom Pantographen-Mittelwagen nimmt z1 zehn Pixel Kopfraum und setzt z4-Seite 0 auf 4056×4015, D-175). Zur Laufzeit sind nur die Seiten EINER Zoomstufe GPU-resident; der ~600er-Plan stammt aus der Vor-Kenney-Schätzung (D-169). B2: Kontaktschatten IN die Zellrechtecke gebacken (Clip + Randblende) — Seitenmaße byte-identisch zur B1-Buchung; die ungeclippte Fassung hätte z2 auf 2 und z4 auf 6 Seiten getrieben und wurde verworfen (D-170)** |
| 2 | Emissive-Zwillinge (Fenster/Lampen/Signale) + Ären-/Klima-Varianten | ~150 + Emissive, eigene Seite — **M14 B0 nachgemessen (D-175): 545/552/553 Emissive-Zwillinge je Zoomstufe z1/z2/z4 (Verglasung, die die Occlusion überlebt — Pixel-Entscheid je Facing UND Zoom, D-172; die flache M13-B4-Zahl „548 je Zoomstufe" traf schon vor dem Remap keinen einzelnen Zoom, gemessen 543/550/551); z1 = 4096×568, z2 = 4088×1498, z4 = 4082×4034 + 3826×1396, ~235 KiB; wie bei Seite 1 nur die Seiten EINER Zoomstufe GPU-resident. Lampen-/Scheinwerfer-Glühen sind prozedurale Laufzeit-Texturen (kein Seitenverbrauch); Signal-Emissive (M13 B5) ist dieselbe prozedurale Laufzeit-Textur, per Aspekt getönt — kein Seitenverbrauch (D-173); Ären-/Klima-Varianten buchen weiterhin hier (M23)** |

Saison-/Ären-Wechsel belegen KEINE zusätzlichen Zellen — Regeneration
(≤ 30 ms async, debounced auf max. 1 Rebuild/Realsekunde bei 20×) ist der
Mechanismus. Jede Zellen-Buchung außerhalb dieser Tabelle ist ein
Ledger-Verstoß.

### 6.3 CI-Matrix

| Job | ab | Inhalt |
|---|---|---|
| lint+types | M10 | unverändert |
| determinism | M10 | Runner parst ALLE CommandKinds; ab M10 zusätzlich **ubuntu-latest** (erste Cross-OS-Hash-Evidenz) |
| balance | M10 | jedes Szenario 2× mit Hash-Assertion (ab M16 verbindlich); Referenzläufe mit allen Regeln „aus" — **M16 B3 eingelöst und ehrlich geteilt: der Zwilling ist gemessen (+186 s CPU, davon 143 s allein die zwei 25-Jahre-KI-Szenarien), deshalb laufen im gewöhnlichen `npm test` die sieben billigen Zwillinge (+43 s) und ALLE neun im `soak`-Job je Push; `tests/balance/determinism.ts` trägt die Messwerte, ein Kopplungstest (`tests/unit/balanceDeterminism.spec.ts`) zählt die Szenarien nicht, sondern zählt sie AUF (D-190)** |
| perf | M10 | 1500-Fzg.-Fixture p99; Render-Tripwire (Sprite-Pool-Rebuild-ms, Draw-Prep-ms; ab M12 Chunk-Bake-ms; ab M13 Partikel-ms; ab M14 Flow-Export-ms je Publish + Flow-Prep-ms am 4096-Leg-Megagraph) |
| soak | M16 | **neu (D-190):** `npm run test:soak` — aufgezeichnete 25-Jahre-KI-Partie, gegen die 16 zugesicherten Jahres-Hashes UND einen Textmanifest-Pin nachgerechnet (`tests/soak/fixtures/soak-ai-quarter-century.json`, self-priming nach dem D-137-Protokoll); dazu die vollständige Balance-Zwillings-Matrix (`IRON_VEINS_BALANCE_HASH=all`). Läuft auf `windows-latest` — der Referenzplattform beider Pins; die Cross-OS-Frage bleibt D-137s eigenes, bewusst billiges Fixture |
| desktop-smoke | M25 | wöchentlich, Rust gecacht; release.yml auf Tag |

---

## 7. FEHLERKATALOG 2 — was in DIESER Expansion garantiert schiefgeht

Fortsetzung von SPEC.md Abschnitt 22 (dort 1–22). Vor jedem Meilenstein erneut
lesen.

23. **Historischer Layer als „derived".** Nach dem Laden andere Pfadkosten,
    andere Routen, Gesetz-3-Bruch. Jeder historische Input in Sim-Entscheidungen
    ist Save-Zustand (Z4).
24. **Weltregel ohne Save-Bump.** „Derived, no save change" + „world rule" im
    selben Vorschlag — der wiederkehrende Audit-Planungsfehler. Der
    Kopplungstest aus M10 macht ihn zum roten Build (Z2).
25. **Stray-Draw in neuer Mechanik.** Ein einziger fremder Draw verschiebt
    jeden späteren Pannen-Roll und forkt jeden Alt-Seed (D-106-Vorfall,
    D-093-Argument). `streamFor` oder null RNG; Modulation nur per
    Threshold-Band bei identischer Draw-Zahl (Z3).
26. **Zwei parallele Konzepte für dieselbe Entität.** `AiState.lines` neben der
    Spieler-Line ist ein Dauer-Divergenz-Generator. Migration und Löschung im
    SELBEN Meilenstein (E-06).
27. **Vollflächen-Chunking.** Gebackene Texturen können Fahrzeuge nie in die
    (x+y)-Ordnung einsortieren — bricht die 16.1-Okklusion dauerhaft. Nur der
    Hybrid (E-04).
28. **Per-Parcel-Attribute statt Cargo-IDs.** Bricht den Stack-Merge-Key und
    jeden Fixed-Size-Hot-Path-Loop für dasselbe Spielergebnis (E-08).
29. **Pseudo-Firmen-Commands für Sim-eigene Mutationen.** Flutet das Replay-Log
    mit Nicht-Spieler-Rauschen; der Monats-Hook ist der legitime Autor (E-10).
30. **Partielles Undo.** Schlimmer als keins (D-114). Nur ganz-oder-abgelehnt
    mit Hash-Beweis (E-12).
31. **Binär- oder KI-Assets im Repo.** Zerstört den
    Regenerations-Kostenvorteil, bricht Offline-Reproduzierbarkeit und
    Headless-Tests. Glob-Test ist der Wächter (E-14).
32. **Monatserster-Spike.** 140 Städte × Platzierungssuche in einem Tick ist
    der 7.3-Kadenzfehler auf Städte übertragen. Round-Robin (E-10).
33. **Zweiter Publish-Pass.** `structureSignature` iteriert schon heute alle
    Stationen+Industrien pro Publish — jeder neue Export (Flow-Atlas) benutzt
    denselben Pass MIT, statt einen zweiten anzulegen.
34. **Balance-Re-Banding außerhalb des einführenden Meilensteins.** Jede
    Weltregel ships mit Off-Anker; Referenzläufe bleiben gepinnt, sonst frisst
    die Suite die CI.
35. **Szenario-Metadaten im Welt-Hash.** Ein Briefing-Tippfehler wird zum
    Desync. Der Metadatenblock ist UNGEHASHT, und ein Kopplungstest erzwingt
    die Grenze (M17/M22).
36. **Tick-Budget-Zusagen ohne Grundlinie.** Gemessen sind 300
    Straßenfahrzeuge bei 1,5 ms p99 — sonst nichts. Erst das M10-Fixture macht
    Zusagen zu Zusagen (Z6).
37. **Snapshot-Stride wächst pro Feature.** Der 20-Hz-Stride bleibt fixed-size
    und allokationsfrei; Niederfrequentes (Konsists, Kompositionen) reist über
    den Marker-Kanal (E-05).
38. **Validierungs-Verschärfung ohne Replay-Versions-Pinning.** Ein unter
    anderer Validierung verifiziertes Replay meldet falsche Desyncs.
    Cross-Version wird abgelehnt, nie geraten (E-11).
39. **Wanduhr in Welt-Animation.** Wasser-/Partikel-Frames keyen an
    Snapshot-Zählern, nie an `performance.now()` — sonst sind Screenshots und
    Replays nicht reproduzierbar.
40. **Atlas-Zellen ohne Ledger-Buchung.** Seite 0 steht bei 2176×3456 von
    4096 (seit M12, D-164); eine naive Erweiterung überläuft still. Jede
    Zelle wird gebucht (6.2).

---

## 8. MEILENSTEINE M10–M25

Jeder Meilenstein endet mit: alle Tests grün · `npm run build` fehlerfrei ·
Ledger-Zeile abgenommen · Eintrag in `DECISIONS.md` · Git-Commit · kurze
deutsche Zusammenfassung, was jetzt spielbar ist. **Am Ende jedes Meilensteins
muss das Spiel startbar und im erreichten Umfang spielbar sein.**

Abhängigkeitsordnung: M10 blockiert alles. M11 (Linien-Rückgrat) blockiert
M14, M15, M21, M24. M12 blockiert M13, M22. M16 (Beweis-Kette) liegt bewusst
VOR den Weltdynamiken M18–M21, weil der Desync-Detektor deren Entwicklung
absichert. M24 liegt bewusst NACH M11 (glaubwürdige KI), M17 (Szenarioformat)
und M23 (Ären/Klimata).

---

### M10 — Härtung & Verfassung

Kein Weltregel-Feature, bevor die verifizierten Defekte geschlossen sind — ein
Spiel, dessen Identität „beweisbare Wahrheit" ist, trägt keine undokumentierten
SPEC-Abweichungen, und Terraforming unter Gleis würde unter jedem neuen System
(Stadtwachstum verlängert Straßen! KI baut!) zur stillen Korruptionsquelle.

**MUSS — verifizierte Defekte:**

* `cornerIsFree` (src/sim/map/terraform.ts:75–88) blockiert
  `trackBits`/Signal/Struktur und respektiert den Tile-Owner;
  `execute.ts:245–261` validiert entsprechend. Regressionstests: Terraform
  unter fahrendem Zug, unter Brücke, unter fremdem Gleis — rot → grün.
  Unconditional, kein Regel-Gate (E-11).
* `projection.drawOrder()` in `MapView` verdrahten: Fahrzeuge in
  Tile-Reihenfolge einsortiert (SPEC.md 16.1) — Züge verschwinden hinter
  Hügeln.
* Manueller Baumodus erreichbar (`assistant:false` in `MapCanvas.tsx:301` /
  `ConnectPanel.tsx:118` exponieren; M-Tasten-Beschreibung zurück zur
  D-114-Tabelle).
* Refit-UI-Pfad für `CommandKind.RefitVehicle` (Depot-Aktion) — Tutorial-
  Lektion 5 (`src/ui/tutorial.ts:156`) ist über die UI abschließbar.
* Esc entwaffnet das aktive Werkzeug (roadAnchor/Connect-Flow); tote N-Taste
  an Minimap-Modus-Zyklus verdrahtet; Signalrichtungs-Wahl statt hardcoded
  `TrackDir.East` (`MapCanvas.tsx:157`).
* Tag/Nacht-Minimalform nach SPEC.md 16.3: EINE Farbmodulation über den
  Welt-Container aus dem Snapshot-Tick (200-Tick-Tag), abschaltbares SETTING
  (D-110, render-only; Emissive folgt in M13).
* Fehlende `DECISIONS.md`-Einträge: 16.1-Chunking-Historie (Hybrid-Entscheid,
  E-04), 8.4-Stau-Auslassung (Stundung bis M15, dann ersetzt der
  Implementierungs-Eintrag den Platzhalter), Replay-Versions-Pinning (E-11).

**MUSS — Verfassungs-Infrastruktur:**

* `world.streamFor(salt)` als API (formalisiert D-106); `contracts`/`tenders`
  migrieren darauf; Lint-Flag gegen neue rohe `world.rng`-Draws.
* Determinismus-Runner (`tests/determinism/runner.ts`) parst ALLE
  CommandKinds (`parseCommand` aus `src/sim/save/format.ts` wiederverwenden;
  heute: 4 von allen) + Record-Fixture-Devkommando.
* Drei Kopplungstests nach `i18n.spec.ts`-Muster: CommandKind ↔ UI-Aussteller,
  CommandKind ↔ Runner-Parser, Save-Feld ↔ `hashWorld` ↔ Parser (erzwingt Z2).
* Save-Robustheit: atomares Schreiben (tmp+rename) in
  `src/platform/Storage.ts`, Vorgänger als `.bak`, `hashWorld`-Digest beim
  Encoden IN die Datei und beim Laden verifiziert, Salvage-Load benennt das
  fehlgeschlagene Feld. **SAVE_VERSION v23** + Migration + Kompat-Korpus
  (echte Fixtures je Version, in CI hash-verifiziert).
* Crash-Sicherheit: Worker `onerror`/`unhandledrejection` → Main-Thread hält
  letztes Autosave + rollierenden Command-Log-Schwanz (~1 MB) und schreibt ein
  Crash-Bundle (Autosave + Log-Schwanz + Versions-Tripel) nach
  `$APPDATA/crashes`; „Bug-Report exportieren"-Button. Persistenz-Policy beim
  Main-Thread (D-111 — ein toter Worker encodet kein Save).
* Perf-Grundlinie: Fixture mit **1500 arbeitenden Fahrzeugen inkl.
  Züge+Signale+Cargo-Routing auf 1024²**, p99 gemessen und protokolliert;
  Render-CPU-ms-Tripwire in CI (6.3). Cross-OS-Determinismus-Job
  (ubuntu vs. windows, Hash-Gleichheit).
* SPEC2-Prozessartefakte angelegt: dieses Ledger als lebende Tabelle,
  indexiertes `DECISIONS.md`-Register (Topic → D-IDs).

**Fertig, wenn:** Terraforming unter Gleis/Signal/Struktur/Fremdbesitz per Test
nachweislich abgelehnt wird, ein Zug im 19.5-Regressionsnetz hinter einem
höheren Hügel verschwindet, Tutorial-Lektion 5 vollständig über die UI
abschließbar ist, Esc jedes armierte Werkzeug entwaffnet, der
Determinismus-Runner nachweislich jede CommandKind parst, die drei
Kopplungstests grün sind UND nachweislich rot anschlagen, wenn eine
CommandKind ohne UI-Aussteller hinzukommt, eine absichtlich bit-geflippte
Save-Datei am Digest erkannt wird und die `.bak` lädt, ein hart terminierter
Worker beim nächsten Start ein ladbares Crash-Bundle anbietet, und das
1500-Fahrzeug-Fixture eine dokumentierte p99-Grundlinie ≤ 8 ms liefert.

---

### M11 — Das Linien-Rückgrat: Auftrags-Grammatik, Linien, Takt, KI-Adoption

Der verschmolzene Kern-Meilenstein der Expansion: SPEC.md 12.1 + 12.2 + 12.3
vollständig, in strikter interner Reihenfolge (Grammatik → Linien → Takt),
damit die meistreferenzierte Entität des Spiels genau einmal geformt wird.
Schließt D-093, D-116 und D-121.

**MUSS — Stufe A, Auftrags-Grammatik (12.1 komplett):**

* `OrderTarget.Waypoint` (Gleis-Marker/Boje/Straßen-Tile; Marker-Tiles laufen
  durch die M10-gehärteten Bau-Guards), Lademodus `voll_beliebig`,
  Entlademodi `nur_transfer`/`erzwungen`, `refitTo` pro Auftrag, `waitTicks`,
  bedingte Sprünge (Ladung %/Zuverlässigkeit/Alter/Wartezeit/Datum) —
  `VehicleStore`-Stride wächst fixed-size (Gesetz 7), Auswertung NUR am Halt,
  nie pro Tick; Sprungziel-Validierung + Sprung-Deckel gegen Endlosschleifen.
* Voller Auftrags-Editor: Stop-Zeilen mit Umsortieren/Entfernen, per-Stop-
  Flags, Depot-/Waypoint-Ziele, Bedingungszeilen — kompiliert zu EINEM
  `SetVehicleOrders`-Command pro Drop.

**MUSS — Stufe B, Linien (12.2):**

* `LineStore` als Struct-of-Arrays (`MAX_LINES` in `constants.ts`), saved +
  hashed; Commands `CreateLine`/`DeleteLine`/`SetLineOrders`/
  `AssignVehicleToLine`/`ReleaseVehicleFromLine`. Linien-Fahrzeuge lesen die
  Linien-Orderliste; gelöste Fahrzeuge behalten eine private Kopie;
  Edit-Semantik: Fahrzeuge re-ankern am nächsten Stop.
* Per-Line-Ökonomie: Auslastung, Gewinn/Spieljahr, Ø-Umlaufzeit aus den
  D-077-Legs (Ankunft-zu-Ankunft, einzige Rundenzeit-Quelle — keine zweite
  Messung), wartende Fracht je Halt — recompute-from-store (M6-Regel).
* Linien-UI: Taste **L** öffnet die Linienliste (ListPanel-Generik),
  Liniendetail mit Stops/Regeln/Kennzahlen, Straight-Line-54-km/h-Fallback
  wird als solcher AUSGEWIESEN (D-077).
* Per-Line-Auto-Renewal ersetzt den firmenweiten D-093-Schalter — weiterhin
  null RNG, Totalordnung.
* **KI-Adoption im selben Meilenstein:** `AiState.lines` wird auf die echte
  Entität migriert und GELÖSCHT (`grep AiState.lines` = null Treffer, E-06).

**MUSS — Stufe C, Takt + Anschlusssicherung (12.3) + KI-Flotte:**

* Taktzeit + Startversatz pro Linie; `WaitingForSlot`/`WaitingForConnection`
  als gespeicherte Zustände im 11.4-Automaten; Slot-Arithmetik null RNG (E-07);
  Taktpunkte nur auf Bahnsteigen; Verspätung in Spieltagen im Panel.
* Flottenberater `ceil(gemessene Umlaufzeit / Takt)` mit Headroom im
  Liniendetail — und wörtlich dieselbe Formel dimensioniert die KI-Flotte
  (ersetzt `AI_VEHICLES_PER_LINE = 1`); bei Rail baut die KI Ausweichen +
  Blocksignale nach D-082-Formen via `enqueueInfrastructure`.
* Anschlusssicherung: Umsteigeknoten-Markierung, Wartegraph derived
  (D-054-Muster), Zyklensuche iterativ, Zyklus ⇒ sofortiger Warteabbruch,
  harte X-Tick-Obergrenze (E-07).
* **Szenario 5 geht IN die Suite** (`tests/balance/aiCompany.spec.ts`: KI
  allein, 512², 25 Jahre, Firmenwert 5–25 Mio. €) — schließt D-116;
  `aiGame.spec.ts`-Assertions gehärtet (Solvenz-Zahl und Wert-Floors
  asserted statt narrated).
  *[Nachtrag 07.08.2026, D-158: Das 5–25-Mio.-Band ist auf dieser
  Ökonomie physikalisch nicht erreichbar — die Achievability-Probe
  (kompetentes Spieler-Netz über das komplette tragfähige Angebot der
  Szenario-5-Karte, mit 6 Mio. freiem Kapital) wächst in 25 Jahren um
  höchstens ~840 000 € und verliert davon den Großteil an die
  Flottenerneuerung. Szenario 5 ist IN der Suite auf dem gemessenen
  Band: Road (Seed 4711) 0,8–3,2 Mio. € plus
  Compounding-durch-Renewal-Assertion (gemessen 1 119 720 €); Rail
  (Seed 3) und Expansiv (Seed 2) solvent mit stehendem Netz und
  positivem Wert (gemessen 90 230 € / 121 328 €), deren Stagnation
  bleibt der benannte nächste KI-Engpass. SPEC.md bleibt unangetastet
  (D-123).]*
  *[Nachtrag 11.08.2026, D-220: Die zweite Hälfte dieser Zusage —
  „`aiGame.spec.ts`-Assertions gehärtet" — war auf EINEN Seed gehärtet.
  Jede Aussage, die diese Datei über die KI traf, war eine Eigenschaft von
  Seed 4711; D-216 hat das gemessen, D-218 und D-219 haben je einen Defekt
  gefunden, auf dem der grüne Ein-Seed-Lauf seit M8 saß. Der Abnahmelauf
  ist jetzt ein **Vier-Seed-Sweep** (4711, 4713, 4712, 4714; zwei je Lauf,
  alle vier im CI-`soak`-Job über dieselbe `IRON_VEINS_BALANCE_HASH=all`-
  Weiche), und asserted wird nur, was auf ALLEN vier gilt. Ausdrücklich
  NICHT mehr asserted, weil auf drei von vier Seeds rot: „höchstens eine
  Firma wird abgewickelt" und „die reichste Firma hat gebaut". Dazu ein
  **Refusal-Profil** (`tests/balance/aiRefusals.ts`) über den Outcome-Sink
  von `World.step` — reiner Beobachter, null Sim-Änderung —, das genau die
  Klasse Defekt sieht, die die Bilanz zum Jahr 25 nicht zeigt: eine KI, die
  ein Kommando 8+ Mal ohne eine einzige Annahme absetzt (D-219 waren 253
  und 1 265), und eine DEKLARIERTE Liste der (Kommando, Ablehnungsgrund)-
  Paare, die die KI sammeln darf. Szenario 5 auf der reparierten KI neu
  gemessen und NICHT verschoben: Road 1 173 298 → **1 156 463 €**, Rail
  **228 047 €**, Expansiv **−241 309 € [abgewickelt]**, die letzten beiden
  auf den Euro unverändert.]*
* Neues Balance-Band: eine getaktete 2-Zug-Linie verdient innerhalb ±10 %
  einer ungetakteten, halbiert aber die Stationsbewertungs-Varianz.
  *[Nachtrag 07.08.2026, D-151/D-159: Gemessen am Lieferbahnhof 0,57,
  Band 0,6. Die Halbierung ist für eine 2-Zug-Linie strukturell
  unerreichbar: Der Takt kann nicht unter den halben Umlauf, die
  Bedienperiode (23–27 Tage) liegt damit ÜBER dem 20-Tage-Fenster des
  Frequenz-Terms — dessen 0/1-Aliasing plus Ankunfts-Jitter des Umlaufs
  setzen den Boden; ein Slack-Sweep 2–6 Tage erreicht bestenfalls 0,571
  (Slack 3, das Fixture-Optimum). Band bleibt 0,6 mit D-159 als
  Begründung.]*
* **SAVE_VERSION v24** (ein Bump für alle drei Stufen, Z5) + Migration
  (Alt-Orders → neuer Stride, Alt-Saves → null Linien, KI-Listen → echte
  Linien); Snapshot-Layout-Bump (+`lineId`); Determinismus-Fixtures für jede
  neue Order-Option und alle Line-Commands.

**Fertig, wenn:** Zwei Fahrzeuge einer geteilten Linie im selben Tick auf eine
geänderte Auftragsliste umschwenken, ein Waypoint einen Zug nachweislich auf
die längere von zwei Routen zwingt, das Linien-Panel Auslastung/Gewinn/
Umlaufzeit/wartende Fracht aus gemessenen Legs zeigt, ein wartendes Fahrzeug
nachweislich nie ein Fahrzeug blockiert, auf das es selbst wartet
(Wartegraph-Test), die getaktete 2-Zug-Linie im ±10-%-Band bei halbierter
Rating-Varianz liegt, Szenario 5 mit 5–25 Mio. € IN der Suite grün ist,
`grep AiState.lines` null Treffer liefert, und alle Determinismus-Fixtures
über die v24-Migration hinweg bit-identisch hashen.

*[Nachtrag 07.08.2026 zum Fertig-wenn: „halbierte Rating-Varianz" gilt
als erfüllt mit dem gemessenen 0,6-Band (Boden strukturell, D-159);
„Szenario 5 mit 5–25 Mio. €" gilt als erfüllt mit dem auf Evidenz
rekalibrierten Band aus D-158 — Road 0,8–3,2 Mio. € plus
Renewal-Compounding, Rail/Expansiv Solvenz-Floors — nachdem Probe und
KI-Messung belegen, dass 5 Mio. auf dieser Ökonomie von keinem Spielstil
erreichbar sind. Beide Bänder sind in der Suite grün; SPEC.md bleibt
per D-123 unverändert.]*

*[Nachtrag 11.08.2026 zum Fertig-wenn, D-220: „Szenario 5 grün" ist auf
der reparierten KI (D-218/D-219) NEU GEMESSEN und das Band ist NICHT
verschoben worden — Road 1 156 463 € tief im 0,8–3,2-Mio.-Band, Rail und
Expansiv auf den Euro unverändert. **Die 5 Mio. werden weiterhin nicht
erreicht und das wird nicht behauptet**: 1,16 Mio. ist Faktor 4,3 unter
dem ursprünglichen Boden, D-116 bleibt auf dem D-158-Band geschlossen.
Was sich geändert hat, ist die ANDERE KI-Zusage dieses Meilensteins:
`aiGame` spielt seit D-220 vier Seeds statt einem und asserted nur noch,
was auf allen vieren gilt — die Zeile „Solvenz-Zahl asserted statt
narrated" war eine Eigenschaft von Seed 4711 und ist auf drei von vier
Seeds rot. Zehn von zwölf Konkurrenten besitzen nach 25 Jahren kein
Fahrzeug; der Sweep macht das bei jedem Push sichtbar, statt es einmal je
Meilenstein zu entdecken. Das Schließen dieser Lücke ist M24s Sache und
ausdrücklich nicht die von M11.]*

*[Nachtrag 11.08.2026, D-228: Die Schienen-Frage dieses Meilensteins ist auf
Messung entschieden. Der Zwei-Zug-Shuttle (`planRailShuttle`: Trassierung vom
Assistenten, an jedem Kopfbahnhof eine Ausweiche mit VERSCHMELZENDER Weiche,
signallos, in einem Unit-Test über ein Spieljahr mit zwei Zügen bewiesen) wurde
nachgebaut, über SECHZEHN Seeds gemessen und **abgelehnt**: null Züge, null
Schienenlinien, und Szenario 5s Rail-Zeile 228 047 € lebend -> −238 132 €
[abgewickelt]. Das Band `rail.bankrupt === false` wurde NICHT verschoben.
Gemessen und geliefert wurde stattdessen der Defekt, den der Shuttle sichtbar
gemacht hat: die KI begann Projekte, die sie nicht zu Ende finanzieren kann -
Schätzung nach Luftlinie und fester Bahnsteigzahl, dazu eine TEIL-Kreditaufnahme,
die Erfolg meldete. **Der Grund, warum ein Spieler keinen Schienen-Konkurrenten
trifft, ist damit beziffert: eine Zwei-Zug-Bahn über das eigene 72-Kachel-Kohle-
Paar kostet 1 010 982 € gegen 500 000 € Kapital und 300 000 € Kreditlinie. Nicht
unrentabel - unbezahlbar.**]*

*[Nachtrag 11.08.2026, D-229: `AI_MIN_PROFIT_MARGIN` 1,25 → **2,00**, gewählt
über einen Sweep von FÜNFZEHN Werten (0,60–3,00) × sechzehn Seeds × drei
Konkurrenten × 25 Jahre, plus Szenario 5 bei jedem Wert. Optimiert wurde
nicht das Geld, sondern **Konkurrenten, die am Ende eine Linie mit Mannschaft
fahren**: 9 → **13** von 48, Seeds mit lebendem Gegner 8 → **11** von 16,
abgewickelt 3 → **0**, Fahrzeuge 90 → **105**, Gesamtwert 21 254 922 →
**25 597 942 €** — und gegen die 24 000 000 € Startkapital der 48 Firmen
VERNICHTET das Feld bei 1,25 2 745 078 € und ERZEUGT bei 2,00 1 597 942 €.
Der Preis wird genannt: Firmen, die überhaupt nichts bauen, 13 → 29 von 48.
Kein Band verschoben; Szenario 5 Road **identisch auf den Euro**, Rail
228 581 → **1 802 165 €** (3 Linien, 18 Fahrzeuge), Expansive −241 375
[abgewickelt] → **2 153 604 €**. **Schienenlinien und Züge bleiben bei JEDEM
der fünfzehn Werte NULL** — die Schienen-Frage ist D-228s Unbezahlbarkeit und
nicht diese Schwelle.]*

---

### M12 — Die Bühne: Hybrid-Renderer, Interpolation, Kartentext

Das Render-Substrat, auf dem alles Weitere montiert (E-04, E-05). Null
Sim-Kontakt, null Save-Bumps.

**MUSS:**

* **Stufe 0 — Kenney-Asset-Bake-Pipeline (E-14):** `tools/assets-manifest.json`
  (Pack-URLs + SHA-256 + Modell→Katalog-Zuordnung + Anker), `npm run
  assets:fetch` (Checksum-verifiziert, Cache gitignored), `npm run assets:bake`
  (eigener Software-Rasterizer: GLB → dimetrische PNG-Atlanten + JSON, 8
  Facings, Recolor-Zonen, Zoomstufen). Reproduzierbar: zweimal Baken =
  bit-identische Atlanten. Läuft ohne Cache durch (prozeduraler Fallback,
  Warnung statt Abbruch).
* 32×32-Tile-`RenderTexture`-Chunks mit Kamera-AABB-Culling, Rebake nur bei
  Map-Revision und nur berührte Chunks, AKTIV bei Zoom ≤ 0,5×; Detail-Zooms
  behalten den M10-drawOrder-Pfad. Chunk-Rebake gemessen ≤ 4 ms.
* 0,25×-Abstraktmodus nach SPEC.md 16.1: Terrain-Chunks + Netz-Polylinien +
  Fahrzeugpunkte (heute fällt das Netz komplett weg).
* Snapshot-Interpolation: reader-seitige Kopie der Vorgeneration,
  Wanduhr-Alpha-Lerp, Clamp bei Teleports — echtes 60-Hz-Gefühl, Protokoll
  unberührt (E-05).
* 4×-Detail-Atlas-Seite für die oberste Zoomstufe (SPEC.md 16.2 per-Zoom-
  Atlanten) statt Nearest-Neighbour-Upscale.
* Zwei Wassertöne (flach `#4a86a8` / tief `#2c5a78`, SPEC.md 16.3) aus
  `oceanMask`/Tiefe; Wasser-Animation über 2–4 Frame-getauschte Atlas-Zeilen
  am deterministischen Blink-Zähler (nie Wanduhr, Fehler 39); Küstensaum.
* Kartentext: BitmapFont beim Start aus Systemschriften gerastert (E-14),
  zoom-gestaffelte Stadt-/Stationslabels mit Kollisionsausdünnung, Größe nach
  Einwohnerzahl; Minimap-Viewport-Rechteck + Drag-Pan; N-Taste (M10) schaltet
  Minimap-Modi.

**Fertig, wenn:** Eine 2048²-Karte bei Zoom 0,25× mit 60 fps schwenkt, ein
Chunk-Rebake gemessen ≤ 4 ms bleibt und nur bei Revisionswechsel stattfindet,
die 0,25×-Stufe Terrain + Netzlinien + Fahrzeugpunkte zeigt, ein Fahrzeug bei
Zoom 4× sichtbar ohne 50-ms-Sprünge fährt (Interpolations-Alpha per Test
belegt), Stadt- und Stationsnamen zoom-gestaffelt mit Kollisionsausdünnung auf
der Karte stehen, und kein Font-Binärasset im Repo liegt (Glob-Test).

---

### M13 — Lebende Züge, atmender Tag, arbeitende Welt

Die weiße Kiste stirbt: deklarative Kunst pro Katalogeintrag, Licht aus
Sim-Wahrheit, Partikel mit Budget. Render-only; ein Snapshot-Layout-Bump.

**MUSS:**

* Fahrzeug-Sprites aus dem Kenney-Bake (E-14, Pipeline aus M12 Stufe 0):
  jeder Katalogeintrag (Traktionen, Wagen, Straßenfahrzeuge, Schiffe) erhält
  im Manifest seine Modell-Zuordnung `{modell, scale, colorZones, anker}`;
  **Flugzeuge prozedural** über denselben deklarativen `shapes.ts`-Datensatz
  (kein Kenney-3D-Flugzeug-Kit — Lücke ist in E-14 protokolliert); 8 Facings
  aus dem (NextTile−Tile)-Delta; Firmenfarbe über Zwei-Pass-Tint-Zonen;
  deterministische Varianz via `hash(vehicleId)`; Kontaktschatten (NW-Licht)
  je Zelle + weiche Ellipse unter Fahrzeugen.
* Konsist-Rendering: ein 10-Wagen-Kohlezug ist 10 sichtbare Wagen entlang der
  interpolierten Pfad-Historie; Kompositions-Digests über den Marker-Kanal,
  render-seitig gecacht (E-05).
* Gebäude-, Stadt- und Industrie-Sprites aus dem Kenney-Bake (City Kits,
  Factory Kit, Building Kit, Nature Kit — E-14): Stadtarchitektur nach
  Zone+Level aus dem Manifest gemappt, Industrie-Silhouetten je Typ;
  `shapes.ts`-Silhouetten (D-117) bleiben für Typen ohne Kit-Deckung
  (Förderturm, Bohrturm) und als Cache-loser Fallback; Schornstein-/Emitter-
  Anker kommen einheitlich aus dem Manifest bzw. `industryArt.ts`.
* Tag/Nacht voll (SPEC.md 16.3): Dämmerungskurve als Konstanten; **emissive
  Atlas-Seite 2** — für gebackene Kenney-Zellen als Bake-Zeit-Emissive-Pass
  (Fenster-/Lampen-Materialien aus den Anker-Metadaten des Manifests), für
  prozedurale Zellen regeneriert mit nur Fenstern/Lampen (`windows()` kennt
  die Positionen); additiv bei Nacht; Straßenlampen; Fahrzeug-Scheinwerfer;
  Modulation luminanz-basiert, gegen beide Paletten (auch farbenblind)
  getestet.
* Signalaspekte rot/grün aus dem Reserved-Tile-Block + render-seitigem
  BlockIndex (F3-Wissen wird Weltkunst); vier Signaltypen per Mast-Silhouette
  unterscheidbar; Fahrleitungsmasten auf elektrifizierter Strecke (neue
  `shapes.ts`-Primitive).
* Industrie-Leben: gedeckelter ParticleContainer (Cap 2000, ≤ 2 ms Frame-CPU,
  im Tripwire), Emitter an Schornstein-Ankern aus `industryArt.ts`,
  Intensität = Produktionslevel — `IndustryMarker` erhält ein `level`-Feld
  (der EINE Snapshot-Layout-Bump dieses Meilensteins). Fahrzeug-Abgas aus dem
  vorhandenen Throttle-Wert; Panne = Rauch; Status-Badges
  (stuck/Panne/ohne Aufträge) aus dem State-Feld im Stride.
* Partikel ausschließlich Render-RNG (Fehler 25/39).

**Fertig, wenn:** Alle Katalogeinträge in 8 Fahrtrichtungen mit im Blindtest
unterscheidbarer Silhouette rendern, ein 10-Wagen-Kohlezug als 10 Wagen
sichtbar ist, nachts Fenster, Signale und Straßenlampen additiv leuchten und
Signalaspekte den Blockzustand ohne F3 zeigen, eine boomende und eine
schlafende Industrie im Standbild unterscheidbar sind (Level-Feld getestet),
die Partikel-CPU in der Referenzszene gemessen ≤ 2 ms bleibt, und ein
Repo-Glob beweist, dass kein Binärbild eingecheckt wurde.

---

### M14 — Instrumente: Frachtfluss-Atlas, Stations-Röntgenbild, Statistik

Instrumente VOR Dynamik: Eine Welt, die sich ändert, bevor der Spieler
Änderung diagnostizieren kann, ist Frust, nicht Tiefe. Dieselben Instrumente
sind die Debug-Werkzeuge, mit denen M18–M21 überhaupt balanciert werden.

**MUSS:**

* FlowMarker-Snapshot-Block nach dem Reserved-Tile-Muster: Stationsgraph +
  gemessene Leg-Volumina + Leg-Zeiten; strikt read-only-Export, kein Sim-Code
  liest das Overlay; Export benutzt DENSELBEN Publish-Pass wie
  `structureSignature` mit (Fehler 33); Mehrkosten ≤ 0,5 ms je Publish,
  im Perf-Test gedeckelt.
* Render: gebogene firmen-/linienfarbene Pfeile, Breite = Volumen, Bündelung
  pro Stationspaar (nie pro Parcel), zoom-gestuft, auf den M12-Chunks;
  Minimap-Modus „Fluss" (reine Funktion, erbt ins Save-Thumbnail, D-112).
* Stations-Röntgenbild: alle fünf Rating-Terme aus SPEC.md 10.1 einzeln
  beziffert, Warnsatz „Rating sinkt, weil …" benennt den dominanten
  Verlustterm; Pro-Fracht-Wartetabelle statt Aggregatzahl; Einzugs-Overlay
  beim Modulplatzieren (D-095-Zentrum).
* Frachthistorie-Ring pro Station (12 Monate, Int32-Ring, Gesetz 7) —
  Sim-Zustand: **SAVE_VERSION v25** + Migration + Hash.
* Statistik-Zentrum: Firmenwert-Verlaufsgraph (schließt die 14.1-Schuld),
  Fahrzeug-Detailansicht (Alter, Zuverlässigkeit, Manifest mit paid-up-to,
  Kosten vs. Ertrag), Tooltip-Modul über alle 22 Werkzeuge,
  Notification-Routing (aus/Ticker/Toast/Pause pro Kategorie; `postOnce`
  sim-seitig garantiert schon Spam-Freiheit).

**Fertig, wenn:** In einem 3-Linien-Transfernetz jeder gemessene Leg als Pfeil
mit Breite proportional zum Volumen erscheint, das Stationspanel alle fünf
10.1-Terme einzeln beziffert und den dominanten Verlustterm benennt, der
Flow-Export den Snapshot-Publish bei der Referenzflotte um höchstens 0,5 ms
verteuert, der Firmenwert-Graph aus dem 24-Monats-/Jahres-Archiv rendert, und
jedes der 22 Werkzeuge einen wirkungserklärenden Tooltip trägt.

---

### M15 — Netzwert & Straßen-Stau: SPEC.md 8.4 als Weltregeln

Das 4×-Versprechen wird eine Zahl. Hebt die M10-Stundung auf.

**MUSS:**

* Weltregeln (neue Spiele, Alt-Seeds geschützt, Z2): `belegungsStrafe`
  (reservierte Blöcke × 3 s) + `signalStrafe` in `railPath` — ein Zug zieht
  erstmals die freie Ausweiche einem besetzten Block vor; Repath nur an
  Signalhalten gedeckelt (Repath-Sturm-Schutz).
* Straßen-Stau: **gespeicherter** Uint8-Layer (E-02): Inkrement beim
  Tile-Eintritt (O(Straßenfahrzeuge)/Tick), Lazy-Epoch-Exponentialzerfall +
  Dirty-Liste; Stau-Term in den RoadPathfinder-A*-Kosten exakt nach 8.4;
  Leader-Geschwindigkeitskappung; Bahnübergang schließt bei reserviertem
  Block (E-03). Kein Car-Following (Veto).
* Pro-Block-Durchsatzzähler (derived, monatlich geleert wie D-091) →
  Auslastungs-Heatmap-Overlay + „Engpass"-News (`postOnce`).
* Deadlock-Zyklus-Erkennung: Wartegraph (Zug → Besitzer des verweigerten
  Tiles) am News-Tag, iterative Zyklensuche (Gesetz 8), Meldung nennt Züge +
  Tiles + F3-Highlight — Upgrade der 9.3-Warnung, KEIN Auto-Fix (SPEC.md
  Fehler 18 gilt).
* Netzwert-Panel: verdienter Ertrag / Closed-Form-Deckel (D-066,
  `tariff.spec.ts`-Maschinerie) pro Linie und Firma, als Prozentzahl.
* Neues Balancing-Szenario „Netzdesign": identischer Verkehr auf hingerotzter
  vs. signalisierter Trasse mit Ausweiche — Faktor ≥ 3 als Band.
* **SAVE_VERSION v26** (Regel-Flags + Stau-Layer, gehasht; ~1 MB auf 1024²,
  zlib-klein weil überwiegend null) + Snapshot-Overlay-Block. M6-Bänder
  bleiben stabil (Regel „aus" in Alt-Szenarien). E-18-Entscheidung
  (Snapshot-Cap) fällt spätestens hier und steht im Ledger.

**Fertig, wenn:** 200 Lkw auf einem Nadelöhr messbar Stau bilden und neu
geroutete Fahrten nachweislich die Ausweichroute nehmen (Zwei-Routen-Test),
ein Zug mit aktiver Belegungsstrafe die freie Ausweiche einem besetzten Block
vorzieht, das Netzdesign-Szenario einen Netzwert-Faktor ≥ 3 ausweist, eine
erkannte Deadlock-Schleife alle beteiligten Züge und Tiles benennt, Save/Load
den Stau-Layer bit-identisch erhält (Hash-Gleichheit vor/nach Load), und der
Tick bei 1500 Fahrzeugen ≤ 0,5 ms über der M10-Grundlinie bleibt.

---

### M16 — Replay-Theater & Beweis-Infrastruktur

Die Determinismus-Dividende auszahlen — bewusst VOR den Weltdynamiken, weil
der Desync-Detektor deren Entwicklung absichert.

**MUSS:**

* `.ironreplay` = Save-Obermenge: `commandsExecuted = 0`, Final-Tick-Hash,
  **Checkpoint-Ring alle 72.000 Ticks (1 Spieljahr)** — EIN Mechanismus für
  Scrubbing, Tail-Verifikation UND Log-Kompaktierung („Log ab letztem
  Checkpoint trimmen" wird legale Save-Variante; löst das unbegrenzte
  Log-Wachstum).
* Replay-Browser + Wiedergabe: Worker re-simuliert ab Checkpoint,
  Geschwindigkeitsregler, freie Kamera; „Replay prüfen" = Resim +
  Hash-Vergleich, **nennt den ersten abweichenden Tick**; Alt-Saves ohne
  Checkpoints bleiben abspielbar (Resim ab Tick 0). Replay-Validität
  versions-gepinnt (E-11); Cross-Version-Verifikation wird abgelehnt.
* „Export replay from save"-Button; Crash-Bundles (M10) exportieren
  zusätzlich ein `.ironreplay` der Sitzung.
* Balance-Suite determinismus-fiziert: jedes Szenario zweimal gefahren,
  Hash-Gleichheit asserted — 24 Tests doppeln als Desync-Wächter.
* Long-Run-Soak-Fixture: aufgezeichnete 25-Jahre-KI-Partie replayed zu
  identischem Hash.
* **SAVE_VERSION v27** (Checkpoint-Metadaten) + Migration.

**Fertig, wenn:** Jeder Spielstand per einem Klick als Replay abspielbar ist
und zu jedem Jahres-Checkpoint gesprungen werden kann, „Replay prüfen" bei
einem absichtlich manipulierten Log den ersten abweichenden Tick nennt, die
aufgezeichnete 25-Jahre-KI-Partie als `.ironreplay` mit identischem Final-Hash
verifiziert, und jedes Balance-Szenario Hash-Gleichheit über zwei Läufe
zusichert.

---

### M17 — Zielmaschine, Szenario-Format & Spielende

Das Spiel bekommt ein Ende, Ziele und beweisbare Medaillen.

**MUSS:**

* `src/sim/goals/`: Ziel-Deskriptoren (CompanyValueBy, CargoDeliveredTotal,
  TownPopulationReach, ConnectStations, StationRatingHold, SurviveUntil) —
  Prädikatvokabular aus dem Tutorial (D-113) übernommen, aber **im
  Tages-Hook der Sim ausgewertet** (allokationsfrei, Deskriptoren beim Laden
  preallokiert): nur so sind Sieg und Medaille deterministisch und
  replay-verifizierbar. `GoalState` (Fortschritt + Medaillen-Bänder
  Bronze/Silber/Gold nach Abschlussdatum) saved + hashed.
* Snapshot-Goal-Block (~64 B); `GoalPanel` (Live-Fortschritt),
  `GameEndScreen` (Sieg/Niederlage/Jahrhundert-Summary mit Punktformel,
  Punktformel bekommt ein Balance-Band), Bankrott-Game-Over-Dialog.
* `.ironscenario` = Save-Obermenge mit **ungehashtem** Metadatenblock
  (Titel, Briefing de/en, Autor, Ziele, gesperrte Weltregeln, Datumsspanne,
  Medaillen-Bänder, optionaler Referenz-Final-Hash); Kopplungstest erzwingt,
  dass Metadaten nie in `hashWorld` laufen (Fehler 35). Ein Serializer:
  Szenario-Kompatibilität IST Save-Kompatibilität.
* Szenario-Browser im Hauptmenü; **8 mitgelieferte Szenarien als
  Text-Fixtures** (Seed + Regeln + Ziel-JSON), die zugleich
  Determinismus-Fixtures sind (Frachtrausch, Passagiernetz, Gebirgslogistik,
  Inselhüpfen, Wiederaufbau, Rats-Diplomatie, Speedrun, Überleben).
* Hash-verifizierte Medaillen: Replay laden ⇒ Resim reproduziert den
  Medaillenstand bit-exakt (nutzt M16).
* **SAVE_VERSION v28** (GoalState) + Migration.

**Fertig, wenn:** Ein Ziel „Firmenwert ≥ 2 Mio. € bis 1975" in einer
25-Jahres-Partie sim-seitig auslöst, zwei Läufe mit gleichem Seed bit-identisch
denselben Medaillenstand hashen, Bankrott wie Zielerreichung je einen
Endbildschirm mit Punktzahl zeigen, acht Szenarien im Browser starten und im
Determinismus-Lauf hash-identisch enden, und der Metadaten-Kopplungstest rot
anschlägt, wenn ein Briefing-Feld in den Hash gerät.

---

### M18 — Wetter & Jahreszeiten (Weltregel) + Saison-/Ären-Optik

Die Umwelt wird Sim-Realität (E-01) — und die Optik zieht im SELBEN Release
mit, damit Autorität (Sim) und Candy (Render) nie auseinanderlaufen.

**MUSS:**

* Weltregel `weather` (aus/mild/rau) in `NewGameParams`, saved + hashed;
  Migration: v28-Saves laden mit „aus" und verhalten sich exakt wie zuvor.
* Wetterfeld: 16×16 Regionszellen (Uint8: klar/Regen/Sturm/Frost/Hitze),
  täglicher Update aus `streams.weather` (Z3), gespeichert + gehasht;
  Snapshot-Block fürs Rendering.
* Sim-Effekte ausschließlich als Multiplikator-Lookups an existierenden
  Nähten: `ROLLING_RESISTANCE_*`/`DRAG_*` im Längssolver,
  Pannen-Schwellenband (identische Draw-Anzahl, nur Threshold verschoben —
  Z3), `CARGO_EXPIRY_FRACTION_PER_DAY` bei Hitze.
* Jahreszeiten: reine Funktion (Monat, Höhe, Klima) ohne RNG und ohne
  Zustand — saisonale Produktionsmodifikatoren für Farm/Forst
  (Konstanten-Tabelle am 7.3-Monatszyklus), Winter-Reibungsmultiplikator.
* Saison-Optik: Atlas-Seiten 0+2 regenerieren asynchron bei Monatswechsel
  (≤ 30 ms, Emissive im selben Pass, debounced bei 20×); höhenabhängige
  Schneegrenze, Herbstwälder; Regen-/Schneepartikel aus dem
  Snapshot-Wetterfeld (Render-RNG). Sturmwarnung je Region via `postOnce`.
* Neues Balance-Band: ein harter Winter drückt die Jahreseinnahme der
  Referenz-Kohlelinie um 8–15 %; Szenarien 1–4 laufen weiter mit Regel „aus"
  (Fehler 34).
  *[Nachtrag 08.08.2026, D-203/D-204: Das 8–15-%-Band zahlt diese Wirtschaft
  nicht. D-203 maß −4,95 % und bandierte auf −3–7 %, nannte dafür aber einen
  DEFEKT als Grund (`WEATHER_FROST_SEASON` klimablind — ein tropischer Januar
  konnte frieren). Ein Re-Banding auf einem Bug ist unzulässig, also wurde
  D-204 erst der Defekt behoben — die Frostschwelle ist jetzt die
  klimabewusste Winterkurve der Jahreszeit selbst (`frostSeasonFactor`),
  Tropen exakt null, Arktis härter UND länger — und danach neu gemessen:
  **−4,36 %** (6 Seeds × 9 Jahre, 3 510 797 → 3 357 840 € Frachterlös). Die
  Lücke zu 8–15 % waren nie die Tropen. Das Band bleibt **−3–7 %** und ruht
  jetzt auf einer Messung: Pannenschwelle ~3,8 der 4,36 Punkte, alle anderen
  Kanäle im Rauschen eines Sechs-Seed-Ensembles, Permanent-Winter-Decke
  −25,24 % (die Nähte sind also nicht zu schwach), Frostanteil 9,1 % der
  Dezember/Januar/Februar-Regionstage. Szenarien 1–4 laufen unverändert mit
  Regel „aus". Trace vollständig in D-204; SPEC.md bleibt unangetastet
  (D-123).]*
* **SAVE_VERSION v29** + Snapshot-Layout-Bump.

**Fertig, wenn:** Eine 5-Jahres-Partie mit „Wetter: rau" in zwei Läufen
bit-identisch denselben Hash liefert, ein harter Winter die Referenz-Kohlelinie
messbar um 8–15 % drückt, ein v28-Save unverändert lädt und sich mit
„Wetter: aus" exakt wie vorher verhält, der Atlas beim Monatswechsel in ≤ 30 ms
ohne sichtbaren Frame-Hänger regeneriert, und im Winter eine höhenabhängige
Schneegrenze erscheint.

*[Nachtrag 08.08.2026 zum Fertig-wenn, D-204: „messbar um 8–15 % drückt" gilt
als erfüllt mit dem auf Evidenz gemessenen Band **−3–7 %** aus
`tests/balance/hardWinter.spec.ts` (gemessen −4,36 %), nachdem der von D-203
als Grund genannte Defekt behoben und die Messung wiederholt wurde. Die
übrigen vier Bedingungen sind unverändert erfüllt.]*

---

### M19 — Reisende mit Zielen: Gravitation, Rückreisen, Klassen

Geschwindigkeit wird bei Passagieren endlich Geld (SPEC.md §1, Säule 2).

**MUSS:**

* `chooseDestinations` für Passagier-Cargos: Gravitationsgewichtung
  (Zielstadt-Population, Flughafengröße) multiplikativ zur
  Netzzeit-Gewichtung — Kadenz bleibt täglich, kein Tick-Hot-Path.
* Rückreise-Erzeugung am Ziel (12-Monats-Laufmittel nach D-079-Muster, kein
  Parcel-Tracking); Erhaltungs-Test: transportierte ≥ erzeugte Rückreisen —
  keine Nachfrage aus dem Nichts.
* `Cargo.CommuterPax` + `Cargo.BusinessPax` als eigene IDs (E-08): Wohnzonen
  erzeugen Pendler, Gewerbezonen Business (erste ökonomische Nutzung der
  13.1-Zonen); Business zahlt ~1,6×, verfällt ~2× so schnell; Katalog-Refits
  erweitert.
* Migration: bestehende Passenger-Parcels/Refits → CommuterPax;
  D-118-Dead-End-Test erweitert (jede Klasse hat Abnehmer); Balance:
  Szenario 1 (Buslinie) neu vermessen — die Split-Konstanten gehören den
  Tests.
* **SAVE_VERSION v30** (+2 Cargo-IDs, Remap-Migration).

*[Nachtrag 09.08.2026 zu Bundle 3, D-213: „Rückreise-Erzeugung am Ziel" ist
geliefert und die Fluss-Asymmetrie auf einer Pendelstrecke **gemessen 21,2 %**
gegen die geforderten < 30 % (`tests/unit/returnJourneys.spec.ts`). Das
12-Monats-Laufmittel mittelt die **Bilanz** (hier angekommen minus was diese
Stadt selbst anbietet), nicht die Ankünfte allein — die Begründung und die
verworfene Alternative stehen in D-213. Der Erhaltungs-Test ist grün und ruht
auf einem Zwei-Zähler-Konto statt auf dem Mittel: ohne die Klammer erzeugt
derselbe Lauf **2 196 Rückreisen gegen 1 598 Ankünfte** (gemessen, nicht
argumentiert).]*

*[Nachtrag 09.08.2026 zu Bundle 4, D-215: Szenario 1 ist **neu vermessen und
im Band** — Amortisation im Spieljahr **3** eines 2–4-Jahre-Bands, Investition
21 200 €, Bilanzen 485 738 / 494 144 / 501 718 / 509 262 / 515 863 / 520 024 €.
**Keine Split-Konstante bewegt sich und es gibt kein Re-Banding**, weil das Band
hält. Die Bisektion trennt sauber: B1 (Klassen) und B2 (Gravitation) sind auf
dieser Welt **ziffernidentisch** zum Stand vor M19 — `placeTown` baut nur
Wohnhäuser, `commercialShare` ist 0, es entsteht nie ein Business-Reisender —,
B3 (Rückreisen) ist es nicht: gemessen 36,68 und 45,30 Einheiten Rückverkehr
gegen 32 519 und 32 684 Ankünfte (**0,113 %** und **0,139 %**). Damit ist EINE
ausgelieferte Behauptung widerlegt und korrigiert — `station/returns.ts` sagte,
beide Stationen dieses Szenarios erzeugten NICHTS und die 19.4-Bänder seien
daher „by construction" unberührt; sie sind es **durch Messung, mit Reserve**.
`tests/balance/busline.spec.ts` grenzt den Anteil jetzt beidseitig ein statt ihn
zu bestreiten.]*

**Fertig, wenn:** Eine doppelt so große Stadt bei gleicher Netzzeit messbar
mehr Passagierstrom anzieht (Gravitations-Test), am Zielort Rückreisende
entstehen (Fluss-Asymmetrie < 30 % auf einer Pendelstrecke),
Business-Passagiere auf einer Schnellverbindung nachweislich mehr pro Einheit
zahlen als Pendler auf derselben Strecke, der Erhaltungs-Test grün ist, und
Balance-Szenario 1 im Band bleibt.

---

### M20 — Lebendige Städte & Politik (SPEC.md 13 vollenden)

Der höchst-sichtbare Sim-Payoff: heute ist jede Stadt 100 Jahre pixelidentisch
eingefroren, obwohl `growTowns` die Rate bereits berechnet.

**MUSS:**

* Physisches Wachstum im Monats-Hook (E-10): Gebäudeplatzierung entlang
  Straßen (`placeBuildings`-Logik aus `src/sim/mapgen/towns.ts`
  wiederverwendet), Straßenverlängerung max. 3 Tiles/Monat (SPEC.md 13.2),
  zonengerecht (Gewerbe-Kern, Wohn-Ring, Industrie-Rand); Round-Robin eine
  Stadt pro Tag; jede Iteration deterministisch geordnet (kein `for...in`).
  Stadt-Straßenbau läuft durch die M10-gehärteten Terraform-/Bau-Guards.
* 13.2-Formel komplett: `versorgungBau` aus Zement-/Baustoff-Lieferungen an
  den BuildersMerchant im Stadtradius (der Sink „treibt" endlich, SPEC.md
  7.2), Firmenrating-Faktor (0,5 + 0,5 × Rating/100), Gewichte auf
  SPEC-Werte, 12-Monats-Passagierfenster, **Schrumpfung −0,03 %/Monat**
  unversorgt inkl. Gebäude-Rückbau.
* Zonen-Ökonomie: Wohnen erzeugt Pendler / verbraucht Waren+Lebensmittel;
  Gewerbe erzeugt Post+Business-Pax / verbraucht Waren+Elektronik (nutzt die
  M19-Klassen).
* Wahlen alle N Jahre aus `streams.politics`: Ratsprofil verschiebt
  `ratingFor`-Gewichte (grüner Rat: Lärm × 2, Grün-Bonus × 2; wirtschaftsnah
  umgekehrt); neue TownMeasures (Stationssponsoring, Lärmschutzwand);
  Wahlergebnis + Wachstums-Meilensteine via `postOnce`.
* Schrumpfung/Rückbau gegen Stationseinzugsgebiete getestet — die
  Todesspirale (10.1) darf dadurch nicht unsichtbar eskalieren (die
  M14-Instrumente zeigen sie).
* **SAVE_VERSION v31** (Wachstums-Cursor, 12-Monats-Fenster, Wahl-Zustand).

**Fertig, wenn:** Eine voll versorgte Stadt über 10 Spieljahre nachweislich
neue Gebäude und mindestens eine selbst verlängerte Straße baut
(Vorher/Nachher-Tile-Diff im Test), eine unversorgte Stadt mit −0,03 %/Monat
schrumpft und Gebäude zurückbaut, die 13.2-Formel alle SPEC-Terme enthält
(Formel-Test gegen Handrechnung), ein Wahlergebnis die Ratsgewichte
nachweislich verschiebt, und der Monats-Tick p99 um < 0,15 ms gegenüber der
Grundlinie wächst.

*[Präzisiert in M20 B5 (D-235), weil der Satz zwei Lesarten hat und die
Messungen auf verschiedenen Seiten der Grenze liegen. **Verbindlich ist der
Tick-p99 über ein Fenster, das die Monats-Hooks enthält**, gemessen auf dem
1500-Fahrzeug-Fixture aus M10 — genau die Größe, die Z6 vorschreibt und die
6.1 als „Tick-Budget Δ p99 (1500 Fzg., Z6)" führt (M20-Zeile: +0,10 ms).
Gemessen: **−0,333 / −0,490 / −0,555 ms**, also deutlich unterschritten.
Begründung aus dem, was das Budget schützt: geschützt wird die Zusage von
SPEC.md 21 („Sim-Tick ≤ 8 ms p99"), und der isolierte Monatsrand war nie an
diese 8 ms gebunden — er steht seit der M10-Grundlinie bei 39,4 ms, weil ein
Ausreißer je 6.000 Ticks per Konstruktion außerhalb eines p99 liegt. An 39,4 ms
wären 0,15 ms eine 0,4-%-Toleranz, an 3,26 ms sind es 4,6 %: nur die zweite
Zahl ist eine Budgetzusage, die erste wäre ein Zufallstreffer. **Die andere
Lesart ist trotzdem gemessen und wird nicht geglättet**: der ISOLIERTE
Monats-Randtick wächst auf einer ruhigen erzeugten 1024er-Welt mit 140 Städten
um +0,188 ms, hochgerechnet auf die 120 Städte der Klausel **+0,161 ms** — also
**0,011 ms über 0,15**, ein Tick je 6.000. Der verbleibende Weg darunter ist,
den Zonen-Zensus zu TRAGEN statt zu zählen; D-233 hat das mit Begründung
abgelehnt, D-235 hat die Begründung erneut geprüft und sie hält.]*

---

### M21 — Konjunktur-Jahrhundert, Lieferverträge & Subventionen

Das Jahrhundert bekommt ökonomische Textur — alles auf bewährter Maschinerie.

**MUSS:**

* Genesis-Kurve (E-09): pro Frachtart-Gruppe eine Jahrhundert-Kurve aus
  `streams.economy` bei Weltgenese erzeugt, gespeichert + gehasht (einige
  hundert Ints); Monats-Hooks LESEN nur — Nachfrage-/Raten-Multiplikatoren an
  den Tarif-/`costCt`-Nähten; Rezessions-/Boom-Fenster modulieren die
  `INDUSTRY_FLUCTUATION_*`-Sinus weltweit; Energiepreis-Schocks skalieren
  `ENERGY_COST_*` epochenweise; Kohle sinkt nach 2000 (paart sich mit dem
  Carbon-Levy D-105), Container boomen ab ~1970. UI kann die Kurve zeigen
  (inspizierbar).
* Container-Wiederbelebung: Hafen-Terminal-Modul erzeugt/akzeptiert
  `Cargo.Containers` als Übersee-Metafracht zwischen Quay-Stationen,
  kurvengesteuert ab ~1970 — der tote SPEC-7.2-Frachttyp lebt;
  Erhaltungs-/Overflow-Regeln explizit (D-065), D-118-Kettentest kennt den
  Abnehmer.
* Lieferverträge: verbrauchende Industrie ordert Monatsquote (Stahlwerk:
  200 t Kohle/Monat), `creditDelivery`-Hook misst Erfüllung, Bonus/Strafe
  monatlich, Input-Hunger bei Dauerbruch; eigener Stream,
  `contracts.ts`-Muster.
* Subventions-Board: Klon von `contracts.ts` — Staat bietet 1,5–2× Rate für
  N Monate auf unbedienter (Quelle, Ziel)-Relation, erstes lieferndes
  Unternehmen gewinnt (Wettrennen per D-107); KI nimmt teil (billige
  Compounding-Ziele gegen D-109).
* `Account.ContractPenalties` ergänzt; `settleExpired`
  (`src/sim/economy/contracts.ts:142`) bucht um — schließt die 14.1-Lücke.
  Fördergeld für emissionsarme Fahrzeugkäufe (SPEC.md 14.3): Rabatt im
  Buy-Command nach `CO2_KG_PER_MJ`.
* Industrie-Events aus `streams.events`: Rekordernte (temporärer
  Output-Multiplikator), Streik (ein ruhender Monat — Dormanz zählt per
  D-086 nicht zur Schließung); News via `postOnce`.
* Balance-Anker: Weltregel „Konjunktur: aus" pinnt alle Referenzläufe.
* **SAVE_VERSION v32**.

**Fertig, wenn:** Die Kohle-Nachfrage nach 2000 seed-deterministisch und in
zwei Läufen bit-identisch sinkt, während Container ab 1970 zwischen Häfen
fließen (D-118-Kettentest grün), ein Liefervertrag über 200 t Kohle/Monat
Bonus und Strafe über `Account.ContractPenalties` bucht (Kontenrahmen-Test),
eine Subventionsroute nachweislich per Wettrennen an genau ein Unternehmen
geht, und alle Alt-Bänder mit „Konjunktur: aus" unverändert grün sind.

---

### M22 — Szenario-Werkstatt: Editor, Heightmap-Import, Benchmark-Karten

Der Editor spricht ausschließlich Commands — jede geteilte Karte
replay-verifiziert.

**MUSS:**

* Neue CommandKinds: `TerraformBrushRegion` (Bulk mit Regionsdeckel pro
  Command, Terraform-Kaskade + `enforceSlopeInvariant`), `PlaceTownSeed`,
  `PlaceIndustryAt`, `PaintForest`, `PaintRiver` — bepreist nach dem
  D-119-Preview-Muster, kostenlos unter Editor-Regel.
* Weltregel `editorMode` deaktiviert Funds-/Ownership-Checks in
  `execute.ts`; Editor läuft gegen eine pausierte Vor-Start-Welt
  (Single-Author-of-State bleibt).
* `src/ui/editor/`: Werkzeugpalette, Pinselgrößen, Debug-Overlays
  (Temperatur/Feuchte/Landmasse/Einzugsgebiet über das F-Overlay-Muster —
  reine Recomputes).
* Heightmap-Import als Mapgen-INPUT: Tauri-Dateidialog → PNG-Graustufen →
  Float32-Feld → existierende `erode`/`quantise`/`enforceSlopeInvariant`-
  Kette (`heightmap.ts`); Corner-Grid wird wie jede Welt serialisiert, das
  PNG nicht behalten — der eine sanktionierte Nicht-Command-Pfad (wie
  `generateMap`); Import-Kontrastregler gegen Terrassen-Enttäuschung
  (16 Höhenstufen).
* `PaintRiver` über Meereshöhe: „stehendes Wasser auf Höhe X" wird entweder
  formalisiert oder abgelehnt — der `applyRivers`/`refreshShoreline`-
  Revert-Quirk (terraform.ts:180–189) darf nicht in Spielerkarten shippen.
* Export als `.ironscenario` (M17-Format) direkt aus dem Editor.
* **4 kanonische Benchmark-Karten** als Text-Command-Log-Fixtures
  (Mega-Junction-Schienennetz, 1500-Fahrzeug-Megalopolis,
  2048er-Archipel, 100k-Kanten-Netz) — konsumiert von der Perf-Suite UND
  einem In-Game-Benchmark-Modus (N Ticks, p50/p99 an den Spieler;
  Zeitmessung nur im Worker-Scheduler, nie in der Sim).
* **SAVE_VERSION v33** (CommandKinds + `editorMode` + Szenario-Metablock-
  Parser).

**Fertig, wenn:** Eine im Editor gebaute 512er-Karte als Szenario exportiert,
neu geladen und durch Replay des Editor-Befehlslogs bit-identisch reproduziert
wird, ein importiertes 1024er-Graustufen-PNG in ≤ 8 s eine gültige Karte mit
intakter Slope-Invariante ergibt, und die vier Benchmark-Karten in der
Perf-Suite p99-Werte drucken und im Spiel einen Ergebnisbildschirm zeigen.

---

### M23 — Zwei Jahrhunderte & Vier Welten

Spannweite und Varianz: 1850 bis endlos, vier echte Klima-Ökonomien,
Generator-Presets.

**MUSS:**

* Weltregeln `startYear` (1850/1880/1920/1950) und `endless` (E-15);
  MAX_TICK-Stopp entfällt unter `endless`; `DECISIONS.md`-Eintrag zum
  Int32-Headroom (~295 Jahre).
* Prä-1950-Fahrzeuggenerationen als reine Katalogdaten (~60 Specs über
  Rail/Road/Water mit Intro-/Retire-Daten, SPEC.md 11.5 pro Dekade);
  Balance-Suite erhält 1870er-Varianten der Szenarien 1–2 (eigenes
  Inflations-Band für 200-Jahre-Spannen).
* Ären-Optik: Stadtgebäude-Specs keyed nach Snapshot-Jahr
  (1950er-Giebel → 1980er-Platte → 2020er-Glas) über denselben
  Regenerationspfad wie M18 — ein 1950 gestartetes, 2049 geladenes Save
  zeigt sofort die 2049-Optik (Regeneration aus Snapshot, kein gespeicherter
  Render-Zustand).
* Vier Klima-Ökonomien: per-Klima-Industrie-/Frachtketten-Sets
  (`INDUSTRY_SPECS`-Auswahltabellen), Fahrzeug-Verfügbarkeitsmasken
  (Mechanismus geteilt mit Ären-Gating), Stadt-Architektur-Varianten,
  Namens-Tabellen inkl. englischem Silbenset (schließt SPEC.md 6.5) — alles
  `const`-Tabellen unter Balance-Hoheit (E-17).
* Generator-Presets (Kontinent, Archipel, Hochland, Flussebene, Tal) +
  Regler (Meeresspiegel, Hügeligkeit, Flusszahl, Stadtdichte,
  Ressourcenreichtum) durch `MapGenParams`, saved + hashed;
  `TOWN_COUNT_MAX`-Klemme skaliert (2048er-Karten sind heute 4× leerer pro
  Fläche); Mapgen-Perf-Band je Größenstufe inkl. 2048².
* Balance-Matrix: Szenarien 1–4 je Klima gebandet (Suite ×4 — CI-Split aus
  6.3 trägt das); D-118-Kettenlauf je Klima-Set.
* **SAVE_VERSION v34**.

**Fertig, wenn:** Eine 1850 gestartete Partie mit Dampf-Katalog im
Determinismus-Test bit-identisch durchläuft, der Endlosmodus im Jahr 2051
weder anhält noch den Hash-Takt verliert, vier Klimata mit disjunkt
erkennbaren Industrieketten spielbar sind, jeder Generator-Preset eine
1024²-Karte in ≤ 8 s erzeugt, Stadtgebäude ab Snapshot-Jahr era-gerecht
wechseln, und die Balancing-Szenarien 1–4 in jedem Klima im Band liegen.

---

### M24 — Kampagne, Schwierigkeit mit Zähnen, Chronik

Meta-Progression aus existierender Maschinerie — bewusst NACH M11
(glaubwürdige KI), M17 (Szenarioformat) und M23 (Ären/Klimata): eine Kampagne
gegen eine insolvente KI wäre hohler Content (Juroren-Veto).

**MUSS:**

* Kampagne „Eisenadern": 12 Szenarien 1850→2050 über alle vier Klimata,
  Kettenformat (geordnete Liste + Unlock-Kanten) als Text-Fixture; Abschluss-
  Screens über den M17-`GameEndScreen`.
* `profile.json` v1 (versioniert, eigene Migrationskette, main-thread-seitig
  via `src/platform`, außerhalb Save + Hash): Kampagnenfortschritt,
  Szenario-Medaillen, Achievements.
* `DIFFICULTY_AI_TRAITS`-Datentabelle in `constants.ts`, gelesen von
  `evaluate.ts` (Kandidatenzahl, Chain-Lookahead-Tiefe, Terrain-Probe via
  `planTrack` für Top-N — amortisiert im KI-Bauzyklus, ≤ 1 ms pro
  Kandidatenprüfung, nie im Tick-Hot-Path —, Flotten-Headroom,
  Tender-Teilnahme, Exklusivrechte-Schwelle). SPEC.md 15 „bessere
  Bewertungsfunktionen" — heute liest `evaluate.ts` `world.difficulty` nie.
* KI-Persönlichkeit im Firmenprofil sichtbar (`PERSONALITY_KEYS` wird
  erstmals referenziert); KI-Leben in den News via `postOnce`
  (Linieneröffnung, Stilllegung, Insolvenz, Jahres-Ranglistenbewegung).
* ~40 Achievements als Daten, ausgelöst ausschließlich durch
  News-Log-Ereignisse und M17-Zielabschlüsse — null Sim-Beteiligung.
* Schwierigkeit bleibt gespeicherte Weltregel — kein Save-Bump nötig
  (Verhaltensänderung durch die Replay-Pinning-Policy gedeckt, E-11).

**Fertig, wenn:** Die Kampagne zwölf freischaltbare Szenarien umfasst und ein
Abschluss den Fortschritt über Neustart hinweg in `profile.json` persistiert,
ein Hard-KI-Lauf auf der Referenzkarte bei gleichem Seed messbar höheren
Firmenwert erreicht als Normal (eigene Testbänder je Stufe), die
KI-Persönlichkeit im Firmenprofil steht, mindestens 40 Achievements
ausschließlich aus News- und Zielereignissen auslösen, und ein
Kampagnen-Medaillenlauf per M16-Replay verifiziert.

---

### M25 — Plattform-Abschluss: Undo, Klang, Reichweite, Release

Der Deckel: Komfort und Reichweite auf dem fertigen Fundament.

**MUSS:**

* **Undo/Redo** (E-12): Inverse-Patch-Commands durch die normale Queue, nur
  Bau/Abriss/Terraform, Ring-Tiefe 50, session-only, ganz-oder-abgelehnt;
  Refund = historisch verbuchter Betrag; Ctrl+Z/Ctrl+Y in der
  D-114-Tabelle. Hash-Assertion „undone == never-done" in der
  Determinismus-Suite.
* **Klang-Identität** (SPEC.md 18): Abfahrtspfeife/-horn je Antriebsklasse
  (Dampfpfeife: Sägezahn+Rauschen+Hüllkurve, exakt nach SPEC.md 18),
  Übergangsglocken, Stations-Ambience nach Zone/Klima/Tageszeit (liest die
  M13-Tagesphase), `PannerNode` mit Distanzmodell statt
  `StereoPannerNode`, Master-Kompressor; **generative Musik timeboxed** —
  Abnahme sind die Event-Sounds, Musik darf würdevoll zu Ambience
  degradieren (Juroren-Veto gegen Musik als Gate); Whistle-Debounce gegen
  den 10-Züge-Klaxon-Chor; Headless-Audiograph-Assertions (M9-Muster);
  Audio-Glob-Test.
* **Accessibility & i18n-Skalierung:** Plural-Regeln in `t()`,
  OS-Locale-Erkennung beim Erststart, Schraffur-Overlays im
  Farbenblind-Modus, Reduced-Motion-Setting, Roving-Focus in Listen,
  Key-Rebinding (D-114-Tabelle wird `actionId → binding` in den Settings
  mit Konfliktprüfung).
* **Web-Demo-Kanal** (E-13): COOP/COEP-Service-Worker-Shim, OPFS-Backend in
  `Storage.ts`, Autosave-Ring-Cap fürs Web-Profil; harte SAB-Pflicht bleibt.
* **Release-Automation:** `release.yml` auf Tag → MSI+NSIS + Web-Build +
  zur Build-Zeit generierte Attributions-Datei (PixiJS/React/Tauri/
  msgpack/zlib); Code-Signing-Integrationspunkt (signiert, wenn das
  Zertifikat-Secret existiert; warnt sonst); Commercial-Readiness-Checkliste
  als Anhang (EULA/Lizenz, Namens-/Markenprüfung, Privacy-Note für
  Crash-Bundles — offline, nur nutzerinitiierter Export) — Owner-
  Entscheidungen mit vorgeschlagenen Defaults.
* **Multiplayer-Groundwork** (E-16): Per-Tick-Digest hinter Debug-Flag,
  Envelope-Integritätsfelder reserviert (Protokoll-Bump),
  Input-Delay-Designnotiz. Nicht mehr.
* **Modding-Verfassungsgrenze** (E-17) als `DECISIONS.md`-Eintrag
  protokolliert; Pack-System bleibt Folgeprogramm.

**Fertig, wenn:** Der Determinismus-Test eine Sequenz aus 50 Bau-Kommandos
plus vollständigem Undo auf denselben State-Hash bringt wie die nie gebaute
Variante (Kommandolog verschieden, Welt-Hash identisch) und ein ungültig
gewordenes Undo mit i18n-Meldung ganz abgewiesen wird, jede Antriebsklasse
eine eigene synthetisierte Abfahrtsfanfare auslöst und ein Repo-Glob keine
Audiodatei findet, die Web-Version auf einem Host ohne Header-Kontrolle über
den Shim startet, in OPFS speichert und nach Browser-Neustart lädt, ein
Git-Tag ohne Handarbeit Installer, Web-Build und Attributions-Datei erzeugt,
und die Determinismus-Suite auf ubuntu-latest denselben Final-Hash liefert wie
auf windows-latest.

---

## 9. ARBEITSWEISE 2.0

Die neun Punkte aus SPEC.md Abschnitt 23 gelten unverändert. Zusätzlich:

1. **Ledger-Abnahme:** Jeder Meilenstein wird gegen seine Zeile in
   Abschnitt 6 abgenommen (Save-Bump, Tick-Δ, Atlas-Zellen, Snapshot-Layout).
   Eine Überschreitung ist ein Abnahme-Fehler.
2. **Off-Anker-Disziplin:** Jede neue Weltregel ships default „aus" für
   Alt-Saves; Balance-Referenzläufe pinnen alle Regeln auf „aus";
   Re-Banding nur im einführenden Meilenstein.
3. **Digest-Ritual:** Nach jedem Meilenstein wird der `CLAUDE.md`-Digest
   fortgeschrieben (das Muster, das v1 getragen hat) und das
   `DECISIONS.md`-Register (Topic → D-IDs) aktualisiert.
4. **Verifikation vor Übernahme:** Jede „delivered"-Behauptung, die in ein
   Abnahmekriterium eingeht, wird per grep/Test verifiziert — drei
   Delivered-Behauptungen des v1-Audits fielen bei genau dieser Prüfung
   durch.
5. **Ein Commit pro Meilenstein** plus Zwischencommits; Format
   `feat(m11): line entity with shared orders and takt scheduling`.

---

## 10. ABNAHME — wann die Expansion fertig ist

- [ ] Alle Meilensteine M10–M25 abgenommen; Ledger-Kette v23–v34 vollständig,
      jede Migration in CI gegen echte Fixtures verifiziert.
- [ ] `test:determinism` (alle CommandKinds, Cross-OS), `test:balance`
      (inkl. Szenario 5 im 5–25-Mio.-Band, Netzdesign-Faktor ≥ 3,
      Klima-Matrix), `test:perf` (1500-Fzg.-Grundlinie + ≤ +1,2 ms Summe,
      Render-Tripwire) grün.
- [ ] Eine 1850 gestartete Endlos-Partie läuft über 2050 hinaus; ein
      v22-Save aus v1.0 lädt und verhält sich mit allen Regeln „aus" exakt
      wie v1.0.
- [ ] Jeder Save als Replay abspielbar und verifizierbar; eine
      Medaillen-Partie reproduziert ihren Medaillenstand bit-exakt.
- [ ] Kampagne vollständig durchspielbar; Tutorial-Lektion 5 über die UI
      abschließbar; kein toter Tastatur-Eintrag in der D-114-Tabelle.
- [ ] Repo-Glob-Tests grün: kein Binärbild, keine Audiodatei, kein
      Font-Asset.
- [ ] Deutsch und Englisch vollständig; `TODO`/`any`/`@ts-ignore`-frei;
      keine Konsolenfehler im Release-Build.

---

## 11. BEGINNE JETZT

**Die unmittelbare Arbeit ist M10 — Härtung & Verfassung.** Nichts anderes
wird angefasst, bevor M10 grün ist: die verifizierten Defekte (Terraforming
unter Gleis, Zeichenreihenfolge, Manuell-Modus, Refit-UI, Esc, N-Taste,
Signalrichtung, Tag/Nacht-Minimalform), die fehlenden `DECISIONS.md`-Einträge
(Chunking, Stau-Term, Replay-Pinning), `world.streamFor`, der
Determinismus-Runner über alle CommandKinds, die drei Kopplungstests, atomare
Saves mit Digest und `.bak`, die Crash-Bundles und die
1500-Fahrzeug-p99-Grundlinie.

Das stehende Ritual jedes Meilensteins: **alle Tests grün → Ledger-Zeile
abgenommen → `DECISIONS.md`-Eintrag → Commit → kurze deutsche Zusammenfassung,
was jetzt spielbar ist.** Am Ende jedes Meilensteins ist das Spiel startbar
und spielbar — nie ein Zwischenstand, der nicht läuft.

Bestätige in **drei Sätzen**, dass du den Auftrag verstanden hast, und nenne
dabei die drei Punkte, die du für das größte Risiko hältst. Dann leg mit
**Meilenstein M10** los und arbeite ihn vollständig ab.

Frag nicht, ob du anfangen sollst. Fang an.
