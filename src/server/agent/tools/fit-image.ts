/** Anthropic refuses images over 5 MB, and over 2000px once a request holds more than 20. */
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2000;

/** The image as is when it fits the limits, else a smaller PNG, or a JPEG if that is still too big. */
export async function fitImage(bytes: Uint8Array, mimeType: string) {
  const { width, height } = await new Bun.Image(bytes).metadata();
  if (
    bytes.byteLength <= MAX_IMAGE_BYTES &&
    Math.max(width, height) <= MAX_IMAGE_SIDE
  )
    return { bytes, mimeType };
  const small = () =>
    new Bun.Image(bytes).resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  const png = await small().png().bytes();
  if (png.byteLength <= MAX_IMAGE_BYTES)
    return { bytes: png, mimeType: 'image/png' };
  return {
    bytes: await small().jpeg({ quality: 85 }).bytes(),
    mimeType: 'image/jpeg',
  };
}
