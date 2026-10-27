import express from 'express';
import helmet from 'helmet';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './db.js';

const CATEGORIES = ['Thoughts', 'Confessions', 'Questions', 'Random'];
const REASONS = ['Spam', 'Harmful content', 'Personal information', 'Other'];
const WORDS = [
  'Quiet',
  'Velvet',
  'Silver',
  'Wandering',
  'Little',
  'Gentle',
  'Midnight',
  'Soft',
  'Amber',
  'Distant',
  'Sleepy',
  'Hidden',
  'Tender',
  'Wild',
  'Misty',
  'Paper',
  'Blue',
  'Golden',
  'Secret',
  'Lunar',
  'Dreaming',
  'Peaceful',
  'Brave',
  'Dawn',
];
const NOUNS = [
  'Comet',
  'Moon',
  'Willow',
  'Echo',
  'Sparrow',
  'Cloud',
  'River',
  'Orbit',
  'Fern',
  'Lantern',
  'Meadow',
  'Petal',
  'Ocean',
  'Star',
  'Firefly',
  'Maple',
  'Clover',
  'Moth',
  'Horizon',
  'Breeze',
  'Wren',
  'Tide',
  'Blossom',
  'Rain',
];
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9_-]{22}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const id = () => randomBytes(16).toString('base64url');
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

function validToken(token) {
  if (typeof token !== 'string' || !TOKEN.test(token))
    throw bad('A valid private browser key is required.');
  return token;
}
function validBody(body, max) {
  if (typeof body !== 'string' || !body.trim()) throw bad('Write a little something first.');
  if (Array.from(body).length > max)
    throw bad(`Please keep your message within ${max.toLocaleString()} characters.`);
  if (body.includes('\0')) throw bad('Your message contains an unsupported null character.');
  return body; // Preserve original whitespace, spelling, emojis, and punctuation.
}
function safeEqual(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
  );
}

export function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const disableRateLimit = options.disableRateLimit ?? process.env.DISABLE_RATE_LIMIT === 'true';
  if (production && disableRateLimit)
    throw new Error('Rate limiting cannot be disabled in production.');
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  if (production && !publicOrigin?.startsWith('https://'))
    throw new Error('Set PUBLIC_ORIGIN to your public HTTPS origin in production.');
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  if (production && !adminToken)
    throw new Error('Set a strong ADMIN_TOKEN before starting in production.');
  if (adminToken && adminToken.length < 32)
    throw new Error('ADMIN_TOKEN must contain at least 32 characters.');
  const trustProxyHops = Number(options.trustProxyHops ?? process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10)
    throw new Error('Invalid TRUST_PROXY_HOPS.');
  const db = openDatabase(options.databasePath ?? process.env.DATABASE_PATH ?? './data/unsaid.db');
  const app = express();
  app.disable('x-powered-by');
  if (trustProxyHops) app.set('trust proxy', trustProxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'"],
              fontSrc: ["'self'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        const expected = publicOrigin || `${req.protocol}://${req.get('host')}`;
        if (origin !== expected)
          return res.status(403).json({ error: 'This request must come from the Unsaid website.' });
      }
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json'))
        return res.status(415).json({ error: 'Send messages as JSON.' });
    }
    next();
  });
  app.use(express.json({ limit: '24kb', strict: true }));
  app.use('/api', (req, _res, next) => {
    if (
      ['POST', 'PUT', 'PATCH'].includes(req.method) &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    )
      throw bad('Send a valid message object.');
    next();
  });

  // Network addresses are HMACed in memory only. They are never logged or persisted.
  const rateSalt = randomBytes(32);
  const buckets = new Map();
  const clients = new Map();
  const addressKey = (req) =>
    createHmac('sha256', rateSalt)
      .update(req.ip || 'unknown')
      .digest('hex');
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
  }, 60_000);
  prune.unref();
  function rate(name, limit, windowMs) {
    return (req, res, next) => {
      if (disableRateLimit) return next();
      const key = `${name}:${addressKey(req)}`;
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= now) {
        if (buckets.size >= 50_000)
          return res.status(503).json({ error: 'The room is busy. Please try again in a moment.' });
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(key, bucket);
      }
      if (++bucket.count > limit) {
        const retryAfter = Math.ceil((bucket.reset - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res
          .status(429)
          .json({ error: 'Take a little breath. You can try again shortly.', retryAfter });
      }
      next();
    };
  }
  app.use('/api', rate('requests', 360, 60_000));
  function broadcast(postId) {
    for (const res of clients.keys())
      res.write(`event: change\ndata: ${JSON.stringify({ postId })}\n\n`);
  }
  const heartbeat = setInterval(() => {
    for (const res of clients.keys()) res.write(': keep-alive\n\n');
  }, 20_000);
  heartbeat.unref();
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', storage: 'sqlite', realtime: 'sse' });
  });
  app.get('/api/events', (req, res) => {
    const address = addressKey(req);
    if ([...clients.values()].filter((v) => v === address).length >= 20 || clients.size >= 2000)
      return res
        .status(429)
        .json({ error: 'Too many live connections. Please close an unused tab.' });
    res.set({
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 2000\nevent: ready\ndata: {}\n\n');
    clients.set(res, address);
    req.on('close', () => clients.delete(res));
  });
  const postSelect = `SELECT p.id, p.body, p.category, p.alias, p.created_at AS createdAt,
    (SELECT count(*) FROM comments c WHERE c.post_id=p.id) AS replyCount,
    (SELECT count(*) FROM reactions r WHERE r.target_type='post' AND r.target_id=p.id) AS hearts FROM posts p`;
  function getPost(postId) {
    return db.prepare(`${postSelect} WHERE p.id=?`).get(postId);
  }
  function getTarget(type, targetId) {
    if (!['post', 'comment'].includes(type) || !ID.test(targetId))
      throw bad('This message could not be found.', 404);
    const row = db
      .prepare(`SELECT * FROM ${type === 'post' ? 'posts' : 'comments'} WHERE id=?`)
      .get(targetId);
    if (!row) throw bad('This message has been removed.', 404);
    return row;
  }
  function nextAlias(postId) {
    const aliases = new Set(
      db
        .prepare('SELECT alias FROM participants WHERE post_id=?')
        .all(postId)
        .map((row) => row.alias),
    );
    const start = randomBytes(4).readUInt32BE() % (WORDS.length * NOUNS.length);
    for (let n = 0; ; n++) {
      const position = (start + n) % (WORDS.length * NOUNS.length);
      const cycle = Math.floor(n / (WORDS.length * NOUNS.length));
      const alias = `${WORDS[Math.floor(position / NOUNS.length)]} ${NOUNS[position % NOUNS.length]}${cycle ? ` ${cycle + 1}` : ''}`;
      if (!aliases.has(alias)) return alias;
    }
  }
  app.get('/api/posts', (req, res) => {
    const filter = req.query.filter || 'newest';
    if (!['newest', 'discussed', 'unanswered'].includes(filter))
      throw bad('Choose a valid feed filter.');
    if (req.query.q !== undefined && typeof req.query.q !== 'string')
      throw bad('Search must be text.');
    const q = (req.query.q || '').slice(0, 200).trim();
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100_000
    )
      throw bad('Invalid page.');
    const clauses = [],
      params = [];
    if (filter === 'unanswered')
      clauses.push('NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id=p.id)');
    if (q) {
      clauses.push(
        "(p.body LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM comments c WHERE c.post_id=p.id AND c.body LIKE ? ESCAPE '\\'))",
      );
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(pattern, pattern);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare(`SELECT count(*) AS count FROM posts p${where}`).get(...params).count;
    const order =
      filter === 'discussed'
        ? 'replyCount DESC, p.created_at DESC, p.id DESC'
        : 'p.created_at DESC, p.id DESC';
    const posts = db
      .prepare(`${postSelect}${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    res.json({ posts, total, hasMore: offset + posts.length < total });
  });
  app.post('/api/posts', rate('posts', 8, 15 * 60_000), (req, res) => {
    const body = validBody(req.body.body, 3000);
    const category = req.body.category ?? 'Thoughts';
    if (!CATEGORIES.includes(category)) throw bad('Choose a valid category.');
    const deletionHash = hash(validToken(req.body.deletionToken));
    const postId = id();
    const authorHash = hash(`${postId}:${validToken(req.body.threadToken)}`);
    const alias = nextAlias(postId);
    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO posts (id,body,category,alias,author_hash,delete_hash,created_at) VALUES (?,?,?,?,?,?,?)',
      ).run(postId, body, category, alias, authorHash, deletionHash, Date.now());
      db.prepare('INSERT INTO participants VALUES (?,?,?)').run(postId, authorHash, alias);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    broadcast(postId);
    res.status(201).json({ post: getPost(postId) });
  });
  function getComments(postId) {
    return db
      .prepare(
        `SELECT c.id,c.post_id AS postId,c.parent_id AS parentId,c.parent_alias AS parentAlias,c.body,c.alias,c.created_at AS createdAt,
      c.author_hash=p.author_hash AS isOp,
      (SELECT count(*) FROM reactions r WHERE r.target_type='comment' AND r.target_id=c.id) AS hearts
      FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.post_id=? ORDER BY c.created_at,c.rowid`,
      )
      .all(postId)
      .map((c) => ({ ...c, isOp: Boolean(c.isOp) }));
  }
  app.get('/api/posts/:id/comments', (req, res) => {
    getTarget('post', req.params.id);
    res.json({ comments: getComments(req.params.id) });
  });
  app.post('/api/posts/:id/comments', rate('comments', 40, 15 * 60_000), (req, res) => {
    const postId = req.params.id;
    getTarget('post', postId);
    const body = validBody(req.body.body, 2000);
    const authorHash = hash(`${postId}:${validToken(req.body.threadToken)}`);
    const deletionHash = hash(validToken(req.body.deletionToken));
    const parentId = req.body.parentId || null;
    let parentAlias = null;
    if (parentId) {
      const parent = getTarget('comment', parentId);
      if (parent.post_id !== postId) throw bad('Choose a reply from this conversation.');
      parentAlias = parent.alias;
    }
    const participant = db
      .prepare('SELECT alias FROM participants WHERE post_id=? AND token_hash=?')
      .get(postId, authorHash);
    const alias = participant?.alias ?? nextAlias(postId);
    const commentId = id();
    db.exec('BEGIN');
    try {
      if (!participant)
        db.prepare('INSERT INTO participants VALUES (?,?,?)').run(postId, authorHash, alias);
      db.prepare('INSERT INTO comments VALUES (?,?,?,?,?,?,?,?,?)').run(
        commentId,
        postId,
        parentId,
        parentAlias,
        body,
        alias,
        authorHash,
        deletionHash,
        Date.now(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    broadcast(postId);
    res.status(201).json({ comment: getComments(postId).find((c) => c.id === commentId) });
  });
  function removeContent(type, targetId) {
    const row = getTarget(type, targetId);
    const postId = type === 'post' ? targetId : row.post_id;
    db.exec('BEGIN');
    try {
      if (type === 'post') {
        db.prepare(
          "DELETE FROM reactions WHERE target_type='comment' AND target_id IN (SELECT id FROM comments WHERE post_id=?)",
        ).run(targetId);
        db.prepare(
          "DELETE FROM reports WHERE target_type='comment' AND target_id IN (SELECT id FROM comments WHERE post_id=?)",
        ).run(targetId);
      }
      db.prepare('DELETE FROM reactions WHERE target_type=? AND target_id=?').run(type, targetId);
      db.prepare('DELETE FROM reports WHERE target_type=? AND target_id=?').run(type, targetId);
      db.prepare(`DELETE FROM ${type === 'post' ? 'posts' : 'comments'} WHERE id=?`).run(targetId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    broadcast(postId);
  }
  app.delete('/api/content/:type/:id', rate('deletes', 60, 60_000), (req, res) => {
    const row = getTarget(req.params.type, req.params.id);
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    if (!token || !safeEqual(hash(token), row.delete_hash))
      throw bad('Only the browser holding this message’s private key can delete it.', 403);
    removeContent(req.params.type, req.params.id);
    res.status(204).end();
  });
  app.put('/api/content/:type/:id/heart', rate('hearts', 100, 60_000), (req, res) => {
    const target = getTarget(req.params.type, req.params.id);
    const tokenHash = hash(validToken(req.body.token));
    if (typeof req.body.liked !== 'boolean') throw bad('Choose a valid reaction.');
    if (req.body.liked)
      db.prepare('INSERT OR IGNORE INTO reactions VALUES (?,?,?)').run(
        req.params.type,
        req.params.id,
        tokenHash,
      );
    else
      db.prepare('DELETE FROM reactions WHERE target_type=? AND target_id=? AND token_hash=?').run(
        req.params.type,
        req.params.id,
        tokenHash,
      );
    const hearts = db
      .prepare('SELECT count(*) AS count FROM reactions WHERE target_type=? AND target_id=?')
      .get(req.params.type, req.params.id).count;
    broadcast(req.params.type === 'post' ? target.id : target.post_id);
    res.json({ hearts, liked: req.body.liked });
  });
  app.post('/api/content/:type/:id/report', rate('reports', 8, 60 * 60_000), (req, res) => {
    getTarget(req.params.type, req.params.id);
    if (!REASONS.includes(req.body.reason)) throw bad('Choose a report reason.');
    const details = req.body.details ?? '';
    if (typeof details !== 'string' || Array.from(details).length > 500)
      throw bad('Keep additional details within 500 characters.');
    db.prepare(
      'INSERT OR IGNORE INTO reports (id,target_type,target_id,reporter_hash,reason,details,created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      id(),
      req.params.type,
      req.params.id,
      hash(validToken(req.body.token)),
      req.body.reason,
      details,
      Date.now(),
    );
    res.status(201).json({ message: 'Thank you. Your report is in the moderation queue.' });
  });
  const requireAdmin = [
    rate('admin', 15, 60_000),
    (req, _res, next) => {
      if (!adminToken)
        throw bad(
          'Moderation is not configured. The operator must set ADMIN_TOKEN on the server.',
          503,
        );
      if (!safeEqual(req.get('authorization')?.replace(/^Bearer /, ''), adminToken))
        throw bad('The administrator key is incorrect.', 401);
      next();
    },
  ];
  app.get('/api/admin/reports', ...requireAdmin, (_req, res) => {
    const reports = db
      .prepare(
        `SELECT r.id,r.target_type AS targetType,r.target_id AS targetId,r.reason,r.details,r.created_at AS createdAt,
      CASE WHEN r.target_type='post' THEN p.body ELSE c.body END AS body,
      CASE WHEN r.target_type='post' THEN p.alias ELSE c.alias END AS alias
      FROM reports r LEFT JOIN posts p ON r.target_type='post' AND p.id=r.target_id
      LEFT JOIN comments c ON r.target_type='comment' AND c.id=r.target_id WHERE r.resolved=0 ORDER BY r.created_at LIMIT 100`,
      )
      .all();
    const total = db.prepare('SELECT count(*) AS count FROM reports WHERE resolved=0').get().count;
    res.json({ reports, total });
  });
  app.delete('/api/admin/content/:type/:id', ...requireAdmin, (req, res) => {
    removeContent(req.params.type, req.params.id);
    res.status(204).end();
  });
  app.post('/api/admin/reports/:id/resolve', ...requireAdmin, (req, res) => {
    if (!ID.test(req.params.id)) throw bad('This report could not be found.', 404);
    const result = db.prepare('UPDATE reports SET resolved=1 WHERE id=?').run(req.params.id);
    if (!result.changes) throw bad('This report could not be found.', 404);
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'This page could not be found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { etag: true, maxAge: 0 }));
    app.get('/', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    // Never log request bodies, addresses, keys, or raw database error messages.
    if (status === 500) console.error('An internal request failed.');
    res.status(status).json({
      error:
        status === 500
          ? 'Something went quiet on our end. Please try again.'
          : error.type === 'entity.parse.failed'
            ? 'The message format could not be read.'
            : error.message,
    });
  });
  return {
    app,
    db,
    close() {
      clearInterval(prune);
      clearInterval(heartbeat);
      for (const res of clients.keys()) res.end();
      clients.clear();
      db.close();
    },
  };
}
