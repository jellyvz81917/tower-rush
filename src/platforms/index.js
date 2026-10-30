import { BUILD_PLATFORM } from './environment.js';
import { LocalPlatform } from './local.js';
import { YandexPlatform } from './yandex.js';
import { VKPlatform, isVKEnvironment } from './vk.js';

export const createPlatform = ({ buildPlatform = BUILD_PLATFORM, host = globalThis } = {}) => {
  if (buildPlatform === 'yandex') return new YandexPlatform({ host });
  if (buildPlatform === 'auto' && isVKEnvironment(host)) return new VKPlatform({ host });
  return new LocalPlatform();
};
