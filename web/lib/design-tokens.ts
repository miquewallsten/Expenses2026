/**
 * Design Tokens - Typed exports for CSS custom properties
 *
 * These tokens mirror the CSS variables defined in globals.css.
 * Use these for programmatic access in JavaScript/TypeScript.
 */

// Surface levels - background hierarchy
export const surfaces = {
  0: 'var(--surface-0)',
  1: 'var(--surface-1)',
  2: 'var(--surface-2)',
  3: 'var(--surface-3)',
} as const;

// Border tokens - opacity-based borders
export const borders = {
  hairline: 'var(--border-hairline)',
  subtle: 'var(--border-subtle)',
  standard: 'var(--border-standard)',
  active: 'var(--border-active)',
} as const;

// Shadow tokens - elevation shadows
export const shadows = {
  1: 'var(--shadow-1)',
  2: 'var(--shadow-2)',
  3: 'var(--shadow-3)',
  4: 'var(--shadow-4)',
} as const;

// Easing tokens - animation timing functions
export const easing = {
  outQuart: 'var(--ease-out-quart)',
  outQuint: 'var(--ease-out-quint)',
} as const;

// Spacing scale - consistent spacing units
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  36: '144px',
  40: '160px',
  44: '176px',
  48: '192px',
  52: '208px',
  56: '224px',
  60: '240px',
  64: '256px',
  72: '288px',
  80: '320px',
  96: '384px',
} as const;

// Border radius scale
export const radius = {
  none: '0',
  sm: '2px',
  DEFAULT: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
} as const;

// Animation durations
export const duration = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const;

// Z-index scale
export const zIndex = {
  behind: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modal: 40,
  popover: 50,
  tooltip: 60,
  toast: 70,
  max: 9999,
} as const;

// Type export for all tokens
export type Surfaces = typeof surfaces;
export type Borders = typeof borders;
export type Shadows = typeof shadows;
export type Easing = typeof easing;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Duration = typeof duration;
export type ZIndex = typeof zIndex;