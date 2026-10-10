import * as Phaser from 'phaser';
import type { ActiveMove } from '../combat/Combat';
import { bezier, BLAST_ZONE, enemySlashCurve, ENEMY, FLOOR, muzzlePoint, PLAYER, type Curve, type Pt } from '../layout';

interface TrailStyle {
  outer: number;
  core: number;
  head: number;
  width: number;
  sweep: number;
  life: number;
}

export const ORK_TRAIL: TrailStyle = { outer: 0x5a1a10, core: 0xc8502a, head: 0xffd8a8, width: 5, sweep: 80, life: 230 };
export const PLAYER_TRAIL: TrailStyle = { outer: 0x2a5a8a, core: 0xcfeeff, head: 0xffffff, width: 4, sweep: 70, life: 200 };
export const EXECUTE_TRAIL: TrailStyle = { outer: 0x8a1010, core: 0xffe0e0, head: 0xffffff, width: 7, sweep: 110, life: 420 };

interface Trail {
  curve: Curve;
  start: number;
  /** 0～1，只画到曲线的这一位置，用于在交点处截断 */
  until: number;
  style: TrailStyle;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  colors: number[];
  gravity: number;
}

interface Tracer {
  from: Pt;
  to: Pt;
  start: number;
  travel: number;
  life: number;
  color: number;
}

interface Blast {
  at: Pt;
  start: number;
  life: number;
  radius: number;
}

interface Star {
  at: Pt;
  start: number;
  life: number;
  size: number;
  color: number;
}

export const SPARK_COLORS = [0xffffff, 0xfff2a0, 0xffc040, 0xff7a20, 0x803010];
const BLOOD_COLORS = [0xff6040, 0xc02010, 0x701008];
const DEBRIS_COLORS = [0xffe080, 0xff8030, 0x5a3a2a, 0x2a2420];

const SEGMENTS = 28;

export class Effects {
  private readonly g: Phaser.GameObjects.Graphics;
  private trails: Trail[] = [];
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private blasts: Blast[] = [];
  private stars: Star[] = [];

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    this.g = scene.add.graphics();
    parent.add(this.g);
  }

  clear(): void {
    this.trails = [];
    this.particles = [];
    this.tracers = [];
    this.blasts = [];
    this.stars = [];
  }

  trail(curve: Curve, t: number, style: TrailStyle, until = 1): void {
    this.trails.push({ curve, start: t, until, style });
  }

  sparks(at: Pt, count: number, speed: number, colors = SPARK_COLORS, gravity = 260): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.25,
        age: 0,
        life: 180 + Math.random() * 320,
        size: Math.random() < 0.25 ? 2 : 1,
        colors,
        gravity,
      });
    }
  }

  blood(at: Pt): void {
    this.sparks(at, 14, 90, BLOOD_COLORS, 340);
  }

  tracer(from: Pt, to: Pt, t: number, color = 0xfff0b0, travel = 45): void {
    this.tracers.push({ from, to, start: t, travel, life: 120, color });
  }

  star(at: Pt, t: number, size: number, color = 0xffffff, life = 90): void {
    this.stars.push({ at, start: t, life, size, color });
  }

  explosion(at: Pt, t: number): void {
    this.blasts.push({ at, start: t, life: 650, radius: 76 });
    this.sparks(at, 40, 170, DEBRIS_COLORS, 220);
  }

  /** dt 为战斗时间增量，顿帧期间为 0，所有特效随之冻结 */
  draw(t: number, dt: number, moves: readonly ActiveMove[]): void {
    const g = this.g;
    g.clear();

    for (const m of moves) this.drawTelegraph(m, t);

    this.trails = this.trails.filter((tr) => this.drawTrail(tr, t));
    this.tracers = this.tracers.filter((tr) => this.drawTracer(tr, t));
    this.blasts = this.blasts.filter((b) => this.drawBlast(b, t));
    this.stars = this.stars.filter((s) => this.drawStar(s, t));

    const step = dt / 1000;
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) return false;
      p.vy += p.gravity * step;
      p.vx *= 1 - 1.5 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      const k = p.age / p.life;
      const color = p.colors[Math.min(p.colors.length - 1, Math.floor(k * p.colors.length))];
      g.fillStyle(color, 1);
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      return true;
    });
  }

  private drawTelegraph(m: ActiveMove, t: number): void {
    if (!m.started || m.result !== null || t >= m.impact) return;
    const g = this.g;
    const e = t - m.start;
    const windup = m.impact - m.start;
    const progress = Phaser.Math.Clamp(e / windup, 0, 1);

    if (m.spec.type === 'slash') {
      const curve = enemySlashCurve(m.spec.dir);
      const glintLife = 160;
      if (e < glintLife) {
        this.starShape(curve.p0, 2 + 5 * Math.sin((Math.PI * e) / glintLife), 0xffffff, 1);
      } else {
        const pulse = 0.6 + 0.4 * Math.sin(t / 30);
        this.starShape(curve.p0, 2, 0xffe0c0, pulse);
      }
      if (e > 100) {
        const charge = Phaser.Math.Clamp((e - 100) / Math.max(1, windup - 100), 0, 1);
        for (let i = 0; i <= SEGMENTS; i += 2) {
          const u = i / SEGMENTS;
          const p = bezier(curve, u);
          const lit = u <= charge;
          g.fillStyle(lit ? 0xd86a3a : 0x6a2a1a, lit ? 0.35 + 0.6 * charge * charge : 0.35);
          g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
      }
      return;
    }

    if (m.spec.type === 'shot') {
      const muzzle = muzzlePoint(m.spec.muzzleX);
      if (e < 140) this.starShape(muzzle, 2 + 4 * Math.sin((Math.PI * e) / 140), 0xfff0a0, 1);
      else this.starShape(muzzle, 1, 0xffd060, 0.6 + 0.4 * Math.sin(t / 25));

      g.lineStyle(1, 0xff3020, 0.15 + 0.5 * progress);
      const dashes = 14;
      for (let i = 0; i < dashes; i += 2) {
        const a = i / dashes;
        const b = (i + 1) / dashes;
        g.lineBetween(
          Phaser.Math.Linear(muzzle.x, PLAYER.x, a),
          Phaser.Math.Linear(muzzle.y, PLAYER.y, a),
          Phaser.Math.Linear(muzzle.x, PLAYER.x, b),
          Phaser.Math.Linear(muzzle.y, PLAYER.y, b),
        );
      }

      const r = 4 + 36 * (1 - progress);
      g.lineStyle(1, 0xff4030, 0.4 + 0.6 * progress);
      g.strokeCircle(PLAYER.x, PLAYER.y, r);
      const tick = 4;
      g.lineBetween(PLAYER.x - r - tick, PLAYER.y, PLAYER.x - r + 1, PLAYER.y);
      g.lineBetween(PLAYER.x + r - 1, PLAYER.y, PLAYER.x + r + tick, PLAYER.y);
      g.lineBetween(PLAYER.x, PLAYER.y - r - tick, PLAYER.x, PLAYER.y - r + 1);
      g.lineBetween(PLAYER.x, PLAYER.y + r - 1, PLAYER.x, PLAYER.y + r + tick);
      return;
    }

    const throwEnd = 0.45;
    const zoneAlpha = 0.12 + 0.3 * progress;
    const blink = Math.sin(e / (90 - 60 * progress)) > 0;
    g.fillStyle(0xd01810, zoneAlpha * (blink ? 1.2 : 0.8));
    g.fillEllipse(FLOOR.x, FLOOR.y, BLAST_ZONE.width, BLAST_ZONE.height);
    g.lineStyle(1, 0xff3020, 0.5 + 0.5 * progress);
    g.strokeEllipse(FLOOR.x, FLOOR.y, BLAST_ZONE.width, BLAST_ZONE.height);

    let gx: number;
    let gy: number;
    if (progress < throwEnd) {
      const u = progress / throwEnd;
      gx = Phaser.Math.Linear(ENEMY.x, FLOOR.x, u);
      gy = Phaser.Math.Linear(ENEMY.y, FLOOR.y, u) - Math.sin(Math.PI * u) * 30;
    } else {
      gx = FLOOR.x;
      gy = FLOOR.y;
    }
    g.fillStyle(0x2a2a22, 1);
    g.fillRect(Math.round(gx) - 2, Math.round(gy) - 1, 4, 3);
    if (blink) {
      g.fillStyle(0xff2010, 1);
      g.fillRect(Math.round(gx), Math.round(gy) - 2, 1, 1);
    }
  }

  private drawTrail(tr: Trail, t: number): boolean {
    const { style } = tr;
    const e = t - tr.start;
    if (e > style.sweep + style.life) return false;
    if (e < 0) return true;
    const g = this.g;
    const head = Phaser.Math.Clamp(e / style.sweep, 0, 1) * tr.until;
    const count = Math.max(1, Math.ceil(SEGMENTS * head));

    for (let pass = 0; pass < 2; pass++) {
      let prev = bezier(tr.curve, 0);
      for (let i = 1; i <= count; i++) {
        const u = Math.min(head, i / SEGMENTS);
        const p = bezier(tr.curve, u);
        const born = (u / Math.max(0.0001, tr.until)) * style.sweep;
        const k = 1 - Phaser.Math.Clamp((e - born) / style.life, 0, 1);
        if (k > 0) {
          const w = pass === 0 ? style.width * k + 1 : Math.max(1, style.width * 0.4 * k);
          g.lineStyle(Math.round(w), pass === 0 ? style.outer : style.core, pass === 0 ? 0.7 * k : k);
          g.lineBetween(prev.x, prev.y, p.x, p.y);
        }
        prev = p;
      }
    }

    if (e < style.sweep + 40) {
      const p = bezier(tr.curve, head);
      g.fillStyle(style.head, 1);
      g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    }
    return true;
  }

  private drawTracer(tr: Tracer, t: number): boolean {
    const e = t - tr.start;
    if (e > tr.travel + tr.life) return false;
    if (e < 0) return true;
    const head = Phaser.Math.Clamp(e / tr.travel, 0, 1);
    const tail = Phaser.Math.Clamp((e - 25) / tr.travel, 0, 1);
    const fade = 1 - Phaser.Math.Clamp((e - tr.travel) / tr.life, 0, 1);
    const hx = Phaser.Math.Linear(tr.from.x, tr.to.x, head);
    const hy = Phaser.Math.Linear(tr.from.y, tr.to.y, head);
    const tx = Phaser.Math.Linear(tr.from.x, tr.to.x, tail);
    const ty = Phaser.Math.Linear(tr.from.y, tr.to.y, tail);
    this.g.lineStyle(2, 0xff9030, 0.5 * fade);
    this.g.lineBetween(tx, ty, hx, hy);
    this.g.lineStyle(1, tr.color, fade);
    this.g.lineBetween(tx, ty, hx, hy);
    return true;
  }

  private drawBlast(b: Blast, t: number): boolean {
    const e = t - b.start;
    if (e > b.life) return false;
    const k = e / b.life;
    const g = this.g;
    const r = b.radius * Math.sqrt(Math.min(1, k * 1.6));
    const squash = 0.6;
    let color: number;
    if (k < 0.08) color = 0xffffff;
    else if (k < 0.2) color = 0xffe060;
    else if (k < 0.4) color = 0xff7020;
    else if (k < 0.6) color = 0xb02010;
    else color = 0x1a1210;
    const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    g.fillStyle(color, alpha * 0.9);
    g.fillEllipse(b.at.x, b.at.y - r * 0.3, r * 2, r * 2 * squash);
    if (k < 0.4) {
      g.fillStyle(0xffffff, 1 - k / 0.4);
      g.fillEllipse(b.at.x, b.at.y - r * 0.3, r, r * squash);
    }
    g.lineStyle(1, 0xffc060, Math.max(0, 1 - k * 2));
    g.strokeEllipse(b.at.x, b.at.y, r * 2.6, r * 0.9);
    return true;
  }

  private drawStar(s: Star, t: number): boolean {
    const e = t - s.start;
    if (e > s.life) return false;
    if (e < 0) return true;
    const k = 1 - e / s.life;
    this.starShape(s.at, Math.max(1, s.size * k), s.color, k);
    return true;
  }

  private starShape(at: Pt, size: number, color: number, alpha: number): void {
    const g = this.g;
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    const s = Math.round(size);
    g.fillStyle(color, alpha);
    g.fillRect(x - s, y, s * 2 + 1, 1);
    g.fillRect(x, y - s, 1, s * 2 + 1);
    if (s >= 3) {
      const d = Math.round(s * 0.45);
      g.fillRect(x - d, y - d, 1, 1);
      g.fillRect(x + d, y - d, 1, 1);
      g.fillRect(x - d, y + d, 1, 1);
      g.fillRect(x + d, y + d, 1, 1);
      g.fillRect(x - 1, y - 1, 3, 3);
    }
  }
}
