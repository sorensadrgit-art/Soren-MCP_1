import {managementConfiguration,readManagementSession} from '../../../../lib/management-session.mjs';
import {authenticateRequest,errorResponse,requireConfiguration} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{managementConfiguration();getOperationsStore();requireConfiguration(process.env,['SUPABASE_ANON_KEY','SOREN_AUTH_AUDIENCE','SOREN_AUTH_RESOURCE','SOREN_AUTH_CLIENT_ID']);}catch{return Response.json({configured:false,authenticated:false,reason:'Private OAuth and operations storage need configuration.'},{headers:{'Cache-Control':'no-store'}});}
  if(!readManagementSession(request))return Response.json({configured:true,authenticated:false},{headers:{'Cache-Control':'no-store'}});
  try{const principal=await authenticateRequest(request,{store:getOperationsStore(),permission:'dashboard:read',human:true});return Response.json({configured:true,authenticated:true,role:principal.role,permissions:[...principal.permissions]},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return errorResponse(error);}
}
