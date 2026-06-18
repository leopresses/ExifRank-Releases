@echo off
echo ========================================================
echo   COMPILADOR BLINDADO - ExifRank (Anti-Pirataria)
echo ========================================================

echo [1] Aplicando Ofuscacao no Javascript (Anti-Engenharia Reversa)...
cmd /c "npx -y javascript-obfuscator web/main.source.js --output web/main.js --compact true --control-flow-flattening true --identifier-names-generator hexadecimal --string-array true --string-array-encoding base64"

echo [2] Aplicando Ofuscacao no Python com PyArmor...
pyarmor gen -O obf app_seo.py

echo [3] Criando executavel final blindado com PyInstaller...
:: O PyInstaller vai empacotar a versão ofuscada do Python e a pasta web (que agora tem o JS ofuscado)
pyinstaller --noconfirm --onedir --windowed --icon "icone.ico" --add-data "icone.ico;." --add-data "magick.exe;." --add-data "ffmpeg.exe;." --add-data "motor_exif.zip;." --add-data ".env;." --add-data "web;web" --hidden-import "eel" --hidden-import "bottle_websocket" --paths "obf" "obf/app_seo.py" --name "ExifRank_Blindado"

echo ========================================================
echo SUCESSO! O executavel blindado esta na pasta 'dist\ExifRank_Blindado'
echo ========================================================
pause
