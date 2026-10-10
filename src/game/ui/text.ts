import * as Phaser from 'phaser';

export const CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
export const MONO_FONT = 'ui-monospace, Menlo, Consolas, monospace';

export function cjkText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: CJK_FONT, fontSize: `${size}px`, color, fontStyle: 'bold' })
    .setOrigin(0.5);
}

export function monoText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = '#7fd88a',
  size = 8,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: MONO_FONT, fontSize: `${size}px`, color });
}
