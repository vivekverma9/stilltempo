// StillTempo curated-wallpaper state. Pure functions except callers' storage writes.
// Pool data is validated and normalised on each read.
import {shuffle, randomIndex} from './core.js';
const https=(value,hostname)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===hostname?u.href:'';}catch{return '';}};
const unsplashLink=value=>{const url=https(value,'unsplash.com');if(!url)return '';const u=new URL(url);u.searchParams.set('utm_source','stilltempo');u.searchParams.set('utm_medium','referral');return u.href;};
export function normalisePhoto(raw,mode){
 if(!raw||typeof raw!=='object'||!['workspace','lounge'].includes(mode))return null;
 const id=String(raw.id||'');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return null;
 const width=Number(raw.width||raw.dimensions?.width||0),height=Number(raw.height||raw.dimensions?.height||0);
 if(width>0&&height>0&&width<=height)return null;
 if(raw.premium===true||raw.type==='illustration')return null;
 const image=https(raw.urls?.regular||raw.url||raw.image_url||raw.imageUrl,'images.unsplash.com');
 const photographer=String(raw.user?.name||raw.photographer||raw.photographer_name||'').trim().slice(0,100);
 const page=unsplashLink(raw.links?.html||raw.page||raw.photo_url||raw.html_url);
 const profile=unsplashLink(raw.user?.links?.html||raw.profile||raw.photographer_url||raw.photographer_profile_url);
 if(!image||!photographer||!page||!profile)return null;
 const downloadLocation=https(raw.links?.download_location||raw.downloadLocation||raw.download_location,'api.unsplash.com');
 const validTrack=downloadLocation&&/^\/photos\/[A-Za-z0-9_-]+\/download\/?$/.test(new URL(downloadLocation).pathname)?downloadLocation:'';
 return {id,mode,source:'unsplash',url:image,photographer,profile,page,downloadLocation:validTrack};
}
export function parseCatalog(payload,mode){
 if(payload?.ok===false||payload?.complete===false)throw Error('Catalogue is unavailable or incomplete');
 const raw=Array.isArray(payload)?payload:payload?.photos;
 if(!Array.isArray(raw))throw Error('Invalid curated catalogue response');
 if(payload?.theme&&payload.theme!==mode)throw Error('Wrong collection response');
 const ids=new Set(),photos=[];
 for(const item of raw){const p=normalisePhoto(item,mode);if(p&&!ids.has(p.id)){ids.add(p.id);photos.push(p);}}
 return photos;
}
export function migratePool(raw){
 const p=raw&&typeof raw==='object'?raw:{};
 return {
  schema:2,
  catalog:Array.isArray(p.catalog)?p.catalog.filter(x=>x&&x.id&&x.source==='unsplash').slice(0,250):[],
  queue:Array.isArray(p.queue)?p.queue.filter(x=>typeof x==='string').slice(0,250):[],
  served:Array.isArray(p.served)?p.served.filter(x=>typeof x==='string').slice(0,250):[],
  catalogAt:Number.isFinite(p.catalogAt)?p.catalogAt:0,
  failedAt:Number.isFinite(p.failedAt)?p.failedAt:0,
  lastId:typeof p.lastId==='string'?p.lastId:'',
  failedIds:p.failedIds&&typeof p.failedIds==='object'&&!Array.isArray(p.failedIds)?p.failedIds:{},
  localSeen:Array.isArray(p.localSeen)?p.localSeen.filter(x=>typeof x==='string').slice(0,10):[],
  tracked:Array.isArray(p.tracked)?p.tracked.filter(x=>typeof x==='string').slice(0,350):[]
 };
}
export function mergeCatalog(pool,photos,at){
 const p=migratePool(pool),ids=new Set(photos.map(x=>x.id)),oldIds=new Set(p.catalog.map(x=>x.id));
 p.catalog=photos;
 p.served=p.served.filter(id=>ids.has(id));
 p.queue=p.queue.filter((id,i,items)=>ids.has(id)&&items.indexOf(id)===i&&!p.served.includes(id));
 const unserved=photos.map(x=>x.id).filter(id=>!oldIds.has(id)&&!p.queue.includes(id)&&!p.served.includes(id));
 // Start a fresh catalogue with a shuffled non-repeating queue.
 if(!p.queue.length&&!p.served.length)p.queue=shuffle(photos.map(x=>x.id));
 else if(unserved.length)p.queue.push(...shuffle(unserved));
 p.catalogAt=at;p.failedAt=0;
 return p;
}
export function chooseFromCatalog(pool,previousId,now=Date.now()){
 const p=pool;
 if(!p.catalog.length)return null;
 const byId=new Map(p.catalog.map(x=>[x.id,x]));
 const eligible=id=>byId.has(id)&&(!p.failedIds[id]||now-p.failedIds[id]>=15*60*1000);
 p.queue=p.queue.filter(eligible);
 if(!p.queue.length){
  // The currently active cycle is exhausted, including photos that failed to load.
  p.served=[];p.queue=shuffle([...byId.keys()].filter(eligible));
 }
 if(!p.queue.length)return null;
 // A new cycle should never immediately repeat the outgoing image when there
 // are at least two choices. Current-cycle unique entries are never discarded.
 if(p.queue.length>1&&p.queue[0]===previousId){
  const i=1+randomIndex(p.queue.length-1);
  [p.queue[0],p.queue[i]]=[p.queue[i],p.queue[0]];
 }
 const id=p.queue.shift(),selected=byId.get(id);
 p.served.push(id);p.lastId=id;
 return selected;
}
export function chooseLocal(mode,p,previousId,choices){
 const recent=new Set(p.localSeen.slice(0,choices.length-1));
 let available=choices.filter(x=>x.id!==previousId&&!recent.has(x.id));
 if(!available.length)available=choices.filter(x=>x.id!==previousId);
 if(!available.length)available=choices;
 const pick=available[randomIndex(available.length)];
 p.localSeen=[pick.id,...p.localSeen.filter(id=>id!==pick.id)].slice(0,choices.length);
 return pick;
}
