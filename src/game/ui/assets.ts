import type * as Phaser from 'phaser';

/** art/hud.aseprite 的图层名，每个图层导出为一张整画布大小的 PNG */
export const HUD_LAYERS = [
  'frame',
  'frame-edge',
  'vents',
  'posture-back',
  'posture-fill',
  'posture-mark',
  'hp-back',
  'hp-fill',
  'scanlines',
  'visor-tint',
] as const;

export type HudLayer = (typeof HUD_LAYERS)[number];

export const BACKGROUND_KEY = 'background';

export function hudKey(layer: HudLayer): string {
  return `hud-${layer}`;
}

export function loadUiAssets(scene: Phaser.Scene): void {
  scene.load.image(BACKGROUND_KEY, 'ui/background.png');
  for (const layer of HUD_LAYERS) scene.load.image(hudKey(layer), `ui/hud/${layer}.png`);
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 贴图中不透明像素的包围盒，用于让血条、架势条跟随 Aseprite 里摆放的位置 */
export function opaqueBounds(scene: Phaser.Scene, key: string): Bounds {
  const source = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: source.width, height: source.height };
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
