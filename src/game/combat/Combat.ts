import { tuning, type ComboSpec, type MoveSpec } from '../data/tuning';

export type MoveResult = 'parry' | 'block' | 'deflect' | 'evade' | 'hit';
export type EnemyState = 'idle' | 'attacking' | 'opening' | 'broken' | 'dead';
export type Phase = 'fight' | 'win' | 'lose';

export interface ActiveMove {
  id: number;
  spec: MoveSpec;
  start: number;
  impact: number;
  started: boolean;
  impacted: boolean;
  result: MoveResult | null;
  /** 判定发生的时间 */
  resolvedAt: number;
  /** 判定时输入相对落点的偏差，负数为按早 */
  offset: number | null;
  /** 判定时的准确度 0～1，仅完美拼刀与弹开有意义 */
  accuracy: number;
}

export type InputOutcome =
  | 'parry'
  | 'block'
  | 'deflect'
  | 'miss'
  | 'whiff'
  | 'attack'
  | 'execute'
  | 'dodge'
  | 'locked';

export interface InputLog {
  t: number;
  action: 'slash' | 'dodge';
  outcome: InputOutcome;
  moveId: number | null;
  offset: number | null;
}

export type SwingKind = 'whiff' | 'defend' | 'attack' | 'execute';

export type CombatEvent =
  | { type: 'moveStart'; move: ActiveMove }
  | { type: 'impact'; move: ActiveMove }
  | { type: 'resolve'; move: ActiveMove }
  | { type: 'swing'; kind: SwingKind }
  | { type: 'dodge'; kind: 'side' | 'back' }
  | { type: 'attackHit' }
  | { type: 'opening' }
  | { type: 'broken' }
  | { type: 'recovered' }
  | { type: 'execute' }
  | { type: 'end'; phase: Phase };

export class Combat {
  t = 0;
  phase: Phase = 'fight';
  hp: number;
  posture = 0;
  enemyState: EnemyState = 'idle';
  stateUntil: number;
  moves: ActiveMove[] = [];
  comboName = '';
  readonly log: InputLog[] = [];

  lockUntil = 0;
  dodgeStart = -Infinity;
  dodgeUntil = -Infinity;
  dodgeReadyAt = 0;

  private comboEnd = 0;
  private postureDecayResumeAt = 0;
  private nextMoveId = 1;
  private lastCombo: ComboSpec | null = null;

  constructor(private readonly emit: (e: CombatEvent) => void) {
    this.hp = tuning.player.maxHp;
    this.stateUntil = tuning.enemy.firstComboDelay;
  }

  get isLocked(): boolean {
    return this.t < this.lockUntil;
  }

  isDodgingAt(time: number): boolean {
    return time >= this.dodgeStart && time <= this.dodgeUntil;
  }

  update(t: number): void {
    const dt = t - this.t;
    this.t = t;
    if (this.phase !== 'fight') return;

    if (this.enemyState !== 'broken' && t >= this.postureDecayResumeAt) {
      this.posture = Math.max(0, this.posture - (tuning.enemy.postureDecayPerSec * dt) / 1000);
    }

    switch (this.enemyState) {
      case 'idle':
        if (t >= this.stateUntil) this.startCombo(t);
        break;
      case 'attacking':
        this.processMoves(t);
        if (this.phase !== 'fight' || this.enemyState !== 'attacking') break;
        if (t >= this.comboEnd && this.moves.every((m) => m.result !== null)) {
          this.enemyState = 'opening';
          this.stateUntil = t + tuning.enemy.openingDuration;
          this.moves = [];
          this.emit({ type: 'opening' });
        }
        break;
      case 'opening':
        if (t >= this.stateUntil) this.toIdle(t);
        break;
      case 'broken':
        if (t >= this.stateUntil) {
          this.posture = tuning.enemy.postureMax * tuning.enemy.postureAfterRecover;
          this.postureDecayResumeAt = t + tuning.enemy.postureDecayDelay;
          this.toIdle(t);
          this.emit({ type: 'recovered' });
        }
        break;
      case 'dead':
        break;
    }
  }

  slash(t: number): void {
    if (this.phase !== 'fight') return;
    if (t < this.lockUntil) {
      this.record(t, 'slash', 'locked', null, null);
      return;
    }

    if (this.enemyState === 'broken') {
      this.enemyState = 'dead';
      this.record(t, 'slash', 'execute', null, null);
      this.emit({ type: 'swing', kind: 'execute' });
      this.emit({ type: 'execute' });
      this.end('win');
      return;
    }

    if (this.enemyState === 'opening') {
      this.lockUntil = t + tuning.player.attackRecovery;
      this.record(t, 'slash', 'attack', null, null);
      this.emit({ type: 'swing', kind: 'attack' });
      this.emit({ type: 'attackHit' });
      this.addPosture(t, tuning.posture.attack);
      return;
    }

    const move = this.findDefendable(t);
    if (move) {
      const offset = t - move.impact;
      const { perfect } = tuning.windows;
      const isPerfect = offset >= -perfect.before && offset <= perfect.after;
      const span = offset < 0 ? perfect.before : perfect.after;
      const accuracy = isPerfect ? 1 - Math.min(1, Math.abs(offset) / Math.max(1, span)) : 0;

      if (move.spec.type === 'slash') {
        this.lockUntil = t + (isPerfect ? tuning.player.parryRecovery : tuning.player.blockRecovery);
        this.emit({ type: 'swing', kind: 'defend' });
        this.resolve(move, isPerfect ? 'parry' : 'block', t, offset, accuracy);
        this.record(t, 'slash', isPerfect ? 'parry' : 'block', move.id, offset);
        if (isPerfect) this.addPosture(t, tuning.posture.parry);
        return;
      }

      if (move.spec.type === 'shot' && (isPerfect || tuning.shot.allowGuard)) {
        this.lockUntil = t + (isPerfect ? tuning.player.parryRecovery : tuning.player.blockRecovery);
        this.emit({ type: 'swing', kind: 'defend' });
        this.resolve(move, isPerfect ? 'deflect' : 'block', t, offset, accuracy);
        this.record(t, 'slash', isPerfect ? 'deflect' : 'block', move.id, offset);
        if (isPerfect) this.addPosture(t, tuning.posture.deflect);
        return;
      }

      this.whiff(t, 'miss', move);
      return;
    }

    this.whiff(t, 'whiff', this.nextThreat(t));
  }

  dodge(t: number): void {
    if (this.phase !== 'fight') return;
    if (t < this.lockUntil || t < this.dodgeReadyAt) {
      this.record(t, 'dodge', 'locked', null, null);
      return;
    }
    const { dodgeDuration, dodgeCooldown } = tuning.player;
    this.dodgeStart = t;
    this.dodgeUntil = t + dodgeDuration;
    this.lockUntil = this.dodgeUntil;
    this.dodgeReadyAt = this.dodgeUntil + dodgeCooldown;
    const threat = this.nextThreat(t);
    this.record(t, 'dodge', 'dodge', threat?.id ?? null, threat ? t - threat.impact : null);
    this.emit({ type: 'dodge', kind: threat?.spec.type === 'blast' ? 'back' : 'side' });
  }

  /** 尚未判定、且最接近当前时间的威胁 */
  nextThreat(t: number): ActiveMove | null {
    let best: ActiveMove | null = null;
    for (const m of this.moves) {
      if (m.result !== null) continue;
      if (!best || Math.abs(m.impact - t) < Math.abs(best.impact - t)) best = m;
    }
    return best;
  }

  private whiff(t: number, outcome: 'whiff' | 'miss', ref: ActiveMove | null): void {
    this.lockUntil = t + tuning.player.whiffRecovery;
    this.record(t, 'slash', outcome, ref?.id ?? null, ref ? t - ref.impact : null);
    this.emit({ type: 'swing', kind: 'whiff' });
  }

  private findDefendable(t: number): ActiveMove | null {
    const { guard } = tuning.windows;
    let best: ActiveMove | null = null;
    for (const m of this.moves) {
      if (m.result !== null || m.spec.type === 'blast') continue;
      if (t < m.impact - guard.before || t > m.impact + guard.after) continue;
      if (!best || Math.abs(m.impact - t) < Math.abs(best.impact - t)) best = m;
    }
    return best;
  }

  private processMoves(t: number): void {
    for (const m of this.moves) {
      if (!m.started && t >= m.start) {
        m.started = true;
        this.emit({ type: 'moveStart', move: m });
      }
      if (m.started && !m.impacted && t >= m.impact) {
        m.impacted = true;
        this.emit({ type: 'impact', move: m });
        if (m.result === null) {
          if (this.isDodgingAt(m.impact)) this.resolve(m, 'evade', m.impact, null, 0);
          else if (m.spec.type === 'blast') this.hit(m);
        }
      }
      if (m.impacted && m.result === null && t >= m.impact + tuning.windows.guard.after) {
        this.hit(m);
      }
      if (this.phase !== 'fight' || this.enemyState !== 'attacking') return;
    }
  }

  private hit(m: ActiveMove): void {
    this.resolve(m, 'hit', this.t, null, 0);
    this.hp = Math.max(0, this.hp - tuning.damage[m.spec.type]);
    this.lockUntil = Math.max(this.lockUntil, this.t + tuning.player.hitStun);
    if (this.hp <= 0) this.end('lose');
  }

  private resolve(m: ActiveMove, result: MoveResult, at: number, offset: number | null, accuracy: number): void {
    m.result = result;
    m.resolvedAt = at;
    m.offset = offset;
    m.accuracy = accuracy;
    this.emit({ type: 'resolve', move: m });
  }

  private addPosture(t: number, amount: number): void {
    const max = tuning.enemy.postureMax;
    this.posture = Math.min(max, this.posture + amount);
    this.postureDecayResumeAt = t + tuning.enemy.postureDecayDelay;
    if (this.posture >= max && this.enemyState !== 'broken') {
      this.enemyState = 'broken';
      this.stateUntil = t + tuning.enemy.brokenDuration;
      this.moves = [];
      this.emit({ type: 'broken' });
    }
  }

  private toIdle(t: number): void {
    const { idleMin, idleMax } = tuning.enemy;
    this.enemyState = 'idle';
    this.stateUntil = t + idleMin + Math.random() * Math.max(0, idleMax - idleMin);
    this.moves = [];
  }

  private startCombo(t: number): void {
    const combo = this.pickCombo();
    this.lastCombo = combo;
    this.comboName = combo.name;
    this.enemyState = 'attacking';
    let s = t;
    this.moves = combo.moves.map((spec) => {
      const move: ActiveMove = {
        id: this.nextMoveId++,
        spec: { ...spec },
        start: s,
        impact: s + spec.windup,
        started: false,
        impacted: false,
        result: null,
        resolvedAt: 0,
        offset: null,
        accuracy: 0,
      };
      s = move.impact + spec.recover;
      return move;
    });
    this.comboEnd = s;
    this.processMoves(t);
  }

  private pickCombo(): ComboSpec {
    const all = tuning.combos.filter((c) => c.moves.length > 0);
    const pool = all.length > 1 ? all.filter((c) => c.name !== this.lastCombo?.name) : all;
    const total = pool.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    let r = Math.random() * total;
    for (const c of pool) {
      r -= Math.max(0, c.weight);
      if (r <= 0) return c;
    }
    return pool[0];
  }

  private record(
    t: number,
    action: InputLog['action'],
    outcome: InputOutcome,
    moveId: number | null,
    offset: number | null,
  ): void {
    this.log.push({ t, action, outcome, moveId, offset });
    if (this.log.length > 24) this.log.shift();
  }

  private end(phase: Phase): void {
    this.phase = phase;
    this.emit({ type: 'end', phase });
  }
}
