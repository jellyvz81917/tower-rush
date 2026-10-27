import { CONFIG } from '../config.js';

export const addCount = (value, delta) => Math.min(CONFIG.maxCount, value + delta);
export const perfectPoints = combo => 15 + 2 * Math.min(combo - 1, 9);
export const earnedRunCoins = (floors, perfect) => Math.floor(floors / 5) + Math.floor(perfect / 3);
