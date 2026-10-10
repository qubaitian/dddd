import * as Phaser from 'phaser';
import type { Combat } from '../combat/Combat';
import { lore } from '../data/lore';
import { tuning } from '../data/tuning';
import { BOTTOM_BAND as B, CX, ENEMY, H, HORIZON_Y, TOP_BAND as T, W } from '../layout';
import { cjkText, monoText } from './text';

const HUD_GREEN = 0x7fd88a;
const FRAME_DARK = 0x0d110f;
const FRAME_EDGE = 0x34443a;

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

function fillPoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]): void {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

export function drawBackground(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): void {
  const g = scene.add.graphics();
  parent.add(g);
  const left = -40;
  const right = W + 40;

  const sky = [0x0a0808, 0x0e0a09, 0x130c0a, 0x1a0f0b, 0x24130c, 0x2f170d];
  const band = Math.ceil((HORIZON_Y + 40) / sky.length);
  sky.forEach((c, i) => {
    g.fillStyle(c, 1);
    g.fillRect(left, -40 + i * band, right - left, band);
    if (i + 1 < sky.length) {
      g.fillStyle(sky[i + 1], 1);
      for (let x = left; x < right; x += 2) g.fillRect(x + (i % 2), -40 + (i + 1) * band - 1, 1, 1);
    }
  });

  const rand = new Phaser.Math.RandomDataGenerator(['dddd']);
  g.fillStyle(0x120c0a, 1);
  for (let x = left; x < right; ) {
    const w = rand.between(6, 18);
    const h = rand.between(4, 22);
    g.fillRect(x, HORIZON_Y - h, w, h);
    x += w + rand.between(0, 6);
  }

  g.fillStyle(0x1b1612, 1);
  g.fillRect(left, HORIZON_Y, right - left, H + 40 - HORIZON_Y);

  g.lineStyle(1, 0x29211b, 1);
  for (let i = -8; i <= 8; i++) {
    g.lineBetween(CX + i * 8, HORIZON_Y, CX + i * 90, H + 40);
  }
  for (let k = 1; k < 12; k++) {
    const y = HORIZON_Y + k * k * 1.6;
    if (y > H + 40) break;
    g.lineBetween(left, y, right, y);
  }

  for (let i = 0; i < 40; i++) {
    g.fillStyle(rand.pick([0x2a2018, 0x231b15, 0x332619]), 1);
    g.fillRect(rand.between(left, right), rand.between(HORIZON_Y + 4, H + 30), rand.between(1, 3), 1);
  }
}

export class Hud {
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly message: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly readoutRight: Phaser.GameObjects.Text;
  private flashes: Flash[] = [];
  private cracks: Crack[] = [];
  private hpGhost = tuning.player.maxHp;

  constructor(private readonly scene: Phaser.Scene) {
    this.bars = scene.add.graphics().setDepth(20);
    this.drawFrame();
    this.bars.setDepth(21);
    this.overlay = scene.add.graphics().setDepth(30);
    this.drawScanlines();

    monoText(scene, 8, 4, lore.enemyName, '#c8a050').setDepth(22);
    monoText(scene, 8, B + 7, lore.playerLabel, '#7fd88a').setDepth(22);
    monoText(scene, 12, T + 6, lore.readoutsLeft.join('\n'), '#5f9f69').setDepth(22).setAlpha(0.7);
    this.readoutRight = monoText(scene, W - 12, T + 6, '', '#5f9f69').setDepth(22).setAlpha(0.7).setOrigin(1, 0).setAlign('right');

    cjkText(scene, 24, B + 27, lore.dodge, 11, '#5f9f69').setDepth(22).setAlpha(0.8);
    cjkText(scene, W - 24, B + 27, lore.slash, 11, '#5f9f69').setDepth(22).setAlpha(0.8);

    this.message = cjkText(scene, CX, 78, '', 18, '#ffd860').setDepth(25).setStroke('#000000', 3);
    this.title = cjkText(scene, CX, 96, '', 22, '#ffe0a0').setDepth(26).setStroke('#000000', 4);
    this.subtitle = cjkText(scene, CX, 122, '', 11, '#cfe8d0').setDepth(26).setStroke('#000000', 3);
    this.hint = cjkText(scene, CX, 174, '', 10, '#9fd8a8').setDepth(26).setStroke('#000000', 3);
  }

  showTitle(): void {
    this.title.setText(lore.title);
    this.subtitle.setText(lore.start);
    this.hint.setText(lore.controlsHint);
  }

  showResult(win: boolean): void {
    this.title.setText(win ? lore.win : lore.lose).setColor(win ? '#ffe0a0' : '#ff6050');
    this.subtitle.setText('');
    this.hint.setText('');
  }

  showRestartHint(): void {
    this.subtitle.setText(lore.restart);
  }

  clearScreens(): void {
    this.title.setText('').setColor('#ffe0a0');
    this.subtitle.setText('');
    this.hint.setText('');
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
    const g = this.bars;
    g.clear();

    const max = tuning.enemy.postureMax;
    const posture = combat?.posture ?? 0;
    const ratio = Phaser.Math.Clamp(posture / max, 0, 1);
    const broken = combat?.enemyState === 'broken';
    const bx = 48;
    const bw = W - 2 * bx;
    const by = 6;
    g.fillStyle(0x000000, 0.7);
    g.fillRect(bx - 1, by - 1, bw + 2, 7);
    g.lineStyle(1, FRAME_EDGE, 1);
    g.strokeRect(bx - 1.5, by - 1.5, bw + 3, 8);
    const half = Math.round((bw / 2) * ratio);
    let color = ratio < 0.5 ? 0xd8b040 : ratio < 0.8 ? 0xe07a30 : 0xe03a2a;
    if (broken) color = Math.floor(t / 80) % 2 ? 0xff2020 : 0xffffff;
    g.fillStyle(color, 1);
    g.fillRect(CX - half, by, half * 2, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(CX, by - 1, 1, 7);

    const maxHp = tuning.player.maxHp;
    const hp = combat?.hp ?? maxHp;
    this.hpGhost = Math.max(hp, this.hpGhost - 0.04 * maxHp * (1 / 6));
    const hx = 26;
    const hw = W - hx - 14;
    const hy = B + 9;
    g.fillStyle(0x000000, 0.7);
    g.fillRect(hx - 1, hy - 1, hw + 2, 6);
    g.lineStyle(1, FRAME_EDGE, 1);
    g.strokeRect(hx - 1.5, hy - 1.5, hw + 3, 7);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(hx, hy, Math.round((hw * this.hpGhost) / maxHp), 4);
    const hpRatio = hp / maxHp;
    g.fillStyle(hpRatio > 0.3 ? HUD_GREEN : Math.floor(t / 150) % 2 ? 0xff4030 : 0x802010, 1);
    g.fillRect(hx, hy, Math.round(hw * hpRatio), 4);

    if (combat) {
      const lock = Math.max(0, combat.lockUntil - combat.t);
      if (lock > 0 && !combat.isDodgingAt(combat.t)) {
        g.fillStyle(0xff8040, 0.8);
        g.fillRect(hx, hy + 5, Math.min(hw, Math.round(lock / 6)), 1);
      }
      const secs = Math.floor(combat.t / 1000);
      this.readoutRight.setText(
        [`${lore.readoutsRight[0]} ${Math.round(100 * hpRatio)}%`, lore.readoutsRight[1], `T+${secs.toString().padStart(3, '0')}`].join('\n'),
      );
    } else {
      this.readoutRight.setText(lore.readoutsRight.join('\n'));
    }

    if (combat?.enemyState === 'opening') {
      this.message.setText(lore.opening).setColor('#ffd860').setVisible(Math.floor(t / 120) % 4 !== 0);
    } else if (broken) {
      this.message.setText(lore.execute).setColor('#ff4030').setVisible(true);
      const pulse = 4 + Math.sin(t / 60) * 1.5;
      g.fillStyle(0xff1010, 1);
      g.fillCircle(ENEMY.x, ENEMY.y, pulse);
      g.lineStyle(1, 0xff4030, 0.8);
      g.strokeCircle(ENEMY.x, ENEMY.y, 9 + ((t / 8) % 12));
    } else {
      this.message.setVisible(false);
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

  private drawFrame(): void {
    const g = this.scene.add.graphics().setDepth(20);
    g.fillStyle(FRAME_DARK, 1);
    const top = [
      { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: T }, { x: W - 40, y: T },
      { x: W - 48, y: T - 5 }, { x: 48, y: T - 5 }, { x: 40, y: T }, { x: 0, y: T },
    ];
    const leftPillar = [
      { x: 0, y: T }, { x: 10, y: T + 4 }, { x: 6, y: 70 }, { x: 6, y: 170 }, { x: 12, y: B }, { x: 0, y: B + 4 },
    ];
    const bottom = [
      { x: 0, y: B + 4 }, { x: 12, y: B }, { x: 40, y: B - 2 }, { x: W - 40, y: B - 2 },
      { x: W - 12, y: B }, { x: W, y: B + 4 }, { x: W, y: H }, { x: 0, y: H },
    ];
    fillPoly(g, top);
    fillPoly(g, leftPillar);
    fillPoly(g, leftPillar.map((p) => ({ x: W - p.x, y: p.y })));
    fillPoly(g, bottom);

    g.lineStyle(1, FRAME_EDGE, 1);
    const innerEdge = [
      top[7], top[6], top[5], top[4], top[3],
    ];
    const leftEdge = [leftPillar[1], leftPillar[2], leftPillar[3], leftPillar[4], bottom[2]];
    const stroke = (pts: { x: number; y: number }[]) => {
      for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1].x + 0.5, pts[i - 1].y + 0.5, pts[i].x + 0.5, pts[i].y + 0.5);
    };
    stroke(innerEdge);
    stroke(leftEdge);
    stroke(leftEdge.map((p) => ({ x: W - p.x, y: p.y })));
    stroke([bottom[2], bottom[3]]);

    g.fillStyle(0x1c2620, 1);
    for (const x of [3, W - 5]) {
      for (let y = 84; y < 156; y += 8) g.fillRect(x, y, 2, 4);
    }
  }

  private drawScanlines(): void {
    const g = this.scene.add.graphics().setDepth(31);
    g.fillStyle(0x000000, 0.12);
    for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
    g.fillStyle(0x30ff60, 0.025);
    g.fillRect(0, 0, W, H);
  }
}
