import { BUILD_PLATFORM } from './environment.js';
import { LocalPlatform } from './local.js';
import { YandexPlatform } from './yandex.js';

export const createPlatform = () => BUILD_PLATFORM === 'yandex' ? new YandexPlatform() : new LocalPlatform();
