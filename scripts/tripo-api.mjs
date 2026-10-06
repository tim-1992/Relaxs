import {readFile, writeFile, mkdir, open, lstat, link, rename, unlink, readdir} from 'node:fs/promises';
import {resolve, dirname, extname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

export const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3';
export const MAX_GLB_BYTES = 20 * 1024 * 1024;
const MODEL_OPTIONS = Object.freeze({model: 'P1-20260311', face_limit: 3000, texture: true, pbr: true});
const REALISTIC_OPTIONS = Object.freeze({
  model:'v3.1-20260211',face_limit:40000,texture:true,pbr:true,
  geometry_quality:'detailed',texture_quality:'detailed',
  texture_version:'v3.5-20260815',delight:true,auto_size:true,
  negative_prompt:'cartoon, toy, chibi, low-poly, stylized, pastel, blurry texture, baked shadows, plinth, pedestal, background, merged limbs',
});
function modelOptions(quality = 'trial') {
  if (quality === 'trial') return MODEL_OPTIONS;
  if (quality === 'realistic') return REALISTIC_OPTIONS;
  throw new Error('Unknown model quality; use trial or realistic.');
}
const JOURNAL = 'tripo-task.json';
const HELP = `Usage: node scripts/tripo-api.mjs <command>
  balance
  generate --prompt-file <path> --output <new-artifact-directory> [--quality realistic]
  rig-check <task-id> --output <new-artifact-directory>
  rig <task-id> --output <new-artifact-directory>
  sync --output <artifact-root>
  status <task-id>
  download <task-id> --output <file.glb> [--overwrite]

Reads TRIPO_API_KEY from the environment, then .env.local in the working directory.
generate submits once and saves tripo-task.json; never rerun it to poll a task.
Use status with the saved task_id. Existing generation records are never overwritten.
GET/POST requests time out after 30 seconds; no requests are automatically retried.
Downloads accept HTTPS without redirects, validate GLB v2, and allow at most 20 MB.`;

function normalizeKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) throw new Error('TRIPO_API_KEY is missing. Set it in the environment or .env.local.');
  if (key.length > 4096 || !/^[A-Za-z0-9._~+/-]+=*$/.test(key) || /^Bearer$/i.test(key)) {
    throw new Error('TRIPO_API_KEY must be a raw token, without Bearer, quotes, or whitespace.');
  }
  return key;
}

// No environment or filesystem access occurs when importing this module.
export async function loadApiKey({env = process.env, cwd = process.cwd(), readFileImpl = readFile} = {}) {
  if (env.TRIPO_API_KEY?.trim()) return normalizeKey(env.TRIPO_API_KEY);
  let content;
  try {content = await readFileImpl(join(cwd, '.env.local'), 'utf8');}
  catch (error) {
    if (error.code === 'ENOENT') return normalizeKey('');
    throw new Error('Could not read .env.local.');
  }
  const assignment = /^\s*(?:export\s+)?TRIPO_API_KEY[ \t]*=[ \t]*(.*)$/m.exec(content);
  let value = assignment?.[1]?.trim() ?? '';
  if (value.startsWith('"') || value.startsWith("'")) {
    const quoted = /^(["'])(.*?)\1(?:\s*#.*)?$/.exec(value);
    if (!quoted) throw new Error('TRIPO_API_KEY has invalid quoted format in .env.local.');
    value = quoted[2];
  } else value = value.replace(/\s+#.*$/, '').trim();
  // Parse literals only: no shell execution, expansion, or dotenv dependency.
  return normalizeKey(value);
}

function safeText(value, key) {
  let text = String(value);
  if (key) {
    text = text.split(key).join('[REDACTED]');
    text = text.split(encodeURIComponent(key)).join('[REDACTED]');
  }
  return text.replace(/Bearer\s+[^\s"',;\\]+/gi, 'Bearer [REDACTED]');
}

function sanitize(value, key) {
  if (typeof value === 'string') return safeText(value, key);
  if (Array.isArray(value)) return value.map(item => sanitize(item, key));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [
    safeText(name, key),
    /^(authorization|api[_-]?key|tripo_api_key|access[_-]?token|secret)$/i.test(name) ? '[REDACTED]' : sanitize(item, key),
  ]));
}

function taskId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('Invalid task ID; use the task_id returned by generation.');
  }
  return value;
}

function validPrompt(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Prompt must not be empty.');
  const prompt = value.trim();
  if ([...prompt].length > 1024) throw new Error('Prompt exceeds the 1024 character limit.');
  return prompt;
}

async function boundedBody(response, limit, label) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`${label} exceeds the ${limit === MAX_GLB_BYTES ? '20 MB' : '1 MB'} limit.`);
  }
  if (!response.body) throw new Error(`${label} response body is empty.`);
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} exceeds the ${limit === MAX_GLB_BYTES ? '20 MB' : '1 MB'} limit.`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {reader.releaseLock();}
}

export function createTripoClient({apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30_000, maxModelBytes=MAX_GLB_BYTES} = {}) {
  const key = normalizeKey(apiKey);
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required (Node.js 18+).');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  if (!Number.isFinite(maxModelBytes) || maxModelBytes<1 || maxModelBytes>64*1024*1024) throw new Error('Invalid model byte limit.');

  async function timed(label, operation) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`${label} timed out after ${timeoutMs} ms; request was not retried.`));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      // Do not attach a raw cause or Response: both can retain request headers.
      throw new Error(safeText(error?.message || `${label} request failed.`, key));
    } finally {clearTimeout(timer);}
  }

  async function request(path, method = 'GET', body) {
    return timed(`Tripo ${method}`, async signal => {
      const response = await fetchImpl(`${TRIPO_BASE_URL}${path}`, {
        method, redirect: 'error', signal,
        headers: {Authorization: `Bearer ${key}`, Accept: 'application/json',
          ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`Tripo HTTP ${response.status}${response.status === 401 || response.status === 403 ? ': check the API key and permissions' : ''}. Request was not retried.`);
      }
      const bytes = await boundedBody(response, 1024 * 1024, 'API JSON');
      let envelope;
      try {envelope = JSON.parse(bytes.toString('utf8'));}
      catch {throw new Error('Tripo returned invalid JSON. Request was not retried.');}
      if (envelope?.code !== 0) {
        const code = typeof envelope?.code === 'number' ? envelope.code : 'missing';
        const message = typeof envelope?.message === 'string' ? safeText(envelope.message, key).slice(0, 300) : 'request failed';
        throw new Error(`Tripo API code ${code}: ${message}. Request was not retried.`);
      }
      if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new Error('Tripo JSON response is missing task/account data.');
      }
      return sanitize(envelope.data, key);
    });
  }

  const client = {
    balance: () => request('/account/balance'),
    status: async id => request(`/tasks/${taskId(id)}`),
    async generate(value, {quality='trial'} = {}) {
      const prompt = validPrompt(value);
      if (prompt.includes(key)) throw new Error('Prompt contains the API credential; remove it before generation.');
      const result = await request('/generation/text-to-model', 'POST', {prompt, ...modelOptions(quality)});
      taskId(result.task_id);
      return result;
    },
    async rigCheck(id) {
      const result = await request('/animations/rig-check','POST',{input:taskId(id)});
      taskId(result.task_id); return result;
    },
    async rig(id) {
      const result = await request('/animations/rig','POST',{
        input:taskId(id),model:'v1.0-20240301',rig_type:'biped',spec:'mixamo',out_format:'glb',
      });
      taskId(result.task_id); return result;
    },
    async download(id) {
      const task = await client.status(id);
      if (task.status !== 'success') throw new Error(`Task is ${task.status ?? 'unknown'}; download requires success. Use status again later.`);
      let url;
      try {url = new URL(task.output?.model_url);}
      catch {throw new Error('Task has no valid HTTPS model_url.');}
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Model download requires an HTTPS URL without embedded credentials.');
      }
      return timed('Model download', async signal => {
        // A new, unauthenticated request: never forward API headers to a CDN.
        const response = await fetchImpl(url.href, {
          method: 'GET', headers: {Accept: 'model/gltf-binary'}, redirect: 'error', signal,
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`Model download HTTP ${response.status}.`);
        }
        const bytes = await boundedBody(response, maxModelBytes, 'GLB download');
        if (bytes.length < 12 || bytes.readUInt32LE(0) !== 0x46546c67 ||
            bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
          throw new Error('Invalid GLB header, version, or declared byte length.');
        }
        return bytes;
      });
    },
  };
  return client;
}

function parseArgs(argv) {
  if (!argv.length || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) return {command: 'help'};
  const [command, ...rest] = argv;
  if (!['balance', 'generate', 'status', 'download','rig-check','rig','sync'].includes(command)) throw new Error('Unknown command. Use --help.');
  const parsed = {command}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--overwrite' && command === 'download' && !parsed.overwrite) {parsed.overwrite = true; continue;}
    const name = arg === '--prompt-file' && command === 'generate' ? 'promptFile' :
      arg === '--output' && ['generate', 'download','rig-check','rig','sync'].includes(command) ? 'output' :
      arg === '--quality' && command === 'generate' ? 'quality' : null;
    if (name) {
      if (parsed[name] || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error('Missing or duplicate option value. Use --help.');
      parsed[name] = rest[++i];
    } else if (arg.startsWith('-')) throw new Error('Unsupported option. Use --help.');
    else positional.push(arg);
  }
  if (['status', 'download','rig-check','rig'].includes(command)) {
    if (positional.length !== 1) throw new Error('Exactly one task ID is required.');
    parsed.taskId = taskId(positional[0]);
  } else if (positional.length) throw new Error('Unexpected argument. Use --help.');
  if (command === 'generate' && (!parsed.promptFile || !parsed.output)) throw new Error('generate requires --prompt-file and --output.');
  if (command === 'generate') modelOptions(parsed.quality);
  if (['rig-check','rig'].includes(command) && !parsed.output) throw new Error('Rig commands require an exclusive --output directory.');
  if (command === 'sync' && !parsed.output) throw new Error('sync requires an artifact root.');
  if (command === 'download' && (!parsed.output || extname(parsed.output).toLowerCase() !== '.glb')) {
    throw new Error('download requires --output <file.glb>.');
  }
  return parsed;
}

async function syncRecorded(client, directory) {
  const results = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const folder = join(directory,entry.name);
    let record;
    try {record = JSON.parse(await readFile(join(folder,JOURNAL),'utf8'));}
    catch {continue;}
    if (!record.task_id) continue;
    try {
      const task = await client.status(record.task_id);
      const result = {name:entry.name,task_id:record.task_id,type:task.type,status:task.status,progress:task.progress,
        model:record.model,credits_consumed:task.credits_consumed,created_at:task.created_at,completed_at:task.completed_at};
      if (task.output?.riggable !== undefined) {
        result.riggable=task.output.riggable; result.rig_type=task.output.rig_type;
      }
      await writeFile(join(folder,'tripo-result.json'),JSON.stringify(result,null,2));
      if (task.status === 'success' && task.output?.model_url) {
        const destination = join(folder,'model.glb');
        let exists=false;
        try {exists=(await lstat(destination)).isFile();} catch {}
        if (!exists) await saveDownload(destination,await client.download(record.task_id),false);
        result.bytes=(await lstat(destination)).size;
      }
      results.push(result);
    } catch (error) {results.push({name:entry.name,error:error.message});}
  }
  return results;
}

async function generateRecorded(client, prompt, directory, key, quality='trial') {
  await mkdir(directory, {recursive: true});
  const path = join(directory, JOURNAL);
  let file;
  try {file = await open(path, 'wx', 0o600);}
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Generation record already exists. Use its task_id with status; choose a new output directory only for an intentional new generation.');
    throw new Error('Cannot create generation record; no POST was sent.');
  }
  let record = {
    status: 'submitting', created_at: new Date().toISOString(), ...modelOptions(quality),
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
  };
  async function save() {
    const bytes = Buffer.from(`${JSON.stringify(sanitize(record, key), null, 2)}\n`);
    await file.truncate(0); await file.write(bytes, 0, bytes.length, 0); await file.sync();
  }
  try {
    await save();
    let result;
    try {result = await client.generate(prompt,{quality});}
    catch (error) {
      record = {...record, status: 'submission-unconfirmed', error: safeText(error.message, key)};
      try {await save();} catch {}
      throw new Error(`${safeText(error.message, key)} Submission outcome is unconfirmed; do not submit again automatically. Check the saved record and Tripo task history.`);
    }
    record = {...record, task_id: result.task_id, status: 'submitted'};
    try {await save();}
    catch {throw new Error(`Task ${result.task_id} was created but metadata could not be saved. Recover with status ${result.task_id}; do not generate again.`);}
    return {...record, metadata_file: path};
  } finally {await file.close();}
}

async function rigRecorded(client, source, directory, key, check) {
  await mkdir(directory,{recursive:true});
  const path = join(directory,JOURNAL);
  const record = {status:'submitting',created_at:new Date().toISOString(),input:source,type:check?'rig-check':'rig'};
  await writeFile(path,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
  try {
    const result = await (check ? client.rigCheck(source) : client.rig(source));
    Object.assign(record,{status:'submitted',task_id:result.task_id});
    await writeFile(path,JSON.stringify(sanitize(record,key),null,2));
    return record;
  } catch (error) {
    Object.assign(record,{status:'submission-unconfirmed',error:safeText(error.message,key)});
    await writeFile(path,JSON.stringify(record,null,2)).catch(()=>{});
    throw error;
  }
}

async function checkDestination(path, overwrite) {
  try {
    const entry = await lstat(path);
    if (!overwrite) throw new Error('Output already exists; use --overwrite to replace it.');
    if (!entry.isFile()) throw new Error('Output must be a regular file, not a directory or symlink.');
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
}

async function saveDownload(path, bytes, overwrite) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, {flag: 'wx', mode: 0o600});
    if (overwrite) await rename(temporary, path);
    else await link(temporary, path); // Exclusive publish; cannot clobber a racing writer.
  } finally {await unlink(temporary).catch(error => {if (error.code !== 'ENOENT') throw error;});}
}

export async function runCli(argv, {
  env = process.env, cwd = process.cwd(), fetchImpl = globalThis.fetch, readFileImpl = readFile,
  stdout = console.log, stderr = console.error, timeoutMs = 30_000,
} = {}) {
  let key;
  try {
    const args = parseArgs(argv);
    if (args.command === 'help') {stdout(HELP); return 0;}
    key = await loadApiKey({env, cwd, readFileImpl});
    const client = createTripoClient({apiKey: key, fetchImpl, timeoutMs,maxModelBytes:args.command==='sync'?64*1024*1024:MAX_GLB_BYTES});
    let result;
    if (args.command === 'balance') result = await client.balance();
    if (args.command === 'status') result = await client.status(args.taskId);
    if (args.command === 'sync') result = await syncRecorded(client,resolve(cwd,args.output));
    if (args.command === 'generate') {
      const prompt = validPrompt(await readFile(resolve(cwd, args.promptFile), 'utf8'));
      result = await generateRecorded(client, prompt, resolve(cwd, args.output), key, args.quality);
    }
    if (['rig-check','rig'].includes(args.command)) result = await rigRecorded(client,args.taskId,resolve(cwd,args.output),key,args.command==='rig-check');
    if (args.command === 'download') {
      const destination = resolve(cwd, args.output);
      await checkDestination(destination, args.overwrite);
      const bytes = await client.download(args.taskId);
      await saveDownload(destination, bytes, args.overwrite);
      result = {task_id: args.taskId, output: destination, bytes: bytes.length};
    }
    stdout(JSON.stringify(sanitize(result, key), null, 2));
    return 0;
  } catch (error) {
    stderr(safeText(error?.message || 'Tripo command failed.', key));
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
