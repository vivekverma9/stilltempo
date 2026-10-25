import {store, get, set, serial, timerBase, audioBase, safeHttp, validMode, validMinutes, states} from './core.js';
import {WORKER, BUNDLED, LOCAL_PHOTOS, MODES, INITIAL, FIRST_LINKS, STATIONS} from './config.js';
import {makeBackup, parseBackup} from './backup.js';
import {normalisePhoto, parseCatalog, migratePool, mergeCatalog, chooseFromCatalog, chooseLocal} from './wallpapers.js';

// Reuse established persistent storage keys to support safe extension upgrades.
async function init() {
  return serial(async () => {
    const current = await store.get(['stilltempoPrefs','stilltempoTasks','stilltempoLinks','stilltempoTimer','stilltempoAudio','stilltempoWallpapers','stilltempoPools']);
    const patch = {};
    const prefs = current.stilltempoPrefs || {...INITIAL};
    if (!current.stilltempoPrefs) patch.stilltempoPrefs = prefs;
    if (!Array.isArray(current.stilltempoTasks)) patch.stilltempoTasks = [];
    if (!Array.isArray(current.stilltempoLinks)) patch.stilltempoLinks = structuredClone(FIRST_LINKS);
    if (!current.stilltempoTimer) patch.stilltempoTimer = timerBase(validMinutes(prefs.duration)?prefs.duration:INITIAL.duration);
    if (!current.stilltempoAudio) patch.stilltempoAudio = audioBase();
    if (!current.stilltempoWallpapers) patch.stilltempoWallpapers = states();
    if (!current.stilltempoPools) patch.stilltempoPools = {
      workspace:migratePool({}),
      lounge:migratePool({})
    };
    if (Object.keys(patch).length) await set(patch);
  });
}

chrome.runtime.onInstalled.addListener(() => init().then(() => reconcile(false)).catch(console.error));
chrome.runtime.onStartup.addListener(async () => {await init(); await serial(async()=>{const a=await get('stilltempoAudio');await set({stilltempoAudio:{...audioBase(),station:a?.station||'jazz',volume:a?.volume??0.55}});}); await reconcile(false);});

async function soundCompletion(t) {
  const prefs = await get('stilltempoPrefs') || INITIAL;
  if(prefs.notifications){try{await chrome.notifications.create(`stilltempo-${t.id}`,{type:'basic',iconUrl:'icons/icon128.png',title:'StillTempo',message:t.kind==='break'?'Break complete. Back to it, unfortunately.':'Focus complete. A modest achievement.'});}catch{}}
  if(prefs.chime){try{await ensureOffscreen();await chrome.runtime.sendMessage({target:'offscreen',type:'CHIME',volume:prefs.chimeVolume});}catch{}}
}
async function reconcile(alert=false) {
  // Own the completion transition under one service-worker serial queue.
  const ended = await serial(async () => {
    const t=await get('stilltempoTimer');
    if(!t || t.status!=='running') return null;
    if(Date.now()<t.endAt){await chrome.alarms.create('stilltempo-focus',{when:t.endAt});return null;}
    const next={...t,status:'complete',remainingMs:0,endAt:0,completedNotified:true,completedAt:Date.now(),deadlineAt:t.endAt};
    await set({stilltempoTimer:next});return next;
  });
  // An expired session is shown without replaying its chime long after completion.
  if(ended && alert && Date.now()-ended.deadlineAt<45000) await soundCompletion(ended);
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='stilltempo-focus')reconcile(true).catch(console.error);});

// A fresh tab starts at the user's saved focus length after a completed session.
// Existing tabs can display completion until the next tab opens. An active or
// paused session remains shared and untouched across tabs.
async function prepareNewTab() {
  return serial(async () => {
    const t=await get('stilltempoTimer');
    if(t?.status==='complete'){
      const prefs=await get('stilltempoPrefs')||INITIAL;
      await set({stilltempoTimer:timerBase(validMinutes(prefs.duration)?prefs.duration:25)});
    }
    return store.get(['stilltempoPrefs','stilltempoTasks','stilltempoLinks','stilltempoTimer','stilltempoAudio','stilltempoWallpapers']);
  });
}

async function timerAction(m) {
  return serial(async()=>{
    const prefs=await get('stilltempoPrefs')||INITIAL;
    let t=await get('stilltempoTimer')||timerBase(prefs.duration);
    const now=Date.now();
    if(t.status==='running'&&now>=t.endAt)t={...t,status:'complete',remainingMs:0,endAt:0,completedNotified:true};
    switch(m.action){
      case 'duration':{
        if(!validMinutes(m.minutes)) throw Error('Choose between 1 and 180 whole minutes.');
        await set({stilltempoPrefs:{...prefs,duration:m.minutes}});
        if(t.status==='idle'||t.status==='complete') t=timerBase(m.minutes);
        break;
      }
      case 'start':{
        if(t.status==='running')break;
        if(t.status==='idle'||t.status==='complete'){
          const duration=t.kind==='break'?5:prefs.duration;
          if(!duration)throw Error('Choose a duration above zero.');
          t=timerBase(duration,t.kind==='break'?'break':'focus');
        }
        if(t.remainingMs<=0)throw Error('Timer has no remaining time.');
        t={...t,status:'running',endAt:now+t.remainingMs};
        await chrome.alarms.create('stilltempo-focus',{when:t.endAt});break;
      }
      case 'pause':{
        if(t.status==='running')t={...t,status:'paused',remainingMs:Math.max(0,t.endAt-now),endAt:0};
        await chrome.alarms.clear('stilltempo-focus');break;
      }
      case 'reset':t=timerBase(validMinutes(prefs.duration)?prefs.duration:25);await chrome.alarms.clear('stilltempo-focus');break;
      case 'break':t=timerBase(5,'break');await chrome.alarms.clear('stilltempo-focus');break;
      default:throw Error('Unknown timer command');
    }
    await set({stilltempoTimer:t});return t;
  });
}
async function taskAction(m) {
  return serial(async()=>{
    let items=await get('stilltempoTasks')||[];
    const text=String(m.text||'').trim().slice(0,240);
    if(m.action==='add'){if(!text)throw Error('A target needs words.');if(items.length>=500)throw Error('Too many targets.');items=[...items,{id:crypto.randomUUID(),text,done:false,createdAt:Date.now()}];}
    else if(m.action==='edit'){if(!text)throw Error('A target needs words.');items=items.map(t=>t.id===m.id?{...t,text}:t);}
    else if(m.action==='toggle')items=items.map(t=>t.id===m.id?{...t,done:!t.done}:t);
    else if(m.action==='delete')items=items.filter(t=>t.id!==m.id);
    else if(m.action==='restore'){
      const t=m.task;
      if(!t||typeof t.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(t.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>240)throw Error('Cannot restore task');
      if(items.some(x=>x.id===t.id))return items; // A second tab has already restored it.
      if(items.length>=500)throw Error('The Hitlist is full');
      const at=Number.isInteger(m.index)?Math.max(0,Math.min(items.length,m.index)):items.length;
      items.splice(at,0,{id:t.id,text:t.text.trim(),done:!!t.done,createdAt:Number.isFinite(t.createdAt)?t.createdAt:Date.now()});
    }
    else throw Error('Unknown task command');
    await set({stilltempoTasks:items});return items;
  });
}
async function linksAction(m){
  return serial(async()=>{
    let items=await get('stilltempoLinks')||[];
    if(m.action==='delete')items=items.filter(x=>x.id!==m.id);
    else if(m.action==='move'){
      const i=items.findIndex(x=>x.id===m.id),j=i+Number(m.delta);if(i>=0&&j>=0&&j<items.length)[items[i],items[j]]=[items[j],items[i]];
    } else if(m.action==='save') {
      const name=String(m.name||'').trim().slice(0,34);
      let url=String(m.url||'').trim();if(!/^[a-z]+:\/\//i.test(url))url='https://'+url;
      url=safeHttp(url);
      if(!name||!url)throw Error('Give the shortcut a name and a valid http(s) URL.');
      if(m.id)items=items.map(x=>x.id===m.id?{...x,name,url}:x);
      else {if(items.length>=24)throw Error('Maximum 24 shortcuts.');items=[...items,{id:crypto.randomUUID(),name,url}];}
    }else throw Error('Unknown shortcut command');
    await set({stilltempoLinks:items});return items;
  });
}
// All network requests run outside the single-writer queue; only storage mutation
// uses serial(), so concurrent New Tabs cannot obtain the same shuffle entry.
const inflight=new Map();
const CATALOG_TTL=12*60*60*1000;
const FAILURE_BACKOFF=90*1000;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function imageValid(mode,item){
 if(!validMode(mode)||!item||item.mode!==mode)throw Error('Invalid wallpaper');
 if(item.source==='unsplash'){
  const verified=normalisePhoto(item,mode);
  if(!verified||verified.id!==item.id)throw Error('Invalid Unsplash wallpaper');
 } else if(item.source!=='local'||!LOCAL_PHOTOS[mode].some(x=>x.id===item.id&&x.url===item.url))throw Error('Invalid local wallpaper');
}
async function refreshCatalog(mode){
 if(!validMode(mode))throw Error('Unknown appearance');
 if(inflight.has(mode))return inflight.get(mode);
 const job=(async()=>{
  const before=migratePool((await get('stilltempoPools'))?.[mode]);
  if(Date.now()-before.catalogAt<CATALOG_TTL&&before.catalog.length)return;
  if(Date.now()-before.failedAt<FAILURE_BACKOFF)return;
  const u=new URL(WORKER+'/catalog');u.searchParams.set('theme',mode);
  const aborter=new AbortController(),timeout=setTimeout(()=>aborter.abort(),8500);
  try{
   const response=await fetch(u.href,{signal:aborter.signal,cache:'no-store'});
   if(!response.ok)throw Error('Wallpaper catalogue '+response.status);
   const result=parseCatalog(await response.json(),mode);
   if(!result.length)throw Error('No eligible curated photographs');
   await serial(async()=>{
    const all=await get('stilltempoPools')||{};
    all[mode]=mergeCatalog(migratePool(all[mode]),result,Date.now());
    await set({stilltempoPools:all});
   });
  }catch(e){
   await serial(async()=>{
    const all=await get('stilltempoPools')||{};
    const pool=migratePool(all[mode]);pool.failedAt=Date.now();all[mode]=pool;
    await set({stilltempoPools:all});
   });
   throw e;
  }finally{clearTimeout(timeout);}
 })().finally(()=>inflight.delete(mode));
 inflight.set(mode,job);return job;
}
async function selectPhoto(mode,manual=false){
 if(!validMode(mode))throw Error('Unknown appearance');
 const before=await get('stilltempoWallpapers');
 if(before?.[mode]?.pinned){
  if(manual)throw Error('Unpin the photograph before refreshing.');
  return before[mode].current||BUNDLED[mode];
 }
 const pool=migratePool((await get('stilltempoPools'))?.[mode]);
 if(!pool.catalog.length){
  // First online load waits briefly; never blocks a New Tab indefinitely.
  await Promise.race([refreshCatalog(mode).catch(()=>{}),delay(3500)]);
 }else if(Date.now()-pool.catalogAt>=CATALOG_TTL){
  refreshCatalog(mode).catch(()=>{});
 }
 return serial(async()=>{
  const wallpapers=await get('stilltempoWallpapers')||states();
  const wall=wallpapers[mode]||states()[mode];
  if(wall.pinned){
   if(manual)throw Error('Unpin the photograph before refreshing.');
   return wall.current||BUNDLED[mode];
  }
  const all=await get('stilltempoPools')||{},p=migratePool(all[mode]);
  const chosen=chooseFromCatalog(p,wall.current?.id)||chooseLocal(mode,p,wall.current?.id,LOCAL_PHOTOS[mode]);
  const photo={...chosen,selectionId:crypto.randomUUID()};
  wallpapers[mode]={...wall,current:photo,everShown:true};
  all[mode]=p;
  await set({stilltempoPools:all,stilltempoWallpapers:wallpapers});
  return photo;
 });
}
async function markFailedPhoto(mode,item){
 imageValid(mode,item);
 if(item.source!=='unsplash')return false;
 return serial(async()=>{
  const all=await get('stilltempoPools')||{},p=migratePool(all[mode]);
  p.failedIds[item.id]=Date.now();p.queue=p.queue.filter(id=>id!==item.id);
  all[mode]=p;await set({stilltempoPools:all});return true;
 });
}
async function trackDisplayed(mode,item){
 imageValid(mode,item);
 if(item.source!=='unsplash'||!item.downloadLocation||!item.selectionId)return true;
 // Mark before the request to avoid duplicate legitimate display events across
 // simultaneous tabs and repeated pin previews. Never issue synthetic retries.
 const record=await serial(async()=>{
  const all=await get('stilltempoPools')||{},p=migratePool(all[mode]);
  if(p.tracked.includes(item.selectionId))return false;
  p.tracked=[item.selectionId,...p.tracked].slice(0,350);
  all[mode]=p;await set({stilltempoPools:all});return true;
 });
 if(!record)return true;
 const aborter=new AbortController(),timeout=setTimeout(()=>aborter.abort(),4500);
 try{await fetch(WORKER+'/track-download',{method:'POST',headers:{'Content-Type':'application/json'},signal:aborter.signal,body:JSON.stringify({download_location:item.downloadLocation})});}
 catch{}finally{clearTimeout(timeout);}
 return true;
}
async function prefsAction(m){
  return serial(async()=>{
    const allowed=['mode','blur','dayStart','loungeStart','clock24','weather','approximateLocation','city','jokes','radio','chime','chimeVolume','notifications'];
    const patch=Object.fromEntries(Object.entries(m.patch||{}).filter(([key])=>allowed.includes(key)));
    if('mode' in patch&&!['auto',...MODES].includes(patch.mode))throw Error('Invalid appearance');
    for(const key of ['dayStart','loungeStart'])if(key in patch&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch[key]))throw Error('Invalid time');
    if('blur' in patch){const n=Number(patch.blur);if(!Number.isFinite(n))throw Error('Invalid blur');patch.blur=Math.max(0,Math.min(100,n));}
    if('chimeVolume' in patch){const n=Number(patch.chimeVolume);if(!Number.isFinite(n))throw Error('Invalid volume');patch.chimeVolume=Math.max(0,Math.min(1,n));}
    if('city' in patch && patch.city!==null){const c=patch.city;const lat=Number(c?.latitude),lon=Number(c?.longitude);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw Error('Invalid city');patch.city={name:String(c.name||'Selected city').slice(0,80),display:String(c.display||c.name||'Selected city').slice(0,100),latitude:lat,longitude:lon,approximate:!!c.approximate};}
    const result={...INITIAL,...(await get('stilltempoPrefs')),...patch};await set({stilltempoPrefs:result});
    if(patch.radio===false){const a=await get('stilltempoAudio');await set({stilltempoAudio:{...a,status:'idle',error:''}});const has=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});if(has.length)chrome.runtime.sendMessage({target:'offscreen',type:'RADIO',action:'pause'}).catch(()=>{});}
    return result;
  });
}
let offscreenPromise;
async function ensureOffscreen(){
  const url=chrome.runtime.getURL('offscreen.html');
  if((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]})).length)return;
  if(!offscreenPromise)offscreenPromise=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['AUDIO_PLAYBACK'],justification:'One optional radio stream and a focus completion sound.'}).finally(()=>{offscreenPromise=null;});
  return offscreenPromise;
}
async function radioAction(m){
 const prefs=await get('stilltempoPrefs')||INITIAL;
 if(!prefs.radio&&m.action!=='pause')throw Error('Radio is disabled');
 return serial(async()=>{
  let a=await get('stilltempoAudio')||audioBase();
  const wasActive=['playing','connecting','buffering','reconnecting'].includes(a.status);
  const commandId=m.action==='volume'?a.commandId:crypto.randomUUID();
  if(m.action==='station'){
   if(!(m.station in STATIONS))throw Error('Unknown station');
   a={...a,station:m.station,sourceName:'',error:'',commandId,status:wasActive?'connecting':a.status==='unavailable'?'idle':a.status};
  }else if(m.action==='volume'){
   const n=Number(m.volume);if(!Number.isFinite(n))throw Error('Invalid volume');a={...a,volume:Math.max(0,Math.min(1,n))};
  }else if(m.action==='play')a={...a,commandId,status:'connecting',error:'',sourceName:''};
  else if(m.action==='pause')a={...a,commandId,status:'paused',error:''};
  else throw Error('Unknown radio command');
  await set({stilltempoAudio:a});
  const needsAudio=m.action==='play'||(m.action==='station'&&wasActive);
  try{
   if(needsAudio)await ensureOffscreen();
   const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
   if(contexts.length){
    const response=await chrome.runtime.sendMessage({target:'offscreen',type:'RADIO',action:m.action,station:a.station,volume:a.volume,commandId});
    if(!response?.ok)throw Error(response?.error||'Radio player did not acknowledge the command');
   }else if(needsAudio)throw Error('Radio player could not be created');
  }catch(e){
   // Do not leave a phantom 'Connecting' state when offscreen playback failed.
   const failed={...a,status:needsAudio?'unavailable':a.status,error:needsAudio?'Player unavailable. Use Retry to reconnect.':String(e?.message||e).slice(0,150)};
   await set({stilltempoAudio:failed});
   throw e;
  }
  return a;
 });
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target==='offscreen')return false;
  (async()=>{
    switch(m?.type){
      case 'INIT':await init();await reconcile(true);return prepareNewTab();
      case 'TASK':return taskAction(m);
      case 'LINK':return linksAction(m);
      case 'TIMER':await reconcile(true);return timerAction(m);
      case 'PREF':return prefsAction(m);
      case 'PHOTO_OPEN':return selectPhoto(m.mode,false);
      case 'PHOTO_NEXT':return selectPhoto(m.mode,true);
      case 'PHOTO_DISPLAYED':return trackDisplayed(m.mode,m.photo);
      case 'PHOTO_FAILED':return markFailedPhoto(m.mode,m.photo);
      case 'PHOTO_STATUS':return serial(async()=>{if(!validMode(m.mode))throw Error('Unknown appearance');return (await get('stilltempoWallpapers'))[m.mode];});
      case 'PHOTO_PIN':return serial(async()=>{
        if(!validMode(m.mode))throw Error('Unknown appearance');
        if(m.pinned)imageValid(m.mode,m.photo);
        const w=await get('stilltempoWallpapers');
        w[m.mode]={...w[m.mode],pinned:!!m.pinned,current:m.pinned?m.photo:w[m.mode].current,everShown:true};
        await set({stilltempoWallpapers:w});return w[m.mode];
      });
      case 'RADIO':return radioAction(m);
      case 'RADIO_STATE':return serial(async()=>{
        let a=await get('stilltempoAudio');
        const allowed=['connecting','reconnecting','buffering','playing','unavailable','paused'];
        if(!a||a.station!==m.station||!allowed.includes(m.status)||['paused','idle'].includes(a.status))return a;
        if(a.commandId&&m.commandId!==a.commandId)return a;
        a={...a,status:m.status,error:String(m.error||'').slice(0,150),sourceName:String(m.sourceName||'').slice(0,60)};
        await set({stilltempoAudio:a});return a;
      });
      case 'CHIME':await ensureOffscreen();return chrome.runtime.sendMessage({target:'offscreen',type:'CHIME',volume:(await get('stilltempoPrefs'))?.chimeVolume??.42});
      case 'EXPORT':return serial(async()=>{
        const values=await store.get(['stilltempoTasks','stilltempoLinks','stilltempoPrefs','stilltempoWallpapers','stilltempoAudio']);
        return makeBackup({tasks:values.stilltempoTasks||[],links:values.stilltempoLinks||[],prefs:values.stilltempoPrefs||INITIAL,wallpapers:values.stilltempoWallpapers||states(),audio:values.stilltempoAudio||audioBase()});
      });
      case 'IMPORT_PREVIEW':{
        const parsed=parseBackup(m.data);
        return {format:parsed.format,tasks:parsed.tasks.length,links:parsed.links.length,settings:!!parsed.prefs,pins:parsed.wallpapers?MODES.filter(mode=>parsed.wallpapers[mode].pinned):[]};
      }
      case 'IMPORT':{
        const validated=parseBackup(m.data); // Validate everything before touching storage.
        return serial(async()=>{
          const before=await store.get(['stilltempoTasks','stilltempoLinks','stilltempoPrefs','stilltempoWallpapers','stilltempoAudio','stilltempoTimer']);
          const prefs=validated.prefs||before.stilltempoPrefs||INITIAL;
          const audio={...audioBase(),station:validated.prefs?.station||before.stilltempoAudio?.station||'jazz',volume:validated.prefs?.volume??before.stilltempoAudio?.volume??.55};
          const patch={
            stilltempoPreImportBackup:{at:Date.now(),...before},
            stilltempoTasks:validated.tasks,stilltempoLinks:validated.links,
            stilltempoAudio:audio,stilltempoTimer:timerBase(prefs.duration)
          };
          if(validated.prefs)patch.stilltempoPrefs=prefs;
          if(validated.wallpapers)patch.stilltempoWallpapers=validated.wallpapers;
          // Atomic storage transaction with a recoverable pre-import snapshot.
          await set(patch);
          await chrome.alarms.clear('stilltempo-focus');
          const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
          if(contexts.length)chrome.runtime.sendMessage({target:'offscreen',type:'RADIO',action:'pause'}).catch(()=>{});
          return true;
        });
      }
      default:throw Error('Unknown request');
    }
  })().then(result=>reply({ok:true,result}),e=>reply({ok:false,error:e?.message||String(e)}));
  return true;
});
