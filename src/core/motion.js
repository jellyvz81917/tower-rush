import { CONFIG } from '../config.js';

export function positionAt(phase, width) {
  const length = CONFIG.worldWidth - 2 * CONFIG.margin - width;
  const normalized = ((phase % (2 * length)) + 2 * length) % (2 * length);
  return CONFIG.margin + length - Math.abs(normalized - length);
}

export function advanceMotion(moving, step, ticks = 1) {
  const length = CONFIG.worldWidth - 2 * CONFIG.margin - moving.width;
  moving.phase = (moving.phase + step * ticks) % (2 * length);
  moving.x = positionAt(moving.phase, moving.width);
}

export function createMoving(width, floor) {
  const length = CONFIG.worldWidth - 2 * CONFIG.margin - width;
  const phase = floor % 2 ? 0 : length;
  return { width, phase, x: positionAt(phase, width) };
}
