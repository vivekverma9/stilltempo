import {MODES} from './config.js';
// Persistent application primitives and the single-writer operation queue.
export const store = chrome.storage.local;
export const get = async key => (await store.get(key))[key];
export const set = obj => store.set(obj);
let chain = Promise.resolve();
export function serial(fn) { const work = chain.then(fn, fn); chain = work.catch(() => {}); return work; }
export const timerBase = (minutes=25,kind='focus') => ({id:crypto.randomUUID(),kind,status:'idle',duration:minutes,remainingMs:minutes*60000,endAt:0,completedNotified:false});
export const audioBase = () => ({station:'jazz',volume:0.55,status:'idle',error:'',commandId:''});
export const safeHttp = value => { try {const u = new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password ? u.href : null;}catch{return null;} };
export const validMode = mode => MODES.includes(mode);
export const validMinutes = n => Number.isInteger(n) && n>=1 && n<=180;
export const states = () => ({workspace:{pinned:false,current:null,everShown:false},lounge:{pinned:false,current:null,everShown:false}});
// Crypto-backed rejection sampling avoids both modulo bias and ordered wallpaper sequences.
export function randomIndex(length){
  if(!Number.isSafeInteger(length)||length<1)throw Error('Empty random selection');
  const range=0x100000000, limit=range-(range%length), value=new Uint32Array(1);
  do{crypto.getRandomValues(value);}while(value[0]>=limit);
  return value[0]%length;
}
export function shuffle(items){const list=[...items];for(let i=list.length-1;i>0;i--){const j=randomIndex(i+1);[list[i],list[j]]=[list[j],list[i]];}return list;}


