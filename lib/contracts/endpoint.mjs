export function verificationEndpoint(value){
  const url=new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.pathname!=='/api/mcp'||url.search||url.hash)throw new Error('Require an HTTPS MCP endpoint or explicit loopback development endpoint');
  return url.href;
}
