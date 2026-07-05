// Procedural sound effects and music via WebAudio — no asset files needed.
// iOS blocks audio until a user gesture, so the AudioContext is created
// lazily by unlock(), which main.js calls on the first touch/click/key.
// Everything routes through a master gain so mute is a single knob.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('galactic-escape-muted') === '1';
    // Music state
    this.musicMode = 'wave'; // 'wave' | 'boss'
    this.musicTimer = null;
    this.nextNote = 0;
    this.step = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this._startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('galactic-escape-muted', muted ? '1' : '0');
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  setPaused(paused) {
    if (!this.ctx) return;
    if (paused) this.ctx.suspend();
    else this.ctx.resume();
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
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  _noise({ duration = 0.3, volume = 0.25, at = null }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = at ?? this.ctx.currentTime;
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
    src.connect(gain).connect(this.master);
    src.start(t0);
  }

  // ---- music ----------------------------------------------------------
  // A four-bar A-minor loop (Am F C G): bass on the beats, a square arp on
  // top, noise hats on the offbeats. Boss mode: faster tempo, saw bass,
  // denser arp. All scheduled ahead of time against the audio clock.

  _startMusic() {
    if (this.musicTimer) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 120);
  }

  _scheduleMusic() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const lookahead = 0.35;
    while (this.nextNote < this.ctx.currentTime + lookahead) {
      this._playStep(this.step, this.nextNote);
      const bpm = this.musicMode === 'boss' ? 132 : 104;
      this.nextNote += 60 / bpm / 4; // 16th notes
      this.step = (this.step + 1) % 64;
    }
  }

  _playStep(step, t) {
    const boss = this.musicMode === 'boss';
    // Am, F, C, G triads (root, third, fifth in Hz)
    const chords = [
      [110.0, 130.8, 164.8],
      [87.3, 110.0, 130.8],
      [130.8, 164.8, 196.0],
      [98.0, 123.5, 146.8],
    ];
    const ch = chords[Math.floor(step / 16)];

    // Bass on every beat
    if (step % 4 === 0) {
      this._noteAt(boss ? 'sawtooth' : 'triangle', ch[0] / 2, t, 0.24, boss ? 0.09 : 0.07);
    }
    // Hats on the offbeat eighths
    if (step % 4 === 2) this._noise({ duration: 0.03, volume: 0.015, at: t });
    // Arp: every 16th in boss mode, every eighth otherwise
    if (boss || step % 2 === 0) {
      const arp = [ch[0] * 2, ch[1] * 2, ch[2] * 2, ch[1] * 2];
      this._noteAt('square', arp[step % 4], t, 0.1, 0.022);
    }
  }

  _noteAt(type, freq, t, dur, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // ---- effects ---------------------------------------------------------

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
  pickup()  {
    this._tone({ type: 'sine', from: 600, to: 1200, duration: 0.12, volume: 0.15 });
    this._tone({ type: 'triangle', from: 900, to: 1800, duration: 0.2, volume: 0.12 });
  }
  life() {
    this._tone({ type: 'triangle', from: 523, to: 1046, duration: 0.35, volume: 0.18 });
    this._tone({ type: 'sine', from: 784, to: 1568, duration: 0.45, volume: 0.12 });
  }
  missile() {
    this._noise({ duration: 0.3, volume: 0.15 });
    this._tone({ type: 'sawtooth', from: 140, to: 50, duration: 0.4, volume: 0.15 });
  }
  bossWarn() {
    this._tone({ type: 'sawtooth', from: 180, to: 360, duration: 0.5, volume: 0.18 });
    this._tone({ type: 'sawtooth', from: 120, to: 240, duration: 0.5, volume: 0.13 });
  }
  bossDown() {
    this._noise({ duration: 0.6, volume: 0.3 });
    this._tone({ type: 'triangle', from: 200, to: 40, duration: 0.8, volume: 0.25 });
  }
  enemyLaser() { this._tone({ type: 'square', from: 400, to: 140, duration: 0.12, volume: 0.1 }); }
}
