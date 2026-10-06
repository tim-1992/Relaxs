import { mkdir, readFile, readdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const entries = ['index.html', 'care.html', 'hoops.html', 'arcade.html', 'favicon.svg'];
const sourceFiles = (await readdir(join(root, 'src'), { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(js|css)$/.test(entry.name))
  .map(entry => `src/${entry.name}`);
const vendorFiles = ['three.module.js', 'three.core.js'];
const expected = new Set([
  ...entries, ...sourceFiles, ...vendorFiles.map(name => `vendor/three/${name}`),
  'vendor/three/LICENSE',
]);

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`发布目录不能包含符号链接：${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files;
}

await mkdir(output, { recursive: true });
// Refuse unexpected files so local notes or credentials cannot enter a release.
for (const name of await listFiles(output)) {
  if (!expected.has(name)) throw new Error(`dist 中有不属于本站的文件，请先检查：${name}`);
}
await mkdir(join(output, 'src'), { recursive: true });
await mkdir(join(output, 'vendor/three'), { recursive: true });

for (const name of [...entries, ...sourceFiles]) {
  let content = await readFile(join(root, name), 'utf8');
  // Keep the release portable, including hosts that serve it under a URL prefix.
  content = content
    .replaceAll('/node_modules/three/build/three.module.js', './vendor/three/three.module.js')
    .replace(/(["'`])\/(?=(?:src\/|favicon\.svg|hoops\.html|arcade\.html))/g, '$1./')
    .replaceAll('href="/"', 'href="./index.html"')
    .replaceAll("location.href='/'", "location.href='./index.html'");
  if (name.endsWith('.html')) {
    // Entries are self-contained IIFEs below. Classic scripts also work when
    // users double-click the release HTML without a localhost server.
    content = content
      .replace(/<script\b[^>]*\bid="relaxs-local-file-entry"[^>]*>[\s\S]*?<\/script>\s*/g, '')
      .replace(/<script\b[^>]*\btype="importmap"[^>]*>[\s\S]*?<\/script>\s*/g, '')
      .replace(/<script type="module" src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>');
  }
  await writeFile(join(output, name), content);
}
for (const name of vendorFiles) {
  await copyFile(join(root, 'node_modules/three/build', name), join(output, 'vendor/three', name));
}
await copyFile(join(root, 'node_modules/three/LICENSE'), join(output, 'vendor/three/LICENSE'));

// Miaoda redirects entry assets to its CDN. Child module URLs then bypass the
// application's access gateway, so each entry must contain its full module graph.
const bundled = await build({
  entryPoints: ['planet-entry', 'care-app', 'hoops-preview', 'arcade-preview']
    .map(name => join(output, 'src', `${name}.js`)),
  outdir: join(output, 'src'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  logLevel: 'silent',
  legalComments: 'eof',
});
for (const file of bundled.outputFiles) await writeFile(file.path, file.contents);

const files = await listFiles(output);
const sizes = await Promise.all(files.map(async name => ({ name, bytes: (await stat(join(output, name))).size })));
const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
if (sizes.some(file => file.name.endsWith('.html') && file.bytes > 10 * 1024 ** 2) || total > 200 * 1024 ** 2) {
  throw new Error('发布包超过托管体积限制，请检查文件大小。');
}
console.log(`已生成 dist：${files.length} 个文件，${(total / 1024 ** 2).toFixed(2)} MiB。入口：dist/index.html`);
