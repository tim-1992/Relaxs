import test from 'node:test';
import assert from 'node:assert/strict';
import {createTripoClient} from '../scripts/tripo-api.mjs';

test('realistic generation selects detailed H-series PBR without changing the trial preset', async () => {
  const calls = [];
  const client = createTripoClient({apiKey:'test-key',fetchImpl:async (url,opts) => {
    calls.push({url,body:JSON.parse(opts.body)});
    return new Response(JSON.stringify({code:0,data:{task_id:'demo'}}));
  }});
  await client.generate('A realistic sport motorcycle.', {quality:'realistic'});
  assert.equal(calls[0].body.model,'v3.1-20260211');
  assert.equal(calls[0].body.face_limit,40000);
  assert.equal(calls[0].body.geometry_quality,'detailed');
  assert.equal(calls[0].body.texture_quality,'detailed');
  assert.equal(calls[0].body.pbr,true);
  assert.equal(calls[0].body.compress,undefined);
  await assert.rejects(client.generate('A bike.',{quality:'unknown'}),/quality/i);
  assert.equal(calls.length,1);
});

test('rig detection and rig requests validate source, use known endpoints and preserve result task ID', async () => {
  const calls = [];
  const client = createTripoClient({apiKey:'test-key',fetchImpl:async (url,opts) => {
    calls.push({url,body:JSON.parse(opts.body)});
    return new Response(JSON.stringify({code:0,data:{task_id:'rig-demo'}}));
  }});
  assert.equal((await client.rigCheck('source-demo')).task_id,'rig-demo');
  assert.equal((await client.rig('source-demo')).task_id,'rig-demo');
  assert.match(calls[0].url,/\/animations\/rig-check$/);
  assert.deepEqual(calls[1].body,{input:'source-demo',model:'v1.0-20240301',rig_type:'biped',spec:'mixamo',out_format:'glb'});
  await assert.rejects(client.rig('../escape'),/task ID/);
  assert.equal(calls.length,2);
});
