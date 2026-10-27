import { CONFIG } from '../config.js';

export class FixedClock {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.remainder = 0; }
  consume(now) {
    if (this.previous === null) { this.previous = now; return 0; }
    const elapsed = Math.max(0, Math.min(now - this.previous, CONFIG.maxFrameMs));
    this.previous = now;
    this.remainder += elapsed;
    const steps = Math.min(CONFIG.maxSteps, Math.floor((this.remainder + 1e-8) / CONFIG.tickMs));
    this.remainder = Math.max(0, this.remainder - steps * CONFIG.tickMs);
    return steps;
  }
}
