@echo off
chcp 65001 >nul
echo === Equianza: crear el programa .exe para Windows ===
echo.
where node >nul 2>nul || (echo Primero instala Node.js desde https://nodejs.org  y vuelve a abrir este archivo. & pause & exit /b 1)
findstr /C:"TU-PROYECTO" config.json >nul && (echo Antes de seguir, abre config.json y pon la direccion real de tu pagina. & pause & exit /b 1)
call npm install || (echo Fallo la instalacion. & pause & exit /b 1)
call npm run exe || (echo Fallo la creacion del .exe. & pause & exit /b 1)
echo.
echo Listo. El instalador quedo en la carpeta "salida".
pause
