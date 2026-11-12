// Small synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem('andbasadoren.muted') === '1';
} catch {
  /* ignore */
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('andbasadoren.muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = m ? 0 : 0.5;
}

/** Browsers only allow audio after a user gesture. */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slideTo?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(opts.vol ?? 0.3, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { vol?: number; freq?: number; q?: number; delay?: number; type?: BiquadFilterType } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.04 * white) / 1.04;
    d[i] = opts.type === 'lowpass' ? last * 3.5 : white;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 900;
  f.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(opts.vol ?? 0.3, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  stroke() {
    noise(0.45, { freq: 700, q: 0.6, vol: 0.18 });
    tone(90, 0.25, { type: 'sine', vol: 0.15, slideTo: 55 });
  },
  done() {
    tone(660, 0.18, { type: 'triangle', vol: 0.22 });
    tone(990, 0.3, { type: 'triangle', vol: 0.2, delay: 0.09 });
  },
  wrong() {
    tone(180, 0.3, { type: 'square', vol: 0.08, slideTo: 120 });
  },
  click() {
    tone(1200, 0.04, { type: 'square', vol: 0.04 });
  },
  alert() {
    tone(1320, 0.6, { type: 'sine', vol: 0.18 });
    tone(1980, 0.4, { type: 'sine', vol: 0.06 });
  },
  bell() {
    tone(880, 0.9, { type: 'sine', vol: 0.22 });
    tone(2210, 0.5, { type: 'sine', vol: 0.06 });
  },
  horn() {
    tone(110, 1.2, { type: 'sawtooth', vol: 0.12 });
    tone(165, 1.2, { type: 'sawtooth', vol: 0.06 });
  },
  pump() {
    noise(0.2, { freq: 300, q: 1.5, vol: 0.2 });
  },
  splash() {
    noise(0.6, { freq: 1500, q: 0.4, vol: 0.12 });
  },
  quack() {
    const c = ac();
    if (!c || !master) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t0);
    o.frequency.exponentialRampToValueAtTime(300, t0 + 0.22);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1400, t0);
    f.frequency.exponentialRampToValueAtTime(700, t0 + 0.22);
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    o.connect(f).connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 0.3);
  },
  sick() {
    tone(330, 0.5, { type: 'triangle', vol: 0.2, slideTo: 160 });
    tone(250, 0.6, { type: 'triangle', vol: 0.12, slideTo: 110, delay: 0.25 });
  },
  thunder() {
    noise(2.6, { freq: 160, q: 0.3, vol: 0.45, type: 'lowpass' });
  },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.12 }));
  },
};
