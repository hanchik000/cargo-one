@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js не найден. Установите LTS с https://nodejs.org и запустите снова. & pause & exit /b)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<13)){console.log('Нужен Node.js 22.13 или новее');process.exit(1)}" || (pause & exit /b)
if not exist ".env" (
  echo Первый запуск. Вставьте ключ OT Commerce ^(правой кнопкой мыши^) и нажмите Enter:
  set /p OTKEY=
)
if not exist ".env" call node make-env.mjs "%OTKEY%"
echo Запускаю CARGO ONE... Не закрывайте это окно, пока пользуетесь сайтом.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node --env-file=.env --disable-warning=ExperimentalWarning server/server.mjs
pause
