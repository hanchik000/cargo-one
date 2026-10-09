// First run: creates .env with the OT Commerce key typed by the user and a random session secret.
import fs from 'node:fs';
import crypto from 'node:crypto';
const key = String(process.argv[2] || '').trim();
fs.writeFileSync(new URL('./.env', import.meta.url), [
  'PORT=3000', 'DATA_DIR=data', `AUTH_SECRET=${crypto.randomBytes(24).toString('hex')}`,
  `OTAPI_KEY=${key}`, 'OTAPI_PROVIDER=Aliexpress', 'OTAPI_LANG=ru', 'OTAPI_DAILY_CALL_LIMIT=60',
  'IMAGE_HOSTS=alicdn.com,aliexpress-media.com', '',
].join('\n'));
console.log(key ? 'Ключ сохранён в .env' : 'Ключ не указан: импорт с AliExpress будет недоступен (можно вписать в .env позже).');
