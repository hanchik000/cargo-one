// Image proxy: URL validation and resize-suffix fallback (no network needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, handleImageProxy } from '../server/image-proxy.mjs';

test('candidates: tries the resized variant, then the original', () => {
  assert.deepEqual(candidates('https://ae01.alicdn.com/kf/A.jpg_600x600.jpg'), ['https://ae01.alicdn.com/kf/A.jpg_600x600.jpg', 'https://ae01.alicdn.com/kf/A.jpg']);
  assert.deepEqual(candidates('https://ae01.alicdn.com/kf/B.png_300x300.jpg'), ['https://ae01.alicdn.com/kf/B.png_300x300.jpg', 'https://ae01.alicdn.com/kf/B.png']);
  assert.deepEqual(candidates('https://ae01.alicdn.com/kf/C.jpg'), ['https://ae01.alicdn.com/kf/C.jpg']);
});

test('only https URLs on IMAGE_HOSTS are proxied', async () => {
  process.env.IMAGE_HOSTS = 'alicdn.com';
  const run = async (u) => {
    let status = 0;
    const res = { writeHead: (s) => { status = s; }, end: () => {}, headersSent: false };
    await handleImageProxy({ method: 'GET' }, res, new URL('http://x/img?u=' + encodeURIComponent(u)));
    return status;
  };
  assert.equal(await run('http://ae01.alicdn.com/a.jpg'), 400);
  assert.equal(await run('https://evil.example.com/a.jpg'), 400);
  assert.equal(await run('https://127.0.0.1/a.jpg'), 400);
  assert.equal(await run('file:///etc/passwd'), 400);
});
