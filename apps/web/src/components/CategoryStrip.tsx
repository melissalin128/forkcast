import { useEffect, useRef, type CSSProperties } from 'react';
import { CATEGORIES, type Category } from '../lib/filter';
import { chipPop, prefersReducedMotion } from '../lib/motion';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

const EMOJI: Record<Category, string> = {
  All: '🍽️',
  Pizza: '🍕',
  Burgers: '🍔',
  Chinese: '🥡',
  Mexican: '🌮',
  Sushi: '🍣',
  Indian: '🍛',
  Thai: '🍜',
  Italian: '🍝',
  Chicken: '🍗',
  Sandwiches: '🥪',
  Breakfast: '🥞',
  Healthy: '🥗',
  Desserts: '🍰',
  Coffee: '☕',
  Vegan: '🥑',
  Halal: '🥙',
  Grocery: '🛒',
};

/** A soft tint per category, invisible until a tile is hovered or selected — the
 * bubble it pops into behind the icon. Quiet at rest, colorful the moment you engage. */
const TINT: Record<Category, string> = {
  All: '#ECEBE6',
  Pizza: '#FDE8D8',
  Burgers: '#FDF0D5',
  Chinese: '#FBE1E1',
  Mexican: '#FFF0D6',
  Sushi: '#FFE3E3',
  Indian: '#FBE9D0',
  Thai: '#E6F3E4',
  Italian: '#FBE3DC',
  Chicken: '#FDEEDB',
  Sandwiches: '#F6ECD9',
  Breakfast: '#FFF3D1',
  Healthy: '#E3F5E8',
  Desserts: '#FCE4EF',
  Coffee: '#EFE4D8',
  Vegan: '#E8F4DD',
  Halal: '#E4F0E6',
  Grocery: '#E6F0FB',
};

/**
 * The cuisine row, given its own bit of personality: hovering a tile makes it fan
 * open (flex-grow via CSS in styles.css) while its neighbors ease aside, and a
 * soft per-cuisine color bubble blooms in behind the icon. Quiet and Airbnb-plain
 * at rest; playful the moment you actually touch it. Selection uses the same
 * bubble language so "active" reads as a natural extension of "hovered."
 */
export function CategoryStrip({ value, onChange }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);

  // A deep link like `/?category=sushi` lands with its tile off-screen: bring it into view.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>('.cat--active');
    if (!strip || !tile) return;
    const pad = 16;
    const left = tile.offsetLeft - pad;
    const right = tile.offsetLeft + tile.offsetWidth + pad;
    let target: number | null = null;
    if (left < strip.scrollLeft) target = left;
    else if (right > strip.scrollLeft + strip.clientWidth) target = right - strip.clientWidth;
    if (target !== null) strip.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [value]);

  return (
    <div className="cats-wrap">
      <div className="cats" role="group" aria-label="Category" ref={stripRef}>
        {CATEGORIES.map((cat) => {
          const active = value === cat;
          return (
            <button
              key={cat}
              type="button"
              className={`cat${active ? ' cat--active' : ''}`}
              style={{ '--cat-tint': TINT[cat] } as CSSProperties}
              aria-pressed={active}
              onClick={(e) => {
                onChange(cat);
                chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
              }}
            >
              <span className="cat__bubble">
                <span className="cat__emoji" aria-hidden="true">
                  {EMOJI[cat]}
                </span>
              </span>
              <span className="cat__label">{cat}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
