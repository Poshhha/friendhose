import { createApp } from './app.js';

const runtime = createApp();
const port = Number(process.env.PORT || 3001);
const server = runtime.app.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(
    `Unsaid is listening on port ${port}. Shared SQLite storage and live events are enabled.`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    runtime.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
