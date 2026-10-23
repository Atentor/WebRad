import { setImmediate } from 'node:timers/promises';
import { afterEach } from 'vitest';
// Give test-worker reporting RPCs real I/O
// callbacks a turn between cases so long TypeScript suites cannot starve replies.
// Node's promise timer remains real when an individual test uses fake timers.
afterEach(async () => {
  await setImmediate();
  await setImmediate();
});
