import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, stroke: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ForkIcon = ({ size = 22, stroke = '#f0873f', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M7 3v7a3 3 0 0 0 6 0V3" />
    <path d="M10 13v8" />
    <path d="M17 3v18" />
    <path d="M17 3c-2 2-2 5-2 7h2" />
  </svg>
);

export const PinIcon = ({ size = 16, stroke = '#f0873f', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const SearchIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
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

export const ChevronRight = ({ size = 12, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const FilterIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
);

export const AlertIcon = ({ size = 16, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M12 3v14" />
    <path d="M6 11l6 6 6-6" />
    <path d="M5 21h14" />
  </svg>
);

export const HistoryIcon = ({ size = 22, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <path d="M3 17l5-6 4 4 5-7 4 5" />
  </svg>
);

export const UserIcon = ({ size = 22, stroke = 'currentColor', ...rest }: P) => (
  <svg {...base(size, stroke)} {...rest}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
