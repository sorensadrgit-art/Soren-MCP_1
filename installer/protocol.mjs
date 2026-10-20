import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ENDPOINT, MCP_SERVER_NAME, TOOL_NAMES } from '../lib/client-contract.mjs';

export async function verifyProtocol(options = {}) {
  const client = new Client({ name: 'soren-local-installer-verifier', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'legacy' } });
  const boundedFetch = async (url, init = {}) => {
    if (new URL(url).href !== ENDPOINT) throw new Error('UNEXPECTED_PROTOCOL_DESTINATION');
    const response = await (options.fetch || fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(10000)]) });
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1048576) { await reader.cancel(); throw new Error('PROTOCOL_RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), { fetch: boundedFetch, requestInit: { redirect: 'error' }, reconnectionOptions: { maxRetries: 0 } });
  try {
    await client.connect(transport, { timeout: 10000 });
    if (client.getServerVersion()?.name !== MCP_SERVER_NAME) throw new Error('UNEXPECTED_SERVER_IDENTITY');
    const { tools } = await client.listTools({}, { timeout: 10000 });
    if (tools.length !== TOOL_NAMES.length || TOOL_NAMES.some(name => !tools.some(tool => tool.name === name && tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false))) throw new Error('TOOL_CONTRACT_MISMATCH');
    const { resources } = await client.listResources({}, { timeout: 10000 });
    if (resources.length !== 4 || !resources.some(resource => resource.uri === 'skill://motion-systems/SKILL.md')) throw new Error('RESOURCE_CONTRACT_MISMATCH');
    const read = await client.readResource({ uri: 'skill://motion-systems/SKILL.md' }, { timeout: 10000 });
    if (!read.contents.some(content => typeof content.text === 'string' && content.text.includes('name: motion-systems'))) throw new Error('BUNDLED_READ_FAILED');
    const call = await client.callTool({ name: 'route_task', arguments: { task: 'GSAP animation guidance', discovery: 'local', runtime: 'installer-verifier' } }, { timeout: 10000 });
    if (call.isError) throw new Error('LOCAL_MODE_CALL_FAILED');
    const text = call.content.find(content => content.type === 'text')?.text;
    const route = JSON.parse(text);
    if (route.discoveryMode !== 'local' || (route.discoveredCandidates || []).length !== 0) throw new Error('LOCAL_MODE_CONTRACT_MISMATCH');
    return { status: 'PASS', level: 'TOOLS_AVAILABLE', protocol: '2025-06-18-compatible SDK handshake', tools: TOOL_NAMES, bundledResources: resources.length, harmlessCall: 'route_task(discovery=local)', authenticated: 'NOT_APPLICABLE', nativeInvocation: 'NOT_RUN' };
  } catch (cause) {
    return { status: 'FAIL', level: 'PROTOCOL_VERIFIED', reason: /^[A-Z_]+$/.test(cause.message) ? cause.message : 'MCP_EXCHANGE_FAILED', authenticated: 'NOT_APPLICABLE', nativeInvocation: 'NOT_RUN' };
  } finally { await client.close().catch(() => {}); }
}
