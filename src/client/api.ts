import type{DashboardData,Role,Theme}from'../shared/domain.ts';
export async function api<T>(path:string,options?:RequestInit):Promise<T>{const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options?.headers}});const json=await response.json();if(!response.ok)throw new Error(json.error?.message??'Something went wrong.');return json.data}
export const demoLogin=(role:Role,studentId?:string)=>api('/auth/demo',{method:'POST',body:JSON.stringify({role,studentId})});
export const getDashboard=()=>api<DashboardData>('/dashboard');
export const savePreferences=(theme:Theme,animation:boolean,reducedMotion:boolean,sound:boolean)=>api('/preferences',{method:'PUT',body:JSON.stringify({theme,animation,reducedMotion,sound})});
