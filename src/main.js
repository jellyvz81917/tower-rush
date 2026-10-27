import { startApp } from './app.js';

startApp().catch(error => {
  console.error(error);
  const notice = document.getElementById('notice');
  notice.hidden = false;
  document.getElementById('boot').hidden = true;
  notice.textContent = 'Не удалось запустить игру. Попробуйте обновить страницу в современном браузере.';
});
