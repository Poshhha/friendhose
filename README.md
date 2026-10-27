# Unsaid

**Some things are easier said anonymously.** Leave a thought. Find a conversation.

A complete responsive anonymous message board built with React, Tailwind CSS, Express, and real SQLite storage. Server-sent events (SSE) update the feed, hearts, and expanded reply threads across separate browsers without refreshing. No external backend credentials, hosted fonts, analytics, signup, or simulated data are needed.

## Run locally

Use **Node.js 24+**. Node's built-in SQLite driver means there is no separate database service or native package compilation.

```sh
npm ci
npm run setup
npm run dev
```

Vite runs on port **5173** and proxies `/api` to the Node server on **3001**. Open the Vite address printed in your terminal. `npm run setup` creates a private, ignored `.env` and a random administrator key only if the file does not already exist; it preserves existing configuration. No secrets are printed. The database is created automatically from [`db/schema.sql`](db/schema.sql) when the server starts.

To run the built website as one process:

```sh
npm run build
npm start
```

The same Node process serves the built frontend, API, and live events on port 3001. A real, empty board is shown initially. Test fixtures are kept in separate temporary databases; production is never seeded with pretend conversations.

## Features

- Text posts with preserved multiline paragraphs, emojis, a 3,000-character limit, and Thoughts / Confessions / Questions / Random categories.
- Expandable inline conversations with 2,000-character replies, explicit “Replying to…” references, and original-poster badges. Deleting a parent reply preserves its child replies and labels the removed reference.
- Newest, Most discussed, and Unanswered filters, paginated results, and keyword search across posts and replies.
- Random per-thread aliases that stay consistent within that conversation. No global visitor identity or public profiles.
- Hearts with idempotent browser-held reaction keys; they are per browser key, not proof of unique people.
- Private browser-held deletion keys for posts and replies, anonymous reporting, and an authenticated administrator moderation queue.
- Mobile compose shortcut, keyboard navigation, focus indicators, accessible native dialogs, plain text rendering, reduced motion support, and honest privacy explanations.
- Persistent shared database and automatic live reconnection. If live transport is unavailable, the page retries and polls while disconnected.

## Configuration

See [`.env.example`](.env.example). Configure the server's environment or its untracked `.env` file. **Never use a `VITE_` variable for secrets**: those are bundled into public frontend code.

| Variable             | Purpose                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | HTTP port; defaults to `3001`.                                                                                                                                                         |
| `HOST`               | Bind address; defaults to `0.0.0.0`.                                                                                                                                                   |
| `DATABASE_PATH`      | SQLite file path; defaults to `./data/unsaid.db`. Must be on persistent storage in deployment.                                                                                         |
| `ADMIN_TOKEN`        | At least 32 characters; setup generates 256 random bits. Required in production. Held only by the server/operator.                                                                     |
| `PUBLIC_ORIGIN`      | Exact public HTTPS origin, e.g. `https://unsaid.example.com`, without trailing slash. Required in production; write requests must match this origin. Leave unset in local development. |
| `TRUST_PROXY_HOPS`   | Exact count of trusted reverse proxies, default `0`. The supplied Caddy deployment sets `1`. Do not expose the Node port directly when trusting a proxy.                               |
| `NODE_ENV`           | Set to `production` for deployment; enables CSP and production configuration checks.                                                                                                   |
| `UNSAID_DOMAIN`      | Domain hostname used by the optional Caddy deployment, e.g. `unsaid.example.com`.                                                                                                      |
| `DISABLE_RATE_LIMIT` | Tests only. Never set this in deployment; production refuses to run when it is enabled.                                                                                                |

No Supabase account or keys are required. SQLite was chosen to deliver a fully working shared backend without depending on credentials that were not supplied. All visitors talk to the same server database; `localStorage` stores only private ownership/thread/reaction keys, never the public message feed.

## Deploy with Docker and automatic HTTPS

Use a Linux server with Docker Compose, a domain pointing to it, and ports 80/443 open. This is a **single-instance** application with persistent SQLite storage, not a static-site bundle or an ephemeral serverless function.

1. Clone this repository on your server. Create a private `.env` (permissions `600`). Set `PUBLIC_ORIGIN=https://your-domain.example`, `UNSAID_DOMAIN=your-domain.example`, and a strong `ADMIN_TOKEN`. Generate a key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, or use `openssl rand -hex 32`. Keep it in a password manager and server configuration; do not share it in chat or source control.
2. Start the provided deployment:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

3. Visit your configured HTTPS domain. Caddy obtains and renews the TLS certificate. The app port stays internal; Caddy handles streaming events without buffering or compressing that endpoint. The `unsaid_data` named volume retains the database across container replacement. Do not use `docker compose down -v` unless you intend to erase stored conversations and TLS state.
4. Open the site in two separate browsers, publish a thought, reply from the other browser, and confirm updates arrive automatically. Check that your host is not buffering `/api/events`. Verify moderation before sharing the URL publicly.

To deploy without Compose, install Node 24, run `npm ci`, `npm run setup`, and `npm run build`, then run `NODE_ENV=production npm start` under a process supervisor. Configure `PUBLIC_ORIGIN`, the administrator key, a persistent `DATABASE_PATH`, and a trusted HTTPS reverse proxy. Set the proxy count accurately and restrict direct access to Node. Any Node-capable host with a persistent disk and long-lived HTTP/SSE connections works. Static-only hosting does not run this backend.

**Scaling:** run one application instance against one local SQLite database. The in-process live event broadcaster and spam limits do not coordinate across replicas. Before horizontal scaling, move storage to a shared database and use shared rate-limit storage and pub/sub. Do not put SQLite WAL files on network storage.

## Administrator removal and reports

Click the small shield at the right of the footer (accessible name: **Administrator moderation tools**). Enter the server's `ADMIN_TOKEN` to view the report queue, dismiss reviewed reports, or permanently remove reported posts/replies. Removing a post removes its thread. The key stays in component memory until the dialog closes and is not persisted by the browser. The administrator can also remove content directly using a public content reference in the dialog or the API below. Public references identify content; they are not internal row numbers or participant identifiers.

```text
GET    /api/admin/reports
DELETE /api/admin/content/post/:publicId
DELETE /api/admin/content/comment/:publicId
POST   /api/admin/reports/:publicId/resolve
Authorization: Bearer <administrator key>
```

Send `{}` as the JSON body for report resolution. Up to 100 oldest unresolved reports are returned at a time. Review them to advance through the queue. Reports are reviewed manually; no automatic censorship or AI rewriting is performed. This service is not continuously monitored or a crisis service.

## Privacy and security model

- Each thread gets a fresh 256-bit browser-held participant key. The server stores a SHA-256 hash salted with that thread's public reference, not a global user identifier. That key determines the consistent alias and OP status only within the thread. Alias collisions within a thread are prevented.
- Every post/reply gets its own 256-bit deletion key. Only its SHA-256 digest is stored on the server. Deletion uses the raw key in an HTTPS `Authorization` header, never a URL. Keys are never returned by feed APIs or live events. Clearing browser data loses ownership and alias continuity; there is no account recovery. Private browsing may discard keys when closed.
- Reactions and reports use independent per-content random keys. Local browser storage contains private keys and reaction state only. Keep the site origin stable to preserve browser-held ownership across deployments.
- User text is rendered through React as plain text, with no HTML injection, Markdown processing, word filtering, or rewriting. Server-side length/type/category/parent validation, prepared SQL statements, JSON-only writes, same-origin checks, security headers, and production CSP protect the API and UI.
- Basic spam limits: 8 posts / 15 minutes, 40 replies / 15 minutes, 100 heart changes / minute, 8 reports / hour, and 360 API requests / minute per temporary network-address hash. Live connections are capped. Addresses are HMACed with an ephemeral process key, kept only in expiring in-memory counters, and never logged or put in the database. These limits reset on process restart and are not a comprehensive anti-bot system. People sharing a network may share limits.
- No cookies, advertising trackers, names, email addresses, raw IP logs, or device fingerprinting are implemented. Other visitors see aliases, text, public content references, counts, and timestamps. **Anonymity is not untraceability**: the operator/host may process connection metadata, and text can reveal identity. Review hosting and reverse-proxy logging policies before making privacy claims. Do not log request bodies or authorization headers.
- Rate limits and unique browser reaction keys reduce casual abuse; without accounts, users can reset browser keys or change networks. Restrict operator access to the database, backups, environment configuration, and moderation key. Rotate `ADMIN_TOKEN` if compromised.

## Validation

```sh
npm test                 # API/security/realtime/persistence tests; isolated databases
npm run build            # Production frontend
npx playwright install chromium
npm run test:e2e         # Desktop and mobile browser tests, separate temporary DB
```

If your environment already provides Chromium, skip downloading it and run:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Browser tests exercise two independent visitors, real-time publishing and replying, OP labels, reply references, hearts, private ownership/deletion, report submission, administrator removal, search/filters, keyboard dialogs, and viewport widths from 320 to 1440px. The test server runs on port 4173, uses `test-results/browser.db`, and is separate from the development database. `GET /api/health` performs a database read and reports the configured storage/transport, not just an open port.

## Database operations and recovery

The version-one schema is in `db/schema.sql` and is installed idempotently. All content, aliases, private-key digests, reactions, and reports live in the SQLite file. Foreign keys and explicit cleanup remove child data; deleting a reply preserves its descendants' text while marking the parent reference removed.

Back up the database consistently using SQLite's online backup API or stop the app and copy the database together with any `-wal`/`-shm` files. Do not copy only the database file while writes are active. Store backups securely, test restoration, and apply a documented retention policy. Deletion removes live records; old backups can retain them until backup expiry. Filesystem/SQLite free pages are not a guarantee of forensic erasure.

## Project layout

```text
src/                 React UI, browser-held keys, Tailwind and custom styles
server/              Express API, SQLite connection, live event broadcaster
db/schema.sql        Complete database schema
scripts/setup.js     Idempotent local environment setup
tests/               API and desktop/mobile integration tests
Dockerfile           Production image, non-root runtime, healthcheck
compose.yaml         App, persistent database volume, HTTPS proxy
Caddyfile            TLS and streaming reverse-proxy configuration
.env.example         Server-side environment variable documentation
```

Development tasks already have an isolated cloud checkout. Use the existing checkout; a separate Git worktree is unnecessary unless explicitly requested.
