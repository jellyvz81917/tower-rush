import { CONFIG } from './config.js';
import { Game } from './core/game.js';
import { FixedClock } from './runtime/loop.js';
import { bindInput } from './runtime/input.js';
import { ProgressStore } from './progress/storage.js';
import { Synth } from './audio/synth.js';
import { Renderer } from './render/canvas-renderer.js';
import { createPlatform } from './platforms/index.js';
import { Activity } from './runtime/activity.js';
import { AdService, InterstitialPolicy } from './ads/ad-service.js';
import { requestContinuation } from './ads/continuation.js';
import { selectLanguage, translator, translateDocument } from './ui/i18n.js';

export async function startApp({ platform = createPlatform(), browserLanguage = navigator.language } = {}) {
  const startedAt = performance.now();
  document.documentElement.dataset.gameVersion = '0.2.1';
  console.info(`[Tower Rush] platform selected: ${platform.kind || platform.status}`);
  await platform.init();
  const language = selectLanguage(platform.language, browserLanguage);
  const t = translator(language);
  translateDocument(document, language);
  document.documentElement.dataset.sdkStatus = platform.status;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const game = new Game();
  const renderer = new Renderer(canvas);
  renderer.text = t;
  const clock = new FixedClock();
  const activity = new Activity();
  activity.set('hidden', document.hidden);
  activity.set('blur', !document.hasFocus());
  const policy = new InterstitialPolicy();
  let screen = 'menu';
  let dirty = true;
  let runRecord = 0;
  let noticeTimer;
  let feedbackTimer;
  let visibleTime = 0;
  let previousFrame = null;
  let pendingDeparture = null;
  let departing = false;
  let finalizedRun = null;
  const notify = message => {
    $('notice').textContent = t(message);
    $('notice').hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 9000);
  };
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  const progress = new ProgressStore(storage, notify);
  const sound = new Synth(progress.data.sound);
  const ads = new AdService(platform, { onChange: state => {
    activity.set('ad', state.busy);
    if (state.busy) pause('ad');
    $('ad-overlay').hidden = !state.busy;
    $('ad-recover').hidden = !state.recoverable;
    const message = state.state === 'stalled'
      ? 'Реклама не ответила. Если окно рекламы закрыто, можно вернуться к игре.'
      : state.state === 'rewarded' ? 'Просмотр подтверждён. Дождись закрытия рекламы.'
        : state.state === 'showing' ? 'Реклама открыта. Игра на паузе.' : 'Ожидаем рекламу…';
    $('ad-text').textContent = t(message);
    syncActivity();
  } });

  function syncActivity() {
    sound.setBlocked(activity.blocked);
    platform.setGameplayActive(screen === 'playing' && !activity.blocked);
    const locked = ads.busy || departing;
    for (const id of ['start-button', 'retry-button', 'restart-button', 'reward-button',
      'pause-menu-button', 'result-menu-button', 'help-button', 'help-back-button']) {
      $(id).disabled = locked || activity.reasons.has('platform');
    }
    $('resume-button').disabled = activity.blocked;
    if (pendingDeparture && !activity.blocked && !ads.busy) {
      const next = pendingDeparture;
      pendingDeparture = null; departing = false;
      if (next === 'playing') begin(); else { renderer.reset(); show('menu'); }
    }
  }

  function updateHud() {
    $('score').textContent = game.score.toLocaleString(language);
    $('floors').replaceChildren(document.createTextNode(String(game.floors)));
    const suffix = document.createElement('span'); suffix.textContent = ' / ∞'; $('floors').append(suffix);
    $('side-record').textContent = progress.data.bestScore.toLocaleString(language);
    $('menu-record').textContent = progress.data.bestScore.toLocaleString(language);
    $('combo').hidden = game.combo < 2 || screen !== 'playing';
    $('combo').textContent = `${t('ТОЧНОСТЬ')} ×${game.combo}`;
    $('sound-button').setAttribute('aria-pressed', String(progress.data.sound));
    $('sound-button').setAttribute('aria-label', t(progress.data.sound ? 'Выключить звук' : 'Включить звук'));
    $('sound-button').title = t(progress.data.sound ? 'Выключить звук' : 'Включить звук');
    $('sound-button').textContent = progress.data.sound ? '♪' : '♪̸';
    const rewardAvailable = screen === 'result' && game.canContinue() && ads.supports('rewarded');
    $('reward-button').hidden = !rewardAvailable;
    $('reward-copy').hidden = !rewardAvailable;
  }

  function show(next) {
    screen = next;
    clock.reset(); input.clear();
    clearTimeout(feedbackTimer);
    $('feedback').textContent = '';
    $('feedback').classList.remove('visible');
    for (const name of ['menu', 'pause', 'result', 'help']) $(name + '-panel').hidden = next !== name;
    $('overlay').hidden = next === 'playing';
    $('overlay').classList.toggle('menu', next === 'menu');
    $('hud').hidden = !['playing', 'pause'].includes(next);
    $('play-hint').hidden = next !== 'playing';
    canvas.tabIndex = next === 'playing' ? 0 : -1;
    updateHud(); dirty = true;
    syncActivity();
    const focus = { menu: 'start-button', pause: 'resume-button', result: 'retry-button', help: 'help-back-button' };
    (next === 'playing' ? canvas : $(focus[next])).focus({ preventScroll: true });
  }

  function begin() {
    if (activity.blocked || ads.busy) return;
    sound.unlock(); sound.play('button');
    runRecord = progress.data.bestScore;
    game.reset(); renderer.reset(); show('playing');
    renderer.draw(game); dirty = false;
  }

  function pause(reason = 'manual') {
    if (screen !== 'playing') return;
    $('pause-copy').textContent = t(reason === 'manual'
      ? 'Башня на месте. Продолжай, когда будешь готов.'
      : 'Мы остановили башню, пока ты отвлёкся от игры.');
    show('pause');
  }

  function place() {
    if (screen !== 'playing' || activity.blocked) return;
    const event = game.place();
    if (!event) return;
    renderer.event(event);
    if (event.kind === 'miss') {
      sound.play('miss');
      $('result-score').textContent = game.score.toLocaleString(language);
      $('result-floors').textContent = game.floors;
      $('result-perfect').textContent = game.perfect;
      $('result-combo').textContent = game.bestCombo;
      $('result-record').textContent = progress.data.bestScore.toLocaleString(language);
      $('result-kicker').textContent = t(game.score > runRecord ? 'НОВЫЙ ЛИЧНЫЙ РЕКОРД' : 'КАЖДАЯ ПОПЫТКА ДЕЛАЕТ ТОЧНЕЕ');
      $('result-title').textContent = t(game.score > runRecord ? 'Вот это высота.' : 'Ещё на этаж выше?');
      show('result');
    } else {
      if (game.score > progress.data.bestScore || game.floors > progress.data.bestFloors) {
        progress.update({ bestScore: Math.max(game.score, progress.data.bestScore), bestFloors: Math.max(game.floors, progress.data.bestFloors) });
      }
      sound.play(event.kind, game.combo);
      updateHud();
      const feedback = $('feedback');
      feedback.textContent = event.kind === 'perfect' ? `${t('ТОЧНО!')} +${event.points}` : `+10 · ${t('ШИРИНА')} ${Math.round(event.width / CONFIG.initialWidth * 100)}%`;
      feedback.classList.remove('visible'); void feedback.offsetWidth; feedback.classList.add('visible');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => { feedback.textContent = ''; feedback.classList.remove('visible'); }, 760);
    }
    renderer.draw(game); dirty = false;
  }

  const input = bindInput(canvas, place);
  async function leaveResult(next) {
    if (ads.busy || departing || activity.blocked) return;
    if (screen !== 'result') { if (next === 'playing') begin(); else show('menu'); return; }
    departing = true;
    if (finalizedRun !== game.runId) {
      policy.finishRun(game.continueUsed); finalizedRun = game.runId;
    }
    if (ads.supports('interstitial') && policy.take(visibleTime)) {
      await ads.request('interstitial', { runId: game.runId });
    }
    pendingDeparture = next;
    syncActivity();
  }
  $('start-button').addEventListener('click', begin);
  $('retry-button').addEventListener('click', () => leaveResult('playing'));
  $('restart-button').addEventListener('click', begin);
  $('pause-button').addEventListener('click', () => pause());
  $('resume-button').addEventListener('click', () => {
    if (activity.blocked) return;
    sound.unlock(); show('playing');
  });
  $('result-menu-button').addEventListener('click', () => leaveResult('menu'));
  $('reward-button').addEventListener('click', async () => {
    if (ads.busy || departing || activity.blocked || screen !== 'result') return;
    const result = await requestContinuation(game, ads);
    if (result.continued) {
      renderer.reset();
      $('pause-copy').textContent = t('Дополнительная попытка готова. Нажми «Продолжить», когда будешь готов.');
      show('pause');
    } else {
      notify(result.status === 'closed' ? 'Просмотр не подтверждён. Башня и очки сохранены.' : 'Реклама недоступна. Можно начать новую попытку.');
      updateHud();
    }
  });
  $('ad-recover').addEventListener('click', () => ads.recover());
  for (const id of ['pause-menu-button', 'help-back-button']) {
    $(id).addEventListener('click', () => { sound.play('button'); renderer.reset(); show('menu'); });
  }
  $('help-button').addEventListener('click', () => { sound.play('button'); show('help'); });
  $('sound-button').addEventListener('click', () => {
    const enabled = !progress.data.sound;
    progress.update({ sound: enabled }); sound.setEnabled(enabled); sound.play('button'); updateHud();
  });
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    if (ads.busy || departing || activity.reasons.has('platform')) return;
    if (screen === 'playing') pause();
    else if (screen === 'result') leaveResult('menu');
    else if (screen !== 'pause') show('menu');
  });
  document.addEventListener('keydown', event => {
    if (event.code !== 'Escape' || event.repeat) return;
    event.preventDefault();
    if (screen === 'playing') pause();
    else if (screen === 'help') show('menu');
  });
  const lifecycle = () => {
    previousFrame = null;
    const inactive = document.hidden || !document.hasFocus();
    activity.set('hidden', document.hidden);
    activity.set('blur', !document.hasFocus());
    if (inactive) { pause('hidden'); input.clear(); clock.reset(); }
    syncActivity();
    dirty = true;
  };
  document.addEventListener('visibilitychange', lifecycle);
  window.addEventListener('blur', lifecycle);
  window.addEventListener('focus', lifecycle);
  window.addEventListener('pagehide', () => { activity.set('pagehide', true); syncActivity(); pause('hidden'); });
  window.addEventListener('pageshow', () => { activity.set('pagehide', false); lifecycle(); });
  platform.subscribePause(paused => {
    activity.set('platform', paused);
    previousFrame = null;
    if (paused) pause('platform');
    syncActivity();
  });
  const resize = new ResizeObserver(() => { renderer.resize(); dirty = true; });
  resize.observe(canvas);
  window.addEventListener('resize', () => { renderer.resize(); dirty = true; });

  function frame(now) {
    if (previousFrame !== null && !document.hidden && !activity.blocked) visibleTime += Math.max(0, now - previousFrame);
    previousFrame = now;
    if (!document.hidden) {
      if (screen === 'playing' && !activity.blocked) {
        const steps = clock.consume(now);
        game.advance(steps);
        renderer.update(steps * CONFIG.tickMs);
        renderer.draw(game);
      } else if (dirty) {
        renderer.draw(game, screen === 'menu' || screen === 'help');
      }
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  renderer.resize();
  document.querySelector('.app-shell').inert = false;
  $('boot').hidden = true;
  show('menu'); renderer.draw(game, true); dirty = false;
  requestAnimationFrame(frame);
  platform.ready();
  document.documentElement.dataset.sdkStatus = platform.status;
  if (['unavailable', 'ready-error', 'vk-unavailable'].includes(platform.status)) notify('Функции платформы недоступны. Можно играть без рекламы.');
  console.info(`Tower Rush ready: ${Math.round(performance.now() - startedAt)} ms; platform=${platform.status}; language=${language}; version=0.2.1`);
}
