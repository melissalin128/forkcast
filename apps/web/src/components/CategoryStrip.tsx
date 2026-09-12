import { useEffect, useRef, type CSSProperties } from 'react';
import { CATEGORIES, type Category } from '../lib/filter';
import { chipPop, prefersReducedMotion } from '../lib/motion';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

/** One emoji and one hover/selected tint per category — a single source so
 * adding or renaming a category can't leave one of the two out of sync. The
 * tint stays invisible until a tile is hovered or selected, when it blooms
 * into the bubble behind the icon. */
const ART: Record<Category, { emoji: string; tint: string }> = {
  All: { emoji: '🍽️', tint: '#ECEBE6' },
  Pizza: { emoji: '🍕', tint: '#FDE8D8' },
  Burgers: { emoji: '🍔', tint: '#FDF0D5' },
  Chinese: { emoji: '🥡', tint: '#FBE1E1' },
  Mexican: { emoji: '🌮', tint: '#FFF0D6' },
  Sushi: { emoji: '🍣', tint: '#FFE3E3' },
  Indian: { emoji: '🍛', tint: '#FBE9D0' },
  Thai: { emoji: '🍜', tint: '#E6F3E4' },
  Italian: { emoji: '🍝', tint: '#FBE3DC' },
  Chicken: { emoji: '🍗', tint: '#FDEEDB' },
  Sandwiches: { emoji: '🥪', tint: '#F6ECD9' },
  Breakfast: { emoji: '🥞', tint: '#FFF3D1' },
  Healthy: { emoji: '🥗', tint: '#E3F5E8' },
  Desserts: { emoji: '🍰', tint: '#FCE4EF' },
  Coffee: { emoji: '☕', tint: '#EFE4D8' },
  Vegan: { emoji: '🥑', tint: '#E8F4DD' },
  Halal: { emoji: '🥙', tint: '#E4F0E6' },
  Grocery: { emoji: '🛒', tint: '#E6F0FB' },
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
          const art = ART[cat];
          return (
            <button
              key={cat}
              type="button"
              className={`cat${active ? ' cat--active' : ''}`}
              style={{ '--cat-tint': art.tint } as CSSProperties}
              aria-pressed={active}
              onClick={(e) => {
                onChange(cat);
                chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
              }}
            >
              <span className="cat__bubble">
                <span className="cat__emoji" aria-hidden="true">
                  {art.emoji}
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
