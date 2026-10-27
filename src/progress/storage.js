import { CONFIG } from '../config.js';

export const KEY = 'tower-rush.progress';
export const BACKUP = `${KEY}.backup`;
export const defaults = () => ({ version: 1, revision: 0, bestScore: 0, bestFloors: 0, sound: true });
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= CONFIG.maxCount;

export function decode(raw) {
  if (typeof raw !== 'string' || raw.length > 131072) return { kind: 'invalid' };
  let value;
  try { value = JSON.parse(raw); } catch { return { kind: 'invalid' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'invalid' };
  if (Number.isInteger(value.version) && value.version > 1) return { kind: 'future' };
  if (value.version !== 1 || !integer(value.revision) || !integer(value.bestScore)
    || !integer(value.bestFloors) || typeof value.sound !== 'boolean') return { kind: 'invalid' };
  return { kind: 'valid', value: {
    version: 1, revision: value.revision, bestScore: value.bestScore,
    bestFloors: value.bestFloors, sound: value.sound,
  } };
}

export class ProgressStore {
  constructor(storage, notify = () => {}) {
    this.storage = storage;
    this.notify = notify;
    this.readonly = false;
    this.data = defaults();
    this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(KEY);
      const main = decode(raw);
      if (main.kind === 'future') {
        this.readonly = true;
        this.notify('Сохранение создано новой версией игры. Оно останется нетронутым.');
        return;
      }
      if (main.kind === 'valid') { this.data = main.value; return; }
      const backup = decode(this.storage.getItem(BACKUP));
      if (backup.kind === 'valid') {
        this.data = backup.value;
        this.notify('Прогресс восстановлен из резервной копии.');
      } else if (raw !== null) {
        this.notify('Не удалось прочитать прогресс. Игра начнётся с исходных значений.');
      }
    } catch {
      this.readonly = true;
      this.notify('Сохранение недоступно. Рекорд останется только до закрытия игры.');
    }
  }

  update(patch) {
    const next = { ...this.data, ...patch, revision: Math.min(CONFIG.maxCount, this.data.revision + 1) };
    const checked = decode(JSON.stringify(next));
    if (checked.kind !== 'valid') throw new TypeError('Invalid progress update');
    this.data = checked.value;
    if (this.readonly) return false;
    try {
      const currentRaw = this.storage.getItem(KEY);
      const current = decode(currentRaw);
      if (current.kind === 'future') {
        this.readonly = true;
        this.notify('Обнаружено сохранение новой версии. Изменения останутся в этой сессии.');
        return false;
      }
      if (current.kind === 'valid') {
        // Another tab may have earned a higher record since this store loaded.
        this.data = {
          ...this.data,
          bestScore: Math.max(this.data.bestScore, current.value.bestScore),
          bestFloors: Math.max(this.data.bestFloors, current.value.bestFloors),
          sound: Object.hasOwn(patch, 'sound') ? this.data.sound : current.value.sound,
          revision: Math.min(CONFIG.maxCount, Math.max(this.data.revision, current.value.revision + 1)),
        };
        this.storage.setItem(BACKUP, currentRaw);
      }
      this.storage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      this.readonly = true;
      this.notify('Не удалось сохранить прогресс. Игра продолжится без сохранения.');
      return false;
    }
  }
}
