import {getIntegration} from './catalog.mjs';

export const CLIENT_IDS=Object.freeze(['codex','factory','antigravity','opencode','claude','qwen']);
const SERENA_CONTEXT={codex:'codex',claude:'claude-code'};
const PREFLIGHT={
  codex:['codex --version','codex mcp list'],
  factory:['droid --version','droid mcp list'],
  claude:['claude --version','claude mcp list'],
  qwen:['qwen --version','qwen mcp list'],
  opencode:['opencode --version','opencode mcp list'],
  antigravity:['Open Antigravity > Agent panel > MCP Servers > Manage MCP Servers > View raw config and note existing entries'],
};
const CONFIG_FILE={opencode:'opencode.json (project) or ~/.config/opencode/opencode.json',antigravity:'Antigravity mcp_config.json (Manage MCP Servers > View raw config)'};
const quote=value=>/[\s"]/.test(value)?JSON.stringify(value):value;

function stdioArgs(integration,client){
  return integration.setup.args.map(arg=>arg==='{context}'?(SERENA_CONTEXT[client]??'ide'):arg);
}

function remoteCommands(client,id,setup){
  const env=setup.apiKeyEnv;
  switch(client){
    case 'codex':return [`codex mcp add ${id} --url ${setup.url}`+(env&&!setup.oauth?` --bearer-token-env-var ${env}`:''),...(setup.oauth?[`codex mcp login ${id}`]:[])];
    case 'claude':return [`claude mcp add --transport http --scope user ${id} ${setup.url}`+(env&&!setup.oauth?` --header "Authorization: Bearer \${${env}}"`:'')];
    case 'factory':return [`droid mcp add --type http ${id} ${setup.url}`+(env&&!setup.oauth?` --header "Authorization: Bearer \${${env}}"`:''),...(setup.oauth?['droid mcp auth']:[])];
    case 'qwen':return [`qwen mcp add --scope user --transport http ${id} ${setup.url}`+(env&&!setup.oauth?` --header "Authorization: Bearer \${${env}}"`:'')];
    default:return [];
  }
}

function stdioCommands(client,id,command,args,env){
  const line=[command,...args].map(quote).join(' ');
  const envFlag=env?` --env ${env}=<value-from-your-secret-store>`:'';
  switch(client){
    case 'codex':return [`codex mcp add ${id}${envFlag} -- ${line}`];
    case 'claude':return [`claude mcp add --scope user ${id}${env?` -e ${env}=<value-from-your-secret-store>`:''} -- ${line}`];
    case 'factory':return [`droid mcp add ${id} ${JSON.stringify(line)}${envFlag}`];
    case 'qwen':return [`qwen mcp add --scope user ${id}${env?` -e ${env}=<value-from-your-secret-store>`:''} -- ${line}`];
    default:return [];
  }
}

function configSnippet(client,id,setup,command,args){
  if(client==='opencode'){
    const server=setup.mode==='remote'?{type:'remote',url:setup.url,enabled:true}:{type:'local',command:[command,...args],enabled:true};
    if(setup.apiKeyEnv&&setup.mode==='remote'&&!setup.oauth)server.headers={Authorization:`Bearer {env:${setup.apiKeyEnv}}`};
    if(setup.apiKeyEnv&&setup.mode!=='remote')server.environment={[setup.apiKeyEnv]:`{env:${setup.apiKeyEnv}}`};
    return {file:CONFIG_FILE.opencode,json:{$schema:'https://opencode.ai/config.json',mcp:{[id]:server}}};
  }
  if(client==='antigravity'){
    const server=setup.mode==='remote'?{serverUrl:setup.url}:{command,args};
    if(setup.apiKeyEnv&&setup.mode!=='remote')server.env={[setup.apiKeyEnv]:'<value-from-your-secret-store>'};
    return {file:CONFIG_FILE.antigravity,json:{mcpServers:{[id]:server}}};
  }
  return null;
}

function removeCommand(client,id){
  return {codex:`codex mcp remove ${id}`,factory:`droid mcp remove ${id}`,claude:`claude mcp remove --scope user ${id}`,qwen:`qwen mcp remove ${id}`}[client]
    ??`Remove the "${id}" entry from ${CONFIG_FILE[client]} and restore your backup`;
}

/**
 * Dry-run setup guidance only. SOREN never runs these commands, never edits client configuration
 * and never handles credentials; values are referenced by environment-variable name.
 */
export function getClientSetupGuide(client,integrationId){
  if(!CLIENT_IDS.includes(client))throw new Error('Unsupported client');
  const integration=getIntegration(integrationId);
  if(!integration)throw new Error('Unknown integration');
  const {setup}=integration,id=integration.id;
  const supported=(setup.supportedClients??CLIENT_IDS).includes(client);
  const base={client,integration:id,name:integration.name,kind:integration.kind,mode:setup.mode,dryRunOnly:true,executedBySoren:false,
    supported,unsupportedReason:supported?null:(setup.unsupportedReason??'Client not documented as supported.'),
    preflight:['Back up the client MCP configuration before changing it',...PREFLIGHT[client]],
    requirements:integration.requirements,cautions:integration.cautions,
    credentials:setup.apiKeyEnv?{envVar:setup.apiKeyEnv,note:'Set this in your shell or secret manager. Never paste values into chat, commit them, or send them to SOREN.'}:null,
    oauth:Boolean(setup.oauth),installHint:setup.installHint??null,
    verify:[setup.verifyHint??'Call one harmless read-only tool natively from the client.','Record the connection as verified only after a successful native tool call in that client.'],
    sourceUrl:integration.docsUrl};
  if(!supported)return {...base,commands:[],configSnippet:null,rollback:[]};
  if(setup.mode==='isolated'){
    return {...base,commands:[],configSnippet:null,isolationRequired:true,
      manualSteps:['Provision a disposable VM or machine with no personal or production files.',setup.installHint,'Start the add-on server inside Blender manually for this session only.','Stop the add-on server and discard the VM snapshot afterwards.'],
      rollback:['Stop the Blender add-on server','Remove the server entry from the VM agent client','Revert the VM snapshot']};
  }
  if(setup.mode==='cli'){
    const cli=[setup.command,...setup.args].join(' ');
    return {...base,commands:[`${cli} inspect <input.glb>`,`${cli} validate <input.glb>`,`${cli} optimize <input.glb> <output.glb> --compress meshopt --texture-compress webp`],
      configSnippet:null,notAnMcpServer:true,rollback:['Delete the generated output file; source assets are never overwritten']};
  }
  const args=setup.mode==='stdio'?stdioArgs(integration,client):[];
  const commands=setup.mode==='remote'?remoteCommands(client,id,setup):stdioCommands(client,id,setup.command,args,setup.apiKeyEnv);
  const notes=[];
  if(setup.mode==='stdio')notes.push('On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.');
  if(client==='opencode'||client==='antigravity')notes.push('Edit the config file by hand; SOREN does not modify client configuration.');
  return {...base,commands,configSnippet:configSnippet(client,id,setup,setup.command,args),notes,rollback:[removeCommand(client,id)]};
}
