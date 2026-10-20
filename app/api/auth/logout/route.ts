import {clearManagementSession} from '../../../../lib/management-session.mjs';
export async function POST(request:Request){
  if(!process.env.SOREN_ADMIN_ORIGIN||request.headers.get('origin')!==process.env.SOREN_ADMIN_ORIGIN)return Response.json({error:'origin_denied'},{status:403});
  return new Response(null,{status:303,headers:{Location:'/manage','Set-Cookie':clearManagementSession(),'Cache-Control':'no-store'}});
}
