import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = promisify(execFile)(process.execPath, ['scripts/build-static.mjs'], { cwd: root });

function scripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .map(([, attributes, contents]) => ({
      type: /\btype=["']([^"']+)["']/i.exec(attributes)?.[1] || 'text/javascript',
      src: /\bsrc=["']([^"']+)["']/i.exec(attributes)?.[1],
      contents,
    }));
}

function runInlineScripts(html, href) {
  const current = new URL(href);
  const destinations = [];
  const context = {URL, location: {href, protocol: current.protocol, hash: current.hash,
    replace(value) { destinations.push(value); }}};
  for (const script of scripts(html)) {
    if (!script.src && script.type === 'text/javascript') vm.runInNewContext(script.contents, context);
  }
  return destinations;
}

test('published entry scripts do not request child modules from the redirected CDN', async () => {
  await built;
  for (const name of ['planet-entry', 'care-app', 'hoops-preview', 'arcade-preview']) {
    const file = new URL(`../dist/src/${name}.js`, import.meta.url);
    const { metafile } = await build({
      stdin: { contents: await readFile(file, 'utf8'), sourcefile: fileURLToPath(file) },
      write: false, metafile: true, logLevel: 'silent',
    });
    const imports = Object.values(metafile.outputs).flatMap(output => output.imports);
    assert.deepEqual(imports, [], `${name} must load without additional module requests`);
  }
});

test('double-clicking the source homepage opens the built copy and preserves the selected game', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.deepEqual(runInlineScripts(html, 'file:///tmp/relaxs%20copy/index.html#planet/play/tennis'),
    ['file:///tmp/relaxs%20copy/dist/index.html#planet/play/tennis']);
  assert.deepEqual(runInlineScripts(html, 'http://127.0.0.1:4173/#planet/play/tennis'), []);
});

test('the built homepage stays in place and all entry scripts can run as local classic scripts', async () => {
  await built;
  for (const page of ['index.html', 'care.html', 'hoops.html', 'arcade.html']) {
    const pageURL = new URL(`../dist/${page}`, import.meta.url);
    const html = await readFile(pageURL, 'utf8');
    assert.deepEqual(runInlineScripts(html, pageURL.href), [], `${page} must not redirect to dist/dist`);
    const entries = scripts(html).filter(script => script.src);
    assert.ok(entries.length > 0, `${page} needs a working script`);
    for (const entry of entries) {
      assert.equal(entry.type, 'text/javascript', `${page} must not rely on file-blocked ES modules`);
      const scriptURL = new URL(entry.src, pageURL);
      assert.equal(scriptURL.protocol, 'file:');
      assert.ok(scriptURL.href.startsWith(new URL('../dist/', import.meta.url).href));
      new vm.Script(await readFile(scriptURL, 'utf8'), {filename: scriptURL.pathname});
    }
  }
});
