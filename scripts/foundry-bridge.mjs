#!/usr/bin/env node
/**
 * Local only: stage approved bytes; never invoke Foundry, install packages,
 * execute imported instructions, or implicitly approve an artifact.
 */
import path from 'node:path';
import {stageFoundrySkill,approveFoundrySkill,verifyFoundryRegistry} from '../lib/foundry/bridge.mjs';

function usage(){
  return [
    'SOREN Foundry Curation Bridge (local, owner-gated)',
    '  node scripts/foundry-bridge.mjs stage --skill PATH --evidence PATH',
    '  node scripts/foundry-bridge.mjs approve --name SLUG --skill-sha256 HEX --evidence-sha256 HEX --evidence PATH --reviewer HANDLE --confirm-reviewed',
    '  node scripts/foundry-bridge.mjs verify',
    'Optional: --root PATH for an isolated project/test checkout.',
    'Never approve without personally reviewing the exact Foundry release check,',
    'original SKILL.md, provenance, permissions, licensing, and safety concerns.',
  ].join('\n');
}
function parseArgs(args){
  const command=args.shift(),options={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--confirm-reviewed'){options.confirmManualReview=true;continue;}
    if(!/^--[a-z][a-z0-9-]*$/.test(arg))throw new Error('Invalid argument: '+arg);
    const name=arg.slice(2);
    if(!['skill','evidence','name','skill-sha256','evidence-sha256','reviewer','root'].includes(name))
      throw new Error('Unknown option: '+arg);
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+arg);
    options[name]=args[++i];
  }
  return {command,options};
}
async function main(){
  const {command,options}=parseArgs(process.argv.slice(2));
  if(command==='--help'||command==='help'||!command){console.log(usage());return;}
  const projectRoot=path.resolve(options.root||process.cwd());
  if(command==='stage'){
    if(!options.skill||!options.evidence)throw new Error('Provide --skill and --evidence paths.');
    const staged=stageFoundrySkill({projectRoot,skillFile:path.resolve(options.skill),
      evidenceFile:path.resolve(options.evidence)});
    console.log(JSON.stringify({status:staged.status,name:staged.name,skillSha256:staged.skillSha256,
      evidenceSha256:staged.evidenceSha256,pendingDirectory:'catalog/foundry-pending/'+staged.name,
      nextAction:'Review exact staged bytes and Foundry release evidence; owner must approve manually.'},null,2));
    return;
  }
  if(command==='approve'){
    const record=approveFoundrySkill({projectRoot,name:options.name,skillSha256:options['skill-sha256'],
      evidenceSha256:options['evidence-sha256'],evidenceFile:options.evidence&&path.resolve(options.evidence),
      reviewer:options.reviewer,confirmManualReview:options.confirmManualReview});
    console.log(JSON.stringify({status:record.status,name:record.name,uri:record.uri,
      skillSha256:record.skillSha256,evidenceSha256:record.evidenceSha256,
      nextAction:'Run foundry:verify, tests and build; raise owner-reviewed draft PR. No automatic deployment.'},null,2));
    return;
  }
  if(command==='verify'){
    const report=verifyFoundryRegistry(projectRoot);
    console.log(JSON.stringify({valid:report.valid,approvedSkills:report.skills.map(x=>x.name),errors:report.errors},null,2));
    if(!report.valid)process.exitCode=1;
    return;
  }
  throw new Error('Unknown command.\n'+usage());
}
main().catch(error=>{console.error('Foundry bridge:',error.message);process.exitCode=1;});
