import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await mkdir('dist', { recursive: true });
for (const [format, extension] of [['esm', 'js'], ['cjs', 'cjs']]) {
  await build({
    entryPoints: ['src/index.js'], outfile: `dist/index.${extension}`,
    bundle: true, minify: true, sourcemap: true, format,
    platform: 'neutral', target: 'es2020', external: ['react'],
  });
}
await copyFile('src/index.d.ts', 'dist/index.d.ts');
const bundle = await readFile('dist/index.js');
const compressed = gzipSync(bundle).length;
console.log(`ESM: ${bundle.length} bytes minified; ${compressed} bytes gzip (React excluded).`);
if (compressed > 6144) throw new Error('Bundle exceeded the 6 KiB gzip size budget.');