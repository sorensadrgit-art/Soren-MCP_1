import {test, expect, type Page, type TestInfo} from '@playwright/test';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';

const require = createRequire(import.meta.url);
const axeSource = require.resolve('axe-core/axe.min.js');
const versionId = '11111111-1111-4111-8111-111111111111';
const digest = 'a'.repeat(64);
const policyDigest = 'b'.repeat(64);
const publicRoutes = ['/', '/connect', '/manage', '/registry', '/reviews', '/health', '/updates'];

async function settled(page: Page) {
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await expect(page.getByText('Checking management session…', {exact: true})).toHaveCount(0);
  await expect(page.getByText('Loading current workspace records…', {exact: true})).toHaveCount(0);
}

async function audit(page: Page, info: TestInfo, label: string) {
  await page.addScriptTag({path: axeSource});
  const result = await page.evaluate(async () => (window as any).axe.run(document, {
    runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']},
    resultTypes: ['violations', 'incomplete'],
  }));
  const reportPath = info.outputPath(`${label}-axe-wcag22aa.json`);
  await writeFile(reportPath, JSON.stringify({label, viewport: page.viewportSize(), scope: label.startsWith('fixture') ? 'Labelled management API fixture; no OAuth or live private-data claim.' : 'Rendered local public route.', violations: result.violations, incomplete: result.incomplete}, null, 2));
  await info.attach(`${label}-axe-wcag22aa.json`, {path: reportPath, contentType: 'application/json'});
  expect.soft(result.violations.map((violation: any) => ({id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node: any) => ({target: node.target, summary: node.failureSummary}))})), label).toEqual([]);
}

async function managementFixture(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({json: {configured: true, authenticated: true, role: 'owner', permissions: ['dashboard:read', 'reviews:write', 'health:read', 'updates:read', 'updates:pause', 'updates:arm']}}));
  await page.route('**/api/admin/status', route => route.fulfill({json: {workspace: {approvalGeneration: 2, activeCatalogGeneration: versionId}, versions: [{versionId, directory: 'skills/accessibility-fixture', repository: 'https://github.com/example/accessibility-fixture', revision: 'c'.repeat(40), manifestSha256: digest, reviewRevision: 1, decision: 'approve', revoked: false, published: true}]}}));
  await page.route('**/api/admin/reviews?*', route => route.fulfill({json: {policySha256: policyDigest, candidate: {versionId, revision: 'c'.repeat(40), manifestSha256: digest, reviewRevision: 1, manifest: {license: 'MIT', capabilities: ['Read-only accessibility advice']}, files: [{path: 'SKILL.md', content: 'Candidate instructions: untrusted fixture text.'}]}, previous: {manifest: {license: 'MIT', capabilities: []}, files: [{path: 'SKILL.md', content: 'Previously approved fixture text.'}]}}}));
  await page.route('**/api/admin/health', route => route.fulfill({json: {observations: [{component: 'provider:accessibility-fixture', status: 'UNKNOWN', recorded_status: 'HEALTHY', freshness: 'stale', observed_at: '2026-10-19T00:00:00Z', failure_class: 'provider_timeout'}], incidents: [{state: 'OPEN', severity: 'warning', component: 'provider:accessibility-fixture'}], schedulerProfile: {profile: 'budget', dispatcher_freshness: 'fresh', watcher_freshness: 'stale'}}}));
  await page.route('**/api/admin/updates', route => route.fulfill({json: {mode: 'observe', effectiveMode: 'observe', generation: 7, policySha256: policyDigest, projectId: 'accessibility-fixture-project', environment: 'production', canArm: false, blockedReasons: ['fixture_atomic_cas_unavailable']}}));
}

test('rendered gradient backdrops preserve representative text contrast', async ({page}, info) => {
  await managementFixture(page);
  for (const route of ['/', '/updates']) {
    await page.goto(route); await settled(page);
    const selectors = route === '/' ? ['.identity b','.eyebrow','h1','h1 em','.subtitle','.features small','.terminalMeta','.queryForm label','.providerCards p','footer span'] : ['.tiny','.operationsTitle','.setupIntro','.opsNav a','.opsPanel p:not(.badge)','.accountBar > span'];
    const samples = await page.evaluate(selectors => {
      const elements = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))];
      const values: any[] = [];
      for (const element of elements) {
        const style = getComputedStyle(element);
        if (!element.getClientRects().length || style.visibility === 'hidden') continue;
        const range = document.createRange(); range.selectNodeContents(element);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({x:rect.left + scrollX,y:rect.top + scrollY,width:rect.width,height:rect.height}));
        const colors = style.color === 'rgba(0, 0, 0, 0)' ? style.backgroundImage.match(/rgba?\([^)]+\)/g) || [] : [style.color];
        values.push({label:element.tagName.toLowerCase()+'.'+element.className,text:element.textContent?.trim().slice(0,64),colors,rects,minimum:parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)?3:4.5,visibility:(element as HTMLElement).style.visibility});
      }
      (window as any).__contrastElements = elements.map(element => ({element, visibility: (element as HTMLElement).style.visibility}));
      elements.forEach(element => (element as HTMLElement).style.visibility = 'hidden');
      return values;
    }, selectors);
    const backdrop = await page.screenshot({fullPage:true});
    const ratios = await page.evaluate(async ({base64,samples}) => {
      const image = new Image(); image.src = 'data:image/png;base64,'+base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image,0,0); const pixels = context.getImageData(0,0,image.width,image.height).data;
      const scale = image.width / innerWidth;
      const luminance = (rgb:number[]) => rgb.map(value => {const c=value/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
      const results = samples.map((sample:any) => {
        let brightest = 0; let color = [0,0,0];
        for (const rect of sample.rects) for(let y=Math.max(0,Math.floor(rect.y*scale));y<Math.min(image.height,Math.ceil((rect.y+rect.height)*scale));y++) for(let x=Math.max(0,Math.floor(rect.x*scale));x<Math.min(image.width,Math.ceil((rect.x+rect.width)*scale));x++) {
          const offset=(y*image.width+x)*4; const rgb=[pixels[offset],pixels[offset+1],pixels[offset+2]];const value=luminance(rgb);if(value>brightest){brightest=value;color=rgb;}
        }
        const ratio=Math.min(...sample.colors.map((color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number);const foreground=luminance(rgb);return (Math.max(foreground,brightest)+0.05)/(Math.min(foreground,brightest)+0.05);}));
        return {label:sample.label,text:sample.text,colors:sample.colors,brightestRenderedBackdrop:color,ratio:Number(ratio.toFixed(2)),minimum:sample.minimum};
      });
      (window as any).__contrastElements.forEach(({element,visibility}:{element:HTMLElement;visibility:string}) => element.style.visibility = visibility);
      delete (window as any).__contrastElements;
      return results;
    }, {base64:backdrop.toString('base64'),samples});
    const reportPath=info.outputPath(`rendered-contrast-${route==='/'?'discover':'updates'}.json`);
    await writeFile(reportPath,JSON.stringify({method:'Browser-painted PNG backdrop with selected text hidden without layout changes; conservative brightest pixel across each text rectangle and gradient endpoints.',viewport:page.viewportSize(),samples:ratios},null,2));
    await info.attach(`rendered-contrast-${route==='/'?'discover':'updates'}.json`,{path:reportPath,contentType:'application/json'});
    for(const sample of ratios) expect.soft(sample.ratio,JSON.stringify(sample)).toBeGreaterThanOrEqual(sample.minimum);
  }
});

test('rendered public routes have no axe WCAG 2.2 AA violations', async ({page}, info) => {
  test.setTimeout(120000);
  for (const route of publicRoutes) {
    await page.goto(route);
    await settled(page);
    await audit(page, info, `public-${route === '/' ? 'discover' : route.slice(1)}`);
  }
});

test('labelled management fixtures have no axe WCAG 2.2 AA violations, including exact review and arming forms', async ({page}, info) => {
  test.setTimeout(120000);
  await managementFixture(page);
  for (const route of ['/registry', '/reviews', '/health', '/updates']) {
    await page.goto(route);
    await settled(page);
    if (route === '/reviews') {
      await page.getByRole('button', {name: 'INSPECT EXACT VERSION', exact: true}).click();
      await expect(page.getByRole('region', {name: 'Exact version review'})).toBeVisible();
    }
    await audit(page, info, `fixture-${route.slice(1)}`);
  }
});

test('320 pixel reflow and reduced motion preserve rendered public and management content', async ({page}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({width: 320, height: 800});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await managementFixture(page);
  for (const route of publicRoutes) {
    await page.goto(route);
    await settled(page);
    expect.soft(await page.evaluate(() => ({width: window.innerWidth, content: document.documentElement.scrollWidth})), route).toEqual({width: 320, content: 320});
    const clippedText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const clipped: {text: string; left: number; right: number}[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const element = node.parentElement;
        if (!node.textContent?.trim() || !element?.closest('main,header')) continue;
        const scrollRegion = element.closest('pre[tabindex="0"]');
        if (scrollRegion && ['auto','scroll'].includes(getComputedStyle(scrollRegion).overflowX)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)) clipped.push({text: node.textContent.trim().slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right)});
      }
      return clipped;
    });
    expect.soft(clippedText, `${route}: visible text must not be masked by overflow:hidden`).toEqual([]);
    expect.soft(await page.evaluate(() => [...document.querySelectorAll('*')].filter(element => {const style = getComputedStyle(element); return style.animationName !== 'none' && style.animationDuration.split(',').some(value => parseFloat(value) > 0);} ).length), `${route}: reduced motion`).toBe(0);
  }
  const screenshot = info.outputPath('reflow-320-updates.png');
  await page.screenshot({path: screenshot, fullPage: true});
  await info.attach('reflow-320-updates.png', {path: screenshot, contentType: 'image/png'});
});

test('keyboard reaches client selection and labelled review controls with visible focus and no trap', async ({page}, info) => {
  await page.goto('/connect');
  const client = page.getByRole('button', {name: 'Claude Code', exact: true});
  await client.focus(); await page.keyboard.press('Enter');
  await expect(client).toHaveAttribute('aria-pressed', 'true');
  expect(await client.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await managementFixture(page);
  await page.goto('/reviews'); await settled(page);
  const inspect = page.getByRole('button', {name: 'INSPECT EXACT VERSION', exact: true});
  await inspect.focus(); await page.keyboard.press('Enter');
  const evidence = page.getByLabel('Independent review evidence reference');
  await evidence.focus();
  await page.keyboard.type('fixture:keyboard-review');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Space'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'APPROVE THIS DIGEST', exact: true})).toBeFocused();
  expect(await page.getByRole('button', {name: 'APPROVE THIS DIGEST', exact: true}).evaluate(element => ({outline: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth}))).toEqual({outline: 'solid', width: '3px'});
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'REJECT THIS DIGEST', exact: true})).toBeFocused();
  const screenshot = info.outputPath('keyboard-review-focus.png');
  await page.screenshot({path: screenshot, fullPage: true});
  await info.attach('keyboard-review-focus.png', {path: screenshot, contentType: 'image/png'});
});
