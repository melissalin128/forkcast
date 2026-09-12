import type { FC } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

export const HeartIcon: FC<P & { filled?: boolean }> = ({ size = 18, stroke = '#1b1917', strokeWidth, filled = false }) => (
  <Svg {...base(size, stroke, strokeWidth)}>
    <Path
      d="M12 20s-7-4.4-9.2-8.2C1 9.2 2.2 6 5.5 6c1.9 0 3.1 1.1 3.8 2.2C10.1 7.1 11.3 6 13.2 6c3.3 0 4.5 3.2 2.7 5.8C19 15.6 12 20 12 20z"
      fill={filled ? stroke : 'none'}
    />
  </Svg>
);
