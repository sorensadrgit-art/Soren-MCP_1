import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRouting} from '../../scripts/evaluate-routing.mjs';
test('frozen 60-case routing regression preserves choices, bypasses and concurrency',async()=>{
  const result=await evaluateRouting();assert.equal(result.taskCount,60);assert.ok(result.topThreePercent>=90,JSON.stringify(result.results.filter(x=>!x.passed)));assert.ok(result.explicitChoicesPreserved);assert.ok(result.bypassCorrect);assert.ok(result.concurrentLocal.isolated);assert.equal(result.federation.upstreamFixtureCalls,30);assert.equal(result.federation.liveUpstreamRequests,0);
});
