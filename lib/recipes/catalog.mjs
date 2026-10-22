import {loadCatalog} from '../v3/data.mjs';

export const RECIPES=loadCatalog('recipes').items;
export const PROFILES=loadCatalog('profiles').items;
const ID=/^[a-z0-9][a-z0-9-]{1,62}$/;

export function getRecipe(id){
  if(typeof id!=='string'||!ID.test(id))return null;
  return RECIPES.find(recipe=>recipe.id===id&&recipe.approved===true)??null;
}

export function getProfile(id){
  if(typeof id!=='string'||!ID.test(id))return null;
  return PROFILES.find(profile=>profile.id===id)??null;
}

export function recipeResourceUri(id){
  return `soren://recipe/${id}`;
}

export function listProfiles(){
  return PROFILES.map(p=>({id:p.id,title:p.title,description:p.description,capabilities:p.capabilities,primarySkill:p.primarySkill,
    complementarySkills:p.complementarySkills,requiredIntegrations:p.requiredIntegrations,optionalIntegrations:p.optionalIntegrations,
    recipeId:p.recipeId,recipeUri:recipeResourceUri(p.recipeId),prerequisites:p.prerequisites,permissionBoundaries:p.permissionBoundaries}));
}
