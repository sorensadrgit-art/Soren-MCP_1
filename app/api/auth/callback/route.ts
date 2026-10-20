import {completeManagementLogin,clearOAuthState} from '../../../../lib/management-session.mjs';
import {authenticateRequest} from '../../../../lib/security/auth.mjs';
import {getOperationsStore} from '../../../../lib/operations/store.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{const result=await completeManagementLogin(request,{authenticate:authenticateRequest,store:getOperationsStore()});
    const headers=new Headers({Location:result.url,'Cache-Control':'no-store'});headers.append('Set-Cookie',result.cookie);headers.append('Set-Cookie',result.clearState);return new Response(null,{status:303,headers});}
  catch{const headers=new Headers({Location:'/manage?auth_error=login_failed','Cache-Control':'no-store','Set-Cookie':clearOAuthState()});return new Response(null,{status:303,headers});}
}
