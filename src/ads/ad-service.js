export class AdService {
  constructor(platform, { onChange = () => {}, schedule = setTimeout, cancel = clearTimeout,
    requestTimeout = 12000, closeTimeout = 120000 } = {}) {
    this.platform = platform;
    this.onChange = onChange;
    // Browser timer functions cannot receive AdService as their receiver.
    this.schedule = (callback, delay) => schedule(callback, delay);
    this.cancel = timer => cancel(timer);
    this.requestTimeout = requestTimeout;
    this.closeTimeout = closeTimeout;
    this.active = null;
    this.sequence = 0;
    this.disabled = false;
    this.orphans = new Set();
    this.orphanTimers = new Map();
    this.state = 'idle';
  }
  get busy() { return Boolean(this.active) || this.orphans.size > 0; }
  supports(kind) { return !this.disabled && this.platform.supports(kind); }
  emit() { this.onChange({ state: this.state, busy: this.busy, recoverable: this.state === 'stalled' }); }

  request(kind, context) {
    if (this.busy) return Promise.resolve({ status: 'busy', rewarded: false, context });
    if (!this.supports(kind) || this.platform.paused) return Promise.resolve({ status: 'unavailable', rewarded: false, context });
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const operation = { id: ++this.sequence, kind, context, resolve, opened: false, rewarded: false, expired: false };
    this.active = operation;
    this.state = 'requesting'; this.emit();

    const finish = (status, shown = false) => {
      this.cancel(operation.timer);
      this.cancel(this.orphanTimers.get(operation.id));
      this.orphanTimers.delete(operation.id);
      if (this.orphans.delete(operation.id)) this.emit();
      if (this.active !== operation || operation.expired) return;
      this.active = null;
      operation.expired = true;
      this.state = status;
      const rewarded = kind === 'rewarded' && status === 'closed' && operation.rewarded;
      this.emit();
      resolve({ status, rewarded, shown, context, requestId: operation.id });
    };
    operation.finish = finish;
    operation.timer = this.schedule(() => {
      this.disabled = true; // Never overlap a new request with an unknown SDK operation.
      finish('timeout');
    }, this.requestTimeout);
    const callbacks = {
      onOpen: () => {
        if (operation.expired || this.active !== operation) {
          // A late native overlay must still mute and pause the game.
          if (this.orphans.has(operation.id)) return;
          this.disabled = true;
          this.orphans.add(operation.id);
          this.state = 'showing';
          this.orphanTimers.set(operation.id, this.schedule(() => {
            if (!this.orphans.has(operation.id)) return;
            this.state = 'stalled'; this.emit();
          }, this.closeTimeout));
          this.emit(); return;
        }
        if (operation.opened) return;
        operation.opened = true;
        this.cancel(operation.timer);
        this.state = operation.rewarded ? 'rewarded' : 'showing';
        operation.timer = this.schedule(() => {
          if (this.active !== operation) return;
          this.disabled = true;
          this.state = 'stalled'; this.emit();
          // Only an explicit user action can dismiss an opened operation without onClose.
        }, this.closeTimeout);
        this.emit();
      },
      onRewarded: () => {
        if (kind !== 'rewarded' || this.active !== operation || operation.expired || operation.rewarded) return;
        operation.rewarded = true;
        if (this.state !== 'stalled') this.state = 'rewarded';
        this.emit();
      },
      onClose: shown => finish('closed', kind === 'rewarded' ? operation.opened : Boolean(shown)),
      onError: () => finish('error'),
    };
    try { this.platform.requestAd(kind, callbacks); }
    catch { finish('error'); }
    return promise;
  }

  recover() {
    if (this.state !== 'stalled' || !this.busy) return false;
    this.disabled = true;
    for (const timer of this.orphanTimers.values()) this.cancel(timer);
    this.orphanTimers.clear(); this.orphans.clear();
    if (this.active) this.active.finish('error');
    else { this.state = 'error'; this.emit(); }
    return true;
  }
}

export class InterstitialPolicy {
  constructor({ minimumRuns = 3, interval = 120000 } = {}) {
    this.minimumRuns = minimumRuns;
    this.interval = interval;
    this.finished = 0;
    this.lastRequest = null;
    this.rewardedThisRun = false;
  }
  finishRun(continued) { this.finished += 1; this.rewardedThisRun = continued; }
  take(now) {
    if (this.finished < this.minimumRuns || this.rewardedThisRun) return false;
    if (this.lastRequest !== null && now - this.lastRequest < this.interval) return false;
    this.lastRequest = now;
    return true;
  }
}
