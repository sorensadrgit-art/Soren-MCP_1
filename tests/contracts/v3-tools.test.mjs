import test from 'node:test';
import assert from 'node:assert/strict';
import {runRouteSession,INIT,toolCall,toolValue} from '../helpers/mcp-route.mjs';

const calls=[INIT,
  toolCall('list_capability_profiles'),
  toolCall('plan_toolchain',{task:'Create an ultra-realistic interactive 3D portfolio',runtime:'codex',project_packages:{react:'19.3.1','@react-three/fiber':'9.8.2',three:'0.186.1'},available_connections:['playwright']}),
  toolCall('list_integrations',{}),
  toolCall('search_knowledge',{query:'react three fiber canvas performance',packages:{'@react-three/fiber':'9.8.2'}}),
  toolCall('read_recipe',{id:'cinematic-portfolio'}),
  toolCall('get_client_setup_guide',{client:'codex',integration:'context7'}),
  ['resources/read',{uri:'soren://recipe/cinematic-portfolio'}],
  ['resources/read',{uri:'soren://knowledge/r3f-v9'}],
  toolCall('read_recipe',{id:'../../.env'}),
  toolCall('get_client_setup_guide',{client:'unknown-client',integration:'context7'}),
  toolCall('plan_toolchain',{task:''}),
  toolCall('search_knowledge',{query:'gsap',limit:99}),
];
const out=runRouteSession(calls,{v3:true});

test('every V3 tool answers over the real MCP route',()=>{
  for(const [index,entry] of out.slice(1,7).entries()){
    assert.equal(entry.status,200,'call '+index);
    assert.ok(!entry.body.error&&!entry.body.result?.isError,JSON.stringify(entry.body).slice(0,300));
  }
  const profiles=toolValue(out[1]);
  assert.ok(profiles.profiles.some(p=>p.id==='immersive-web'));
  const plan=toolValue(out[2]);
  assert.equal(plan.profile.id,'immersive-web');
  assert.equal(plan.authority,'advisory_only');
  assert.deepEqual(plan.availableVerifiedConnections,[]);
  assert.ok(plan.clientReportedConnections.some(c=>c.id==='playwright'&&c.state==='client_reported'));
  assert.equal(plan.executionPlan.length,9);
  const integrations=toolValue(out[3]);
  assert.ok(integrations.integrations.length>=12);
  const knowledge=toolValue(out[4]);
  assert.ok(knowledge.primary);
  assert.ok(knowledge.results.every(r=>r.url.startsWith('https://')&&/^[a-f0-9]{64}$/.test(r.contentSha256)));
  assert.equal(toolValue(out[5]).id,'cinematic-portfolio');
  const guide=toolValue(out[6]);
  assert.equal(guide.dryRunOnly,true);
  assert.equal(guide.executedBySoren,false);
});

test('V3 resources are readable JSON with provenance',()=>{
  const recipe=JSON.parse(out[7].body.result.contents[0].text);
  assert.equal(recipe.id,'cinematic-portfolio');
  const item=JSON.parse(out[8].body.result.contents[0].text);
  assert.equal(item.id,'r3f-v9');
  assert.match(item.contentSha256,/^[a-f0-9]{64}$/);
});

test('V3 tools reject traversal, unknown clients, empty tasks and oversized limits',()=>{
  for(const entry of out.slice(9)){
    assert.ok(entry.body.error||entry.body.result?.isError,JSON.stringify(entry.body).slice(0,200));
  }
});
