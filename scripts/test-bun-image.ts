import { strict as assert } from 'node:assert';
import { DEFAULT_IMAGE_LIMITS } from '@earendil-works/pi-durable/tools';
import { bunImages } from '#server/agent/tools/fit-image';

// A noisy 24-bit BMP: Bun decodes BMP, and noise defeats PNG compression.
function bmp(width: number, height: number) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const bytes = new Uint8Array(54 + row * height);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  for (let i = 54; i < bytes.length; i += 65536)
    crypto.getRandomValues(
      bytes.subarray(i, Math.min(i + 65536, bytes.length)),
    );
  return bytes;
}

const limits = DEFAULT_IMAGE_LIMITS;
const png = await new Bun.Image(bmp(100, 80)).png().bytes();
const kept = await bunImages.prepare(png, 'image/png', limits);
assert.equal(kept?.data, Buffer.from(png).toString('base64'));

const converted = await bunImages.prepare(bmp(100, 80), 'image/bmp', limits);
assert.equal(converted?.mimeType, 'image/png');
assert.equal(converted?.convertedFrom, 'image/bmp');

const big = await bunImages.prepare(bmp(4000, 3000), 'image/bmp', limits);
assert.ok(big);
assert.equal(Math.max(big.resized!.to.width, big.resized!.to.height), 2000);
assert.ok(big.data.length <= limits.maxBytes);
console.log(
  `Bun.Image: small kept, BMP converted, 4000px noise shrunk to ${big.resized!.to.width}x${big.resized!.to.height} ${big.mimeType}`,
);
