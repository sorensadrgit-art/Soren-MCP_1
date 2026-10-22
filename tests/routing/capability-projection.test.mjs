import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCapabilityPlan,CapabilityPlanSchema} from '../../lib/capabilities/planner.mjs';

test('the typed output rejects fabricated entity kinds or delivery methods',()=>{
  const p=buildCapabilityPlan('Analyze CSV',{domain:'data'});
  for(const [key,value] of [['kind','executable_supervisor'],['delivery','unrestricted_shell']]){
    const invalid=structuredClone(p);invalid.recommendations[0][key]=value;
    assert.equal(CapabilityPlanSchema.safeParse(invalid).success,false,key);
  }
});
test('private browser research does not retain public discovery/extraction as planned actions',()=>{
  const p=buildCapabilityPlan('Read this login-protected page using my approved browser profile.',{domain:'research',source_scope:'private'});
  assert.equal(p.primaryCapabilityId,'service.playwright');
  assert.equal(p.steps.find(s=>s.id==='discover').status,'SKIPPED');
  assert.equal(p.steps.find(s=>s.id==='extract').status,'SKIPPED');
  assert.equal(p.steps.find(s=>s.id==='interact').status,'CONDITIONAL');
});
test('schema rejects a primary identifier inconsistent with recommendations',()=>{
  const p=buildCapabilityPlan('Analyze CSV',{domain:'data'});p.primaryCapabilityId='service.exa';
  assert.equal(CapabilityPlanSchema.safeParse(p).success,false);
});
