import type { FC } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  stroke?: ColorValue;
  strokeWidth?: number;
}

type P = IconProps;

/** Same 24-unit line icons as apps/web/src/components/Icons.tsx. */
const base = (size: number, stroke: ColorValue, strokeWidth = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const ForkIcon: FC<P> = ({ size = 20, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M7 3v7a3 3 0 0 0 6 0V3" />
    <Path d="M10 13v8" />
    <Path d="M17 3v18" />
    <Path d="M17 3c-2 2-2 5-2 7h2" />
  </Svg>
);

export const PinIcon: FC<P> = ({ size = 16, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
    <Circle cx="12" cy="10" r="2.5" />
  </Svg>
);

export const SearchIcon: FC<P> = ({ size = 18, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="M20 20l-3.5-3.5" />
  </Svg>
);

export const ChevronDown: FC<P> = ({ size = 14, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);

export const ChevronLeft: FC<P> = ({ size = 20, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const StarIcon: FC<P> = ({ size = 12, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)} fill={stroke}>
    <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Svg>
);

export const ClearIcon: FC<P> = ({ size = 16, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M9 9l6 6M15 9l-6 6" />
  </Svg>
);

export const ExternalIcon: FC<P> = ({ size = 16, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M14 5h5v5" />
    <Path d="M19 5l-8 8" />
    <Path d="M19 14v5H5V5h5" />
  </Svg>
);

// --- bottom tabs ------------------------------------------------------------

export const HomeIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M3 11l9-7 9 7" />
    <Path d="M5 10v10h5v-6h4v6h5V10" />
  </Svg>
);

export const SavingsIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M3 20h18" />
    <Path d="M4 15l5-5 4 4 7-8" />
    <Path d="M16 6h4v4" />
  </Svg>
);

export const UserIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Circle cx="12" cy="8" r="4" />
    <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </Svg>
);

// --- category strip (simple line icons, no emoji) ---------------------------

const AllIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Svg>
);

const PizzaIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M12 3L21 20H3z" />
    <Path d="M5.5 15.5c2-1.2 4.2-1.8 6.5-1.8s4.5.6 6.5 1.8" />
    <Circle cx="12" cy="10" r="1" fill={stroke} />
    <Circle cx="9.5" cy="16.5" r="1" fill={stroke} />
    <Circle cx="14.5" cy="16.5" r="1" fill={stroke} />
  </Svg>
);

const BurgerIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M4 10a8 5 0 0 1 16 0z" />
    <Path d="M3 13.5h18" />
    <Path d="M4 17a8 4 0 0 0 16 0z" />
  </Svg>
);

const RamenIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9z" />
    <Path d="M6 11L17 4" />
    <Path d="M9 11L20 5" />
    <Path d="M4 8.5C7 8 9 8 12 8.5" />
  </Svg>
);

const IndianIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M5 11h14v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z" />
    <Path d="M2 11h20" />
    <Path d="M12 4c-2 2-2 3 0 5 2-2 2-3 0-5z" />
  </Svg>
);

const MexicanIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M3 17a9 9 0 0 1 18 0z" />
    <Path d="M6.5 13c1.5-2 3-2.5 5.5-2.5S16 11 17.5 13" />
    <Path d="M9 8.5c1-1 2-1.5 3-1.5s2 .5 3 1.5" />
  </Svg>
);

const ThaiIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M17 7c-1 8-6 13-12 13 2-6 5-11 12-13z" />
    <Path d="M17 7c0-1.5 1-3 3-3" />
    <Path d="M10 15c1.5-2.5 3.5-4.5 6-6" />
  </Svg>
);

const GroceryIcon: FC<P> = ({ size = 22, stroke = '#1b1917', strokeWidth }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path d="M3 10h18l-1.6 9H4.6z" />
    <Path d="M8 10l3-6" />
    <Path d="M16 10l-3-6" />
    <Path d="M9 14v2M12 14v2M15 14v2" />
  </Svg>
);

export const CATEGORY_ICONS: Record<string, FC<P>> = {
  All: AllIcon,
  Pizza: PizzaIcon,
  Burgers: BurgerIcon,
  Ramen: RamenIcon,
  Indian: IndianIcon,
  Mexican: MexicanIcon,
  Thai: ThaiIcon,
  Grocery: GroceryIcon,
};

/** Icon for a restaurant's art placeholder; falls back to the fork. */
export function categoryIcon(category: string | undefined): FC<P> {
  return (category && CATEGORY_ICONS[category]) || ForkIcon;
}
