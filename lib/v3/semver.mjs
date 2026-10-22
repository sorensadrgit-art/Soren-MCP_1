/** Minimal SemVer 2.0 subset for version-aware recommendations (no dependency added). */
const FULL=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const LOOSE=/^(?:[\^~]|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(-[0-9A-Za-z.-]+)?$/;

export function parseVersion(value){
  const m=FULL.exec(String(value??'').trim());
  if(!m)return null;
  return {major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3]),prerelease:m[4]?m[4].split('.'):[]};
}

export function isPrerelease(value){
  return (parseVersion(value)?.prerelease.length??0)>0;
}

/** Turns "^9.8.2", "~0.186.1" or "19" into a concrete version; tags and protocols return null. */
export function coerceVersion(spec){
  const m=LOOSE.exec(String(spec??'').trim());
  if(!m)return null;
  const part=v=>(v===undefined||v==='x'||v==='*')?'0':v;
  return `${m[1]}.${part(m[2])}.${part(m[3])}${m[4]??''}`;
}

function compareIdentifiers(a,b){
  const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);
  if(an&&bn)return Number(a)-Number(b);
  if(an)return -1;
  if(bn)return 1;
  return a<b?-1:a>b?1:0;
}

export function compareVersions(a,b){
  const x=typeof a==='string'?parseVersion(a):a,y=typeof b==='string'?parseVersion(b):b;
  for(const key of ['major','minor','patch'])if(x[key]!==y[key])return x[key]-y[key];
  if(!x.prerelease.length&&!y.prerelease.length)return 0;
  if(!x.prerelease.length)return 1;
  if(!y.prerelease.length)return -1;
  for(let i=0;i<Math.max(x.prerelease.length,y.prerelease.length);i++){
    if(x.prerelease[i]===undefined)return -1;
    if(y.prerelease[i]===undefined)return 1;
    const c=compareIdentifiers(x.prerelease[i],y.prerelease[i]);
    if(c)return c;
  }
  return 0;
}

const sameTuple=(a,b)=>a.major===b.major&&a.minor===b.minor&&a.patch===b.patch;

/**
 * Space-separated comparators joined by "||". Following npm semantics, a prerelease
 * only satisfies a set when one comparator in that set has a prerelease on the same tuple.
 */
export function satisfies(version,range){
  const v=parseVersion(version);
  if(!v)return false;
  return String(range??'').split('||').some(set=>{
    const comparators=set.trim().split(/\s+/).filter(Boolean).map(token=>{
      const m=/^(>=|<=|>|<|=)?(.+)$/.exec(token);
      const target=parseVersion(coerceVersion(m[2])??'');
      return target?{op:m[1]||'=',target}:null;
    });
    if(!comparators.length||comparators.includes(null))return false;
    if(v.prerelease.length&&!comparators.some(c=>c.target.prerelease.length&&sameTuple(c.target,v)))return false;
    return comparators.every(({op,target})=>{
      const c=compareVersions(v,target);
      return op==='>='?c>=0:op==='<='?c<=0:op==='>'?c>0:op==='<'?c<0:c===0;
    });
  });
}
