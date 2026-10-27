export function withTimeout(promise, milliseconds, schedule = setTimeout, cancel = clearTimeout) {
  return new Promise((resolve, reject) => {
    const timer = schedule(() => reject(new Error('SDK timeout')), milliseconds);
    Promise.resolve(promise).then(
      value => { cancel(timer); resolve(value); },
      error => { cancel(timer); reject(error); },
    );
  });
}

export function loadYandexScript(document, milliseconds = 8000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error('SDK script timeout')), milliseconds);
    script.src = '/sdk.js'; script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error('SDK script unavailable'));
    document.head.append(script);
  });
}

export class YandexPlatform {
  constructor({ host = globalThis, loadScript = () => loadYandexScript(host.document), timeout = 8000 } = {}) {
    this.host = host;
    this.loadScript = loadScript;
    this.timeout = timeout;
    this.status = 'loading';
    this.available = false;
    this.language = null;
    this.paused = false;
    this.listeners = new Set();
    this.active = false;
    this.wanted = false;
    this.sentReady = false;
    this.disposed = false;
    this.sdk = null;
    this.onPause = () => {
      if (this.paused || this.disposed) return;
      this.wasActive = this.active;
      this.active = false; // SDK pauses its own GameplayAPI accounting.
      this.paused = true;
      for (const listener of this.listeners) listener(true);
    };
    this.onResume = () => {
      if (!this.paused || this.disposed) return;
      this.paused = false;
      this.active = Boolean(this.wasActive); // SDK may automatically restart accounting.
      for (const listener of this.listeners) listener(false);
      this.setGameplayActive(this.wanted);
    };
  }

  async init() {
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize();
    return this.initializing;
  }

  async initialize() {
    try {
      if (!this.host.YaGames?.init) await withTimeout(this.loadScript(), this.timeout);
      if (!this.host.YaGames?.init) throw new Error('YaGames.init unavailable');
      const sdk = await withTimeout(this.host.YaGames.init(), this.timeout);
      if (this.disposed || !sdk?.features?.LoadingAPI?.ready) throw new Error('SDK incomplete');
      if (typeof sdk.on !== 'function' || typeof sdk.off !== 'function') throw new Error('SDK events unavailable');
      this.sdk = sdk;
      sdk.on('game_api_pause', this.onPause);
      sdk.on('game_api_resume', this.onResume);
      this.language = sdk.environment?.i18n?.lang || null;
      this.available = true;
      this.status = 'ready';
      return true;
    } catch (error) {
      this.unsubscribe();
      this.error = error;
      this.status = 'unavailable';
      this.available = false;
      return false;
    }
  }

  ready() {
    if (!this.available || this.sentReady) return;
    this.sentReady = true;
    try { this.sdk.features.LoadingAPI.ready(); }
    catch (error) { this.error = error; this.status = 'ready-error'; this.available = false; }
  }

  setGameplayActive(value) {
    this.wanted = Boolean(value);
    const next = this.wanted && !this.paused && this.available;
    if (next === this.active) return;
    this.active = next;
    try {
      const api = this.sdk?.features?.GameplayAPI;
      if (next) api?.start?.(); else api?.stop?.();
    } catch (error) { this.error = error; }
  }

  supports(kind) {
    const name = kind === 'rewarded' ? 'showRewardedVideo' : 'showFullscreenAdv';
    return this.available && typeof this.sdk?.adv?.[name] === 'function';
  }

  requestAd(kind, callbacks) {
    if (!this.supports(kind)) throw new Error('Advertising unavailable');
    const name = kind === 'rewarded' ? 'showRewardedVideo' : 'showFullscreenAdv';
    this.sdk.adv[name]({ callbacks });
  }

  subscribePause(listener) {
    this.listeners.add(listener);
    if (this.paused) listener(true);
    return () => this.listeners.delete(listener);
  }

  unsubscribe() {
    if (!this.sdk) return;
    for (const [event, handler] of [['game_api_pause', this.onPause], ['game_api_resume', this.onResume]]) {
      try { this.sdk.off(event, handler); } catch { /* Initialization may have failed midway. */ }
    }
  }

  dispose() {
    this.setGameplayActive(false);
    this.disposed = true;
    this.available = false;
    this.status = 'disposed';
    this.unsubscribe();
    this.listeners.clear();
  }
}
