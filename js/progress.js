let S={baseId:null,reactId:null,prompted:false,saveTimer:null};
const TTL=7*24*60*60*1000,MAX=2,IDX='rsync:index';
function sigForLocal(file){if(!file)return null;return 'file:'+file.name+'|'+file.size+'|'+file.lastModified;}
function normUrl(u){try{const x=new URL(u,window.location.href);return 'url:'+x.href;}catch(e){return null}}
function sigForYT(player){try{if(!player||!player.getVideoData)return null;const id=player.getVideoData().video_id;return id?'yt:'+id:null}catch(e){return null}}
function getNow(){return Date.now()}
function getPairKey(){if(!S.baseId||!S.reactId)return null;return 'rsync:pair:'+S.baseId+'||'+S.reactId}
function readIndex(){try{const s=localStorage.getItem(IDX);return s?JSON.parse(s):[]}catch(e){return []}}
function writeIndex(a){try{localStorage.setItem(IDX,JSON.stringify(a))}catch(e){}
}
function prune(){const now=getNow();let idx=readIndex().filter(x=>now-x.t<=TTL);if(idx.length>MAX){idx=idx.sort((a,b)=>b.t-a.t).slice(0,MAX)}writeIndex(idx);const keys=new Set(idx.map(x=>x.k));for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('rsync:pair:')&&!keys.has(k)){try{localStorage.removeItem(k)}catch(e){}}}}
function readPair(k){try{const s=localStorage.getItem(k);return s?JSON.parse(s):null}catch(e){return null}}
function writePair(k,obj){try{localStorage.setItem(k,JSON.stringify(obj))}catch(e){}
let idx=readIndex().filter(x=>x.k!==k);idx.unshift({k,t:getNow()});writeIndex(idx);prune()}
function updateSource(which,id){if(!id)return;if(which==='base')S.baseId=id;else S.reactId=id;if(bothReady()&&!S.saveTimer&&canUseSync())startAutoSave();maybePrompt()}
function recordLocalFile(videoSelector,file){const id=sigForLocal(file);if(videoSelector==="#videoBaseLocal")updateSource('base',id);else updateSource('react',id)}
function recordNetworkSource(videoSelector,meta){let id=null;if(meta&&meta.type==='yt'&&meta.id)id='yt:'+meta.id;else if(meta&&meta.url)id=normUrl(meta.url);if(videoSelector==="#videoBaseLocal")updateSource('base',id);else updateSource('react',id)}
function bothReady(){return !!(S.baseId&&S.reactId)}
function canUseSync(){return typeof window.getBaseCurrentTime==='function'&&typeof window.setDelay==='function'&&typeof window.syncSeek==='function'}
function saveNow(){try{if(!bothReady()||!canUseSync())return;const k=getPairKey();if(!k)return;const delay=typeof window.videoReactDelay==='number'?window.videoReactDelay:0;let baseTime=0;try{baseTime=window.getBaseCurrentTime()?window.getBaseCurrentTime():0}catch(e){}
const obj={baseId:S.baseId,reactId:S.reactId,delay:delay,baseTime:baseTime,updatedAt:getNow()};writePair(k,obj)}catch(e){}}
function startAutoSave(){if(S.saveTimer)clearInterval(S.saveTimer);S.saveTimer=setInterval(saveNow,10000)}
function maybePrompt(){if(S.prompted||!bothReady())return;const k=getPairKey();if(!k)return;prune();const rec=readPair(k);if(!rec)return;const age=getNow()-rec.updatedAt;if(age>TTL)return;S.prompted=true;showResumePrompt(rec)}
function msToTime(s){s=Math.floor(s);const m=Math.floor(s/60);const ss=String(s%60).padStart(2,'0');return m+':'+ss}
function showResumePrompt(rec){const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;';const c=document.createElement('div');c.style.cssText='background:rgba(20,20,28,0.95);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;min-width:260px;max-width:90vw;padding:14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,0.6);';const t=document.createElement('div');t.textContent='Resume where you left off?';t.style.cssText='font-weight:600;margin-bottom:8px;';const p=document.createElement('div');p.textContent='Last time at '+msToTime(rec.baseTime)+' with delay '+(rec.delay>=0?'+':'')+rec.delay.toFixed(1)+'s';p.style.cssText='opacity:0.9;margin-bottom:12px;';const b=document.createElement('div');b.style.cssText='display:flex;gap:8px;justify-content:flex-end;';const resume=document.createElement('button');resume.textContent='Resume';resume.style.cssText='background:#2e7d32;color:#fff;border:1px solid rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;';const reset=document.createElement('button');reset.textContent='Start New';reset.style.cssText='background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;';b.appendChild(reset);b.appendChild(resume);c.appendChild(t);c.appendChild(p);c.appendChild(b);o.appendChild(c);document.body.appendChild(o);resume.addEventListener('click',function(){try{if(typeof window.setDelay==='function')window.setDelay(rec.delay);setTimeout(function(){try{if(typeof window.syncSeek==='function')window.syncSeek(true,rec.baseTime)}catch(e){}},100)}catch(e){}document.body.removeChild(o)});reset.addEventListener('click',function(){try{const k=getPairKey();if(k)localStorage.removeItem(k)}catch(e){}document.body.removeChild(o)});}
document.addEventListener('visibilitychange',function(){if(document.hidden)saveNow()});
window.addEventListener('beforeunload',function(){saveNow()});
try{prune()}catch(e){}
window.Progress={recordLocalFile,recordNetworkSource,saveNow}

