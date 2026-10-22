import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateV3Routing} from '../../scripts/evaluate-v3-routing.mjs';

test('frozen V3 gold set: >=90% primary skill, >=95% top-3, >=90% profile, trivial bypass',async()=>{
  const r=await evaluateV3Routing();
  assert.ok(r.taskCount>=40);
  assert.ok(r.plannerAvailable);
  const failures=JSON.stringify(r.failures.map(f=>({id:f.id,selected:f.selected,profile:f.profile})));
  assert.ok(r.skillTop1Percent>=90,failures);
  assert.ok(r.skillTop3Percent>=95,failures);
  assert.ok(r.profileTop1Percent>=90,failures);
  assert.ok(r.bypassCorrect);
});
