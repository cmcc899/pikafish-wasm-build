// 冒烟：Node eval 产物 → 写 NNUE → 握手 → go depth 5 → 断言着法
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsPath = process.argv[2] || path.join(here, 'dist', 'wasm', 'pikafish.js');
const nnuePath = process.argv[3] || path.join(here, 'pikafish.nnue');

const src = fs.readFileSync(jsPath, 'utf-8');
if (src.includes('</scr' + 'ipt>')) throw new Error('产物含 </script>，禁止注入 HTML');

// 产物是 var Pikafish = (()=>{...})(); 形态，eval 到全局
const lines = [];
globalThis.Pikafish = undefined;
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = here;
globalThis.__filename = fileURLToPath(import.meta.url);
try {
  (0, eval)(src);
} catch (err) {
  console.error('EVAL ERROR:', err && err.stack || err);
  throw err;
}
if (typeof Pikafish !== 'function') throw new Error('Pikafish factory 缺失');

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
