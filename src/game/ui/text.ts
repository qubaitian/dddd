import type * as Phaser from 'phaser';

export const MONO_FONT = 'ui-monospace, Menlo, Consolas, monospace';

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
