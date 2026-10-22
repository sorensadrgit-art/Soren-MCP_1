import test from 'node:test';
import assert from 'node:assert/strict';
import {RECIPES,PROFILES,getRecipe,getProfile} from '../../lib/recipes/catalog.mjs';
import {SKILLS} from '../../lib/catalog.mjs';
import {INTEGRATIONS} from '../../lib/integrations/catalog.mjs';
import {KNOWLEDGE_ITEMS} from '../../lib/knowledge/catalog.mjs';

const skillNames=new Set(SKILLS.map(s=>s.name)),integrationIds=new Set(INTEGRATIONS.map(i=>i.id)),knowledgeIds=new Set(KNOWLEDGE_ITEMS.map(k=>k.id));

test('profiles cover the blueprint and reference existing recipes, skills and integrations',()=>{
  for(const id of ['knowledge','next-app','web-qa','graphics-qa','immersive-web','blender-to-web','spline-to-web','debug-3d-performance'])assert.ok(getProfile(id),id);
  for(const p of PROFILES){
    assert.ok(getRecipe(p.recipeId),p.id+' recipe');
    for(const s of [p.primarySkill,...p.complementarySkills])assert.ok(skillNames.has(s),p.id+' skill '+s);
    for(const i of [...p.requiredIntegrations,...p.optionalIntegrations])assert.ok(integrationIds.has(i),p.id+' integration '+i);
    for(const k of p.knowledgeIds)assert.ok(knowledgeIds.has(k),p.id+' knowledge '+k);
  }
});

test('recipe steps reference real capabilities and gate risky actions behind humans',()=>{
  assert.equal(new Set(RECIPES.map(r=>r.id)).size,RECIPES.length);
  for(const r of RECIPES){
    assert.ok(r.approved===true&&r.reviewer,r.id);
    assert.ok(r.steps.length>=4,r.id);
    for(const step of r.steps){
      for(const s of step.skills)assert.ok(skillNames.has(s),r.id+'/'+step.id+' skill '+s);
      for(const i of step.integrations)assert.ok(integrationIds.has(i),r.id+'/'+step.id+' integration '+i);
      for(const k of step.knowledgeIds)assert.ok(knowledgeIds.has(k),r.id+'/'+step.id+' knowledge '+k);
      assert.ok(step.verification,r.id+'/'+step.id+' verification');
      if(['production-write','publish','oauth'].includes(step.permission))assert.equal(step.requiresHumanApproval,true,r.id+'/'+step.id);
    }
  }
  assert.equal(getRecipe('cinematic-portfolio').steps.length,9);
  assert.equal(getRecipe('../etc/passwd'),null);
});
