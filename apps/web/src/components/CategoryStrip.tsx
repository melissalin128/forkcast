import { useEffect, useRef, type CSSProperties, type ComponentType } from 'react';
import { CATEGORIES, type Category } from '../lib/filter';
import { chipPop, prefersReducedMotion } from '../lib/motion';
import {
  type P as IconProps,
  ForkIcon,
  PizzaIcon,
  BurgerIcon,
  TakeoutIcon,
  TacoIcon,
  SushiIcon,
  CurryPotIcon,
  NoodleBowlIcon,
  PastaIcon,
  DrumstickIcon,
  SandwichIcon,
  PancakesIcon,
  SaladIcon,
  CupcakeIcon,
  CoffeeCupIcon,
  SproutIcon,
  CrescentIcon,
  CartIcon,
} from './Icons';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

/** One line icon, one hover/selected bubble tint, and one saturated icon
 * color per category — a single source so adding or renaming a category
 * can't leave one of the three out of sync. `tint` fills the bubble behind
 * the icon on hover/select; `fg` is the icon's own fully-saturated color,
 * also revealed on hover/select (see .cat__icon in styles.css for the
 * muted-at-rest blend). Line icons replace emoji so the row renders
 * identically across every OS instead of at the mercy of each platform's
 * own emoji art. */
const ART: Record<Category, { Icon: ComponentType<IconProps>; tint: string; fg: string }> = {
  All: { Icon: ForkIcon, tint: '#ECEBE6', fg: 'var(--hof)' },
  Pizza: { Icon: PizzaIcon, tint: '#FDE8D8', fg: '#E07A3F' },
  Burgers: { Icon: BurgerIcon, tint: '#FDF0D5', fg: '#D99A2B' },
  Chinese: { Icon: TakeoutIcon, tint: '#FBE1E1', fg: '#D14B4B' },
  Mexican: { Icon: TacoIcon, tint: '#FFF0D6', fg: '#E0A62E' },
  Sushi: { Icon: SushiIcon, tint: '#FFE3E3', fg: '#E0616B' },
  Indian: { Icon: CurryPotIcon, tint: '#FBE9D0', fg: '#D97F3D' },
  Thai: { Icon: NoodleBowlIcon, tint: '#E6F3E4', fg: '#4E9B5E' },
  Italian: { Icon: PastaIcon, tint: '#FBE3DC', fg: '#D8654A' },
  Chicken: { Icon: DrumstickIcon, tint: '#FDEEDB', fg: '#C97E3A' },
  Sandwiches: { Icon: SandwichIcon, tint: '#F6ECD9', fg: '#B98A4A' },
  Breakfast: { Icon: PancakesIcon, tint: '#FFF3D1', fg: '#E0B23A' },
  Healthy: { Icon: SaladIcon, tint: '#E3F5E8', fg: '#4CA36B' },
  Desserts: { Icon: CupcakeIcon, tint: '#FCE4EF', fg: '#D9678F' },
  Coffee: { Icon: CoffeeCupIcon, tint: '#EFE4D8', fg: '#8B5E3C' },
  Vegan: { Icon: SproutIcon, tint: '#E8F4DD', fg: '#5CA24A' },
  Halal: { Icon: CrescentIcon, tint: '#E4F0E6', fg: '#3F9E6D' },
  Grocery: { Icon: CartIcon, tint: '#E6F0FB', fg: '#3E7FC1' },
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
  // Horizontal strip on mobile, vertical sidebar from 641px up (styles.css) — scroll
  // whichever axis the current layout actually overflows on.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>('.cat--active');
    if (!strip || !tile) return;
    const pad = 16;
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';

    if (strip.scrollWidth > strip.clientWidth) {
      const left = tile.offsetLeft - pad;
      const right = tile.offsetLeft + tile.offsetWidth + pad;
      let target: number | null = null;
      if (left < strip.scrollLeft) target = left;
      else if (right > strip.scrollLeft + strip.clientWidth) target = right - strip.clientWidth;
      if (target !== null) strip.scrollTo({ left: Math.max(0, target), behavior });
    } else if (strip.scrollHeight > strip.clientHeight) {
      const top = tile.offsetTop - pad;
      const bottom = tile.offsetTop + tile.offsetHeight + pad;
      let target: number | null = null;
      if (top < strip.scrollTop) target = top;
      else if (bottom > strip.scrollTop + strip.clientHeight) target = bottom - strip.clientHeight;
      if (target !== null) strip.scrollTo({ top: Math.max(0, target), behavior });
    }
  }, [value]);

  return (
    <div className="cats-wrap">
      <div className="cats" role="group" aria-label="Category" ref={stripRef}>
        {CATEGORIES.map((cat) => {
          const active = value === cat;
          const art = ART[cat];
          const Icon = art.Icon;
          return (
            <button
              key={cat}
              type="button"
              className={`cat${active ? ' cat--active' : ''}`}
              style={{ '--cat-tint': art.tint, '--cat-fg': art.fg } as CSSProperties}
              aria-pressed={active}
              onClick={(e) => {
                onChange(cat);
                chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
              }}
            >
              <span className="cat__bubble">
                <Icon className="cat__icon" size={26} />
              </span>
              <span className="cat__label">{cat}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
