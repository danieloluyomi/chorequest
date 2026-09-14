import type{DashboardData,Role,Theme}from'../shared/domain.ts';
type ApiEnvelope<T>={data?:T;error?:{message?:string}};
export async function api<T>(path:string,options?:RequestInit):Promise<T>{
  let response:Response;
  try{
    response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options?.headers}});
  }catch{
    throw new Error('ChoreQuest could not reach the server. Please try again.');
  }
  const contentType=response.headers.get('content-type')??'';
  const json=contentType.includes('application/json')
    ? await response.json() as ApiEnvelope<T>
    : undefined;
  if(!response.ok){
    if(json?.error?.message)throw new Error(json.error.message);
    throw new Error(response.status>=500
      ? 'ChoreQuest is having trouble connecting. Please try again shortly.'
      : 'That request could not be completed. Please try again.');
  }
  if(!json||json.data===undefined)throw new Error('ChoreQuest received an invalid server response. Please try again.');
  return json.data;
}
export const demoLogin=(role:Role,studentId?:string)=>api('/auth/demo',{method:'POST',body:JSON.stringify({role,studentId})});
export const getDashboard=()=>api<DashboardData>('/dashboard');
export const savePreferences=(theme:Theme,animation:boolean,reducedMotion:boolean,sound:boolean)=>api('/preferences',{method:'PUT',body:JSON.stringify({theme,animation,reducedMotion,sound})});
