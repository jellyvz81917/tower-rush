import { LocalPlatform } from './local.js';
import { withTimeout } from './yandex.js';

export const VK_APP_ID = '54848802';
const platforms = new Set(['desktop_web', 'desktop_web_messenger', 'desktop_app_messenger',
  'mobile_web', 'mobile_android', 'mobile_android_messenger', 'mobile_iphone', 'mobile_iphone_messenger', 'mobile_ipad']);

// Launch parameters select an adapter only; they are not authentication or a verified signature.
export function isVKEnvironment(host = globalThis) {
  const params = new URLSearchParams(host.location?.search || '');
  const appId = params.get('vk_app_id');
  if (appId && appId !== VK_APP_ID) return false;
  if (appId === VK_APP_ID && platforms.has(params.get('vk_platform'))) return true;
  if (typeof host.AndroidBridge?.VKWebAppInit === 'function'
    || typeof host.webkit?.messageHandlers?.VKWebAppInit?.postMessage === 'function') return true;
  try {
    if (host.parent && host.parent !== host && host.document?.referrer) {
      const parentHost = new URL(host.document.referrer).hostname;
      return ['vk.com', 'vk.ru', 'm.vk.com', 'm.vk.ru'].includes(parentHost);
    }
  } catch { /* An unavailable referrer is not evidence of a VK environment. */ }
  return false;
}

export function loadVKBridge(host = globalThis, timeout = 3000) {
  if (typeof host.vkBridge?.send === 'function') return Promise.resolve(host.vkBridge);
  return new Promise((resolve, reject) => {
    const script = host.document.createElement('script');
    let done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else if (typeof host.vkBridge?.send === 'function') resolve(host.vkBridge);
      else reject(new Error('VK Bridge export unavailable'));
    };
    const timer = setTimeout(() => finish(new Error('VK Bridge script timeout')), timeout);
    script.async = true;
    script.src = new URL('../vendor/vk-bridge-3.0.2.min.js', import.meta.url).href;
    script.onload = () => finish();
    script.onerror = () => finish(new Error('VK Bridge script unavailable'));
    host.document.head.append(script);
  });
}

export class VKPlatform extends LocalPlatform {
  kind = 'vk';
  status = 'vk-loading';

  constructor({ host = globalThis, loadBridge = () => loadVKBridge(host), timeout = 5000, logger = console } = {}) {
    super();
    this.host = host;
    this.loadBridge = loadBridge;
    this.timeout = timeout;
    this.logger = logger;
    this.listeners = new Set();
    this.disposed = false;
    this.onEvent = event => {
      if (this.disposed) return;
      const type = event?.detail?.type;
      if (type !== 'VKWebAppViewHide' && type !== 'VKWebAppViewRestore') return;
      const paused = type === 'VKWebAppViewHide';
      if (this.paused === paused) return;
      this.paused = paused;
      for (const listener of this.listeners) listener(paused);
    };
  }

  init() {
    if (!this.initializing) this.initializing = this.initialize();
    return this.initializing;
  }

  async initialize() {
    if (this.disposed) return false;
    try {
      this.logger.info('[Tower Rush][VK] initialization started');
      const bridge = await withTimeout(this.loadBridge(), this.timeout);
      if (this.disposed) return false;
      if (typeof bridge?.send !== 'function' || typeof bridge.subscribe !== 'function'
        || typeof bridge.unsubscribe !== 'function') throw new Error('VK Bridge API incomplete');
      this.bridge = bridge;
      this.subscribed = true;
      bridge.subscribe(this.onEvent);
      this.logger.info('[Tower Rush][VK] VKWebAppInit sent');
      const response = await withTimeout(bridge.send('VKWebAppInit'), this.timeout);
      if (this.disposed) return false;
      if (response?.result !== true) throw new Error('VKWebAppInit did not confirm success');
      this.available = true;
      this.status = 'vk-ready';
      this.logger.info('[Tower Rush][VK] VKWebAppInit confirmed');
      return true;
    } catch (error) {
      if (this.disposed) return false;
      this.error = error;
      this.available = false;
      this.status = 'vk-unavailable';
      this.unsubscribe();
      this.paused = false;
      // Do not log launch URLs, signatures, user IDs or bridge response payloads.
      const knownErrors = ['SDK timeout', 'VK Bridge script timeout', 'VK Bridge script unavailable',
        'VK Bridge export unavailable', 'VK Bridge API incomplete', 'VKWebAppInit did not confirm success'];
      const code = Number.isFinite(error?.error_data?.error_code) ? error.error_data.error_code
        : knownErrors.includes(error?.message) ? error.message : 'bridge-error';
      this.logger.warn(`[Tower Rush][VK] initialization failed: ${code}; local gameplay remains available`);
      return false;
    }
  }

  ready() {
    if (this.sentReady || this.disposed) return;
    this.sentReady = true;
    // VKWebAppInit is the confirmed protocol call. Do not invent another game-ready method.
    this.logger.info(`[Tower Rush][VK] game UI ready; status=${this.status}`);
  }

  subscribePause(listener) {
    this.listeners.add(listener);
    if (this.paused) listener(true);
    return () => this.listeners.delete(listener);
  }

  unsubscribe() {
    if (!this.subscribed) return;
    this.subscribed = false;
    try { this.bridge.unsubscribe(this.onEvent); } catch { /* A partial SDK failure must not block the game. */ }
  }

  dispose() {
    this.disposed = true;
    this.available = false;
    this.status = 'vk-disposed';
    this.unsubscribe();
    this.listeners.clear();
  }
}
