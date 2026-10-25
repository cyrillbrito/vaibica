const FADE_MS = 400;

/**
 * Fades in text added to the last block of a streaming reply. Each update
 * replaces that block's DOM, so a span that was mid-fade would pop to full
 * opacity. Instead every chunk remembers when it landed, and the new DOM
 * wraps it again with a negative delay, picking the fade up where it was.
 * Offsets count rendered text, which grows like the source does.
 */
export function createChunkFade() {
  let lastEl: Element | undefined;
  let lastIndex = -1;
  let lastLength = 0;
  let chunks: { from: number; at: number }[] = [];

  return (el: Element | undefined, index: number) => {
    if (!el || el === lastEl) return;
    const length = el.textContent?.length ?? 0;
    const now = performance.now();
    if (index !== lastIndex) chunks = [];
    else if (length > lastLength) chunks.push({ from: lastLength, at: now });
    chunks = chunks.filter((c) => now - c.at < FADE_MS && c.from < length);
    lastEl = el;
    lastIndex = index;
    lastLength = length;
    if (chunks.length)
      wrap(
        el,
        chunks.map((c, i) => ({
          from: c.from,
          to: chunks[i + 1]?.from ?? length,
          delay: c.at - now,
        })),
      );
  };
}

function wrap(
  el: Element,
  ranges: { from: number; to: number; delay: number }[],
) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let offset = 0;
  for (const node of nodes) {
    const start = offset;
    offset += node.length;
    // Whitespace between blocks sits where a span can't, as in a table.
    if (!node.data.trim()) continue;
    // From the end, so splitting leaves the earlier offsets in place.
    for (const r of ranges.toReversed()) {
      const a = Math.max(r.from, start) - start;
      const b = Math.min(r.to, offset) - start;
      if (a >= b) continue;
      const part = node.splitText(a);
      part.splitText(b - a);
      const span = document.createElement('span');
      span.className = 'fade-chunk';
      span.style.animationDelay = `${Math.round(r.delay)}ms`;
      part.replaceWith(span);
      span.append(part);
    }
  }
}
