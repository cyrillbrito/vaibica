import { reducedMotion } from './motion';

const COLORS = ['accent', 'brand', 'running', 'warn', 'merged'].map(
  (c) => `var(--color-${c})`,
);

/** A burst of confetti from an element, then gone. Nothing under reduced motion. */
export function confetti(from: Element, count = 70) {
  if (reducedMotion()) return;
  const r = from.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('div');
    const w = 5 + Math.random() * 4;
    bit.style.cssText = `position:fixed;z-index:100;pointer-events:none;left:${r.left + Math.random() * r.width}px;top:${r.top + r.height / 2}px;width:${w}px;height:${w * 1.6}px;border-radius:1px;background:${COLORS[i % COLORS.length]}`;
    document.body.append(bit);
    // Up and out, then gravity.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const speed = 180 + Math.random() * 260;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const spin = (Math.random() - 0.5) * 1440;
    bit.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${spin / 2}deg)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `translate(${dx * 1.4}px, ${dy + 360}px) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1500 + Math.random() * 700,
        easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
      },
    ).onfinish = () => bit.remove();
  }
}
