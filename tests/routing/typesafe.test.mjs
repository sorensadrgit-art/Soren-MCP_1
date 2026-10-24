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

test('TypeSafe choices follow the current curated skill roster, not four hardcoded names',async()=>{
  const decision=await classifyPublicTask('gsap',{
    env:enabled,
    candidates:[{name:'gsap-motion'},{name:'react-three-fiber'},{name:'unknown-unapproved'}],
    fetcher:async(url,opts)=>{
      const criteria=JSON.parse(opts.body).questions.skill.criteria;
      assert.ok(Object.hasOwn(criteria,'gsap-motion'));
      assert.ok(Object.hasOwn(criteria,'react-three-fiber'));
      assert.ok(Object.hasOwn(criteria,'none'));
      assert.equal(Object.hasOwn(criteria,'unknown-unapproved'),false);
      return reply('gsap-motion',.96);
    },
  });
  assert.deepEqual(decision,{status:'ok',choice:'gsap-motion',confidence:.96});
});
test('TypeSafe skips a caller-supplied roster with no approved candidates',async()=>{
  let calls=0;
  const decision=await classifyPublicTask('gsap',{
    env:enabled,candidates:[{name:'unapproved'}],
    fetcher:()=>{calls++;throw Error('should not call');},
  });
  assert.equal(decision.status,'no_eligible_skills');
  assert.equal(calls,0);
});

test('applyJevRouting handles missing, null, or undefined decision objects', () => {
  for (const invalidDecision of [null, undefined, {}]) {
    const result = applyJevRouting(sample, invalidDecision);
    assert.equal(result.primary.name, sample.primary.name);
    assert.deepEqual(result.recommendations, sample.recommendations);
    assert.deepEqual(result.decisionEngine, { name: 'typesafe-jev', status: 'unavailable' });
  }
});

test('applyJevRouting handles non-ok status codes in decision object', () => {
  for (const status of ['disabled', 'not_configured', 'unsafe_input', 'no_public_terms', 'no_eligible_skills', 'invalid_response', 'custom_error']) {
    const result = applyJevRouting(sample, { status });
    assert.deepEqual(result.recommendations, sample.recommendations);
    assert.deepEqual(result.decisionEngine, { name: 'typesafe-jev', status });
  }
});

test('applyJevRouting respects preferredSkills array option when populated vs empty', () => {
  // Empty preferredSkills should not block routing
  const resultWithEmpty = applyJevRouting(sample, { status: 'ok', choice: 'motion-systems', confidence: 0.95 }, { preferredSkills: [] });
  assert.equal(resultWithEmpty.primary.name, 'motion-systems');
  assert.equal(resultWithEmpty.decisionEngine.status, 'applied');

  // Populated preferredSkills should preserve explicit preference
  const resultWithPreferred = applyJevRouting(sample, { status: 'ok', choice: 'motion-systems', confidence: 0.95 }, { preferredSkills: ['mcp-integration'] });
  assert.equal(resultWithPreferred.primary.name, sample.primary.name);
  assert.equal(resultWithPreferred.decisionEngine.status, 'explicit_preference_preserved');
});

test('applyJevRouting edge cases for choice = "none", low confidence threshold (0.85), and ineligible candidate', () => {
  // Choice "none"
  const noneRes = applyJevRouting(sample, { status: 'ok', choice: 'none', confidence: 0.99 });
  assert.equal(noneRes.decisionEngine.status, 'no_match');

  // Confidence exactly at threshold 0.85
  const exactThresholdRes = applyJevRouting(sample, { status: 'ok', choice: 'motion-systems', confidence: 0.85 });
  assert.equal(exactThresholdRes.decisionEngine.status, 'applied');

  // Confidence just below threshold 0.849, NaN, null, string, infinity
  for (const conf of [0.849, 0, -1, NaN, null, undefined, '0.9', Infinity]) {
    const lowConfRes = applyJevRouting(sample, { status: 'ok', choice: 'motion-systems', confidence: conf });
    assert.equal(lowConfRes.decisionEngine.status, 'low_confidence');
  }

  // Choice not found in base.recommendations
  const missingChoiceRes = applyJevRouting(sample, { status: 'ok', choice: 'non-existent-skill', confidence: 0.95 });
  assert.equal(missingChoiceRes.decisionEngine.status, 'ineligible');
});

test('applyJevRouting successfully reorders recommendations and maintains immutability', () => {
  const multiSample = {
    ...sample,
    recommendations: [
      { name: 'mcp-integration', score: 8 },
      { name: 'accessibility', score: 6 },
      { name: 'motion-systems', score: 5 },
      { name: 'skill-orchestration', score: 4 },
    ]
  };

  const originalSampleCopy = JSON.parse(JSON.stringify(multiSample));
  const decision = { status: 'ok', choice: 'motion-systems', confidence: 0.92 };

  const result = applyJevRouting(multiSample, decision);

  // Check reordering: selected skill comes first, others preserve relative order
  assert.equal(result.primary.name, 'motion-systems');
  assert.deepEqual(result.recommendations.map(r => r.name), [
    'motion-systems',
    'mcp-integration',
    'accessibility',
    'skill-orchestration',
  ]);
  assert.deepEqual(result.decisionEngine, {
    name: 'typesafe-jev',
    status: 'applied',
    choice: 'motion-systems',
    confidence: 0.92,
  });

  // Verify immutability of original base object
  assert.deepEqual(multiSample, originalSampleCopy);
});
