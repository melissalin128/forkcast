import type { SVGProps } from 'react';

export type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, stroke: string, strokeWidth = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ForkIcon = ({ size = 20, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M7 3v7a3 3 0 0 0 6 0V3" />
    <path d="M10 13v8" />
    <path d="M17 3v18" />
    <path d="M17 3c-2 2-2 5-2 7h2" />
  </svg>
);

export const PinIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const SearchIcon = ({ size = 18, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const MenuIcon = ({ size = 18, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke, 2.2)} {...rest}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const SlidersIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke, 2.2)} {...rest}>
    <path d="M4 6h8M16 6h4" />
    <circle cx="14" cy="6" r="2" />
    <path d="M4 12h4M12 12h8" />
    <circle cx="10" cy="12" r="2" />
    <path d="M4 18h10M18 18h2" />
    <circle cx="16" cy="18" r="2" />
  </svg>
);

export const ChevronLeft = ({ size = 20, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const StarIcon = ({ size = 12, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} fill={stroke} {...rest}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </svg>
);

export const ClearIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);

export const ExternalIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M14 5h5v5" />
    <path d="M19 5l-8 8" />
    <path d="M19 14v5H5V5h5" />
  </svg>
);

// --- bottom tabs ------------------------------------------------------------

export const HomeIcon = ({ size = 22, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export const SavingsIcon = ({ size = 22, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M3 20h18" />
    <path d="M4 15l5-5 4 4 7-8" />
    <path d="M16 6h4v4" />
  </svg>
);

export const UserIcon = ({ size = 22, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

export const HeartIcon = ({ size = 18, stroke = 'currentColor', filled = false, ...rest }: P & { filled?: boolean }) => (
  <svg {...base(size, stroke)} fill={filled ? stroke : 'none'} {...rest}>
    <path d="M12 20s-7-4.4-9.2-8.2C1 9.2 2.2 6 5.5 6c1.9 0 3.1 1.1 3.8 2.2C10.1 7.1 11.3 6 13.2 6c3.3 0 4.5 3.2 2.7 5.8C19 15.6 12 20 12 20z" />
  </svg>
);

// --- cuisine categories ------------------------------------------------------
// One line icon per CategoryStrip tile, drawn in the same monoline style as
// the icons above (24x24, round caps/joins, `currentColor` stroke) so the
// category row reads as part of the same icon system instead of a separate
// emoji layer that renders differently per OS.

export const PizzaIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M12 3l9 17H3L12 3Z" />
    <circle cx="12" cy="13.5" r="1.1" />
  </svg>
);

export const BurgerIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M5 10a7 5 0 0 1 14 0" />
    <path d="M4 10h16" />
    <path d="M4 14h16" />
    <path d="M4 18h16" />
  </svg>
);

export const TakeoutIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    <path d="M4 9h16l-1.6 11H5.6L4 9Z" />
    <path d="M6.3 12h11.4" />
  </svg>
);

export const TacoIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M3 13a9 9 0 0 1 18 0c-3 3-15 3-18 0Z" />
    <path d="M8 10v3M12 8v5M16 10v3" />
  </svg>
);

export const SushiIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <ellipse cx="12" cy="17" rx="7" ry="2.4" />
    <path d="M6 17v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
    <path d="M6.5 12.5h11" />
  </svg>
);

export const CurryPotIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M5 12h14" />
    <path d="M5 12a7 6 0 0 0 14 0" />
    <path d="M9 12V9a3 3 0 0 1 6 0v3" />
    <circle cx="12" cy="7.3" r="0.9" />
  </svg>
);

export const NoodleBowlIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M4 12h16" />
    <path d="M4 12a8 7 0 0 0 16 0" />
    <path d="M9 4l3 8M17 4l-2 8" />
  </svg>
);

export const PastaIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <circle cx="12" cy="13" r="8" />
    <path d="M6.5 11c1.2 1.4 2.4-1.4 3.6 0s2.4-1.4 3.6 0 2.4-1.4 3.6 0" />
    <path d="M6.5 15c1.2 1.4 2.4-1.4 3.6 0s2.4-1.4 3.6 0" />
    <circle cx="15.5" cy="16" r="1.1" />
  </svg>
);

export const DrumstickIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M9.5 14.5c-2.8 2.8-3.3 5-1.8 6.5s3.7-1 6.5-3.8c2.5-2.5 4.3-5.3 4.3-7.7a4 4 0 0 0-8 0c0 1.6.7 2.6 1.5 3.5" />
    <path d="M7 21l-1.5 1.5" />
  </svg>
);

export const SandwichIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M4 20L10.5 6a1.7 1.7 0 0 1 3 0L20 20a1 1 0 0 1-1 1.4H5A1 1 0 0 1 4 20Z" />
    <path d="M7 13.5h10M7 17h10" />
  </svg>
);

export const PancakesIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <ellipse cx="12" cy="8" rx="7" ry="2" />
    <ellipse cx="12" cy="12.5" rx="7" ry="2" />
    <ellipse cx="12" cy="17" rx="7" ry="2" />
    <path d="M15 5c1 3-1 4 0 7s-1 4 0 7" />
  </svg>
);

export const SaladIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M4 12h16" />
    <path d="M4 12a8 7 0 0 0 16 0" />
    <path d="M9 9c1.5-2 4.5-2 6 0-1.5 2-4.5 2-6 0Z" />
  </svg>
);

export const CupcakeIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M7 11h10l-1.3 8.5a1 1 0 0 1-1 .5H9.3a1 1 0 0 1-1-.5L7 11Z" />
    <path d="M8.5 11.5v6M12 11.5v7M15.5 11.5v6" />
    <path d="M6.5 11a5.5 3.5 0 0 1 11 0Z" />
    <circle cx="12" cy="6" r="1" />
  </svg>
);

export const CoffeeCupIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
    <path d="M17 9h2a2 2 0 0 1 0 4h-2" />
    <path d="M8 3c0 1-1 1-1 2M12 3c0 1-1 1-1 2" />
  </svg>
);

export const SproutIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M12 21V10" />
    <path d="M12 10c-4 0-6-2-6-6 4 0 6 2 6 6Z" />
    <path d="M12 13c4 0 6-2 6-6-4 0-6 2-6 6Z" />
  </svg>
);

export const CrescentIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M15 4a8 8 0 1 0 0 16 6.5 6.5 0 0 1 0-16Z" />
    <path d="M18.6 6.4l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.6-1.2.6.2-1.4-1-1 1.4-.2.6-1.3Z" />
  </svg>
);

export const CartIcon = ({ size = 24, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H6" />
    <circle cx="9.5" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </svg>
);
