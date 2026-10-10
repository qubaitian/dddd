import * as Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { Combat, type ActiveMove, type CombatEvent } from '../combat/Combat';
import { tuning, TUNING_UPDATED } from '../data/tuning';
import { Effects, EXECUTE_TRAIL, ORK_TRAIL, PLAYER_TRAIL, SPARK_COLORS } from '../fx/Effects';
import {
  enemySlashCurve,
  ENEMY,
  FLOOR,
  muzzlePoint,
  PLAYER,
  PLAYER_ATTACK,
  PLAYER_DEFEND,
  PLAYER_EXECUTE_A,
  PLAYER_EXECUTE_B,
  type Pt,
} from '../layout';
import { DebugOverlay } from '../ui/DebugOverlay';
import { drawBackground, Hud } from '../ui/Hud';

type ScenePhase = 'title' | 'fight' | 'result';

interface DodgeAnim {
  start: number;
  kind: 'side' | 'back';
  dir: number;
}

const DULL_SPARKS = [0xffe0b0, 0xc08040, 0x604030];
const RESTART_DELAY = 800;

export class MainScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private fx!: Effects;
  private hud!: Hud;
  private debug!: DebugOverlay;
  private readonly sfx = new Sfx();

  private combat: Combat | null = null;
  private phase: ScenePhase = 'title';
  /** 战斗时间，顿帧期间停止推进 */
  private t = 0;
  private lastReal = 0;
  private hitstopUntil = 0;
  private pendingShake: { duration: number; intensity: number } | null = null;
  private resultAt = 0;
  private restartHintShown = false;
  private dodgeAnim: DodgeAnim | null = null;
  private nextBeep = new Map<number, number>();

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.phase = 'title';
    this.combat = null;
    this.world = this.add.container(0, 0);
    drawBackground(this, this.world);
    this.fx = new Effects(this, this.world);
    this.hud = new Hud(this);
    this.debug = new DebugOverlay(this, import.meta.env.DEV);
    this.hud.showTitle();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.press(pointer.x < this.scale.width / 2 ? 'dodge' : 'slash');
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      const bind = (keys: string[], fn: () => void) => {
        for (const key of keys) {
          keyboard.on(`keydown-${key}`, (e: KeyboardEvent) => {
            if (!e.repeat) fn();
          });
        }
      };
      bind(['LEFT', 'Z'], () => this.press('dodge'));
      bind(['RIGHT', 'X'], () => this.press('slash'));
      bind(['BACKTICK', 'F2'], () => this.debug.toggle());
    }

    const onTuning = () => this.debug.notify('TUNING RELOADED', performance.now());
    window.addEventListener(TUNING_UPDATED, onTuning);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => window.removeEventListener(TUNING_UPDATED, onTuning));

    this.lastReal = performance.now();
  }

  update(): void {
    const now = performance.now();
    const raw = Math.min(100, now - this.lastReal);
    this.lastReal = now;
    const frozen = now < this.hitstopUntil;
    const dt = frozen ? 0 : raw;
    if (!frozen && this.pendingShake) {
      this.cameras.main.shake(this.pendingShake.duration, this.pendingShake.intensity);
      this.pendingShake = null;
    }
    this.t += dt;

    const combat = this.combat;
    if (combat && this.phase === 'fight') {
      combat.update(this.t);
      this.updateBeeps(combat.moves);
    }

    this.updateDodge();
    this.fx.draw(this.t, dt, combat?.phase === 'fight' ? combat.moves : []);
    this.hud.update(this.t, combat);
    this.debug.update(combat, now);

    if (this.phase === 'result' && !this.restartHintShown && now >= this.resultAt + RESTART_DELAY) {
      this.restartHintShown = true;
      this.hud.showRestartHint();
    }
  }

  private press(action: 'dodge' | 'slash'): void {
    this.sfx.unlock();
    if (this.phase === 'title') {
      this.startFight();
      return;
    }
    if (this.phase === 'result') {
      if (performance.now() >= this.resultAt + RESTART_DELAY) this.startFight();
      return;
    }
    const combat = this.combat;
    if (!combat) return;
    const t = this.inputTime();
    if (action === 'slash') combat.slash(t);
    else combat.dodge(t);
  }

  /** 输入发生在两帧之间，按真实时间补上帧内偏移，避免判定被帧率量化 */
  private inputTime(): number {
    const now = performance.now();
    if (now < this.hitstopUntil) return this.t;
    return this.t + Phaser.Math.Clamp(now - this.lastReal, 0, 50);
  }

  private startFight(): void {
    this.fx.clear();
    this.hud.clearScreens();
    this.debug.reset();
    this.t = 0;
    this.hitstopUntil = 0;
    this.pendingShake = null;
    this.dodgeAnim = null;
    this.nextBeep.clear();
    this.restartHintShown = false;
    this.lastReal = performance.now();
    this.combat = new Combat((e) => this.onCombatEvent(e));
    this.phase = 'fight';
    this.sfx.blip();
  }

  private onCombatEvent(e: CombatEvent): void {
    const t = this.combat?.t ?? this.t;
    switch (e.type) {
      case 'moveStart':
        if (e.move.spec.type === 'slash') this.sfx.glint();
        else if (e.move.spec.type === 'shot') this.sfx.cock();
        else this.sfx.heavySwing();
        break;
      case 'impact':
        this.onImpact(e.move, t);
        break;
      case 'resolve':
        this.onResolve(e.move, t);
        break;
      case 'swing':
        if (e.kind === 'whiff') {
          this.fx.trail(PLAYER_DEFEND, t, PLAYER_TRAIL);
          this.sfx.swing();
        } else if (e.kind === 'attack') {
          this.fx.trail(PLAYER_ATTACK, t, PLAYER_TRAIL);
          this.sfx.swing();
        } else if (e.kind === 'defend') {
          this.sfx.swing();
        }
        break;
      case 'attackHit':
        this.fx.sparks(ENEMY, 12, 100);
        this.fx.star(ENEMY, t, 5, 0xffe0a0, 80);
        this.sfx.chop();
        this.hitstop(30, tuning.feel.shakeBlock);
        break;
      case 'dodge':
        this.dodgeAnim = { start: t, kind: e.kind, dir: Math.random() < 0.5 ? -1 : 1 };
        this.sfx.swing();
        break;
      case 'opening':
        this.sfx.blip();
        break;
      case 'broken':
        this.nextBeep.clear();
        this.sfx.breakSting();
        this.hud.flash(t, 0xff2020, 0.25, 220);
        this.hitstop(80, tuning.feel.shakeParry);
        break;
      case 'recovered':
        break;
      case 'execute':
        this.fx.trail(PLAYER_EXECUTE_A, t, EXECUTE_TRAIL);
        this.fx.trail(PLAYER_EXECUTE_B, t + 70, EXECUTE_TRAIL);
        this.fx.sparks(ENEMY, 70, 200);
        this.fx.blood(ENEMY);
        this.fx.star(ENEMY, t, 12, 0xffffff, 200);
        this.hud.flash(t, 0xffffff, 0.6, 320);
        this.sfx.execute();
        this.hitstop(tuning.feel.hitstopExecute, tuning.feel.shakeBlast);
        break;
      case 'end':
        this.phase = 'result';
        this.resultAt = performance.now();
        this.restartHintShown = false;
        this.hud.showResult(e.phase === 'win');
        break;
    }
  }

  private onImpact(m: ActiveMove, t: number): void {
    if (m.result === 'parry' || m.result === 'block' || m.result === 'deflect') return;
    const evading = this.combat?.isDodgingAt(m.impact) ?? false;
    switch (m.spec.type) {
      case 'slash':
        this.fx.trail(enemySlashCurve(m.spec.dir), t, ORK_TRAIL);
        this.sfx.heavySwing();
        break;
      case 'shot': {
        const muzzle = this.muzzle(m);
        this.fx.star(muzzle, t, 7, 0xfff0a0, 90);
        const to = evading ? { x: PLAYER.x + (PLAYER.x - muzzle.x) * 3 + 40, y: this.scale.height + 20 } : PLAYER;
        this.fx.tracer(muzzle, to, t);
        this.sfx.gunshot();
        break;
      }
      case 'blast':
        this.fx.explosion(FLOOR, t);
        this.hud.flash(t, 0xffc060, evading ? 0.2 : 0.5, 200);
        this.sfx.explosion();
        this.shake(evading ? tuning.feel.shakeHit : tuning.feel.shakeBlast);
        break;
    }
  }

  private onResolve(m: ActiveMove, t: number): void {
    const feel = tuning.feel;
    switch (m.result) {
      case 'parry': {
        const acc = m.accuracy;
        if (!m.impacted) this.fx.trail(enemySlashCurve(m.spec.dir), t, ORK_TRAIL, 0.5);
        this.fx.trail(PLAYER_DEFEND, t, PLAYER_TRAIL);
        this.fx.sparks(PLAYER, Math.round(22 + 22 * acc), 120 + 90 * acc, SPARK_COLORS);
        this.fx.star(PLAYER, t, 6 + 4 * acc, 0xffffff, 130);
        this.hud.flash(t, 0xffffff, 0.2 + 0.2 * acc, 90);
        this.sfx.clang(acc);
        this.hitstop(Phaser.Math.Linear(feel.hitstopPerfectMin, feel.hitstopPerfectMax, acc), feel.shakeParry);
        break;
      }
      case 'block':
        if (m.spec.type === 'slash') {
          if (!m.impacted) this.fx.trail(enemySlashCurve(m.spec.dir), t, ORK_TRAIL, 0.5);
        } else {
          this.fireDeflected(m, t);
        }
        this.fx.trail(PLAYER_DEFEND, t, PLAYER_TRAIL);
        this.fx.sparks(PLAYER, 8, 70, DULL_SPARKS);
        this.sfx.block();
        this.hitstop(feel.hitstopBlock, feel.shakeBlock);
        break;
      case 'deflect': {
        const acc = m.accuracy;
        this.fireDeflected(m, t);
        this.fx.trail(PLAYER_DEFEND, t, PLAYER_TRAIL);
        this.fx.sparks(PLAYER, Math.round(14 + 12 * acc), 110 + 60 * acc);
        this.fx.star(PLAYER, t, 5 + 3 * acc, 0xfff8d0, 110);
        this.hud.flash(t, 0xffffff, 0.2, 80);
        this.sfx.ricochet(acc);
        this.hitstop(Phaser.Math.Linear(feel.hitstopPerfectMin, feel.hitstopPerfectMax, acc), feel.shakeParry);
        break;
      }
      case 'hit':
        this.hud.flash(t, 0xff2010, 0.45, 260);
        this.hud.crack(t);
        this.fx.blood(PLAYER);
        this.sfx.hurt();
        if (m.spec.type === 'blast') this.hitstop(40, null);
        else this.hitstop(40, feel.shakeHit);
        break;
      case 'evade':
      case null:
        break;
    }
  }

  private fireDeflected(m: ActiveMove, t: number): void {
    const muzzle = this.muzzle(m);
    if (!m.impacted) {
      this.fx.star(muzzle, t, 7, 0xfff0a0, 90);
      this.sfx.gunshot();
    }
    this.fx.tracer(muzzle, PLAYER, t, 0xfff0b0, 30);
    const side = muzzle.x < PLAYER.x ? 1 : -1;
    this.fx.tracer(PLAYER, { x: PLAYER.x + side * 120, y: PLAYER.y - 110 }, t + 30, 0xffffff, 60);
  }

  private muzzle(m: ActiveMove): Pt {
    return muzzlePoint(m.spec.muzzleX);
  }

  private updateBeeps(moves: readonly ActiveMove[]): void {
    for (const m of moves) {
      if (m.spec.type !== 'blast' || !m.started || m.result !== null || this.t >= m.impact) continue;
      const windup = m.impact - m.start;
      const landed = m.start + windup * 0.45;
      if (this.t < landed) continue;
      const next = this.nextBeep.get(m.id) ?? landed;
      if (this.t >= next) {
        this.sfx.beep();
        const progress = (this.t - m.start) / windup;
        this.nextBeep.set(m.id, this.t + Math.max(60, 260 * (1 - progress)));
      }
    }
  }

  private updateDodge(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const anim = this.dodgeAnim;
    let x = 0;
    let y = 0;
    let s = 1;
    if (anim) {
      const k = (this.t - anim.start) / tuning.player.dodgeDuration;
      if (k >= 1) {
        this.dodgeAnim = null;
      } else {
        const a = Math.sin(Math.PI * Phaser.Math.Clamp(k, 0, 1));
        if (anim.kind === 'side') {
          x = anim.dir * 20 * a;
        } else {
          s = 1 - 0.1 * a;
          x = (w / 2) * (1 - s);
          y = (h / 2) * (1 - s) - 12 * a;
        }
      }
    }
    this.world.setPosition(x, y).setScale(s);
  }

  private hitstop(ms: number, shake: { duration: number; intensity: number } | null): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, performance.now() + ms);
    if (shake) this.pendingShake = shake;
  }

  private shake(s: { duration: number; intensity: number }): void {
    if (performance.now() < this.hitstopUntil) this.pendingShake = s;
    else this.cameras.main.shake(s.duration, s.intensity);
  }
}
