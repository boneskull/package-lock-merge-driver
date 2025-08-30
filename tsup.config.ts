import { defineConfig } from 'tsup';

export default defineConfig({
  bundle: false,
  clean: true,
  entry: ['src/lib.ts', 'src/cli.ts'],
  experimentalDts: true,
  format: ['esm'],
  shims: true,
  sourcemap: true,
});
