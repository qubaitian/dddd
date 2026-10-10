import * as Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/config';

const game = new Phaser.Game(createGameConfig('game'));

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
