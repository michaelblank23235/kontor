# Microsoft Store: x64-MSIX-Bundle

Vorbereitet, noch nicht auf Windows ausgeführt. Ein Bundle mit einem x64-Paket
entspricht dem bisherigen Zielsystem; ARM ist nicht enthalten.

Voraussetzungen: Windows 11, Node.js mit npm und Windows SDK (MakeAppx).
Im Projektordner zuerst `npm ci` ausführen. Anschließend in PowerShell:

```powershell
npm run dist:store
```

Die Store-Identität ist fest im Build-Skript hinterlegt:

- Name: `MichaelNickel.kontor`
- Publisher: `CN=904311B3-822B-45CD-87BF-65B5596E9267`
- PublisherDisplayName: `Michael Nickel`
- Reservierter Anzeigename: `kontor`
- Erwartete Paketfamilie: `MichaelNickel.kontor_zr53w5vfr8y70`
- Store-ID: `9NBKK3G6NDQ2`

Das Skript baut die App neu, erzeugt die Store-Icons, validiert das MSIX und
erstellt `release/store/Kontor-<Version>.0-x64.msixbundle`.

Das Bundle ist für die Store-Einreichung unsigniert. Es ist kein direkt per
Doppelklick installierbarer Ersatz für den bisherigen EXE-Installer. Microsoft
signiert das Paket im Store-Verfahren. Für `runFullTrust` bei Rückfrage erklären:
Kontor ist eine Electron-Desktop-App mit lokalem Dateizugriff für verschlüsselte
Daten, Sicherungen, Anhänge und PDF-Export; kein Treiber oder Hintergrunddienst.

Vor öffentlicher Freigabe die Store-Installation auf Windows testen: PIN,
Speichern/Wiederöffnen, Sicherung/Import, PDF/Anhänge, Taskleiste/Infobereich und
globales Tastenkürzel. Die bisherige EXE-Installation verwendet einen anderen
Installationsweg; eine automatische Datenübernahme ist noch nicht verifiziert.
Vor einem Wechsel eine Kontor-Sicherung erstellen. Updates im Store müssen eine
höhere Paketversion haben; die letzte Versionsstelle bleibt 0.
