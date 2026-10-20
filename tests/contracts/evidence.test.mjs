import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvidence} from '../../lib/contracts/evidence.mjs';
const evidence = () => ({testId:'EVID-01',status:'PASS',scope:'unit',sourceRevision:'a'.repeat(40),lockfileSha256:'b'.repeat(64),method:'node --test',environment:'development',startedAt:'2026-10-20T12:00:00Z',finishedAt:'2026-10-20T12:00:01Z',evidenceRefs:['docs/evidence/test.json'],observed:{tests:1}});
test('evidence requires execution identity, clock, observation and references for PASS', () => {
  assert.equal(validateEvidence(evidence()).status, 'PASS');
  for (const key of ['sourceRevision','startedAt','finishedAt','lockfileSha256']) assert.throws(() => validateEvidence({...evidence(),[key]:null}));
  assert.throws(() => validateEvidence({...evidence(),evidenceRefs:[]}));
  assert.throws(() => validateEvidence({...evidence(),observed:{}}));
  assert.throws(() => validateEvidence({...evidence(),finishedAt:'2026-10-19T00:00:00Z'}));
});
test('unexecuted or blocked evidence never becomes PASS', () => {
  assert.equal(validateEvidence({...evidence(),status:'NOT_RUN',sourceRevision:null,startedAt:null,finishedAt:null,evidenceRefs:[],observed:{}}).status,'NOT_RUN');
  assert.throws(() => validateEvidence({...evidence(),status:'SKIPPED'}));
  assert.throws(() => validateEvidence({...evidence(),status:'BLOCKED'}));
  assert.equal(validateEvidence({...evidence(),status:'BLOCKED',reason:'OAuth provisioning unavailable'}).status,'BLOCKED');
});
