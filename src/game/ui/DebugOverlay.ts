import * as Phaser from 'phaser';
import type { ActiveMove, Combat, InputLog } from '../combat/Combat';
import { tuning } from '../data/tuning';
import { H, TOP_BAND, W } from '../layout';
import { monoText } from './text';

const X0 = 40;
const X1 = W - 40;
const Y = H / 2 - 4;
/** 时间条半宽对应的毫秒数，时间条以判定窗口的中点为中心 */
const HALF_SPAN = 450;

const OUTCOME_COLOR: Record<InputLog['outcome'], number> = {
  parry: 0x60ff80,
  deflect: 0x60ff80,
  block: 0xffd040,
  miss: 0xff5040,
  whiff: 0xff5040,
  attack: 0xffffff,
  execute: 0xffffff,
  dodge: 0x60c0ff,
  locked: 0x808080,
};

export class DebugOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly info: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private focus: ActiveMove | null = null;
  private notice = '';
  private noticeUntil = 0;
  visible: boolean;

  constructor(scene: Phaser.Scene, visible: boolean) {
    this.g = scene.add.graphics().setDepth(40);
    this.info = monoText(scene, 12, TOP_BAND + 38, '', '#a0ffb0').setDepth(41).setStroke('#000000', 2);
    this.label = monoText(scene, X0, Y - 11, '', '#ffffff').setDepth(41).setStroke('#000000', 2);
    this.visible = visible;
    this.apply();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.apply();
  }

  reset(): void {
    this.focus = null;
  }

  notify(text: string, realNow: number): void {
    this.notice = text;
    this.noticeUntil = realNow + 1500;
  }

  update(combat: Combat | null, realNow: number): void {
    if (!this.visible) return;
    const g = this.g;
    g.clear();
    if (!combat) {
      this.info.setText(realNow < this.noticeUntil ? this.notice : '');
      this.label.setText('');
      return;
    }
    const t = combat.t;
    const { guard, perfect } = tuning.windows;

    const candidate = combat.moves.find((m) => t <= m.impact + guard.after + 400 && t >= m.start - 100);
    if (candidate) this.focus = candidate;

    const lines = [
      `${combat.enemyState.toUpperCase()} ${Math.max(0, combat.stateUntil - t).toFixed(0)}`,
      `CMB ${combat.comboName || '-'}`,
      `PST ${combat.posture.toFixed(1)}/${tuning.enemy.postureMax}`,
      `HP ${combat.hp} LCK ${Math.max(0, combat.lockUntil - t).toFixed(0)}`,
    ];
    if (realNow < this.noticeUntil) lines.push(this.notice);
    this.info.setText(lines.join('\n'));

    const focus = this.focus;
    g.fillStyle(0x000000, 0.45);
    g.fillRect(X0 - 2, Y - 2, X1 - X0 + 4, 12);
    if (!focus) {
      this.label.setText('');
      return;
    }

    const defendable = focus.spec.type !== 'blast';
    const dodgeWindow = tuning.player.dodgeDuration;
    const center = defendable ? (guard.after - guard.before) / 2 : -dodgeWindow / 2;
    const from = center - HALF_SPAN;
    const to = center + HALF_SPAN;
    const toX = (dt: number) => Phaser.Math.Linear(X0, X1, (dt - from) / (to - from));
    const rect = (from: number, to: number, color: number, alpha: number) => {
      const a = Phaser.Math.Clamp(toX(from), X0, X1);
      const b = Phaser.Math.Clamp(toX(to), X0, X1);
      g.fillStyle(color, alpha);
      g.fillRect(a, Y, Math.max(1, b - a), 8);
    };

    if (defendable) {
      rect(-guard.before, guard.after, 0xffd040, 0.55);
      rect(-perfect.before, perfect.after, 0x60ff80, 0.9);
    } else {
      rect(-dodgeWindow, 0, 0x60c0ff, 0.5);
    }
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.round(toX(0)), Y - 2, 1, 12);

    const startDt = focus.start - focus.impact;
    if (startDt >= from) {
      g.fillStyle(0xff8040, 1);
      g.fillRect(Math.round(toX(startDt)), Y, 1, 8);
    }

    const now = t - focus.impact;
    if (now >= from && now <= to) {
      g.fillStyle(0x40e0ff, 1);
      g.fillRect(Math.round(toX(now)), Y - 3, 1, 14);
    }

    let last: InputLog | null = null;
    for (const entry of combat.log) {
      if (entry.moveId !== focus.id || entry.offset === null) continue;
      last = entry;
      const x = toX(entry.offset);
      if (x < X0 || x > X1) continue;
      g.fillStyle(OUTCOME_COLOR[entry.outcome], 1);
      g.fillRect(Math.round(x), Y + 9, 1, 3);
      g.fillRect(Math.round(x) - 1, Y + 11, 3, 1);
    }

    const parts = [focus.spec.type.toUpperCase(), `${focus.impact - focus.start}ms`];
    if (last) parts.push(describe(last));
    if (focus.result === 'hit' || focus.result === 'evade') parts.push(focus.result.toUpperCase());
    this.label.setText(parts.join(' '));
  }

  private apply(): void {
    this.g.setVisible(this.visible);
    this.info.setVisible(this.visible);
    this.label.setVisible(this.visible);
    if (!this.visible) this.g.clear();
  }
}

function describe(e: InputLog): string {
  const ms = e.offset === null ? '' : ` ${e.offset > 0 ? '+' : ''}${e.offset.toFixed(0)}`;
  switch (e.outcome) {
    case 'parry':
      return `PERFECT${ms}`;
    case 'deflect':
      return `DEFLECT${ms}`;
    case 'block':
      return `GUARD${ms}`;
    case 'miss':
      return `MISS${ms}`;
    case 'whiff':
      return `${e.offset !== null && e.offset > 0 ? 'LATE' : 'EARLY'}${ms}`;
    case 'dodge':
      return `DODGE${ms}`;
    default:
      return e.outcome.toUpperCase();
  }
}
