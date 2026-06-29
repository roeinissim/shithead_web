import type { Card, Suit } from '../engine/cards';
import { rules } from '../game/gameConfig';
import { cardImage } from './cardImage';

const SUIT: Record<Suit, string> = { HEARTS: '♥', DIAMONDS: '♦', SPADES: '♠', CLUBS: '♣', NONE: '★' };
const isRed = (s: Suit) => s === 'HEARTS' || s === 'DIAMONDS';

// ACTIVE renderer: the real card PNG. Keep CSS fallback (CardFaceCss) for emergencies.
export function CardFace(props: {
  card: Card; selected?: boolean | undefined; disabled?: boolean | undefined; small?: boolean | undefined; onClick?: (() => void) | undefined;
}) {
  const { card, selected, disabled, small, onClick } = props;
  const rank = card.rank === 'JOKER' ? '★' : rules.getRankName(card.rank);
  const cls = ['card', 'img', selected ? 'sel' : '', small ? 'sm' : ''].join(' ');
  return (
    <button className={cls} type="button" onClick={onClick} disabled={disabled}
      aria-pressed={!!selected} aria-label={`${rank} ${card.suit}`}>
      <img src={cardImage(card)} alt="" draggable={false} />
    </button>
  );
}

// Fallback CSS-drawn card (retained per spec; not the active path).
export function CardFaceCss(props: {
  card: Card; selected?: boolean | undefined; disabled?: boolean | undefined; small?: boolean | undefined; onClick?: (() => void) | undefined;
}) {
  const { card, selected, disabled, small, onClick } = props;
  const rank = card.rank === 'JOKER' ? '★' : rules.getRankName(card.rank);
  const suit = SUIT[card.suit];
  const cls = ['card', isRed(card.suit) ? 'red' : 'black', selected ? 'sel' : '', small ? 'sm' : ''].join(' ');
  return (
    <button className={cls} type="button" onClick={onClick} disabled={disabled}>
      <span className="corner">{rank}<small>{suit}</small></span>
      <span className="pip">{suit}</span>
    </button>
  );
}

export function CardBack(props: { count?: number; small?: boolean; label?: string }) {
  return (
    <div className={`card back ${props.small ? 'sm' : ''}`}>
      <span className="weave" aria-hidden />
      {props.count != null && <span className="count">{props.count}</span>}
      {props.label && <span className="backlabel">{props.label}</span>}
    </div>
  );
}

export function CardSlot(props: { children?: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button className={`card slot ${props.active ? 'active' : ''}`} type="button"
      onClick={props.onClick} disabled={!props.active}>
      {props.children}
    </button>
  );
}
