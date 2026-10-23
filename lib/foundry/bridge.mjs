/**
 * Offline owner-gated Skill Foundry -> SOREN curation CLI operations.
 * NOT imported into hosted SOREN MCP. No network calls or skill execution.
 */
import fs from 'node:fs';
import path from 'node:path';
import {MAX_SKILL,MAX_EVIDENCE,sha256,requireName,requireDigest,
  parseSkillMetadata,validateApprovedRecords} from './metadata.mjs';

export {parseSkillMetadata} from './metadata.mjs';
const json=value=>JSON.stringify(value,null,2)+'\n';
function safeFile(file,maxBytes,label){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>maxBytes)
    throw new Error(label+' must be a regular, non-empty file within the size limit.');
  return fs.readFileSync(file);
}
function readEvidence(file){
  const bytes=safeFile(file,MAX_EVIDENCE,'Foundry evidence');
  let value;
  try{value=JSON.parse(bytes.toString('utf8'));}
  catch{throw new Error('Foundry evidence must be JSON.');}
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('Foundry evidence must be an object.');
  // File metadata/fingerprint only: never claim the evidence is independently verified.
  return {sha256:sha256(bytes)};
}
const paths=(root,name)=>({
  pending:path.join(root,'catalog','foundry-pending',name),
  manifest:path.join(root,'catalog','foundry-pending',name,'manifest.json'),
  stagedSkill:path.join(root,'catalog','foundry-pending',name,'SKILL.md'),
  registry:path.join(root,'catalog','foundry-approved.json'),
  approvedDir:path.join(root,'skills',name),
  approvedSkill:path.join(root,'skills',name,'SKILL.md'),
});
function readRegistry(file){
  if(!fs.existsSync(file))return [];
  let records;
  try{records=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error('Invalid Foundry approved registry JSON.');}
  if(!Array.isArray(records))throw new Error('Foundry approved registry must be an array.');
  return records;
}
export function stageFoundrySkill({projectRoot=process.cwd(),skillFile,evidenceFile,existingNames=[]}){
  if(!skillFile||!evidenceFile)throw new Error('Both a SKILL.md and Foundry evidence JSON are required.');
  const root=path.resolve(projectRoot);
  const bytes=safeFile(skillFile,MAX_SKILL,'SKILL.md');
  const metadata=parseSkillMetadata(bytes.toString('utf8'));
  const p=paths(root,metadata.name);
  if(existingNames.includes(metadata.name)||fs.existsSync(p.approvedDir))
    throw new Error('Skill name already exists in the curated catalog.');
  if(fs.existsSync(p.pending))throw new Error('Skill is already staged for review.');
  const evidence=readEvidence(evidenceFile);
  const record={schemaVersion:1,status:'pending_review',...metadata,origin:'skill-foundry-core-v3',
    skillSha256:sha256(bytes),evidenceSha256:evidence.sha256,stagedAt:new Date().toISOString(),
    reviewRequired:'Inspect exact SKILL.md, Foundry gates, release check, provenance, licensing, and all security risks.'};
  fs.mkdirSync(path.dirname(p.pending),{recursive:true});
  fs.mkdirSync(p.pending);
  try{
    fs.writeFileSync(p.stagedSkill,bytes,{flag:'wx'});
    fs.writeFileSync(p.manifest,json(record),{flag:'wx'});
  }catch(error){fs.rmSync(p.pending,{recursive:true,force:true});throw error;}
  return record;
}
export function approveFoundrySkill({projectRoot=process.cwd(),name,skillSha256,
  evidenceSha256,evidenceFile,reviewer,confirmManualReview=false,existingNames=[]}){
  const root=path.resolve(projectRoot);requireName(name);
  if(confirmManualReview!==true)throw new Error('Explicit manual review confirmation is required.');
  if(typeof reviewer!=='string'||!(/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(reviewer)))
    throw new Error('Named reviewer is required.');
  requireDigest(skillSha256,'skill');requireDigest(evidenceSha256,'evidence');
  if(!evidenceFile)throw new Error('Original Foundry evidence JSON is required at approval.');
  const p=paths(root,name);
  if(fs.existsSync(p.approvedDir))throw new Error('Skill is already approved or conflicts with existing content.');
  if(!fs.existsSync(p.manifest))throw new Error('No staged Foundry candidate with this name.');
  const staged=JSON.parse(fs.readFileSync(p.manifest,'utf8'));
  if(staged.name!==name||staged.status!=='pending_review'||staged.schemaVersion!==1)
    throw new Error('Invalid staging manifest state.');
  const bytes=safeFile(p.stagedSkill,MAX_SKILL,'Staged SKILL.md');
  const metadata=parseSkillMetadata(bytes.toString('utf8'));
  if(metadata.name!==name||metadata.description!==staged.description||
    JSON.stringify(metadata.tags)!==JSON.stringify(staged.tags))
    throw new Error('Staged skill metadata changed after staging.');
  if(sha256(bytes)!==staged.skillSha256||skillSha256!==staged.skillSha256)
    throw new Error('Staged SKILL.md SHA-256 hash mismatch.');
  if(readEvidence(evidenceFile).sha256!==staged.evidenceSha256||
    evidenceSha256!==staged.evidenceSha256)
    throw new Error('Foundry evidence SHA-256 hash mismatch.');

  fs.mkdirSync(path.dirname(p.registry),{recursive:true});
  const lock=p.registry+'.lock';
  try{fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}
  catch{throw new Error('Another Foundry approval is running, or a stale lock needs review.');}
  try{
    const current=verifyFoundryRegistry(root,{existingNames});
    if(!current.valid)throw new Error('Existing Foundry registry has invalid approved records: '+current.errors.join('; '));
    const records=readRegistry(p.registry);
    if(records.some(record=>record.name===name))throw new Error('Skill is already approved.');
    if(existingNames.includes(name)||fs.existsSync(p.approvedDir))
      throw new Error('Foundry approval would collide with an existing curated skill.');
    const record={schemaVersion:1,name,description:metadata.description,tags:metadata.tags,
      status:'curated',uri:'skill://'+name+'/SKILL.md',origin:'skill-foundry-core-v3',
      skillSha256,evidenceSha256,review:{reviewer,reviewedAt:new Date().toISOString(),
        explicitManualApproval:true,releaseEvidenceReviewed:true}};
    fs.mkdirSync(path.join(root,'skills'),{recursive:true});
    fs.mkdirSync(p.approvedDir); // Exclusive; never destroy pre-existing user content.
    const tmp=p.registry+'.tmp-'+process.pid;
    try{
      fs.writeFileSync(p.approvedSkill,bytes,{flag:'wx'});
      fs.writeFileSync(tmp,json([...records,record].sort((a,b)=>a.name.localeCompare(b.name))),{flag:'wx'});
      fs.renameSync(tmp,p.registry);
    }catch(error){
      fs.rmSync(tmp,{force:true});
      fs.rmSync(p.approvedDir,{recursive:true,force:true});
      throw error;
    }
    fs.rmSync(p.pending,{recursive:true,force:true});
    return record;
  }finally{fs.rmSync(lock,{force:true});}
}
export function verifyFoundryRegistry(projectRoot=process.cwd(),{existingNames=[]}={}){
  const root=path.resolve(projectRoot);
  let records;
  try{records=readRegistry(path.join(root,'catalog','foundry-approved.json'));}
  catch(error){return {valid:false,errors:[String(error.message)],skills:[]};}
  return validateApprovedRecords(records,{existingNames,
    readContent:name=>safeFile(path.join(root,'skills',name,'SKILL.md'),MAX_SKILL,'Approved SKILL.md')});
}
