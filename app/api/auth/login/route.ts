import {startManagementLogin} from '../../../../lib/management-session.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{const result=startManagementLogin(request);return new Response(null,{status:303,headers:{Location:result.url,'Set-Cookie':result.cookie,'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'management_oauth_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
