import { strict as assert } from 'node:assert';
import { fitImage } from '#server/agent/tools/fit-image';

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

const small = bmp(100, 80);
assert.equal((await fitImage(small, 'image/bmp')).bytes, small);

const big = await fitImage(bmp(4000, 3000), 'image/png');
const size = await new Bun.Image(big.bytes).metadata();
assert.equal(Math.max(size.width, size.height), 2000);
assert.ok(big.bytes.byteLength <= 4.5 * 1024 * 1024);
console.log(
  `Bun.Image: small kept, 4000px noise shrunk to ${size.width}x${size.height} ${big.mimeType}`,
);
