# Kontor – erster Test auf Windows 11

1. `Kontor Windows Setup 0.1.1.exe` auf den Windows-Rechner kopieren und installieren. Alternativ das ZIP vollständig entpacken und `Kontor Windows.exe` starten.
2. Eine vierstellige PIN festlegen. Zum ersten Durchlauf einige erfundene Testeinträge anlegen.
3. Ein Gespräch mit Beteiligten, Protokoll und einer Vereinbarung speichern. Danach **Bearbeiten** öffnen, den Text ändern und erneut speichern. Die Vereinbarung muss als genau eine Aufgabe erscheinen.
4. Eine Notiz schreiben, Ordner/Schlagwort vergeben, `[[Wochenplanung]]` ausprobieren und ein Bild oder PDF anhängen. Notizeditor schließen und erneut öffnen: Änderungen und Anhang müssen erhalten bleiben.
5. Eine Aufgabe erledigen; bei Wiederholung und Frist muss eine Folgeaufgabe entstehen. Gespräch und Notiz in der Suche und Personenansicht wiederfinden.
6. Die Schnellerfassung mit **Strg+Alt+K** und über das Kontor-Symbol im Infobereich öffnen. Einen Gedanken speichern und in der Inbox zu einer Aufgabe machen.
7. Einen PDF-Export und eine Sicherung erstellen. Kontor beenden, neu starten und mit der PIN entsperren. Anschließend die Sicherung testweise wiederherstellen.
8. Kleines Fenster, Vollbild und die unter Windows eingestellte Bildschirm-Skalierung ausprobieren. Prüfen, ob alle Schaltflächen erreichbar bleiben.

Für eine Fehlermeldung hilfreich: welcher Schritt, was erwartet wurde, was stattdessen passiert und gegebenenfalls der genaue Meldungstext oder ein Bildschirmfoto.

Die Testversion ist noch nicht mit einem Herausgeberzertifikat signiert. Die lokale Datenbank bleibt bei einer normalen Deinstallation erhalten.

## Wenn kein Fenster erscheint (Version 0.1.1)

- Windows Defender und SmartScreen aktiviert lassen.
- Vor dem Update Kontor vollständig beenden; falls noch ein alter Kontor-Prozess ohne Fenster im Task-Manager läuft, diesen beenden. Dann Version 0.1.1 installieren.
- Eine reine SmartScreen-Warnung „Unbekannter Herausgeber“ kommt von der fehlenden Herausgebersignatur der Testversion. Bei dieser selbst erstellten Kontor-Testdatei lässt sich – sofern Windows es anbietet – über „Weitere Informationen“ → „Trotzdem ausführen“ nur diese Datei freigeben. Keine globalen Schutzfunktionen oder Richtlinien deaktivieren.
- Nach einem Startversuch mit Windows-Taste + R den Pfad `%TEMP%\Kontor-Start.log` öffnen. Das Protokoll enthält technische Startschritte, keine Passphrasen, Gespräche oder Notiztexte.
- Existiert kein Protokoll, kann Windows den Start bereits vor der App blockiert haben; auch ein nicht beschreibbarer Protokollpfad ist möglich. Bitte dann die genaue Windows-Meldung weitergeben.
- Alternativ im Installationsordner `Kontor-Diagnose.cmd` öffnen. Diese Datei startet dieselbe App und sammelt zusätzliche native Startausgaben unter `%TEMP%\Kontor-Chromium.log` und `%TEMP%\Kontor-Konsole.log`. Kontor anschließend vollständig beenden, damit die Rückmeldung im Diagnosefenster erscheint.

Die Ursache des gemeldeten Nichtstarts ist ohne den Windows-Startverlauf noch nicht bestätigt. Version 0.1.1 zeigt das Fenster sofort, behandelt Fehler bei optionalem Infobereich-Symbol und Menü getrennt und protokolliert Startfehler. Sie ergänzt kein Herausgeberzertifikat.

PIN-Wechsel: Unter Einstellungen die bisherige Passphrase/PIN eingeben, neue PIN zweimal eingeben und speichern. Sperren und mit der neuen PIN öffnen; Daten müssen erhalten bleiben. Ältere Sicherungen weiterhin mit der damaligen Passphrase/PIN öffnen.
