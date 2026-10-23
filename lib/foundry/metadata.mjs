/** Pure metadata and exact-content approval validation. No filesystem access. */
import {createHash} from 'node:crypto';

export const MAX_SKILL=100*1024;
export const MAX_EVIDENCE=256*1024;
const VALID_NAME=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VALID_SHA=/^[a-f0-9]{64}$/;
const STOP=new Set(['with','that','this','your','from','into','using','build','make','create',
  'skill','skills','agent','agents','workflow','workflows','instructions','guide','guidance',
  'and','the','for','are','you','a','an','to','of','in','on','by','as','is','or','can','use','new']);
export const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
export function requireName(name){
  if(typeof name!=='string'||name.length<3||name.length>64||!VALID_NAME.test(name))
    throw new Error('Invalid skill name: expected lowercase kebab-case, 3-64 characters.');
  return name;
}
export function requireDigest(value,label){
  if(typeof value!=='string'||!VALID_SHA.test(value))throw new Error('Invalid '+label+' SHA-256 digest.');
}
function unquote(raw){
  const value=raw.trim();
  if(value.startsWith('"')&&value.endsWith('"')){
    try{return JSON.parse(value);}catch{throw new Error('Malformed quoted frontmatter value.');}
  }
  if(value.startsWith("'")&&value.endsWith("'"))return value.slice(1,-1).replace(/''/g,"'");
  return value;
}
function deriveTags(name,description,rawTags){
  const text=[name.replaceAll('-',' '),description].join(' ').toLowerCase();
  const tags=[...new Set((text.match(/[a-z0-9][a-z0-9.+-]*/g)||[])
    .filter(word=>word.length>1&&!STOP.has(word)&&word.length<=38))].slice(0,16);
  let explicit=[];
  if(rawTags){
    if(Array.isArray(rawTags))explicit=rawTags;
    else if(typeof rawTags==='string'&&rawTags.trim().startsWith('[')){
      try{explicit=JSON.parse(rawTags);}
      catch{explicit=rawTags.trim().replace(/^\[/,'').replace(/\]$/,'').split(',').map(x=>unquote(x));}
    }else explicit=String(rawTags).split(',').map(x=>unquote(x));
  }
  if(!Array.isArray(explicit))throw new Error('tags must be an array or comma-separated values.');
  for(const tag of explicit){
    if(typeof tag!=='string'||!(/^[a-z0-9][a-z0-9 .+#-]{0,39}$/i.test(tag)))
      throw new Error('Invalid routing tag.');
    const normalized=tag.toLowerCase().trim();
    if(normalized&&!tags.includes(normalized)&&tags.length<20)tags.push(normalized);
  }
  return tags;
}
export function parseSkillMetadata(markdown){
  if(typeof markdown!=='string'||Buffer.byteLength(markdown)>MAX_SKILL)
    throw new Error('SKILL.md is missing or too large.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(markdown))
    throw new Error('SKILL.md contains disallowed control characters.');
  const match=/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if(!match)throw new Error('SKILL.md must start with YAML frontmatter.');
  const body=markdown.slice(match[0].length);
  if(!body.trim())throw new Error('SKILL.md body cannot be empty.');
  const lines=match[1].split(/\r?\n/),data={};
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const property=/^([a-zA-Z][a-zA-Z0-9_-]{0,50}):[ \t]*(.*)$/.exec(line);
    if(!property)continue; // Ignore other YAML metadata, never evaluate it.
    const key=property[1].toLowerCase();
    if(!['name','description','tags'].includes(key))continue;
    if(Object.hasOwn(data,key))throw new Error('Duplicate '+key+' frontmatter entry.');
    let value=property[2];
    if(/^[>|][+-]?$/.test(value)&&key==='description'){
      const block=[],join=value.startsWith('>')?' ':'\n';
      while(i+1<lines.length&&(/^[ \t]+/.test(lines[i+1])||!lines[i+1].trim())){
        i++;block.push(lines[i].trim());
      }
      value=block.join(join);
    }else if(key==='tags'&&!value){
      const block=[];
      while(i+1<lines.length&&/^[ \t]+-\s+/.test(lines[i+1])){
        i++;block.push(unquote(lines[i].replace(/^[ \t]+-\s+/,'')));
      }
      value=block;
    }else value=unquote(value);
    data[key]=value;
  }
  const name=requireName(data.name);
  const description=data.description;
  if(typeof description!=='string'||description.length<10||description.length>560)
    throw new Error('SKILL.md requires a description between 10 and 560 characters.');
  return {name,description,tags:deriveTags(name,description,data.tags)};
}
export function validateApprovedRecords(records,{existingNames=[],readContent}={}){
  const errors=[],skills=[],seen=new Set();
  if(!Array.isArray(records))return {valid:false,errors:['approved registry must be an array'],skills:[]};
  if(typeof readContent!=='function')return {valid:false,errors:['approved content reader missing'],skills:[]};
  for(const [index,record] of records.entries()){
    const prefix='record['+index+']: ';
    try{
      const name=requireName(record?.name);
      if(seen.has(name)||existingNames.includes(name))throw new Error('duplicate or existing skill name');
      seen.add(name);
      if(record.schemaVersion!==1||record.status!=='curated'||record.origin!=='skill-foundry-core-v3'||
        record.uri!=='skill://'+name+'/SKILL.md')throw new Error('invalid registry status, origin, or URI');
      requireDigest(record.skillSha256,'skill');requireDigest(record.evidenceSha256,'evidence');
      if(record.review?.explicitManualApproval!==true||record.review?.releaseEvidenceReviewed!==true||
        typeof record.review?.reviewer!=='string'||!record.review.reviewer.trim()||
        !Number.isFinite(Date.parse(record.review?.reviewedAt)))throw new Error('missing manual review receipt');
      const content=readContent(name);
      if(!Buffer.isBuffer(content)||content.length===0||content.length>MAX_SKILL)
        throw new Error('approved skill must be a nonempty bounded SKILL.md');
      if(sha256(content)!==record.skillSha256)throw new Error('approved skill content SHA-256 mismatch');
      const meta=parseSkillMetadata(content.toString('utf8'));
      if(meta.name!==name||meta.description!==record.description||
        JSON.stringify(meta.tags)!==JSON.stringify(record.tags))
        throw new Error('approved metadata differs from content');
      skills.push({name,description:meta.description,tags:meta.tags,status:'curated',uri:record.uri,
        origin:'skill-foundry-core-v3',contentSha256:record.skillSha256});
    }catch(error){errors.push(prefix+String(error.message));}
  }
  return {valid:errors.length===0,errors,skills:errors.length?[]:skills};
}
