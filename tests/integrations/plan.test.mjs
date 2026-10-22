import test from 'node:test';
import assert from 'node:assert/strict';
import {planToolchain} from '../../lib/integrations/plan.mjs';
import {SKILLS} from '../../lib/catalog.mjs';

const NOW=new Date('2026-10-23T00:00:00Z');
const PORTFOLIO='Create an ultra-realistic interactive 3D portfolio';

test('portfolio brief produces the nine-step immersive workflow with all planner outputs',()=>{
  const p=planToolchain(PORTFOLIO,{runtime:'codex',now:NOW});
  assert.equal(p.profile.id,'immersive-web');
  for(const key of ['requiredCapabilities','selectedSkills','suggestedMcpServers','suggestedTools','availableVerifiedConnections','clientReportedConnections','missingConnectionSteps','docsVersions','permissionBoundaries','estimatedCost','executionPlan','verificationPlan','fallbacks','sources','confidence'])assert.ok(key in p,key);
  assert.equal(p.executionPlan.length,9);
  assert.match(p.executionPlan[0].title,/architecture|dependencies/i);
  assert.match(p.executionPlan[2].title,/Blender|Spline/);
  assert.match(p.executionPlan[6].title,/browser/i);
  assert.match(p.executionPlan[8].title,/pull request/i);
  assert.ok(p.selectedSkills.some(s=>s.name==='react-three-fiber'));
  assert.ok(p.selectedSkills.length<=3);
  assert.ok(p.confidence.score>0&&p.confidence.score<=1);
  assert.ok(['high','medium','low'].includes(p.confidence.level));
});

test('connections claimed by the caller are client_reported, never verified',()=>{
  const p=planToolchain(PORTFOLIO,{runtime:'codex',availableConnections:['playwright','context7'],now:NOW});
  assert.deepEqual(p.availableVerifiedConnections,[]);
  assert.deepEqual(p.clientReportedConnections.map(c=>c.state),['client_reported','client_reported']);
  assert.ok(!p.missingConnectionSteps.some(s=>s.integration==='playwright'));
  const bare=planToolchain(PORTFOLIO,{runtime:'codex',now:NOW});
  assert.ok(bare.missingConnectionSteps.some(s=>s.integration==='playwright'));
  assert.ok(bare.missingConnectionSteps.every(s=>s.guideTool==='get_client_setup_guide'));
});

test('unknown runtimes get a setup-guide template instead of arguments the guide would reject',()=>{
  const p=planToolchain(PORTFOLIO,{runtime:'cursor',now:NOW});
  assert.ok(p.missingConnectionSteps.length>0);
  for(const s of p.missingConnectionSteps){
    assert.equal(s.guideArgs,null);
    assert.equal(s.guideArgsTemplate.integration,s.integration);
    assert.ok(s.supportedClients.includes('codex'));
  }
  const known=planToolchain(PORTFOLIO,{runtime:'codex',now:NOW});
  assert.ok(known.missingConnectionSteps.every(s=>s.guideArgs?.client==='codex'&&!('guideArgsTemplate' in s)));
});

test('CLI tools are listed as tools, never as MCP servers to connect',()=>{
  const p=planToolchain('Export a photoreal hero model from Blender to GLB for React Three Fiber',{runtime:'codex',now:NOW});
  assert.ok(!p.suggestedMcpServers.some(s=>s.id==='gltf-transform-cli'));
  assert.ok(p.suggestedTools.some(s=>s.id==='gltf-transform-cli'&&s.kind==='cli_not_mcp'));
  const step=p.missingConnectionSteps.find(s=>s.integration==='gltf-transform-cli');
  assert.equal(step.action,'install_or_invoke_tool');
  assert.match(step.note,/Not an MCP server/);
  assert.ok(p.missingConnectionSteps.filter(s=>s.integration!=='gltf-transform-cli').every(s=>s.action==='connect_mcp_server'));
});

test('asset route chooses Blender for photoreal assets and Spline for designer-driven scenes',()=>{
  assert.equal(planToolchain('Export a photoreal hero model from Blender to GLB for React Three Fiber',{now:NOW}).profile.id,'blender-to-web');
  assert.equal(planToolchain('Embed an interactive Spline scene in a landing page',{now:NOW}).profile.id,'spline-to-web');
});

test('Next.js debugging routes to next-app with next-devtools and version-matched docs',()=>{
  const p=planToolchain('Debug a broken Next.js 16 app with runtime hydration errors',{projectPackages:{next:'16.4.2',react:'19.3.1'},now:NOW});
  assert.equal(p.profile.id,'next-app');
  assert.ok(p.suggestedMcpServers.some(s=>s.id==='next-devtools'));
  assert.ok(p.docsVersions.some(d=>d.id==='nextjs-16'&&d.compatibility.status==='compatible'));
});

test('alpha or mismatched project versions produce warnings instead of silent adoption',()=>{
  const p=planToolchain(PORTFOLIO,{projectPackages:{'@react-three/fiber':'10.0.0-alpha.6',react:'19.3.1'},now:NOW});
  assert.ok(p.warnings.some(w=>/alpha|prerelease/i.test(w)));
  const old=planToolchain(PORTFOLIO,{projectPackages:{react:'18.3.1','@react-three/fiber':'8.17.10'},now:NOW});
  assert.ok(old.warnings.some(w=>/React 18|R3F 8|incompatible/i.test(w)));
});

test('exclusions are honoured and only curated skills are ever selected',()=>{
  const p=planToolchain(PORTFOLIO,{excludeIntegrations:['chrome-devtools'],now:NOW});
  assert.ok(!p.suggestedMcpServers.some(s=>s.id==='chrome-devtools'));
  const names=new Set(SKILLS.map(s=>s.name));
  assert.ok(p.selectedSkills.every(s=>names.has(s.name)));
});

test('trivial tasks produce no profile and low confidence; output is deterministic and advisory',()=>{
  const p=planToolchain('hello',{now:NOW});
  assert.equal(p.profile,null);
  assert.equal(p.confidence.level,'low');
  assert.deepEqual(planToolchain(PORTFOLIO,{now:NOW}),planToolchain(PORTFOLIO,{now:NOW}));
  assert.equal(p.authority,'advisory_only');
  const text=JSON.stringify(planToolchain(PORTFOLIO,{now:NOW}));
  assert.doesNotMatch(text,/"(?:exec|shell|spawn|run_command)"/);
});
