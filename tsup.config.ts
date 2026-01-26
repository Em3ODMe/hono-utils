import { defineConfig, type Options } from 'tsup';

const defaultOptions: Options = {
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  minify: false,
};

export default defineConfig({
  ...defaultOptions,
  entry: ['src/index.ts'],
  outDir: 'dist',
});
