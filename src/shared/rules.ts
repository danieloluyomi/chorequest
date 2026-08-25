const DAY_MS=86_400_000;
export function levelFromXp(xp:number){return Math.floor(Math.sqrt(Math.max(0,xp)/100))+1}
export function xpThreshold(level:number){return 100*Math.max(0,level-1)**2}
export function levelProgress(xp:number){const level=levelFromXp(xp),start=xpThreshold(level),end=xpThreshold(level+1);return{level,current:xp-start,needed:end-start,percent:Math.round((xp-start)/(end-start)*100)}}
export function localDate(instant:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${value.year}-${value.month}-${value.day}`}
export function streakFromDates(dates:string[],today:string){const unique=[...new Set(dates)].sort().reverse();if(!unique.length)return 0;const utc=(v:string)=>Date.parse(`${v}T00:00:00Z`),newest=utc(unique[0]),current=utc(today);if(current-newest>DAY_MS)return 0;let streak=1;for(let i=1;i<unique.length;i++){if(utc(unique[i-1])-utc(unique[i])===DAY_MS)streak++;else break}return streak}
export function canRedeem(balance:number,cost:number,stock:number,enabled=true){return enabled&&stock>0&&cost>0&&balance>=cost}
