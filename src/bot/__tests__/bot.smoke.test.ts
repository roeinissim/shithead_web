// FAST CI TIER (smoke/regression only): reduced sim-count to confirm the bot RUNS, produces
// legal moves, finishes games, and beats greedy. NOT a faithfulness measurement — the trusted
// baseline + recovery numbers come from the FULL-config validate.test.ts (150 sims / 2000 ms).

import { describe, it, expect } from 'vitest';
import { productionConfig } from '../config';
import { playBotVsGreedy, tally } from './_driver';
import type { Winner } from '../../engine/state';

describe('bot smoke (reduced budget — regression only)', () => {
  it('plays finished games and beats greedy at low sim-count', () => {
    const config = productionConfig({ simulationCount: 20, timeBudgetMs: 1_000_000 }); // sims cap, not time
    const N = 24;
    const results: Winner[] = [];
    for (let seed = 1; seed <= N; seed++) results.push(playBotVsGreedy(config, seed));
    const t = tally(results);
    // eslint-disable-next-line no-console
    console.log(`[smoke] reduced(20 sims) bot vs greedy: ${t.aiPct.toFixed(1)}% over ${N} (draws ${t.draws})`);
    expect(t.draws).toBe(0);                 // all games finish
    expect(t.aiPct).toBeGreaterThan(50);     // MC beats greedy even at low sims
  }, 120_000);
});
