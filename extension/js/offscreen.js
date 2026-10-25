import {STATIONS} from './config.js';

// One offscreen HTMLAudioElement for uninterrupted listening across new tabs.
// No third-party script, proxy or stream rebroadcasting is involved.
const player=new Audio();player.preload='none';
const chime=new Audio(chrome.runtime.getURL('assets/focus-chime.wav'));
let wanted=false,station='jazz',attempt=0,sourceIndex=0,retries=0,commandId='';
let retryTimer=null,watchdog=null,stallTimer=null,failedAttempt=false;
let desiredVolume=.55,ducked=false,chimeEpoch=0,chimeRestoreTimer=null;
const stationSources=()=>{
 const info=STATIONS[station];
 return [{name:info.name,url:info.url},...(info.backup?[info.backup]:[])];
};
const source=()=>stationSources()[sourceIndex]||stationSources()[0];
function applyVolume(){player.volume=ducked?Math.min(desiredVolume*.16,.085):desiredVolume;}
function status(state,error=''){
 chrome.runtime.sendMessage({type:'RADIO_STATE',station,commandId,status:state,error,sourceName:source().name}).catch(()=>{});
}
function clearPlayback(){
 clearTimeout(retryTimer);retryTimer=null;clearTimeout(watchdog);watchdog=null;clearTimeout(stallTimer);stallTimer=null;
 player.pause();player.removeAttribute('src');player.load();
}
async function connect(){
 if(!wanted)return;
 const generation=++attempt;
 clearPlayback();failedAttempt=false;
 const current=source();
 status(sourceIndex||retries?'reconnecting':'connecting',sourceIndex?`Trying ${current.name}…`:'');
 player.src=current.url;
 watchdog=setTimeout(()=>{if(generation===attempt&&wanted)failed('Connection timed out');},17000);
 try{
   await player.play();
   if(generation===attempt&&wanted){
     clearTimeout(watchdog);watchdog=null;clearTimeout(stallTimer);stallTimer=null;retries=0;
     status('playing');
   }
 }catch(e){if(generation===attempt&&wanted)failed(e?.message||'Audio unavailable');}
}
function failed(message){
 if(!wanted||failedAttempt)return;
 failedAttempt=true;clearTimeout(watchdog);watchdog=null;
 // Give each broadcast one small retry, then try its *own* separately named
 // fallback. Never display 'On air' while an unavailable source is failing.
 const options=stationSources();
 let delay;
 if(retries<1){retries++;delay=2400;}
 else if(sourceIndex+1<options.length){sourceIndex++;retries=0;delay=850;}
 else{
   wanted=false;attempt++;clearPlayback();
   status('unavailable','Broadcast unavailable. Try Play again or use the station website.');
   return;
 }
 status('reconnecting',sourceIndex?`Switching to ${source().name}…`:'Reconnecting…');
 retryTimer=setTimeout(()=>{if(wanted)connect();},delay);
}
player.addEventListener('error',()=>{
 if(!wanted)return;
 const code=player.error?.code;
 failed(code===4?'Unsupported stream or browser blocked the source':'Stream connection failed');
});
function bufferStall(){
 if(!wanted||failedAttempt||stallTimer)return;
 status('buffering');
 const generation=attempt;
 stallTimer=setTimeout(()=>{stallTimer=null;if(wanted&&generation===attempt)failed('Stream stalled');},14000);
}
player.addEventListener('waiting',bufferStall);
player.addEventListener('stalled',bufferStall);
player.addEventListener('playing',()=>{
 if(!wanted||failedAttempt)return;
 clearTimeout(watchdog);watchdog=null;clearTimeout(stallTimer);stallTimer=null;status('playing');
});
chrome.runtime.onMessage.addListener((m,_sender,send)=>{
 if(m?.target!=='offscreen')return false;
 (async()=>{
   if(m.type==='CHIME'){
     const epoch=++chimeEpoch;clearTimeout(chimeRestoreTimer);ducked=true;applyVolume();chime.pause();chime.currentTime=0;
     chime.volume=Math.min(1,Math.max(0,Number(m.volume??.85)));
     try{await chime.play();}catch(e){ducked=false;applyVolume();throw e;}
     const restore=()=>{if(epoch===chimeEpoch){ducked=false;applyVolume();}};
     chime.onended=restore;chimeRestoreTimer=setTimeout(restore,5500);return;
   }
   if(m.type!=='RADIO')return;
   if(m.action==='volume'){
     desiredVolume=Math.min(1,Math.max(0,Number(m.volume??.55)));applyVolume();return;
   }
   if(m.action==='pause'){
     commandId=m.commandId||commandId;wanted=false;attempt++;clearPlayback();status('paused');return;
   }
   commandId=m.commandId||commandId;
   if(m.station in STATIONS){
     if(station!==m.station){station=m.station;sourceIndex=0;retries=0;}
   }
   desiredVolume=Math.min(1,Math.max(0,Number(m.volume??.55)));applyVolume();
   if(m.action==='play'||(m.action==='station'&&wanted)){
     wanted=true;sourceIndex=0;retries=0;
     await connect();
   }
 })().then(()=>send({ok:true}),e=>send({ok:false,error:e.message}));return true;
});
