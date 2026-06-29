// PHASE 2.5 — sweep parity vs the Java anchors (CLAUDE.md, 2026-06-15). FULL config (150/2000),
// N=300, same seed set as the baseline. Gated behind FULL=1. Per-arm + per-game progress logging.
//   FULL=1 MIR_N=300 npx vitest run src/bot/__tests__/validate.sweep.test.ts --testTimeout=14400000

import { describe, it } from 'vitest';
import { productionConfig } from '../config';
import { BeliefState } from '../beliefState';
import { HumanMemory } from '../humanMemory';
import type { Rank } from '../../engine/cards';
import { playMirror, playHumanMirror, tally, seDiff, rules, type Tally } from './_driver';
import type { Winner } from '../../engine/state';

const FULL = !!process.env['FULL'];
const N = Number(process.env['MIR_N'] ?? 300);
const log = (s: string) => { /* eslint-disable-next-line no-console */ console.log(s); };

function runArm(label: string, play: (seed: number) => Winner): Tally {
  const res: Winner[] = [];
  const t0 = Date.now();
  for (let seed = 1; seed <= N; seed++) {
    res.push(play(seed));
    if (seed % 50 === 0 || seed === N) log(`  [${label}] ${seed}/${N} (elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const t = tally(res);
  log(`  >>> ${label}: ${t.aiPct.toFixed(1)}% (ai ${t.ai}/${t.n})`);
  return t;
}

const cfg = productionConfig();
const memFactory = (span: number, sharp: number, load: number) => () => {
  const m = new HumanMemory(rules);
  m.memorySpan = span; m.sharpSpan = sharp; m.loadSensitivity = load; m.edgePreservation = true;
  return m;
};
const SPECIALS_HIGH = new Set<Rank>(['JOKER', 'TEN', 'TWO', 'THREE', 'JACK', 'QUEEN', 'KING', 'ACE']);

describe.skipIf(!FULL)('PHASE 2.5 sweep parity (FULL config, N=' + N + ')', () => {
  it('E5 lossiness curve + E4 specials+high (one run, shared baseline)', () => {
    const base = runArm('baseline', (s) => playMirror(cfg, cfg, s, null));
    const L0 = runArm('L0(999,999,0.0)', (s) => playHumanMirror(cfg, cfg, s, memFactory(999, 999, 0.0)));
    const L1 = runArm('L1(999,8,0.0)', (s) => playHumanMirror(cfg, cfg, s, memFactory(999, 8, 0.0)));
    const L2 = runArm('L2(10,5,0.3)', (s) => playHumanMirror(cfg, cfg, s, memFactory(10, 5, 0.3)));
    const L3 = runArm('L3(6,3,0.5)', (s) => playHumanMirror(cfg, cfg, s, memFactory(6, 3, 0.5)));
    const L4 = runArm('L4(2,0,1.0)', (s) => playHumanMirror(cfg, cfg, s, memFactory(2, 0, 1.0)));
    const sph = runArm('E4 specials+high', (s) => playMirror(cfg, cfg, s, () => {
      const b = new BeliefState(rules); b.voidEnabled = false; b.knownRankFilter = SPECIALS_HIGH; return b;
    }));

    const L0val = L0.aiPct - base.aiPct;
    const row = (label: string, t: Tally, anchor: string) => {
      const val = t.aiPct - base.aiPct;
      const pct = (100 * val / L0val).toFixed(0);
      const ci = seDiff(t.ai, t.n, base.ai, base.n).toFixed(1);
      log(`  ${label.padEnd(18)} +${val.toFixed(1).padStart(5)} pts   ${pct.padStart(3)}% of L0   +/-${ci}   | Java: ${anchor}`);
    };
    log(`\n>> PHASE 2.5 RESULTS (baseline ${base.aiPct.toFixed(1)}%, N=${N}, full config)`);
    log(`   level              TS pts      % of L0   CI(pts)  | Java anchor`);
    row('L0 faithful', L0, '+15.3 = 100%');
    row('L1', L1, '~65-83% band');
    row('L2', L2, '~65-83% band');
    row('L3', L3, '~65-83% band');
    row('L4 human', L4, '+6.0 = 39%');
    log(`   cost-of-human (L0-L4) = ${(L0val - (L4.aiPct - base.aiPct)).toFixed(1)} pts   | Java: ~9.3 pts`);
    row('E4 specials+high', sph, '~40% of belief value');
  }, 14_400_000);
});
