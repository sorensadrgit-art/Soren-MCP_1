import {createHash} from 'node:crypto';
import {loadCatalog,stableStringify} from '../v3/data.mjs';

export const KNOWLEDGE_ITEMS=loadCatalog('knowledge').items;
const DAY=86400000;
const HASHED_FIELDS=['id','kind','title','summary','keyPoints','topics','canonicalSource','sourceRevision','packageRange','frameworkVersions','channel','context7LibraryId','license','warnings'];

/** Integrity hash over the reviewed fields; any edit requires re-review and `node scripts/knowledge-hash.mjs --write`. */
export function computeContentSha256(item){
  const subset=Object.fromEntries(HASHED_FIELDS.map(key=>[key,item[key]??null]));
  return createHash('sha256').update(stableStringify(subset)).digest('hex');
}

export function getKnowledgeItem(id){
  return KNOWLEDGE_ITEMS.find(item=>item.id===id)??null;
}

export function freshness(item,now=new Date()){
  const verified=Date.parse(item.lastVerifiedAt+'T00:00:00Z');
  const ageDays=Math.max(0,Math.floor((now.getTime()-verified)/DAY));
  const maxAgeDays=item.expiryPolicy.maxAgeDays;
  return {status:ageDays>maxAgeDays?'stale':'fresh',ageDays,maxAgeDays,
    expiresOn:new Date(verified+maxAgeDays*DAY).toISOString().slice(0,10),invalidateOn:item.expiryPolicy.invalidateOn};
}

export function knowledgeResourceUri(id){
  return `soren://knowledge/${id}`;
}
