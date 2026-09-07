const parts=(date:Date,zone:string)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
export function localDateTime(iso:string,zone='Australia/Brisbane'){const p=parts(new Date(iso),zone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;}
export function zonedTimestamp(local:string,zone='Australia/Brisbane'){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local))throw new Error('Enter the local date and time.');
 const normal=local.length===16?local+':00':local;
 const utc=Date.parse(normal+'Z');if(!Number.isFinite(utc))throw new Error('Invalid time.');
 const offsets=new Set<number>();for(const delta of [-36,-12,0,12,36]){const candidate=new Date(utc+delta*36e5),p=parts(candidate,zone);const wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);offsets.add(wall-candidate.getTime());}
 const candidates=[...offsets].map(offset=>new Date(utc-offset)).filter(date=>localDateTime(date.toISOString(),zone)===normal);
 if(candidates.length!==1)throw new Error(candidates.length?'This local time is ambiguous at daylight saving. Enter the actual timestamp including its UTC offset through the reviewed import path.':'That local time does not exist in the selected time zone.');return candidates[0].toISOString();
}
