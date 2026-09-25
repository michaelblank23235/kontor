; Use the working local user folder even when an older install used E:.
!macro customInit
  SetShellVarContext current
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Kontor Windows"
!macroend
