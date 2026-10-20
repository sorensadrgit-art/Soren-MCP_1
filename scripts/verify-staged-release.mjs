#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { CLIENT_SNIPPETS, MCP_SERVER_NAME, TOOL_NAMES } from '../lib/client-contract.mjs';
import { createVercelProvider } from '../lib/updates/vercel.mjs';
import { verifyRelease, parseManifest } from '../lib/updates/verification.mjs';
import { LIMITS, requireGate, sha256 } from '../lib/updates/policy.mjs';
import { BUILD_REPOSITORY, BUILD_REF, producerOptions } from './produce-release.mjs';

export const STAGED_WORKFLOW = '.github/workflows/staged-verification.yml';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const iso = value => new Date(value).toISOString();
const hex = value => /^[a-f0-9]{64}$/.test(value || '');
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export function stagedOptions(env = process.env) {
  return { ...producerOptions(env), candidateDirectory: env.SOREN_STAGED_CANDIDATE_INPUT, deploymentId: env.SOREN_STAGED_DEPLOYMENT_ID };
}

function gateEnvironment(env, options) {
  requireGate(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === BUILD_REPOSITORY && env.GITHUB_REF === BUILD_REF && env.GITHUB_WORKFLOW_REF === `${BUILD_REPOSITORY}/${STAGED_WORKFLOW}@${BUILD_REF}`, 'trusted_staged_manual_workflow_required');
  requireGate(/^[a-f0-9]{40}$/.test(options.sourceSha || '') && options.sourceSha === env.GITHUB_SHA && /^\d+$/.test(env.GITHUB_RUN_ID || '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT || ''), 'exact_staged_source_required');
  requireGate(env.SOREN_STAGED_ENVIRONMENT === 'production-staged-verification' && env.SOREN_PRODUCTION_ARTIFACT_TRUST_APPROVED === 'true', 'staged_environment_and_artifact_trust_required');
  requireGate(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && env.VERCEL_TOKEN && env.SOREN_RELEASE_OBSERVER_ACCESS_TOKEN && env.SOREN_PRIVATE_READ_ACCESS_TOKEN, 'staged_credentials_unavailable');
  requireGate(options.candidateDirectory && options.outputDirectory && identifier(options.deploymentId) && identifier(options.projectId) && identifier(options.teamId) && identifier(options.expectedParentDeploymentId), 'staged_scope_invalid');
  requireGate(identifier(env.SOREN_PRIVATE_PROBE_VERSION_ID?.replaceAll('-', '')) && /^[a-f0-9-]{36}$/.test(env.SOREN_PRIVATE_PROBE_VERSION_ID || '') && hex(env.SOREN_PRIVATE_PROBE_MANIFEST_SHA256) && hex(env.SOREN_PRIVATE_PROBE_CONTENT_SHA256), 'pinned_private_read_probe_required');
  requireGate(env.SOREN_RELEASE_TRUST_FILE && path.isAbsolute(env.SOREN_RELEASE_TRUST_FILE) && hex(env.SOREN_RELEASE_TRUST_SHA256), 'owner_trust_file_and_digest_required');
}

async function boundedFile(file, maximum) {
  const stat = await fs.lstat(file);
  requireGate(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'staged_input_file_invalid');
  const bytes = await fs.readFile(file);
  requireGate(bytes.length <= maximum, 'staged_input_file_limit');
  return bytes;
}

export function stagedOrigin(deployment) {
  requireGate(typeof deployment.url === 'string', 'staged_url_missing');
  const url = new URL(`https://${deployment.url}`);
  requireGate(url.protocol === 'https:' && url.hostname.endsWith('.vercel.app') && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash && deployment.url === url.hostname, 'staged_url_invalid');
  return url.origin;
}

function adminOrigin(env) {
  const url = new URL(env.SOREN_ADMIN_ORIGIN || 'invalid:');
  const domains = (env.SOREN_PRODUCTION_DOMAINS || '').split(',').map(value => value.trim());
  requireGate(url.protocol === 'https:' && domains.includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash, 'observer_origin_not_owner_scoped');
  return url.origin;
}

async function responseBytes(response, maximum = 1_048_576) {
  const chunks = []; let size = 0;
  const reader = response.body?.getReader();
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); requireGate(false, 'staged_response_limit'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function stageFetch(origin, env, fetchImpl) {
  return async (input, init = {}) => {
    const url = new URL(input);
    requireGate(url.origin === origin && !url.username && !url.password, 'unexpected_staged_destination');
    const headers = new Headers(init.headers);
    if (env.SOREN_VERCEL_PROTECTION_BYPASS) headers.set('x-vercel-protection-bypass', env.SOREN_VERCEL_PROTECTION_BYPASS);
    const response = await fetchImpl(url, { ...init, headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(10_000)]) });
    if (!response.body) return response;
    return new Response(await responseBytes(response), { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export function assertSnapshot(snapshot, binding, observedAt) {
  const manifest = binding.manifest;
  requireGate(snapshot.manifestSha256 === binding.manifestSha256 && snapshot.artifactSha256 === manifest.artifactSha256 && snapshot.sourceCommit === manifest.sourceCommit, 'snapshot_candidate_identity_changed');
  requireGate(snapshot.policy?.projectId === manifest.projectId && snapshot.policy.environment === 'production' && snapshot.policy.policySha256 === manifest.policySha256 && snapshot.policy.mode !== 'paused', 'snapshot_policy_changed_or_paused');
  requireGate(snapshot.release?.releaseId === manifest.releaseId && snapshot.release.projectId === manifest.projectId && snapshot.release.environment === 'production' && snapshot.release.state === 'STAGED' && snapshot.release.deploymentId === manifest.expectedParentDeploymentId && snapshot.stagedDeploymentId === binding.deploymentId, 'registered_exact_staged_release_required');
  requireGate(snapshot.activeDeploymentId === manifest.expectedParentDeploymentId && snapshot.catalogGeneration === manifest.catalogGeneration && snapshot.schemaVersion >= manifest.schemaCompatibility.minimum && snapshot.schemaVersion <= manifest.schemaCompatibility.maximum, 'snapshot_parent_catalog_or_schema_changed');
  requireGate(snapshot.dependenciesReady === true && snapshot.budgetAvailable === true && snapshot.securityIncident === false && Array.isArray(snapshot.revokedDigests) && !snapshot.revokedDigests.includes(manifest.artifactSha256) && !snapshot.revokedDigests.includes(binding.manifestSha256), 'snapshot_readiness_or_revocation_denied');
  for (const timestamp of [snapshot.readinessObservedAt, snapshot.watcher?.observedAt]) requireGate(Number.isFinite(Date.parse(timestamp)) && Date.parse(timestamp) <= observedAt && observedAt - Date.parse(timestamp) <= LIMITS.probeSeconds * 1000, 'persisted_readiness_or_watcher_stale');
  requireGate(snapshot.watcher.status === 'PASS' && snapshot.watcher.independent === true && Number.isFinite(snapshot.watcher.maxProbeIntervalSeconds) && snapshot.watcher.maxProbeIntervalSeconds > 0 && snapshot.watcher.maxProbeIntervalSeconds <= LIMITS.probeSeconds, 'independent_watcher_required');
  return { policyGeneration: snapshot.policy.generation, watcherObservedAt: snapshot.watcher.observedAt, readinessObservedAt: snapshot.readinessObservedAt };
}

async function protocolProbe(context, { privateRead = false, full = false } = {}) {
  const endpoint = new URL('/api/mcp', context.origin);
  const client = new Client({ name: 'soren-trusted-staged-verifier', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'legacy' } });
  const headers = privateRead ? { Authorization: `Bearer ${context.env.SOREN_PRIVATE_READ_ACCESS_TOKEN}` } : {};
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch: context.fetchStage, requestInit: { headers }, reconnectionOptions: { maxRetries: 0 } });
  try {
    await client.connect(transport, { timeout: 10000 });
    requireGate(client.getServerVersion()?.name === MCP_SERVER_NAME, 'staged_server_identity_mismatch');
    const call = (name, args) => client.callTool({ name, arguments: args }, { timeout: 10000 });
    if (privateRead) {
      const result = await call('read_skill', { name: 'private-verification-probe', privateVersion: { versionId: context.env.SOREN_PRIVATE_PROBE_VERSION_ID, manifestSha256: context.env.SOREN_PRIVATE_PROBE_MANIFEST_SHA256, path: 'SKILL.md' } });
      requireGate(!result.isError, 'authenticated_private_read_failed');
      let value; try { value = JSON.parse(result.content.find(item => item.type === 'text')?.text); } catch { requireGate(false, 'private_probe_result_invalid'); }
      requireGate(typeof value.content === 'string' && sha256(value.content) === context.env.SOREN_PRIVATE_PROBE_CONTENT_SHA256 && value.manifestSha256 === context.env.SOREN_PRIVATE_PROBE_MANIFEST_SHA256 && value.path === 'SKILL.md', 'private_probe_content_mismatch');
      return { authenticatedPrivateRead: true, contentSha256: sha256(value.content), manifestSha256: value.manifestSha256 };
    }
    const { tools } = await client.listTools({}, { timeout: 10000 });
    requireGate(tools.length === TOOL_NAMES.length && TOOL_NAMES.every(name => tools.some(tool => tool.name === name && tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false)), 'staged_tools_mismatch');
    const { resources } = await client.listResources({}, { timeout: 10000 });
    requireGate(resources.length === 4, 'staged_resource_count_mismatch');
    for (const resource of full ? resources : resources.filter(resource => resource.uri === 'skill://motion-systems/SKILL.md')) {
      const read = await client.readResource({ uri: resource.uri }, { timeout: 10000 });
      requireGate(read.contents.some(item => typeof item.text === 'string' && item.text.length > 0), 'staged_resource_read_failed');
    }
    const route = await call('route_task', { task: 'GSAP animation guidance', discovery: 'local', runtime: 'staged-verifier' });
    requireGate(!route.isError, 'staged_local_route_failed');
    const value = JSON.parse(route.content.find(item => item.type === 'text')?.text);
    requireGate(value.discoveryMode === 'local' && value.discoveredCandidates?.length === 0, 'staged_local_route_contract_failed');
    if (full) {
      for (const [name, args] of [['list_skills', {}], ['search_skills', { query: 'animation', scope: 'local' }], ['read_skill', { name: 'motion-systems' }], ['list_providers', {}]]) requireGate(!(await call(name, args)).isError, 'staged_readonly_tool_failed');
      const denied = await call('read_skill', { name: 'private-verification-probe', privateVersion: { versionId: context.env.SOREN_PRIVATE_PROBE_VERSION_ID, manifestSha256: context.env.SOREN_PRIVATE_PROBE_MANIFEST_SHA256, path: 'SKILL.md' } });
      requireGate(denied.isError === true, 'anonymous_private_read_not_denied');
    }
    return { tools: TOOL_NAMES, bundledResources: 4, localDiscoveryOnly: true, ...(full ? { anonymousPrivateReadDenied: true } : {}) };
  } finally { await client.close().catch(() => {}); }
}

async function securityProbe(context) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  for (const [headers, payload, expected] of [[{ Authorization: 'Bearer deliberately-invalid-staged-verifier' }, body, 401], [{ Origin: 'https://untrusted.invalid' }, body, 403], [{}, ' '.repeat(16_385), 413]]) {
    const response = await context.fetchStage(new URL('/api/mcp', context.origin), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: payload });
    requireGate(response.status === expected, 'staged_negative_security_probe_failed');
  }
  const admin = await context.fetchStage(new URL('/api/admin/status', context.origin), { headers: { Authorization: `Bearer ${context.env.SOREN_PRIVATE_READ_ACCESS_TOKEN}` } });
  requireGate(admin.status === 403, 'readonly_agent_admin_access_not_denied');
  return { invalidBearer: 401, crossOrigin: 403, oversizedBody: 413, readonlyAgentAdmin: 403 };
}

async function readinessProbe(context) {
  const response = await context.fetchStage(new URL('/api/health/ready', context.origin));
  const result = await response.json();
  requireGate(response.ok && result.ready === true && result.mode === 'private_enabled' && result.status === 'HEALTHY' && result.freshness === 'fresh', 'staged_private_readiness_failed');
  return { ready: true, mode: result.mode, status: result.status, freshness: result.freshness };
}

async function browserProbe(context) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    const browserContext = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 900 } });
    await browserContext.route('**/*', async route => {
      const headers = { ...route.request().headers() };
      delete headers['x-vercel-protection-bypass'];
      if (new URL(route.request().url()).origin !== context.origin) {
        await route.continue({ headers });
        return;
      }
      if (context.env.SOREN_VERCEL_PROTECTION_BYPASS) headers['x-vercel-protection-bypass'] = context.env.SOREN_VERCEL_PROTECTION_BYPASS;
      try {
        // Forward the actual HTTPS response unchanged. Disable redirects before
        // the secret-bearing request can be forwarded to a second origin.
        const response = await route.fetch({ headers, maxRedirects: 0, timeout: 10000 });
        if (response.status() >= 300 && response.status() < 400) { failures.push('staged_redirect_refused'); await route.abort(); return; }
        await route.fulfill({ response });
      } catch { failures.push('staged_request_failed'); await route.abort(); }
    });
    const page = await browserContext.newPage();
    page.on('pageerror', () => failures.push('page_error'));
    const response = await page.goto(`${context.origin}/connect`, { waitUntil: 'networkidle', timeout: 30000 });
    requireGate(response?.ok(), 'staged_browser_navigation_failed');
    for (const [id, label] of [['factory', 'Factory Droid'], ['codex', 'Codex Desktop'], ['antigravity', 'Antigravity'], ['opencode', 'OpenCode'], ['claude', 'Claude Code'], ['qwen', 'Qwen Code']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      const snippet = page.getByLabel(`${label} MCP configuration snippet`, { exact: true });
      requireGate(await snippet.textContent() === CLIENT_SNIPPETS[id], 'staged_browser_client_snippet_mismatch');
      await snippet.focus();
      requireGate(await snippet.evaluate(element => element === document.activeElement), 'staged_browser_keyboard_focus_failed');
      await page.getByRole('button', { name: 'COPY CONFIGURATION', exact: true }).click();
      await page.getByRole('status').filter({ hasText: `${label} configuration copied.` }).waitFor();
      requireGate(await page.evaluate(() => navigator.clipboard.readText()) === CLIENT_SNIPPETS[id], 'staged_browser_clipboard_failed');
    }
    await page.getByRole('button', { name: 'CHECK GATEWAY', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Gateway: HEALTHY' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    requireGate(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'staged_browser_mobile_overflow');
    requireGate(failures.length === 0, 'staged_browser_page_error');
    return { publicFlows: ['six_client_snippets', 'native_clipboard', 'keyboard_focus', 'real_gateway_readiness', 'mobile_no_overflow'], routeFixturesUsed: false, responseForwarding: 'Actual upstream HTTPS response unchanged; maxRedirects=0; no synthetic bodies or status', screenshot: await page.screenshot({ fullPage: true }) };
  } finally { await browser.close(); }
}

export async function verifyStagedRelease(options, dependencies = {}) {
  const env = dependencies.env || process.env;
  const root = dependencies.root || sourceRoot;
  const now = dependencies.now || Date.now;
  const wait = dependencies.wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const run = dependencies.run || execute;
  const fetchImpl = dependencies.fetchImpl || fetch;
  gateEnvironment(env, options);
  const input = path.resolve(options.candidateDirectory); const output = path.resolve(options.outputDirectory);
  requireGate(input !== output, 'staged_output_invalid');
  const outside = path.relative(root, output);
  requireGate(outside.startsWith(`..${path.sep}`) || path.isAbsolute(outside), 'staged_output_must_be_outside_source');
  const trustPath = path.resolve(env.SOREN_RELEASE_TRUST_FILE);
  requireGate(trustPath !== input && !trustPath.startsWith(input + path.sep), 'candidate_cannot_supply_trust_root');
  try { await fs.lstat(output); requireGate(false, 'staged_output_exists'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const names = ['manifest.json', 'artifact.tar', 'provenance.sigstore.json', 'evidence.json', 'package-lock.json', 'sbom.cdx.json'];
  const bytes = Object.fromEntries(await Promise.all(names.map(async name => [name, await boundedFile(path.join(input, name), name === 'artifact.tar' ? LIMITS.maxArtifactBytes : name === 'package-lock.json' ? 5_242_880 : 1_048_576)])));
  const [lockfileBytes, policyBytes, trustBytes] = await Promise.all([boundedFile(path.join(root, 'package-lock.json'), 5_242_880), boundedFile(path.join(root, 'config', 'operating-policy.json'), 65_536), boundedFile(trustPath, 65_536)]);
  requireGate(sha256(trustBytes) === env.SOREN_RELEASE_TRUST_SHA256 && bytes['package-lock.json'].equals(lockfileBytes), 'owner_trust_or_candidate_lock_mismatch');
  const trust = JSON.parse(trustBytes);
  const candidate = { manifestBytes: bytes['manifest.json'], artifact: bytes['artifact.tar'], bundleBytes: bytes['provenance.sigstore.json'], evidenceBytes: bytes['evidence.json'], lockfileBytes, policyBytes, trust, verifier: dependencies.verifyBundle, now: now(), evidenceRequired: false, metadataOnly: false };
  const verified = await (dependencies.verifyRelease || verifyRelease)(candidate);
  const manifest = verified.manifest;
  requireGate(manifest.sourceCommit === options.sourceSha && manifest.projectId === options.projectId && manifest.expectedParentDeploymentId === options.expectedParentDeploymentId && manifest.catalogGeneration === options.catalogGeneration && manifest.schemaCompatibility.minimum === options.schemaMinimum && manifest.schemaCompatibility.maximum === options.schemaMaximum, 'staged_owner_inputs_differ_from_artifact');
  const originalStatement = JSON.parse(Buffer.from(JSON.parse(bytes['provenance.sigstore.json']).dsseEnvelope.payload, 'base64'));
  requireGate(originalStatement.subject.some(subject => subject.name === 'sbom.cdx.json' && subject.digest?.sha256 === sha256(bytes['sbom.cdx.json'])), 'signed_sbom_missing_or_changed');
  const identity = `https://github.com/${BUILD_REPOSITORY}/${STAGED_WORKFLOW}@${BUILD_REF}`;
  const identities = trust.identities || [trust];
  requireGate(identities.some(item => item.certificateIdentityURI === identity && item.certificateIssuer === 'https://token.actions.githubusercontent.com' && item.repository === `https://github.com/${BUILD_REPOSITORY}` && item.workflow === STAGED_WORKFLOW && item.ref === BUILD_REF), 'staged_signing_identity_not_owner_approved');
  const safeNames = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'npm_config_cache', 'NPM_CONFIG_CACHE'];
  const sourceEnvironment = Object.fromEntries(safeNames.filter(name => env[name]).map(name => [name, env[name]]));
  const commandOptions = { cwd: root, env: { ...sourceEnvironment, CI: 'true', NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, maxBuffer: 1_048_576, timeout: 15 * 60_000 };
  async function command(program, args, label) { try { return await run(program, args, commandOptions); } catch { requireGate(false, `${label}_failed`); } }
  async function cleanSource() {
    const head = await command('git', ['rev-parse', 'HEAD'], 'staged_source_identity');
    const stable = await command('git', ['rev-parse', 'origin/stable'], 'staged_stable_identity');
    const dirty = await command('git', ['status', '--porcelain', '--untracked-files=all'], 'staged_source_status');
    requireGate(head.stdout.trim() === options.sourceSha && stable.stdout.trim() === options.sourceSha && !dirty.stdout.trim(), 'staged_dirty_or_unreviewed_source');
    requireGate(sha256(await fs.readFile(path.join(root, 'package-lock.json'))) === manifest.lockfileSha256 && sha256(await fs.readFile(path.join(root, 'config', 'operating-policy.json'))) === manifest.policySha256, 'staged_source_inputs_changed');
  }
  await cleanSource();
  const bundledNpm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = await fs.access(bundledNpm).then(() => bundledNpm, () => env.npm_execpath);
  requireGate(npmCli && path.isAbsolute(npmCli), 'npm_runtime_unavailable');
  await command(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], 'staged_locked_dependency_install');
  const fullSuiteStarted = now();
  await command(process.execPath, [npmCli, 'test'], 'staged_full_source_suite');
  const fullSuiteFinished = now();
  const sourceSuites = ['contracts', 'installer', 'security', 'operations', 'updates'].map(name => ({ name, environment: 'isolated_ci', status: 'PASS', startedAt: iso(fullSuiteStarted), finishedAt: iso(fullSuiteFinished), method: 'npm test (complete source suite, including catalog, federation and routing)', includedSuite: name, sharedFullSuiteExecution: true }));
  await command(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'install', '--with-deps', 'chromium'], 'staged_browser_runtime');
  const provider = dependencies.provider || createVercelProvider({ env, artifact: candidate.artifact, manifest });
  const binding = { manifest, manifestSha256: verified.manifestSha256, deploymentId: options.deploymentId };
  async function inspect() {
    const value = await provider.inspectDeployment(options.deploymentId);
    requireGate(value.deploymentId === options.deploymentId && value.projectId === options.projectId && value.environment === 'production' && value.artifactSha256 === manifest.artifactSha256 && value.artifactBytesVerified === true && value.productionConfiguration === true && value.productionDomainsAssigned === false && await provider.activeDeployment() === manifest.expectedParentDeploymentId, 'exact_unassigned_production_artifact_required');
  }
  await inspect();
  const origin = stagedOrigin(await provider.getDeployment(options.deploymentId));
  const controlOrigin = adminOrigin(env);
  const context = { origin, env, fetchStage: stageFetch(origin, env, fetchImpl) };
  async function snapshot() {
    const url = new URL('/api/admin/updates/releases', controlOrigin);
    for (const [name, value] of Object.entries({ releaseId: manifest.releaseId, manifestSha256: verified.manifestSha256, projectId: options.projectId, environment: 'production' })) url.searchParams.set(name, value);
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.SOREN_RELEASE_OBSERVER_ACCESS_TOKEN}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    requireGate(response.ok, 'readonly_release_snapshot_denied');
    return assertSnapshot(JSON.parse(await responseBytes(response, 65_536)), binding, now());
  }
  const probes = {
    protocol: dependencies.protocolProbe || protocolProbe,
    security: dependencies.securityProbe || securityProbe,
    readiness: dependencies.readinessProbe || readinessProbe,
    browser: dependencies.browserProbe || browserProbe,
  };
  await snapshot();
  const browserStarted = now();
  const browser = await probes.browser(context);
  requireGate(browser.routeFixturesUsed === false && Buffer.isBuffer(browser.screenshot) && browser.screenshot.length > 0, 'real_staged_browser_evidence_required');
  const browserFinished = now();
  const observations = [];
  let previousStarted = null; let maximumGap = 0; let policyGeneration;
  const observationStarted = now();
  do {
    const started = now();
    if (previousStarted !== null) { const gap = started - previousStarted; requireGate(gap > 0 && gap <= LIMITS.probeSeconds * 1000, 'staged_observation_probe_gap'); maximumGap = Math.max(maximumGap, gap); }
    const [readiness, protocol, control] = await Promise.all([probes.readiness(context), probes.protocol(context), snapshot()]);
    requireGate(readiness?.ready === true && protocol?.localDiscoveryOnly === true, 'staged_observation_probe_failed');
    if (policyGeneration === undefined) policyGeneration = control.policyGeneration;
    requireGate(control.policyGeneration === policyGeneration, 'staged_observation_policy_generation_changed');
    observations.push({ startedAt: iso(started), finishedAt: iso(now()), readiness, protocol, control, artifactSha256: manifest.artifactSha256, deploymentId: options.deploymentId });
    previousStarted = started;
    if (now() - observationStarted < LIMITS.stageMinutes * 60_000) await wait(45_000);
  } while (now() - observationStarted < LIMITS.stageMinutes * 60_000);
  const observationFinished = now();
  requireGate(observationFinished - observationStarted >= LIMITS.stageMinutes * 60_000 && observations.length >= 16 && observationFinished - previousStarted <= LIMITS.probeSeconds * 1000, 'staged_observation_window_incomplete');
  await inspect();
  const smokeStarted = now();
  const [protocol, privateRead, security, readiness, control] = await Promise.all([probes.protocol(context, { full: true }), probes.protocol(context, { privateRead: true }), probes.security(context), probes.readiness(context), snapshot()]);
  requireGate(protocol.anonymousPrivateReadDenied === true && privateRead.authenticatedPrivateRead === true && readiness.ready === true && control.policyGeneration === policyGeneration, 'staged_final_smoke_incomplete');
  requireGate(security.invalidBearer === 401 && security.crossOrigin === 403 && security.oversizedBody === 413 && security.readonlyAgentAdmin === 403, 'staged_final_security_incomplete');
  await cleanSource();
  const finished = now();
  requireGate(finished - smokeStarted <= LIMITS.smokeMinutes * 60_000, 'staged_final_smoke_too_slow');
  const observationBytes = Buffer.from(JSON.stringify(observations, null, 2) + '\n');
  const invocation = `https://github.com/${BUILD_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`;
  const common = { status: 'PASS', sourceRevision: manifest.sourceCommit, lockfileSha256: manifest.lockfileSha256, environment: 'staged_production', evidenceRefs: [invocation, `sha256:${sha256(observationBytes)}`] };
  const observed = { artifactSha256: manifest.artifactSha256, policySha256: manifest.policySha256, deploymentId: options.deploymentId, remoteArtifactBytesVerified: true, readiness, security, privateRead, protocol };
  const evidence = sourceSuites.map(suite => ({ ...common, testId: suite.name, scope: suite.name === 'security' ? 'security' : 'integration', method: `${suite.method} against exact source, plus exact staged artifact inspection and live protocol, private read, security, readiness and persisted watcher probes`, startedAt: suite.startedAt, finishedAt: iso(finished), observed: { ...observed, sourceSuite: suite } }));
  evidence.push({ ...common, testId: 'browser', scope: 'browser', method: 'Real Chromium public connection flows; actual upstream HTTPS responses forwarded unchanged with redirects disabled; no fixtures', startedAt: iso(browserStarted), finishedAt: iso(browserFinished), observed: { ...observed, publicFlows: browser.publicFlows, routeFixturesUsed: false, responseForwarding: browser.responseForwarding, screenshotSha256: sha256(browser.screenshot) } });
  evidence.push({ ...common, testId: 'protocol', scope: 'protocol', method: 'Real MCP SDK handshake, eight tool schemas, four resource reads, local calls, authenticated private read and anonymous denial', startedAt: iso(smokeStarted), finishedAt: iso(finished), observed });
  evidence.push({ ...common, testId: 'final-smoke', scope: 'release', method: 'Reinspect complete remote artifact, then real staged protocol, private read, security, readiness and independent persisted watcher', startedAt: iso(smokeStarted), finishedAt: iso(finished), observed });
  evidence.push({ ...common, testId: 'staged-observation', scope: 'release', method: 'Real 15 minute observation at 45 second intervals with independent persisted watcher', startedAt: iso(observationStarted), finishedAt: iso(observationFinished), observed: { ...observed, maximumProbeGapSeconds: maximumGap / 1000, failures: 0, observations: observations.length } });
  const evidenceBytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n');
  const statement = { _type: 'https://in-toto.io/Statement/v1', subject: [['artifact.tar', candidate.artifact], ['verification-evidence.json', evidenceBytes], ['sbom.cdx.json', bytes['sbom.cdx.json']], ['staged-observations.json', observationBytes], ['staged-public-flows.png', browser.screenshot]].map(([name, data]) => ({ name, digest: { sha256: sha256(data) } })), predicateType: 'https://slsa.dev/provenance/v1', predicate: { buildDefinition: { buildType: `https://github.com/${BUILD_REPOSITORY}/staged-verification/v1`, externalParameters: { workflow: { repository: `https://github.com/${BUILD_REPOSITORY}`, path: STAGED_WORKFLOW, ref: BUILD_REF }, target: { projectId: options.projectId, teamId: options.teamId, environment: 'production', deploymentId: options.deploymentId }, originalManifestSha256: verified.manifestSha256, approvalIdReservations: options.approvalIds, rebuildPerformed: false }, resolvedDependencies: [{ uri: `git+https://github.com/${BUILD_REPOSITORY}@${BUILD_REF}`, digest: { gitCommit: manifest.sourceCommit } }, { uri: 'file:package-lock.json', digest: { sha256: manifest.lockfileSha256 } }, { uri: 'file:config/operating-policy.json', digest: { sha256: manifest.policySha256 } }, { uri: 'file:original-provenance.sigstore.json', digest: { sha256: sha256(candidate.bundleBytes) } }] }, runDetails: { builder: { id: identity }, metadata: { invocationId: invocation, finishedOn: iso(finished) } } } };
  const sigstore = dependencies.attest && dependencies.verifyBundle ? null : await import('sigstore');
  const payload = Buffer.from(JSON.stringify(statement));
  const bundle = await (dependencies.attest || sigstore.attest)(payload, 'application/vnd.in-toto+json', { tlogUpload: true, timeout: 10000, retry: 0 });
  const bundleBytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
  requireGate(bundle.dsseEnvelope?.payloadType === 'application/vnd.in-toto+json' && Buffer.from(bundle.dsseEnvelope.payload, 'base64').equals(payload), 'staged_signed_statement_mismatch');
  const nextManifest = { ...manifest, releaseId: `staged-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, approvalIds: options.approvalIds, provenance: { method: 'verified_ci_attestation', verificationReference: `sha256:${sha256(bundleBytes)}`, trustedIdentity: identity }, createdAt: iso(finished), expiresAt: iso(finished + 60 * 60_000) };
  requireGate(nextManifest.releaseId !== manifest.releaseId, 'staged_release_id_must_be_new');
  const manifestBytes = Buffer.from(JSON.stringify(nextManifest, null, 2) + '\n');
  parseManifest(manifestBytes, now());
  await verifyRelease({ ...candidate, manifestBytes, bundleBytes, evidenceBytes, evidenceRequired: true, now: now() });
  await fs.mkdir(output, { mode: 0o700 });
  for (const [name, data] of [['artifact.tar', candidate.artifact], ['package-lock.json', lockfileBytes], ['sbom.cdx.json', bytes['sbom.cdx.json']], ['manifest.json', manifestBytes], ['provenance.sigstore.json', bundleBytes], ['evidence.json', evidenceBytes], ['verification-evidence.json', evidenceBytes], ['staged-observations.json', observationBytes], ['staged-public-flows.png', browser.screenshot]]) await fs.writeFile(path.join(output, name), data, { flag: 'wx', mode: 0o600 });
  return { status: 'SIGNED_STAGED_VERIFICATION', releaseId: nextManifest.releaseId, originalReleaseId: manifest.releaseId, deploymentId: options.deploymentId, artifactSha256: manifest.artifactSha256, manifestSha256: sha256(manifestBytes), observationSeconds: (observationFinished - observationStarted) / 1000, observations: observations.length, humanApprovalGranted: false, productionModified: false, nextGate: 'Owner registers and authorizes the new exact manifest for the same staged deployment; no activation is performed here.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verifyStagedRelease(stagedOptions()).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(cause => {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', reason: /^[a-z0-9_:.-]+$/.test(cause.code || cause.message) ? (cause.code || cause.message) : 'staged_verification_failed', productionModified: false }) + '\n');
    process.exitCode = 2;
  });
}
