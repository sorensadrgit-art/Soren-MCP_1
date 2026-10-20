import {test,expect} from '@playwright/test';
const endpoint='https://soren-shared-mcp-skills.vercel.app/api/mcp';
const golden=[
  ['Factory Droid',{mcpServers:{'soren-skills':{type:'http',url:endpoint,disabled:false}}}],
  ['Antigravity',{mcpServers:{'soren-skills':{serverUrl:endpoint,disabled:false}}}],
  ['OpenCode',{mcp:{servers:{'soren-skills':{type:'remote',url:endpoint,disabled:false}}}}],
  ['Claude Code',{mcpServers:{'soren-skills':{type:'http',url:endpoint}}}],
  ['Qwen Code',{mcpServers:{'soren-skills':{httpUrl:endpoint}}}],
] as const;
test('six formats match the independent specification and selection never installs',async({page})=>{
  await page.goto('/connect');
  for(const [name,value] of golden){await page.getByRole('button',{name,exact:true}).click();const text=await page.locator('pre[aria-label="'+name+' MCP configuration snippet"]').innerText();expect(JSON.parse(text)).toEqual(value);expect(text.split(endpoint)).toHaveLength(2);}
  await page.getByRole('button',{name:'Codex Desktop',exact:true}).click();await expect(page.locator('pre[aria-label="Codex Desktop MCP configuration snippet"]')).toHaveText('[mcp_servers.soren-skills]\nurl = "'+endpoint+'"\nenabled = true');
  await expect(page.getByText('Native invocation: NOT VERIFIED',{exact:false})).toBeVisible();
  await expect(page.getByText('Unknown versions and conflicting files require a new plan.',{exact:false})).toBeVisible();
});
test('clipboard rejection provides selectable manual fallback and keyboard focus',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}},configurable:true});});
  await page.goto('/connect');await page.getByRole('button',{name:'Claude Code',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'COPY CONFIGURATION',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Clipboard unavailable'})).toBeVisible();const snippet=page.locator('pre[aria-label="Claude Code MCP configuration snippet"]');await expect(snippet).toHaveAttribute('tabindex','0');await page.keyboard.press('Shift+Tab');await expect(snippet).toBeFocused();expect(await snippet.evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe('none');
});
test('native clipboard success reflects the copied payload',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Chromium clipboard API');
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/connect');await page.getByRole('button',{name:'Qwen Code',exact:true}).click();await page.getByRole('button',{name:'COPY CONFIGURATION',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Qwen Code configuration copied.'})).toBeVisible();expect(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()))).toEqual(golden.at(-1)![1]);
});
test('private pages and unauthorized mutations fail closed against the real server',async({page,request})=>{
  await page.goto('/reviews');await expect(page.getByRole('heading',{name:'Private management is not configured.'})).toBeVisible();await expect(page.getByRole('button',{name:'APPROVE THIS DIGEST'})).toHaveCount(0);
  for(const path of ['/api/admin/status','/api/admin/health','/api/admin/updates','/api/cron/maintenance']){const response=await request.get(path);expect([401,403,503]).toContain(response.status());expect(await response.json()).toHaveProperty('error');}
  for(const path of ['/api/admin/reviews','/api/admin/updates/releases','/api/admin/updates/releases/authorize','/api/admin/updates/evidence']){const response=await request.post(path,{data:{decision:'approve'}});expect([401,403,503]).toContain(response.status());}
});
test('API failure preserves a useful retry state and approved local routing works',async({page})=>{
  await page.goto('/');await page.locator('#task').fill('GSAP WebGL camera');await page.getByRole('button',{name:'ROUTE TASK'}).click();await expect(page.getByRole('heading',{name:'motion-systems',exact:true})).toBeVisible();
  await page.route('**/api/mcp',route=>route.fulfill({status:503,json:{error:'test_outage'}}));await page.getByRole('button',{name:'ROUTE TASK'}).click();await expect(page.getByRole('alert').filter({hasText:'HTTP 503'})).toBeVisible();await expect(page.getByRole('button',{name:'ROUTE TASK'})).toBeEnabled();
});
const versionId='11111111-1111-4111-8111-111111111111',digest='a'.repeat(64),policy='b'.repeat(64);
async function managementFixture(page:any,permissions:string[]){await page.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,authenticated:true,role:'owner',permissions}}));}
test('fixture review displays old/new bytes and changed revision blocks submission',async({page})=>{
  await managementFixture(page,['reviews:write','dashboard:read']);
  await page.route('**/api/admin/status',route=>route.fulfill({json:{workspace:{approvalGeneration:1},versions:[{versionId,directory:'skills/test',repository:'https://github.com/example/test',revision:'c'.repeat(40),manifestSha256:digest,reviewRevision:0,decision:null,revoked:false}]}}));
  let reads=0,writes=0;
  await page.route('**/api/admin/reviews?*',route=>{reads++;return route.fulfill({json:{policySha256:policy,candidate:{versionId,revision:'c'.repeat(40),manifestSha256:digest,reviewRevision:reads>1?1:0,manifest:{license:'MIT',capabilities:[]},files:[{path:'SKILL.md',content:'UNTRUSTED NEW BYTES'}]},previous:{manifest:{license:'MIT',capabilities:[]},files:[{path:'SKILL.md',content:'OLD APPROVED BYTES'}]}}});});
  await page.route('**/api/admin/reviews',route=>{writes++;return route.fulfill({json:{}});});
  await page.goto('/reviews');await page.getByRole('button',{name:'INSPECT EXACT VERSION'}).click();await expect(page.getByText('OLD APPROVED BYTES',{exact:true})).toBeVisible();await expect(page.getByText('UNTRUSTED NEW BYTES',{exact:true})).toBeVisible();await page.getByLabel('Independent review evidence reference').fill('fixture/review-1');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'APPROVE THIS DIGEST'}).click();await expect(page.getByRole('alert').filter({hasText:'candidate or policy changed'})).toBeVisible();expect(writes).toBe(0);
});
test('fixture owner pause binds policy digest and generation while unavailable arm stays disabled',async({page})=>{
  await managementFixture(page,['updates:read','updates:pause','updates:arm']);let posted:any=null;
  await page.route('**/api/admin/updates',route=>route.fulfill({json:{mode:'observe',effectiveMode:'observe',generation:7,policySha256:policy,projectId:'fixture-project',environment:'production',canArm:false,blockedReasons:['fixture_atomic_cas_unavailable']}}));
  await page.route('**/api/admin/updates/pause',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{mode:'paused'}});});
  await page.goto('/updates');await expect(page.getByRole('button',{name:'ARM EXACT POLICY'})).toBeDisabled();await page.getByRole('button',{name:'PAUSE UPDATER'}).click();await expect(page.getByRole('status').filter({hasText:'Updater paused'})).toBeVisible();expect(posted).toEqual({expectedGeneration:7,policySha256:policy,projectId:'fixture-project',environment:'production'});
});
test('fixture health displays database timestamps and stale evidence as unknown',async({page})=>{
  await managementFixture(page,['health:read','dashboard:read']);
  await page.route('**/api/admin/health',route=>route.fulfill({json:{observations:[{component:'provider:fixture',status:'UNKNOWN',recorded_status:'HEALTHY',freshness:'stale',observed_at:'2026-10-19T00:00:00Z',failure_class:'provider_only'}],incidents:[],schedulerProfile:{profile:'budget',dispatcher_freshness:'fresh',watcher_freshness:'stale'}}}));
  await page.goto('/health');await expect(page.getByText('Observed: 2026-10-19T00:00:00Z',{exact:true})).toBeVisible();await expect(page.getByText('UNKNOWN · stale',{exact:true})).toBeVisible();await expect(page.getByText('provider_only',{exact:true})).toBeVisible();await expect(page.getByText('Independent watcher: stale',{exact:false})).toBeVisible();
});
test('fixture approved library distinguishes approval from publication',async({page})=>{
  await managementFixture(page,['dashboard:read']);await page.route('**/api/admin/status',route=>route.fulfill({json:{workspace:{approvalGeneration:1,activeCatalogGeneration:null},versions:[{versionId,directory:'skills/fixture',repository:'https://github.com/example/fixture',revision:'c'.repeat(40),manifestSha256:digest,reviewRevision:1,decision:'approve',revoked:false,published:false}]}}));await page.goto('/registry');await expect(page.getByText('APPROVED · NOT PUBLISHED',{exact:true})).toBeVisible();
});
test('failed OAuth callback has an actionable error instead of a silent login loop',async({page})=>{
  await page.goto('/manage?auth_error=login_failed');await expect(page.getByRole('alert').filter({hasText:'Sign-in could not verify'})).toBeVisible();await expect(page.getByRole('heading',{name:'Private management is not configured.'})).toBeVisible();
});
test('public health, navigation and layouts stay usable without private infrastructure',async({page},info)=>{
  for(const path of ['/connect','/registry','/health','/updates']){await page.goto(path);await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(path.slice(1)+'.png'),fullPage:true});}
  await page.goto('/health');await expect(page.getByText('public_only',{exact:false}).first()).toBeVisible();await expect(page.getByText('Private management is not configured.',{exact:true})).toBeVisible();
});
