export class Synth {
  constructor(enabled = true) {
    this.enabled = enabled; this.blocked = false; this.context = null;
    this.voices = new Set(); this.master = null;
  }
  unlock() {
    if (!this.enabled || this.blocked) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context ??= new Audio();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      this.master.gain.setValueAtTime(1, this.context.currentTime);
      if (this.context.state === 'suspended') this.context.resume().then(() => {
        if (!this.enabled || this.blocked) this.sync();
      }).catch(() => {});
    } catch { /* Audio is optional; gameplay remains available. */ }
  }
  setEnabled(enabled) { this.enabled = enabled; this.sync(); }
  setBlocked(blocked) { this.blocked = blocked; this.sync(); }
  sync() {
    if ((!this.enabled || this.blocked) && this.context) {
      this.master?.gain.setValueAtTime(0, this.context.currentTime);
      for (const voice of this.voices) {
        try { voice.stop(); } catch { /* Already ended. */ }
      }
      this.voices.clear();
      this.context.suspend().catch(() => {});
    }
  }
  play(kind, combo = 1) {
    if (!this.enabled || this.blocked) return;
    this.unlock();
    const context = this.context;
    if (!context) return;
    const patterns = {
      button: [440], normal: [220, 330], perfect: [523, 659, 784],
      miss: [180, 120, 80],
    };
    const notes = patterns[kind] || patterns.button;
    try {
      notes.forEach((frequency, i) => {
        const start = context.currentTime + i * 0.055;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency * (kind === 'perfect' ? 1 + Math.min(combo - 1, 8) * 0.025 : 1), start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(this.master);
        this.voices.add(oscillator);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
        oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Unsupported audio must not interrupt a run. */ }
  }
}
