import {KNOWLEDGE_ITEMS,freshness,knowledgeResourceUri} from './catalog.mjs';
import {coerceVersion,isPrerelease,satisfies} from '../v3/semver.mjs';
import {terms,tagMatches} from '../v3/data.mjs';

const PACKAGE_NAME=/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
export const MAX_PACKAGES=40;

/** Rejects malformed or oversized package maps before they influence any recommendation. */
export function normalizePackages(packages){
  if(packages==null)return {};
  if(typeof packages!=='object'||Array.isArray(packages))throw new Error('Invalid package map');
  const entries=Object.entries(packages);
  if(entries.length>MAX_PACKAGES)throw new Error('Too many packages');
  const out={};
  for(const [name,version] of entries){
    if(name.length>214||!PACKAGE_NAME.test(name))throw new Error('Invalid package name');
    out[name]=String(version??'').slice(0,40);
  }
  return out;
}

/** Compares a project's declared versions with an item's documented ranges. */
export function assessCompatibility(item,packages={}){
  const checks=[];
  for(const [name,range] of Object.entries({...item.frameworkVersions,...item.packageRange})){
    if(!(name in packages))continue;
    const version=coerceVersion(packages[name]);
    checks.push({package:name,range,declared:packages[name],version,ok:version?satisfies(version,range):null});
  }
  const status=!checks.length||checks.every(c=>c.ok===null)?'unknown':checks.some(c=>c.ok===false)?'incompatible':'compatible';
  return {status,checks};
}

function score(item,query,packages){
  const topic=tagMatches(item.topics,query);
  const titleWords=terms(item.title),words=terms(query);
  const titleHits=words.filter(word=>titleWords.includes(word)).length;
  const coreTopic=topic.matched.includes(item.topics[0])?0.5:0;
  const projectUsesPrerelease=Object.keys(item.packageRange).some(name=>name in packages&&isPrerelease(coerceVersion(packages[name])??''));
  const prereleasePenalty=item.channel!=='stable'&&!projectUsesPrerelease?2:0;
  const value=topic.score+0.5*titleHits+coreTopic-prereleasePenalty;
  return {value:topic.score>0||titleHits>=2?value:0,reasons:topic.matched.slice(0,4).map(tag=>'Matched topic: '+tag)};
}

function project(item,{value,reasons},packages,now){
  return {id:item.id,title:item.title,kind:item.kind,summary:item.summary,keyPoints:item.keyPoints,
    url:item.canonicalSource.url,publisher:item.canonicalSource.publisher,official:item.canonicalSource.official,
    sourceRevision:item.sourceRevision,channel:item.channel,trustLevel:item.trustLevel,license:item.license,
    context7LibraryId:item.context7LibraryId,packageRange:item.packageRange,frameworkVersions:item.frameworkVersions,
    retrievedAt:item.retrievedAt,lastVerifiedAt:item.lastVerifiedAt,contentSha256:item.contentSha256,
    freshness:freshness(item,now),compatibility:assessCompatibility(item,packages),warnings:item.warnings,
    linkedSkills:item.linkedSkills,linkedRecipes:item.linkedRecipes,resourceUri:knowledgeResourceUri(item.id),
    score:Math.round(value*100)/100,reasons};
}

/**
 * Progressive, metadata-first retrieval: returns a primary source plus at most two complementary
 * ones by default. Never reads private workspaces and never returns unapproved items.
 * @param {string} query
 * @param {{packages?:Record<string,string>,limit?:number,includeStale?:boolean,now?:Date,items?:any[]}} [options]
 */
export function searchKnowledge(query,{packages,limit=3,includeStale=false,now=new Date(),items=KNOWLEDGE_ITEMS}={}){
  const q=String(query??'').slice(0,200);
  const pkgs=normalizePackages(packages);
  const count=Number.isFinite(limit)?Math.max(1,Math.min(10,Math.trunc(limit))):3;
  const warnings=[];
  for(const [name,declared] of Object.entries(pkgs)){
    const version=coerceVersion(declared);
    if(version&&isPrerelease(version))warnings.push(`Project declares prerelease ${name}@${declared}; prefer stable guidance unless the alpha/beta adoption is intentional and regression-tested.`);
    if(!version)warnings.push(`Could not resolve a concrete version for ${name} ("${declared}"); compatibility is unknown — read the lockfile.`);
  }
  if(!q.trim())return {query:q,primary:null,complementary:[],results:[],warnings,policy:POLICY};
  const matches=items.filter(item=>item.approved===true)
    .map(item=>({item,s:score(item,q,pkgs),stale:freshness(item,now).status!=='fresh',incompatible:assessCompatibility(item,pkgs).status==='incompatible'}))
    .filter(({s})=>s.value>0);
  const omittedStale=includeStale?[]:matches.filter(m=>m.stale).map(m=>m.item.id).sort();
  if(omittedStale.length)warnings.push(`${omittedStale.length} matching reviewed entr${omittedStale.length===1?'y is':'ies are'} stale and omitted (${omittedStale.join(', ')}); pass include_stale=true to see them with their freshness status.`);
  // Known-incompatible guidance never outranks a compatible or unknown match for the declared packages.
  const sorted=matches.filter(m=>includeStale||!m.stale)
    .sort((a,b)=>Number(a.incompatible)-Number(b.incompatible)||b.s.value-a.s.value||a.item.id.localeCompare(b.item.id));
  const cutIncompatible=sorted.slice(count).filter(m=>m.incompatible).map(m=>m.item.id).sort();
  if(cutIncompatible.length)warnings.push(`${cutIncompatible.length} matching entr${cutIncompatible.length===1?'y is':'ies are'} incompatible with the declared package versions and ranked out of the results (${cutIncompatible.join(', ')}).`);
  const ranked=sorted.slice(0,count).map(({item,s})=>project(item,s,pkgs,now));
  return {query:q,primary:ranked[0]??null,complementary:ranked.slice(1,3),results:ranked,omittedStale,warnings,policy:POLICY};
}

const POLICY='Reviewed public references only. Summaries are advisory; read the canonical source or Context7 for exact APIs. Project lockfile and bundled docs take precedence.';
