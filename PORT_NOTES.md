# PORT_NOTES — Shithead engine Java → TypeScript

**Status: Phase A (inventory & plan). Awaiting review before Phase B.**
This document is derived entirely from the Java source. Every rule below was read out of
the code, not assumed. Anything I could not pin down from the source is in **Open questions**.

Terminology (from the Hebrew source):
- **ערימה** = the visible discard pile → `discardPile` (Java field: `GameEngine.pile`)
- **קופה** = the hidden stock/draw deck → `stockDeck` (Java field: `GameEngine.deck`)

---

## 1. Where the engine lives

Package `com.example.shithead`, under `app/src/main/java/com/example/shithead/`.

Engine-relevant (device-independent) files — the scope of this port:

| File | Role |
|------|------|
| `GameEngine.java` | Single source of truth: state + all rule application (move apply, burns, joker, refill, win check). Also contains the AI as an inner class — **out of scope for Step 1**. |
| `RuleConfig.java` | The *live* rules engine: `canPlay`, `getPower`, `getCardAction`, `getRankName`, `isJoker`, effective-top logic. |
| `Card.java` | Card model: `code`, `suit`, `rank` (+ the `Rank` / `Suit` enums). |
| `SpecialAction.java` | Enum of special-card behaviours: `RESET, TRANSPARENT, LOWER, SKIP, BURN, JOKER, NONE`. |
| `GameEngine.PlayerState` (inner) | Per-seat zones: `hand`, `faceUp`, `faceDown`. |
| `GameEngine.AiDecision` (inner) | The move object (`PLAY` / `TAKE_PILE`, `cardsToPlay`, `faceDownIndex`). |

Explicitly **out of scope** (Step 2, do not port now): `GameEngine.MonteCarloAi` (inner),
`BeliefState`, `HumanMemory`, `RulesEngine` (legacy duplicate — *not* used by the engine),
plus the dead `MonteCarloAi.java` / `SmartAi.java` / `SimState.java` / `SimMove.java`.
Android UI (`*Activity`, `GameView`, `CardArt`, `BitmapStore`, `SoundManager`) is also out of scope.

`DeckFactory` / `DeckManifest` / `ManifestLoader` build the deck from an Android asset
manifest — **not** ported. For the web port the deck is built in code (52 + 2 jokers), exactly
as `AiStrengthTest.buildDeck()` does it (see §6).

---

## 2. Java state representation

### `Card` (`Card.java`)
```java
enum Suit { HEARTS, SPADES, DIAMONDS, CLUBS, NONE }      // NONE = jokers
enum Rank { FOUR, FIVE, SIX, SEVEN, EIGHT, NINE, TEN,
            JACK, QUEEN, KING, ACE, TWO, THREE, JOKER }  // ordering is NOT value order
final String code;   // e.g. "7H", "QS", "JOKER_A"   (immutable)
final Suit  suit;
final Rank  rank;
```
- `code` is the identity used everywhere for matching (`containsCode`, `removeByCode`). Two
  jokers exist with distinct codes (`JOKER_A`, `JOKER_B`).
- **`Rank.ordinal()` is deliberately NOT the card value.** Value comes from name-mapping in
  `RuleConfig.getNormalValue` (4→4 … A→14, 2→2, 3→3, JOKER→15). The ordinal ordering only
  matters as a stable index for the AI's scratch array (not engine logic).

### `GameEngine.PlayerState`
```java
List<Card> hand;     // concealed, the playable zone while non-empty
List<Card> faceUp;   // played only when hand is empty
List<Card> faceDown; // played blind, one index at a time, only when hand & faceUp empty
boolean isFinished() => hand & faceUp & faceDown all empty
```

### `GameEngine`
```java
RuleConfig rules;
Phase   phase   = SETUP_CHOOSE_FACEUP;     // → PLAYING → GAME_OVER
Winner  winner  = NONE;                     // NONE | PLAYER | AI
List<Card> deck = [];   // stockDeck (קופה)  — drawn from the FRONT (remove(0))
List<Card> pile = [];   // discardPile (ערימה) — top = last element
PlayerState player, ai;
boolean playerTurn = true;
// bookkeeping / UI flags:
boolean lastMoveWasSkip, lastMoveWasJoker, jokerTookCards;
boolean isPendingBurn;             // a burn is staged; pile cleared on executePendingBurn()
boolean aiLockedInPickup;          // AI flipped an invalid face-down; pickup deferred for UI
boolean playerLockedInPickup;      // human counterpart of the above
int pileVersion, lastMoveCount;    // pure UI bookkeeping
Stats playerStats, aiStats;        // turns/burns/pilePickups counters (cosmetic)
```

Notes that affect the port:
- **Deck is drawn from the front** (`deck.remove(0)`); the pile **top is the last element**.
- **Hands are kept sorted** by `getPower` ascending (`sortHand`) after deal, refill, and pickup.
  The human hand is sorted; the AI hand is sorted on setup/refill/pickup. This is deterministic,
  so I will replicate it (and *also* compare state order-insensitively per zone — see §5).

---

## 3. Public engine API (signatures) and what each does

Human / engine path (the part we port):
```java
GameEngine(RuleConfig config)
GameEngine(GameEngine other)                       // deep-ish copy (used by AI clone)
void    newGame(List<Card> fullDeck)               // shuffle + deal 3 FD, 3→faceUp(AI)/6 hand
void    confirmSetup(Card[] chosen /*len 3*/)      // human picks 3 face-up from hand+dealt
boolean playerPlaySet(List<Card> cards)            // validated human play; false if illegal
boolean playerPlayFaceDown(int index)              // blind FD flip; false ⇒ deferred pickup
void    playerTakePile()                           // voluntary/forced pickup, ends turn
void    resolvePlayerPickup()                       // completes a deferred FD pickup
boolean isGameOver()
boolean playerHasAnyLegalMove()
int     deckSize() / getPileVersion() / getLastMoveCount()
GameEngine cloneState()
```
Private but rule-critical (these define semantics; I port them as internal functions):
```java
boolean validateMove(PlayerState p, List<Card> cards)   // GROUND TRUTH for legal human moves
void    performMove(PlayerState p, List<Card> cards)     // applies a play (joker/burn/skip/normal)
void    takePile(PlayerState p)                          // pickup whole pile → hand, sort
void    burnPile(PlayerState p) / executePendingBurn()   // staged burn, then clear pile
void    refillHand(PlayerState p)                        // draw to 3 while deck non-empty
void    endTurn()                                        // playerTurn = !playerTurn
void    checkWinCondition()                              // deck empty + isFinished ⇒ winner
```
AI / simulation path — **NOT ported in Step 1**, listed only so the boundary is explicit:
`computeAiDecision`, `applyAiDecision`, `applySimulationDecision`, `applyDecision`,
`resolveAiPickup`, the whole `MonteCarloAi` inner class, and the `enableHumanBelief` /
`disableHumanBelief` / `beliefSnapshot` hooks.

### Public API actually called today (so the TS shape stays portable)
Confirmed by grepping the callers:
- **UI (`MainActivity` / `GameView`)** calls: `newGame`, `confirmSetup`, `playerPlaySet`,
  `playerPlayFaceDown`, `playerTakePile`, `resolvePlayerPickup`, `applyAiDecision`,
  `resolveAiPickup`, `executePendingBurn`, `playerHasAnyLegalMove`, `isGameOver`,
  `computeAiDecision` (bot, async); and reads fields `phase`, `playerTurn`, `winner`, `pile`,
  `player.*`, `lastMoveWasSkip/Joker`, `jokerTookCards`, `isPendingBurn`,
  `aiLockedInPickup`, `playerLockedInPickup` (all UI/anim state).
- **Bot (`MonteCarloAi`, out of scope)** internally uses: `new GameEngine(engine)` clone,
  `applySimulationDecision`, `getLegalMoves`, and `rules.canPlay` / `rules.getPower`.

For Step 1 the TS engine exposes the *rule-bearing* subset: `newGame`/`dealFromDeck`,
`confirmSetup`, `getLegalMoves`, `validateMove`, `applyMove` (= `applySimulationDecision`
semantics), `isGameOver`, plus pure helpers. The UI-anim methods (`resolve*Pickup`,
`executePendingBurn` as a separate step) are deferred to Step 3 (see §4.3 / Open Q4).

### `RuleConfig` (ported as a plain, config-driven rules object)
```java
boolean      canPlay(Card card, List<Card> pile)
int          getPower(Rank rank)
SpecialAction getCardAction(Rank rank)
boolean      isJoker(Rank rank)
String       getRankName(Rank rank)
// private: getNormalValue, getEffectiveTopCard
```
In Java `getCardAction` reads SharedPreferences (per-rank user-configurable) behind a 2s
cache. **That is Android-only.** The web port takes the *default* mapping (identical to
`AiStrengthTest.TestRuleConfig`) as an injectable config object — see §4.4 and Open questions.

---

## 4. The variant rules, exactly as the Java implements them

All checked against `RuleConfig.canPlay` / `getPower` / `getNormalValue` and
`GameEngine.performMove`.

### 4.0 Checklist → exact Java location (one line each)
| Rule | Java location |
|------|---------------|
| Joker transfers pile (to opponent's **hand**) | `RuleConfig.canPlay:26` (always legal) + `GameEngine.performMove:320-336`; detect `RuleConfig.isJoker:125` |
| 2 resets | `RuleConfig.canPlay:28` (own) & `:38` (on top); power `getPower:60` |
| 3 transparent (see-through) | `RuleConfig.canPlay:29` + `getEffectiveTopCard:129-137` (skips TRANSPARENT); power `getPower:61` |
| 7-and-under regime | `RuleConfig.canPlay:41-45` (`topAct==LOWER` ⇒ `getNormalValue ≤ 7`; 10 fails) |
| 8 skips next player | `GameEngine.performMove:363-369` (set `lastMoveWasSkip`, no `endTurn`) |
| 10 burns | `RuleConfig.canPlay:48` (legal when no 7) + `GameEngine.performMove:353,355-359`; power `getPower:59` |
| Four-of-a-kind burns | `GameEngine.performMove:343-351` (top 4 same rank) |
| 4 lowest / Ace highest | `RuleConfig.getNormalValue:72,83` (4→4, A→14) + `getPower:55-64`; final compare `canPlay:51` |
| Cross-zone combine (hand+faceUp) | `GameEngine.validateMove:286-291` (only when `deckSize()==0` & all hand same rank) |
| Face-down reveal-on-play / invalid⇒pickup | human `playerPlayFaceDown:158-181`; sim `applyDecision:228-247` |
| Pickup / burn-clear / refill / win | `takePile:393-402`, `executePendingBurn:385-391`, `refillHand:404-411`, `checkWinCondition:417-426` |
| Deal / setup | `newGame:67-84`, `setupAiFaceUp:90-97`, `confirmSetup:99-113` |

### 4.1 Values & power
`getNormalValue`: 4..10 literal, J=11, Q=12, K=13, **A=14**, 2=2, 3=3, JOKER=15.
`getPower` (used for "beats" comparisons and hand sort), higher = stronger:
- JOKER → 99
- 10 (BURN) → 30
- 2 (RESET) → 29
- 3 (TRANSPARENT) → 28
- everything else → its normal value (4..14)

So among normals **4 is lowest, A (14) is highest**. ✔ requirement met.

### 4.2 `canPlay(card, pile)` — the order of checks matters
1. pile empty ⇒ **true**.
2. card is **joker** ⇒ **true** (plays on anything).
3. card action **RESET (2)** ⇒ **true**.
4. card action **TRANSPARENT (3)** ⇒ **true**.
5. `top = effectiveTopCard(pile)` = last card whose action ≠ TRANSPARENT (i.e. **3s are
   see-through**). If none (pile is all 3s) ⇒ **true**.
6. if `top` action **RESET (2)** ⇒ **true** (a 2 on top resets — anything plays).
7. if `top` action **LOWER (7)** ⇒ **true iff `normalValue(card) ≤ 7`** (the 7-and-under
   regime). 2/3/joker already returned true above; **10 reaches here and FAILS** (10 > 7).
8. if card action **BURN (10)** (and no 7 underneath) ⇒ **true** (10 plays on anything else).
9. else ⇒ **`getPower(card) ≥ getPower(top)`** (equal rank is legal).

### 4.3 Special-card effects in `performMove` (after the cards leave hand/faceUp)
Action is taken from the **first** played card's rank; an explicit `isJoker` recheck forces
JOKER. Then:

- **JOKER — transfer pile.** If pile non-empty: `opponent.hand += pile`, then `pile.clear()`.
  Refill the mover's hand. **Turn does NOT switch** (mover plays again). If pile empty: just
  clears, no transfer, no switch.
  - ⚠ **The joker card itself is removed from the mover's hand and discarded — it is NOT added
    to the pile and NOT given to the opponent. It leaves the game entirely.** (See Open Q1.)
- **BURN (10) or four-of-a-kind** — burn. After `pile += cards`: if the top 4 cards of the pile
  are the same rank → four-of-a-kind burn; or if the played action is BURN → ten burn. On burn:
  `burnPile` (refills mover), set `isPendingBurn = true`, **return without switching turn**
  (mover plays again). The pile is actually emptied later by `executePendingBurn`
  (in sim/AI this auto-runs; in the live UI it runs after the burn animation).
- **SKIP (8)** — after `pile += cards` and refill: set `lastMoveWasSkip`, **return without
  switching turn** (the opponent is skipped, mover plays again).
- **Normal / RESET (2) / TRANSPARENT (3)** — `pile += cards`, refill, **endTurn** (switch).

Ordering inside `performMove` (must preserve): remove from zones → joker branch (early return)
→ `pile += cards` → four-of-a-kind check → burn check (early return) → refill → skip check
(early return) → endTurn.

### 4.4 Special-action mapping (defaults — what the web port ships)
`2→RESET, 3→TRANSPARENT, 7→LOWER, 8→SKIP, 10→BURN, joker→JOKER, all others→NONE.`
(Identical to `AiStrengthTest.TestRuleConfig`; the Android per-rank override is **not** ported —
see Open Q3.)

### 4.5 Legal **human** move space (`validateMove`)
A proposed set `cards` is legal iff:
- non-empty and **all the same rank**, and
- `canPlay(cards[0], pile)` is true, and
- every card is in `p.hand` and/or `p.faceUp` (face-down is NOT played through this path), and
- zone rule:
  - **hand + faceUp mixed**: only allowed when `deckSize() == 0` **and every card in hand is
    that same rank** (cross-zone combine, late game only).
  - **faceUp only**: only allowed when `hand` is empty.
  - **hand only**: always (the normal case).

Face-down is played via `playerPlayFaceDown(index)` — only when hand & faceUp are both empty;
reveal one card; if `canPlay` → play it; else → it goes onto the pile and the mover must take
the pile (deferred via `playerLockedInPickup`, completed by `resolvePlayerPickup`).

### 4.6 Win condition (`checkWinCondition`)
`winner = PLAYER` iff `deck.isEmpty() && player.isFinished()`; symmetrically for AI.
**Only checked once the stock deck is empty** (you can't win while cards remain to draw).
Early-returns while `aiLockedInPickup` is set.

### 4.7 Deal (`newGame`)
Shuffle deck. Deal **3 face-down each** (player then ai), then **6 hand each**. Sort the human
hand. The AI auto-picks its 3 face-up as its 3 highest-power cards (`setupAiFaceUp`). Phase =
`SETUP_CHOOSE_FACEUP`, `playerTurn = true`. The human chooses face-up via `confirmSetup` (which
pools hand+the dealt-aside face-up back together, then sets the 3 chosen aside) → Phase `PLAYING`.

---

## 5. Proposed Java → TS mapping

Pure functional core (no DOM/IO/timers/globals; strict mode). `applyMove` clones the input
state, mutates the clone exactly as the Java does, and returns the new state — immutable
signature, byte-faithful semantics.

**Canonical transition = Java's `applySimulationDecision`** (the path the working full-game
driver `AiStrengthTest.playGame` uses for both seats): turn-aware (acts on whichever seat's
turn it is — `playerTurn ? player : ai`), auto-resolves a pending burn at entry and exit, and
resolves an invalid face-down flip to an immediate `takePile` + `endTurn`. So every state
returned by `applyMove` is **fully resolved** — `isPendingBurn` is always false on exit and
there are no half-finished UI-deferred states. The UI-deferred flags (`isPendingBurn` held for
a burn animation, `playerLockedInPickup`/`aiLockedInPickup` for a reveal delay) are a **Step-3
UI concern**, layered on top later; they are not part of the Step-1 engine semantics. A `Move`
is therefore seat-agnostic — the seat is implied by `state.playerTurn`.

```
web/src/engine/
  cards.ts        Suit, Rank (string-literal unions), Card type, RANK_ORDER, buildDeck()
  rules.ts        RuleConfig: getNormalValue, getPower, getCardAction(config), isJoker,
                  effectiveTopCard, canPlay, getRankName  (pure; takes a SpecialActionMap)
  state.ts        Phase, Winner, PlayerState, GameState types; cloneState; sortHand; isFinished
  moves.ts        Move (tagged union), getLegalMoves(state), validateMove(state, cards)
  engine.ts       newGame(deck, rng), confirmSetup, applyMove(state, move) → GameState,
                  internal: performMove, takePile, burnPile/executePendingBurn, refillHand,
                  endTurn, checkWinCondition
  rng.ts          RNG interface + seeded mulberry32 impl; injected into newGame/shuffle
  serialize.ts    toJSON / fromJSON for Card / GameState / Move (canonical schema, §7)
  index.ts        public surface
  __tests__/      parity tests + per-rule unit tests
```

| Java | TS |
|------|----|
| `Card.Rank` enum | `type Rank = 'FOUR'|...|'THREE'|'JOKER'` (+ `RANK_ORDER` array for the ordinal) |
| `Card.Suit` enum | `type Suit = 'HEARTS'|'SPADES'|'DIAMONDS'|'CLUBS'|'NONE'` |
| `Card` | `interface Card { code: string; suit: Suit; rank: Rank }` |
| `SpecialAction` | `type SpecialAction = 'RESET'|'TRANSPARENT'|'LOWER'|'SKIP'|'BURN'|'JOKER'|'NONE'` |
| `RuleConfig` (live, SharedPrefs) | `rules.ts` pure fns taking a `SpecialActionMap` (defaults = §4.4) |
| `PlayerState` | `interface PlayerState { hand: Card[]; faceUp: Card[]; faceDown: Card[] }` |
| `GameEngine` (state fields) | `interface GameState { ...all §2 fields... }` |
| `AiDecision` (PLAY/TAKE_PILE) | `type Move` tagged union (§7) — engine-level, not the AI's |
| `validateMove` | `validateMove(state, cards)` (ground truth, unchanged semantics) |
| `getLegalMoves` (NEW, canonical) | enumerates everything `validateMove` accepts + FD + pickup |

**`getLegalMoves` is a new canonical generator** (Java has none for the human — the AI's
`getLegalMoves` is intentionally narrower: single + all-copies only). For parity I define one
generator, implemented identically in the Java exporter and TS:
- If `hand` non-empty: for each rank present in hand whose `canPlay` is true, emit **every
  non-empty same-rank subset from hand** (counts are ≤4, so ≤15 subsets/rank — tractable). If
  `deckSize()==0` and all hand cards share that rank and faceUp has that rank, also emit the
  cross-zone combos.
- Else if `faceUp` non-empty: same subset enumeration over faceUp.
- Else if `faceDown` non-empty: one blind move per index (`{kind:'PLAY_FACE_DOWN', index}`).
- Plus `{kind:'TAKE_PILE'}` is always available when the pile is non-empty.
The exporter will assert every emitted PLAY passes `validateMove`, so the generator can't drift
from the ground truth. (This needs `validateMove` reachable from the test — see §6 / Open Q4.)

### Determinism / RNG
Java `newGame` calls `Collections.shuffle(deck)` with **no seed → non-deterministic**.
`DeckFactory.shuffle(cards, seed)` does use `new Random(seed)`, but the engine itself doesn't.
For TS, **RNG is injected** (`newGame(deck, rng)`); a seeded `mulberry32` gives reproducible
deals. We do **NOT** attempt bit-exact shuffle parity with Java (the algorithms differ). Per the
task, **parity is STATE-based**: fixtures pin explicit pre-move states, so shuffling never enters
the parity comparison.

State comparison in parity tests is **order-insensitive within each zone** (hand/faceUp/
faceDown/pile/deck compared as multisets of `code`) AND I replicate `sortHand`, so both
representations agree regardless.

---

## 6. Parity exchange — Java golden-vector export harness (trajectory-based)

Instead of isolated before/after fixtures, parity uses **golden vectors**: each is a full
*trajectory* — an explicit initial deal, a fixed sequence of moves, and a **full state snapshot
after every move**. The TS suite replays the same initial state + same moves and asserts every
snapshot matches.

- New JUnit test `app/src/test/java/com/example/shithead/GoldenVectorExportTest.java`
  (a `@Test`, run on the JVM — no device). **Additive only; no Java production file is modified**
  (uses public APIs + public zone fields; precedent: `buildDeck()` is already package-visible).
- Uses **Gson** (already an `implementation` dep, on the unit-test classpath) to serialize.
- Rules: a no-Android `TestRuleConfig` (same defaults as `AiStrengthTest.TestRuleConfig`), so no
  emulator/SharedPreferences. The action map is recorded in each vector so TS uses the same one.
- Deck: `AiStrengthTest.buildDeck()` (52 + 2 jokers).

**How each vector is produced (all via public APIs):**
- *Targeted scenarios* (every special rule, see §8): the harness builds a specific `initialState`
  by directly setting the public zone lists / `pile` / `deck` / `playerTurn`, records it, then
  applies a **scripted** list of `Move`s through `applySimulationDecision`, snapshotting after
  each. Hand-crafting the start lets each rule be isolated cleanly.
- *Full game to completion*: the harness runs the real engine path — `newGame(deck)` then
  `confirmSetup(...)` (the proven `AiStrengthTest.playGame` setup) — records the concrete
  post-setup `initialState`, then drives **both seats with a fixed deterministic greedy policy**
  (lowest-legal-rank, all copies — the existing `greedyDecision`), recording the resulting move
  sequence + a snapshot after each `applySimulationDecision`, until `isGameOver()`. TS replays
  the **recorded move sequence** (it never needs the policy or Java's RNG).
- Each snapshot also carries the **legal-move set** for the seat to move, computed in the harness
  from public `canPlay`/`getPower` (replicating the `validateMove` enumeration of §4.5), so the
  TS `getLegalMoves` is parity-checked too (order-insensitive).

Why this sidesteps Java's RNG: the vector records the **concrete `initialState`** (and, for the
deal vector, the explicit `initialDeck` order). TS loads that concrete state and replays moves —
it never reproduces `java.util.Random`. (See Open Q7 for the one deal-logic vector.)

- Output: one JSON file per vector under `web/test/golden/<id>.json` (schema §7), committed.
- **Command to (re)generate the vectors** (exact form confirmed in Phase B):
  ```powershell
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
  .\gradlew.bat :app:testDebugUnitTest --tests "com.example.shithead.GoldenVectorExportTest"
  ```
- Vitest suite `web/src/engine/__tests__/parity.test.ts` loads every vector and asserts, for each
  step: TS `applyMove(state, move)` deep-equals the recorded snapshot (zone multisets keyed by
  `code` + all scalar flags + phase/winner/turn), and TS `getLegalMoves` matches the recorded set.

Existing Java unit tests to port verbatim: **none** — `ExampleUnitTest` is the default `2+2`
stub; `AiStrengthTest`/`MemoryModelTest` are AI-strength harnesses (Step 2), not engine unit
tests. I'll add fresh TS unit tests per rule alongside the golden-vector parity suite.

---

## 7. Canonical JSON schema (both sides serialize to this)

```jsonc
// Card
{ "code": "7H", "suit": "HEARTS", "rank": "SEVEN" }

// Move  (engine-level; tagged by "kind")
{ "kind": "PLAY",           "cards": [Card, ...] }   // same-rank set from hand/faceUp
{ "kind": "PLAY_FACE_DOWN", "index": 0 }             // blind face-down flip
{ "kind": "TAKE_PILE" }

// PlayerState
{ "hand": [Card...], "faceUp": [Card...], "faceDown": [Card...] }

// GameState
{
  "phase": "PLAYING",                 // SETUP_CHOOSE_FACEUP | PLAYING | GAME_OVER
  "winner": "NONE",                   // NONE | PLAYER | AI
  "stockDeck": [Card...],             // קופה  (front = next draw)
  "discardPile": [Card...],           // ערימה (last = top)
  "player": PlayerState,
  "ai": PlayerState,
  "playerTurn": true,
  "lastMoveWasSkip": false,
  "lastMoveWasJoker": false,
  "jokerTookCards": false,
  "isPendingBurn": false,
  "aiLockedInPickup": false,
  "playerLockedInPickup": false
}

// Golden vector file  (one trajectory)
{
  "id": "full_game_1",
  "specialActions": { "TWO":"RESET","THREE":"TRANSPARENT","SEVEN":"LOWER",
                      "EIGHT":"SKIP","TEN":"BURN" },   // rule map used to produce it
  "initialDeck": [Card...],            // OPTIONAL: present only for the deal-logic vector
  "initialState": GameState,           // concrete start (post-setup); TS loads this directly
  "initialLegalMoves": [Move...],      // legal moves for the seat to move at the start
  "steps": [
    { "move": Move, "state": GameState, "legalMoves": [Move...] },   // after applying move[0]
    { "move": Move, "state": GameState, "legalMoves": [Move...] },   // after applying move[1]
    ...                                                              // last state isGameOver
  ]
}
```
`legalMoves`/`initialLegalMoves` are for the seat **to move** in that state (empty once
`isGameOver`). `stockDeck`/`discardPile` are the canonical names; the Java exporter maps
`deck`→`stockDeck`, `pile`→`discardPile`. `pileVersion`/`lastMoveCount`/`Stats` are **excluded**
(pure UI bookkeeping, not engine semantics).

---

## 8. Parity scenarios (the part I most want reviewed)

Each is a **trajectory** (crafted `initialState` + a scripted move sequence, snapshot after
each move), unless noted as the full-game vector. `★` = a required variant rule from the
checklist. Targeted vectors are usually 1–3 moves; the full game runs to `isGameOver`.

| id | What it pins |
|----|--------------|
| `joker_transfer` ★ | Pile = `[KS, 9H, 5C]`, mover plays `JOKER_A` → pile moves to opponent's **hand**, joker removed from game, pile empty, **same mover's turn**, refill. |
| `joker_on_empty` ★ | Empty pile + joker → no transfer, pile stays empty, no turn switch, joker gone. |
| `two_resets` ★ | Top = `2` over a `KH`; play a `4` → legal (RESET lets anything follow). |
| `three_transparent_beats_under` ★ | Pile `[9S, 3H]` (3 on top, see-through) → must beat the **9**: `8` illegal, `9` legal, `KH` legal. getLegalMoves reflects this. |
| `three_over_seven` ★ | Pile `[7C, 3H]` → 7-regime still applies under the 3: `6` legal, `8`/`10` illegal. |
| `seven_regime_satisfied` ★ | Top `7` → `6` legal. |
| `seven_regime_violated` ★ | Top `7` → `8`, `10` illegal; `2`,`3`,joker legal. |
| `eight_skips` ★ | Play `8` → `lastMoveWasSkip=true`, **turn does not switch**. |
| `ten_burns` ★ | Pile `[6H, 9C]`, play `10` → `isPendingBurn` staged → after `executePendingBurn` pile empty, same mover. |
| `four_of_a_kind_burn` ★ | Pile `[5H,5S,5D]`, play `5C` → four-of-a-kind burn, same mover. |
| `four_of_a_kind_across_turn` ★ | Pile has `[5H,5S]`, mover plays a pair `5D,5C` completing four → burn. |
| `cross_zone_combine` ★ | `deck` empty, hand `=[6H,6S]`, faceUp has `6D`; play `[6H,6S,6D]` → legal multi-zone play. |
| `face_down_invalid_pickup` ★ | hand & faceUp empty, top `KH`, flip a face-down `4` → invalid → mover takes pile (deferred flag). |
| `face_down_valid` | flip a face-down that legally beats top → normal play. |
| `normal_beat_equal` | Top `9` → `9` legal (≥), `8` illegal, `JS` legal. |
| `refill_to_three` | hand below 3 with deck non-empty after a play → draws back to 3 from deck front, hand re-sorted. |
| `pickup_then_endturn` | non-empty pile, `TAKE_PILE` → pile→hand, hand sorted, turn switches. |
| `midgame_full_legalmoves` | mixed hand (e.g. `4H,4S,7D,7C,10H,KS`) on a non-trivial pile → **full getLegalMoves** comparison (singles, pairs, specials). |
| `setup_confirm` | `SETUP_CHOOSE_FACEUP` + `confirmSetup([...3])` → 3 face-up set, phase `PLAYING`. |
| `stacked_threes` ★ | Pile `[8H, 3S, 3D]` (two stacked 3s) → effective top is still the `8`; verify Java's see-through skips *all* trailing 3s. |
| `zone_progression` | Trajectory draining a seat: hand emptied (deck empty so no refill) → plays from `faceUp` → then blind `faceDown`, snapshotting each zone transition. |
| `win_end_state` | Final move empties the last zone with deck empty → `phase=GAME_OVER`, `winner` set. Exercises the lose side implicitly (other seat not finished). |
| `deal_from_deck` | **Has `initialDeck`**: explicit 54-card order → documented deal + `confirmSetup` → asserts TS `dealFromDeck` reproduces the recorded `initialState` (tests deal/setup logic; see Open Q7). |
| `full_game_1` (+ maybe `_2`) | **Full game to completion**, both seats greedy from a real `newGame` deal; snapshot after every ply until `isGameOver`. The end-to-end faithfulness check. |

I'll add more if a rule turns out under-covered while porting.

---

## 9. Open questions (need your call before/while doing Phase B)

1. **Joker discards itself.** In `performMove`'s joker branch the played joker is removed from
   the mover's hand but never added to the pile or the opponent — it leaves the game. Is that
   intended (a real "the joker is consumed" rule), or a latent bug? I will **preserve the Java
   behaviour exactly** for parity and flag it; tell me if you instead want it "fixed" in the TS
   port (that would break parity by design).
2. **Joker into opponent's hand, not pile.** The transferred pile goes to the *opponent's hand*
   (they must now play those cards), not discarded. Confirm this is the intended variant (the
   code is unambiguous; just confirming it's the rule you want, since some Shithead variants
   instead burn on joker).
3. **Rule configurability.** The Android build lets the user remap 2/3/7/8/10 to different
   actions via Settings. The web port ships the **defaults** as an injectable `SpecialActionMap`.
   Do you want the PWA to expose the same settings later, or is the fixed default variant fine?
   (Parity fixtures use the defaults regardless.)
4. **Deferred UI states are Step-3, not Step-1 (confirm).** The Step-1 engine transition is the
   fully-resolved `applySimulationDecision` semantics (burns/invalid-flips auto-resolve). The
   UI-deferred flags (`isPendingBurn` held for an animation, `playerLockedInPickup`/
   `aiLockedInPickup` for a reveal delay) are deliberately **not** modeled now — they'll be a
   thin layer in the UI step. Confirm you're OK deferring those (the alternative is to model the
   two-phase burn/pickup state machine in the engine now).
7. **Deal-logic vector — zero-change vs. one tiny hook.** Java's `newGame` always shuffles
   internally, so to test the deal from an *explicit* deck order I either (a) **replicate the
   (trivial, fully-readable) deal in the harness** from public fields + public `confirmSetup`
   (zero Java production change — my default), or (b) add a ~3-line package-private
   `dealNoShuffle(List<Card>)` to `GameEngine` so the deal vector runs the *real* code path. I'll
   go with (a) unless you'd rather have (b)'s extra fidelity on this one vector.
5. **Win-while-deck-nonempty.** `checkWinCondition` only declares a winner once the deck is
   empty. Because refill tops the hand to 3 while the deck has cards, a player can't actually
   empty out earlier — so this is consistent, but I'm calling it out in case you expected
   "first to empty all zones wins" regardless of deck.
6. **Scope confirmation.** Step 1 ports engine + `RuleConfig` only; I am **not** porting the AI,
   belief, or `RulesEngine`. The TS `Move` type is the engine-level move (`PLAY` /
   `PLAY_FACE_DOWN` / `TAKE_PILE`), distinct from the AI's `AiDecision`. Confirm that boundary.

---

## 10. Phase B execution order (for when you approve)

1. Scaffold `web/` (Vite + TypeScript **strict**, Vitest). **No React/UI deps this step** —
   just the engine module + test runner. (Task says UI is a later step.)
2. Port `cards.ts` → `rules.ts` → `state.ts` → `moves.ts` → `engine.ts` (`applyMove` =
   `applySimulationDecision` semantics) → `serialize.ts` → `rng.ts` (`dealFromDeck` for the deal
   vector). Pure, deterministic, side-effect-free.
3. Add `GoldenVectorExportTest.java` (additive, public-API only) and run it once (exact command
   in §6) → committed `web/test/golden/*.json`.
4. Write the Vitest parity suite (replays every vector, asserts every per-move snapshot +
   legal-move set) plus fresh per-rule unit tests; iterate to green.
5. Write `web/README.md`: module layout, how to regenerate golden vectors from Java, how to run
   the TS tests.
6. Update this file with the final mapping, assumptions, and parity pass/fail counts.

---

---

## 11. Phase B results (executed)

**Status: DONE. All parity + unit tests green.**

- **Scaffold:** `web/` = pure TS library (TypeScript strict + `@types/node` + Vitest). No
  React/UI/bundler (deferred to Step 3). Engine in `web/src/engine/` (8 modules per §5).
- **Java harness:** `app/src/test/java/com/example/shithead/GoldenVectorExportTest.java` —
  additive JUnit, **zero production change**, public APIs only. Legality from the real
  `validateMove` (clone + `playerPlaySet`); transitions from the real `applySimulationDecision`.
- **Golden vectors:** 20 files in `web/test/golden/`. Regenerate via
  `gradlew :app:testDebugUnitTest --tests "...GoldenVectorExportTest"` (see README).
- **TS tests:** `npm test` ⇒ **49 passed** (40 golden-vector parity assertions across the 20
  vectors + 9 hand-derived unit tests). `npm run typecheck` clean under strict.

**High-risk scenario coverage (decision §3a–§3g) — all pinned & passing:**
| Req | Vector(s) |
|-----|-----------|
| 3a 7-and-under matrix | `seven_under_matrix` (2/3/4/Joker/4-of-a-kind legal; 8/10/A illegal — **10 blocked under 7**) |
| 3b transparent-3 stacking | `three_on_seven`, `three_stacked_on_eight`, `three_full_pile`, `three_on_empty` |
| 3c cross-zone (+/−) | `cross_zone_positive`, `cross_zone_deck_nonempty`, `cross_zone_mixed_hand` |
| 3d burn + next-player | `ten_burns`, `four_kind_burn`, `four_kind_across_turn` |
| 3e 8-skip | `eight_skip` (mover plays again) |
| 3f forced face-down | `face_down_invalid_pickup` (resolved pickup), `face_down_valid_win` |
| 3g joker | `joker_transfer`, `joker_on_empty` |
| deal / setup / full game | `deal_from_deck`, `setup_confirm`, `full_game` (PLAYER wins, 75 plies) |

**Parity gaps still open:** none in covered behaviour. Carry-overs by design:
1. **Joker-leaves-the-game** preserved (per decision §4) and documented by `joker_transfer` /
   `joker_on_empty`; still flagged as an intended-vs-bug question (Open Q1).
2. **UI-deferred flags** (`isPendingBurn`/`*LockedInPickup`) intentionally always-resolved here
   (Step-3 concern, per decision §5) — they serialize as `false` in every snapshot.
3. **getLegalMoves** mirrors the production AI generator (single + all-copies per rank, no
   cross-zone); arbitrary-subset / cross-zone legality is covered by `validateMove` probes.

---

## 12. Phase 2 results (bot + belief)

**Status: ported; deterministic belief layer exact; stochastic layer in-band.**

### Modules (`web/src/bot/`)
`config` (levers, production defaults) · `beliefState` (deductive + void) · `humanMemory`
(EXACT/BUCKET/FORGOTTEN) · `determinize` (uniform/belief/human, **seat-aware**) · `montecarlo`
(`decideMove`, round-robin under the wall-clock cap). Reuses engine `getLegalMoves`/`applyMove`
— no rule fork. All randomness via injected `mulberry32`; clock injectable. Worker-ready, not wired.

### (1) Deterministic belief layer — EXACT golden-vector parity
`BeliefVectorExportTest.java` (additive, public-API, zero production change) → 12 vectors in
`web/test/golden-belief/`; `belief.parity.test.ts` replays → **13/13 exact** (pinned set,
void-contradiction set, fairness; HumanMemory exact/bucket demands, leak guard). The belief
update is byte-identical to Java.

### (2) Stochastic MC layer — statistical (FULL config: 150 sims / 2000 ms)
- **Baseline win-rate vs greedy: 75.0%** (225/300, ±2.5, 0 draws). Bang on target.
- **Belief recovery (MC seat-controlled mirror, N=300):** baseline (no belief) **48.0%**;
  **scoop-only +19.3 pts (±4.0) = 110%** of the +17.5 ceiling; **scoop+void +16.0 pts (±4.0) = 91%**
  (squarely in the 88–97% target band). Void contribution −3.3 pts (≈0, within ~1 SE — matches the
  Java note "scoop-only ~E2 anchor; void may differ"). Fairness invariant (`isFair()`) held every
  ply — no leak. Run: ~65 min real compute (the earlier 11.5h was overnight hibernation, not a bug;
  validate.full now logs per-game progress so a freeze is visible immediately).

### Two bugs found & fixed in the seat-aware path (production-NEUTRAL — `ai`-turn unchanged):
1. `determinize` keyed off the side-to-move (was hardcoded to the `ai` seat) — the mirror's
   player-seat bot had scrambled self-knowledge.
2. `decideMove` counts rollout wins for the **deciding** seat, not always `'AI'` — the player
   seat was maximizing the AI's wins (playing to lose). Both only affect a bot on the `player`
   seat (the mirror); the production `ai`-seat baseline (75.0%) is unaffected.

### CI tiers
Fast (`bot.smoke.test.ts`, reduced sims, regression-only) + full (`validate.full.test.ts`,
gated by `FULL=1`, reports the trusted 150/2000 numbers). Levers all OFF/null by default.

### Open / not done (by scope)
Live UI/Worker wiring (Phase 3); voluntary-pickup (gated, −7pt regression unresolved); E4/E5
sweeps (levers ported & exact, but the full strength-vs-lossiness curves not re-measured here).

---

## 13. Known parity residuals (Phase 2.5 — belief-ON only, accepted, NOT fixed)

Both live entirely in **experimental, off-by-default belief configs**. The production path (all
levers OFF → uniform determinization, **75.0%** baseline) is byte-identical to Java (validated
exactly in Phase 2) and is unaffected — **neither residual blocks Phase 3**.

**First, the L0 reconciliation (resolved):** sweep **L0 = +19.3 = Phase-2 scoop-ONLY (+19.3)**,
exactly. `HumanMemory` has **no void inference in either language** (code-verified), so its
max-fidelity is scoop-only, **not** the scoop+void `BeliefState` (+16.0). L0 was never scoop+void;
the earlier "+16.0 should be L0" premise was a category error. No harness bug.

1. **Absolute scoop-only offset (~+4 pts hotter than Java).** TS scoop-only runs ~+3–4 pts above
   Java's, seen **three consistent ways**: Phase-2 recovery mirror (scoop-only +19.3 = 110% of the
   +17.5 ceiling), Phase-2 scoop-only (+19.3), and sweep L0 (+19.3). Same size & direction ⇒ signal,
   not noise. The deductive mechanics are byte-exact (13/13 belief golden vectors), so the locus is
   the **biased sampler's unknown-pool fill** (`randomizeHiddenCardsBiased` / `fillNonContradicting`
   around pinned cards), **not** the belief computation. Belief-ON only.
2. **Normalized lossy-curve shape (L4 60% vs Java 39% of L0; L1/L2 above the 65–83% band).**
   Normalized to each side's own L0, so independent of #1. Likely the **`classify()` tie-break**:
   same-pickup cards share `scoopTurn`/`batch` (tied priority); the EXACT/BUCKET/FORGOTTEN split
   among ties depends on iteration order — Java `HashMap` vs TS `Map` — so live multi-card pickups
   diverge. This is the cross-language non-determinism deliberately designed around in the golden
   vectors (distinct turns → 13/13 byte-exact). Stochastic lossy path, belief-ON only.

**Decision (2026-06-29):** both documented, accepted, left **UNFIXED** (no scope creep). No Java
re-run (the offset is already triple-confirmed). If the absolute offset is ever worth closing, look
at the **biased sampler's unknown-pool fill**, not the deductive belief (which is exact).
