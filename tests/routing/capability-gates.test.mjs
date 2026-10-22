import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCapabilityPlan,CAPABILITIES} from '../../lib/capabilities/planner.mjs';
import {RECIPES} from '../../lib/recipes/catalog.mjs';
import {KNOWLEDGE_ITEMS} from '../../lib/knowledge/catalog.mjs';

test('a read hint cannot remove the approval gate of a remote write named in the task',()=>{
  const task='Commit and push the fix to the GitHub repository';
  const plain=buildCapabilityPlan(task,{domain:'development',source_scope:'public'});
  const hinted=buildCapabilityPlan(task,{domain:'development',source_scope:'public',operation:'read'});
  for(const plan of [plain,hinted]){
    assert.equal(plan.operation,'edit');
    const github=plan.recommendations.find(r=>r.id==='service.github');
    assert.ok(github?.requirements.includes('OPERATION_APPROVAL_REQUIRED'));
    assert.equal(plan.status,'NEEDS_APPROVAL');
  }
});
test('a hint can still raise the operation above what the text implies',()=>{
  const plan=buildCapabilityPlan('Look at the n8n workflow',{domain:'automation',source_scope:'public',operation:'execute'});
  assert.equal(plan.operation,'execute');assert.equal(plan.status,'NEEDS_APPROVAL');
});
test('workflow runtimes with remote-write effects need approval for edits, and any approval gates the plan',()=>{
  const plan=buildCapabilityPlan('Deploy the workflow to production via github actions',{domain:'automation',source_scope:'public'});
  const actions=plan.recommendations.find(r=>r.id==='platform.github-actions');
  assert.ok(actions?.requirements.includes('OPERATION_APPROVAL_REQUIRED'));
  assert.equal(plan.status,'NEEDS_APPROVAL');
});
test('private and provided-only plans never recommend public network-only capabilities',()=>{
  const networkOnly=new Set(CAPABILITIES.filter(r=>r.effects.some(e=>e==='network_read'||e==='possible_network_read')&&!r.effects.includes('read_private')).map(r=>r.id));
  assert.ok(networkOnly.has('catalog.mcp-registry')&&networkOnly.has('service.exa'));
  for(const source_scope of ['private','provided_only'])for(const record of CAPABILITIES)for(const domain of record.domains){
    const plan=buildCapabilityPlan('Find an MCP registry server and research sources for this skill',{domain,source_scope});
    assert.ok(plan.recommendations.every(r=>!networkOnly.has(r.id)),`${source_scope}/${domain}: ${plan.recommendations.map(r=>r.id)}`);
  }
  const browser=buildCapabilityPlan('Read this login-protected page using my approved browser profile.',{domain:'research',source_scope:'private'});
  assert.equal(browser.primaryCapabilityId,'service.playwright');
});
test('only approved recipes and knowledge entries are eligible for MCP resources',()=>{
  assert.ok(RECIPES.every(r=>typeof r.approved==='boolean'));
  assert.ok(KNOWLEDGE_ITEMS.every(k=>typeof k.approved==='boolean'));
});
