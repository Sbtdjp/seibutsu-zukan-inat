const API="https://api.inaturalist.org/v1/taxa";
const DB="seibutsu_zukan_expanded_v3", STORE="taxa";
const groups=[
 {name:"哺乳類",id:40151},{name:"鳥類",id:3},{name:"爬虫類",id:26036},
 {name:"両生類",id:20978},{name:"魚類",id:47178},{name:"昆虫",id:47158},
 {name:"クモ類",id:47119},{name:"軟体動物",id:47115},{name:"甲殻類",id:85493},
 {name:"植物",id:47126},{name:"菌類",id:47170},{name:"その他の動物",id:1}
];
let db, autoTimer=null, current=[];
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function all(){return new Promise((resolve,reject)=>{let r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function putMany(items){return new Promise((resolve,reject)=>{let tx=db.transaction(STORE,"readwrite"),s=tx.objectStore(STORE);items.forEach(x=>s.put(x));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function getState(){try{return JSON.parse(localStorage.getItem("seibutsu_state_v3")||'{"drawn":[],"total":0,"cursor":0}')}catch{return {drawn:[],total:0,cursor:0}}}
function saveState(s){localStorage.setItem("seibutsu_state_v3",JSON.stringify(s))}
const state=getState();
function photoURL(t){return t.default_photo?.medium_url||t.default_photo?.url||""}
function cleanTaxon(t){
 if(t.rank!=="species"||!t.preferred_common_name||!photoURL(t))return null;
 return {id:t.id,name:t.preferred_common_name,sci:t.name,photo:photoURL(t),
  url:"https://www.inaturalist.org/taxa/"+t.id,group:t.iconic_taxon_name||"その他",license:t.default_photo?.license_code||"",attribution:t.default_photo?.attribution||""};
}
async function fetchPage(group,page){
 const url=new URL(API);url.searchParams.set("rank","species");url.searchParams.set("is_active","true");
 url.searchParams.set("locale","ja");url.searchParams.set("taxon_id",group.id);
 url.searchParams.set("per_page","200");url.searchParams.set("page","1");
 if(page>0)url.searchParams.set("id_above",page);
 url.searchParams.set("order_by","id");url.searchParams.set("order","asc");
 const res=await fetch(url);if(!res.ok)throw new Error("APIエラー "+res.status);
 return res.json();
}
async function collect(){
 $("more").disabled=true;
 const before=(await all()).length;
 try{
  const progress=JSON.parse(localStorage.getItem("seibutsu_fetch_progress_v3")||'{"pages":{},"done":[]}');
  let added=0;
  for(let i=0;i<5;i++){
   let g=null;
   for(let j=0;j<groups.length;j++){
    const candidate=groups[((progress.next||0)+j)%groups.length];
    if(!progress.done.includes(candidate.id)){g=candidate;break;}
   }
   if(!g){$("status").textContent="登録可能な分類群のページを一通り確認しました。";break}
   const afterId=progress.pages[g.id]||0;
   $("status").textContent=`${g.name}の候補を取得中… (${i+1}/5)`;
   const data=await fetchPage(g,afterId);
   const rows=data.results||[], valid=rows.map(cleanTaxon).filter(Boolean);
   await putMany(valid);added+=valid.length;
   if(rows.length)progress.pages[g.id]=rows[rows.length-1].id;
   if(rows.length<200)progress.done.push(g.id);
   progress.next=(groups.indexOf(g)+1)%groups.length;
   localStorage.setItem("seibutsu_fetch_progress_v3",JSON.stringify(progress));
   await new Promise(r=>setTimeout(r,1100));
  }
  const after=(await all()).length;
  $("status").textContent=`取得完了：新規登録 ${Math.max(0,after-before)}種。今回確認した候補 ${added}件。`;
 }catch(e){$("status").textContent="取得に失敗しました："+e.message+"。時間をおいて再試行してください。"}
 finally{$("more").disabled=false;await refreshStats()}
}
function shuffled(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function weightedPick(items,n){
 const weights=JSON.parse(localStorage.getItem("group_weights_v3")||"{}");
 const pool=items.slice(),out=[];
 while(pool.length&&out.length<n){
  const ws=pool.map(x=>Math.max(.05,Number(weights[x.group]||1)));
  const total=ws.reduce((a,b)=>a+b,0);
  let r=Math.random()*total,idx=0;
  for(;idx<ws.length-1;idx++){r-=ws[idx];if(r<=0)break}
  out.push(pool.splice(idx,1)[0]);
 }
 return out;
}
async function draw(){
 $("draw").disabled=true;
 try{
  const n=Math.max(1,Math.min(20,Number($("count").value)||1));
  const taxa=await all();
  const used=new Set(state.drawn), exclude=$("exclude").checked;
  const candidates=taxa.filter(t=>!exclude||!used.has(t.id));
  if(!candidates.length){
   $("status").textContent="未抽選候補がありません。「候補を追加取得」を押すか、抽選履歴をリセットしてください。";
   return;
  }
  current=weightedPick(candidates,n);
  current.forEach(t=>{if(!used.has(t.id)){state.drawn.push(t.id);state.total++}});
  saveState(state);
  renderCards(current);
  await refreshStats();
  $("status").textContent=`${current.length}種を抽選しました。`;
 }catch(e){
  console.error(e);
  $("status").textContent="抽選エラー："+(e?.message||String(e));
 }finally{
  $("draw").disabled=false;
 }
}

function renderCards(items){
 $("cards").innerHTML="";
 items.forEach(t=>{
  const el=document.createElement("article");el.className="card";
  const img=document.createElement("img");img.loading="lazy";img.src=t.photo;img.alt=t.name;
  const name=document.createElement("div");name.className="name";name.textContent=t.name;
  const sci=document.createElement("div");sci.className="sci";sci.textContent=t.sci;
  el.append(img,name,sci);el.onclick=()=>showDetail(t);$("cards").append(el);
 });
}
function showDetail(t){
 $("detail").innerHTML="";
 const h=document.createElement("h2");h.textContent=t.name;
 const p=document.createElement("p");p.textContent=t.sci;
 const a=document.createElement("a");a.href=t.url;a.target="_blank";a.rel="noopener";a.textContent="iNaturalistで詳細を見る";
 const lic=document.createElement("p");lic.className="muted";lic.textContent=`分類群：${t.group} / 写真ライセンス：${t.license||"表示なし"} ${t.attribution||""}`;
 const b=document.createElement("button");b.textContent="この分類群の出現率を下げる";
 b.onclick=()=>{let w=JSON.parse(localStorage.getItem("group_weights_v3")||"{}");w[t.group]=(w[t.group]||1)*.5;localStorage.setItem("group_weights_v3",JSON.stringify(w));b.textContent="設定しました（今後の抽選に反映）"};
 $("detail").append(h,p,a,lic,b);$("modal").style.display="flex";
}
async function refreshStats(){
 const taxa=await all(),used=new Set(state.drawn),remaining=taxa.filter(t=>!used.has(t.id)).length;
 $("registered").textContent=taxa.length.toLocaleString();$("remaining").textContent=remaining.toLocaleString();
 $("drawn").textContent=state.total.toLocaleString();$("bar").style.width=Math.min(100,taxa.length/10000*100)+"%";
}
$("draw").onclick=draw;$("more").onclick=collect;
$("close").onclick=()=>$("modal").style.display="none";
$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").style.display="none"};
$("reset").onclick=()=>{if(confirm("抽選履歴をリセットしますか？登録済みデータは残ります。")){state.drawn=[];state.total=0;saveState(state);refreshStats();$("status").textContent="抽選履歴をリセットしました。"}};
$("auto").onchange=()=>{if(autoTimer)clearInterval(autoTimer);autoTimer=null;if($("auto").checked){draw();autoTimer=setInterval(draw,Number($("interval").value)*1000)}};
$("interval").onchange=()=>{if($("auto").checked){clearInterval(autoTimer);autoTimer=setInterval(draw,Number($("interval").value)*1000)}};
$("export").onclick=async()=>{let data={taxa:await all(),state};let blob=new Blob([JSON.stringify(data)],{type:"application/json"});let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="seibutsu-data.json";a.click();URL.revokeObjectURL(a.href)};
$("import").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(Array.isArray(d.taxa))await putMany(d.taxa);if(d.state){state.drawn=[...new Set([...state.drawn,...d.state.drawn])];state.total=Math.max(state.total,d.state.total||0);saveState(state)}await refreshStats();$("status").textContent="データを読み込みました。"}catch(err){$("status").textContent="読み込みに失敗しました。"}};
(async()=>{db=await openDB();await refreshStats();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});})();
