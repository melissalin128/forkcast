import { animate, stagger } from 'animejs';
import { money } from './analysis';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * The signature move: every element with `data-price="21.40"` counts up from
 * $0.00 to its value, 900ms easeOutExpo, 60ms stagger. Returns a cancel fn.
 */
export function countUpPrices(root: ParentNode | null, delayOffset = 0): () => void {
  if (!root) return () => {};
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-price]'));
  if (prefersReducedMotion()) {
    els.forEach((el) => (el.textContent = money(Number(el.dataset.price))));
    return () => {};
  }
  const anims = els.map((el, i) => {
    const target = Number(el.dataset.price) || 0;
    const obj = { v: 0 };
    el.textContent = money(0);
    return animate(obj, {
      v: target,
      duration: 900,
      delay: delayOffset + i * 60,
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

/** Rows slide in: translateY(12px) -> 0 with opacity, staggered. */
export function slideIn(targets: Element[], perItem = 60, delayOffset = 0): () => void {
  if (!targets.length) return () => {};
  if (prefersReducedMotion()) {
    targets.forEach((t) => ((t as HTMLElement).style.opacity = '1'));
    return () => {};
  }
  const anim = animate(targets, {
    translateY: [12, 0],
    opacity: [0, 1],
    duration: 900,
    delay: stagger(perItem, { start: delayOffset }),
    ease: 'outExpo',
  });
  return () => anim.cancel();
}

/** Mint left edge draws in over 300ms after rows land. */
export function drawEdge(el: Element | null, delay = 0): () => void {
  if (!el) return () => {};
  if (prefersReducedMotion()) {
    (el as HTMLElement).style.transform = 'scaleY(1)';
    return () => {};
  }
  const anim = animate(el, { scaleY: [0, 1], duration: 300, delay, ease: 'outCubic' });
  return () => anim.cancel();
}

/** Chip toggle: 120ms scale 0.96 -> 1. */
export function chipPop(el: Element) {
  if (prefersReducedMotion()) return;
  animate(el, { scale: [0.96, 1], duration: 120, ease: 'outQuad' });
}
