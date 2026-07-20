import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    'src/index',
    { input: 'src/crypto/index', name: 'crypto/index' },
    { input: 'src/client/createTypedClient', name: 'client/createTypedClient' },
  ],
  outDir: 'dist',
  declaration: true,
  clean: true,
  sourcemap: true,
  failOnWarn: false,
  externals: ['zod', '@cloudflare/workers-types'],
  rollup: {
    emitCJS: true,
    esbuild: {
      target: 'es2020',
    },
  },
});
