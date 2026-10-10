// 招式与手感参数。保存后经 Vite 热更新立即生效：新招式从下一套连招开始使用新数值。
// 时间单位均为毫秒；判定窗口以攻击落点（impact）为 0，before 为提前量，after 为延后量。

export type MoveType = 'slash' | 'shot' | 'blast';
export type SlashDir = 'L' | 'R' | 'U';

export interface MoveSpec {
  type: MoveType;
  /** 提示出现到攻击落下 */
  windup: number;
  /** 落点后到下一招开始提示的间隔 */
  recover: number;
  /** 刀砍方向：L 从左挥来，R 从右挥来，U 从上劈下 */
  dir?: SlashDir;
  /** 开枪时枪口的横向位置：0 为画面最左，1 为最右 */
  muzzleX?: number;
}

export interface ComboSpec {
  name: string;
  weight: number;
  moves: MoveSpec[];
}

export interface TimingWindow {
  before: number;
  after: number;
}

function createTuning() {
  return {
    player: {
      maxHp: 100,
      whiffRecovery: 300,
      parryRecovery: 90,
      blockRecovery: 160,
      attackRecovery: 240,
      hitStun: 220,
      dodgeDuration: 320,
      dodgeCooldown: 180,
    },

    windows: {
      perfect: { before: 80, after: 40 } as TimingWindow,
      guard: { before: 170, after: 80 } as TimingWindow,
    },

    shot: {
      /** 非完美时机按“砍”能否挡下子弹；false 时视为乱按 */
      allowGuard: false,
    },

    damage: {
      slash: 18,
      shot: 14,
      blast: 30,
    },

    enemy: {
      postureMax: 100,
      postureDecayPerSec: 5,
      postureDecayDelay: 900,
      firstComboDelay: 1200,
      idleMin: 500,
      idleMax: 1000,
      openingDuration: 1200,
      brokenDuration: 3000,
      /** 崩溃后未被处决，架势恢复到的比例 */
      postureAfterRecover: 0.6,
    },

    posture: {
      parry: 16,
      deflect: 10,
      attack: 4,
    },

    feel: {
      hitstopPerfectMin: 60,
      hitstopPerfectMax: 100,
      hitstopBlock: 25,
      hitstopExecute: 220,
      shakeParry: { duration: 110, intensity: 0.018 },
      shakeBlock: { duration: 70, intensity: 0.008 },
      shakeHit: { duration: 220, intensity: 0.03 },
      shakeBlast: { duration: 320, intensity: 0.04 },
    },

    combos: [
      {
        name: '三连砍',
        weight: 3,
        moves: [
          { type: 'slash', dir: 'R', windup: 700, recover: 260 },
          { type: 'slash', dir: 'L', windup: 500, recover: 260 },
          { type: 'slash', dir: 'U', windup: 800, recover: 420 },
        ],
      },
      {
        name: '快双刀',
        weight: 2,
        moves: [
          { type: 'slash', dir: 'L', windup: 450, recover: 220 },
          { type: 'slash', dir: 'R', windup: 450, recover: 420 },
        ],
      },
      {
        name: '重劈',
        weight: 2,
        moves: [{ type: 'slash', dir: 'U', windup: 800, recover: 420 }],
      },
      {
        name: '枪托接刀',
        weight: 2,
        moves: [
          { type: 'shot', muzzleX: 0.67, windup: 650, recover: 300 },
          { type: 'slash', dir: 'L', windup: 600, recover: 420 },
        ],
      },
      {
        name: '连射',
        weight: 1,
        moves: [
          { type: 'shot', muzzleX: 0.33, windup: 600, recover: 200 },
          { type: 'shot', muzzleX: 0.64, windup: 450, recover: 420 },
        ],
      },
      {
        name: '雷管',
        weight: 2,
        moves: [
          { type: 'blast', windup: 1000, recover: 350 },
          { type: 'slash', dir: 'R', windup: 550, recover: 420 },
        ],
      },
    ] as ComboSpec[],
  };
}

export type Tuning = ReturnType<typeof createTuning>;

export const TUNING_UPDATED = 'dddd:tuning-updated';

const fresh = createTuning();

/** 全局唯一的参数对象；读取时请每次从 tuning 取值，不要缓存子对象。 */
export const tuning: Tuning = import.meta.hot?.data.tuning ?? fresh;

if (tuning !== fresh) {
  Object.assign(tuning, fresh);
  window.dispatchEvent(new Event(TUNING_UPDATED));
}

if (import.meta.hot) {
  import.meta.hot.data.tuning = tuning;
  import.meta.hot.accept();
}
