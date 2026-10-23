/**
 * Read-only hosted adapter. Never imports the Foundry stage/approve CLI code.
 * The JSON module is bundled at build time and contains reviewed metadata only.
 */
import fs from 'node:fs';
import path from 'node:path';
import approvedRecords from '../../catalog/foundry-approved.json' with {type:'json'};
import {validateApprovedRecords} from './metadata.mjs';

const SKILL_ROOT=path.resolve(process.cwd(),'skills');
export function selectApprovedFoundrySkills(records,existingSkills=[],readContent){
  const result=validateApprovedRecords(records,{
    existingNames:existingSkills.map(skill=>skill.name),readContent,
  });
  return result.valid?result.skills:[];
}
export function loadApprovedFoundrySkills(existingSkills=[]){
  return selectApprovedFoundrySkills(approvedRecords,existingSkills,
    name=>fs.readFileSync(path.join(SKILL_ROOT,name,'SKILL.md')));
}
