import type { PromptImage } from './protocol';

type Block = { type: string; text?: string; mimeType?: string; data?: string };

/** Where an image sits in a prompt's text, as the composer writes it. */
export function imageMarker(n: number) {
  return `[Image #${n}]`;
}

export const imageMarkers = /\[Image #(\d+)\]/g;

/**
 * A prompt's content blocks, each image right after its marker, so the model
 * reads it where the text talks about it. Images without one go last.
 */
export function promptBlocks(prompt: string, images: readonly PromptImage[]) {
  const placed = images
    .map((image) => ({
      image,
      end:
        image.ref === undefined
          ? -1
          : endOf(prompt.indexOf(imageMarker(image.ref)), image.ref),
    }))
    .sort((a, b) => (a.end < 0 ? 1 : b.end < 0 ? -1 : a.end - b.end));
  const blocks: (
    | { type: 'text'; text: string }
    | { type: 'image'; mimeType: string; data: string }
  )[] = [];
  let from = 0;
  // Providers reject blank text blocks: blank space waits for the next part.
  const text = (to: number) => {
    const part = prompt.slice(from, to);
    if (!part.trim()) return;
    blocks.push({ type: 'text', text: part });
    from = to;
  };
  for (const { image, end } of placed) {
    if (end >= 0) text(end);
    else text(prompt.length);
    blocks.push({ type: 'image', mimeType: image.mimeType, data: image.data });
  }
  text(prompt.length);
  return blocks;
}

function endOf(at: number, ref: number) {
  return at < 0 ? -1 : at + imageMarker(ref).length;
}

/** The other way: the text as typed, and each image with its marker's number. */
export function promptOf(content: readonly Block[]) {
  const images: PromptImage[] = [];
  let text = '';
  for (const block of content) {
    if (block.type === 'text' && block.text) text += block.text;
    if (block.type !== 'image' || !block.mimeType || !block.data) continue;
    const ref = /\[Image #(\d+)\]$/.exec(text)?.[1];
    images.push({
      mimeType: block.mimeType,
      data: block.data,
      ...(ref && { ref: Number(ref) }),
    });
  }
  return { text, images };
}
