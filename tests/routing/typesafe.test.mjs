import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPublicTask, applyJevRouting} from '../../lib/routing/typesafe.mjs';

const enabled={TYPESAFE_JEV_ENABLED:'true',TYPESAFE_API_KEY:'test-secret-never-print'};
const sample={
  task:'Build a motion-first WebGL MCP dashboard',
  runtime:'codex',
  primary:{name:'mcp-integration',score:8,reasons:['Matched: mcp']},
  recommendations:[
    {name:'mcp-integration',score:8,reasons:['Matched: mcp']},
    {name:'motion-systems',score:5,reasons:['Matched: webgl']},
  ],
  policy:'Read-only curated skills; no automatic install or execution.'
};
const reply=(skill='motion-systems',confidence=.95)=>Response.json({
  model:'jev-1.13.0',
  answers:{skill:{type:'choice',choice:skill,confidence,probabilities:{[skill]:.95}}}
});

test('TypeSafe is off by default and never spends credits without explicit enablement',async()=>{
  let calls=0;
  const result=await classifyPublicTask('mcp webgl',{env:{TYPESAFE_API_KEY:'present'},fetcher:()=>{calls++;throw Error('must not run')}});
  assert.equal(result.status,'disabled');
  assert.equal(calls,0);
});
test('a missing key or unapproved keywords never reach TypeSafe',async()=>{
  let calls=0;
  const fetcher=()=>{calls++;throw Error('must not run')};
  assert.equal((await classifyPublicTask('mcp',{env:{TYPESAFE_JEV_ENABLED:'true'},fetcher})).status,'not_configured');
  assert.equal((await classifyPublicTask('mcp secret_token=XYZ',{env:enabled,fetcher})).status,'unsafe_input');
  assert.equal((await classifyPublicTask('',{env:enabled,fetcher})).status,'no_public_terms');
  assert.equal(calls,0);
});
test('request uses documented System One Choice contract with public keywords only',async()=>{
  const result=await classifyPublicTask('gsap webgl mcp',{
    env:enabled,fetcher:async(url,options)=>{
      assert.equal(url,'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.method,'POST');
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer test-secret-never-print');
      const body=JSON.parse(options.body);
      assert.equal(body.model,'jev-latest');
      assert.deepEqual(body.state,{public_technology_keywords:'gsap webgl mcp'});
      assert.equal(body.questions.skill.type,'choice');
      assert.ok(Object.hasOwn(body.questions.skill.criteria,'none'));
      assert.ok(Object.hasOwn(body.questions.skill.criteria,'motion-systems'));
      assert.ok(!JSON.stringify(body).includes('test-secret'));
      return reply();
    }
  });
  assert.deepEqual(result,{status:'ok',choice:'motion-systems',confidence:.95});
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('a confident approved choice can reorder recommendations without new permissions',()=>{
  const result=applyJevRouting(sample,{status:'ok',choice:'motion-systems',confidence:.95});
  assert.equal(result.primary.name,'motion-systems');
  assert.equal(result.recommendations.length,2);
  assert.equal(result.decisionEngine.status,'applied');
  assert.equal(result.policy,sample.policy);
});
test('low confidence, unknown/ineligible labels and no-match preserve deterministic routing',()=>{
  for(const decision of [
    {status:'ok',choice:'motion-systems',confidence:.3},
    {status:'ok',choice:'accessibility',confidence:1},
    {status:'ok',choice:'none',confidence:1},
    {status:'unavailable'},
  ]){
    const result=applyJevRouting(sample,decision);
    assert.deepEqual(result.recommendations,sample.recommendations);
    assert.equal(result.primary.name,sample.primary.name);
    assert.notEqual(result.decisionEngine.status,'applied');
  }
});
test('explicit preferred skills always override model suggestions',()=>{
  const result=applyJevRouting(sample,{status:'ok',choice:'motion-systems',confidence:1},{preferredSkills:['mcp-integration']});
  assert.equal(result.primary.name,'mcp-integration');
  assert.equal(result.decisionEngine.status,'explicit_preference_preserved');
});
test('malformed upstream responses or HTTP/connection errors fail closed',async()=>{
  for(const fetcher of [
    async()=>Response.json({answers:{skill:{type:'choice',choice:'unapproved-tool',confidence:1}}}),
    async()=>Response.json({answers:{skill:{type:'choice',choice:'motion-systems',confidence:200}}}),
    async()=>Response.json({answers:{skill:{choice:'motion-systems',confidence:.9}}}),
    async()=>Response.json({error:'key invalid'},{status:401}),
    async()=>{throw Error('network secret XYZ')},
  ]){
    const decision=await classifyPublicTask('mcp',{env:enabled,fetcher});
    assert.notEqual(decision.status,'ok');
    assert.ok(!JSON.stringify(decision).includes('secret'));
  }
});
test('raw personal or secret-bearing strings cannot bypass the canonical public keyword boundary',async()=>{
  let network=0;
  const fetcher=async()=>{network++;return reply()};
  for(const candidate of [
    'mcp patient name',
    'mcp customer@example.com',
    'mcp https://example.test/confidential',
    'mcp API_KEY=value',
    'mcp   gsap',
    'C:\\Users\\private\\mcp',
  ]){
    const result=await classifyPublicTask(candidate,{env:enabled,fetcher});
    assert.equal(result.status,'unsafe_input',candidate);
  }
  assert.equal(network,0);
});

test('no network call for a single unactionable signal',async()=>{
  let calls=0;
  const decision=await classifyPublicTask(' ',{env:enabled,fetcher:()=>{calls++;return reply()}});
  assert.equal(decision.status,'no_public_terms');
  assert.equal(calls,0);
});
