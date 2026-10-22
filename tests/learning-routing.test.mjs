import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTask, readSkill, SKILLS } from '../lib/catalog.mjs';

test('learning loop uses the existing read-only catalog without duplicate entries', () => {
  assert.equal(SKILLS.filter(s => s.name === 'soren-learning-loop').length, 1);
  const result = routeTask('soren-learning-loop persistent learning solved problems failure lessons');
  assert.equal(result.primary.name, 'soren-learning-loop');
  assert.equal(result.primary.uri, 'skill://soren-learning-loop/SKILL.md');
  assert.match(readSkill(result.primary.name), /human review/i);
  assert.match(result.policy, /no automatic install or execution/);
});
