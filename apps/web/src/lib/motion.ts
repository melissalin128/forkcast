import { animate } from 'animejs';
import { money } from './analysis';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * The only two things that move. (1) When the Prices tab opens, every element
 * with `data-price="21.40"` counts up from $0.00 over 500 ms. Returns a cancel fn.
 */
export function countUpPrices(root: ParentNode | null): () => void {
  if (!root) return () => {};
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-price]'));
  if (prefersReducedMotion()) {
    els.forEach((el) => (el.textContent = money(Number(el.dataset.price))));
    return () => {};
  }
  const anims = els.map((el) => {
    const target = Number(el.dataset.price) || 0;
    const obj = { v: 0 };
    el.textContent = money(0);
    return animate(obj, {
      v: target,
      duration: 500,
      ease: 'outExpo',
      onUpdate: () => {
        el.textContent = money(obj.v);
      },
      onComplete: () => {
        el.textContent = money(target);
      },
    });
  });
  return () => anims.forEach((a) => a.cancel());
}

/** (2) Chip toggle: 120 ms scale 0.96 -> 1. */
export function chipPop(el: Element) {
  if (prefersReducedMotion()) return;
  animate(el, { scale: [0.96, 1], duration: 120, ease: 'outQuad' });
}
