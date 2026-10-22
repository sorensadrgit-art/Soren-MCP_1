import {loadCatalog} from '../v3/data.mjs';

export const INTEGRATIONS=loadCatalog('integrations').items;
/** Catalog states. A caller saying a server is connected is reported separately as "client_reported", never "verified". */
export const CONNECTION_STATES=Object.freeze(['suggested','documented','configured','authenticated','verified','blocked']);
export const CATEGORIES=Object.freeze([...new Set(INTEGRATIONS.map(i=>i.category))].sort());
const ID=/^[a-z0-9][a-z0-9-]{1,62}$/;

export function getIntegration(id){
  if(typeof id!=='string'||!ID.test(id))return null;
  return INTEGRATIONS.find(i=>i.id===id)??null;
}

export function summarizeIntegration(i){
  return {id:i.id,name:i.name,vendor:i.vendor,category:i.category,kind:i.kind,transport:i.transport,endpoint:i.endpoint,
    package:i.package,sourceUrl:i.sourceUrl,docsUrl:i.docsUrl,license:i.license,runtime:i.runtime,capabilities:i.capabilities,
    auth:i.auth,executionRisk:i.executionRisk,requiresLocalExecution:i.requiresLocalExecution,proxiedBySoren:false,
    automaticallyConnected:false,catalogStatus:i.status,observations:i.observations,requirements:i.requirements,
    cautions:i.cautions,skill:i.skill,knowledgeIds:i.knowledgeIds,guidance:i.guidance};
}

export function listIntegrations({category}={}){
  return INTEGRATIONS.filter(i=>!category||i.category===category);
}

/** Projection in the live 2.4.0 list_providers agentMcpIntegrations shape; legacy entries come first. */
export function legacyAgentIntegrations(){
  const ordered=[...INTEGRATIONS.filter(i=>i.legacy),...INTEGRATIONS.filter(i=>!i.legacy)];
  return ordered.map(i=>{
    const entry={id:i.id,name:i.name,category:i.category,transport:i.transport};
    if(i.endpoint)entry.endpoint=i.endpoint;
    if(i.setup.mode==='stdio'||i.setup.mode==='cli'){entry.command=i.setup.command;entry.args=i.setup.args;}
    return {...entry,sourceUrl:i.sourceUrl,authentication:i.auth,connectionState:'agent_managed_unverified',
      proxiedBySoren:false,automaticallyConnected:false,requiresLocalExecution:i.requiresLocalExecution,skill:i.skill,guidance:i.guidance};
  });
}
