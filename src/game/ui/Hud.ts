import * as Phaser from 'phaser';
import type { Combat } from '../combat/Combat';
import { tuning } from '../data/tuning';
import { BOTTOM_BAND as B, ENEMY, H, W } from '../layout';
import { BACKGROUND_KEY, hudKey, opaqueBounds, type Bounds, type HudLayer } from './assets';

const HUD_GREEN = 0x7fd88a;

interface Flash {
  color: number;
  alpha: number;
  start: number;
  life: number;
}

interface Crack {
  lines: number[][];
  start: number;
  life: number;
}

export function addBackground(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): void {
  parent.add(scene.add.image(W / 2, H / 2, BACKGROUND_KEY));
}

export class Hud {
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly postureFill: Phaser.GameObjects.Image;
  private readonly hpGhostFill: Phaser.GameObjects.Image;
  private readonly hpFill: Phaser.GameObjects.Image;
  private readonly postureBounds: Bounds;
  private readonly hpBounds: Bounds;
  private flashes: Flash[] = [];
  private cracks: Crack[] = [];
  private hpGhost = tuning.player.maxHp;

  constructor(scene: Phaser.Scene) {
    const layer = (name: HudLayer, depth: number) => scene.add.image(0, 0, hudKey(name)).setOrigin(0).setDepth(depth);
    layer('frame', 20);
    layer('frame-edge', 20);
    layer('vents', 20);
    layer('posture-back', 21);
    this.postureFill = layer('posture-fill', 21);
    layer('posture-mark', 21);
    layer('hp-back', 21);
    this.hpGhostFill = layer('hp-fill', 21).setAlpha(0.6);
    this.hpFill = layer('hp-fill', 21);
    this.postureBounds = opaqueBounds(scene, hudKey('posture-fill'));
    this.hpBounds = opaqueBounds(scene, hudKey('hp-fill'));
    this.marks = scene.add.graphics().setDepth(21);
    this.overlay = scene.add.graphics().setDepth(30);
    layer('scanlines', 31);
    layer('visor-tint', 31);
  }

  reset(): void {
    this.flashes = [];
    this.cracks = [];
    this.hpGhost = tuning.player.maxHp;
  }

  flash(t: number, color: number, alpha: number, life: number): void {
    this.flashes.push({ color, alpha, start: t, life });
  }

  crack(t: number): void {
    const cx = Phaser.Math.Between(50, W - 50);
    const cy = Phaser.Math.Between(110, B - 24);
    const lines: number[][] = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      let x = cx;
      let y = cy;
      const pts = [x, y];
      for (let s = 0; s < 3; s++) {
        const len = 5 + Math.random() * 9;
        const aa = a + (Math.random() - 0.5) * 0.8;
        x += Math.cos(aa) * len;
        y += Math.sin(aa) * len;
        pts.push(x, y);
      }
      lines.push(pts);
    }
    this.cracks.push({ lines, start: t, life: 1600 });
  }

  update(t: number, combat: Combat | null): void {
    const g = this.marks;
    g.clear();

    const max = tuning.enemy.postureMax;
    const posture = combat?.posture ?? 0;
    const ratio = Phaser.Math.Clamp(posture / max, 0, 1);
    const broken = combat?.enemyState === 'broken';
    const pb = this.postureBounds;
    const half = Math.round((pb.width / 2) * ratio);
    let color = ratio < 0.5 ? 0xd8b040 : ratio < 0.8 ? 0xe07a30 : 0xe03a2a;
    if (broken) color = Math.floor(t / 80) % 2 ? 0xff2020 : 0xffffff;
    this.postureFill
      .setVisible(half > 0)
      .setCrop(pb.x + pb.width / 2 - half, pb.y, half * 2, pb.height)
      .setTint(color);

    const maxHp = tuning.player.maxHp;
    const hp = combat?.hp ?? maxHp;
    const hpRatio = hp / maxHp;
    this.hpGhost = Math.max(hp, this.hpGhost - 0.04 * maxHp * (1 / 6));
    const hb = this.hpBounds;
    const ghostWidth = Math.round((hb.width * this.hpGhost) / maxHp);
    const hpWidth = Math.round(hb.width * hpRatio);
    this.hpGhostFill.setVisible(ghostWidth > 0).setCrop(hb.x, hb.y, ghostWidth, hb.height);
    this.hpFill
      .setVisible(hpWidth > 0)
      .setCrop(hb.x, hb.y, hpWidth, hb.height)
      .setTint(hpRatio > 0.3 ? HUD_GREEN : Math.floor(t / 150) % 2 ? 0xff4030 : 0x802010);

    if (combat) {
      const lock = Math.max(0, combat.lockUntil - combat.t);
      if (lock > 0 && !combat.isDodgingAt(combat.t)) {
        g.fillStyle(0xff8040, 0.8);
        g.fillRect(hb.x, hb.y + hb.height + 1, Math.min(hb.width, Math.round(lock / 6)), 1);
      }
    }

    if (broken) {
      const pulse = 4 + Math.sin(t / 60) * 1.5;
      g.fillStyle(0xff1010, 1);
      g.fillCircle(ENEMY.x, ENEMY.y, pulse);
      g.lineStyle(1, 0xff4030, 0.8);
      g.strokeCircle(ENEMY.x, ENEMY.y, 9 + ((t / 8) % 12));
    }

    this.drawOverlay(t);
  }

  private drawOverlay(t: number): void {
    const g = this.overlay;
    g.clear();
    this.cracks = this.cracks.filter((c) => {
      const k = (t - c.start) / c.life;
      if (k >= 1) return false;
      g.lineStyle(1, 0xd8f0ff, 0.6 * (1 - k));
      for (const pts of c.lines) {
        for (let i = 2; i < pts.length; i += 2) g.lineBetween(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]);
      }
      return true;
    });
    this.flashes = this.flashes.filter((f) => {
      const k = (t - f.start) / f.life;
      if (k >= 1) return false;
      g.fillStyle(f.color, f.alpha * (1 - k));
      g.fillRect(0, 0, W, H);
      return true;
    });
  }
}
