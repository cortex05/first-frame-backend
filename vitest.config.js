import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    // Each file starts its own in-memory replica set; running them one at a
    // time keeps startup from contending for ports and CPU.
    fileParallelism: false,
  },
});
