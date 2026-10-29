// 冒烟：Node require 产物 → 写 NNUE → 握手 → go depth 5 → 断言着法
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsPath = process.argv[2] || path.join(here, 'dist', 'wasm', 'pikafish.js');
const nnuePath = process.argv[3] || path.join(here, 'pikafish.nnue');
const require = createRequire(import.meta.url);

const src = fs.readFileSync(jsPath, 'utf-8');
if (src.includes('</scr' + 'ipt>')) throw new Error('产物含 </script>，禁止注入 HTML');

// 多线程 emscripten 产物在 Node 下必须经 require 真实文件加载（eval 会导致 pthread worker 重入主脚本、丢失 argv）
const tmp = path.join(os.tmpdir(), 'pikafish-' + process.pid + '.cjs');
fs.writeFileSync(tmp, src, 'utf-8');
const Pikafish = require(tmp);
if (typeof Pikafish !== 'function') throw new Error('Pikafish factory 缺失');

const lines = [];
const module = await Pikafish({
  print: l => lines.push(l),
  printErr: l => lines.push('ERR ' + l),
  noInitialRun: true,
});
const nnue = fs.readFileSync(nnuePath);
module.FS.writeFile('/pikafish.nnue', nnue);
module.ccall('pikafish_initialize', null, [], []);
module.ccall('pikafish_command', null, ['string'], ['uci']);

const deadline = Date.now() + 60000;
while (!lines.includes('uciok') && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
if (!lines.includes('uciok')) throw new Error('uci 握手失败: ' + lines.slice(-5).join(' | '));

module.ccall('pikafish_command', null, ['string'], ['position fen rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1']);
module.ccall('pikafish_command', null, ['string'], ['go depth 5']);

const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const bm = lines.find(l => l.startsWith('bestmove'));
  if (bm) {
    const mv = bm.split(/\s+/)[1];
    if (!/^[a-i][0-9][a-i][0-9]$/.test(mv)) throw new Error('非法着法: ' + bm);
    console.log('SMOKE OK:', lines.find(l => l.includes('NNUE evaluation')) || '(NNUE 行未捕获)', '→', mv);
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, 100));
}
throw new Error('60s 无 bestmove: ' + lines.slice(-8).join(' | '));
