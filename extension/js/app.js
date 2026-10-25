import {timedFetch} from './net.js';
import {musicQuips, tabPhrases, editorials} from './editorial.js';
import {BUNDLED, INITIAL, STATIONS} from './config.js';
const $=id=>document.getElementById(id);
const all=sel=>[...document.querySelectorAll(sel)];
const send=async(type,payload={})=>{const res=await chrome.runtime.sendMessage({type,...payload});if(!res?.ok)throw Error(res?.error||'Extension request failed');return res.result;};
const state={prefs:{...INITIAL},tasks:[],links:[],timer:null,audio:null,wallpapers:null,appearance:null,visible:null,displayedJoke:'',busyPhoto:false,cityResults:[],weatherCache:null};
let toastTimer=null, jokeRequest=0, timeTick=null, photoGeneration=0, weatherRequest=0;
let pendingUndo=null;
let photoTransitionId=0, photoTransitionTimeout=null;
// Each station has its own rotating set; no network service or storage required.

let quipStation=null;const lastQuipIndex={jazz:-1,lofi:-1};
function rotateMusicQuip(station){
 const list=musicQuips[station]||musicQuips.jazz;let next=Math.floor(Math.random()*list.length);
 if(list.length>1&&next===lastQuipIndex[station])next=(next+1)%list.length;
 lastQuipIndex[station]=next;quipStation=station;const el=$('radio-jibe');if(el)el.textContent=list[next];
}
// One selection per appearance per tab, in memory only. A newly opened tab
// always asks the service worker to select its own eligible photograph.
const tabPhoto={};
document.title='New Tab · '+tabPhrases[Math.floor(Math.random()*tabPhrases.length)];
function notify(message){pendingUndo=null;const node=$('toast');node.replaceChildren();node.textContent=message;node.classList.add('shown');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('shown'),3600);}
function offerTaskUndo(task,index){
 const token=Symbol('deleted-task');pendingUndo=token;
 const node=$('toast');node.replaceChildren(make('span','',`Removed “${task.text}”. `));
 const undo=make('button','toast-undo','Undo');undo.type='button';undo.setAttribute('aria-label','Undo deletion of '+task.text);
 undo.onclick=async()=>{if(pendingUndo!==token)return;pendingUndo=null;undo.disabled=true;
  try{await action('TASK',{action:'restore',task,index});notify('Task restored.');}catch{notify('Could not restore the task.');}
 };
 node.append(undo);node.classList.add('shown');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{if(pendingUndo===token){pendingUndo=null;node.classList.remove('shown');}},7000);
}
async function action(type,opts){try{return await send(type,opts);}catch(e){notify(e.message);throw e;}}
function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function secureLink(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function appendLinkParams(address){try{const u=new URL(address);if(u.hostname!=='unsplash.com'||u.protocol!=='https:')return null;u.searchParams.set('utm_source','stilltempo');u.searchParams.set('utm_medium','referral');return u.href;}catch{return null;}}
function greeting(){const hour=new Date().getHours();const pool=hour<5?['Still up? Admirable, in a questionable way.','The world is asleep. Your browser has other ideas.']:hour<12?['A fine morning for pretending these tabs are research.','Good morning. Try not to open fourteen more.']:hour<17?['An excellent afternoon to finish something.','Midday has arrived. So have the distractions.']:hour<21?['Evening. The unfinished tasks are being discreet.','A little calm among the browser tabs.']:['Late hours. An impeccable excuse for doing less.','Night suits you. The inbox can wait.'];return pool[(new Date().getDate()+Math.floor(hour/5))%pool.length];}
function nowTime(){const now=new Date(),h24=now.getHours(),hour=state.prefs.clock24?String(h24).padStart(2,'0'):String(h24%12||12).padStart(2,'0');$('hours').textContent=hour;$('minutes').textContent=String(now.getMinutes()).padStart(2,'0');$('ampm').textContent=state.prefs.clock24?'':h24>=12?'PM':'AM';$('greeting').textContent=greeting();}
const mins=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
function getAppearance(){if(state.prefs.mode!=='auto')return state.prefs.mode;const t=new Date(),n=t.getHours()*60+t.getMinutes(),day=mins(state.prefs.dayStart),evening=mins(state.prefs.loungeStart);return day<evening?(n>=day&&n<evening?'workspace':'lounge'):(n>=day||n<evening?'workspace':'lounge');}
function applyAppearance(){
 const mode=getAppearance(),changed=mode!==state.appearance;state.appearance=mode;
 document.body.dataset.theme=mode;
 // Reveal only after the stored preference / effective Auto appearance is resolved.
 document.body.classList.add('ambient-ready');
 all('[data-mode]').forEach(b=>{const selected=b.dataset.mode===state.prefs.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected?'true':'false');});
 const prefs=state.prefs;$('blur').value=prefs.blur;$('blur-value').textContent=Math.round(prefs.blur)+'%';document.documentElement.style.setProperty('--blur',(prefs.blur/100*17).toFixed(2)+'px');
 if(changed){
   // The first frame uses the matching bundled photograph while the full
   // curated catalogue is obtained. Appearance changes keep the previous
   // visible image until the incoming selection has preloaded.
   if(!document.body.classList.contains('wallpaper-ready'))revealPhoto(BUNDLED[mode].url);
   state.visible=null;
   loadModePhoto(mode).catch(()=>{});
 }
 updatePin();
}
// Align the ambient rays precisely above the actual player at every viewport size.
// The light is purely decorative and never moves or resizes the player.
function positionAmbientCrown(){
 const panel=$('radio-panel'),crown=$('ambient-crown');if(!panel||!crown)return;
 const rect=panel.getBoundingClientRect();if(!rect.width)return;
 crown.style.setProperty('--crown-x',(rect.left+rect.width/2).toFixed(1)+'px');
 crown.style.setProperty('--crown-player-top',Math.max(0,rect.top).toFixed(1)+'px');
 crown.style.setProperty('--crown-span',Math.max(250,rect.width).toFixed(1)+'px');
}
function updatePin(){const pin=state.wallpapers?.[state.appearance]?.pinned;$('pin-photo').textContent=pin?'♠':'♧';$('pin-photo').title=pin?'Unpin photograph':'Pin photograph';$('pin-photo').setAttribute('aria-label',pin?'Unpin photograph':'Pin photograph');$('pin-photo').classList.toggle('active',!!pin);$('pin-photo').disabled=!state.visible||state.busyPhoto;$('next-photo').disabled=!!pin||state.busyPhoto;}
async function preload(url){return new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>{img.onload=img.onerror=null;reject(Error('Image load timed out'));},10000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('Image is unavailable'));};img.src=url;});}
function completePhotoTransition(id){
 if(id!==photoTransitionId)return;
 clearTimeout(photoTransitionTimeout);photoTransitionTimeout=null;
 const front=$('wallpaper-next');
 if(front.classList.contains('revealing')){
   $('wallpaper').style.backgroundImage=front.style.backgroundImage;
   front.classList.remove('revealing');front.style.backgroundImage='';
 }
}
function revealPhoto(url){
 const back=$('wallpaper'),front=$('wallpaper-next');
 const image=`url(${JSON.stringify(url)})`;
 // Initial view and accessibility preference: change without any animated fade.
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 if(!document.body.classList.contains('wallpaper-ready')||reduced){
   completePhotoTransition(photoTransitionId);back.style.backgroundImage=image;
   document.body.classList.add('wallpaper-ready');return;
 }
 // A second photo request during a transition commits the prior image before
 // starting the next sweep. A stale animation/timeout can never change it.
 completePhotoTransition(photoTransitionId);
 if(back.style.backgroundImage===image)return;
 front.classList.remove('revealing');front.style.backgroundImage=image;
 void front.offsetWidth; // Replay even on rapid successive selections.
 const id=++photoTransitionId;
 front.classList.add('revealing');
 photoTransitionTimeout=setTimeout(()=>completePhotoTransition(id),2400);
}
function showPhoto(pic){
 if(!pic)return;
 revealPhoto(pic.url);state.visible=pic;tabPhoto[pic.mode]=pic;
 document.body.classList.add('wallpaper-ready');
 const credit=$('photo-credit');credit.replaceChildren();
 credit.append(make('span','','Photo by '));
 const photographer=make(pic.profile?'a':'span','',pic.photographer||'Unsplash contributor');
 if(pic.profile){const link=appendLinkParams(pic.profile);if(link){photographer.href=link;photographer.target='_blank';photographer.rel='noopener noreferrer';}}
 credit.append(photographer,make('span','',' on '));
 const service=make('a','','Unsplash');service.href='https://unsplash.com/?utm_source=stilltempo&utm_medium=referral';service.target='_blank';service.rel='noopener noreferrer';credit.append(service);
 const more=make('a','photo-source',' ↗');more.href=appendLinkParams(pic.page)||'https://unsplash.com/?utm_source=stilltempo&utm_medium=referral';more.target='_blank';more.rel='noopener noreferrer';more.title='View original photograph';credit.append(more);
 updatePin();
}
async function loadModePhoto(mode,{manual=false}={}){
 const generation=++photoGeneration;
 state.busyPhoto=true;updatePin();
 $('wall-status').textContent='Finding something tolerable…';
 try{
   const pinned=state.wallpapers?.[mode]?.pinned;
   let pic=!manual&&pinned?state.wallpapers[mode].current:!manual?tabPhoto[mode]:null;
   if(!pic)pic=await send(manual?'PHOTO_NEXT':'PHOTO_OPEN',{mode});
   for(let attempt=0;attempt<3;attempt++){
     if(generation!==photoGeneration||mode!==state.appearance)return;
     try{
       await preload(pic.url);
       if(generation!==photoGeneration||mode!==state.appearance)return;
       const current=await send('PHOTO_STATUS',{mode});
       if(generation!==photoGeneration||mode!==state.appearance)return;
       if(current.pinned&&current.current?.id!==pic.id){
         pic=current.current;
         await preload(pic.url);
       }
       if(generation!==photoGeneration||mode!==state.appearance)return;
       showPhoto(pic);
       send('PHOTO_DISPLAYED',{mode,photo:pic}).catch(()=>{});
       $('wall-status').textContent=pic.source==='local'?'Local gallery fallback':'';
       return;
     }catch(error){
       // Pins are never silently replaced. Unpinned broken online images get
       // a bounded retry with a different entry in the collection shuffle.
       if(generation!==photoGeneration||mode!==state.appearance)return;
       if(pic?.source!=='unsplash'||state.wallpapers?.[mode]?.pinned)throw error;
       await send('PHOTO_FAILED',{mode,photo:pic}).catch(()=>{});
       if(attempt===2)throw error;
       pic=await send('PHOTO_NEXT',{mode});
     }
   }
 }catch(e){
   if(generation!==photoGeneration||mode!==state.appearance)return;
   if(!state.visible||state.visible.mode!==mode){
     const fallback=BUNDLED[mode];
     try{await preload(fallback.url);if(generation===photoGeneration&&mode===state.appearance)showPhoto(fallback);}catch{}
   }
   $('wall-status').textContent='Live photograph unavailable; local image shown when needed.';
   if(manual)notify('The live gallery is taking an unscheduled break.');
 }finally{
   if(generation===photoGeneration){state.busyPhoto=false;updatePin();}
 }
}
function nextPhoto(){if(state.busyPhoto||state.wallpapers?.[state.appearance]?.pinned)return;loadModePhoto(state.appearance,{manual:true}).catch(()=>{});}
function renderTasks(){
 const list=$('task-list');if(list.querySelector('input.task-editor'))return;
 const items=state.tasks;list.replaceChildren();list.style.setProperty('--row-count',String(Math.max(3,Math.min(5,items.length))));
 if(!items.length){const empty=make('div','empty-tasks','Nothing on the list. A rare and suspicious victory.');list.append(empty);}
 for(const t of items){
  const row=make('div','task-row');row.dataset.id=t.id;
  const box=make('input','task-check');box.type='checkbox';box.checked=t.done;box.setAttribute('aria-label',`Mark ${t.text} ${t.done?'incomplete':'complete'}`);box.addEventListener('change',()=>action('TASK',{action:'toggle',id:t.id}).catch(()=>{}));row.append(box);
  const label=make('button','task-text'+(t.done?' done':''),t.text);label.title=t.text;label.setAttribute('aria-label','Edit task: '+t.text);label.addEventListener('click',()=>editTask(row,t));row.append(label);
  const del=make('button','remove-task','×');del.title='Delete task';del.setAttribute('aria-label','Delete task: '+t.text);del.addEventListener('click',async()=>{const index=state.tasks.findIndex(item=>item.id===t.id);try{await action('TASK',{action:'delete',id:t.id});offerTaskUndo(t,index);}catch{}});row.append(del);list.append(row);
 }
}
function editTask(row,t){if($('task-list').querySelector('input.task-editor'))return;
 const label=row.querySelector('.task-text');const edit=make('input','task-editor');edit.value=t.text;edit.maxLength=240;label.replaceWith(edit);edit.focus();edit.select();
 let finished=false;const done=async(save)=>{if(finished)return;finished=true;edit.remove();if(save&&edit.value.trim()&&edit.value.trim()!==t.text){try{await action('TASK',{action:'edit',id:t.id,text:edit.value});}catch{renderTasks();}}else renderTasks();};
 edit.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();done(true);}if(e.key==='Escape'){e.preventDefault();done(false);}});edit.addEventListener('blur',()=>done(true));
}
function renderLinks(){
 const nav=$('shortcuts');nav.replaceChildren();for(const link of state.links.slice(0,8)){
  const a=make('a','shortcut');a.href=link.url;a.title=link.name+' · Shift+F10 to edit';a.setAttribute('aria-label',link.name);
  try{const u=new URL(link.url);const favicon=make('img','');const iconUrl=new URL(chrome.runtime.getURL('/_favicon/'));iconUrl.searchParams.set('pageUrl',u.href);iconUrl.searchParams.set('size','32');favicon.src=iconUrl.toString();favicon.loading='lazy';favicon.referrerPolicy='no-referrer';favicon.alt='';favicon.addEventListener('error',()=>favicon.replaceWith(make('span','favicon-fallback','⌁')));a.append(favicon);}catch{a.append(make('span','favicon-fallback','⌁'));}
  a.append(make('span','',link.name));a.addEventListener('contextmenu',e=>{e.preventDefault();openSettings();editLink(link);});a.addEventListener('keydown',e=>{if(e.key==='F10'&&e.shiftKey){e.preventDefault();openSettings();editLink(link);}});nav.append(a);
 }
 const more=make('button','shortcut-add','+');more.type='button';more.title='Add or manage shortcuts';more.setAttribute('aria-label',more.title);more.onclick=()=>{openSettings();if(state.links.length<=8)editLink(null);};nav.append(more);
 if(state.links.length>8){const caption=make('span','shortcut-extra','+'+(state.links.length-8));more.append(caption);}
}
function renderLinkSettings(){const panel=$('shortcut-settings');panel.replaceChildren();for(const link of state.links){const row=make('div','shortcut-setting');const name=make('span','',link.name);name.title=link.url;row.append(name);
  for(const [symbol,title,callback] of [['↑','Move earlier',()=>action('LINK',{action:'move',id:link.id,delta:-1})],['↓','Move later',()=>action('LINK',{action:'move',id:link.id,delta:1})],['✎','Edit shortcut',()=>editLink(link)],['×','Delete shortcut',()=>action('LINK',{action:'delete',id:link.id})]]){const b=make('button','soft',symbol);b.title=title;b.setAttribute('aria-label',title+' '+link.name);b.addEventListener('click',()=>Promise.resolve(callback()).catch(()=>{}));row.append(b);}panel.append(row);}}
function editLink(link){$('shortcut-form').hidden=false;$('link-id').value=link?.id||'';$('link-name').value=link?.name||'';$('link-url').value=link?.url||'';$('link-name').focus();}
function fmtTime(ms){const seconds=Math.ceil(Math.max(0,ms)/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function renderTimer(){const t=state.timer;if(!t)return;
 const ms=t.status==='running'?Math.max(0,t.endAt-Date.now()):t.remainingMs;
 $('timer').textContent=fmtTime(ms);
 $('timer-toggle').textContent=t.status==='running'?'Ⅱ':'▶';
 $('timer-toggle').title=t.status==='running'?'Pause timer':t.status==='paused'?'Resume timer':'Start timer';
 $('timer-toggle').setAttribute('aria-label',$('timer-toggle').title);
 $('timer-toggle').disabled=t.status==='idle'&&t.duration===0;
 $('timer').classList.toggle('is-running',t.status==='running');
 $('timer').dataset.state=t.status;document.querySelector('.hitlist').dataset.focusState=t.status;
 $('focus-kind').textContent=t.kind==='break'?'Five-minute interlude':'Work session';
 const active=t.status==='running'||t.status==='paused';
 $('focus-status').textContent=t.status==='complete'?'Completed. Admirably done. Reset or begin again.':t.status==='paused'?'Paused. A tactical retreat.':t.status==='running'?'Remaining devoted, presumably.':t.kind==='break'?'Break ready. Begin when you are.':'Ready when you are.';
 if(active&&t.kind==='focus'&&t.duration!==state.prefs.duration){
  $('focus-status').textContent=`Next focus: ${state.prefs.duration} min · current session unchanged.`;
 }
 // Live countdowns must never erase an in-progress keyboard edit.
 if(document.activeElement!==$('duration'))$('duration').value=state.prefs.duration;
 all('[data-focus-preset]').forEach(b=>{const selected=Number(b.dataset.focusPreset)===state.prefs.duration;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 const total=t.duration*60000;
 const remaining=total>0?Math.max(0,Math.min(1,ms/total)):0;
 $('focus-progress-fill').style.transform=`scaleX(${remaining})`;
 $('focus-progress').setAttribute('aria-valuenow',String(Math.round(remaining*100)));
 $('focus-progress').setAttribute('aria-valuetext',fmtTime(ms)+' remaining');
 $('focus-progress').classList.toggle('is-running',t.status==='running');
}
function renderAudio(){const a=state.audio||{station:'jazz',status:'idle',volume:.55};const info=STATIONS[a.station]||STATIONS.jazz;
 $('radio-name').textContent=a.sourceName||info.name;
 $('radio-state').textContent=({playing:a.sourceName&&a.sourceName!==info.name?'On air · backup':'On air',connecting:'Connecting…',buffering:'Buffering…',reconnecting:'Reconnecting…',paused:'Paused',unavailable:'Unavailable · retry',idle:'Idle'}[a.status]||'Idle');
 $('radio-name').title=a.sourceName&&a.sourceName!==info.name?'Open backup station · '+a.sourceName:'Open '+info.name+' website';
 $('radio-name').href=a.sourceName&&a.sourceName!==info.name?info.backup.site:info.site;
 $('radio-state').title=a.error||'';
 $('radio-panel').dataset.playback=a.status;
 document.body.dataset.ambientPlayback=state.prefs.radio&&a.status==='playing'?'playing':'idle';
 if(quipStation!==a.station)rotateMusicQuip(a.station);
 const active=['playing','connecting','buffering','reconnecting'].includes(a.status);
 $('radio-play').textContent=active?'Ⅱ':'▶';
 $('radio-play').setAttribute('aria-label',active?'Pause radio':a.status==='unavailable'?'Retry radio':'Play radio');
 $('radio-volume').value=Math.round(a.volume*100);
 $('radio-volume').title='Volume: '+Math.round(a.volume*100)+'%';
 $('radio-panel').classList.toggle('is-playing',a.status==='playing');
 $('radio-panel').title=a.station==='jazz'?'An excellent soundtrack for avoiding the obvious.':'Excellent taste. Questionable deadlines.';
 all('[data-station]').forEach(b=>{const selected=b.dataset.station===a.station;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('radio-panel').classList.toggle('disabled',!state.prefs.radio);
}
const weatherWords={clear:['☀','A suspiciously fine excuse to go outside.'],cloudy:['☁','The sun is working remotely.'],rain:['☂','A day for staying in and calling it strategy.'],snow:['❄','The weather has adopted a minimalist palette.'],wind:['≋','Your hair has other plans.'],storm:['ϟ','Best not challenge the sky today.']};
function weatherKind(code,wind){if(code>=95)return 'storm';if(code>=71&&code<=77)return 'snow';if(code>=51&&code<=67||code>=80&&code<=82)return 'rain';if(wind>45)return 'wind';if(code>=1&&code<=3||code>=45&&code<=48)return 'cloudy';return 'clear';}
async function getApproxCity(){
 const cache=(await chrome.storage.local.get('stilltempoNetworkCity')).stilltempoNetworkCity;
 if(cache?.value && Date.now()-cache.at<6*60*60*1000)return cache.value;
 const data=await timedFetch('https://get.geojs.io/v1/ip/geo.json',{},7000);const latitude=Number(data.latitude),longitude=Number(data.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw Error('Approximate location unavailable');
 const value={name:data.city||'Nearby',display:[data.city,data.country].filter(Boolean).join(', ')||'Nearby',latitude,longitude,approximate:true};
 await chrome.storage.local.set({stilltempoNetworkCity:{at:Date.now(),value}});return value;
}
async function loadWeather(force=false){const request=++weatherRequest;if(!state.prefs.weather){$('weather').hidden=true;return;}$('weather').hidden=false;
 let city=state.prefs.city;
 if(!city&&state.prefs.approximateLocation){try{city=await getApproxCity();if(request!==weatherRequest||!state.prefs.weather)return;}catch{if(request===weatherRequest){$('weather-city').textContent='Choose a city';$('weather-jibe').textContent='Your network is being elusive. Choose a city.';}return;}}
 if(!city){$('weather-degrees').textContent='--°';$('weather-city').textContent='Choose a city';$('weather-jibe').textContent='A forecast needs a location. Shocking.';return;}
 const key=`stilltempoWeather:${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`;
 const stored=(await chrome.storage.local.get(key))[key];if(!force&&stored&&Date.now()-stored.at<30*60*1000){renderWeather(stored.data,city,false);return;}
 if(stored)renderWeather(stored.data,city,true);
 try{const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',city.latitude);u.searchParams.set('longitude',city.longitude);u.searchParams.set('current','temperature_2m,weather_code,wind_speed_10m');u.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min');u.searchParams.set('timezone','auto');u.searchParams.set('forecast_days','7');const data=await timedFetch(u.href);if(!state.prefs.weather||request!==weatherRequest)return;await chrome.storage.local.set({[key]:{at:Date.now(),data}});renderWeather(data,city,false);}catch(e){if(!stored&&request===weatherRequest)$('weather-jibe').textContent='Forecast unavailable. Even the clouds have deadlines.';}
}
function renderWeather(data,city,stale){const current=data?.current||{};const kind=weatherKind(current.weather_code??0,current.wind_speed_10m||0),meta=weatherWords[kind];$('weather-icon').textContent=meta[0];$('weather-degrees').textContent=Number.isFinite(current.temperature_2m)?Math.round(current.temperature_2m)+'°':'--°';$('weather-city').textContent=city.display||city.name;$('weather-jibe').textContent=meta[1]+(stale?' (Cached forecast)':'');$('weather-info').textContent=(stale?'Cached forecast · ':'')+'Weather data: Open-Meteo · CC BY 4.0';const forecast=$('forecast');forecast.replaceChildren();const daily=data.daily;if(!daily?.time)return;daily.time.forEach((time,i)=>{const row=make('div','forecast-row');row.append(make('span','',new Date(time+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})),make('span','',weatherWords[weatherKind(daily.weather_code[i]||0,0)][0]),make('span','',Math.round(daily.temperature_2m_min[i])+'° / '+Math.round(daily.temperature_2m_max[i])+'°'));forecast.append(row);});}
function displayJoke(value){
 const text=String(value||'').trim();$('joke').textContent=text;
 $('joke').classList.toggle('long-joke',text.length>93);
 $('joke').classList.toggle('very-long-joke',text.length>142);
 state.displayedJoke=text;
}
async function loadJoke(){
 const current=++jokeRequest;
 if(!state.prefs.jokes){$('joke').hidden=true;return;}
 $('joke').hidden=false;
 const cache=await chrome.storage.local.get(['stilltempoJokes','stilltempoRecentJokes']);
 if(current!==jokeRequest||!state.prefs.jokes)return;
 const history=Array.isArray(cache.stilltempoRecentJokes)?cache.stilltempoRecentJokes:[];
 const saved=Array.isArray(cache.stilltempoJokes)?cache.stilltempoJokes.filter(j=>j?.id&&typeof j.joke==='string'&&j.joke.length<=160):[];
 const local=editorials.map((j,i)=>({id:'editorial-'+i,joke:j}));
 const pool=[...local,...saved];let eligible=pool.filter(j=>!history.includes(j.id)&&j.joke!==state.displayedJoke);
 if(!eligible.length)eligible=pool.filter(j=>j.joke!==state.displayedJoke);
 const selected=(eligible.length?eligible:pool)[Math.floor(Math.random()*(eligible.length||pool.length))];
 displayJoke(selected.joke);
 const record=async chosen=>{
  const ids=[chosen.id,...history.filter(id=>id!==chosen.id)].slice(0,20);
  await chrome.storage.local.set({stilltempoRecentJokes:ids});
 };
 record(selected).catch(()=>{});
 try{
  const j=await timedFetch('https://icanhazdadjoke.com/',{headers:{Accept:'application/json'}},7000);
  if(current!==jokeRequest||!state.prefs.jokes)return;
  // External jokes may not be editorially suitable. Reject instead of truncating a punchline.
  if(typeof j?.id!=='string'||typeof j?.joke!=='string'||j.joke.length>135||j.joke.length<18||history.includes(j.id)||j.joke===state.displayedJoke)return;
  if(!/^[\p{L}\p{N}\p{P}\p{Zs}]+$/u.test(j.joke))return;
  // Save eligible external material for a future tab; never replace a visible punchline mid-read.
  await chrome.storage.local.set({stilltempoJokes:[{id:j.id,joke:j.joke},...saved.filter(x=>x.id!==j.id)].slice(0,25)});
 }catch{}
}
function applyPrefs(){const p=state.prefs;
 for(const [id,key] of [['clock24','clock24'],['setting-weather','weather'],['approximate','approximateLocation'],['setting-jokes','jokes'],['setting-radio','radio'],['chime','chime'],['notifications','notifications']])$(id).checked=!!p[key];
 $('day-start').value=p.dayStart;$('lounge-start').value=p.loungeStart;$('chime-volume').value=Math.round(p.chimeVolume*100);
 $('weather').hidden=!p.weather;$('joke').hidden=!p.jokes;applyAppearance();nowTime();renderAudio();
}
function openSettings(){$('settings').showModal();renderLinkSettings();applyPrefs();}
function wire(){
 $('wallpaper-next').addEventListener('animationend',event=>{if(event.animationName==='wallpaper-glide')completePhotoTransition(photoTransitionId);});
 for(const panel of all('.glass')){panel.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=panel.getBoundingClientRect();panel.style.setProperty('--pointer-x',(e.clientX-r.left)+'px');panel.style.setProperty('--pointer-y',(e.clientY-r.top)+'px');},{passive:true});}
 $('search-form').addEventListener('submit',async e=>{e.preventDefault();const query=$('search').value.trim();if(!query)return;try{await chrome.search.query({text:query,disposition:'CURRENT_TAB'});}catch(e){notify('Browser-default search is unavailable.');}});
 $('task-form').addEventListener('submit',async e=>{e.preventDefault();const value=$('task-input').value.trim();if(!value)return;try{await send('TASK',{action:'add',text:value});$('task-input').value='';}catch(e){notify(e.message);}});
 $('timer-toggle').onclick=()=>action('TIMER',{action:state.timer?.status==='running'?'pause':'start'}).catch(()=>{});
 $('timer-reset').onclick=()=>action('TIMER',{action:'reset'}).catch(()=>{});
 $('timer-break').onclick=()=>action('TIMER',{action:'break'}).catch(()=>{});
 const setFocusMinutes=async minutes=>{
  if(!Number.isInteger(minutes)||minutes<1||minutes>180){notify('Choose 1 to 180 whole minutes.');if(document.activeElement===$('duration'))$('duration').blur();renderTimer();return;}
  try{await action('TIMER',{action:'duration',minutes});}catch{renderTimer();}
 };
 $('duration').addEventListener('change',()=>setFocusMinutes(Number($('duration').value)));
 $('duration').addEventListener('keydown',e=>{if(e.key==='Enter'){$('duration').blur();}});
 $('duration').addEventListener('blur',()=>{if(String($('duration').value).trim()==='')renderTimer();});
 $('duration-less').onclick=()=>setFocusMinutes(Math.max(1,state.prefs.duration-5));
 $('duration-more').onclick=()=>setFocusMinutes(Math.min(180,state.prefs.duration+5));
 all('[data-focus-preset]').forEach(b=>b.onclick=()=>setFocusMinutes(Number(b.dataset.focusPreset)));
 all('[data-mode]').forEach(b=>b.onclick=()=>action('PREF',{patch:{mode:b.dataset.mode}}).catch(()=>{}));
 $('next-photo').onclick=()=>{if(state.wallpapers?.[state.appearance]?.pinned){notify('Unpin the photograph before refreshing.');return;}nextPhoto();};$('pin-photo').onclick=()=>{if(!state.visible||state.busyPhoto)return;action('PHOTO_PIN',{mode:state.appearance,pinned:!state.wallpapers?.[state.appearance]?.pinned,photo:state.visible}).catch(()=>{});};
 $('blur').addEventListener('input',()=>{const n=Number($('blur').value);$('blur-value').textContent=n+'%';document.documentElement.style.setProperty('--blur',(n/100*17).toFixed(2)+'px');});
 $('blur').addEventListener('change',()=>action('PREF',{patch:{blur:Number($('blur').value)}}).catch(()=>{}));
 $('radio-play').onclick=()=>action('RADIO',{action:['playing','connecting','buffering','reconnecting'].includes(state.audio?.status)?'pause':'play'}).catch(()=>{});
 all('[data-station]').forEach(b=>b.onclick=()=>{if(b.dataset.station===state.audio?.station){rotateMusicQuip(b.dataset.station);return;}rotateMusicQuip(b.dataset.station);action('RADIO',{action:'station',station:b.dataset.station}).catch(()=>{});});
 $('radio-volume').oninput=()=>{$('radio-volume').title='Volume: '+$('radio-volume').value+'%';};
 $('radio-volume').onchange=()=>action('RADIO',{action:'volume',volume:Number($('radio-volume').value)/100}).catch(()=>{});
 $('weather-toggle').onclick=()=>{const panel=$('weather-pop');panel.hidden=!panel.hidden;$('weather-toggle').setAttribute('aria-expanded',String(!panel.hidden));};
 $('city-form').onsubmit=async e=>{e.preventDefault();const name=$('city-search').value.trim();if(!name)return;try{const u=new URL('https://geocoding-api.open-meteo.com/v1/search');u.searchParams.set('name',name);u.searchParams.set('count','6');u.searchParams.set('language','en');const data=await timedFetch(u.href);const results=$('city-results');results.replaceChildren();for(const c of data.results||[]){const city={name:c.name,display:[c.name,c.admin1,c.country].filter(Boolean).join(', '),latitude:c.latitude,longitude:c.longitude};const b=make('button','city-option',city.display);b.type='button';b.onclick=async()=>{await action('PREF',{patch:{city}});$('city-results').replaceChildren();await loadWeather(true);};results.append(b);}if(!data.results?.length)results.textContent='No match. Try a nearby town.';}catch(e){notify('City lookup unavailable.');}};
 $('open-settings').onclick=openSettings;$('close-settings').onclick=()=>$('settings').close();$('settings').addEventListener('click',e=>{if(e.target===$('settings'))$('settings').close();});
 for(const [id,key] of [['clock24','clock24'],['setting-weather','weather'],['approximate','approximateLocation'],['setting-jokes','jokes'],['setting-radio','radio'],['chime','chime'],['notifications','notifications']])$(id).onchange=async()=>{await action('PREF',{patch:{[key]:$(id).checked}});if(key==='weather'||key==='approximateLocation')loadWeather(true);if(key==='jokes')loadJoke();};
 for(const [id,key] of [['day-start','dayStart'],['lounge-start','loungeStart']])$(id).onchange=()=>action('PREF',{patch:{[key]:$(id).value}}).catch(()=>{});
 $('chime-volume').onchange=()=>action('PREF',{patch:{chimeVolume:Number($('chime-volume').value)/100}}).catch(()=>{});
 $('chime-preview').onclick=()=>action('CHIME').catch(()=>{});
 $('reset-city').onclick=async()=>{await action('PREF',{patch:{city:null,approximateLocation:true}});await loadWeather(true);};
 $('new-shortcut').onclick=()=>editLink(null);
 $('cancel-shortcut').onclick=()=>{$('shortcut-form').hidden=true;};
 $('shortcut-form').onsubmit=async e=>{e.preventDefault();try{await action('LINK',{action:'save',id:$('link-id').value||null,name:$('link-name').value,url:$('link-url').value});$('shortcut-form').hidden=true;}catch{}};
 $('export-data').onclick=async()=>{try{const data=await action('EXPORT');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=make('a');a.href=u;a.download='stilltempo-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);notify('Full StillTempo backup exported.');}catch{}};
 $('import-data').onchange=async()=>{const file=$('import-data').files[0];if(!file)return;try{
  if(file.size>2000000)throw Error('Backup is too large');
  const parsed=JSON.parse(await file.text()),preview=await action('IMPORT_PREVIEW',{data:parsed});
  const scope=preview.settings?'tasks, shortcuts, appearance, preferences, audio defaults and photo pins':'tasks and shortcuts only';
  const pinNote=preview.pins.length?'\nPinned: '+preview.pins.join(' and ')+'.':'';
  if(!confirm(`Import ${preview.tasks} tasks and ${preview.links} shortcuts?\n\nThis replaces ${scope}.${pinNote}\n\nAn internal recovery snapshot will be saved first. The active focus session and radio playback will stop.`))return;
  await action('IMPORT',{data:parsed});notify('StillTempo backup restored.');
 }catch(e){notify(e.message);}finally{$('import-data').value='';}};
 chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;
  if(changes.stilltempoPrefs){state.prefs={...INITIAL,...changes.stilltempoPrefs.newValue};applyPrefs();}
  if(changes.stilltempoTasks){state.tasks=changes.stilltempoTasks.newValue||[];renderTasks();}
  if(changes.stilltempoLinks){state.links=changes.stilltempoLinks.newValue||[];renderLinks();renderLinkSettings();}
  if(changes.stilltempoTimer){state.timer=changes.stilltempoTimer.newValue;renderTimer();}
  if(changes.stilltempoAudio){state.audio=changes.stilltempoAudio.newValue;renderAudio();}
  if(changes.stilltempoWallpapers){
    const previous=state.wallpapers;state.wallpapers=changes.stilltempoWallpapers.newValue;updatePin();
    // An intentional pin from another tab takes precedence over pending loads.
    const mode=state.appearance,now=state.wallpapers?.[mode],before=previous?.[mode];
    if(now?.pinned&&now.current&&(now.pinned!==before?.pinned||now.current?.id!==before?.current?.id)&&state.visible?.id!==now.current.id){
      tabPhoto[mode]=now.current;
      loadModePhoto(mode).catch(()=>{});
    }
  }
 });
}
async function start(){
 wire();let a;
 try{a=await send('INIT');}
 catch(e){notify('Extension storage unavailable');return;}
 state.prefs={...INITIAL,...a.stilltempoPrefs};state.tasks=a.stilltempoTasks||[];state.links=a.stilltempoLinks||[];state.timer=a.stilltempoTimer;state.audio=a.stilltempoAudio;state.wallpapers=a.stilltempoWallpapers;
 positionAmbientCrown();
 window.addEventListener('resize',positionAmbientCrown,{passive:true});
 window.addEventListener('scroll',positionAmbientCrown,{passive:true});
 const crownObserver=new ResizeObserver(positionAmbientCrown);
 crownObserver.observe($('radio-panel'));crownObserver.observe($('weather'));crownObserver.observe(document.querySelector('.dashboard'));
 document.fonts?.ready.then(positionAmbientCrown).catch(()=>{});
 applyPrefs();renderTasks();renderLinks();renderTimer();renderAudio();loadWeather();loadJoke();
 timeTick=setInterval(()=>{nowTime();renderTimer();const m=getAppearance();if(m!==state.appearance)applyAppearance();},1000);
 setInterval(()=>{if(!document.hidden)rotateMusicQuip(state.audio?.station||'jazz');},27000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){nowTime();renderTimer();if(getAppearance()!==state.appearance)applyAppearance();}});
}
start().catch(e=>notify('Something went awry. '+e.message));
