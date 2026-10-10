type Ctx = AudioContext;

export class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** 浏览器的自动播放策略要求在用户点击中调用一次才允许发声 */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 6;
      master.connect(comp).connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 拼刀“铛”：accuracy 越高越清脆、余音越长 */
  clang(accuracy: number): void {
    this.run((ctx, out, now) => {
      const base = 1500 + accuracy * 900;
      const ring = 0.25 + accuracy * 0.55;
      const partials = [1, 2.76, 5.4, 8.93];
      partials.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.01);
        const g = ctx.createGain();
        const peak = (0.5 / (i + 1)) * (0.6 + accuracy * 0.4);
        const decay = ring / (1 + i * 0.6);
        g.gain.setValueAtTime(peak, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(g).connect(out);
        osc.start(now);
        osc.stop(now + decay + 0.05);
      });
      this.noiseBurst(ctx, out, now, { duration: 0.04, freq: 6000, q: 0.8, gain: 0.5, type: 'highpass' });
    });
  }

  /** 格挡：闷、短 */
  block(): void {
    this.run((ctx, out, now) => {
      [520, 1240].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12 / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        osc.connect(lp).connect(g).connect(out);
        osc.start(now);
        osc.stop(now + 0.12);
      });
      this.noiseBurst(ctx, out, now, { duration: 0.08, freq: 1400, q: 1.2, gain: 0.6, type: 'bandpass' });
    });
  }

  /** 被击中：低沉的撞击 */
  hurt(): void {
    this.run((ctx, out, now) => {
      this.thump(ctx, out, now, 140, 38, 0.3, 0.9);
      this.noiseBurst(ctx, out, now, { duration: 0.18, freq: 700, q: 0.7, gain: 0.7, type: 'lowpass' });
    });
  }

  /** 玩家挥刀破风 */
  swing(): void {
    this.run((ctx, out, now) => this.whoosh(ctx, out, now, 0.12, 2600, 900, 0.35));
  }

  /** 兽人刀风：更粗更低 */
  heavySwing(): void {
    this.run((ctx, out, now) => this.whoosh(ctx, out, now, 0.18, 900, 260, 0.6));
  }

  /** 出招寒光的“锵”提示 */
  glint(): void {
    this.run((ctx, out, now) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3200, now);
      osc.frequency.exponentialRampToValueAtTime(4200, now + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  /** 上膛：咔-嚓 */
  cock(): void {
    this.run((ctx, out, now) => {
      this.noiseBurst(ctx, out, now, { duration: 0.025, freq: 3200, q: 4, gain: 0.9, type: 'bandpass' });
      this.noiseBurst(ctx, out, now + 0.09, { duration: 0.04, freq: 2100, q: 3, gain: 1, type: 'bandpass' });
      this.thump(ctx, out, now + 0.09, 260, 120, 0.05, 0.25);
    });
  }

  gunshot(): void {
    this.run((ctx, out, now) => {
      this.noiseBurst(ctx, out, now, { duration: 0.16, freq: 2400, q: 0.5, gain: 1, type: 'lowpass' });
      this.thump(ctx, out, now, 180, 50, 0.14, 0.7);
    });
  }

  /** 弹开子弹：清脆的“叮”加跳弹 */
  ricochet(accuracy: number): void {
    this.clang(0.4 + accuracy * 0.6);
    this.run((ctx, out, now) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600, now + 0.03);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 0.32);
    });
  }

  /** 雷管落地的嘀嘀声 */
  beep(): void {
    this.run((ctx, out, now) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1320;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 0.07);
    });
  }

  explosion(): void {
    this.run((ctx, out, now) => {
      this.noiseBurst(ctx, out, now, { duration: 0.9, freq: 900, q: 0.5, gain: 1.2, type: 'lowpass' });
      this.thump(ctx, out, now, 90, 28, 0.7, 1);
    });
  }

  /** 攻击破绽：刀砍进甲片 */
  chop(): void {
    this.run((ctx, out, now) => {
      this.thump(ctx, out, now, 220, 80, 0.1, 0.5);
      this.noiseBurst(ctx, out, now, { duration: 0.07, freq: 2000, q: 1, gain: 0.6, type: 'bandpass' });
    });
  }

  /** 架势崩溃 */
  breakSting(): void {
    this.run((ctx, out, now) => {
      [220, 330, 440].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.04);
        g.gain.linearRampToValueAtTime(0.07, now + i * 0.04 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        osc.connect(lp).connect(g).connect(out);
        osc.start(now);
        osc.stop(now + 0.55);
      });
    });
  }

  execute(): void {
    this.clang(1);
    this.run((ctx, out, now) => {
      this.thump(ctx, out, now, 120, 30, 0.8, 1);
      this.noiseBurst(ctx, out, now, { duration: 0.5, freq: 600, q: 0.6, gain: 0.8, type: 'lowpass' });
    });
  }

  blip(): void {
    this.run((ctx, out, now) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(990, now + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + 0.13);
    });
  }

  private run(fn: (ctx: Ctx, out: AudioNode, now: number) => void): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    fn(this.ctx, this.master, this.ctx.currentTime);
  }

  private noiseBurst(
    ctx: Ctx,
    out: AudioNode,
    at: number,
    o: { duration: number; freq: number; q: number; gain: number; type: BiquadFilterType },
  ): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.value = o.freq;
    f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.duration);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + o.duration + 0.02);
  }

  private thump(ctx: Ctx, out: AudioNode, at: number, from: number, to: number, duration: number, gain: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.05);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.08);
  }

  private whoosh(ctx: Ctx, out: AudioNode, at: number, duration: number, from: number, to: number, gain: number): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + duration + 0.02);
  }
}
