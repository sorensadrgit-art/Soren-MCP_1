import test from 'node:test';
import assert from 'node:assert/strict';
import {adviseSpecialist,triageLearning,verifyAgentClaim,typesafeToolsEnabled} from '../../lib/typesafe/advisory.mjs';

const enabled={TYPESAFE_JEV_ENABLED:'true',TYPESAFE_API_KEY:'fixture-only-key'};
function mock(answers,inspect=()=>{}) {
  return async (url,options)=>{
    assert.equal(url,'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer fixture-only-key');
    const payload=JSON.parse(options.body);
    assert.equal(payload.model,'jev-latest');
    assert.ok(!JSON.stringify(payload).includes('fixture-only-key'));
    inspect(payload);
    return Response.json({model:'jev-latest',answers,usage:{input_tokens:100,output_tokens:20}});
  };
}
const choice=(value,confidence=.95)=>({type:'choice',choice:value,confidence,probabilities:{[value]:confidence}});
const agentOptions=[
  {id:'frontend-agent',description:'Implements React interfaces and GSAP animations'},
  {id:'qa-agent',description:'Runs Playwright tests, diagnostics and accessibility checks'},
];

test('new tool surface is doubly gated and disabled by default',()=>{
  assert.equal(typesafeToolsEnabled({SOREN_V3_TOOLS:'1'}),false);
  assert.equal(typesafeToolsEnabled({SOREN_TYPESAFE_TOOLS:'1'}),false);
  assert.equal(typesafeToolsEnabled({SOREN_V3_TOOLS:'1',SOREN_TYPESAFE_TOOLS:'1'}),true);
});

test('no external call without affirmative public-content confirmation',async()=>{
  let calls=0; const fetcher=()=>{calls++;throw Error('unexpected remote request');};
  const a=await adviseSpecialist('Implement a GSAP website',agentOptions,{env:enabled,fetcher});
  const b=await triageLearning('Learned a stable project build command',['repo tests'],{env:enabled,fetcher});
  const c=await verifyAgentClaim('The test passed','Log says test passed','test passed',{env:enabled,fetcher});
  assert.equal(a.status,'public_confirmation_required');
  assert.equal(b.status,'public_confirmation_required');
  assert.equal(c.status,'public_confirmation_required');
  assert.equal(calls,0);
});

test('no billed call when disabled or API credentials unavailable',async()=>{
  let calls=0; const fetcher=()=>{calls++;throw Error('unexpected network');};
  const base={publicConfirmed:true,fetcher};
  assert.equal((await adviseSpecialist('Improve GSAP landing page',agentOptions,{...base,env:{}})).status,'disabled');
  assert.equal((await adviseSpecialist('Improve GSAP landing page',agentOptions,{...base,env:{TYPESAFE_JEV_ENABLED:'true'}})).status,'not_configured');
  assert.equal(calls,0);
});

test('private-looking content is rejected before any external request',async()=>{
  let calls=0; const fetcher=()=>{calls++;throw Error('unexpected');};
  for(const summary of ['customer@example.com','C:\\Users\\private\\notes','Please send api_key=notarealkey','https://private.example/file']){
    const r=await adviseSpecialist(summary,agentOptions,{env:enabled,publicConfirmed:true,fetcher});
    assert.equal(r.status,'unsafe_input',summary);
  }
  assert.equal(calls,0);
});

test('specialist routing picks only a supplied option; never executes anything',async()=>{
  const result=await adviseSpecialist('Run end to end browser tests',agentOptions,{
    publicConfirmed:true,env:enabled,
    fetcher:mock({specialist:choice('qa-agent')},payload=>{
      assert.deepEqual(Object.keys(payload.questions.specialist.criteria).sort(),['frontend-agent','none','qa-agent']);
      assert.equal(payload.state.public_summary,'Run end to end browser tests');
    }),
  });
  assert.equal(result.status,'suggested');
  assert.equal(result.suggestion,'qa-agent');
  assert.equal(result.advisoryOnly,true);
  assert.equal(result.canExecute,false);
});

test('specialist low confidence or unknown labels are not suggested',async()=>{
  const low=await adviseSpecialist('Check tests',agentOptions,{publicConfirmed:true,env:enabled,fetcher:mock({specialist:choice('qa-agent',.35)})});
  assert.equal(low.status,'review_required');
  assert.equal(low.suggestion,null);
  const unknown=await adviseSpecialist('Check tests',agentOptions,{publicConfirmed:true,env:enabled,fetcher:mock({specialist:choice('fake-agent')})});
  assert.equal(unknown.status,'unavailable');
});

test('memory triage is advisory, provenance-bound, and never stores memory',async()=>{
  const result=await triageLearning('The Vite build outputs files to dist after npm run build',['repo package.json'],{
    publicConfirmed:true,env:enabled,
    fetcher:mock({memory:choice('retain'),durable:{type:'noul',noul:.96}},payload=>{
      assert.ok(payload.questions.memory.criteria.retain);
      assert.equal(payload.questions.durable.type,'noul');
      assert.deepEqual(payload.state.sources,['repo package.json']);
    }),
  });
  assert.equal(result.status,'assessed');
  assert.equal(result.recommendation,'retain');
  assert.equal(result.needsHumanReview,true);
  assert.equal(result.persisted,false);
});
test('memory triage rejects missing provenance and low-confidence auto-retention',async()=>{
  let calls=0;
  assert.equal((await triageLearning('A useful step',[],{publicConfirmed:true,env:enabled,fetcher:()=>{calls++;}})).status,'provenance_required');
  const outcome=await triageLearning('A useful stable step',['repo docs'],{publicConfirmed:true,env:enabled,fetcher:mock({memory:choice('retain',.52),durable:{type:'noul',noul:.95}})});
  assert.equal(outcome.recommendation,'review');
  assert.equal(calls,0);
});

test('claim verification checks quote existence before involving TypeSafe',async()=>{
  let calls=0;
  const outcome=await verifyAgentClaim('Build passes','The build FAILED','build succeeded',{
    publicConfirmed:true,env:enabled,fetcher:()=>{calls++;throw Error('unexpected');}
  });
  assert.equal(outcome.verdict,'fabricated');
  assert.equal(outcome.status,'local_check');
  assert.equal(calls,0);
});

test('supported citations are still advice and unsupported ones require review',async()=>{
  const params={publicConfirmed:true,env:enabled};
  const yes=await verifyAgentClaim('The build passed','Build completed successfully at 12:00','Build completed successfully',{
    ...params,fetcher:mock({evidence:choice('supported')},payload=>{
      assert.equal(payload.questions.evidence.type,'choice');
      assert.equal(payload.state.quote,'Build completed successfully');
    })
  });
  assert.equal(yes.verdict,'supported');assert.equal(yes.status,'assessed');assert.equal(yes.authoritative,false);
  const no=await verifyAgentClaim('The build passed','Build FAILED with exit 1','Build FAILED',{
    ...params,fetcher:mock({evidence:choice('contradicted')})
  });
  assert.equal(no.verdict,'contradicted');assert.equal(no.needsHumanReview,true);
});

test('network and malformed responses fail closed and never expose credentials',async()=>{
  const params={env:enabled,publicConfirmed:true};
  for(const fetcher of [
    async()=>Response.json({error:'secret'},{status:401}),
    async()=>{throw new Error('secret leaked')},
    mock({evidence:{type:'choice',choice:'supported',confidence:42}}),
  ]) {
    const r=await verifyAgentClaim('Testing','The tests passed','tests passed',{...params,fetcher});
    assert.equal(r.status,'unavailable');
    assert.ok(!JSON.stringify(r).includes('secret'));
  }
});
