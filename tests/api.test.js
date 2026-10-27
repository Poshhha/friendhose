import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

const token = () => randomBytes(32).toString('base64url');
const adminToken = token();
let runtime, server, base;
before(async () => {
  runtime = createApp({ databasePath: ':memory:', adminToken, disableRateLimit: true });
  server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  runtime.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
async function request(path, { method = 'GET', body, key, origin } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, headers: response.headers };
}
async function post(body = 'A quiet thought.', extras = {}) {
  const keys = { deletionToken: token(), threadToken: token() };
  const result = await request('/posts', {
    method: 'POST',
    body: { body, category: 'Thoughts', ...keys, ...extras },
  });
  assert.equal(result.status, 201);
  return { ...result.data.post, ...keys };
}
async function reply(parent, body, extras = {}) {
  const keys = { deletionToken: token(), threadToken: token(), ...extras };
  const result = await request(`/posts/${parent.id}/comments`, {
    method: 'POST',
    body: { body, ...keys },
  });
  assert.equal(result.status, 201);
  return { ...result.data.comment, ...keys };
}
function assertPublic(object) {
  assert.ok(
    !Object.keys(object).some((key) => /token|hash|address|delete|author_|ip$/i.test(key)),
    'Public data must omit private keys, author hashes, and addresses.',
  );
}

test('health verifies the real database', async () => {
  const result = await request('/health');
  assert.equal(result.status, 200);
  assert.equal(result.data.storage, 'sqlite');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('posts preserve multiline text and emoji, exposing only public data', async () => {
  const text =
    '  Some things stay with us.\n\nA second paragraph. 🌙 <script>alert("x")</script>  ';
  const created = await post(text);
  const result = await request(`/posts?q=${encodeURIComponent('Some things stay')}`);
  assert.equal(result.data.posts[0].body, text);
  assert.equal(result.data.posts[0].replyCount, 0);
  assertPublic(result.data.posts[0]);
  assert.notEqual(created.alias, '');
});
test('server rejects empty, over-limit, invalid-category, and keyless messages', async () => {
  for (const values of [
    { body: ' \n ' },
    { body: 'x'.repeat(3001) },
    { category: 'invalid' },
    { deletionToken: 'bad' },
    { threadToken: null },
    { body: 'null\0character' },
  ]) {
    const result = await request('/posts', {
      method: 'POST',
      body: {
        body: 'Valid',
        category: 'Thoughts',
        deletionToken: token(),
        threadToken: token(),
        ...values,
      },
    });
    assert.equal(result.status, 400);
  }
  assert.equal((await request('/posts', { method: 'POST', body: null })).status, 400);
  assert.equal((await request('/posts', { method: 'POST', body: [] })).status, 400);
});
test('character limits count emoji as characters rather than UTF-16 units', async () => {
  const created = await post('🌙'.repeat(3000));
  assert.equal(Array.from(created.body).length, 3000);
});
test('thread aliases stay consistent, OP is marked, and child replies reference the right parent', async () => {
  const created = await post('Thread identity test');
  const visitorToken = token();
  const first = await reply(created, 'An anonymous visitor', { threadToken: visitorToken });
  const second = await reply(created, 'The same visitor, again', {
    threadToken: visitorToken,
    parentId: first.id,
  });
  const op = await reply(created, 'Thank you for listening.', {
    threadToken: created.threadToken,
    parentId: first.id,
  });
  assert.equal(first.alias, second.alias);
  assert.notEqual(first.alias, op.alias);
  assert.equal(op.alias, created.alias);
  assert.equal(op.isOp, true);
  assert.equal(first.isOp, false);
  assert.equal(second.parentId, first.id);
  assert.equal(second.parentAlias, first.alias);
  const { data } = await request(`/posts/${created.id}/comments`);
  assert.equal(data.comments.length, 3);
  data.comments.forEach(assertPublic);
});
test('participant hashes are isolated to a thread even if a key is reused', async () => {
  const sharedToken = token();
  const first = await post('Thread one', { threadToken: sharedToken });
  const second = await post('Thread two', { threadToken: sharedToken });
  const firstRow = runtime.db.prepare('SELECT author_hash FROM posts WHERE id=?').get(first.id);
  const secondRow = runtime.db.prepare('SELECT author_hash FROM posts WHERE id=?').get(second.id);
  assert.notEqual(firstRow.author_hash, secondRow.author_hash);
});
test('cross-thread parent references and oversized replies are rejected', async () => {
  const a = await post('First conversation'),
    b = await post('Second conversation');
  const comment = await reply(a, 'A reply');
  const body = {
    body: 'Wrong thread',
    parentId: comment.id,
    deletionToken: token(),
    threadToken: token(),
  };
  assert.equal((await request(`/posts/${b.id}/comments`, { method: 'POST', body })).status, 400);
  assert.equal(
    (
      await request(`/posts/${b.id}/comments`, {
        method: 'POST',
        body: { ...body, parentId: null, body: 'x'.repeat(2001) },
      })
    ).status,
    400,
  );
});
test('deletion requires the correct private key; removing a parent keeps child replies', async () => {
  const created = await post('Deletion test');
  const parent = await reply(created, 'Parent');
  const child = await reply(created, 'Child', { parentId: parent.id });
  assert.equal(
    (await request(`/content/comment/${parent.id}`, { method: 'DELETE', key: token() })).status,
    403,
  );
  assert.equal(
    (
      await request(`/content/comment/${parent.id}`, {
        method: 'DELETE',
        key: parent.deletionToken,
      })
    ).status,
    204,
  );
  const { data } = await request(`/posts/${created.id}/comments`);
  assert.equal(data.comments.length, 1);
  assert.equal(data.comments[0].id, child.id);
  assert.equal(data.comments[0].parentId, null);
  assert.equal(data.comments[0].parentAlias, parent.alias);
  assert.equal(
    (await request(`/content/post/${created.id}`, { method: 'DELETE', key: created.deletionToken }))
      .status,
    204,
  );
  assert.equal((await request(`/posts/${created.id}/comments`)).status, 404);
});
test('hearts are idempotent per browser key and can be removed', async () => {
  const created = await post('Heart test');
  const heartToken = token();
  const path = `/content/post/${created.id}/heart`;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await request(path, { method: 'PUT', body: { token: heartToken, liked: true } })).data
        .hearts,
      1,
    );
  assert.equal(
    (await request(path, { method: 'PUT', body: { token: token(), liked: true } })).data.hearts,
    2,
  );
  assert.equal(
    (await request(path, { method: 'PUT', body: { token: heartToken, liked: false } })).data.hearts,
    1,
  );
});
test('keyword search includes replies and treats SQL wildcard characters literally', async () => {
  const created = await post('Keyword parent');
  await reply(created, 'needle%_literal');
  const result = await request('/posts?q=needle%25_literal');
  assert.equal(result.data.posts.length, 1);
  assert.equal(result.data.posts[0].id, created.id);
  assert.equal((await request('/posts?q=%27%20OR%201%3D1%20--')).data.total, 0);
});
test('feed filters, reply counts, and pagination select the intended conversations', async () => {
  const created = await post('Popular thought');
  for (let i = 0; i < 5; i++) await reply(created, `Reply ${i}`);
  const popular = await request('/posts?filter=discussed&limit=1');
  assert.equal(popular.data.posts[0].id, created.id);
  assert.equal(popular.data.posts[0].replyCount, 5);
  assert.equal(popular.data.hasMore, true);
  const unanswered = await request('/posts?filter=unanswered');
  assert.ok(unanswered.data.posts.every((p) => p.replyCount === 0));
  const pageTwo = await request('/posts?filter=discussed&limit=1&offset=1');
  assert.notEqual(pageTwo.data.posts[0].id, created.id);
});
test('reports are private, deduplicated, and removable only by the administrator', async () => {
  const created = await post('Reported message');
  const path = `/content/post/${created.id}/report`;
  const body = { reason: 'Personal information', details: 'Please review.', token: token() };
  assert.equal((await request(path, { method: 'POST', body })).status, 201);
  assert.equal((await request(path, { method: 'POST', body })).status, 201);
  assert.equal((await request('/admin/reports')).status, 401);
  assert.equal((await request('/admin/reports', { key: token() })).status, 401);
  const queue = await request('/admin/reports', { key: adminToken });
  assert.equal(queue.data.total, 1);
  assert.equal(queue.data.reports[0].details, 'Please review.');
  assertPublic(queue.data.reports[0]);
  assert.equal(
    (await request(`/admin/content/post/${created.id}`, { method: 'DELETE', key: adminToken }))
      .status,
    204,
  );
  assert.equal((await request('/admin/reports', { key: adminToken })).data.total, 0);
});
test('administrator can dismiss a report without deleting the message', async () => {
  const created = await post('A report to dismiss');
  await request(`/content/post/${created.id}/report`, {
    method: 'POST',
    body: { token: token(), reason: 'Other' },
  });
  const queue = await request('/admin/reports', { key: adminToken });
  assert.equal(
    (
      await request(`/admin/reports/${queue.data.reports[0].id}/resolve`, {
        method: 'POST',
        key: adminToken,
        body: {},
      })
    ).status,
    204,
  );
  assert.equal((await request('/admin/reports', { key: adminToken })).data.total, 0);
  assert.equal((await request(`/posts?q=${encodeURIComponent(created.body)}`)).data.total, 1);
});
test('cross-origin writes are rejected and API security headers are present', async () => {
  assert.equal(
    (
      await request('/posts', {
        method: 'POST',
        origin: 'https://untrusted.example',
        body: { body: 'Blocked' },
      })
    ).status,
    403,
  );
  const response = await fetch(`${base}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}',
  });
  assert.equal(response.status, 415);
  const result = await request('/health');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('x-frame-options'), 'SAMEORIGIN');
});
test('SSE delivers real change events to a separate connection without private information', async () => {
  const controller = new AbortController();
  const response = await fetch(`${base}/events`, { signal: controller.signal });
  assert.equal(response.headers.get('content-type').startsWith('text/event-stream'), true);
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: ready/);
  const created = await post('A live thought');
  const next = await Promise.race([
    reader.read(),
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error('No live event received')), 3000);
      t.unref();
    }),
  ]);
  const event = new TextDecoder().decode(next.value);
  assert.match(event, /event: change/);
  assert.match(event, new RegExp(created.id));
  assert.ok(!event.includes(created.deletionToken));
  assert.ok(!event.includes(created.threadToken));
  controller.abort();
});
test('SQLite retains real conversations after reopening the application', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'unsaid-persistence-'));
  const databasePath = join(directory, 'board.db');
  let instance = createApp({ databasePath });
  instance.db
    .prepare('INSERT INTO posts VALUES (?,?,?,?,?,?,?)')
    .run(
      'test-persistent',
      'Still here after restart',
      'Thoughts',
      'Quiet Comet',
      hashForTest('thread'),
      hashForTest('deletion'),
      Date.now(),
    );
  instance.close();
  instance = createApp({ databasePath });
  assert.equal(
    instance.db.prepare('SELECT body FROM posts WHERE id=?').get('test-persistent').body,
    'Still here after restart',
  );
  instance.close();
  rmSync(directory, { recursive: true });
});
function hashForTest(value) {
  return Buffer.from(value).toString('hex');
}
test('posting rate limits apply and production cannot disable them', async () => {
  const instance = createApp({ databasePath: ':memory:' });
  const listener = instance.app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const url = `http://127.0.0.1:${listener.address().port}/api/posts`;
  try {
    for (let i = 0; i < 8; i++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `Rate ${i}`, deletionToken: token(), threadToken: token() }),
      });
      assert.equal(response.status, 201);
      await response.json();
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Limited', deletionToken: token(), threadToken: token() }),
    });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  } finally {
    instance.close();
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
  }
  assert.throws(
    () => createApp({ production: true, disableRateLimit: true }),
    /cannot be disabled/,
  );
  assert.throws(() => createApp({ production: true, databasePath: ':memory:' }), /PUBLIC_ORIGIN/);
});
