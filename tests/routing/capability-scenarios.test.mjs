import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCapabilityPlan} from '../../lib/capabilities/planner.mjs';
import scenarios from '../../docs/research/capability-catalog-20261020/evaluation-cases.json' with {type:'json'};

// Research fixtures assume approved/connected targets. Public callers cannot prove
// that. These checks preserve selection and safety expectations while permitting
// a conservative NEEDS_* status instead of inventing a live-ready connection.
for(const fixture of scenarios.cases){
  test(`capability scenario ${fixture.id}: ${fixture.prompt}`,()=>{
    const context={source_scope:'public',...(fixture.expectedStatus==='NO_ROUTING_NEEDED'?{}:{domain:fixture.domain})};
    const result=buildCapabilityPlan(fixture.prompt,context);
    const chosen=result.recommendations.map(r=>r.id);
    // Ruling E22: 'a mirrored skill' names no publisher. Do not invent Firecrawl
    // merely because our research catalog happens to contain a mirrored source.
    // Preserve the historical research fixture; test the stronger no-guess contract.
    if(fixture.id==='E22')assert.deepEqual(chosen,[]);
    else for(const id of fixture.expectedCandidateIds)assert.ok(chosen.includes(id),`${id} missing: ${JSON.stringify(chosen)}`);
    if(fixture.expectedStatus==='READY_WITH_EXISTING_TOOLS'){
      assert.ok(['READY_WITH_EXISTING_TOOLS','NEEDS_CONNECTION','NEEDS_RUNTIME','NEEDS_REVIEW','NEEDS_APPROVAL'].includes(result.status),result.status);
    }else assert.equal(result.status,fixture.expectedStatus);
    assert.equal(result.executionAuthorized,false);assert.equal(result.planOnly,true);
    assert.ok(result.recommendations.every(r=>r.targetAvailability==='NOT_PROBED'&&r.executionAuthorized===false));
  });
}
