import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let module;
try {module = await import('../scripts/tripo-api.mjs');}
catch (error) {if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;}
const api = () => {assert.ok(module, 'Tripo helper must be importable without reading credentials or making requests'); return module;};
const KEY = 'test-only-credential_123456';
const BASE = 'https://openapi.tripo3d.ai/v3';
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
const ok = data => json({code: 0, data});
function glb() {
  const bytes = Buffer.alloc(32);
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(12, 12); bytes.write('JSON', 16); bytes.write('{"asset":{}}', 20);
  return bytes;
}
async function workspace(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'tripo-helper-test-'));
  t.after(() => rm(cwd, {recursive: true, force: true}));
  return cwd;
}
function logs() {
  const lines = [];
  return {lines, stdout: value => lines.push(String(value)), stderr: value => lines.push(String(value))};
}

test('credentials use env precedence and literal dotenv parsing; invalid/missing keys never reach fetch', async () => {
  const {loadApiKey, createTripoClient} = api();
  assert.equal(await loadApiKey({env: {TRIPO_API_KEY: KEY}, readFileImpl() {assert.fail('must not read dotenv with an env key');}}), KEY);
  assert.equal(await loadApiKey({env: {}, readFileImpl: async () => `# comment\nexport TRIPO_API_KEY="${KEY}" # local\n`}), KEY);
  assert.equal(await loadApiKey({env: {}, readFileImpl: async () => `TRIPO_API_KEY='${KEY}'\nOTHER=ignored`}), KEY);
  assert.equal(await loadApiKey({env: {}, readFileImpl: async () => `TRIPO_API_KEY=${KEY} # comment`}), KEY);
  await assert.rejects(loadApiKey({env: {}, readFileImpl: async () => 'TRIPO_API_KEY=\n'}), /TRIPO_API_KEY.*missing/i);
  await assert.rejects(loadApiKey({env: {}, readFileImpl: async () => 'TRIPO_API_KEY=$(echo no-execution)\n'}), /raw|format/i);
  for (const key of ['', `Bearer ${KEY}`, `${KEY}\r\nInjected: value`]) {
    assert.throws(() => createTripoClient({apiKey: key, fetchImpl() {assert.fail('invalid auth must not send a request');}}), /TRIPO_API_KEY/);
  }
});

test('balance/status are GET only, use exact Bearer auth, and redact echoed credentials', async () => {
  const {createTripoClient} = api(), calls = [];
  const client = createTripoClient({apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({url, options});
    return ok(url.endsWith('/balance') ? {balance: 120, authorization: `Bearer ${KEY}`, note: `echo ${KEY}`} :
      {task_id: 'task_a', status: 'running', progress: 42, debug: {api_key: KEY}});
  }});
  const balance = await client.balance(), status = await client.status('task_a');
  assert.equal(balance.balance, 120); assert.equal(status.status, 'running'); assert.equal(status.progress, 42);
  assert.ok(!JSON.stringify({balance, status}).includes(KEY));
  assert.deepEqual(calls.map(call => [call.url, call.options.method]), [[`${BASE}/account/balance`, 'GET'], [`${BASE}/tasks/task_a`, 'GET']]);
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  await assert.rejects(client.status('../account/balance'), /task.*id/i);
  assert.equal(calls.length, 2);
});

test('generation validates prompt, sends the agreed body exactly once and reports safe errors', async () => {
  const {createTripoClient} = api(), calls = [];
  const client = createTripoClient({apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({url, options}); return ok({task_id: 'task_new', authorization: KEY});
  }});
  await assert.rejects(client.generate(' '), /prompt/i);
  await assert.rejects(client.generate('x'.repeat(1025)), /1024/);
  assert.equal(calls.length, 0);
  const result = await client.generate('A small low-poly mint armchair.');
  assert.equal(result.task_id, 'task_new');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/generation/text-to-model`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    prompt: 'A small low-poly mint armchair.', model: 'P1-20260311', face_limit: 3000, texture: true, pbr: true,
  });
  assert.ok(!JSON.stringify(result).includes(KEY));
  for (const response of [() => json({message: `Bearer ${KEY}`}, 401),
    () => json({code: 1002, message: `bad ${KEY}`}),
    () => new Response(`not JSON ${KEY}`),
    () => {throw new Error(`transport echoed ${KEY}`);}]) {
    let count = 0;
    const failing = createTripoClient({apiKey: KEY, fetchImpl: async () => {count++; return response();}});
    await assert.rejects(failing.generate('chair'), error => {
      assert.ok(!String(error).includes(KEY));
      assert.match(error.message, /HTTP|code|JSON|request|transport/i);
      return true;
    });
    assert.equal(count, 1, 'a failed POST must never retry');
  }
});

test('timeout cancels a hanging request and never retries generation', async () => {
  const {createTripoClient} = api();
  let count = 0, signal;
  const client = createTripoClient({apiKey: KEY, timeoutMs: 10, fetchImpl: (_url, options) => {
    count++; signal = options.signal; return new Promise(() => {});
  }});
  await assert.rejects(client.balance(), /timed out/i);
  assert.equal(signal.aborted, true);
  await assert.rejects(client.generate('chair'), /timed out/i);
  assert.equal(count, 2);
});

test('CLI saves task metadata before returning and refuses duplicate generation in its directory', async t => {
  const {runCli} = api(), cwd = await workspace(t), output = join(cwd, 'chair'), captured = logs();
  const promptFile = join(cwd, 'prompt.txt');
  await writeFile(promptFile, 'A mint armchair');
  let count = 0;
  const options = {cwd, env: {TRIPO_API_KEY: KEY}, ...captured, fetchImpl: async (_url, init) => {
    assert.equal(init.method, 'POST'); count++;
    const journal = JSON.parse(await readFile(join(output, 'tripo-task.json'), 'utf8'));
    assert.equal(journal.status, 'submitting', 'reserve and persist the request before spending');
    return ok({task_id: 'task_chair', api_key: KEY});
  }};
  const args = ['generate', '--prompt-file', promptFile, '--output', output];
  assert.equal(await runCli(args, options), 0);
  const record = JSON.parse(await readFile(join(output, 'tripo-task.json'), 'utf8'));
  assert.equal(record.task_id, 'task_chair'); assert.equal(record.status, 'submitted');
  assert.equal(record.model, 'P1-20260311');
  assert.match(record.prompt_sha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(record).includes(KEY));
  assert.equal(await runCli(args, options), 1);
  assert.equal(count, 1, 'an existing journal must prevent a duplicate POST');
  assert.ok(!captured.lines.join('\n').includes(KEY));
  assert.match(captured.lines.join('\n'), /task_chair/);
});

test('an uncertain submission retains a safe journal and cannot spend again on rerun', async t => {
  const {runCli} = api(), cwd = await workspace(t), captured = logs();
  await writeFile(join(cwd, 'prompt.txt'), 'A low-poly vase');
  let count = 0;
  const options = {cwd, env: {TRIPO_API_KEY: KEY}, ...captured, fetchImpl: async () => {
    count++; throw new Error(`connection lost ${KEY}`);
  }};
  const args = ['generate', '--prompt-file', 'prompt.txt', '--output', 'vase'];
  assert.equal(await runCli(args, options), 1);
  const record = JSON.parse(await readFile(join(cwd, 'vase/tripo-task.json'), 'utf8'));
  assert.equal(record.status, 'submission-unconfirmed'); assert.ok(!JSON.stringify(record).includes(KEY));
  assert.equal(await runCli(args, options), 1); assert.equal(count, 1);
  assert.ok(!captured.lines.join('\n').includes(KEY));
});

test('download fetches the successful service URL without forwarding auth, and preserves existing files', async t => {
  const {runCli} = api(), cwd = await workspace(t), captured = logs(), calls = [], bytes = glb();
  const options = {cwd, env: {TRIPO_API_KEY: KEY}, ...captured, fetchImpl: async (url, init) => {
    calls.push({url, init});
    if (url.startsWith(BASE)) return ok({status: 'success', output: {model_url: 'https://cdn.tripo3d.ai/output/chair.glb'}});
    assert.equal(init.headers.Authorization, undefined); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    return new Response(bytes);
  }};
  assert.equal(await runCli(['download', 'task_chair', '--output', 'chair.glb'], options), 0);
  assert.deepEqual(await readFile(join(cwd, 'chair.glb')), bytes);
  assert.equal(calls.length, 2);
  assert.equal(await runCli(['download', 'task_chair', '--output', 'chair.glb'], options), 1);
  assert.equal(calls.length, 2, 'existing files should be rejected before requesting a download');
  assert.equal(await runCli(['download', 'task_chair', '--output', 'chair.glb', '--overwrite'], options), 0);
  assert.equal(calls.length, 4);
  assert.deepEqual(await readdir(cwd), ['chair.glb']);
  const brokenOptions = {...options, fetchImpl: async url => url.startsWith(BASE) ?
    ok({status: 'success', output: {model_url: 'https://cdn.tripo3d.ai/model.glb'}}) : new Response('bad file')};
  assert.equal(await runCli(['download', 'task_chair', '--output', 'chair.glb', '--overwrite'], brokenOptions), 1);
  assert.deepEqual(await readFile(join(cwd, 'chair.glb')), bytes, 'a bad replacement must preserve the previous valid artifact');
  assert.deepEqual(await readdir(cwd), ['chair.glb'], 'failed downloads leave no partial files');
});

test('download rejects unfinished tasks, non-HTTPS URLs, invalid GLB and advertised/streamed oversize', async () => {
  const {createTripoClient, MAX_GLB_BYTES} = api();
  for (const status of ['queued', 'running', 'failed', 'cancelled']) {
    let calls = 0;
    const client = createTripoClient({apiKey: KEY, fetchImpl: async () => {calls++; return ok({status});}});
    await assert.rejects(client.download('task_a'), new RegExp(status));
    assert.equal(calls, 1);
  }
  for (const model_url of ['http://cdn.tripo3d.ai/model.glb', 'https://user:pass@cdn.tripo3d.ai/model.glb', 'file:///tmp/model.glb']) {
    let calls = 0;
    const client = createTripoClient({apiKey: KEY, fetchImpl: async () => {calls++; return ok({status: 'success', output: {model_url}});}});
    await assert.rejects(client.download('task_a'), /HTTPS|credentials/i); assert.equal(calls, 1);
  }
  const invalidLength = glb(); invalidLength.writeUInt32LE(999, 8);
  const highBitMagic = glb(); highBitMagic[0] |= 0x80;
  for (const payload of [
    () => new Response('this is not GLB'),
    () => new Response(invalidLength),
    () => new Response(highBitMagic),
    () => new Response(glb(), {headers: {'Content-Length': String(MAX_GLB_BYTES + 1)}}),
    () => new Response(new ReadableStream({start(controller) {
      controller.enqueue(new Uint8Array(MAX_GLB_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close();
    }})),
  ]) {
    const client = createTripoClient({apiKey: KEY, fetchImpl: async url => url.startsWith(BASE) ?
      ok({status: 'success', output: {model_url: 'https://cdn.tripo3d.ai/model.glb'}}) : payload()});
    await assert.rejects(client.download('task_a'), /GLB|20 MB|limit/i);
  }
});

test('help and argument errors need no credentials and do not make requests', async () => {
  const {runCli} = api(), captured = logs();
  const options = {...captured, env: {}, readFileImpl() {assert.fail('help/errors must not read dotenv');},
    fetchImpl() {assert.fail('help/errors must not make requests');}};
  assert.equal(await runCli(['--help'], options), 0);
  assert.equal(await runCli(['generate', '--prompt-file', 'missing'], options), 1);
  assert.equal(await runCli(['status', 'task_a', '--unexpected'], options), 1);
  assert.match(captured.lines.join('\n'), /balance/);
});
