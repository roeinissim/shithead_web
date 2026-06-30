# Phase 3a — handoff (UI polish state + open threads)

> Resume point for a FRESH session. This file holds ONLY what you cannot reconstruct from disk —
> the accumulated Phase-3a UI decisions and open threads. For everything else read the
> authoritative sources and do NOT restate them here:
> - `CLAUDE.md` — project rules, architecture, AI levers (all OFF by default), workflow.
> - `web/PORT_NOTES.md` — engine/bot port design; **§11** Phase-1, **§12** Phase-2, **§13** known
>   parity residuals (belief-ON-only; production path is byte-validated).
> - `web/README.md` — module layout, regenerate golden vectors, run tests.
> - the code in `web/src/{engine,bot,game,ui}` — authoritative for current behaviour.

## Where we are
Phases 1 (engine), 2 (bot+belief), 2.5 (sweep parity) are DONE and validated — see CLAUDE.md and
PORT_NOTES §11–§13; don't re-derive. **Phase 3a is now CLOSED** (2026-07-01): the React PWA + Web
Worker (`web/`) is built, playable, polished through **6 UI rounds**, and BOTH prior open threads
(refill-locus, on-device timing) are resolved — see "Session 2026-07-01" below. **Phase 3b** (A/B
guess-then-reveal, belief/HumanMemory live wiring, settings screen) is NOT started — and is NOT
uniformly presentation-only; read the §3b warning at the bottom before touching it.

## Locked architecture decisions (do not re-litigate or break)
- **Worker is STATELESS**: full serialized `GameState` per call via `serialize.ts`; **rule actions
  travel IN the request** (`parseActions`) so UI and bot derive rules from one source and never
  diverge. **Production config only — every experimental lever OFF.** (`game/worker.ts`,
  `game/protocol.ts`, `game/workerClient.ts`.)
- **Bot randomness**: seeded `mulberry32`, seed from `crypto.getRandomValues` (NOT `Date.now`). The
  bot never calls `Math.random`.
- **Engine/bot are byte-validated and MUST NOT be modified for UI reasons.** UI imports engine+bot,
  never the reverse. All Phase-3a work is **presentation-only**.
- **`applyMove` is ATOMIC / auto-resolving** (removes-from-hand + places + burns + refills in one
  transition; no intermediate engine state). The UI splits effect moves into VISUAL frames on top of
  the already-computed result — it never adds a pause/state inside the engine/Worker, and **never
  invents data** (e.g. a refill card); it only renders what the engine produced.

## Phase-3a UI decisions accumulated this session (preserve all)
- **Cards = real Android PNG assets**, copied to `web/public/cards/` from
  `app/src/main/assets/cards`, mapped via that folder's authoritative `manifest_all.json`
  (`{rank}{suit}.png`; jokers `joker_color`/`joker_bw`; engine `JOKER_A`->color, `JOKER_B`->bw). The
  CSS-drawn renderer is **kept as `CardFaceCss` fallback** (not active). **Largest individual card
  PNG = `KH.png` 160x220** => retina-soft at large sizes (fine at hand size, soft in the reveal
  overlay) — **open watch-item**, may need re-export larger.
- **One pacing constant `ACTION_DELAY_MS` (currently 1280ms)** in `game/gameConfig.ts` for EVERY
  visible beat: between bot actions, effect-resolve, four-of-a-kind burn, face-down reveal,
  pre-win/lose hold. No per-beat constants. (Separate `DEFAULT_TIME_BUDGET_MS` = bot compute budget,
  not pacing — see Open Threads.)
- **Effect moves (10->burn, four-of-a-kind->burn, joker->transfer) = 3-FRAME sequence**: (1) played
  card LEAVES the hand onto the pile **and the hand refills from the deck to 3** + deck count
  decrements; (2) pause `ACTION_DELAY_MS`; (3) effect resolves. Built by computing
  `post = applyMove(...)` (pure deterministic READ) and rendering a Frame-1 synthetic state
  (`App.tsx commitMove` + `ui.effectPreview`).
- **Refill-on-effect asymmetry**: human's refilled card shown **FACE-UP**; bot's refilled card shown
  as a **CARD BACK** — structural, because the AI hand is *always* rendered backs-by-count, so the
  hidden draw cannot leak (fairness invariant).
- **Face-up cards pinned to FIXED slots 0/1/2** for the whole game (`ui.faceUpSlots`, frozen at
  setup-confirm); playing one leaves its slot EMPTY — no hole-filling reshuffle.
- **Hand = tight OVERLAPPING FAN**, never scrolls, always fits on screen, every card tappable even on
  a big forced pickup (overlap is width+count driven in `ui/Board.tsx Hand`).
- **Selection = Y-lift + highlight only; NO z-order change** (no z-bump) and selecting does NOT reflow
  the other cards (stable multi-card same-rank selection).
- **Card sizes**: opponent face-up/face-down **+20%** (55px), my hand **+15%** (74px); my own
  face-up/face-down unchanged (46px). Must not reintroduce A4 overflow (the fan math uses 74px).
- **Counters**: koupa(deck) ON the deck base, arima(discard) BELOW the discard, **uniform** pill
  style; deck & discard CARDS aligned same Y; **both counters aligned same Y**. (Resolved a tension:
  the deck counter sits at the deck's BOTTOM edge, not dead-center, to share the Y line — if a future
  request wants it dead-centered, the two counters can't share Y.)
- **New Game** button opens a Hebrew/RTL **confirmation dialog** before resetting (`ConfirmDialog`).
- **Opponent face-up/face-down unit offset down** (`.zone.opp .tableset margin-top`) so the opponent
  hand row doesn't overlap it.
- **Hebrew terms (never swap)**: hapuk/koupa = DECK/stock; hamira/arima = DISCARD.
- **Timing HUD** in the top bar shows `n . min . med . p90 . max` of real `decideMove` wall-time
  (separate from the UI pacing delay) — leave it; it's how we'll read the on-device numbers.

## OPEN THREADS — both RESOLVED 2026-07-01 (kept for history; see "Session 2026-07-01" for detail)
1. **RESOLVED — refill location (round-5 item 2):** the deck refill is **atomic inside `applyMove`**,
   deterministic, no RNG — `refillHand` (engine.ts:98) does `stockDeck.shift()` (front of deck) up to
   3, called in `performMove` (normal/burn/joker) + `executePendingBurn`. The post-move state already
   has the refilled hand; the UI only reads it. No engine change. Reconfirmed + extended this session:
   deck is monotonically non-increasing, so deck-count can **never** read a transient 0 (0 is always
   the stable terminal) — this unblocked the deck-empty layout (Round-6 D). See Session item 2.
2. **RESOLVED — on-device timing → `timeBudgetMs` cap SET.** Measured on the **iPhone 17** (4 full
   games, n≈289, max-of-maxes 291ms). `DEFAULT_TIME_BUDGET_MS` set **5000 (measurement) → 700**; the
   old Android **2000ms was explicitly rejected**. The cap is a SAFETY CEILING over a fixed-iteration
   search, so lowering it does not weaken the bot. See Session item 1 for the full rationale/precondition.

---

## Session 2026-07-01 — Phase 3a close-out (decisions + WHY)
Append-only log. These are settled decisions — do not silently re-decide. All UI/config work below is
**presentation-only; engine (`web/src/engine`) and bot (`web/src/bot`) were untouched and the parity
suite stayed green** (49 engine + belief parity; full run 69 passed / 3 FULL-gated skipped).

### 1. TIMING CAP — CLOSED. `DEFAULT_TIME_BUDGET_MS` 5000 → 700 (`game/gameConfig.ts`)
- **Measured:** iPhone 17, 4 full games, n≈289 decisions; **max-of-maxes = 291ms** (per-game max
  211–291ms; p90 86–201ms). Desktop reference was med 0 / p90 ~87 / max ~102ms.
- **700 chosen because:** ~2.4× headroom over the 291ms observed max AND **< `ACTION_DELAY_MS` (1280ms)**
  — even a capped pathological move stays within one pacing beat.
- **KEY PRECONDITION (the fact that makes this lossless — record it):** `timeBudgetMs` is a **SAFETY
  CEILING over a fixed-iteration search**, NOT a driver of search depth. `montecarlo.ts:38` runs a
  fixed `simulationCount = 150` round-robin; `timeBudgetMs` only `break`s the loop if a deadline is
  exceeded (`:45`). At the 5000ms measurement budget the bot finished in ≤291ms, i.e. it never
  truncated. So **5000→700 does NOT weaken the bot** (it would only ever clip an unseen overrun).
  **Old Android 2000ms explicitly rejected** (not a production figure; it was the ART budget).

### 2. REFILL-LOCUS — RESOLVED (was Open Thread #1)
- Refill is **ATOMIC inside `applyMove`** (`refillHand`, `engine.ts:98`; `stockDeck.shift()`, no RNG;
  called on every non-terminal `performMove` branch + `executePendingBurn`).
- **Deck is monotonically non-increasing** (refill only removes; nothing re-adds), and the UI's
  `effectPreview` carries `post.stockDeck` (already-resolved). ⇒ **deck-count can NEVER read a
  transient 0** mid-effect-sequence; `0` is always the stable terminal empty.
- **Why it matters:** this is the invariant that makes the deck-empty layout flip (item 4D) safe to
  fire directly on `stockDeck.length === 0` — no debounce / no "is this transient?" guard needed.

### 3. PWA STALE-SERVING — ROOT-CAUSED & FIXED (`public/sw.js`)
- **Symptom:** rebuilt `dist/` was correct & fresh, yet desktop AND phone showed zero change.
- **Cause:** a **cache-first service worker pinned to a stale shell**. `sw.js` is a hand-written
  static file (NOT `vite-plugin-pwa` — no plugin in `vite.config.ts`, no precache manifest, no
  `registerType`); because its bytes never changed across rebuilds, the browser's SW update check
  never fired, so already-installed clients kept serving the old shell.
- **Fix:** `CACHE` `'shithead-v2' → 'shithead-v3'` (the byte change is the forcing-function;
  `skipWaiting` + `clients.claim` were ALREADY present, so the new SW activates immediately and
  `activate` purges the old cache). Navigation is **NETWORK-FIRST**, so **future builds are picked up
  automatically** without a bump; the **CACHE bump remains the forcing-function** only when a future
  stuck shell must be force-evicted.
- **One-time client eviction recipe (for an already-stuck client):**
  - **Desktop (Chrome/Edge):** DevTools → Application → Service Workers → **Unregister**; Application →
    Storage → **Clear site data**; then **hard reload** (Ctrl+Shift+R).
  - **iPhone (Home-Screen PWA):** **delete the PWA icon**, THEN **Settings → Safari → Advanced →
    Website Data → delete the site** (or Clear History and Website Data). **Icon removal ALONE does
    NOT evict the SW on iOS** — the Website-Data delete is the step that clears it; then re-Add to
    Home Screen.

### 4. ROUND-6 UI POLISH — all four landed & eye-confirmed (presentation-only)
- **A. Counter spacing** (`styles.css`): `.counter.on-card` `bottom −11px → −22px` (+ `.zone.center`
  padding-bottom 16→24px to house them) so the קופה/ערימה count pills clear the card art instead of
  overlapping its bottom edge.
- **B. Player stacked-card size bug — ROOT-CAUSED, fixed at source** (`styles.css`): the +20% token
  `--cw-opp` (55px) was scoped to `.zone.opp .tslot` **only**; base `.tslot` was `--cw-sm` (46px) with
  no player override → player stacks 46px vs opponent 55px. **Unified:** base `.tslot` now uses
  `--cw-opp`, the opp-only override is deleted → **one 55px token for both seats**. *Watch-item:* if
  other seat-specific size divergences surface, unify them the same way (don't eyeball-bump).
- **C. Hand fan −10%** (`styles.css` + `ui/Board.tsx`): `--cw-hand` `74 → 66.6px` and the JS fan
  constant `cw 74 → 66.6` kept in sync (step/overlap scale with the card). Resulting card 66.6×93.24px.
  **No-overflow invariant preserved** (the fan `step` is capped to `avail`, so total width ≤ screen for
  any hand size; shrinking `cw` only makes it tighter).
- **D. Deck-empty layout** (`ui/Board.tsx`): the deck stack/marker renders **only while
  `stockDeck.length > 0`**; on exhaustion it's removed entirely and the lone discard centers
  horizontally via the section's existing `justify-content: center`. **Instant** flip, **safe because
  of item 2** (no transient 0; no spatial conflict — discard sits in its own flex row). *Deferred
  watch-item:* `KH.png` is 160×220, so a centered discard would look retina-soft only **if later
  enlarged** — that's an asset-resolution item, NOT a layout bug.

### 5. SELECTION PERSISTENCE ACROSS NON-PLAYER PHASES — implemented (`game/reducer.ts`)
- **Goal:** selections the human makes while it's NOT their turn (bot's turn, or a burn/joker effect
  delay) must **persist** until their turn arrives, instead of being cleared.
- **Representation (verified):** selection is **IDENTITY-based** — `selected: string[]` of card
  **codes** (e.g. `"7H"`), NOT positional indices. So persisting is **safe against the atomic refill**
  (a code is either still present or gone; an index could have silently re-pointed, a code cannot).
- **Change:** `APPLY` no longer blanket-clears (`selected: []`); it **RECONCILES by identity** —
  filters the surviving selection against the **current** `hand + faceUp`, dropping any card that left.
  No auto-clear, no auto-play.
- **Illegal-but-present edge case — DECISION = option (ii):** a surviving selection that is still
  in-hand but now illegal (e.g. the discard top changed during the burn/joker) **stays highlighted**;
  the existing `validateMove → canPlay` gate (`App.tsx:105`) **disables the Play button** so it can't
  be played. Chosen over (iii) auto-prune because it doesn't silently mutate a deliberate selection;
  the user adjusts it themselves.
- **Reset-path audit (IMPORTANT — record so it isn't re-litigated):** diagnosis confirmed `APPLY` was
  the **ONLY** code path that cleared selection on a bot→human / effect-resolve transition. The other
  `selected: []` is `freshUi` (`reducer.ts:37`), which fires **only** on `NEW_GAME` / `CONFIRM_SETUP` /
  initial deal — intentional, not a bug. **No component-level reset exists** (Board/CardView only READ
  `selected`; no `useEffect`, no reset handler, no `key`-remount, no component-local selection state).
  The "still resets after the fix" report was traced NOT to a second code path but to a **stale `dist/`
  bundle** — the reducer fix was on disk but never rebuilt into the served bundle (old hash
  `index-BFlEnveL.js`, `grep pool.has` = 0). **Resolved by rebuilding** (→ `index-C3K4D1xL.js`); the
  network-first SW then delivers it on reload. Lesson: after a UI source edit, **rebuild `dist/` before
  testing on device** — typecheck/tests passing is NOT delivery.

### 6. PHASE STATUS & the §3b warning (READ before Phase 3b)
- **Phase 3a: CLOSED.** Both former open threads resolved; timing cap set from real-device data.
- **Phase 3b: NOT started, and NOT uniformly presentation-only.**
  - **Presentation-safe parts of 3b:** A/B guess-then-reveal mode, the settings screen UI.
  - **NOT presentation-only — needs its own MEASURED validation plan first:** belief / HumanMemory
    **live wiring**. These activate levers that are **OFF** in the production path that was byte-validated
    against Java. Turning them on changes bot behaviour, so it must NOT be a silent toggle slipped in
    during settings-screen work — it requires a measured strength/parity experiment of its own before
    any wiring. (See CLAUDE.md AI-lever notes + PORT_NOTES §13.)

## How to run / re-test on the iPhone
```bash
cd web
npm install                          # first time only
npm run build && npm run preview     # serves dist on http://<LAN-ip>:<port> (--host on; port may bump 4173->4174 if busy — read the printed URL)
```
On the iPhone (same Wi-Fi): open the printed `http://<mac-LAN-ip>:<port>/` in **Safari -> Share -> Add
to Home Screen -> launch full-screen**. `npm run dev` gives hot reload but **measure from `preview`
(production build)**. The service worker is **network-first for navigations**, so an online client
gets the latest build; if you ever see a stale screen after an update, **one hard-reload** clears it.
Tune the whole feel via the single `ACTION_DELAY_MS` in `web/src/game/gameConfig.ts`.

## OUT of scope for 3a (don't wander in)
A/B guess-then-reveal mode, belief/HumanMemory **live** wiring, settings screen, sound, heavy
animation polish — all **Phase 3b+**.
