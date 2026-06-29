// FULL-CONFIG validation (150 sims / 2000 ms — the REAL production bot). Gated behind FULL=1.
// Per-GAME progress logging (game N/total + ms) so a hang/sleep is visible immediately instead
// of after hours. Reports ACTUAL measured numbers.
//   FULL=1 BASE_N=300 MIR_N=120 npx vitest run src/bot/__tests__/validate.full.test.ts --testTimeout=7200000

import { describe, it } from 'vitest';
import { productionConfig } from '../config';
import { BeliefState } from '../beliefState';
import { playBotVsGreedy, playMirror, tally, seDiff, rules, type Tally } from './_driver';
import type { Winner } from '../../engine/state';

const FULL = !!process.env['FULL'];
const BASE_N = Number(process.env['BASE_N'] ?? 200);
const MIR_N = Number(process.env['MIR_N'] ?? 100);
const CEILING = 17.5;
const log = (s: string) => { /* eslint-disable-next-line no-console */ console.log(s); };

// Run `n` seeded games of `play`, logging per-game wall-time (first 3, then every 25th).
function runGames(label: string, n: number, play: (seed: number) => Winner): Tally {
  const res: Winner[] = [];
  const t0 = Date.now();
  for (let seed = 1; seed <= n; seed++) {
    const g0 = Date.now();
    res.push(play(seed));
    if (seed <= 3 || seed % 25 === 0 || seed === n) {
      log(`  [${label}] game ${seed}/${n}  ${Date.now() - g0}ms  (elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }
  return tally(res);
}

describe.skipIf(!FULL)('FULL-config validation (150 sims / 2000 ms)', () => {
  it(`baseline: bot vs greedy, N=${BASE_N}`, () => {
    const cfg = productionConfig();
    const t = runGames('baseline', BASE_N, (seed) => playBotVsGreedy(cfg, seed));
    const se = 100 * Math.sqrt((t.aiPct / 100) * (1 - t.aiPct / 100) / t.n);
    log(`\n>> BASELINE (full config) bot vs greedy: ${t.aiPct.toFixed(1)}% +/-${se.toFixed(1)} ` +
        `(ai ${t.ai} / player ${t.player} / draws ${t.draws}, N=${t.n})`);
  }, 7_200_000);

  it(`belief recovery: MC mirror, N=${MIR_N}`, () => {
    const cfg = productionConfig();
    const base = runGames('mirror-base', MIR_N, (seed) => playMirror(cfg, cfg, seed, null));
    const scoop = runGames('mirror-scoop', MIR_N, (seed) => playMirror(cfg, cfg, seed, () => { const b = new BeliefState(rules); b.voidEnabled = false; return b; }));
    const full = runGames('mirror-void', MIR_N, (seed) => playMirror(cfg, cfg, seed, () => { const b = new BeliefState(rules); b.voidEnabled = true; return b; }));

    const sVal = scoop.aiPct - base.aiPct;
    const fVal = full.aiPct - base.aiPct;
    log(`\n>> MIRROR baseline (no belief): ${base.aiPct.toFixed(1)}%  N=${base.n}`);
    log(`>> scoop-only:  +${sVal.toFixed(1)} pts (+/-${seDiff(scoop.ai, scoop.n, base.ai, base.n).toFixed(1)}) ` +
        `=> recovers ${(100 * sVal / CEILING).toFixed(0)}% of the +${CEILING} ceiling`);
    log(`>> scoop+void:  +${fVal.toFixed(1)} pts (+/-${seDiff(full.ai, full.n, base.ai, base.n).toFixed(1)}) ` +
        `=> recovers ${(100 * fVal / CEILING).toFixed(0)}% of the +${CEILING} ceiling`);
    log(`>> void contribution: +${(fVal - sVal).toFixed(1)} pts`);
  }, 7_200_000);
});
