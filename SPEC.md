# MASTER-PROMPT — „Iron Veins" · Moderner Transport-Tycoon für den Desktop

> **Diese Datei ist die Spezifikation.** Sie ist der ursprüngliche Auftrag im
> Wortlaut. Bei jedem Widerspruch zwischen dieser Datei und `CLAUDE.md`,
> `DECISIONS.md` oder dem Code gilt: diese Datei sagt, was gewollt war;
> `DECISIONS.md` sagt, warum davon abgewichen wurde. Eine Abweichung ohne
> Eintrag in `DECISIONS.md` ist ein Fehler, keine Entscheidung.

> **So wurde sie benutzt:** Neues, leeres Projektverzeichnis anlegen
> (`C:\Users\User\Desktop\CLAUDE-all\iron-veins`), dort Claude Code starten und
> **den gesamten Inhalt dieser Datei** als ersten Prompt einfügen. Nichts
> kürzen — die Detailtiefe ist der Grund, warum es funktioniert.

---

## 0. AUFTRAG

Du bist Lead Engineer und baust ein **vollständiges, lauffähiges Desktop-Spiel**:
einen modernen Nachfolger von *Transport Tycoon Deluxe* (Chris Sawyer, 1995) mit
dem Arbeitstitel **„Iron Veins"**.

Das ist **kein Prototyp, kein Konzept und kein Mockup**. Am Ende steht eine
installierbare Windows-Anwendung, in der man ein Transportimperium über 100
Spieljahre aufbaut.

**Du arbeitest die Meilensteine M0–M9 (Abschnitt 20) strikt der Reihe nach ab.**
Jeder Meilenstein endet mit grünen Tests und einem Commit. Du springst nicht
vor. Du fängst nicht mit Meilenstein 5 an, weil er interessanter klingt.

### 0.1 Verbindlichkeit dieses Dokuments

* Alles unter **MUSS** ist nicht verhandelbar.
* Alles unter **SOLL** ist stark empfohlen; Abweichung nur mit Begründung in
  `DECISIONS.md`.
* Zahlenwerte sind **Startwerte**, keine Wahrheit — sie werden durch die
  Kalibrierungstests (Abschnitt 19.4) verifiziert und angepasst. Die Tests sind
  die Autorität, nicht die Tabelle.
* **Wenn eine Angabe fehlt:** Wähle die Variante, die Determinismus und
  Testbarkeit maximiert, implementiere sie vollständig, und dokumentiere die
  Entscheidung in `DECISIONS.md`. Frag nicht nach Kleinigkeiten. Frag nur, wenn
  eine Entscheidung die Architektur unumkehrbar festlegt.
* **Verboten:** `TODO`, `FIXME`, `// später implementieren`, leere
  Funktionsrümpfe, `throw new Error("not implemented")`, Platzhalter-Daten,
  auskommentierter Code. Was du anfängst, machst du fertig. Wenn ein Feature zu
  groß für den aktuellen Meilenstein ist, gehört es in einen späteren
  Meilenstein — nicht als Ruine ins Repo.

---

## 1. PRODUKTVISION (worauf du hinarbeitest)

Der Spieler startet 1950 mit 500.000 € auf einer prozedural erzeugten Karte
voller Städte, Wälder, Minen und Farmen. Er baut Buslinien, dann Güterbahnen,
dann Häfen und Flughäfen, und verknüpft sie zu einem multimodalen Netz. Fracht
sucht sich durch dieses Netz selbst ihren Weg. Städte wachsen dort, wo er gut
liefert. Konkurrenten bieten gegen ihn um Strecken.

Der Kern des Spielgefühls ist **die Belohnung für gutes Netzdesign**: Eine
weiche, gut signalisierte Trasse mit sinnvollen Ausweichen transportiert das
Vierfache einer hingerotzten Strecke. Das muss der Spieler *sehen* und *in der
Bilanz messen* können.

**Die drei Dinge, die Iron Veins besser macht als das Original:**

1. **Trassenbau ohne Frust** — Ziehen von A nach B erzeugt automatisch die
   weichste zulässige Strecke inkl. Brücken/Tunnel. Manuelle Kontrolle bleibt
   vollständig erhalten.
2. **Fracht mit Zeitdruck** — Verderblichkeit, Kühlketten, Liefertermine.
   Geschwindigkeit ist nicht Kosmetik, sondern Geld.
3. **Netz statt Punkt-zu-Punkt** — Fracht routet sich selbst über
   Umschlagpunkte. Der Spieler baut ein *System*, keine Einzelverbindungen.

---

## 2. TECHNOLOGIE-STACK (verbindlich)

| Bereich | Wahl | Warum |
|---|---|---|
| Sprache | **TypeScript 5.6+**, `strict: true`, `noUncheckedIndexedAccess: true` | Typsicherheit im großen Sim-Code |
| Rendering | **PixiJS v8** (WebGL2, WebGPU-Fallback aus) | Hunderttausende Sprites, ausgereift |
| UI/HUD | **React 18** + **Zustand** als DOM-Overlay über dem Canvas | Panels, Listen, Formulare |
| Simulation | **Dedicated Web Worker**, eigener Modulbaum | Sim blockiert nie das Rendering |
| Desktop-Shell | **Tauri 2** (Rust-Kern) | ~8 MB Binary statt 150 MB, native Dateidialoge, Auto-Updater |
| Build | **Vite 5** | Schnell, HMR |
| Tests | **Vitest** (Unit/Sim), **Playwright** (UI-Smoke) | |
| Serialisierung | **MessagePack** (`@msgpack/msgpack`) + `fflate` (zlib) | Kompakte, schnelle Saves |
| Lint/Format | ESLint (flat config) + Prettier | |
| i18n | eigene, minimale `t()`-Lösung mit JSON-Katalogen | Deutsch + Englisch ab Tag 1 |

**Begründung der Shell-Wahl:** Tauri, weil das Spiel keine Node-APIs braucht und
die Distribution klein bleiben soll. Falls sich in M9 ein zwingender Grund für
Node zeigt (z. B. native Steam-Integration), ist der Wechsel auf Electron ein
reiner Shell-Tausch — deshalb **MUSS** jeglicher Plattform-Zugriff (Datei
lesen/schreiben, Dialoge, Fenstersteuerung) hinter der Schnittstelle
`src/platform/Platform.ts` liegen. Kein Tauri-Import außerhalb von
`src/platform/`.

### 2.1 Explizit NICHT verwenden

* ❌ Kein Backend, keine Datenbank, kein Netzwerkzugriff. Das Spiel ist
  **vollständig offline**.
* ❌ Keine Game-Engine (Unity, Godot, Unreal).
* ❌ Kein Three.js / keine echte 3D-Szene. Die Optik ist 2.5D-Isometrie mit
  gebackenen Sprites.
* ❌ Keine ECS-Fremdbibliothek. Das Struct-of-Arrays-Layout aus Abschnitt 5.3
  wird selbst geschrieben — es ist klein und muss deterministisch sein.
* ❌ Keine Physik-Engine. Fahrzeugphysik ist ein 20-zeiliger
  Longitudinaldynamik-Solver (Abschnitt 11).
* ❌ Keine echten Marken-, Hersteller- oder Baureihenbezeichnungen (kein
  „BR 103", kein „ICE", kein „Boeing"). Alle Fahrzeuge tragen generische
  Typennamen (`Typ D-2 „Bison"`, `Reihe E-7 „Falke"`). Rechtsrisiko.

---

## 3. PROJEKTSTRUKTUR (verbindlich)

```
iron-veins/
├─ CLAUDE.md                  # Kurzregeln für künftige Sessions (du schreibst sie in M0)
├─ DECISIONS.md               # jede eigene Entscheidung mit Datum + Begründung
├─ package.json
├─ tsconfig.json              # strict
├─ vite.config.ts
├─ src-tauri/                 # Rust-Shell, Icons, Installer-Konfiguration
├─ src/
│  ├─ main.tsx                # Einstiegspunkt (React + Pixi-Bootstrap)
│  ├─ platform/               # EINZIGE Stelle mit Tauri-Imports
│  │   └─ Platform.ts
│  ├─ sim/                    # ── DETERMINISTISCHE SIMULATION ──
│  │   ├─ SimWorker.ts        # Worker-Entry, Command-Queue, Tick-Loop
│  │   ├─ World.ts            # zentraler State-Container
│  │   ├─ constants.ts        # ALLE Magic Numbers, nirgends sonst
│  │   ├─ rng.ts              # xoshiro128** seeded PRNG
│  │   ├─ math.ts             # Fixed-Point-Helfer, Sin/Cos-LUT
│  │   ├─ commands/           # Command-Definitionen + Ausführung
│  │   ├─ mapgen/             # Terrain, Biome, Städte, Industrie-Platzierung
│  │   ├─ net/                # Gleis-/Straßen-/Wassernetz als Graph
│  │   ├─ pathfind/           # A*-Varianten + Caches
│  │   ├─ signals/            # Blockverwaltung, PBS-Reservierung
│  │   ├─ vehicles/           # Physik, Zustandsautomat, Orders
│  │   ├─ cargo/              # Frachtstapel, Routing, Bezahlung
│  │   ├─ industry/           # Produktionsketten
│  │   ├─ town/               # Wachstum, Nachfrage, Rating
│  │   ├─ economy/            # Buchhaltung, Kredite, Kosten
│  │   ├─ ai/                 # KI-Konkurrenten
│  │   └─ save/               # Serialisierung + Migrationen
│  ├─ render/                 # ── DARSTELLUNG (liest Sim, schreibt NIE) ──
│  │   ├─ IsoCamera.ts
│  │   ├─ TileLayer.ts        # Terrain-Chunks
│  │   ├─ SpriteAtlas.ts
│  │   ├─ VehicleLayer.ts
│  │   ├─ OverlayLayer.ts     # Bauvorschau, Signale, Debug
│  │   └─ Minimap.ts
│  ├─ ui/                     # React-Panels
│  ├─ assets/                 # generierte Atlanten (Build-Artefakt, nicht editieren)
│  ├─ i18n/                   # de.json, en.json
│  └─ shared/                 # Typen, die Sim UND Render brauchen
├─ tools/
│  └─ bake-sprites.ts         # erzeugt Sprite-Atlanten prozedural (Abschnitt 16)
└─ tests/
   ├─ unit/
   ├─ determinism/
   └─ balance/
```

---

## 4. ARCHITEKTUR-GESETZE (die wichtigsten 10 Regeln)

Diese Regeln verhindern die Fehlerklassen, die ein Projekt dieser Größe
typischerweise zerstören. Sie sind **absolut**.

1. **Trennung Sim ↔ Render.** `src/sim/**` importiert **nichts** aus
   `src/render/**`, `src/ui/**`, `pixi.js`, `react`. Kein `window`, kein
   `document`, kein `localStorage`. Erzwinge das per ESLint-Regel
   `no-restricted-imports` — nicht per Disziplin.
2. **Feste Zeitschrittweite.** Die Sim läuft mit **20 Hz (50 ms/Tick)**. Kein
   Delta-Time in der Sim. Das Rendering interpoliert zwischen letztem und
   aktuellem Sim-Zustand.
3. **Determinismus ist Pflicht.** Gleicher Seed + gleiche Command-Folge ⇒
   bitidentischer Zustand. Verboten in `src/sim/**`: `Math.random()`,
   `Date.now()`, `performance.now()`, `new Date()`, `Set`/`Map`-Iteration über
   Objektreferenzen, `Object.keys()`-Reihenfolge als Logik, `Array.sort()` ohne
   totalen Comparator, `for...in`.
4. **Nur sichere Gleitkomma-Operationen in der Sim.** Erlaubt: `+ - * /` und
   `Math.sqrt` (IEEE-754-exakt spezifiziert). **Verboten:**
   `Math.sin/cos/tan/pow/exp/log/atan2` (engineabhängig). Trigonometrie
   ausschließlich über die Lookup-Tabellen in `sim/math.ts` (4096 Einträge,
   Int32-Fixpoint).
5. **Geld ist ganzzahlig.** Alle Beträge in **Cent als `number`** (sicher bis
   9·10¹⁵ ¢ = 90 Billionen €). Nie Fließkomma-Euro. Formatierung erst in der UI.
6. **Alle Zustandsänderungen laufen über Commands.** Kein UI-Code mutiert
   Sim-State direkt. Ein Command ist ein serialisierbares Objekt, wird in eine
   Queue gelegt und am Tick-Anfang ausgeführt. Das gibt dir gratis: Replays,
   Undo, Savegame-Verifikation und später Multiplayer.
7. **Keine Allokation im Hot Path.** In `tick()` und allen davon aufgerufenen
   Funktionen: keine Objekt-/Array-Literale, kein `.map/.filter/.reduce`, keine
   Closures, kein Spread. Vorallokierte Puffer und klassische `for`-Schleifen
   mit `let i`.
8. **Keine Rekursion für Netz-Traversierung.** Gleisnetze werden 100.000 Kanten
   groß. Alle Graphen-Durchläufe iterativ mit explizitem Stack/Queue.
9. **IDs statt Referenzen.** Jede Entität wird über eine numerische ID
   adressiert (`type TrainId = number & {__brand:'TrainId'}`). Nie
   Objektreferenzen im serialisierbaren State speichern.
10. **Sim-Zustandsänderungen sind atomar pro Tick.** Das Rendering liest immer
    einen konsistenten Snapshot (Double-Buffer über `SharedArrayBuffer`), nie
    einen halb aktualisierten Zustand.

### 4.1 Kommunikation Worker ↔ Hauptthread

* **Hauptthread → Worker:** `postMessage` mit Command-Objekten (klein, selten).
* **Worker → Hauptthread:** **SharedArrayBuffer**, doppelt gepuffert. Der Worker
  schreibt in Puffer B, setzt am Tickende per `Atomics.store` den
  Generationszähler, das Rendering liest Puffer A. Kein `postMessage` pro Tick
  (das wäre der Performance-Killer).
* Layout des Render-Snapshots: dicht gepackte `Float32Array`/`Int32Array`-Slices
  für Fahrzeugpositionen, sichtbare Tile-Änderungen, Stationszustände. Genaues
  Layout in `src/shared/snapshot.ts` dokumentieren.
* **Cross-Origin-Isolation:** SharedArrayBuffer braucht die Header
  `Cross-Origin-Opener-Policy: same-origin` und
  `Cross-Origin-Embedder-Policy: require-corp`. In `vite.config.ts` für den
  Dev-Server setzen; in Tauri über die App-Konfiguration. **Das vergisst man
  garantiert und sucht dann zwei Stunden — mach es in M0.**

---

## 5. WELT- UND DATENMODELL

### 5.1 Maßstab (die Zahlen, an denen alles hängt)

| Größe | Wert | Anmerkung |
|---|---|---|
| Kantenlänge 1 Tile | **50 m** | |
| Höhenstufe | **8 m** | 16 Stufen (0–15) |
| Tile-Sprite bei Zoom 1.0 | **64 × 32 px** | klassische 2:1-Isometrie |
| Höhenstufe gerendert | **16 px** vertikaler Versatz | |
| Kartengrößen | 256², 512², **1024² (Standard)**, 2048² | 1024² = 51,2 × 51,2 km |
| Sim-Frequenz | **20 Hz** | 50 ms/Tick |
| 1 Spieltag | **200 Ticks** = 10 s Realzeit bei Speed 1× | |
| 1 Spielmonat | 30 Tage | |
| 1 Spieljahr | 360 Tage = 72.000 Ticks = 60 min bei 1× | |
| Spielzeitraum | 1950 – 2050 | |
| Geschwindigkeitsstufen | Pause, 1×, 2×, 5×, 20× | 20× bündelt 20 Ticks pro Frame |

### 5.2 ⚠️ Zeit-Entkopplung — der wichtigste Denkfehler, den du vermeiden musst

**Fahrzeugbewegung und Kalender laufen auf zwei verschiedenen Zeitachsen.** Das
ist Absicht und exakt so wie im Original.

* **Tick-Zeit (Realzeit):** Fahrzeugphysik, Position, Beschleunigung,
  Be-/Entladen, Signalreservierungen. Ein Zug mit 160 km/h legt **44,4 m pro
  Realsekunde** zurück, also **2,22 m pro Tick**.
* **Spielzeit (Kalender):** Datum, Fahrzeugalter, Industrieproduktion,
  Stadtwachstum, Finanzberichte, Kreditzinsen, Frachtverfall.

**Rechenbeispiel, das du als Kommentar in `constants.ts` schreibst:**

> Strecke 60 Tiles = 3.000 m. Zug bei 44,4 m/s → 67,6 s Realzeit → 1.352 Ticks →
> **6,8 Spieltage**. Deshalb sind Verfall-Kulanzzeiten in Tagen (nicht Stunden)
> sinnvoll, und deshalb ist eine 500-Tile-Strecke wirtschaftlich fast immer
> schlechter als eine 80-Tile-Strecke.

Wenn du versuchst, Fahrzeuge in Spielzeit zu bewegen, überquert ein Zug die
Karte in einem Frame. Wenn du den Kalender in Realzeit laufen lässt, dauert ein
Spieljahr 8 Stunden. Beides ist falsch.

### 5.3 Speicherlayout (Struct of Arrays)

Fahrzeuge, Frachtstapel und Tiles werden **nicht** als Objekt-Arrays gehalten,
sondern als parallele TypedArrays:

```ts
// src/sim/vehicles/VehicleStore.ts
export class VehicleStore {
  readonly cap: number;
  count = 0;
  readonly kind        = new Uint8Array(cap);   // 0=Zug 1=Lkw 2=Schiff 3=Flugzeug
  readonly ownerId     = new Uint8Array(cap);
  readonly edgeId      = new Int32Array(cap);   // aktuelle Netzkante
  readonly offsetM     = new Float32Array(cap); // Meter entlang der Kante
  readonly dir         = new Uint8Array(cap);   // 0=vorwärts 1=rückwärts
  readonly speedMs     = new Float32Array(cap);
  readonly massKg      = new Float32Array(cap);
  readonly state       = new Uint8Array(cap);   // FSM (Abschnitt 11.4)
  readonly orderIdx    = new Uint8Array(cap);
  readonly builtTick   = new Int32Array(cap);
  readonly reliability = new Uint16Array(cap);  // 0..10000
  // ... Freiliste für gelöschte Slots
}
```

**Tile-Daten** ebenso: `height: Uint8Array`, `terrain: Uint8Array`,
`ownerMask: Uint8Array`, `trackBits: Uint16Array` (6 Richtungsbits + Typ),
`roadBits: Uint8Array`, `buildingId: Int32Array` — jeweils `size²` Einträge. Bei
1024² sind das ~1 MB pro Layer. Völlig unproblematisch, aber **niemals** 1 Mio.
JS-Objekte.

### 5.4 Terrain-Typen

`WASSER=0, KUESTE=1, WIESE=2, ACKER=3, WALD=4, FELS=5, SCHNEE=6, WUESTE=7, MOOR=8, STADTBODEN=9`

---

## 6. WELTGENERIERUNG

Deterministisch aus einem 32-Bit-Seed. Gleicher Seed ⇒ gleiche Karte, immer.

**Ablauf (genau diese Reihenfolge):**

1. **Höhenfeld** — 6 Oktaven Simplex-Noise (eigene Implementierung, seeded),
   Persistenz 0,5, Lacunarity 2,0. Anschließend Erosionspass: 40 Iterationen
   thermische Erosion (Talus-Winkel entspricht 1 Höhenstufe pro Tile).
2. **Meeresspiegel** — bei Höhenstufe 3. Alles darunter = WASSER.
   Kartenrand-Flutfüllung markiert Ozean vs. Binnenseen.
3. **Flüsse** — 12–25 Quellen an Höhenstufe ≥ 10, Gradientenabstieg zum Meer,
   Senken werden aufgefüllt. Flussbreite 1–3 Tiles je nach Einzugsgebiet. Flüsse
   schneiden das Terrain um 1 Stufe ein.
4. **Klimazonen** — Temperaturgradient über die Y-Achse + Höhenabhängigkeit
   (−1 °C pro Höhenstufe), Feuchtigkeit aus separatem Noise. Daraus Biome:
   gemäßigt / arktisch / tropisch / wüstenartig. **Ein Kartentyp pro Spiel**
   (Auswahl im Startmenü), nicht alle gemischt.
5. **Städte** — Poisson-Disc-Sampling mit Mindestabstand 24 Tiles, nur auf Land
   mit Steigung ≤ 1. 40–140 Städte je nach Kartengröße. Größenverteilung: 8 %
   Großstadt (Start 8.000 Einw.), 25 % Stadt (2.500), 67 % Dorf (400). Jede
   Stadt bekommt ein Straßennetz (Abschnitt 13.1) und einen deutschen bzw.
   englischen Namen aus generierten Silben (Präfix+Suffix-Tabellen, keine
   Namensliste abtippen).
6. **Industrien** — je Typ eigene Platzierungsregel: Kohlemine nur auf
   FELS/Hügel, Ölquelle auf WUESTE/Küste, Wald-Sägewerk max. 8 Tiles von WALD,
   Farm auf ACKER/WIESE, Fabriken max. 12 Tiles von einer Stadt. Dichte:
   **1 Industrie pro 6.000 Tiles**, min. 8 Tiles Abstand zueinander.
   Rezept-Ketten müssen erreichbar sein: Der Generator **MUSS** verifizieren,
   dass für jede Verarbeitungsindustrie mindestens eine Quelle jedes Inputs auf
   derselben Landmasse existiert; sonst nachplatzieren.
7. **Startbedingungen prüfen** — Es muss mindestens ein Städtepaar mit Abstand
   20–60 Tiles auf gemeinsamer Landmasse geben. Sonst Karte mit `seed+1` neu
   erzeugen (max. 20 Versuche, dann Seed-Fehler melden).

**Kartengenerierung darf max. 8 Sekunden für 1024² dauern.** Sie läuft im Worker
mit Fortschrittsmeldung an die UI.

---

## 7. FRACHT UND PRODUKTIONSKETTEN

### 7.1 Frachttypen

Alle Werte sind **Startwerte** und werden vom Balancing-Test kalibriert.

| ID | Fracht | Einheit | Basisrate (¢/Einh./100 Tiles) | Kulanz (Tage) | Verfall/Tag | Kühlkette | Farbe |
|---|---|---|---|---|---|---|---|
| 0 | Passagiere | Person | 950 | 4 | 0,050 | – | `#f2c14e` |
| 1 | Post | Sack | 780 | 3 | 0,065 | – | `#e8e8e8` |
| 2 | Kohle | t | 210 | 30 | 0,004 | – | `#2b2b2b` |
| 3 | Eisenerz | t | 240 | 30 | 0,004 | – | `#8a5a3b` |
| 4 | Stahl | t | 420 | 22 | 0,008 | – | `#7d8b99` |
| 5 | Holz | t | 260 | 26 | 0,006 | – | `#6b4a2f` |
| 6 | Bretter | t | 400 | 22 | 0,008 | – | `#c19a6b` |
| 7 | Getreide | t | 300 | 14 | 0,018 | – | `#dcc06a` |
| 8 | Vieh | Stk | 520 | 6 | 0,055 | ✓ | `#b5651d` |
| 9 | Lebensmittel | t | 640 | 8 | 0,048 | ✓ | `#d94f4f` |
| 10 | Waren | t | 900 | 12 | 0,022 | – | `#4f7fd9` |
| 11 | Öl | t | 350 | 26 | 0,006 | – | `#1a1a1a` |
| 12 | Chemie | t | 700 | 16 | 0,020 | ✓ | `#8fd94f` |
| 13 | Kunststoff | t | 560 | 20 | 0,012 | – | `#d94fd0` |
| 14 | Elektronik | t | 1500 | 10 | 0,035 | – | `#4fd9d0` |
| 15 | Kies | t | 150 | 30 | 0,003 | – | `#9a9a9a` |
| 16 | Zement | t | 260 | 24 | 0,007 | – | `#c8c4bc` |
| 17 | Container | TEU | 1100 | 18 | 0,015 | – | `#e07b39` |

### 7.2 Produktionsketten

```
Kohlemine ──Kohle──> Kraftwerk (Senke)
          └─Kohle──> Stahlwerk
Eisenerzmine ─Eisenerz─> Stahlwerk ──Stahl──> Maschinenfabrik ──Waren──> STADT
                                   └─Stahl──> Elektronikfabrik
Wald ──Holz──> Sägewerk ──Bretter──> Möbelfabrik ──Waren──> STADT
Farm ──Getreide─┐
Farm ──Vieh─────┴─> Lebensmittelfabrik ──Lebensmittel──> STADT   (verderblich!)
Ölquelle / Bohrinsel ──Öl──> Raffinerie ──Chemie──> Kunststoffwerk ──Kunststoff──┐
                                                                                 ├─> Elektronikfabrik ──Elektronik──> STADT
                                                              Stahlwerk ──Stahl──┘
Kiesgrube ──Kies──> Zementwerk ──Zement──> Baustoffhandel (Senke, treibt Stadtwachstum)
Hafen/Containerterminal: Container als Übersee-Metafracht zwischen Häfen
```

### 7.3 Industrie-Mechanik

* Jede Industrie: `inputLager[cargoId]`, `outputLager[cargoId]`, jeweils mit
  Kapazität (Standard: 8 Monatsproduktionen).
* **Produktion** wird **einmal pro Spielmonat** gebucht (nicht pro Tick — das
  ist ein häufiger Performance- und Balancing-Fehler):
  `menge = min(basisRate × ausbaustufe, floor(inputLager / rezeptBedarf) × rezeptAusbeute, freierOutputPlatz)`
* **Output-Lager voll** → Produktion sinkt auf 25 %. Sichtbare Warnung im
  Nachrichtenlog.
* **24 Spielmonate ohne Abtransport** → Industrie schließt. Warnung nach 12 und
  nach 20 Monaten.
* **Gute Bedienung** (≥ 80 % Abtransport über 12 Monate) → Ausbau +10 %, max.
  200 %.
* Primärindustrien (Mine, Wald, Farm, Ölquelle) haben keine Inputs, aber eine
  schwankende Basisrate (±25 % Sinuszyklus über 5 Spieljahre, aus der LUT).
* **Neue Industrien** entstehen zufällig 1× pro Spieljahr (seeded), bevorzugt in
  unterversorgten Regionen. Nie näher als 8 Tiles an einer bestehenden.

### 7.4 Fracht-Routing (das Herzstück)

Fracht ist **kein** dummer Punkt-zu-Punkt-Transport. Modell:

* Eine `CargoStack` ist
  `{cargoId, menge, quelleStationId, zielStationId, erzeugtTick, bezahltBisDistanz}`.
* Jede Station führt eine **Verbindungstabelle**: Welche Ziele sind über welche
  Linie in wie vielen Ticks (gleitender Mittelwert der letzten 8 Fahrten)
  erreichbar?
* Wartende Fracht wählt am Bahnsteig das Fahrzeug, dessen Linie ihr Ziel mit der
  **kürzesten erwarteten Restzeit** bedient — auch über Umstieg.
* Umschlag: Fracht, die an einer Zwischenstation ausgeladen wird, behält
  Herkunft und Ziel. Bezahlt wird **die tatsächlich zurückgelegte Distanz seit
  dem letzten bezahlten Punkt**. Damit funktionieren Zubringer-Ketten (Lkw → Zug
  → Schiff → Lkw) automatisch und ohne Doppelzahlung.
* Fracht ohne bekannte Route wartet max. 30 Spieltage, dann verfällt sie
  (Rating-Malus für die Station).

### 7.5 Einnahmenformel (verbindlich, mit Testfall)

```
tageUnterwegs  = (aktuellerTick - erzeugtTick) / TICKS_PRO_TAG
distanzTiles   = euklidische Distanz(letzterBezahlterPunkt, entladeStation)

zeitfaktor = clamp(1 - max(0, tageUnterwegs - kulanzTage) * verfallProTag, 0.10, 1.00)
if (tageUnterwegs <= kulanzTage * 0.5) zeitfaktor = 1.30          // Schnellbonus

kuehlMalus = (fracht.kuehlkette && !fahrzeug.hatKuehlung) ? 0.55 : 1.00
epoche     = inflationsfaktor(jahr)                                // 1.00 im Jahr 1950, +1,8 %/Jahr

brutto_ct  = round(menge * basisrate_ct * (distanzTiles / 100) * zeitfaktor * kuehlMalus * epoche)
```

**Pflicht-Unittest `payment.spec.ts` (muss exakt so grün werden):**

> 200 Passagiere, Basisrate 950, Distanz 60 Tiles, 3,5 Tage unterwegs, Kulanz 4,
> Verfall 0,05, keine Kühlung nötig, Jahr 1950.
> zeitfaktor = 1,00 (3,5 > 4·0,5 = 2, also kein Bonus; 3,5 < 4, also kein
> Verfall)
> brutto = 200 × 950 × 0,60 × 1,00 × 1,00 × 1,00 = **114.000 ¢ = 1.140,00 €**

---

## 8. NETZ-MODELL (Gleise, Straßen, Wasser, Luft)

### 8.1 Grundentscheidung: Tile-Raster mit abgeleitetem Kurvenradius

Gleise liegen auf dem Tile-Raster (6 mögliche Richtungen pro Tile: N, NO, SO, S,
SW, NW). Das gibt robuste, deterministische Signal- und Blocklogik.

**Aber:** Der effektive Kurvenradius wird aus der Folge der Richtungswechsel
abgeleitet — dadurch lohnt sich weiches Bauen, ohne dass ein Spline-Editor nötig
wird.

| Muster über die letzten 3 Kanten | Effektiver Radius | Max. Kurvengeschw. (a_quer 0,65 m/s²) |
|---|---|---|
| gerade | ∞ | unbegrenzt |
| 1× 45° mit je 1 geradem Tile davor/danach | 300 m | 50,4 m/s (181 km/h) |
| 1× 45° direkt an weiterer Richtungsänderung | 150 m | 35,6 m/s (128 km/h) |
| 2× 45° in Folge (= 90°-Bogen über 2 Tiles) | 90 m | 27,6 m/s (99 km/h) |
| 90° innerhalb eines Tiles (Minimalkurve) | 45 m | 19,5 m/s (70 km/h) |

`v_max_kurve = sqrt(a_quer_max × r)`, mit `a_quer_max` = 0,65 m/s² für
Personenzüge (Komfort), 1,00 m/s² für Güterzüge, 1,20 m/s² für
Straßenfahrzeuge.

### 8.2 Trassen-Assistent (Kernfeature „Bauen ohne Frust")

Ziehen von Tile A nach Tile B ⇒ A*-Suche über Tile-Richtungszustände mit
Kostenfunktion:

```
kosten = laengeM
       + kurvenStrafe(radius)          // 45°:+40 m, 90°:+220 m, Minimalkurve:+900 m
       + steigungsStrafe(promille)     // (promille/5)² × 60 m
       + erdbewegungsKosten            // in Meter-Äquivalent, siehe unten
       + bruecke/tunnelKosten
       + fremdesEigentumStrafe(10.000 m)  // umgeht Konkurrenz-Infrastruktur
```

* **Brücken** werden automatisch über Wasser/Täler gespannt, wenn günstiger als
  aufschütten; max. Spannweite je Brückentyp (Holz 4, Stahl 12, Beton 20,
  Hängebrücke 40 Tiles).
* **Tunnel** automatisch, wenn ein Berg ≥ 3 Höhenstufen im Weg ist und der
  Umweg > 2× Tunnellänge wäre.
* Der Assistent zeigt **vor** dem Bestätigen: Gesamtkosten, Länge, max.
  Steigung, engsten Radius, resultierende Höchstgeschwindigkeit. Erst Klick auf
  „Bauen" führt den Command aus.
* **Manueller Modus** (Taste `M`) legt einzelne Tiles ohne Assistent — für
  Puristen, die Gleisvorfelder von Hand bauen. Beide Modi müssen vollwertig
  sein.

### 8.3 Netz als Graph

Aus den Tile-Bits wird ein **Kantengraph** gepflegt (inkrementell, nicht jedes
Mal neu aufbauen!):

```ts
interface NetEdge {
  id: EdgeId;
  fromNode: NodeId; toNode: NodeId;
  lengthM: number;
  gradePermille: number;   // Steigung, vorzeichenbehaftet in Fahrtrichtung from→to
  minRadiusM: number;
  maxSpeedMs: number;      // aus Radius + Gleistyp
  railType: number;        // 0=normal 1=elektrifiziert 2=schmalspur 3=schnellfahr
  blockId: BlockId;        // Signalblock
  tiles: Int32Array;       // belegte Tiles (für Rendering + Kollisionsprüfung)
}
```

Knoten entstehen an Weichen, Signalen, Bahnhofsenden und Gleistyp-Wechseln.
Gerade Strecken werden zu **einer** langen Kante zusammengefasst (Kantenzahl
klein halten — das entscheidet über die Pathfinding-Performance).

Bei jeder Baumaßnahme wird nur die betroffene Region des Graphen neu berechnet
(Kante splitten/mergen). **Ein vollständiger Neuaufbau bei jedem gelegten Gleis
ist der klassische Performance-Killer und ist verboten.**

### 8.4 Wegfindung

| Verkehrsträger | Verfahren |
|---|---|
| **Zug** | A* über Zustände `(edgeId, dir)`. Heuristik: Luftlinie zum Ziel / v_max. Kosten: `t = länge/v_eff + kurvenzeitverlust + steigungszeitverlust + signalStrafe + belegungsStrafe(reservierteBlöcke × 3 s)`. Ergebnis-Cache pro `(startEdge, dir, zielStation)`, invalidiert bei Netzänderung im betroffenen Bereich. Suchtiefe max. 20.000 Knoten, dann bestbekannter Teilweg. |
| **Lkw/Bus** | A* über Straßen-Tiles, 8 Richtungen, mit Stau-Term (Fahrzeuge pro Tile in den letzten 200 Ticks). |
| **Schiff** | A* über Wasser-Tiles mit vorberechnetem Flow-Field pro Hafen (nur bei Hafenbau neu berechnen). |
| **Flugzeug** | Direktflug. Flughäfen haben Warteschleifen (max. 4 Positionen) und eine Landebahn-Belegungsqueue. |

---

## 9. SIGNALE UND BLOCKSICHERUNG

### 9.1 Signaltypen

| Typ | Verhalten |
|---|---|
| **Blocksignal (zweiseitig)** | Klassisch: Zug fährt ein, wenn der folgende Block frei ist. |
| **Blocksignal (einseitig)** | Wie oben, aber nur in eine Richtung befahrbar. |
| **Pfadsignal (PBS)** | Zug reserviert beim Passieren einen konkreten Pfad durch das folgende Gleisvorfeld bis zum nächsten sicheren Haltepunkt. Erlaubt kreuzungsfreie Parallelfahrten in Bahnhofsköpfen. |
| **Einfahr-Pfadsignal** | Wie PBS, verhindert aber, dass Züge *aus* dem Bereich heraus in Gegenrichtung reservieren. |

### 9.2 Blockverwaltung

* Gleisnetz wird über **Union-Find** in Blöcke zerlegt. Signale trennen Blöcke.
* Bei Signal-Setzen/-Entfernen wird **nur die betroffene
  Zusammenhangskomponente** neu segmentiert (iterativ, per Queue).
* Ein Block hat: `belegtVonTrainId` (-1 = frei), `reservierungen: Set<TrainId>`
  als Int32Array-Liste.
* **PBS-Reservierung:** A*-Suche über Kanten vom Signal bis zum nächsten
  sicheren Punkt (Signal, Bahnsteig, Depot). Alle Kanten des Pfades werden mit
  der TrainId markiert. Freigabe erfolgt kantenweise, sobald der Zugschluss die
  Kante verlassen hat — **nicht** erst am Pfadende.
* **Zuglänge ist relevant:** Ein Zug besetzt alle Kanten zwischen Zugspitze und
  Zugschluss. Ein 200-m-Zug auf 50-m-Tiles besetzt 4 Tiles.

### 9.3 Deadlock-Behandlung

* Erkennung: Zug im Zustand `WARTET_AUF_SIGNAL` ohne Reservierungsfortschritt
  seit **1.200 Ticks** (1 Minute Realzeit).
* Reaktion: Warnung im Nachrichtenlog mit Klick-Sprung zur Position, gelber
  Blink-Marker im Overlay.
* **Kein Auto-Fix.** Deadlocks sind Spielerfehler und müssen sichtbar bleiben,
  sonst lernt niemand Signale. Das Spiel hilft beim *Finden*, nicht beim Lösen.
* Debug-Overlay (Taste `F3`) zeigt Blockgrenzen, Belegung und Reservierungen
  farbig — dieses Overlay ist **auch im Release enthalten**, es ist ein
  Lernwerkzeug.

### 9.4 Automatische Signalisierung

Beim Ziehen einer Strecke im Assistenten-Modus: optionaler Schalter „Signale
automatisch" setzt Blocksignale im wählbaren Abstand (Standard 12 Tiles) in
Fahrtrichtung, mit korrekter Einseitigkeit. An Bahnhofseinfahrten setzt er
Pfadsignale. Der Spieler kann jedes gesetzte Signal danach einzeln ändern oder
löschen.

---

## 10. STATIONEN (modularer Aufbau)

Kein starres 3×3-Raster. Stationen werden aus Modulen zusammengesetzt:

* **Bahnsteig** (1×N Tiles, N = 1..12) — bestimmt die max. Zuglänge, die
  vollständig hält. Ein zu langer Zug lädt nur anteilig (Malus 40 %).
* **Frachtterminal** (Kran/Rampe) — erhöht Ladegeschwindigkeit um 50 %.
* **Überdachung / Wartehalle** — +8 Rating-Punkte, hält Frachtverfall an der
  Station um 30 % auf.
* **Kühlhalle** — verhindert Verfall verderblicher Fracht an dieser Station
  vollständig.
* **Lkw-Ladebucht**, **Bushaltestelle**, **Kai** (Wasser), **Terminal +
  Landebahn** (Luft).
* **Depot** (Wartung, Neubau, Umbau von Fahrzeugen).

**Verbundstation:** Module, die innerhalb von 4 Tiles zueinander stehen und
demselben Spieler gehören, bilden **eine** Station mit gemeinsamem Frachtpool.
So entstehen echte multimodale Hubs (Bahn + Lkw + Schiff an einem
Umschlagplatz).

**Einzugsgebiet:** Radius abhängig von der Stationsgröße (Basis 4 Tiles, +1 pro
3 Module, max. 10). Nur Häuser/Industrien innerhalb des Radius liefern und
beziehen Fracht.

### 10.1 Stationsbewertung (0–100)

```
rating = 25 (Basis)
       + wartezeitTerm      // 0..30, 30 wenn älteste Fracht < 2 Spieltage, linear auf 0 bei 20 Tagen
       + frequenzTerm       // 0..20, aus Fahrzeugbesuchen der letzten 20 Spieltage
       + ausstattungTerm    // 0..15, aus Modulen
       + zuverlaessigkeit   // 0..10, mittlere Zuverlässigkeit der bedienenden Fahrzeuge
       - staerkeMalus       // 0..-15 wenn Fracht wegen Überfüllung verfallen ist
```

Das Rating steuert, **wie viel Prozent der erzeugten Fracht überhaupt an dieser
Station erscheint**: `anteil = rating / 100`. Schlecht bediente Stationen
bekommen weniger Fracht — die Todesspirale ist gewollt und muss deutlich
kommuniziert werden.

---

## 11. FAHRZEUGE

### 11.1 Längsdynamik (exakt so implementieren)

SI-Einheiten. Pro Tick (`dt = 0,05 s`):

```
// Zugkraft: konstante Anfahrzugkraft bis zur Leistungsgrenze, dann P/v
F_traktion = min(F_anfahr, P_max / max(v, 1.0))                    [N]
F_roll     = c_r * m * 9.81                                        // c_r: Schiene 0.0020, Straße 0.0120
F_luft     = k_luft * v * v                                        // k_luft: Zug 5.5, Lkw 3.2, Schiff 40.0
F_steig    = m * 9.81 * (gradePermille / 1000)                     // Vorzeichen aus Fahrtrichtung
F_brems    = (bremsend) ? m * a_brems : 0                          // a_brems: Güter 0.6, Personen 1.0, Lkw 2.5

a = (F_traktion - F_roll - F_luft - F_steig - F_brems) / (m * 1.06)   // 1.06 = rotierende Massen
v = clamp(v + a * dt, 0, v_limit)
offsetM += v * dt
```

`v_limit` = min(Fahrzeug-Höchstgeschwindigkeit, Kanten-Höchstgeschwindigkeit,
Kurvengrenze der **nächsten** 3 Kanten unter Berücksichtigung des Bremswegs,
Signalbedingung).

**Bremswegvorschau (Pflicht, sonst überfährt der Zug rote Signale):**
`s_brems = v² / (2 · a_brems) + v · 0,5 s` (Reaktionsweg). Der Zug prüft jeden
Tick, ob innerhalb `s_brems` ein Halt- oder Langsamfahrpunkt liegt, und bremst
rechtzeitig.

### 11.2 Zugzusammenstellung

Ein Zug = 1..N Fahrzeugteile (Lok + Wagen). Aggregierte Werte: `m = Σm_i`,
`F_anfahr = Σ nur Loks`, `P_max = Σ nur Loks`, `v_max = min(v_max_i)`,
`länge = Σ länge_i`, `kapazität` je Frachttyp aus den Wagen.

**Elektrifizierung:** E-Loks fahren nur auf Kanten mit `railType == 1`. Fehlt der
Fahrdraht auf dem Weg, wird die Route bei der Wegfindung ausgeschlossen; ein
Zug, der durch nachträgliche Entelektrifizierung strandet, geht in `STROMLOS`
und meldet sich im Log.

### 11.3 Alterung, Wartung, Ausfälle

* `zuverlaessigkeit` startet bei 92 % (0..10000 intern), sinkt pro Spieljahr um
  4 Prozentpunkte, nach Depotwartung wieder +6 (max. Startwert).
* Ausfallwurf **einmal pro Spieltag** (nicht pro Tick!):
  `rng < (10000 - zuverlaessigkeit) / 40000` ⇒ Panne. Fahrzeug steht 40–120
  Ticks, blockiert dabei seinen Block (das ist Absicht — Redundanz muss belohnt
  werden).
* Lebensdauer je Fahrzeugtyp (15–35 Spieljahre). Nach Ablauf: Unterhalt ×2,
  Zuverlässigkeit fällt doppelt so schnell. Meldung „ist veraltet" im Log.
* **Autoerneuerung** einstellbar pro Linie: bei Alter ≥ X Jahre automatisch
  durch Nachfolgetyp ersetzen, sofern Geld vorhanden.

### 11.4 Fahrzeug-Zustandsautomat

`FAEHRT → BREMST → HAELT_AN_STATION → LAEDT → FAEHRT_AB → FAEHRT`
Nebenzustände: `WARTET_AUF_SIGNAL`, `WARTET_AUF_LADUNG`, `PANNE`, `IM_DEPOT`,
`KEIN_WEG`, `STROMLOS`.

Jeder Zustandswechsel wird protokolliert (Ringpuffer 64 Einträge/Fahrzeug),
sichtbar im Fahrzeug-Panel. Das ist das wichtigste Debug-Werkzeug für den
Spieler.

### 11.5 Fahrzeugkatalog

Datei `src/sim/vehicles/catalog.ts`, reine Daten. Schema:

```ts
interface VehicleSpec {
  id: number; nameKey: string;         // i18n-Schlüssel, kein Klartext
  kind: 0|1|2|3;                       // Zug/Straße/Schiff/Luft
  introYear: number; retireYear: number;
  priceCt: number; upkeepCtPerYear: number;
  massKg: number; lengthM: number;
  tractiveN: number; powerW: number; maxSpeedMs: number;
  capacity: Partial<Record<CargoId, number>>;
  refittable: CargoId[];               // umrüstbar auf
  power: 'dampf'|'diesel'|'elektro'|'wasserstoff'|'batterie';
  needsCatenary: boolean; hasCooling: boolean;
  reliability0: number; lifetimeYears: number;
  co2PerKm: number;                    // für Umwelt-Rating (Abschnitt 14.3)
}
```

**Beispieleinträge (Format-Vorgabe):**

```ts
{ id: 100, nameKey:'veh.steam_g3', kind:0, introYear:1950, retireYear:1968,
  priceCt: 4_800_000, upkeepCtPerYear: 620_000, massKg: 86_000, lengthM: 21,
  tractiveN: 195_000, powerW: 1_150_000, maxSpeedMs: 22.2,   // 80 km/h
  capacity:{}, refittable:[], power:'dampf', needsCatenary:false, hasCooling:false,
  reliability0: 8200, lifetimeYears: 18, co2PerKm: 11.4 },

{ id: 140, nameKey:'veh.elec_e7', kind:0, introYear:1972, retireYear:2005,
  priceCt: 18_500_000, upkeepCtPerYear: 1_450_000, massKg: 84_000, lengthM: 19,
  tractiveN: 300_000, powerW: 5_600_000, maxSpeedMs: 55.6,   // 200 km/h
  capacity:{}, refittable:[], power:'elektro', needsCatenary:true, hasCooling:false,
  reliability0: 9400, lifetimeYears: 30, co2PerKm: 0.9 },
```

**Umfang, den du vollständig ausfüllst:** mindestens **28 Zugantriebe**,
**20 Wagentypen**, **22 Straßenfahrzeuge**, **12 Schiffe**, **12 Flugzeuge**,
verteilt über 1950–2050 mit sinnvollen Generationssprüngen. Pro Jahrzehnt muss
es in jeder Kategorie mindestens einen Fortschritt geben, sonst wird die Mitte
des Spiels langweilig.

---

## 12. AUFTRÄGE, LINIEN UND FAHRPLÄNE

### 12.1 Aufträge (Orders)

Ein Fahrzeug hat eine zyklische Auftragsliste. Jeder Auftrag:

```ts
interface Order {
  target: {kind:'station'|'depot'|'waypoint', id:number};
  load:   'voll'|'teilweise'|'keine'|'voll_beliebig';
  unload: 'alles'|'nur_transfer'|'keine'|'erzwungen';
  refitTo?: CargoId;
  waitTicks?: number;          // Mindestaufenthalt
  condition?: OrderCondition;  // Sprungbedingung, siehe unten
}
```

**Bedingte Aufträge:**
`wenn <Ladung%|Zuverlässigkeit|Alter|Wartezeit|Datum> <Vergleich> <Wert> dann springe zu Auftrag N`.
Damit lassen sich Depot-Rundläufe und Lastspitzen-Umleitungen bauen, ohne
Skriptsprache.

### 12.2 Linien

Fahrzeuge werden **Linien** zugewiesen (gemeinsame Auftragsliste, gemeinsame
Statistik). Änderung an der Linie wirkt auf alle Fahrzeuge. Linienübersicht
zeigt: Auslastung, Gewinn/Spieljahr, Ø-Rundenzeit, wartende Fracht an den
Stationen der Linie, Vorschlag „Fahrzeug hinzufügen/entfernen".

### 12.3 Taktfahrplan (Kernfeature „modern")

Optional pro Linie aktivierbar:

* Spieler setzt **Taktzeit** (z. B. alle 20 Spieltage) und **Startversatz**.
* Fahrzeuge warten an definierten Taktpunkten bis zur Sollabfahrt.
* Die UI zeigt **Verspätung in Spieltagen** je Fahrzeug und schlägt automatisch
  die minimale Fahrzeuganzahl für den gewählten Takt vor
  (`ceil(rundenzeit / taktzeit)`).
* **Anschlusssicherung:** An als „Umsteigeknoten" markierten Stationen wartet
  ein Fahrzeug bis zu X Ticks auf ein anderes derselben Gruppe. Harte
  Obergrenze, damit kein zirkuläres Warten entsteht — **das musst du explizit
  absichern**: Ein Fahrzeug, das wartet, blockiert nie ein Fahrzeug, auf das es
  selbst wartet (Wartegraph zyklenfrei halten, sonst Warten abbrechen).

---

## 13. STÄDTE

### 13.1 Straßennetz und Baustruktur

Städte entstehen mit einem Rasternetz mit Störung: Hauptachsen alle 6–9 Tiles,
Nebenstraßen dazwischen, Ausrichtung folgt dem Höhenlinienverlauf (keine Straßen
über Steigung > 2 pro Tile).

Drei Zonen mit unterschiedlichen Gebäudetypen: **Wohnen** (erzeugt Passagiere,
verbraucht Waren/Lebensmittel), **Gewerbe** (erzeugt Post, verbraucht
Waren/Elektronik), **Industrie-Zone am Rand** (Anschlussgleise möglich). Zonen
wachsen radial mit Gewerbe im Zentrum.

### 13.2 Wachstumsformel (pro Spielmonat)

```
versorgungPass  = clamp(transportiertePassagiere / erzeugtePassagiere, 0, 1)     // letzte 12 Monate
versorgungWaren = clamp(geliefert.waren / bedarf.waren, 0, 1)
versorgungFood  = clamp(geliefert.lebensmittel / bedarf.lebensmittel, 0, 1)
versorgungBau   = clamp(geliefert.zement+baustoffe / bedarf, 0, 1)

wachstumsRate = 0.0015                                    // Basis: +0,15 %/Monat
  * (1 + 0.55*versorgungPass + 0.45*versorgungWaren + 0.45*versorgungFood + 0.35*versorgungBau)
  * gelaendeFaktor                                        // 1.0 flach, 0.6 hügelig, 0.3 gebirgig
  * (0.5 + 0.5 * firmenRating/100)

einwohnerNeu = round(einwohner * (1 + wachstumsRate))
```

Bedarf skaliert: `bedarf.waren [t/Monat] = einwohner / 900`,
`bedarf.lebensmittel = einwohner / 700`,
`bedarf.elektronik = max(0, (einwohner-3000)) / 2500`.

Neue Gebäude werden entlang bestehender Straßen platziert; wenn kein Platz,
verlängert die Stadt selbst eine Straße (max. 3 Tiles/Monat). Ohne jede
Versorgung schrumpfen Städte langsam (−0,03 %/Monat).

### 13.3 Stadtrat

* **Stadtrat-Bewertung** 0–100 pro Firma: Anzahl bedienter Stationen, Anteil
  transportierter Passagiere, Lärmbelastung (Anzahl Gleistiles im Stadtgebiet),
  abgerissene Gebäude.
* Ab 75: **exklusive Baurechte** für 12 Monate kaufbar (Konkurrenz darf im
  Stadtgebiet nicht bauen).
* Unter 25: Baugenehmigungen im Stadtgebiet werden verweigert.
* Maßnahmen zur Verbesserung: Straßen finanzieren, Bäume pflanzen,
  Werbekampagne (klein/mittel/groß) — jeweils mit Kosten, Wirkung und
  Abklingzeit.

---

## 14. WIRTSCHAFT UND FIRMA

### 14.1 Buchhaltung

Kontenrahmen (monatlich gebucht, jährlich abgeschlossen):

| Konto | Inhalt |
|---|---|
| Erlöse Personenverkehr / Güterverkehr / Post | nach Frachtart getrennt |
| Fahrzeugunterhalt | anteilig pro Monat |
| Energie/Kraftstoff | aus tatsächlicher Traktionsarbeit: `∫F_traktion·ds`, Preis je Energieträger |
| Infrastrukturunterhalt | pro Gleistile/Straßentile/Station/Modul und Monat |
| Abschreibung | linear über Lebensdauer |
| Zinsen | Kredit |
| Bau/Abriss | einmalig |
| Vertragsstrafen | Abschnitt 14.4 |

Anzeigen: **GuV** (Monat/Jahr, 2-Jahres-Vergleich), **Bilanz**,
**Cashflow-Diagramm** (letzte 24 Monate), **Firmenwert-Verlauf**.

### 14.2 Finanzierung

* Startkapital: 500.000 € (Einfach 800.000 / Normal 500.000 / Schwer 250.000).
* Kreditrahmen: `max(300.000 €, 2,5 × Jahresgewinn + 0,3 × Anlagevermögen)`,
  Obergrenze 30 Mio. €.
* Zinssatz: 4,0 % p. a. (Schwer 6,5 %), monatlich gebucht.
* **Bankrott:** 3 aufeinanderfolgende Monate mit negativem Kontostand ⇒ Warnung;
  nach 12 Monaten ⇒ Zwangsversteigerung der Fahrzeuge, dann Spielende.
* Inflation: +1,8 % pro Spieljahr auf **Einnahmen und Kosten gleichermaßen**
  (schaltbar).

### 14.3 Umwelt-Rating (moderner Twist, keine Moralkeule)

Firmen-CO₂-Wert aus gefahrenen km × `co2PerKm`. Ab Spieljahr 2000 gibt es:

* **CO₂-Abgabe** pro Tonne (steigend ab 2005),
* **Fördergelder** für Elektrifizierung und emissionsarme Flotten,
* Stadtrat-Bonus bei niedrigem Wert.

Rein wirtschaftlicher Anreiz, kein Zwang. Abschaltbar in den Spieleinstellungen.

### 14.4 Verträge und Ausschreibungen

* Städte/Konzerne schreiben 2–5 Verträge gleichzeitig aus: „Liefere 5.000 t
  Stahl nach Nordheim innerhalb von 18 Monaten".
* Annahme optional. Erfüllung ⇒ Bonus (typisch 1,5× des normalen Frachterlöses).
  Verfehlung ⇒ Konventionalstrafe (30 % der Bonussumme) und Rating-Malus.
* KI-Firmen nehmen Verträge ebenfalls an — wer zuerst liefert, gewinnt (bei
  exklusiven Verträgen).
* Vertragsliste als eigenes Panel mit Restlaufzeit, Fortschrittsbalken und
  Rentabilitätsschätzung.

---

## 15. KI-KONKURRENZ

0–5 KI-Firmen (einstellbar), 3 Schwierigkeitsstufen. Die KI ist **kein
Cheater**: Sie unterliegt exakt denselben Regeln, Preisen und Kreditgrenzen und
nutzt dieselben Commands wie der Spieler. Verboten sind Ressourcen-Boni; erlaubt
sind bessere Bewertungsfunktionen auf höheren Stufen.

**KI-Entscheidungszyklus** (alle 400 Ticks, gestaffelt damit nie zwei KIs im
selben Tick rechnen):

1. **Chancen bewerten:** Alle Paare (Quelle, Senke) mit Distanz 15–120 Tiles
   nach geschätztem Deckungsbeitrag pro investiertem Euro sortieren, unter
   Berücksichtigung bestehender Konkurrenzbedienung.
2. **Bauen:** Bestes Projekt, wenn Kapital ≥ 1,4 × geschätzte Baukosten. Nutzt
   denselben Trassen-Assistenten wie der Spieler.
3. **Optimieren:** Unrentable Linien schließen, überlastete Linien verstärken,
   veraltete Fahrzeuge ersetzen.
4. **Reagieren:** Wenn der Spieler eine Strecke der KI unterbietet, senkt sie
   nicht die Preise (die sind global), sondern verstärkt die Frequenz oder
   erschließt neue Quellen.

**Persönlichkeiten** (zufällig zugewiesen, im Firmenprofil sichtbar):
*Schienenfokus*, *Straßenfokus*, *Expansiv/riskant*, *Konservativ/schuldenarm*,
*Städtenetz-Spezialist*. Das macht Konkurrenten unterscheidbar und Partien
verschieden.

**Kein Sabotage-System.** Es fühlt sich in Tests regelmäßig unfair an und ist
nicht nachvollziehbar. Konkurrenz findet über Baurechte, Frequenz und
Stadtrat-Gunst statt.

---

## 16. GRAFIK, DARSTELLUNG UND ASSET-PIPELINE

### 16.1 Isometrische Projektion (exakt)

```ts
const TILE_W = 64, TILE_H = 32, HEIGHT_PX = 16;
screenX = (tileX - tileY) * (TILE_W / 2);
screenY = (tileX + tileY) * (TILE_H / 2) - height * HEIGHT_PX;
// Rückprojektion (für Mausposition) – iterativ über Höhen absteigend prüfen,
// weil hohe Tiles im Vordergrund niedrige verdecken.
```

**Zeichenreihenfolge:** streng nach `(tileX + tileY)` aufsteigend, innerhalb
gleicher Summe nach `height`, dann nach Layer-Priorität. Fahrzeuge werden in die
Tile-Reihenfolge einsortiert, nicht als eigener Layer obendrauf gezeichnet —
sonst fahren Züge sichtbar durch Berge.

**Zoomstufen:** 0,25× / 0,5× / **1,0×** / 2,0× / 4,0× (Zweierpotenzen für
saubere Pixel). Ab 0,5× werden Details (Fahrzeugdekor, Gebäudefenster)
weggelassen; ab 0,25× rendert die Karte als abstrahierte Übersicht (nur Terrain
+ Netz + Fahrzeugpunkte).

**Chunking:** Terrain wird in 32×32-Tile-Chunks als `RenderTexture` gebacken und
nur bei Änderung neu gezeichnet. Sichtbarkeitsprüfung über AABB der Kamera. Ohne
Chunking bringst du 1 Mio. Tiles nicht auf 60 fps.

### 16.2 Asset-Pipeline (löst das „woher kommen die Grafiken"-Problem)

**Es werden keine Grafiken beschafft.** Alle Sprites werden zur Build-Zeit
prozedural erzeugt:

* `tools/bake-sprites.ts` liest deklarative Beschreibungen
  (`{form: 'quader', maßeM:[21,3.2,4.1], farben:[...], details:[...]}`), rastert
  sie mit einem eigenen, kleinen isometrischen Software-Rasterizer (Node +
  `canvas`) in PNG-Atlanten pro Zoomstufe und schreibt `src/assets/atlas-*.json`
  + `.png`.
* Vorteil: Ein neues Fahrzeug = 12 Zeilen Daten, keine Grafikarbeit, konsistente
  Optik, deterministisch reproduzierbar.
* Ausgabe: Atlanten ≤ 4096×4096 px, mehrere pro Kategorie.
* Der Bake-Schritt läuft in `npm run assets` und ist **nicht** Teil des
  Dev-Servers (nur bei Datenänderung).

### 16.3 Farbpalette (verbindlich, damit es zusammenpasst)

```
Terrain:   Wiese #6f9b58 · Acker #b09a4e · Wald #3f6b3a · Fels #8a8578 · Schnee #e8eef2
           Wüste #d6bc86 · Wasser flach #4a86a8 · Wasser tief #2c5a78 · Moor #5a6b4a
Infra:     Gleis #6b6560 · Schotter #9a938a · Straße #4a4a4d · Beton #b8b4ac
Firmen:    8 kräftige, farbenblindsichere Töne (Okabe-Ito-Palette)
UI:        Grundfläche #1c2128 · Karte #262c34 · Rand #39414c
           Text #e6e9ee · gedämpft #9aa3ae · Akzent #f08020 · Erfolg #4caf7d · Warnung #e0b040 · Fehler #d9534f
```

Beleuchtung: Tageszeitwechsel als sanfte Farbmodulation über den ganzen Canvas
(nicht per Sprite), Zyklus = 1 Spieltag. Nachts leuchten Fenster und Signale.
Abschaltbar.

### 16.4 Kamera

Rechte Maustaste ziehen = schwenken, Mausrad = zoomen (zum Cursor),
`WASD`/Pfeile = schwenken, Mittelklick = Zentrieren. Trägheitsloses Schwenken
(kein Smoothing — es macht Präzisionsbau unangenehm). Kartenrand begrenzt, keine
Endlosschwenks ins Leere.

---

## 17. BENUTZEROBERFLÄCHE

### 17.1 Layout

* **Oben:** Statusleiste — Firmenname, Datum, Kontostand, Kredit, Firmenwert,
  Geschwindigkeitsregler, Pause.
* **Links:** vertikale Werkzeugleiste — Schiene, Straße, Wasser, Luft,
  Stationen, Terraforming, Abriss, Karten-Overlays.
* **Rechts:** kontextuelles Detail-Panel (Fahrzeug, Station, Stadt, Industrie,
  Linie) — andockbar, ausblendbar.
* **Unten rechts:** Minimap mit umschaltbaren Modi (Terrain / Netz / Besitzer /
  Frachtfluss / Höhenlinien).
* **Unten links:** Nachrichtenlog, Klick springt zum Ereignis, filterbar nach
  Kategorie.
* Alle Listenpanels (Fahrzeuge, Linien, Stationen, Städte, Industrien) mit
  **Sortierung, Filter und Volltextsuche**. Bei 400 Fahrzeugen ist das kein
  Luxus, sondern Voraussetzung zum Spielen.

### 17.2 Tastaturbelegung (Vollständige Bedienung ohne Maus außer beim Bauen)

| Taste | Funktion |
|---|---|
| `Leertaste` | Pause / Weiter |
| `1`–`4` | Geschwindigkeit 1× / 2× / 5× / 20× |
| `R` / `S` / `W` / `F` | Bauen: Schiene / Straße / Wasser / Flug |
| `G` | Signal-Werkzeug |
| `B` | Bahnhof/Station |
| `D` | Depot |
| `X` | Abriss |
| `M` | Manueller Bau-Modus (Assistent aus) |
| `Strg`+`Z` / `Strg`+`Y` | Rückgängig / Wiederholen (letzte 50 Bau-Commands) |
| `V` / `L` / `T` / `I` | Listen: Fahrzeuge / Linien / Städte / Industrien |
| `F1` | Hilfe · `F3` Debug-Overlay · `F5` Schnellspeichern · `F9` Schnellladen |
| `Entf` | Ausgewähltes Objekt entfernen |
| `Esc` | Werkzeug abbrechen / Menü |

### 17.3 Bau-Feedback (verhindert die häufigste Frustquelle)

Beim Ziehen einer Trasse **live** eingeblendet: Kosten, Länge, max. Steigung,
engster Radius, resultierende Höchstgeschwindigkeit, Anzahl Brücken/Tunnel.
Unzulässige Abschnitte rot, teure gelb. Kein Bau ohne Bestätigung. Jeder
abgelehnte Bau nennt **den konkreten Grund** („Steigung 35 ‰ überschreitet
Maximum 30 ‰ für diesen Gleistyp"), nie ein generisches „Hier kann nicht gebaut
werden".

### 17.4 Zugänglichkeit

* UI-Skalierung 100 / 125 / 150 / 200 %.
* Farbenblind-Modus: alternative Firmen- und Frachtpaletten + Musterung
  (Schraffuren) auf Kartenoverlays.
* Alle Tooltips erklären **Wirkung**, nicht nur den Namen.
* Vollständige Tastaturnavigation in allen Panels (Tab-Reihenfolge, Fokusring).
* Keine reinen Farbcodierungen ohne zusätzliches Symbol.

### 17.5 Tutorial

Fünf interaktive Lektionen, jeweils 3–6 Minuten, mit gescripteten Zielen und
Erfolgsprüfung:

1. Kamera, Zeit, erste Buslinie zwischen zwei Städten.
2. Erste Bahnstrecke mit Trassen-Assistent, Bahnhof, Zug, Auftragsliste.
3. Signale: Warum steht der zweite Zug? Blocksignale, Ausweichstelle,
   Pfadsignal im Bahnhofskopf.
4. Produktionskette: Wald → Sägewerk → Stadt, Frachtverfall, Kühlkette.
5. Umschlagpunkt: Lkw-Zubringer auf Güterzug, Verbundstation, Taktfahrplan.

Zusätzlich: durchsuchbares In-Game-Handbuch (`F1`) mit Diagrammen für jedes
Signalschema.

---

## 18. AUDIO

Alles über die WebAudio-API **synthetisiert** — keine Audiodateien im MVP:

* **Effekte:** Dampfpfeife (Sägezahn + Rauschen, Hüllkurve), Diesel-Leerlauf
  (gefiltertes Rauschen + LFO), E-Lok-Anfahrsurren (Frequenzrampe gekoppelt an
  `v`), Bau-Klack, Kasse (Erlös), Warnton (Panne/Deadlock).
* **Räumlichkeit:** `PannerNode` an der Bildschirmposition, Lautstärke fällt mit
  Zoom-Distanz. Maximal 12 gleichzeitige Fahrzeug-Loops (nächste am Cursor),
  sonst rauscht es.
* **Musik:** Slot vorbereitet (`assets/music/`), Playlist-Steuerung +
  Lautstärkeregler in den Optionen. Es werden **keine** Musikstücke mitgeliefert
  oder beschafft — der Ordner ist für eigene Dateien des Spielers dokumentiert.
* Separate Regler für Effekte, Umgebung, Musik, UI. Standard: Musik 0 %, Effekte
  60 %.

---

## 19. SPEICHERN, LADEN, TESTS

### 19.1 Savegame

* Format: **MessagePack + zlib**, Endung `.ironsave`.
* Aufbau:
  `{magic:'IRVN', saveVersion:number, gameVersion:string, seed:number, tick:number, state:{...}, commandLog?:Uint8Array}`
* Ablage: `%APPDATA%/IronVeins/saves/`. Autosave alle 6 Spielmonate in einen
  5er-Ringpuffer, getrennt von manuellen Saves.
* **Migrationen:** `src/sim/save/migrations/v{N}_to_v{N+1}.ts`. Bei **jeder**
  Feldänderung im Sim-State wird `SAVE_VERSION` erhöht **und** eine Migration
  geschrieben. Ein Test lädt für jede historische Version eine mitgelieferte
  Fixture-Datei und prüft auf lauffähigen Zustand. Ohne diese Regel ist das
  Projekt ab Meilenstein 5 nicht mehr wartbar.
* Ladezeit für ein 1024²-Save mit 1.500 Fahrzeugen: **≤ 3 s**.

### 19.2 Replay

Jedes Spiel schreibt `{seed, commandLog}` mit. Ein Replay spielt die
Command-Folge tickgenau nach. Genutzt für Determinismus-Tests und für
Fehlerberichte („Replay anhängen").

### 19.3 Determinismus-Test (Pflicht ab M0)

```
npm run test:determinism
```

* Lädt Seed 424242, spielt 50.000 Ticks mit einem festen Command-Log aus
  `tests/determinism/fixtures/`.
* Bildet nach den Ticks 1.000 / 10.000 / 50.000 einen **FNV-1a-64-Hash** über:
  alle Fahrzeug-Arrays, alle Tile-Arrays, alle Frachtstapel, alle Firmenkonten,
  den RNG-Zustand.
* Drei Läufe im selben Prozess und ein Lauf nach Save→Load→Weiterspielen müssen
  **identische Hashes** liefern.
* **Dieser Test läuft ab M0 in CI und darf nie rot sein.** Wenn er rot wird, ist
  das die Arbeit mit oberster Priorität — Determinismus lässt sich nicht
  nachträglich reparieren.

### 19.4 Balancing-Tests (verhindern eine kaputte Wirtschaft)

```
npm run test:balance
```

Automatisierte Referenzszenarien ohne UI, jeweils mit Toleranzband. Wenn ein
Test außerhalb liegt, **passt du die Konstanten an, nicht den Test**:

| Szenario | Erwartung |
|---|---|
| Erste Buslinie, 2 Städte à 1.200 Einw., Abstand 25 Tiles, 2 Busse | Amortisation **2–4 Spieljahre** |
| Erste Bahnlinie Kohlemine → Kraftwerk, 45 Tiles, 1 Zug 8 Wagen | Amortisation **4–7 Spieljahre** |
| Vollausgebaute Kette Wald→Sägewerk→Stadt, 3 Linien | Gewinn/Jahr **80.000–200.000 €** |
| Passives Nichtstun mit Startkapital, 10 Jahre | Bankrott zwischen Jahr **6 und 9** (Unterhalt frisst Kapital) |
| KI „Normal" allein auf 512²-Karte, 25 Jahre | Firmenwert **5–25 Mio. €** |
| Kohlemine ohne Abtransport | Schließt nach **24±1 Monaten** |

### 19.5 Weitere Testpflichten

* **Unit:** Einnahmenformel (Testfall aus 7.5), Fahrzeugphysik (Bremsweg,
  Steigungsverhalten), Blocksegmentierung, PBS-Reservierung/-Freigabe,
  Wegfindung auf Referenznetzen, Stadtwachstum, Industrieproduktion,
  Save-Migrationen.
* **Regressionsnetz:** Ein handgebautes Testnetz
  (`tests/fixtures/net-complex.json`) mit Kreuzung, Ausweiche, doppeltem
  Bahnhofskopf, Wendezug. 20 Züge, 5.000 Ticks, **null Kollisionen, null
  Deadlocks**.
* **Performance-Test:** siehe 21.
* **UI-Smoke (Playwright):** App startet, neues Spiel, Straße bauen, Bus kaufen,
  speichern, laden, beenden — ohne Konsolenfehler.

---

## 20. MEILENSTEINE

Jeder Meilenstein endet mit: alle Tests grün · `npm run build` fehlerfrei ·
Eintrag in `DECISIONS.md` · Git-Commit mit aussagekräftiger Nachricht · kurze
Zusammenfassung an den Nutzer, was jetzt spielbar ist.

**Am Ende jedes Meilensteins muss das Spiel startbar und in dem erreichten
Umfang spielbar sein.** Nie ein Zwischenstand, der nicht läuft.

---

### M0 — Fundament

Projekt-Setup (Vite, TS strict, ESLint mit der Import-Sperre aus Regel 1,
Vitest, Tauri-Shell, COOP/COEP-Header). Worker-Bootstrap mit 20-Hz-Tick,
SharedArrayBuffer-Doppelpuffer, seeded RNG, Sin/Cos-LUT, Command-Queue,
FNV-1a-State-Hash, Determinismus-Test-Gerüst. Leeres Fenster mit laufendem
Tickzähler und Speed-Regler. `CLAUDE.md` und `DECISIONS.md` anlegen.

**Fertig, wenn:** `npm run tauri dev` öffnet ein Fenster, Tickzähler läuft,
`test:determinism` grün, ESLint verbietet nachweislich Pixi-Import in
`src/sim/`.

### M1 — Welt und Darstellung

Kartengenerierung (Abschnitt 6) komplett. Iso-Renderer mit Chunking, 5
Zoomstufen, Kamera, Minimap, Tile-Auswahl per Maus inkl. korrekter
Höhen-Rückprojektion. Terraforming (heben/senken/planieren) mit Kosten.
Sprite-Bake-Pipeline für Terrain.

**Fertig, wenn:** 1024²-Karte in ≤ 8 s erzeugt, flüssiges Schwenken/Zoomen bei
60 fps, Mausposition trifft in bergigem Gelände das richtige Tile.

### M2 — Erste geschlossene Wirtschaftsschleife

Städte mit Straßennetz und Passagiererzeugung. Straßenbau, Bushaltestellen,
Depots, Busse mit Wegfindung und Auftragsliste. Frachtstapel, Be-/Entladen,
Einnahmenformel, Firmenkonto, monatliche Buchung, Kredit.

**Fertig, wenn:** Man kann zwei Städte per Buslinie verbinden und damit Geld
verdienen. `test:balance`-Szenario 1 im Toleranzband.

### M3 — Schiene

Gleisbau (manuell + Trassen-Assistent), Brücken, Tunnel, Bahnhöfe mit
Bahnsteigmodulen, Depots, Zugzusammenstellung, Längsdynamik, Zug-Wegfindung,
Elektrifizierung.

**Fertig, wenn:** Ein Zug fährt eine gebaute Strecke inkl. Steigung und Kurven
physikalisch plausibel ab; die Bau-Vorschau zeigt korrekte Kosten und
Geschwindigkeitsgrenzen.

### M4 — Signale

Blocksegmentierung, alle vier Signaltypen, PBS-Reservierung,
Zuglänge/Zugschluss, Bremswegvorschau, Deadlock-Erkennung, Auto-Signalisierung,
`F3`-Overlay.

**Fertig, wenn:** Das Regressionsnetz aus 19.5 mit 20 Zügen 5.000 Ticks
kollisions- und deadlockfrei läuft.

### M5 — Industrie und Fracht

Alle 18 Frachttypen, alle Produktionsketten, Industrie-Mechanik inkl. Ausbau und
Schließung, Fracht-Routing über Umschlagpunkte, Verderblichkeit, Kühlketten,
Stationsbewertung, Verbundstationen.

**Fertig, wenn:** Eine Kette Wald→Sägewerk→Stadt mit Lkw-Zubringer auf Güterzug
funktioniert und korrekt anteilig abrechnet.

### M6 — Wirtschaftstiefe

Vollständige Buchhaltung (GuV, Bilanz, Cashflow, Firmenwert), Abschreibung,
Energiekosten aus Traktionsarbeit, Fahrzeugalterung, Pannen, Autoerneuerung,
Inflation, Bankrott. Alle Listenpanels mit Sortierung/Filter/Suche.

**Fertig, wenn:** Alle Szenarien aus `test:balance` im Toleranzband.

### M7 — Wasser und Luft

Häfen, Kais, Schiffe, Kanäle/Schleusen, Flughäfen (3 Größen), Flugzeuge,
Warteschleifen, Landebahn-Queue, Container als Übersee-Fracht, multimodale Hubs.

**Fertig, wenn:** Eine Lieferkette Lkw → Zug → Schiff → Lkw über die halbe Karte
durchläuft und korrekt bezahlt wird.

### M8 — Gegenspieler und Ziele

KI-Firmen mit Persönlichkeiten, Stadtrat und Baurechte,
Verträge/Ausschreibungen, Umwelt-Rating und CO₂-Abgabe,
Stadtwachstums-Feinschliff, Nachrichtenlog mit allen Ereignisklassen.

**Fertig, wenn:** Eine 25-Jahres-Partie gegen 3 KIs ohne Spielereingriff
durchläuft und die KIs plausible, unterscheidbare Netze bauen.

### M9 — Fertigstellung

Tutorial (5 Lektionen), In-Game-Handbuch, Optionsmenü (Grafik, Audio,
Zugänglichkeit, Steuerung, Spielregeln), Save/Load-UI mit Vorschaubild,
Autosave, Migrationen, Audio-Synthese, i18n de/en vollständig, Tauri-Installer
(MSI + NSIS) mit Icon und Versionierung, `README.md`,
Performance-Endabnahme.

**Fertig, wenn:** Die MSI installiert auf einem frischen Windows-11-System und
eine Partie von 1950 bis 2050 ohne Absturz und ohne Speicherleck durchgespielt
werden kann.

---

## 21. PERFORMANCE-BUDGETS (harte Abnahmekriterien)

Referenzsystem: 4 Kerne, 16 GB RAM, integrierte GPU (bewusst schwach gewählt).

| Messgröße | Grenze |
|---|---|
| Sim-Tick bei 1.500 Fahrzeugen / 1024² / 120 Städte / 300 Industrien | **≤ 8 ms p99** |
| Bildrate bei 4.000 sichtbaren Sprites, Zoom 1,0 | **≥ 60 fps** |
| Bildrate bei Zoom 0,25 (halbe Karte sichtbar) | **≥ 45 fps** |
| Speicherverbrauch nach 100 Spieljahren | **< 1,5 GB**, kein monotones Wachstum über 3 h |
| Kartengenerierung 1024² | **≤ 8 s** |
| Save schreiben / laden | **≤ 2 s / ≤ 3 s** |
| Kaltstart bis Hauptmenü | **≤ 3 s** |
| Wegfindung eines Zuges (Cache-Miss) | **≤ 2 ms** |

`npm run test:perf` misst diese Werte automatisiert und schlägt bei
Überschreitung fehl. Optimiere **nur** gegen Messwerte, nie gegen Bauchgefühl.

---

## 22. FEHLERKATALOG — was in diesem Projekt garantiert schiefgeht

Diese Liste ist aus genau den Fallstricken zusammengestellt, die Projekte dieser
Art typischerweise zum Scheitern bringen. Lies sie vor jedem Meilenstein noch
einmal.

1. **Sim greift auf Rendering zu.** Passiert schleichend („nur kurz
   `window.innerWidth` prüfen"). Deshalb die ESLint-Sperre in M0 — nicht später.
2. **Determinismus zu spät.** Ein einziges `Math.random()` in der
   Kartengenerierung macht Saves und Replays kaputt, und man merkt es erst in
   M7. Der Test läuft ab M0.
3. **Zeit-Verwechslung.** Fahrzeugbewegung in Spielzeit statt Ticks (Abschnitt
   5.2). Klassiker.
4. **Netzgraph-Neuaufbau bei jedem gelegten Gleis.** Fühlt sich bei 50 Tiles
   super an und friert bei 5.000 ein. Von Anfang an inkrementell.
5. **Objekt-Allokation im Tick.** 1.500 Fahrzeuge × 20 Hz × ein `.map()` =
   30.000 Arrays/s = ständige GC-Ruckler. Struct-of-Arrays und `for`-Schleifen.
6. **Geld als Float.** `0.1 + 0.2` bricht dir die Buchhaltung und den
   Determinismus. Ganzzahlige Cent.
7. **Fahrzeug ohne Bremswegvorschau.** Zug bremst zu spät, überfährt Signale,
   Kollisionen. `s_brems` jeden Tick prüfen.
8. **PBS-Freigabe am Pfadende statt kantenweise.** Halbiert den Durchsatz und
   sieht nach einem Bug aus.
9. **Zuglänge ignoriert.** Ein Zug, der als Punkt behandelt wird, „verschwindet"
   im Signalsystem und kollidiert an Weichen.
10. **Industrieproduktion pro Tick statt pro Monat.** 20× zu viel Fracht und
    sinnlose CPU-Last.
11. **Save ohne Versionierung.** Nach vier Feldänderungen sind alle Testsaves
    unbrauchbar. Version + Migration bei **jeder** Änderung.
12. **SharedArrayBuffer ohne COOP/COEP.** Läuft im Dev, bricht im Tauri-Build
    (oder umgekehrt). In M0 beide Umgebungen prüfen.
13. **Rekursive Netz-Traversierung.** Stack Overflow ab ~10.000 Kanten. Immer
    iterativ.
14. **Nicht-totaler Sortier-Comparator.** `sort()` ist engineabhängig instabil
    bei Gleichstand ⇒ Determinismusbruch. Immer nach ID als letztem Kriterium
    sortieren.
15. **`Math.sin/pow` in der Sim.** Nicht exakt spezifiziert. LUT verwenden
    (Regel 4).
16. **Textkonstanten im Code statt i18n.** In M8 nachrüsten kostet Tage. Ab M0
    alles über `t()`.
17. **Sprite-Zeichenreihenfolge ohne Höhenberücksichtigung.** Züge fahren durch
    Berge. Sortierung nach `(x+y, height, layer)`.
18. **Auto-Deadlock-Auflösung eingebaut.** Nimmt dem Spiel die Lernkurve und
    versteckt echte Bugs. Nur anzeigen, nie automatisch lösen.
19. **KI, die schummelt.** Wird von Spielern sofort erkannt und ruiniert die
    Glaubwürdigkeit. Gleiche Regeln, gleiche Commands.
20. **Balancing per Bauchgefühl.** Ohne die Tests aus 19.4 kippt die Wirtschaft
    bei jeder Katalogänderung.
21. **Echte Markennamen.** Rechtsrisiko. Ausschließlich generische
    Typenbezeichnungen.
22. **Zu frühes Polieren.** Keine Partikeleffekte, Wettersysteme oder
    Cockpit-Ansichten vor M9. Erst muss die Wirtschaftsschleife stimmen.

---

## 23. ARBEITSWEISE

1. **Vor jedem Meilenstein:** Kurzer Plan (max. 10 Zeilen) mit den Dateien, die
   du anlegst/änderst. Dann arbeiten, nicht diskutieren.
2. **Konstanten ausschließlich in `src/sim/constants.ts`** — kommentiert mit
   Einheit und Herkunft. Keine Magic Numbers im Code, keine Ausnahmen.
3. **Kommentare erklären das Warum, nicht das Was.** Jede nicht offensichtliche
   Formel bekommt eine Herleitung oder Quelle als Kommentar.
4. **Code, Kommentare, Commit-Messages und Bezeichner auf Englisch. Alle
   Spieltexte über i18n mit deutschem und englischem Katalog.** Deine
   Zusammenfassungen an den Nutzer auf **Deutsch**.
5. **Ein Commit pro abgeschlossenem Meilenstein**, plus Zwischencommits bei
   größeren Teilschritten. Nachrichtenformat:
   `feat(m3): rail construction assistant with bridge/tunnel autoplacement`.
6. **Tests schreibst du zusammen mit dem Feature, nicht danach.** Ein Feature
   ohne Test ist nicht fertig.
7. **Nach jedem Meilenstein:** Kurzbericht auf Deutsch — was ist jetzt spielbar,
   welche Zahlen hat der Balancing-Test geliefert, welche Entscheidungen sind in
   `DECISIONS.md` gelandet, was kommt als Nächstes.
8. **Wenn etwas nicht funktioniert:** Sag es klar mit der konkreten
   Fehlermeldung. Keine kaschierten Teilerfolge, keine „läuft
   grundsätzlich"-Formulierungen.
9. **`CLAUDE.md` hältst du aktuell** — die 10 Architektur-Gesetze, die
   Projektstruktur, die Testbefehle. Damit jede künftige Session sofort im Bild
   ist.

---

## 24. ABNAHME — wann das Projekt fertig ist

- [ ] `npm run tauri build` erzeugt eine MSI, die auf einem frischen Windows 11
      ohne Abhängigkeiten installiert und startet.
- [ ] Neues Spiel auf 1024², 3 KI-Gegner, gemäßigtes Klima, spielbar von 1950
      bis 2050 ohne Absturz.
- [ ] Alle vier Verkehrsträger nutzbar, multimodale Umschlagpunkte funktionieren
      nachweislich.
- [ ] `test:determinism`, `test:balance`, `test:perf`, Unit- und
      Playwright-Tests grün.
- [ ] Alle Performance-Budgets aus Abschnitt 21 eingehalten und gemessen
      dokumentiert.
- [ ] Speichern/Laden über alle Save-Versionen hinweg lauffähig
      (Migrationstest grün).
- [ ] Tutorial vollständig durchspielbar, In-Game-Handbuch vollständig.
- [ ] Deutsch und Englisch vollständig, kein hartkodierter Anzeigetext im Code.
- [ ] Keine Konsolenfehler und keine Warnungen im Release-Build.
- [ ] Kein `TODO`, kein `any`, kein `@ts-ignore`, kein auskommentierter Code im
      Repo.
- [ ] `README.md` mit Systemanforderungen, Steuerung, Build-Anleitung und
      Spielerklärung.

---

## 25. BEGINNE JETZT

Bestätige in **drei Sätzen**, dass du den Auftrag verstanden hast, und nenne
dabei die drei Punkte, die du für das größte Risiko hältst. Dann leg mit
**Meilenstein M0** los und arbeite ihn vollständig ab.

Frag nicht, ob du anfangen sollst. Fang an.
