#!/usr/bin/env node
// Test double for a tunnel process: prints a "ready" line, then stays alive
// until killed, logging the signal so we can assert clean shutdown.
const mode = process.argv[2] ?? 'ready';

if (mode === 'crash') {
  console.error('boom');
  process.exit(2);
}

setTimeout(() => {
  console.log('Listening on port 5432');
}, 50);

process.on('SIGTERM', () => {
  console.log('got SIGTERM');
  process.exit(0);
});

// Keep the event loop alive.
setInterval(() => {}, 1000);
