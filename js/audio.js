// Procedural sound effects via WebAudio — no asset files needed.
// iOS blocks audio until a user gesture, so the AudioContext is created
// lazily by unlock(), which main.js calls on the first touch/click/key.

export class Sound {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) this.ctx = new Ctx();
  }

  _tone({ type = 'square', from = 440, to = 440, duration = 0.1, volume = 0.15 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  _noise({ duration = 0.3, volume = 0.25 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.ctx.destination);
    src.start(t0);
  }

  laser()     { this._tone({ type: 'square', from: 880, to: 220, duration: 0.08, volume: 0.08 }); }
  explosion() { this._noise({ duration: 0.35, volume: 0.2 }); }
  hit()       { this._tone({ type: 'sawtooth', from: 200, to: 60, duration: 0.3, volume: 0.2 }); }
  gameOver()  { this._tone({ type: 'triangle', from: 440, to: 55, duration: 0.9, volume: 0.2 }); }
  shieldBreak() {
    this._tone({ type: 'triangle', from: 700, to: 90, duration: 0.35, volume: 0.18 });
    this._noise({ duration: 0.2, volume: 0.12 });
  }
  armorUp()   { this._tone({ type: 'triangle', from: 300, to: 900, duration: 0.3, volume: 0.18 }); }
  armorHit()  {
    this._tone({ type: 'square', from: 150, to: 70, duration: 0.15, volume: 0.2 });
    this._noise({ duration: 0.1, volume: 0.15 });
  }
}
