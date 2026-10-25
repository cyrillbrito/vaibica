import { onSettled } from 'solid-js';

// Within this of the end counts as "at the bottom" (fractional zoom offsets).
const SLACK = 4;

/**
 * Keeps a scroll container pinned to its end while the user is there, and
 * leaves it alone once they scroll up. Size changes, not data, drive it:
 * streamed text, late code highlighting, images loading, and the composer
 * growing all move the end. A fresh container starts at the bottom, before
 * the first paint (ResizeObserver runs between layout and paint).
 */
export function createStickToBottom() {
  let scroller: HTMLElement | undefined;
  let following = true;
  let lastTop = 0;
  // Opening a tool call or thinking block is the user's own doing: the
  // view stays put rather than jumping to the end.
  let toggling = false;

  const distance = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight;

  const pin = () => {
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    lastTop = scroller.scrollTop;
  };

  const onScroll = () => {
    const el = scroller!;
    if (distance(el) <= SLACK) following = true;
    else if (el.scrollTop < lastTop) following = false;
    lastTop = el.scrollTop;
  };

  const onClick = (e: MouseEvent) => {
    if (!(e.target as Element).closest('summary')) return;
    toggling = true;
    // Normally used up by the resize it causes; this covers a toggle that
    // changes no size. (Not rAF: that runs before ResizeObserver.)
    setTimeout(() => (toggling = false), 100);
  };

  const onResize = () => {
    if (toggling && scroller) {
      toggling = false;
      following = distance(scroller) <= SLACK;
      return;
    }
    if (following) pin();
  };
  // Made on first use: refs only run in the browser, the hook may not.
  let observer: ResizeObserver | undefined;
  const observe = (el: HTMLElement) =>
    (observer ??= new ResizeObserver(onResize)).observe(el);
  onSettled(() => () => observer?.disconnect());

  return {
    scroller: (el: HTMLElement) => {
      scroller = el;
      el.addEventListener('scroll', onScroll, { passive: true });
      el.addEventListener('click', onClick, true);
      observe(el);
    },
    /** Its content, whose growth moves the end. */
    content: (el: HTMLElement) => {
      observe(el);
    },
    /** Back to following, e.g. after sending or switching session. */
    follow: () => {
      following = true;
      pin();
    },
  };
}
