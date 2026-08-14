# Änderungsverlauf

Alle nennenswerten Änderungen an Iron Veins, aus der Sicht dessen, der das Spiel
spielt. Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionsnummern folgen [Semantic Versioning](https://semver.org/lang/de/).

**Diese Datei ist mit Absicht auf Deutsch, und sie bleibt es.** Der Besitzer des
Projekts liest Deutsch; der Code, die Kommentare, die Bezeichner und die
Commit-Nachrichten bleiben genauso absichtlich Englisch, weil `CLAUDE.md` das als
Regel festlegt. Wer diese Datei „korrigiert“, indem er sie übersetzt, repariert
nichts, sondern nimmt dem einzigen Leser, für den sie geschrieben ist, das
Dokument weg. Die beiden anderen Erzähldokumente des Projekts — `DECISIONS.md`
(warum etwas so entschieden wurde) und `CLAUDE.md` (was beim Bauen schiefging) —
sind für Entwickler geschrieben und bleiben Englisch. Diese hier ist für den
Spieler und den Besitzer.

Wo hinter einer Aussage eine Messung steht, ist der Eintrag in `DECISIONS.md` in
Klammern genannt (`D-228` und so weiter). Man braucht ihn nicht, um den Satz zu
verstehen; er ist da, damit man nachrechnen kann.

---

## [2.0.0] — vorgeschlagen, noch nicht getaggt (Stand 2026-08-13)

Das ist der heutige Stand des Baums: das vollständige Grundspiel plus die
vollständige Expansion, 263 Entscheidungseinträge und 115 Commits weit. **Es ist
noch keine Veröffentlichung.** Es existiert kein Git-Tag, es wurde nie ein
Installer ausgeliefert, und `RELEASE.md` sagt, warum das richtig ist: Ein Tag
baut die Installer und legt einen **Entwurf** einer Veröffentlichung an;
freigeben ist eine Entscheidung des Besitzers, und drei Punkte davor — Lizenz,
Namensrecht, Datenschutzhinweis — hat noch niemand entschieden.

Warum 2.0.0 und nicht 0.2.0 oder 1.0.0:

- Der Auftrag der Expansion heißt in seiner eigenen Überschrift „v1 → v2“, und
  seine Abnahmeliste prüft ausdrücklich, ob „ein v22-Save aus v1.0“ noch lädt.
  Die Spezifikation benennt also selbst zwei Generationen: M0–M9 ist 1.0, M10–M25
  ist 2.0. Eine andere Zahl müsste erklären, warum sie von der Abnahme abweicht.
- Eine Version ist in diesem Projekt kein Werbeversprechen, sondern ein
  Wiedererkennungszeichen. `RELEASE.md` begründet den Gleichlauf der drei
  Versionsdateien damit, dass „die Version in einem Fehlerbericht sonst nichts
  wert ist“. Genau dafür taugt 0.1.0 nach zwei kompletten Spezifikationen nicht
  mehr: Jeder Spielstand, jede Aufzeichnung und jedes Absturzpaket trägt diese
  Zahl mit sich, und heute bedeutet sie nichts.
- 2.0.0 behauptet **nicht**, dass das Spiel verkauft werden kann. Das steht in
  `RELEASE.md`, hängt an den drei Besitzer-Entscheidungen und ist von der
  Versionsnummer unabhängig.

Ein Zusatz aus dem Werkzeug selbst: `npm run version:sync` akzeptiert
ausschließlich dreiteilige Zahlen. Eine ehrliche Vorab-Kennzeichnung wie
`2.0.0-rc.1` ist mit der heutigen Release-Kette **nicht** ausdrückbar (und ein
Windows-Installer könnte sie ohnehin nicht führen). Dass hier noch nichts
veröffentlicht ist, sagen daher dieser Abschnitt und der Entwurfsstatus der
Veröffentlichung — nicht die Zahl.

Die sechzehn Meilensteine der Expansion stehen unten nicht als sechzehn
Überschriften. Ein Meilenstein ist eine Bauetappe und keine Auslieferung — wer
das Spiel spielt, merkt nicht, dass „die Bühne“ und „die lebenden Züge“ zwei
davon waren. Gruppiert ist deshalb nach dem, was zusammen beim Spielen auffällt:
sieben Gruppen, jede mit den Meilensteinen in Klammern, aus denen sie stammt. Der
erste Meilenstein der Expansion (M10) kommt in keiner davon vor, weil er nichts
hinzugefügt, sondern aufgeräumt hat — er steht unter „Geändert“ und „Behoben“.
Wer die Bauetappen einzeln nachlesen will, findet sie in `CLAUDE.md`.

### Hinzugefügt

#### Fahrpläne statt Fuhrpark (M11)

- **Linien.** Mehrere Fahrzeuge teilen sich eine Auftragsliste. Man ändert die
  Linie, nicht zwölf Fahrzeuge. `L` öffnet die Linienübersicht, jede Linie führt
  ihre eigene Gewinn- und Verlustrechnung.
- **Aufträge, die mehr können als „fahre nach“.** Wegpunkte zwingen einen Zug auf
  eine bestimmte Strecke, ohne dass er dort hält. Bedingte Sprünge („wenn voll“,
  „wenn leer“, „nach Wartezeit“) machen aus einer Auftragsliste einen Plan.
  Depot-Aufträge sind ein Servicehalt und kein Endpunkt.
- **Taktfahrplan.** Eine Linie bekommt einen Taktpunkt; die Fahrzeuge halten ihren
  Abstand, statt sich zu Trauben zu ballen. An Umsteigeknoten kann ein Fahrzeug
  auf den Anschluss warten, ohne dass sich zwei Linien gegenseitig blockieren.
- **Automatische Erneuerung pro Linie** statt für die ganze Firma.
- **Ein Flottenberater sagt, wie viele Fahrzeuge eine Linie braucht** — und die
  Konkurrenz benutzt denselben Berater, dieselben Linien und dieselben Befehle
  wie der Spieler.

#### Die Bühne: die Welt bekommt ein Gesicht (M12, M13)

- **Echte Objekte statt weißer Kisten.** Fahrzeuge, Häuser, Industrien, Bäume und
  alle dreizehn Stationsbauten werden aus freien 3D-Bausätzen zur **Bauzeit** in
  Sprites gebacken, in acht Blickrichtungen und in Firmenfarbe. Im Repository
  liegt weiterhin kein einziges Bild — wer ohne Bausatz-Zwischenspeicher baut,
  bekommt die gezeichnete Optik und eine Warnung, und das Spiel startet immer.
- **Flüssige Bewegung.** Die Simulation rechnet 20-mal je Sekunde, gezeichnet wird
  mit 60 Bildern je Sekunde dazwischen — ohne dass ein Zug jemals über ein rotes
  Signal hinausrutscht.
- **Zehn Wagen sind zehn Wagen.** Ein Zug fährt als Zug, und die Wagen folgen dem
  Weg, den die Lok wirklich genommen hat.
- **Tag und Nacht.** Fenster gehen an, Straßenlaternen brennen, Fahrzeuge haben
  Scheinwerfer. Ein arbeitendes Werk raucht dicht, ein ruhendes gar nicht — man
  sieht auf einem Standbild, welche Fabrik läuft.
- **Signalbilder am Mast, Oberleitung über elektrifizierten Strecken**, Abzeichen
  über Fahrzeugen, die stehen, kaputt sind oder keinen Auftrag haben.
- **Wasser bewegt sich**, Küsten haben Schaum, und die Karte ist beschriftet:
  Orts- und Stationsnamen, die einander niemals überdecken — sie verschwinden
  lieber.
- **Die Übersichtskarte zeigt den Kameraausschnitt** und lässt sich ziehen.
  Weit herausgezoomt wird aus der Welt ein Netzplan mit Fahrzeugpunkten, die man
  anklicken kann.
- **Straßen sehen aus wie Straßen**: Sie hängen zusammen, haben Bordstein und
  Mittelstrich, und eine Kreuzung ist eine Kreuzung. Der Boden hat Struktur,
  Licht und Schatten statt drei flacher Farbflächen, und ein Wald ist eine Dichte
  mit Lichtungen statt eines Teppichs.

#### Instrumente: man sieht, warum eine Linie verliert (M14, M15)

- **Frachtfluss-Atlas** (`A`): gebogene Pfeile über der Karte, Breite gleich
  gemessenes Volumen, Farbe gleich Firma oder Linie. Wer wohin fährt, ist keine
  Vermutung mehr.
- **Stations-Röntgenbild.** Alle fünf Bestandteile der Stationsbewertung einzeln
  beziffert, und der größte Verlustposten wird benannt. Der Einzugsbereich wird
  angezeigt, **bevor** man baut.
- **Statistikzentrum**: Firmenwert über die Jahre, Cashflow, und je Station die
  Monatshistorie aus abgeholt / geliefert / verfallen.
- **Fahrzeugdetail** mit dem Unterhalt genau dieses Fahrzeugs, der Ladung samt
  bereits bezahlter Strecke, dem Pannenzähler und einem Depot-Ruf. Die Kamera kann
  einem Fahrzeug folgen.
- **Erklärungen an jedem Werkzeug und jeder wichtigen Zahl** — mit der Mechanik
  dahinter, nicht nur mit dem Namen.
- **Benachrichtigungen sind einstellbar**, je Kategorie: aus, Laufband, Einblendung
  oder Pause.
- **Netzwert als Prozentzahl**, je Linie und für die Firma: verdientes Geld
  gemessen an dem, was diese Fahrzeuge auf diesem Netz überhaupt verdienen
  könnten.
- **Straßenverkehr staut sich** (Weltregel): Fahrzeuge bremsen einander, ein
  Bahnübergang schließt, wenn ein Zug kommt, und eine Engpass-Heatmap zeigt, wo
  es klemmt.
- **Eine Verklemmung wird benannt** — mit Zug und Kachel, statt dass man sie
  suchen muss.

#### Beweise, Ziele und ein Spielende (M16, M17)

- **Jeder Spielstand ist ein Film.** Ein Klick macht aus einem Save eine
  Aufzeichnung, die man abspielen, an den Jahresmarken entlangschieben und
  zurückspulen kann.
- **„Replay prüfen“ antwortet mit einem Urteil**, nicht mit einer Zahl: geprüft,
  abgewichen bei Tick X (mit Nachweis), abgewichen irgendwo zwischen zwei Marken
  (mit dem Grund, warum es nicht genauer geht) oder: die Datei widerspricht sich
  selbst.
- **Ein Fehlerbericht enthält eine Aufzeichnung der Sitzung**, nicht nur eine
  Fehlermeldung. Er wird auf die eigene Festplatte geschrieben und niemals
  irgendwohin gesendet.
- **Ziele und Medaillen.** Bronze, Silber, Gold, im Spiel entschieden und deshalb
  in einer Aufzeichnung nachweisbar.
- **Acht Szenarien** mit Briefings, deren Zahlen und Ortsnamen nachweislich zu der
  Welt gehören, die der Startknopf erzeugt.
- **Das Spiel endet.** Gewonnen, bankrott, verloren oder Jahrhundert vorbei — mit
  einer Punktzahl aus vier gleich schweren Vierteln (Ziele, Firmenwert,
  Netzqualität, transportierte Menge), damit ein reicher Spieler mit schlechtem
  Netz keinen guten Netzbauer überholt.

#### Eine Welt, die altert (M18, M19, M20, M21)

- **Wetter** (Weltregel: aus / mild / hart). Regen, Sturm, Frost und Hitze ziehen
  über die Karte, kosten Tempo, treiben Pannen hoch und verderben verderbliche
  Fracht; eine Sturmwarnung erscheint im Nachrichtenlog, wenn man dort eine
  Station hat.
- **Jahreszeiten.** Die Karte färbt sich um, die Schneegrenze wandert mit Höhe und
  Klima, und eine Ernte hat gute und schlechte Monate.
- **Passagiere haben Ziele.** Pendler und Geschäftsreisende sind zwei Waren mit
  zwei Tarifen: Der Geschäftsreisende zahlt mehr, verdirbt aber schneller — auf
  einer langsamen Linie ist er weniger wert als der Pendler daneben. Wohin ein
  Fahrgast will, hängt an der Größe des Ortes am anderen Ende, und wer angekommen
  ist, fährt auch wieder heim.
- **Städte wachsen und schrumpfen sichtbar.** Sie stellen Häuser hin und
  verlängern Straßen, wenn sie versorgt werden — und bauen ab, wenn sie niemand
  bedient. Hundert Jahre pixelgleiche Städte sind vorbei.
- **Stadträte werden gewählt** (Weltregel): grün, wirtschaftsnah oder ausgewogen,
  und das ändert, worauf die Stadt eine Firma bewertet. Dazu zwei neue
  Maßnahmen — Lärmschutzwand und Stationssponsoring.
- **Ein Jahrhundert Konjunktur** (Weltregel), einmal bei Weltgründung gezogen und
  im Statistikzentrum einsehbar: Kohle fällt nach 2000, Container boomen ab 1970,
  dazu Konjunkturwellen und Energiepreisschocks. Was 1955 profitabel war, muss
  1985 neu verdient werden.
- **Container gibt es endlich wirklich.** Ein Hafen mit Kai **und** Frachtterminal
  wird zum Containerhafen; die Boxen kommen von Übersee an einem Hafen an und
  gehen an einem anderen wieder hinaus — der Spieler fährt die Strecke dazwischen.
- **Lieferverträge und Subventionen.** Ein Werk schreibt eine Monatsmenge aus,
  eine Verbindung wird bezuschusst — und der Zuschlag gehört dem, der zuerst
  liefert, nicht dem, der ihn zuerst ansieht. Vertragsstrafen haben ein eigenes
  Konto in den Büchern, statt unter „Bau“ zu verschwinden.
- **Kaufprämie für saubere Fahrzeuge**, aus derselben Tabelle abgeleitet wie die
  CO₂-Abgabe.
- **Rekordernte und Streik.** Manchmal hat ein Werk einen sehr guten Monat, und
  manchmal steht es still — und ein Streikmonat zählt nicht gegen die Frist, nach
  der ein unbeliefertes Werk schließt.

#### Eigene Welten (M22, M23)

- **Szenario-Werkstatt.** Gelände heben und senken, Städte und Industrien setzen,
  Wald pflanzen, Flüsse graben — kostenlos und ohne Besitzgrenzen, aber mit
  denselben Regeln, die auch der Kartengenerator einhält. Vier Diagnose-Ansichten
  (Temperatur, Feuchte, Landmassen, Einzugsbereiche) und ein Export als
  `.ironscenario`.
- **Ein Bild als Karte.** Ein PNG-Höhenbild (1024 oder 1025 Pixel Kantenlänge)
  wird zum Relief; ein Kontrastregler verändert die Berge und **nicht** die
  Küstenlinie. Alles Übrige — Wasser, Flüsse, Klima, Städte, Industrien — wächst
  wie sonst aus dem Startwert.
- **Vier Benchmark-Karten** und ein Messmodus im Spiel, für alle, die wissen
  wollen, was ihre Maschine trägt.
- **Zwei Jahrhunderte.** Startjahr 1850, 1880, 1920 oder 1950, dazu ein
  Endlosmodus, der 2050 nicht anhält. **Sechzig Fahrzeuggenerationen vor 1950**
  kommen dazu: Dampf, Omnibus, Segler und Frühdiesel, mindestens eine neue
  Generation je Jahrzehnt und Gattung.
- **Vier Klimate, vier Wirtschaften.** Gemäßigt, arktisch, tropisch und
  Wüste — mit je einem eigenen Industriezweig (Nahrung, Öl, Holz, Stein), eigenen
  Ortsnamen und eigener Architektur. Ein Fahrzeug, dessen Fracht es in diesem
  Klima nicht gibt, steht auch nicht im Laden.
- **Fünf Generator-Vorlagen** (Kontinent, Archipel, Hochland, Flussebene, Tal) und
  fünf Regler (Meereshöhe, Hügeligkeit, Flüsse, Städtedichte, Rohstoffreichtum).
  Eine 2048er-Karte bekommt jetzt auch die Städte, die zu ihrer Fläche gehören —
  vorher waren es vier Fünftel zu wenig.
- **Die Häuser altern mit dem Jahrhundert**: Giebel, Platte, Glas.

#### Ein langes Spiel (M24)

- **Die Kampagne „Eisenadern“**: zwölf Etappen von 1850 bis 2050 über alle vier
  Klimate, als Kette mit Verzweigungen. Die sechs frühen Etappen sind mit Absicht
  Alleinspiel und sagen das im Briefing — bei Startjahr 1850 baut die Konkurrenz
  nichts, und ein stiller Gegner im Briefing wäre eine Lüge.
- **Der Schwierigkeitsgrad hat Zähne.** Er entscheidet das Startkapital des
  Spielers (800.000 / 500.000 / 250.000) und den Kreditzins, und er verändert,
  wie gründlich die Konkurrenz ihre Bauvorhaben prüft. Was er ausdrücklich nicht
  tut: der Konkurrenz Geld schenken.
- **Ein Spielerprofil** (`profile.json`) neben den Spielständen: Kampagnenstand,
  Medaillen je Szenario und **41 Erfolge**. Ein kaputtes Profil kostet nie den
  Spielstart.
- **Die Konkurrenz hat ein Gesicht.** Ihre Spielweise steht in der Firmenliste,
  und das Nachrichtenlog meldet ihre neuen Linien, ihre Streckenschließungen,
  ihre Pleiten und die Jahresrangliste.

#### Abschluss (M25)

- **Rückgängig und Wiederherstellen** für Bauen, Abreißen und Geländearbeit —
  inklusive der Rückerstattung, die damals wirklich gebucht wurde, und nicht
  einer neu berechneten. Ein Bau, unter dem sich die Welt seither verändert hat,
  wird abgelehnt statt halb zurückgenommen.
- **Klang.** Ein eigenes Abfahrtssignal je Antriebsart, eine Bahnübergangsglocke,
  Stationsatmosphäre nach Zonen, Klima und Tageszeit, echte Ortung im Raum statt
  nur links/rechts, ein Kompressor über allem und ein zurückhaltendes Musikbett.
  Zehn Züge, die gemeinsam abfahren, pfeifen einmal und nicht zehnmal. Es liegt
  weiterhin keine einzige Tondatei im Projekt: Alles wird zur Laufzeit erzeugt.
- **Zugänglichkeit.** Richtige Ein- und Mehrzahl in beiden Sprachen; Sprache und
  „Bewegung reduzieren“ werden beim ersten Start vom Betriebssystem übernommen;
  die Auslastungskarte hat Schraffuren, damit sie ohne Farbunterscheidung lesbar
  ist; **jede Taste ist frei belegbar**, und eine Doppelbelegung wird abgelehnt
  statt still übernommen; lange Listen haben einen einzigen Tabstopp mit
  Pfeiltasten darin.
- **Browserfassung.** Das Spiel läuft im Browser, Spielstände und Aufzeichnungen
  landen in echtem, dauerhaftem Browser-Speicher (drei Autosaves statt fünf, weil
  der Platz dort geteilt wird), und ein fehlender Server-Header wird von einem
  eigenen Zusatz nachgereicht.
- **Ein Git-Tag baut die Veröffentlichung**: Webfassung, beide Windows-Installer
  und eine automatisch erzeugte Lizenzliste, die sich weigert fertig zu werden,
  wenn ein Paket seine Lizenz nicht nennt.

### Geändert

- **Die Konkurrenz spielt endlich mit.** Sie hat jahrelang Straßen gebaut, die
  nicht aneinander anschlossen, Gleise auf fremdem Grund bestellt, dafür 253-mal
  denselben Kredit aufgenommen und zurückgezahlt, Linien eröffnet, die sich nie
  rechnen konnten, und fremde Haltestellen in den eigenen Fahrplan geschrieben.
  Über acht Testwelten gemessen: von 18.435 € Gesamtwert auf 9,2 Mio. €, von
  vierzehn Pleiten auf zwei (D-224); über sechzehn Welten steht sie heute bei
  rund 25,8 Mio. € und keiner einzigen Pleite (D-218 bis D-230).
- **Der Schwierigkeitsgrad ist das Handicap des Spielers.** Vorher bekam auch die
  Konkurrenz auf „Schwer“ weniger Startkapital — sie war also ärmer statt besser
  (D-253).
- **Städte haben Straßen, die zu etwas führen.** Zwei Drittel aller Ortsstraßen
  führten an keinem einzigen Haus vorbei, und über tausend Stichstraßen endeten
  im Nichts. Danach: keine einzige (D-216).
- **Straße und Grundstück sind unterscheidbar.** Bordstein und Ortsboden hatten
  exakt denselben Farbwert — deshalb sah es aus, als liefen die Straßen durch die
  Häuser (D-217).
- **Passagiere sind zwei Warenarten statt einer.** Alte Spielstände werden beim
  Laden umgestellt; die alte Sammelkategorie bleibt für immer leer stehen, damit
  keine je geschriebene Datei ihre Bedeutung ändert.
- **Speichern ist absturzfest**: erst in eine Nebendatei, dann umbenennen, den
  Vorgänger als `.bak`, und eine Prüfsumme in der Datei, die beim Laden geprüft
  wird. Ein einzelnes gekipptes Bit wird erkannt, und dann lädt die `.bak`.
- **Was auf der Karte gebaut werden darf, ist strenger geworden**: kein
  Geländeumbau mehr unter Gleis, Signal, Bauwerk oder fremdem Besitz.
- **Der Fahrzeugblock der Anzeige ist nicht mehr gedeckelt.** Bei großen Flotten
  waren zeitweise nur 37,5 % der Fahrzeuge sichtbar — und welche, entschied der
  Zufall der Speicherplatzvergabe.

### Behoben

- **Züge verschwanden nicht hinter Hügeln** — die Zeichenreihenfolge war nicht
  verdrahtet.
- **`Esc` entwaffnet jedes Werkzeug**, die tote `N`-Taste schaltet die
  Übersichtskarte um, die **Signalrichtung ist wählbar** statt fest nach Osten,
  und der **manuelle Baumodus** ist wieder erreichbar.
- **Tutorial-Lektion 5 lässt sich über die Oberfläche abschließen** — der
  Umrüst-Weg im Depot fehlte.
- **Eine Elektrolok klang wie ein Diesel.** Der elektrische Zweig der Tonerzeugung
  hatte seit seiner Entstehung kein einziges Mal gelaufen.
- **Züge blieben eine Kachel vor dem Bahnsteig für immer stehen** — ein
  Rundungsspalt von wenigen Millimetern in der Anhaltelogik.
- **Eine Straße an eine bestehende Straße anzuschließen tat nichts**, wenn dabei
  keine neue Kachel entstand: Genau die Kreuzung, die man ziehen wollte, wurde
  abgelehnt.
- **Die Vorschau des Flusspinsels veränderte die Welt.** Eine Vorschau, die
  schreibt, ist schlimmer als gar keine; heute lässt jeder abgelehnte
  Werkstatt-Befehl die Welt Byte für Byte, wie sie war.
- **Ein Küstenpinsel löschte die Flüsse der halben Karte.**
- **Ein Halt an der Straße stand mitten auf der Fahrbahn.** Neben der Straße
  gebaut, legt er sich seine eigene Zufahrt — und bezahlt sie auch.
- **Eine aus dem Nichts gewachsene Stadt nahm ihrer eigenen Station den
  Einzugsbereich** und andere kleine Ungereimtheiten des Wachstums.
- **Ein Klima, das auf seinem eigenen Boden nicht bauen durfte.** Auf einer
  arktischen Karte waren alle 76 Industrien Kohle- oder Erzgruben — nichts davon
  ließ sich irgendwohin liefern (D-249).

### Bekannte Lücken

Ein Änderungsverlauf, der nur Erfolge aufzählt, ist Werbung und keine
Dokumentation. Das hier ist der Stand der Dinge, gemessen und nicht geschätzt:

- **Man trifft praktisch nie einen Bahn-Konkurrenten.** Die Konkurrenz baut
  Straßen und Buslinien; eine Eisenbahn baut sie so gut wie nie. Der Grund ist
  ausgerechnet, dass sie sie sich nicht leisten kann: Die erste Bahnstrecke
  kostet mehr als das gesamte Startkapital einer Firma plus ihrem ganzen
  Kreditrahmen. Sie ist also nicht unprofitabel, sondern unbezahlbar (D-228).
- **Bei Startjahr 1850 baut die Konkurrenz gar nichts**, bei 1880 fast nichts.
  Die Fahrzeuge dieser Jahrzehnte tragen so wenig, dass keine Verbindung die
  Rentabilitätsschwelle erreicht — und die Schwelle wurde bewusst **nicht**
  gesenkt, nur damit die Zahl grün wird. Deshalb sind die sechs frühen
  Kampagnenetappen ausdrücklich Alleinspiel (D-250).
- **„Schwer“ macht den Spieler ärmer, nicht den Gegner besser.** Gemessen über
  sechzehn Welten endet die Konkurrenz auf „Schwer“ knapp **unter** ihrem
  Ergebnis auf „Normal“ (26,0 gegen 26,2 Mio. €) und nur auf sechs von sechzehn
  Welten darüber. Was der Grad zuverlässig ändert, ist das Startkapital
  des Spielers (Faktor 3,2) und sein Kreditzins; die Feineinstellungen an der
  Konkurrenz liegen unterhalb der Messgenauigkeit. Das ist so aufgeschrieben und
  nicht schöngerechnet (D-252, D-253, D-257).
- **Die Installer sind nicht signiert.** Windows zeigt auf jedem Rechner, der die
  Datei noch nie gesehen hat, eine SmartScreen-Warnung. Dafür wird ein
  Code-Signing-Zertifikat gebraucht, das es nicht gibt; die Bauwerkzeuge sind
  darauf vorbereitet und warnen sichtbar, solange es fehlt.
- **Das Handbuch im Spiel kennt nur das Grundspiel.** Es endet bei M9. Linien und
  Takt, der Frachtfluss-Atlas, der Netzwert, Wetter, Konjunktur, Werkstatt,
  Kampagne und Rückgängig stehen nicht darin — man findet sie nur, indem man sie
  ausprobiert. Das ist die größte Lücke für einen neuen Spieler.
- **Straßen auf Hängen sind flache Flicken.** Eine Straßenkachel hat keine
  Neigung; eine Rampe springt daher an jeder Kachelgrenze um eine Höhenstufe
  (D-212).
- **Zwei Züge, die sich auf eingleisiger Strecke Nase an Nase begegnen,
  verklemmen sich.** Das Spiel meldet es und benennt die Züge, löst es aber
  nicht auf (D-059).
- **Es gibt genau eine Wasserfläche, also keine Schleusen.** Wasser ist „Gelände
  auf oder unter Meereshöhe“; ein zweiter Wasserspiegel existiert nicht (D-097).
- **Ein Verbindungsziel gilt als erreicht, sobald der Fahrplan es nennt** — auch
  wenn kein Fahrzeug die Strecke je fahren kann. Gemessen auf Kampagnenetappe 6:
  Gold für vier Busse, die nirgendwohin kommen (D-256).
- **Die Webfassung wurde noch nie in einem echten Browser gestartet.** Alles
  daran ist getestet, was sich ohne Browser testen lässt; dass ein Browser
  danach wirklich meldet, isoliert zu laufen, hat noch niemand nachgesehen.
- **Es wurde nie getaggt und nie installiert.** Der Desktop-Installer baut in
  etwa acht Minuten; ihn zu installieren und einmal durchzuspielen ist der
  Abnahmeschritt, den nur ein Mensch machen kann.
- **Für Entwickler:** `npm run format:check` ist auf 42 Dateien rot (Stand
  2026-08-13). Nichts davon ist ein Fehler im Spiel — der Formatierer ist auf
  diesen Dateien schlicht nie gelaufen (D-227, D-257).

---

## [1.0.0] — nie getaggt (2026-07-29)

Das Grundspiel nach `SPEC.md`, Meilensteine M0 bis M9. Es ist hier
nachträglich verzeichnet, weil es der Stand ist, auf dem die Expansion
aufsetzt, und weil die Abnahmeliste der Expansion ihn selbst „v1.0“ nennt —
getaggt wurde er nie, ausgeliefert auch nicht.

### Hinzugefügt

- **Eine erzeugte Welt** aus einem Startwert: Höhen, Küsten, Flüsse, Klima,
  Städte und Industrien, wiederholbar bis auf das letzte Bit.
- **Vier Verkehrsträger.** Straße, Schiene, Wasser und Luft; Bushaltestellen,
  Ladebuchten, Bahnsteige, Depots, Kais, Häfen und drei Größen von Flugplatz.
- **Eine Eisenbahn, die eine Eisenbahn ist**: acht Richtungen, Kurvenradien mit
  eigenen Geschwindigkeiten, fünf Gleistypen, Elektrifizierung, Brücken, Tunnel,
  ein Bauassistent, der die Strecke plant und den Preis nennt, bevor er baut, und
  33 Triebfahrzeuge mit 23 Wagentypen, aus denen man Züge zusammenstellt.
- **Signale.** Vier Arten, Blockteilung, Pfad- und Blockbelegung, automatisches
  Signalisieren und eine Blockanzeige auf Tastendruck (`F3`).
- **Industrieketten und Fracht mit Ziel.** Jedes Frachtstück weiß, wohin es will;
  eine Ware, die über drei Fahrzeuge fährt, bringt genau so viel ein wie eine, die
  direkt fährt. Wer eine Station schlecht bedient, bekommt weniger Ware — die
  Todesspirale ist Absicht.
- **Wirtschaft mit Tiefe.** Bücher mit Konten, Abschreibung, Unterhalt, Kredit,
  Inflation, Alterung und Pannen der Fahrzeuge, Fahrzeuglisten und Statistiken.
- **Bis zu fünf Konkurrenten**, die dieselben Befehle benutzen wie der Spieler und
  deshalb nicht schummeln können; dazu Stadträte, Baurechte, Ausschreibungen und
  eine CO₂-Abgabe samt Elektrifizierungs-Zuschuss.
- **Fertigstellung**: Menü, Optionen, Speichern und Laden mit fünf Autosave-
  Plätzen, Übersichtskarte, durchsuchbares Handbuch (`F1`), fünf
  Tutorial-Lektionen, Ton, Windows-Installer und ein README.
- **Deutsch und Englisch**, vollständig und durch einen Test gleichgehalten.

---

Ältere Stände gibt es nicht: Vor M0 gab es kein Spiel.
