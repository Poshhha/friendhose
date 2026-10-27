import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('a cancelled response body stays cancelled instead of returning a malformed feed', async (t) => {
  const aborted = new DOMException('Request was cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => ({
    status: 200,
    ok: true,
    json: async () => {
      throw aborted;
    },
  }));
  await assert.rejects(api('/posts'), (error) => error === aborted);
});

test('unreadable successful responses show an actionable error instead of crashing the feed', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>Not an API response</html>', { status: 200 }),
  );
  await assert.rejects(api('/posts'), /unreadable response/);
});

test('server validation errors retain their message and HTTP status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Take a little breath.' }, { status: 429 }),
  );
  await assert.rejects(
    api('/posts'),
    (error) => error.status === 429 && error.message === 'Take a little breath.',
  );
});
