#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js не найден. Установите версию LTS с https://nodejs.org и запустите снова."; read -n1; exit 1; fi
[ -f .env ] || { read -p "Первый запуск. Вставьте ключ OT Commerce и нажмите Enter: " OTKEY; node make-env.mjs "$OTKEY"; }
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<13)){console.log('Нужен Node.js 22.13 или новее. Установите LTS с https://nodejs.org');process.exit(1)}" || { read -n1; exit 1; }
echo "Запускаю CARGO ONE... Не закрывайте это окно, пока пользуетесь сайтом."
(sleep 4; open http://localhost:3000) &
node --env-file=.env --disable-warning=ExperimentalWarning server/server.mjs
