import fs from 'node:fs';
import path from 'node:path';

const CATALOG_ROOT=path.resolve(process.cwd(),'catalog');
const NAMES=new Set(['knowledge','integrations','recipes','profiles']);

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
}

/** Reviewed catalog data lives in catalog/*.json so it can grow without changing router code. */
export function loadCatalog(name){
  if(!NAMES.has(name))throw new Error('Unknown catalog');
  const raw=fs.readFileSync(path.join(CATALOG_ROOT,name+'.json'),'utf8');
  return deepFreeze(JSON.parse(raw));
}

export function stableStringify(value){
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
  return JSON.stringify(value??null);
}

/** Same matching rule as the curated skill router: every word of a tag must appear in the query. */
export const terms=value=>[...new Set(String(value||'').toLowerCase().replace(/[^a-z0-9.+@/-]+/g,' ').split(/\s+/).filter(word=>word.length>=2))];

export function tagMatches(tags,query){
  const q=String(query||'').toLowerCase(),words=terms(q);
  const matched=[...new Set(tags.filter(tag=>{const parts=terms(tag);return parts.length&&parts.every(word=>words.includes(word));}))];
  const exact=tags.filter(tag=>tag.length>3&&q.includes(tag)).length;
  return {matched,score:matched.length+2*exact};
}
