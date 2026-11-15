// Assemble src/lib/sync.ts pour Node, avec de faux modules à la place de la
// base Supabase et de la base du téléphone. Aucun accès à la production.
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const projet = process.argv[2];
const { build } = createRequire(resolve(projet, 'package.json'))('esbuild');
const externe = (fichier) => ({ path: pathToFileURL(resolve(ici, fichier)).href, external: true });

await build({
  entryPoints: [resolve(projet, 'src/lib/sync.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: resolve(ici, 'sync.bundle.mjs'),
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'error',
  plugins: [
    {
      name: 'faux-modules',
      setup(b) {
        // « externe » : le test et le code testé partagent le même faux module
        b.onResolve({ filter: /^\.\/supabase$/ }, () => externe('faux-supabase.mjs'));
        b.onResolve({ filter: /store\/db$/ }, () => externe('fausse-db.mjs'));
      },
    },
  ],
});
console.log('assemblage OK');
