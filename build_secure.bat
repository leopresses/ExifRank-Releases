@echo off
setlocal EnableExtensions

echo ========================================================
echo   COMPILADOR BLINDADO - ExifRank (Anti-Pirataria)
echo ========================================================

for %%F in ("app_seo.py" "icone.ico" "magick.exe" "ffmpeg.exe" "exiftool.exe" "motor_exif.zip" "web\main.source.js") do (
    if not exist %%F (
        echo [ERRO] Arquivo obrigatorio ausente: %%~F
        exit /b 1
    )
)
if not exist "exiftool_files\exiftool.pl" (
    echo [ERRO] A pasta exiftool_files esta incompleta.
    exit /b 1
)

echo [1] Aplicando ofuscacao no JavaScript...
where npx.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npx.cmd nao foi encontrado no PATH.
    exit /b 1
)
call npx.cmd --yes javascript-obfuscator web/main.source.js --output web/main.js --compact true --control-flow-flattening true --identifier-names-generator hexadecimal --string-array true --string-array-encoding base64
if errorlevel 1 (
    echo [ERRO] A ofuscacao do JavaScript falhou. A compilacao foi cancelada.
    exit /b 1
)

echo [2] Pulando PyArmor (Limitacao da Trial)...

echo [3] Criando executavel final com PyInstaller...
where pyinstaller.exe >nul 2>&1
if not errorlevel 1 (
    pyinstaller.exe --noconfirm --onedir --windowed --icon "icone.ico" --add-data "icone.ico;." --add-data "magick.exe;." --add-data "ffmpeg.exe;." --add-data "motor_exif.zip;." --add-data "web;web" --hidden-import "eel" --hidden-import "bottle_websocket" --name "ExifRank" app_seo.py
) else (
    where python.exe >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] Python e PyInstaller nao foram encontrados no PATH.
        exit /b 1
    )
    python.exe -m PyInstaller --noconfirm --onedir --windowed --icon "icone.ico" --add-data "icone.ico;." --add-data "magick.exe;." --add-data "ffmpeg.exe;." --add-data "motor_exif.zip;." --add-data "web;web" --hidden-import "eel" --hidden-import "bottle_websocket" --name "ExifRank" app_seo.py
)
if errorlevel 1 (
    echo [ERRO] O PyInstaller falhou. Nenhum pacote novo foi aprovado.
    exit /b 1
)

if not exist "dist\ExifRank\ExifRank.exe" (
    echo [ERRO] O executavel esperado nao foi criado.
    exit /b 1
)

copy /Y "exiftool.exe" "dist\ExifRank\exiftool.exe" >nul
if errorlevel 1 (
    echo [ERRO] Nao foi possivel copiar o executavel do motor EXIF.
    exit /b 1
)
xcopy /E /I /Y "exiftool_files" "dist\ExifRank\exiftool_files" >nul
if errorlevel 1 (
    echo [ERRO] Nao foi possivel copiar as bibliotecas do motor EXIF.
    exit /b 1
)

if not exist "dist\ExifRank\exiftool.exe" (
    echo [ERRO] O motor EXIF nao entrou no pacote compilado.
    exit /b 1
)
if not exist "dist\ExifRank\exiftool_files\lib\strict.pm" (
    echo [ERRO] O motor EXIF nao entrou no pacote compilado.
    exit /b 1
)
"dist\ExifRank\exiftool.exe" -ver >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O motor EXIF empacotado nao conseguiu iniciar.
    exit /b 1
)

echo ========================================================
echo SUCESSO! O executavel validado esta em dist\ExifRank
echo ========================================================
exit /b 0
