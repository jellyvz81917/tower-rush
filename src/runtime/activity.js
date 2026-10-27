export class Activity {
  reasons = new Set();
  set(reason, blocked) {
    if (blocked) this.reasons.add(reason); else this.reasons.delete(reason);
  }
  get blocked() { return this.reasons.size !== 0; }
}
