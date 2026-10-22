import test from 'node:test';
import assert from 'node:assert/strict';
import {INTEGRATIONS,getIntegration,listIntegrations,legacyAgentIntegrations,CONNECTION_STATES} from '../../lib/integrations/catalog.mjs';
import {getClientSetupGuide,CLIENT_IDS} from '../../lib/integrations/runtime-matrix.mjs';
import {KNOWLEDGE_ITEMS} from '../../lib/knowledge/catalog.mjs';
import {SKILLS} from '../../lib/catalog.mjs';

const EXPECTED=['context7','serena','next-devtools','playwright','chrome-devtools','spline','vercel','github','blender-lab','gltf-transform-cli','21st','motionsites','firecrawl'];

test('every requested integration is catalogued once with vendor, transport and auth',()=>{
  assert.deepEqual([...INTEGRATIONS.map(i=>i.id)].sort(),[...EXPECTED].sort());
  for(const i of INTEGRATIONS){
    assert.ok(i.vendor&&i.transport&&i.auth&&i.sourceUrl.startsWith('https://'),i.id);
    assert.equal(i.proxiedBySoren,false,i.id);
    assert.equal(i.automaticallyConnected,false,i.id);
    assert.ok(CONNECTION_STATES.includes(i.status),i.id);
    if(i.skill)assert.ok(SKILLS.some(s=>s.name===i.skill),i.id+' skill '+i.skill);
    for(const id of i.knowledgeIds)assert.ok(KNOWLEDGE_ITEMS.some(k=>k.id===id),i.id+' knowledge '+id);
  }
});

test('verified observations require a native tool call with evidence; catalog status never overclaims',()=>{
  for(const i of INTEGRATIONS){
    for(const o of i.observations){
      assert.ok(CONNECTION_STATES.includes(o.state));
      if(o.state==='verified'){assert.equal(o.method,'native_tool_call',i.id);assert.ok(o.evidence&&o.client&&o.observedAt,i.id);}
    }
    if(i.status==='verified')assert.ok(i.observations.some(o=>o.state==='verified'),i.id);
  }
});

test('Blender Lab is isolated and gltf-transform is a build-time CLI, not an MCP',()=>{
  const blender=getIntegration('blender-lab');
  assert.equal(blender.runtime,'isolated_vm_manual_start');
  assert.ok(blender.cautions.some(c=>/python/i.test(c)));
  assert.equal(getIntegration('gltf-transform-cli').kind,'cli_not_mcp');
  assert.equal(getIntegration('nope'),null);
  assert.ok(listIntegrations({category:'browser_qa'}).every(i=>i.category==='browser_qa'));
});

test('legacy list_providers projection keeps the live agentMcpIntegrations shape',()=>{
  const legacy=legacyAgentIntegrations();
  const keys=['id','name','category','transport','sourceUrl','authentication','connectionState','proxiedBySoren','automaticallyConnected','requiresLocalExecution','skill','guidance'];
  for(const id of ['21st','motionsites','playwright'])assert.ok(legacy.some(x=>x.id===id),id);
  for(const entry of legacy){
    for(const key of keys)assert.ok(key in entry,entry.id+' '+key);
    assert.equal(entry.connectionState,'agent_managed_unverified');
  }
});

test('setup guides exist for every client and integration, are dry-run only and pin versions',()=>{
  for(const client of CLIENT_IDS){
    for(const i of INTEGRATIONS){
      const guide=getClientSetupGuide(client,i.id);
      assert.equal(guide.dryRunOnly,true);
      assert.equal(guide.executedBySoren,false);
      assert.ok(typeof guide.supported==='boolean');
      const text=JSON.stringify(guide);
      assert.doesNotMatch(text,/@latest/,client+'/'+i.id+' must pin versions');
      assert.doesNotMatch(text,/(gh[opsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[abp]-)/);
    }
  }
  const codex=getClientSetupGuide('codex','context7');
  assert.ok(codex.commands.some(c=>c.startsWith('codex mcp add context7')));
  assert.ok(codex.preflight.some(c=>/codex mcp list/.test(c)));
  assert.throws(()=>getClientSetupGuide('unknown','context7'),/Unsupported client/);
  assert.throws(()=>getClientSetupGuide('codex','nope'),/Unknown integration/);
});
