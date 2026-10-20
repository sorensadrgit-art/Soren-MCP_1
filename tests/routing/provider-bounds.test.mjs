import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverSkills,inspectCandidate,routeTaskFederated} from '../../lib/federation.mjs';
test('provider timeouts, oversized chunked responses, malformed metadata and redirects stay isolated',async()=>{
  for(const fetcher of [async()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(650001));controller.close();}})),async()=>new Response('invalid-json'),async()=>{const response=Response.json({});Object.defineProperty(response,'redirected',{value:true});return response;},async()=>new Response('',{status:429})]){
    const start=performance.now(),result=await discoverSkills('gsap',{providers:['skillsmp'],fetcher,timeoutMs:10});assert.ok(performance.now()-start<500);assert.equal(result.count,0);assert.ok(['unavailable','rate_limited'].includes(result.providers.skillsmp.status));
  }
});
test('instruction streams enforce 60000 bytes before buffering',async()=>{
  await assert.rejects(()=>inspectCandidate('anthropic','example',{fetcher:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(60001));controller.close();}}))}),/RESPONSE_TOO_LARGE/);
});
test('opt-in auto avoids remote calls for strong approved coverage and honors explicit choices',async()=>{
  const result=await routeTaskFederated('GSAP WebGL camera','generic',{discovery:'auto',fetcher:()=>assert.fail('remote search unnecessary')});assert.equal(result.discoveryMode,'auto');assert.equal(result.primary.name,'motion-systems');
  const chosen=await routeTaskFederated('GSAP WebGL camera','generic',{discovery:'auto',preferredSkills:['accessibility'],fetcher:()=>assert.fail()});assert.equal(chosen.primary.name,'accessibility');
});
