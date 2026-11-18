// Бот-учасник: рухається відомою траєкторією walk() і надсилає позу кожні
// 49 мс (≈ 20 разів за секунду). Період навмисно не кратний T_зн = 50 мс:
// момент пози відносно знімка змінюється, і t_оч у середньому ≈ T_зн/2.
// Запуск з каталогу session: node bot.js [ім’я]
import WebSocket from 'ws';
import { PORT, walk } from '../scene/shared.js';

const name = process.argv[2] ?? 'bot';
const ws = new WebSocket(`ws://localhost:${PORT}/?name=${name}&profile=lan`);
ws.on('open', () => {
  console.log(`Бот ${name} у сеансі. Ctrl+C — зупинка`);
  setInterval(() => ws.send(JSON.stringify(
    { type: 'pose', p: walk(Date.now()).p, q: [0, 0, 0, 1] })), 49);
});
ws.on('error', (e) => console.error('Немає сервера сеансу:', e.message));
