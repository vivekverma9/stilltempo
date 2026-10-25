// StillTempo portable backup schema.
import {INITIAL, MODES, LOCAL_PHOTOS} from './config.js';
export const BACKUP_FORMAT='stilltempo-backup-v1';
const booleanKeys=['clock24','weather','approximateLocation','jokes','radio','chime','notifications'];
const time=/^([01]\d|2[0-3]):[0-5]\d$/;
const http=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const numeric=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function normalizePrefs(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid preferences in backup');
 const out={...INITIAL};
 for(const k of booleanKeys)if(k in raw){if(typeof raw[k]!=='boolean')throw Error('Invalid '+k+' preference');out[k]=raw[k];}
 if('mode' in raw){if(!['auto',...MODES].includes(raw.mode))throw Error('Invalid appearance in backup');out.mode=raw.mode;}
 for(const k of ['dayStart','loungeStart'])if(k in raw){if(typeof raw[k]!=='string'||!time.test(raw[k]))throw Error('Invalid schedule in backup');out[k]=raw[k];}
 if('blur' in raw){if(!numeric(raw.blur,0,100))throw Error('Invalid blur in backup');out.blur=raw.blur;}
 if('chimeVolume' in raw){if(!numeric(raw.chimeVolume,0,1))throw Error('Invalid chime volume');out.chimeVolume=raw.chimeVolume;}
 if('duration' in raw){if(!Number.isInteger(raw.duration)||raw.duration<1||raw.duration>180)throw Error('Invalid focus duration');out.duration=raw.duration;}
 if('volume' in raw){if(!numeric(raw.volume,0,1))throw Error('Invalid radio volume');out.volume=raw.volume;}
 if('station' in raw){if(!['jazz','lofi'].includes(raw.station))throw Error('Invalid station');out.station=raw.station;}
 if('city' in raw){if(raw.city===null)out.city=null;else{
  const c=raw.city;
  if(!c||typeof c!=='object'||Array.isArray(c)||!numeric(c.latitude,-90,90)||!numeric(c.longitude,-180,180)||typeof c.name!=='string'||c.name.length>80||typeof c.display!=='string'||c.display.length>100)throw Error('Invalid saved city');
  out.city={name:c.name,display:c.display,latitude:c.latitude,longitude:c.longitude,approximate:!!c.approximate};
 }}
 return out;
}
export function normalizeTasks(value){
 if(!Array.isArray(value)||value.length>500)throw Error('Invalid tasks in backup');
 const ids=new Set();return value.map((t,i)=>{
  if(!t||typeof t!=='object'||typeof t.text!=='string'||!t.text.trim()||t.text.length>240)throw Error('Invalid task '+(i+1));
  const id=typeof t.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(t.id)&&!ids.has(t.id)?t.id:crypto.randomUUID();ids.add(id);
  const done=typeof t.done==='boolean'?t.done:!!t.completed;
  return {id,text:t.text.trim(),done,createdAt:numeric(t.createdAt,0,1e15)?t.createdAt:Date.now()};
 });
}
export function normalizeLinks(value){
 if(!Array.isArray(value)||value.length>24)throw Error('Invalid shortcuts in backup');
 const ids=new Set();return value.map((l,i)=>{
  if(!l||typeof l!=='object'||typeof l.name!=='string'||!l.name.trim()||l.name.length>34||typeof l.url!=='string'||l.url.length>500)throw Error('Invalid shortcut '+(i+1));
  const url=http(l.url);if(!url)throw Error('Unsafe shortcut URL in backup');
  const id=typeof l.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(l.id)&&!ids.has(l.id)?l.id:crypto.randomUUID();ids.add(id);
  return {id,name:l.name.trim(),url};
 });
}
export function normalizePhotoPin(mode,pin){
 if(!pin||typeof pin!=='object'||typeof pin.pinned!=='boolean')throw Error('Invalid '+mode+' photo pin');
 if(!pin.pinned)return {pinned:false,current:null,everShown:false};
 const pic=pin.photo;
 if(!pic||typeof pic!=='object'||pic.mode!==mode)throw Error('Invalid pinned photograph');
 if(pic.source==='local'){
  const local=LOCAL_PHOTOS[mode].find(p=>p.id===pic.id&&p.url===pic.url);
  if(!local)throw Error('Unknown bundled photograph');
  return {pinned:true,current:local,everShown:true};
 }
 if(pic.source!=='unsplash'||typeof pic.id!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/).test(pic.id)||typeof pic.url!=='string'||typeof pic.photographer!=='string'||pic.photographer.length>100)throw Error('Invalid Unsplash photograph');
 const img=http(pic.url),page=http(pic.page),profile=http(pic.profile);
 if(!img||new URL(img).hostname!=='images.unsplash.com'||!page||new URL(page).hostname!=='unsplash.com'||!profile||new URL(profile).hostname!=='unsplash.com')throw Error('Unsafe pinned photograph URL');
 return {pinned:true,current:{id:pic.id,mode,source:'unsplash',url:img,photographer:pic.photographer,page,profile,downloadLocation:''},everShown:true};
}
export function parseBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid backup document');
 if(data.format!==BACKUP_FORMAT)throw Error('Unrecognised StillTempo backup format');
 const tasks=normalizeTasks(data.tasks),links=normalizeLinks(data.links);
 const prefs=normalizePrefs(data.preferences);
 if(!data.wallpapers||typeof data.wallpapers!=='object')throw Error('Wallpaper pins missing from backup');
 const wallpapers=Object.fromEntries(MODES.map(mode=>[mode,normalizePhotoPin(mode,data.wallpapers[mode])]));
 return {format:data.format,tasks,links,prefs,wallpapers};
}
export function makeBackup({tasks,links,prefs,wallpapers,audio}){
 const preferences={...normalizePrefs({...prefs,station:audio?.station||prefs.station,volume:audio?.volume??prefs.volume})};
 const pins=Object.fromEntries(MODES.map(mode=>{
  const wall=wallpapers?.[mode];return [mode,{pinned:!!wall?.pinned,photo:wall?.pinned?wall.current:null}];
 }));
 const result={format:BACKUP_FORMAT,exportedAt:new Date().toISOString(),tasks,links,preferences,wallpapers:pins};
 parseBackup(result);return result;
}
