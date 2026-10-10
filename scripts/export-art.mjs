// 把 art/ 下的 Aseprite 源文件导出为游戏使用的 PNG。
// hud.aseprite 每个图层导出为 public/ui/hud/<图层名>.png（保持整张画布大小，位置即游戏中的位置）；
// background.aseprite 合并所有图层导出为 public/ui/background.png。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const candidates = [
  process.env.ASEPRITE_PATH,
  join(homedir(), 'Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite'),
  '/Applications/Aseprite.app/Contents/MacOS/aseprite',
].filter(Boolean);
const aseprite = candidates.find((p) => existsSync(p)) ?? 'aseprite';

const run = (...args) => execFileSync(aseprite, ['-b', ...args], { stdio: 'inherit' });

rmSync('public/ui/hud', { recursive: true, force: true });
mkdirSync('public/ui/hud', { recursive: true });
run('art/hud.aseprite', '--split-layers', '--save-as', 'public/ui/hud/{layer}.png');
run('art/background.aseprite', '--save-as', 'public/ui/background.png');
console.log('exported art/ -> public/ui/');
