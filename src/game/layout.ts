import type { SlashDir } from './data/tuning';

/** 正方形战斗画布的边长（像素），在窗口中等比放大为最大的居中正方形 */
export const SIZE = 240;
export const W = SIZE;
export const H = SIZE;
export const CX = W / 2;

export interface Pt {
  x: number;
  y: number;
}

export interface Curve {
  p0: Pt;
  c: Pt;
  p1: Pt;
}

/** 顶部架势条所在的面罩边框底边 */
export const TOP_BAND = 20;
/** 底部血条所在的面罩边框顶边 */
export const BOTTOM_BAND = 202;
export const HORIZON_Y = 100;

/** 玩家受击与拼刀交点 */
export const PLAYER: Pt = { x: CX, y: 150 };
/** 兽人所在位置，处决红点也画在这里 */
export const ENEMY: Pt = { x: CX, y: 112 };
/** 雷管落地、爆炸中心 */
export const FLOOR: Pt = { x: CX, y: 180 };
export const MUZZLE_Y = 102;
export const BLAST_ZONE = { width: 170, height: 36 };

export function muzzlePoint(muzzleX: number | undefined): Pt {
  return { x: W * (muzzleX ?? 0.5), y: MUZZLE_Y };
}

export function bezier(c: Curve, u: number): Pt {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const d = u * u;
  return {
    x: a * c.p0.x + b * c.c.x + d * c.p1.x,
    y: a * c.p0.y + b * c.c.y + d * c.p1.y,
  };
}

/** 构造一条在 u=0.5 处经过 mid 的二次曲线 */
export function curveThrough(p0: Pt, mid: Pt, p1: Pt): Curve {
  return {
    p0,
    c: { x: 2 * mid.x - 0.5 * (p0.x + p1.x), y: 2 * mid.y - 0.5 * (p0.y + p1.y) },
    p1,
  };
}

const ENEMY_SLASH: Record<SlashDir, Curve> = {
  R: curveThrough({ x: W - 12, y: 66 }, PLAYER, { x: 8, y: 186 }),
  L: curveThrough({ x: 12, y: 66 }, PLAYER, { x: W - 8, y: 186 }),
  U: curveThrough({ x: CX + 16, y: 30 }, PLAYER, { x: CX - 16, y: 214 }),
};

export function enemySlashCurve(dir: SlashDir | undefined): Curve {
  return ENEMY_SLASH[dir ?? 'R'];
}

export const PLAYER_DEFEND = curveThrough({ x: W - 4, y: 222 }, PLAYER, { x: 24, y: 84 });
export const PLAYER_ATTACK = curveThrough({ x: W - 6, y: 214 }, ENEMY, { x: 8, y: 58 });
export const PLAYER_EXECUTE_A = curveThrough({ x: CX + 8, y: 22 }, ENEMY, { x: CX - 8, y: 212 });
export const PLAYER_EXECUTE_B = curveThrough({ x: W - 8, y: 86 }, ENEMY, { x: 8, y: 132 });
