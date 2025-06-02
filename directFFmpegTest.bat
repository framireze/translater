@echo off
echo === LISTANDO DISPOSITIVOS DE AUDIO ===
echo.
bin\ffmpeg.exe -list_devices true -f dshow -i dummy 2>&1
echo.
echo === FIN DE LA LISTA ===
pause