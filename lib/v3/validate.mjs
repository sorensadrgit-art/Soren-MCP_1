import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {loadCatalog} from './data.mjs';
import {SKILLS} from '../catalog.mjs';

const SCHEMA_ROOT=path.resolve(process.cwd(),'schemas');
const ajv=new Ajv2020({allErrors:true,strict:false});
addFormats(ajv);
const schema=name=>JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT,name+'.schema.json'),'utf8'));
const validators={
  knowledge:ajv.compile(schema('knowledge-item')),
  integrations:ajv.compile(schema('integration')),
  recipes:ajv.compile(schema('recipe')),
  profiles:ajv.compile(schema('profile')),
};

export function validateEntry(kind,entry){
  const validator=validators[kind];
  if(!validator)throw new Error('Unknown catalog kind');
  const valid=validator(entry);
  return {valid,errors:valid?[]:validator.errors.map(e=>`${e.instancePath||'/'} ${e.message}`)};
}

/** Schema validity is not enough: every id a catalog points at must resolve to a real entry. */
function crossReferenceErrors(){
  const skills=new Set(SKILLS.map(s=>s.name));
  const ids=kind=>new Set(loadCatalog(kind).items.map(i=>i.id));
  const knowledge=ids('knowledge'),recipes=ids('recipes'),integrations=ids('integrations');
  const errors=[];
  const need=(set,id,where)=>{if(!set.has(id))errors.push(`${where} references missing ${id}`);};
  for(const k of loadCatalog('knowledge').items){
    for(const s of k.linkedSkills)need(skills,s,'knowledge:'+k.id);
    for(const r of k.linkedRecipes)need(recipes,r,'knowledge:'+k.id);
    for(const d of k.dependencies)need(knowledge,d,'knowledge:'+k.id);
  }
  for(const i of loadCatalog('integrations').items){
    if(i.skill)need(skills,i.skill,'integrations:'+i.id);
    for(const k of i.knowledgeIds)need(knowledge,k,'integrations:'+i.id);
  }
  for(const p of loadCatalog('profiles').items){
    need(recipes,p.recipeId,'profiles:'+p.id);
    for(const s of [p.primarySkill,...p.complementarySkills])need(skills,s,'profiles:'+p.id);
    for(const i of [...p.requiredIntegrations,...p.optionalIntegrations])need(integrations,i,'profiles:'+p.id);
    for(const k of p.knowledgeIds)need(knowledge,k,'profiles:'+p.id);
  }
  return errors;
}

export function validateCatalogs(){
  const errors=[];
  for(const kind of Object.keys(validators)){
    const data=loadCatalog(kind);
    const ids=new Set();
    for(const entry of data.items){
      const result=validateEntry(kind,entry);
      for(const message of result.errors)errors.push(`${kind}:${entry.id??'?'} ${message}`);
      if(ids.has(entry.id))errors.push(`${kind}:${entry.id} duplicate id`);
      ids.add(entry.id);
    }
  }
  errors.push(...crossReferenceErrors());
  return {valid:errors.length===0,errors};
}
