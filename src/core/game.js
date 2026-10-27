import { CONFIG, stepForFloor, toleranceForFloor } from '../config.js';
import { placement } from './geometry.js';
import { createMoving, advanceMotion } from './motion.js';
import { addCount, perfectPoints } from './scoring.js';

export class Game {
  constructor() { this.reset(); }

  reset() {
    this.runId = (this.runId || 0) + 1;
    this.continueUsed = false;
    this.phase = 'moving';
    this.score = 0;
    this.floors = 0;
    this.perfect = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.tick = 0;
    this.settlingLeft = 0;
    this.top = { x: CONFIG.initialX, width: CONFIG.initialWidth, floor: 0 };
    this.blocks = [this.top];
    this.moving = createMoving(this.top.width, 1);
  }

  canContinue() {
    return this.phase === 'failed' && !this.continueUsed
      && Number.isSafeInteger(this.top.width) && this.top.width > 0
      && Number.isSafeInteger(this.top.x) && this.top.x >= CONFIG.margin
      && this.top.x + this.top.width <= CONFIG.worldWidth - CONFIG.margin;
  }

  continueAfterReward(runId) {
    if (this.runId !== runId || !this.canContinue()) return false;
    this.continueUsed = true;
    this.combo = 0;
    this.moving = createMoving(this.top.width, this.floors + 1);
    this.phase = 'moving';
    return true;
  }

  advance(ticks) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError('Invalid tick count');
    for (let i = 0; i < ticks; i += 1) {
      if (this.phase === 'failed') break;
      this.tick += 1;
      if (this.phase === 'settling') {
        this.settlingLeft -= 1;
        if (this.settlingLeft === 0) {
          this.moving = createMoving(this.top.width, this.floors + 1);
          this.phase = 'moving';
        }
      } else {
        advanceMotion(this.moving, stepForFloor(this.floors + 1));
      }
    }
  }

  place() {
    if (this.phase !== 'moving') return null;
    const result = placement(this.top, this.moving,
      toleranceForFloor(this.floors + 1, this.top.width));
    if (result.kind === 'miss') {
      this.phase = 'failed';
      return { ...result, floor: this.floors + 1, points: 0 };
    }
    this.floors = addCount(this.floors, 1);
    this.combo = result.kind === 'perfect' ? addCount(this.combo, 1) : 0;
    this.perfect = addCount(this.perfect, result.kind === 'perfect' ? 1 : 0);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = this.combo ? perfectPoints(this.combo) : 10;
    this.score = addCount(this.score, points);
    this.top = { x: result.x, width: result.width, floor: this.floors };
    this.blocks.push(this.top);
    if (this.blocks.length > CONFIG.visibleBlocks) this.blocks.shift();
    this.phase = 'settling';
    this.settlingLeft = CONFIG.settlingTicks;
    return { ...result, floor: this.floors, points };
  }
}
