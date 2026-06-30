import type { Card } from '../engine/cards';
import type { GameUiState } from '../game/reducer';
import { CardFace, CardBack, CardSlot } from './CardView';
import { T } from './strings';

interface BoardProps {
  state: GameUiState;
  selected: Set<string>;
  faceDownActive: boolean;
  onSelect: (code: string) => void;
  onFaceDown: (index: number) => void;
}

// A1 + #3: face-up cards rest ON their face-down slot AND stay PINNED to a fixed slot for the whole
// game (no hole-filling). Face-down (blind backs) stays array-indexed so the tap maps to the engine index.
function TableSet(props: {
  faceUp: Card[]; faceDown: Card[]; slots?: string[] | undefined; selected?: Set<string>;
  faceDownActive?: boolean; onSelect?: (code: string) => void; onFaceDown?: (i: number) => void;
}) {
  const { faceUp, faceDown, slots, selected, faceDownActive, onSelect, onFaceDown } = props;
  const n = slots ? slots.length : Math.max(faceUp.length, faceDown.length);
  return (
    <div className="tableset">
      {Array.from({ length: n }).map((_, i) => {
        const fd = faceDown[i];
        const fu = slots ? faceUp.find((c) => c.code === slots[i]) : faceUp[i];
        return (
          <div className="tslot" key={i}>
            {fd && <span className="tslot-back"><CardBack small /></span>}
            {fu && (
              <span className="tslot-up">
                <CardFace card={fu} small selected={selected?.has(fu.code)}
                  disabled={!onSelect} onClick={onSelect ? () => onSelect(fu.code) : undefined} />
              </span>
            )}
            {fd && !fu && faceDownActive && onFaceDown && (
              <button className="fd-tap" type="button" aria-label="flip" onClick={() => onFaceDown(i)} />
            )}
            {!fd && !fu && <span className="tslot-empty" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

function Hand(props: { cards: Card[]; selected: Set<string>; onSelect: (code: string) => void }) {
  const { cards, selected, onSelect } = props;
  const cw = 66.6; // hand card width (round-6 C: 74 ×0.9); MUST match --cw-hand. Fan step/overlap scales with it.
  const avail = Math.min((typeof window !== 'undefined' ? window.innerWidth : 390) - 20, 760);
  const step = cards.length <= 1 ? cw : Math.min(cw * 0.72, (avail - cw) / (cards.length - 1));
  const overlap = Math.round(step - cw);
  return (
    <div className="hand-fan" role="group" aria-label={T.you}>
      {cards.map((c, i) => (
        <div className="fan-card" key={c.code} style={{ marginInlineStart: i === 0 ? 0 : overlap, zIndex: i }}>
          <CardFace card={c} selected={selected.has(c.code)} onClick={() => onSelect(c.code)} />
        </div>
      ))}
    </div>
  );
}

export function Board({ state, selected, faceDownActive, onSelect, onFaceDown }: BoardProps) {
  // #2: while an effect resolves, render the Frame-1 synthetic state the engine produced (refilled
  // hand, decremented deck, played card on the pre-burn pile); otherwise the live state.
  const displayEngine = state.ui.effectPreview ?? state.engine;
  const { player, ai, discardPile, stockDeck } = displayEngine;
  const slots = state.ui.faceUpSlots;
  const playerHand = player.hand;
  const playerFaceUp = player.faceUp;
  const aiHand = ai.hand;
  const aiFaceUp = ai.faceUp;
  const top = discardPile.slice(-4);

  return (
    <div className="board">
      <section className="zone opp" aria-label={T.opponent}>
        <div className="zone-tag">{T.opponent}</div>
        <div className="hand-fan backs" aria-hidden>
          {aiHand.map((_, i) => (
            <div className="fan-card" key={i} style={{ marginInlineStart: i === 0 ? 0 : -30, zIndex: i }}>
              <CardBack small />
            </div>
          ))}
        </div>
        <TableSet faceUp={aiFaceUp} faceDown={ai.faceDown} slots={slots?.ai} />
      </section>

      {/* #4: deck + discard CARDS bottom-aligned (same Y); both counters on a shared Y line.
          Round-6 D: when the deck (koupa) is exhausted (STABLE terminal — refill is atomic, deck is
          monotonic, so 0 is never transient) drop the deck stack/marker entirely; the lone discard
          then centers horizontally via the section's justify-content: center. */}
      <section className="zone center">
        {stockDeck.length > 0 && (
          <div className="deck-stack">
            <CardBack />
            <span className="counter on-card">{T.deck} {stockDeck.length}</span>
          </div>
        )}
        <div className="pile-stack">
          <div className="cascade" aria-label={T.discard}>
            {top.length === 0 && <CardSlot><span className="empty-tag">{T.discard}</span></CardSlot>}
            {top.map((c, i) => {
              const fromTop = top.length - 1 - i;
              return (
                <div key={c.code} className="cascade-card"
                  style={{ transform: `translate(${fromTop * -10}px, ${fromTop * -12}px)`, zIndex: i }}>
                  <CardFace card={c} />
                </div>
              );
            })}
          </div>
          {discardPile.length > 0 && <span className="counter on-card">{T.discard} {discardPile.length}</span>}
        </div>
      </section>

      <section className="zone me" aria-label={T.you}>
        <TableSet faceUp={playerFaceUp} faceDown={player.faceDown} slots={slots?.player} selected={selected}
          faceDownActive={faceDownActive} onSelect={onSelect} onFaceDown={onFaceDown} />
        <Hand cards={playerHand} selected={selected} onSelect={onSelect} />
        <div className="zone-tag">{T.you}</div>
      </section>
    </div>
  );
}
