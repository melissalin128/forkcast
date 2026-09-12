import { useEffect, useRef } from 'react';
import { CATEGORIES, type Category } from '../lib/filter';
import { chipPop, prefersReducedMotion } from '../lib/motion';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

/** Illustrated tile per category: a large emoji on a soft tint, the way delivery apps draw their category row. */
const ART: Record<Category, { emoji: string; tint: string }> = {
  All: { emoji: '🍽️', tint: '#ebe6de' },
  Pizza: { emoji: '🍕', tint: '#fde8d8' },
  Burgers: { emoji: '🍔', tint: '#fdf0d5' },
  Chinese: { emoji: '🥡', tint: '#fbe1e1' },
  Mexican: { emoji: '🌮', tint: '#fff0d6' },
  Sushi: { emoji: '🍣', tint: '#ffe3e3' },
  Indian: { emoji: '🍛', tint: '#fbe9d0' },
  Thai: { emoji: '🍜', tint: '#e6f3e4' },
  Italian: { emoji: '🍝', tint: '#fbe3dc' },
  Chicken: { emoji: '🍗', tint: '#fdeedb' },
  Sandwiches: { emoji: '🥪', tint: '#f6ecd9' },
  Breakfast: { emoji: '🥞', tint: '#fff3d1' },
  Healthy: { emoji: '🥗', tint: '#e3f5e8' },
  Desserts: { emoji: '🍰', tint: '#fce4ef' },
  Coffee: { emoji: '☕', tint: '#efe4d8' },
  Vegan: { emoji: '🥑', tint: '#e8f4dd' },
  Halal: { emoji: '🥙', tint: '#e4f0e6' },
  Grocery: { emoji: '🛒', tint: '#e6f0fb' },
};

/** Round category tiles in a horizontal strip; the active one gets the accent ring. */
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
              aria-pressed={active}
              onClick={(e) => {
                onChange(cat);
                chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
              }}
            >
              <span className="cat__circle" style={{ background: art.tint }}>
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
