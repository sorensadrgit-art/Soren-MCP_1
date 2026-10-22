import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateRouting,effectiveExpectations} from '../../scripts/evaluate-routing.mjs';
const raw=fs.readFileSync(new URL('./evaluation.json',import.meta.url),'utf8');
const fixture=JSON.parse(raw);
const expectations=JSON.parse(fs.readFileSync(new URL('./evaluation-expectations.json',import.meta.url),'utf8'));

test('frozen 60-case routing regression preserves choices, bypasses and concurrency',async()=>{
  const result=await evaluateRouting();assert.equal(result.taskCount,60);assert.equal(result.passed,60,JSON.stringify(result.results.filter(x=>!x.passed)));assert.ok(result.explicitChoicesPreserved);assert.ok(result.bypassCorrect);assert.ok(result.concurrentLocal.isolated);assert.equal(result.federation.upstreamFixtureCalls,30);assert.equal(result.federation.liveUpstreamRequests,0);
});
test('versioned expectations: ROUTE-056 is revised from contract 2.5.0 only, and the frozen label is still reported',async()=>{
  const current=await evaluateRouting();
  assert.deepEqual(current.revisionsApplied,['ROUTE-056']);
  assert.deepEqual(current.revisionApprovals,{'ROUTE-056':'owner_approved'});
  assert.equal(current.frozenLabelPassed,59);
  const route056=current.results.find(r=>r.id==='ROUTE-056');
  assert.equal(route056.revised,true);assert.equal(route056.frozenLabelPassed,false);
  assert.ok(!route056.selected.includes('motion-systems'),'an unavailable skill must never be recommended');
  const older=effectiveExpectations(raw,fixture,expectations,'2.4.0');
  assert.deepEqual(older.applied,[]);
  assert.equal(older.tasks.find(t=>t.id==='ROUTE-056').bypass,true);
});
test('editing the frozen fixture invalidates the revisions instead of silently re-labelling',()=>{
  const edited=raw.replace('GSAP WebGL camera','GSAP WebGL camera rig');
  assert.throws(()=>effectiveExpectations(edited,JSON.parse(edited),expectations),/routing_fixture_changed_review_expectations/);
  const wrongFrozen={...expectations,revisions:[{...expectations.revisions[0],frozen:{bypass:false,acceptableTopThree:[]}}]};
  assert.throws(()=>effectiveExpectations(raw,fixture,wrongFrozen),/revision_frozen_mismatch/);
});
test('a revision without a recorded approval is rejected',()=>{
  const {approval,...unapproved}=expectations.revisions[0];
  assert.throws(()=>effectiveExpectations(raw,fixture,{...expectations,revisions:[unapproved]}),/revision_approval_missing:ROUTE-056/);
  const pending={...expectations.revisions[0],approval:{...approval,status:'pending'}};
  assert.throws(()=>effectiveExpectations(raw,fixture,{...expectations,revisions:[pending]}),/revision_approval_missing/);
});
