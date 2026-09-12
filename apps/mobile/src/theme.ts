import type { TextStyle } from 'react-native';

/** Same tokens as apps/web/src/styles.css `:root`. */
export const C = {
  page: '#f7f6f3',
  ground: '#ecebe7',
  card: '#ffffff',
  inset: '#f1efea',
  line: '#e8e5df',
  fg: '#1b1917',
  muted: '#6f6a62',
  accent: '#f0873f',
  accentInk: '#c9601a',
  accentBg: '#fdf0e6',
  accentLine: '#f7d9bf',
  win: '#3fd39b',
  winInk: '#1a8f63',
  winBg: '#e6f8f0',
  warn: '#e5484d',
  warnBg: '#fdecec',
  switchOff: '#d9d5cd',
  white: '#ffffff',
} as const;

export const R = { card: 12, pill: 999, ctl: 8 } as const;

export const GUTTER = 16;
export const TOP_H = 48;
export const TABBAR_H = 56;

/** Prices and other figures: 600 weight, tabular digits so columns line up. */
export const num: TextStyle = {
  fontWeight: '600',
  fontVariant: ['tabular-nums'],
};
