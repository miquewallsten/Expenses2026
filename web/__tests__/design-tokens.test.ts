import { describe, it, expect } from 'vitest';
import {
  surfaces,
  borders,
  shadows,
  easing,
  spacing,
  radius,
  duration,
  zIndex,
} from '../lib/design-tokens';

describe('design-tokens', () => {
  describe('surfaces', () => {
    it('has 4 surface levels', () => {
      expect(Object.keys(surfaces)).toHaveLength(4);
    });

    it('uses CSS custom properties', () => {
      expect(surfaces[0]).toBe('var(--surface-0)');
      expect(surfaces[1]).toBe('var(--surface-1)');
      expect(surfaces[2]).toBe('var(--surface-2)');
      expect(surfaces[3]).toBe('var(--surface-3)');
    });
  });

  describe('borders', () => {
    it('has 4 border tokens', () => {
      expect(Object.keys(borders)).toHaveLength(4);
    });

    it('uses CSS custom properties', () => {
      expect(borders.hairline).toBe('var(--border-hairline)');
      expect(borders.subtle).toBe('var(--border-subtle)');
      expect(borders.standard).toBe('var(--border-standard)');
      expect(borders.active).toBe('var(--border-active)');
    });
  });

  describe('shadows', () => {
    it('has 4 shadow levels', () => {
      expect(Object.keys(shadows)).toHaveLength(4);
    });

    it('uses CSS custom properties', () => {
      expect(shadows[1]).toBe('var(--shadow-1)');
      expect(shadows[2]).toBe('var(--shadow-2)');
      expect(shadows[3]).toBe('var(--shadow-3)');
      expect(shadows[4]).toBe('var(--shadow-4)');
    });
  });

  describe('easing', () => {
    it('has 2 easing functions', () => {
      expect(Object.keys(easing)).toHaveLength(2);
    });

    it('uses CSS custom properties', () => {
      expect(easing.outQuart).toBe('var(--ease-out-quart)');
      expect(easing.outQuint).toBe('var(--ease-out-quint)');
    });
  });

  describe('spacing', () => {
    it('has spacing scale values', () => {
      expect(spacing[0]).toBe('0');
      expect(spacing[1]).toBe('4px');
      expect(spacing[2]).toBe('8px');
      expect(spacing[4]).toBe('16px');
      expect(spacing[8]).toBe('32px');
    });

    it('includes fractional spacing', () => {
      expect(spacing[0.5]).toBe('2px');
      expect(spacing[1.5]).toBe('6px');
    });
  });

  describe('radius', () => {
    it('has border radius scale', () => {
      expect(radius.none).toBe('0');
      expect(radius.sm).toBe('2px');
      expect(radius.DEFAULT).toBe('4px');
      expect(radius.full).toBe('9999px');
    });
  });

  describe('duration', () => {
    it('has animation duration tokens', () => {
      expect(duration.fast).toBe('150ms');
      expect(duration.normal).toBe('200ms');
      expect(duration.slow).toBe('300ms');
      expect(duration.slower).toBe('500ms');
    });
  });

  describe('zIndex', () => {
    it('has z-index scale', () => {
      expect(zIndex.behind).toBe(-1);
      expect(zIndex.base).toBe(0);
      expect(zIndex.modal).toBe(40);
      expect(zIndex.tooltip).toBe(60);
      expect(zIndex.max).toBe(9999);
    });
  });
});