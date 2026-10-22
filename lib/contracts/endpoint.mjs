export function verificationEndpoint(value){
  const url=new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.pathname!=='/api/mcp'||url.search||url.hash)throw new Error('Require an HTTPS MCP endpoint or explicit loopback development endpoint');
  return url.href;
}

/** Vercel protection-bypass header for a protected *.vercel.app verification target; empty for any other host. */
export function protectionBypassHeaders(endpoint,secret=process.env.VERCEL_PROTECTION_BYPASS){
  if(!secret)return {};
  const url=new URL(endpoint);
  return url.protocol==='https:'&&url.hostname.endsWith('.vercel.app')?{'x-vercel-protection-bypass':secret}:{};
}
