# Kontor für Windows

Separate Desktop-Version für Windows 11 auf Intel-/AMD-Rechnern (x64). Die bestehende Swift-/macOS-App im übergeordneten Verzeichnis bleibt unabhängig. Kalenderfunktionen und Datenübernahme aus der Mac-Version sind nicht enthalten.

## Testversion starten

Im Ordner `release` liegen nach dem Build:

- **Kontor Windows Setup 0.1.4.exe**: Automatischer Installer für das eigene Windows-Benutzerkonto unter `%LOCALAPPDATA%\Programs\Kontor Windows`, auch wenn eine frühere Installation auf E: lag. Erstellt eine Desktop-Verknüpfung. Kein separat installiertes Node.js und kein Entwicklungswerkzeug erforderlich.
- **Kontor Windows-0.1.4-win.zip**: Alternative ohne Installation. Den gesamten Ordner unter `%LOCALAPPDATA%` entpacken (ZIP wählt keinen Installationsordner automatisch) und darin `Kontor Windows.exe` starten. Die Begleitdateien müssen zusammenbleiben.

Die Testversion ist nicht mit einem Herausgeberzertifikat signiert. Windows kann deshalb einen Hinweis auf einen unbekannten Herausgeber anzeigen. Die Windows-Ausführung einschließlich Installer und globalem Tastenkürzel muss noch auf einem echten Windows-Rechner geprüft werden.

Beim ersten Start eine PIN aus genau vier Ziffern vergeben (führende Nullen sind möglich). Die Datenbank startet leer. Die PIN wird nicht gespeichert und lässt sich nicht zurücksetzen. Bestehende Daten lassen sich weiterhin mit der bisherigen Passphrase öffnen; unter Einstellungen kann sie ohne Datenverlust durch eine PIN ersetzt werden. Ältere Sicherungen benötigen weiterhin das damalige Geheimnis. Eine vierstellige PIN bietet weniger Schutz gegen das Durchprobieren einer kopierten Datenbank als eine lange Passphrase.

## Funktionen

- Übersicht mit offenen/heute fälligen Aufgaben, letzten Gesprächen, Notizen und Inbox.
- Gespräche und Vorfälle mit Datum, Typ, Vertraulichkeit, Beteiligten, Markdown-Protokoll und Vereinbarungen; Bearbeiten, Suchen, Zeitraumfilter, Archivieren, Reaktivieren und endgültiges Löschen.
- Eigene Gesprächstypen mit Vorlagen (Einstellungen): Neue Gespräche starten mit der Gliederung ihres Typs, solange noch nichts hineingeschrieben wurde. Umbenennen ändert vorhandene Gespräche mit; entfernte Typen bleiben bei älteren Gesprächen erhalten. Typen und Vorlagen liegen in der verschlüsselten Datenbank und sind Teil jeder Sicherung.
- Personen umbenennen oder zusammenführen, einschließlich Beteiligten, Notiz-Personen und Verantwortlichen in Vereinbarungen.
- Vereinbarungen erzeugen Aufgaben. Erneutes Speichern aktualisiert vorhandene Aufgaben. Entfernte Vereinbarungen entfernen zugehörige offene Aufgaben.
- Optional „Kontor morgens anzeigen“: Beim ersten Aufklappen oder Entsperren des Rechners an einem Tag holt sich Kontor mit der Übersicht nach vorn. Dafür startet Kontor mit Windows (Store-Version: in den Windows-Einstellungen unter Apps > Autostart einschalten).
- Aufgaben mit Fristen, Status, Verschieben auf morgen, nächsten Montag, um eine Woche oder auf ein gewähltes Datum, Wiederholung wöchentlich/monatlich/jährlich, Archiv und Filtern. Erledigen erzeugt genau eine Folgeaufgabe; Monatsenden werden berücksichtigt.
- Markdown-Notizbuch mit automatischem Speichern, Live-Formatierung, Vorschau, Überschriften, Listenfortsetzung, Einzug, Checkboxen, Code, Links und `[[Wikilinks]]` mit Vorschlägen, Neuanlage und Rückverweisen.
- Verschachtelte Notizordner, Schlagworte, Personen, Pins und Sortierung nach Änderung, Erstellung oder Titel. Beim Löschen eines Ordners bleiben seine Inhalte erhalten.
- Bild-/PDF-Anhänge bis 30 MB pro Datei mit Vorschau und Export. Anhänge sind Bestandteil der Datenbank und ihrer Sicherung.
- Beidseitige Verknüpfungen zwischen Gesprächen, Aufgaben und Notizen.
- Personenansicht mit Gesprächshistorie und zugehörigen Notizen; globale Suche einschließlich Archiv.
- Export für Gespräche, Notizen, Aufgaben und Personenakten als PDF, Word (.docx) oder Markdown sowie direktes Drucken. „Alles als Dateien exportieren“ legt den gesamten Bestand samt Anhängen als lesbare Markdown-Dateien in einem gewählten Ordner ab.
- Aufräumen: Schuljahresabschluss archiviert Gespräche, Notizen und erledigte Aufgaben vor einem Stichtag (Standard: 1. August). Eine optionale Aufbewahrungsfrist listet Einträge, die älter sind, zum gezielten endgültigen Löschen; offene Aufgaben sind ausgenommen, gelöscht wird nur nach Bestätigung. Frist und Gesprächstypen liegen in der verschlüsselten Datenbank.
- Inbox mit Umwandlung in Gespräche, Aufgaben oder Notizen; separates Schnellerfassungsfenster, globales Tastenkürzel und Symbol im Infobereich.
- Dunkles/helles/systemabhängiges Erscheinungsbild, Sperren, verschlüsselte Sicherung und Wiederherstellung.
- Automatische Sicherung (abschaltbar): einmal täglich nach dem Entsperren sowie beim Sperren und Beenden nach `Dokumente\Kontor-Sicherungen`. Die Dateien heißen `Kontor-Auto-JJJJ-MM-TT.kontorbackup`; die neuesten 14 bleiben erhalten, andere Dateien im Ordner werden nicht angefasst.

Gespräche und Aufgaben werden ausdrücklich mit **Speichern** gespeichert. Notizen speichern Änderungen nach kurzer Pause automatisch; beim Schließen oder Sperren werden offene Notizänderungen vorher gespeichert. Die Entsperrung erfolgt per PIN, nicht per Touch ID oder Windows Hello.

## Datenschutz und Dateien

Die Anwendung lädt keine externen Inhalte, enthält keine Telemetrie und benötigt im Betrieb keine Internetverbindung. Ein bewusst angeklickter externer Link öffnet sich im Standardbrowser.

Der Desktop-Hauptprozess verwaltet eine SQLite-Datenbank über `sql.js`. Auf dem Datenträger liegt ausschließlich ein mit AES-256-GCM verschlüsseltes Datenbankabbild (`kontor.kontorvault`). Der Schlüssel wird mit scrypt aus der PIN (bei alten Daten der Passphrase) und einem zufälligen Salt abgeleitet. Änderungen werden transaktional ausgeführt und über eine temporäre Datei atomar ersetzt. Schreibfehler rollen den Speicherstand zurück.

Der Standardpfad liegt im Benutzerprofil unter `%APPDATA%\kontor-windows`. Erscheinungsbild, Tastenkürzel und die Sicherungseinstellung stehen getrennt in `settings.json`. Automatische Sicherungen sind wie die Datenbank mit der PIN verschlüsselt; liegt der Dokumente-Ordner in OneDrive, landen sie verschlüsselt in der Cloud. Vor dem Import einer Sicherung wird der aktuelle Datenbestand unter `kontor.kontorvault.vor-import.kontorbackup` gesichert. Exportierte PDF-, Word- und Markdown-Dateien, der Gesamtexport und einzeln gespeicherte Anhänge sind normale, unverschlüsselte Dateien am selbst gewählten Speicherort. Endgültig gelöschte Einträge bleiben in älteren Sicherungen enthalten, bis diese überschrieben oder gelöscht werden.

## Entwicklung auf dem Mac

Voraussetzung: Node.js 22.12 oder neuer und npm. Für reproduzierbare Installationen ist `package-lock.json` enthalten.

```sh
npm ci
npm start
```

`npm start` erstellt die Oberfläche und startet die Desktop-App mit einem eigenen Datenverzeichnis. Für Windows-Pakete:

```sh
npm run dist:win
```

Der Build lädt bei Bedarf Electron für Windows x64 sowie die Verpackungswerkzeuge. Der Installer und das ZIP enthalten alle Laufzeitbestandteile. Signierung ist für diese lokale Testversion deaktiviert.

## Tests

```sh
npm test
npm run test:ui
npm run test:integration
```

Die 16 Unit-/Integrationstests von Start und Datenhaltung prüfen Gesprächsbearbeitung, Verknüpfungen, Vereinbarungsaufgaben, Wiederholungen, Ordnerzyklen, Inbox-Transaktionen, Anhänge, Schreibfehler, Verschlüsselung und Sicherungen.

Die beiden Desktop-Testläufe starten die echte Electron-App mit ausschließlich temporären Testdatenbanken. Sie prüfen unter anderem Bearbeiten, Speichern, Suche, Wikilinks, Aufgaben, Inbox, Sperren/Entsperren, automatische Notizspeicherung vor dem Sperren, Checkboxen, Ordner, Archiv, Pins, Anhänge, PDF-Export, Sicherung/Wiederherstellung und die Trennung von Oberfläche und Systemzugriff. Native Dateidialoge werden in diesen Tests mit Testpfaden beantwortet. Screenshots liegen in `test-results`.

Diese Prüfungen laufen auf dem Mac. Sie ersetzen noch keinen Windows-Test des Installers, der Dateidialoge, der Skalierung und des Infobereichs.

## Struktur

- `electron/repository.cjs`: Fachlogik, SQLite-Datenhaltung und Transaktionen.
- `electron/vault.cjs`: Verschlüsselung, atomare Speicherung und Sicherungen.
- `electron/main.cjs`: Fenster, erlaubte Desktop-Aktionen, Dateien, PDF, Infobereich, Hotkeys.
- `electron/preload.cjs`: Eng begrenzte Schnittstelle zwischen Oberfläche und Hauptprozess.
- `src/main.jsx`: Anwendungsansichten und Editoren.
- `src/Markdown.jsx`: Markdown-Editor und bereinigte Darstellung.
- `src/style.css`: Farben, Typografie und Layout.
- `tests/`: Datenhaltungs- und Desktop-Tests.

## Startdiagnose ab 0.1.4

`electron/bootstrap.cjs` initialisiert ein technisches Startprotokoll vor dem Laden der Datenbankmodule und fängt fehlgeschlagene Startschritte ab. Das Hauptfenster wird sofort angezeigt; Infobereich und Menü werden danach als optionale Komponenten eingerichtet. Fehler beim Laden von Oberfläche/Preload sowie Renderer-Abstürze werden sichtbar gemeldet. Ein unabhängiger Ladebildschirm erkennt außerdem ein fehlendes Oberflächenpaket oder eine fehlgeschlagene Programmverbindung.

Das Protokoll liegt unter `%TEMP%\Kontor-Start.log`; die mitgelieferte `Kontor-Diagnose.cmd` kann zusätzliche native Ausgaben erfassen. Vier zusätzliche Unit-Tests prüfen Fehlerbehandlung und Zweitstart. `npm run test:startup` prüft den echten Start mit Infobereich-Symbol und sichtbarem Fenster. Die Windows-SmartScreen-Reputationswarnung der unsignierten Testversion bleibt davon unabhängig.
