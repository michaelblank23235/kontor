@echo off
setlocal
title Kontor Startdiagnose
cd /d "%~dp0"
if not exist "Kontor Windows.exe" (
  echo Diese Datei bitte im gleichen Ordner wie Kontor Windows.exe starten.
  pause
  exit /b 1
)
echo Kontor wird mit Startprotokoll geoeffnet.
echo Windows Defender und SmartScreen werden nicht veraendert.
echo Bitte Kontor nach dem Test vollstaendig beenden.
set "ELECTRON_ENABLE_LOGGING=1"
set "ELECTRON_LOG_FILE=%TEMP%\Kontor-Chromium.log"
"Kontor Windows.exe" --enable-logging=file "--log-file=%TEMP%\Kontor-Chromium.log" > "%TEMP%\Kontor-Konsole.log" 2>&1
set "KONTOR_EXIT_CODE=%ERRORLEVEL%"
echo Rueckgabecode: %KONTOR_EXIT_CODE%
echo Protokolle: %TEMP%\Kontor-Start.log
echo             %TEMP%\Kontor-Chromium.log
echo             %TEMP%\Kontor-Konsole.log
pause
endlocal
