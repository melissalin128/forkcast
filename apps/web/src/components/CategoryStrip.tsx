import { useEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactNode } from 'react';
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
  ClearIcon,
  MenuIcon,
} from './Icons';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
  /** Phone-only: sits on the hamburger row (Filter button). Ignored on desktop. */
  toolbar?: ReactNode;
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

function CatButton({
  cat,
  active,
  onChange,
  after,
}: {
  cat: Category;
  active: boolean;
  onChange: (cat: Category) => void;
  after?: () => void;
}) {
  const art = ART[cat];
  const Icon = art.Icon;
  return (
    <button
      type="button"
      className={`cat${active ? ' cat--active' : ''}`}
      style={{ '--cat-tint': art.tint, '--cat-fg': art.fg } as CSSProperties}
      aria-pressed={active}
      onClick={(e) => {
        onChange(cat);
        chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
        after?.();
      }}
    >
      <span className="cat__bubble">
        <Icon className="cat__icon" size={26} />
      </span>
      <span className="cat__label">{cat}</span>
    </button>
  );
}

/**
 * Phone: a hamburger that opens a sheet of the 18 cuisines. Desktop (≥641px):
 * Melissa's sticky left rail — the list stays on screen while the feed scrolls.
 * `?category=` still drives the active tile in both chrome.
 */
export function CategoryStrip({ value, onChange, toolbar }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const rail = stripRef.current;
    const tile = rail?.querySelector<HTMLElement>('.cat--active');
    if (!rail || !tile) return;
    const pad = 16;
    const top = tile.offsetTop - pad;
    const bottom = tile.offsetTop + tile.offsetHeight + pad;
    let target: number | null = null;
    if (top < rail.scrollTop) target = top;
    else if (bottom > rail.scrollTop + rail.clientHeight) target = bottom - rail.clientHeight;
    if (target !== null) {
      rail.scrollTo({ top: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <div className="cats-bar">
        <button
          type="button"
          className="cats-bar__btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Categories, ${value} selected`}
          onClick={(e) => {
            setOpen(true);
            chipPop(e.currentTarget);
          }}
        >
          <MenuIcon size={18} />
          <span>{value}</span>
        </button>
        {toolbar}
      </div>

      {open && (
        <div className="modal-veil" onClick={() => setOpen(false)}>
          <div
            className="modal cats-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Category"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__head">
              <button type="button" className="modal__close" aria-label="Close" onClick={() => setOpen(false)}>
                <ClearIcon size={16} />
              </button>
              <h2 className="modal__title">Categories</h2>
            </div>
            <div className="modal__body cats-sheet__list" role="group" aria-label="Category">
              {CATEGORIES.map((cat) => (
                <CatButton key={cat} cat={cat} active={value === cat} onChange={onChange} after={() => setOpen(false)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="cats-wrap">
        <div className="cats" role="group" aria-label="Category" ref={stripRef}>
          {CATEGORIES.map((cat) => (
            <CatButton key={cat} cat={cat} active={value === cat} onChange={onChange} />
          ))}
        </div>
      </div>
    </>
  );
}
