# Shithead engine — TypeScript port (Phase 1)

A pure, deterministic TypeScript port of the Android/Java Shithead game **engine**
(`com.example.shithead.GameEngine` + `RuleConfig`). **Engine only** — no bot/AI, no UI,
no DOM, no I/O. The bot and React PWA UI are later phases.

The Java source remains the source of truth for behaviour. Parity is proven by **golden
vectors** exported from the real Java engine and replayed by the TS engine (see below).

## Module layout (`src/engine/`)

| File | Role |
|------|------|
| `cards.ts` | `Suit`, `Rank`, `Card`, `RANK_ORDER`, `buildDeck()` (52 + 2 jokers). |
| `rules.ts` | `createRules(actions)` → `canPlay`, `getPower`, `getCardAction`, `isJoker`, `getRankName`. Special-card actions are an injectable `SpecialActionMap` (defaults = the shipped variant). Port of `RuleConfig`. |
| `state.ts` | `GameState`, `PlayerState`, `Phase`, `Winner` + pure helpers (`cloneState`, `sortHand`, `isFinished`, …). |
| `moves.ts` | `Move` union, `validateMove` (ground-truth predicate), `getLegalMoves` (canonical generator). |
| `engine.ts` | `newGame` / `dealFromDeck`, `confirmSetup`, `applyMove`, `isGameOver`. `applyMove` mirrors `GameEngine.applySimulationDecision` (turn-aware, auto-resolves burns / invalid face-down → pickup; every returned state is fully resolved). |
| `rng.ts` | Injectable seeded RNG (`mulberry32`) + `shuffleInPlace`. The engine never calls `Math.random`. |
| `serialize.ts` | Canonical JSON (de)serialization — the contract shared with the Java exporter. |
| `index.ts` | Public surface. |

Determinism: the only randomness is shuffling, via the injected RNG. Parity tests are
**state-based** — they load an explicit dealt state and never reproduce `java.util.Random`.

## Running the TS tests

```bash
cd web
npm install
npm test          # vitest run  (parity replay + hand-derived unit tests)
npm run typecheck # tsc --noEmit (strict)
```

## Regenerating the golden vectors from Java

The vectors in `web/test/golden/*.json` are produced by an **additive** JUnit harness
(`app/src/test/java/com/example/shithead/GoldenVectorExportTest.java`) that uses only public
`GameEngine` APIs — **no Java production code is modified**. To regenerate (from the repo root,
PowerShell):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:testDebugUnitTest --tests "com.example.shithead.GoldenVectorExportTest"
```

Each vector is a trajectory: a concrete `initialState`, optional `validateProbes`
(authoritative legality from the real `validateMove`), and `steps[]` with a full state
snapshot after every move. The TS suite (`src/engine/__tests__/parity.test.ts`) replays them.

## Coverage (golden vectors)

Joker pile-transfer (+ joker on empty), 2-reset, 3-transparent (on 7, stacked on 8, full-3
pile, on empty), 7-and-under interaction matrix (2/3/4/8/10/A/Joker/four-of-a-kind),
8-skip, 10-burn, four-of-a-kind burn (single play and across a turn), cross-zone combine
(positive + two negatives), forced face-down pickup, valid face-down → win end-state,
deal-from-deck, setup-confirm, and a full deterministic game to completion.

## Known open rules question

`joker_transfer` / `joker_on_empty` document that **the played joker leaves the game**
(removed from hand, never added to the pile or the opponent — only the *pile* moves to the
opponent's hand). This is preserved faithfully from the Java; flagged as a possible
intended-vs-bug question for review (see PORT_NOTES §9).

---

# Bot + belief system (Phase 2)

Pure TS port of `MonteCarloAi` + `BeliefState` + `HumanMemory`. Imports the Phase-1 engine
(`getLegalMoves` candidates, `applyMove` transitions) — it does NOT fork engine rules. All bot
randomness flows through the injected seeded `mulberry32`; the time-budget clock is injectable.
Web-Worker-ready (no shared globals; `decideMove(rules, state, config, rng)` is message-friendly)
but the Worker is not wired (UI phase).

## Module layout (`src/bot/`)
| File | Role |
|------|------|
| `config.ts` | `BotConfig` (every lever) + `productionConfig()` (defaults = ~75% baseline). |
| `beliefState.ts` | Deductive belief (scoop pins + forced-pickup void), public-data-only, `isFair()`. |
| `humanMemory.ts` | Lossy EXACT/BUCKET/FORGOTTEN memory, no-Joker/10 leak guard. |
| `determinize.ts` | Hidden-card sampler (uniform / belief-biased / human-biased). Fairness invariant: opponent hand + deck + BOTH face-downs go into the unknown pool. |
| `montecarlo.ts` | `decideMove` — round-robin MC under the wall-clock cap; reuses engine `getLegalMoves`/`applyMove`. |

Levers (all OFF/null by default): `enableDeductiveBelief`, `belief`, `humanMemory`,
`enableVoluntaryPickup`; `voidEnabled`/`knownRankFilter` (belief); `memorySpan`/`sharpSpan`/
`loadSensitivity`/`edgePreservation` (human). Production config reproduces the uniform sampler.

## Validation tiers
- **Deterministic belief layer → exact golden-vector parity.** `BeliefVectorExportTest.java`
  (additive, public-API, zero production change) emits `web/test/golden-belief/*.json`;
  `src/bot/__tests__/belief.parity.test.ts` replays and asserts byte-exact equality.
- **Stochastic MC layer → statistical.**
  - *Fast CI tier* (`bot.smoke.test.ts`): reduced sim-count, regression/smoke only.
  - *Full-config tier* (`validate.full.test.ts`, gated behind `FULL=1`): the REAL 150 sims /
    2000 ms bot. Reports actual baseline win-rate and belief-recovery %.

```bash
npm test                                  # engine + belief parity + smoke (fast)
# full-config validation (slow; the trusted numbers):
FULL=1 BASE_N=300 MIR_N=120 npx vitest run src/bot/__tests__/validate.full.test.ts --testTimeout=7200000
# regenerate belief vectors from Java:
#   gradlew :app:testDebugUnitTest --tests "com.example.shithead.BeliefVectorExportTest"
```
