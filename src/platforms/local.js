export class LocalPlatform {
  status = 'local';
  available = false;
  language = null;
  paused = false;
  async init() { return false; }
  ready() {}
  setGameplayActive() {}
  supports() { return false; }
  subscribePause() { return () => {}; }
  dispose() {}
}
