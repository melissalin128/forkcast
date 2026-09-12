import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

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

export const ChevronDown = ({ size = 14, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const ChevronLeft = ({ size = 20, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRight = ({ size = 14, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M9 6l6 6-6 6" />
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
