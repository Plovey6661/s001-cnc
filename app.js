import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import {createMachining} from './machining.js?v=12';
import {createShowcaseDemo} from './showcase-demo.js?v=2';
import {createProgramming} from './programming.js?v=10';

const pageParams=new URLSearchParams(location.search),demoMode=pageParams.get('demo')==='1';
const requestedScene=[1,2,3,4].includes(Number(pageParams.get('scene')))?Number(pageParams.get('scene')):1;
let showcaseDemo=null,demoPlaying=!matchMedia('(prefers-reduced-motion:reduce)').matches,renderAt=0;
if(demoMode)document.body.classList.add('demo-mode');
const metadata = [
  {id:'marble',zh:'大理石立柱',en:'Marble Stone Stand',description:'機台的承重結構。包含底座與立柱，支撐各軸和加工平台。',offset:[-1.6,.4,-.5]},
  {id:'linear',zh:'Z 軸平台',en:'Z-axis',description:'安裝於立柱上的 Z 軸平台，與主軸組件相連。',offset:[-.2,1.3,-.5]},
  {id:'spindle',zh:'主軸',en:'Spindle',description:'主軸本體與刀具夾持部件。位於加工區上方，連接 Z 軸平台。',offset:[1.7,1.4,-.4]},
  {id:'frame',zh:'機架',en:'Machine Frame',description:'機台下方的支撐機架與面板，包含原始 AOMC 標誌。',offset:[2.3,-.05,-.8]},
  {id:'xaxis',zh:'X 軸平台',en:'X-axis',description:'水平運動平台的一部分。與 Y 軸平台疊合，形成加工平台的平面移動結構。',offset:[-2.1,.35,.7]},
  {id:'yaxis',zh:'Y 軸平台',en:'Y-axis',description:'與 X 軸相互配合的水平運動平台，上方承載夾具。',offset:[-.1,.6,.85]},
  {id:'cover',zh:'平台蓋',en:'Platform Cover',description:'加工平台周圍的保護蓋。拆解後可觀察蓋板與運動平台的相對位置。',offset:[-.7,-.8,2.8]},
  {id:'fixture',zh:'夾具',en:'Fixture',description:'安裝在加工平台上的工件夾持組件，包含場景中的上下夾持件。',offset:[1.8,.7,1.1]}
];
const $ = s=>document.querySelector(s);
const groups=new Map(), meshList=[], labels=new Map(), leaders=new Map();
let selected=null, isolated=false, amount=.85, target=.85, playing=false, phase=0, last=performance.now(), ready=false;
let renderer,controls,camera,scene,grid,modelScale=1,baseBox,modelInfo;
let level=1,sceneOneStage='learn',machining=null,machiningPromise=null,programming=null,freeProgramming=null;
const eyeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
function shuffle(list){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function partExplode(part,t){return part.id==='cover'?THREE.MathUtils.clamp((t-.52)/.48,0,1):t;}
for(const [i,part] of metadata.entries()){
  part.index=String(i+1).padStart(2,'0');
  part.guessId='';
  const row=document.createElement('div');row.className='part-row';row.dataset.part=part.id;
  const options=['<option value="">選擇名稱</option>',...shuffle(metadata).map(o=>`<option value="${o.id}">${o.zh}</option>`)].join('');
  row.innerHTML=`<button class="part-select" data-part="${part.id}" aria-pressed="false"><span class="part-no">${part.index}</span><span class="part-copy"><span class="part-name">${part.zh}</span><span class="part-en">${part.en}</span></span><span class="part-quiz-hint">此零件</span></button><label class="part-guess-wrap"><span class="sr-only">選擇此零件的名稱</span><select class="part-guess" data-part="${part.id}">${options}</select></label><button class="eye" aria-label="隱藏此零件" aria-pressed="true">${eyeIcon}</button>`;
  row.querySelector('.part-select').onclick=()=>selectPart(selected===part.id?null:part.id);
  row.querySelector('.eye').onclick=()=>{const g=groups.get(part.id);if(!g)return;g.visible=!g.visible;isolated=false;syncVisibility();};
  row.querySelector('.part-guess').addEventListener('change',e=>{part.guessId=e.target.value;row.classList.remove('guess-ok','guess-bad');updateLabels();});
  $('#parts').append(row);
}
function syncVisibility(){
  for(const p of metadata){const visible=groups.get(p.id)?.visible??true;const row=$(`[data-part="${p.id}"]`);row.classList.toggle('hidden-part',!visible);const b=row.querySelector('.eye');b.setAttribute('aria-pressed',String(visible));b.setAttribute('aria-label',`${visible?'隱藏':'顯示'}${p.zh}`);}
  $('#isolate').textContent=isolated?'顯示全部':'單獨顯示';
}
function selectPart(id){
  if(id&&!metadata.some(p=>p.id===id))throw new Error('未知零件');
  selected=id;const part=metadata.find(p=>p.id===id);
  if(isolated){if(id){for(const [key,g] of groups)g.visible=key===id;}else{for(const g of groups.values())g.visible=true;isolated=false;}if(ready)fitView('iso');}
  if(part){
    groups.get(id)&&(groups.get(id).visible=true);
    if(sceneOneStage==='quiz'){$('#detail-index').textContent='COMPONENT';$('#detail-name').textContent='已選取一個零件';$('#detail-description').textContent='請用左側下拉選單選出這個零件的名稱。八個名稱都會出現在選項裡。';$(`#parts .part-row[data-part="${id}"] .part-guess`)?.focus();}
    else{$('#detail-index').textContent=`COMPONENT ${part.index} / 08`;$('#detail-name').textContent=part.zh;$('#detail-description').textContent=part.description;}
    $('.detail-actions').hidden=false;$('#status').textContent=sceneOneStage==='quiz'?'已選取一個零件':`已選取${part.zh}`;
  }else if(sceneOneStage==='quiz'){$('#detail-index').textContent='LEVEL 1-2';$('#detail-name').textContent='為每個零件選出正確名稱。';$('#detail-description').textContent='左側列出全部零件名稱。點選模型中的零件，再用下拉選單配對。';$('.detail-actions').hidden=true;}
  else{$('#detail-index').textContent='LEVEL 1-1';$('#detail-name').textContent='從整體，看到每個零件。';$('#detail-description').textContent='拖曳拆解滑桿。平台蓋會較晚打開，避免先擋住機架。名稱標在零件旁，合裝時仍可讀。';$('.detail-actions').hidden=true;}
  for(const p of metadata){const row=$(`[data-part="${p.id}"]`);row.classList.toggle('selected',p.id===id);row.querySelector('.part-select').setAttribute('aria-pressed',String(p.id===id));labels.get(p.id)?.classList.toggle('selected-label',p.id===id);}
  meshList.forEach(m=>{m.material.emissive.set(m.userData.part===id?0x198b74:0);m.material.emissiveIntensity=m.userData.part===id?.22:0;});
  syncVisibility();
}
function setAmount(value,instant=false){target=THREE.MathUtils.clamp(value,0,1);if(instant)amount=target;const n=Math.round(target*100);$('#explode').value=n;$('#explode').style.background=`linear-gradient(to right,#178d75 ${n}%,#e5ecee ${n}%)`;$('#explode-value').innerHTML=`${n}<span>%</span>`;$('#view-title').textContent=n===0?'完整組裝':'拆解視圖';$('#view-state').textContent=n===0?'ASSEMBLED VIEW':'EXPLODED VIEW';}
function stopPlay(){playing=false;$('#play-icon').textContent='▶';$('#play-text').textContent='播放拆解';$('#play').setAttribute('aria-label','播放組裝與拆解動畫');}
$('#explode').addEventListener('input',e=>{stopPlay();setAmount(Number(e.target.value)/100,true);});
$('#assemble').onclick=()=>{stopPlay();setAmount(0);};
$('#explode-all').onclick=()=>{stopPlay();setAmount(1);fitView('iso',1);};
$('#explode').addEventListener('change',()=>{if(target>.85)fitView('iso',target);});
$('#play').onclick=()=>{if(playing){stopPlay();return;}playing=true;phase=Math.acos(1-2*amount);fitView('iso',1);$('#play-icon').textContent='Ⅱ';$('#play-text').textContent='暫停動畫';$('#play').setAttribute('aria-label','暫停組裝與拆解動畫');};
$('#clear-selection').onclick=()=>selectPart(null);
$('#show-all').onclick=()=>{for(const g of groups.values())g.visible=true;isolated=false;syncVisibility();if(ready)fitView('iso');};
$('#isolate').onclick=()=>{if(!selected)return;isolated=!isolated;for(const [id,g]of groups)g.visible=!isolated||id===selected;syncVisibility();if(ready)fitView('iso');if(matchMedia('(max-width:760px)').matches)$('.viewer').scrollIntoView({behavior:'smooth'});};
$('#grid-toggle').onchange=e=>{if(grid)grid.visible=e.target.checked;};
$('#labels-toggle').onchange=e=>{$('#labels').hidden=!e.target.checked;};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fitView(b.dataset.view));
$('#reset-view').onclick=()=>fitView('iso');
$('#canvas').addEventListener('keydown',e=>{if(e.key==='Escape'){selectPart(null);stopPlay();}if(e.key.toLowerCase()==='r')fitView('iso');});

function visibleBox(at=amount){const box=new THREE.Box3();for(const [id,g] of groups)if(g.visible){const part=metadata.find(p=>p.id===id);const b=g.userData.box.clone();b.translate(new THREE.Vector3(...part.offset).multiplyScalar(partExplode(part,at)));box.union(b);}return box.isEmpty()?baseBox.clone():box;}
function fitView(view='iso',at=amount,forceWhole=false){
  if(!ready)return;
  if(level>=2&&machining&&!forceWhole)return machining.focus(view);
  const box=visibleBox(at);const center=box.getCenter(new THREE.Vector3());
  const directions={iso:[1.25,.8,2.1],front:[0,0,1],side:[1,0,0],top:[0,1,.001]};
  const direction=new THREE.Vector3(...directions[view]).normalize(),right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right);
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let distance=1;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(v.dot(right))/tanH+v.dot(direction),Math.abs(v.dot(up))/tanV+v.dot(direction));}
  camera.position.copy(center).add(direction.multiplyScalar(distance*1.23));
  camera.up.set(0,1,0);controls.target.copy(center);controls.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
}
function updateParts(){for(const p of metadata){const g=groups.get(p.id);if(g)g.position.set(...p.offset).multiplyScalar(level===1?partExplode(p,amount):0);}scene?.updateMatrixWorld(true);}
const projected=new THREE.Vector3();
function labelText(part){
  if(sceneOneStage==='quiz'){const guess=metadata.find(p=>p.id===part.guessId);return guess?guess.zh:'？';}
  return part.zh;
}
function updateLabels(){
  if(!ready||level!==1||$('#labels').hidden)return;
  const rect=$('#canvas-wrap').getBoundingClientRect();const items=[];
  let cx=0,cy=0,count=0;
  for(const p of metadata){
    const g=groups.get(p.id),l=labels.get(p.id),leader=leaders.get(p.id);if(!g||!l||!leader)continue;
    if(!g.visible){l.hidden=leader.hidden=true;continue;}
    projected.copy(g.userData.center).add(g.position).project(camera);
    const ax=(projected.x*.5+.5)*rect.width,ay=(-projected.y*.5+.5)*rect.height;
    if(projected.z>1||projected.z<0||ax<-40||ax>rect.width+40||ay<-40||ay>rect.height+40){l.hidden=leader.hidden=true;continue;}
    const text=labelText(p);l.querySelector('span').textContent=text;
    items.push({p,l,leader,ax,ay,text,width:Math.min(140,22+text.length*12)});
    cx+=ax;cy+=ay;count++;
  }
  if(count){cx/=count;cy/=count;}else{cx=rect.width/2;cy=rect.height/2;}
  const outward=amount<.18?58:32;const placed=[];
  for(const item of items){
    const dx=item.ax-cx,dy=item.ay-cy,mag=Math.hypot(dx,dy)||1;
    const sides=[[dx/mag*outward,dy/mag*outward],[outward,0],[-outward,0],[0,-outward],[0,outward],[outward,-26],[-outward,-26],[outward,28],[-outward,28],[8,-64],[-8,58],[70,-38],[-70,-38]];
    let x=item.ax,y=item.ay;
    for(const [ox,oy] of sides){
      x=Math.max(item.width/2+8,Math.min(rect.width-item.width/2-8,item.ax+ox));
      y=Math.max(96,Math.min(rect.height-24,item.ay+oy));
      if(!placed.some(a=>Math.abs(a.x-x)<(a.width+item.width)/2+8&&Math.abs(a.y-y)<22))break;
    }
    placed.push({x,y,width:item.width});
    item.l.hidden=item.leader.hidden=false;
    item.l.style.left=`${x}px`;item.l.style.top=`${y}px`;
    item.leader.style.left=`${item.ax}px`;item.leader.style.top=`${item.ay}px`;
    item.leader.style.width=`${Math.hypot(x-item.ax,y-item.ay)}px`;
    item.leader.style.transform=`rotate(${Math.atan2(y-item.ay,x-item.ax)}rad)`;
  }
}
function animate(now){
  requestAnimationFrame(animate);if(!ready)return;if(demoMode){if(document.hidden||(!demoPlaying&&showcaseDemo)){last=now;return;}if(now-renderAt<1000/24)return;renderAt=now;}const elapsedDt=Math.min((now-last)/1000,.25),dt=Math.min(elapsedDt,.05);last=now;
  if(playing){phase+=dt*.65;setAmount((1-Math.cos(phase))/2,true);}else amount=THREE.MathUtils.lerp(amount,target,1-Math.exp(-dt*7));
  showcaseDemo?.update(elapsedDt);updateParts();programming?.update(elapsedDt);freeProgramming?.update(elapsedDt);machining?.update(dt);controls.update();updateLabels();renderer.render(scene,camera);
}
async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('#canvas'),antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,demoMode?1.25:2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.02,100);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=1;controls.maxDistance=35;controls.maxPolarAngle=Math.PI*.91;
    scene.add(new THREE.HemisphereLight(0xe8f6ff,0x58615d,2.4));const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(4,7,6);scene.add(key);const fill=new THREE.DirectionalLight(0xcfecff,2);fill.position.set(-4,2,-3);scene.add(fill);const rim=new THREE.DirectionalLight(0xffffff,1.5);rim.position.set(0,1,5);scene.add(rim);
    const [info,bin]=await Promise.all([fetch('./assets/model.json').then(r=>{if(!r.ok)throw Error('模型資料無法載入');return r.json();}),fetch('./assets/geometry.bin').then(r=>{if(!r.ok)throw Error('模型幾何無法載入');return r.arrayBuffer();})]);modelInfo=info;
    baseBox=new THREE.Box3(new THREE.Vector3(...info.bounds.min),new THREE.Vector3(...info.bounds.max));modelScale=3/baseBox.getSize(new THREE.Vector3()).y;const shift=baseBox.getCenter(new THREE.Vector3()).negate();shift.y=-baseBox.min.y;
    for(const p of metadata){const g=new THREE.Group();g.name=p.id;g.userData.box=new THREE.Box3();groups.set(p.id,g);scene.add(g);const l=document.createElement('div');l.className='model-label';l.innerHTML=`<span>${p.zh}</span>`;const leader=document.createElement('i');leader.className='label-leader';$('#labels').append(leader,l);labels.set(p.id,l);leaders.set(p.id,leader);}
    for(const data of info.meshes){
      const g=groups.get(data.part);if(!g)continue;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bin,data.position.byteOffset,data.position.count),3));
      if(data.normal)geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(bin,data.normal.byteOffset,data.normal.count),3));else geometry.computeVertexNormals();
      geometry.translate(shift.x,shift.y,shift.z);geometry.scale(modelScale,modelScale,modelScale);geometry.computeBoundingBox();g.userData.box.union(geometry.boundingBox);
      const c=data.baseColor||[.35,.42,.45,1];const color=new THREE.Color().setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace);
      const mat=new THREE.MeshStandardMaterial({color,metalness:Math.min(data.metalness??.25,.65),roughness:Math.max(data.roughness??.5,.3),side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,mat);mesh.name=data.name;mesh.userData={part:data.part,source:data.sourcePath};g.add(mesh);meshList.push(mesh);
    }
    baseBox=new THREE.Box3();for(const g of groups.values()){g.userData.center=g.userData.box.getCenter(new THREE.Vector3());baseBox.union(g.userData.box);}
    grid=new THREE.GridHelper(20,50,0xbecdd3,0xdde5e9);grid.position.y=-.035;grid.material.transparent=true;grid.material.opacity=.38;scene.add(grid);
    const resize=()=>{const r=$('#canvas-wrap').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe($('#canvas-wrap'));resize();
    ready=true;setAmount(.85,true);updateParts();fitView('iso');$('#loading').hidden=true;$('#status').textContent='CNC 模型載入完成，八個組件可以拆解';
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
    renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
    renderer.domElement.addEventListener('pointerup',e=>{if(level!==1||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5||e.button!==0)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshList).find(h=>h.object.parent.visible);selectPart(hit?.object.userData.part??null);});
    machiningPromise=demoMode&&requestedScene===1?Promise.resolve(null):createMachining({scene,camera,controls,meshes:meshList,scale:modelScale,shift,preview:demoMode,wholeView:view=>fitView(view,0,true)}).then(value=>{machining=value;if(!demoMode){programming=createProgramming({machining});freeProgramming=createProgramming({machining,mode:'free'});}return value;});
    machiningPromise.catch(error=>{console.error(error);$('#cut-hint').textContent='加工模型載入失敗，請重新整理重試。';});
    if(!demoMode)registerTools();requestAnimationFrame(animate);
    await setLevel(requestedScene);
    if(demoMode){
      controls.enabled=false;grid.visible=false;$('#labels').hidden=true;
      showcaseDemo=createShowcaseDemo({level,machining,controls,camera,scale:modelScale,setAmount,fitView});
      if(!demoPlaying)showcaseDemo.finish();
      updateParts();renderer.render(scene,camera);
      window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='s001-demo-playback'){demoPlaying=!!event.data.playing;last=performance.now();}});
      parent.postMessage({type:'s001-demo-ready'},location.origin);
    }
    window.cncExplorer={getState:()=>({ready,level,amount:Math.round(amount*100),target:Math.round(target*100),selected,playing,visible:[...groups].filter(([,g])=>g.visible).map(([id])=>id),meshCount:meshList.length,machining:machining?.getState()}),setAmount:n=>setAmount(n/100,true),selectPart,fitView,modelInfo};
  }catch(error){console.error(error);$('#loading').innerHTML='<strong>模型暫時無法載入</strong><span class="error-msg">請重新整理頁面，或開啟單檔離線版。</span><button class="outline-button" onclick="location.reload()">重新載入</button>';}
}
async function setLevel(next){
  if(!ready)return;
  if(!demoMode&&location.protocol!=='file:'){const url=new URL(location.href);url.searchParams.set('scene',String(next));history.replaceState(null,'',url);}
  stopPlay();
  if(next>=2){const button=$('#'+['','level-one','level-two','level-three','level-four'][next]);button.disabled=true;try{await machiningPromise;}catch{return;}finally{button.disabled=false;}}
  programming?.activate(false);freeProgramming?.activate(false);
  level=next;document.body.dataset.level=String(level);selectPart(null);isolated=false;for(const g of groups.values())g.visible=true;syncVisibility();updateParts();
  for(const [i,id]of ['level-one','level-two','level-three','level-four'].entries()){const b=$('#'+id);b.classList.toggle('active',level===i+1);b.setAttribute('aria-pressed',String(level===i+1));}
  $('.project-name h1').textContent=['','組裝探索','切削操作','運動指令','自由加工'][level];$('#viewport-eyebrow').textContent=['','LEVEL 01 / CNC ASSEMBLY','LEVEL 02 / CNC MACHINING','LEVEL 03 / AEROBASIC','LEVEL 04 / FREE MACHINING'][level];
  if(level>=2){$('#view-title').textContent=level===4?'自由加工':level===3?'指令與刀路':'切削操作';$('#view-state').textContent=level===4?'PREVIEW & EXECUTE':level===3?'PROGRAMMING LAB':'MANUAL MACHINING';$('#labels').hidden=true;grid.visible=false;machining.activate(true);if(level===3)programming?.activate(true);if(level===4)freeProgramming?.activate(true);}
  else{machining?.activate(false);$('#labels').hidden=!$('#labels-toggle').checked;grid.visible=$('#grid-toggle').checked;setAmount(target,true);fitView('iso');setSceneOneStage(sceneOneStage,true);}
  if(!demoMode)$('.viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#level-one').onclick=()=>setLevel(1);$('#level-two').onclick=()=>setLevel(2);$('#level-three').onclick=()=>setLevel(3);$('#level-four').onclick=()=>setLevel(4);
function setSceneOneStage(stage,keepAmount=false){
  sceneOneStage=stage==='quiz'?'quiz':'learn';
  document.body.dataset.stage=sceneOneStage;
  $('#stage-learn').classList.toggle('active',sceneOneStage==='learn');
  $('#stage-quiz').classList.toggle('active',sceneOneStage==='quiz');
  $('#stage-learn').setAttribute('aria-selected',String(sceneOneStage==='learn'));
  $('#stage-quiz').setAttribute('aria-selected',String(sceneOneStage==='quiz'));
  $('#quiz-brief').hidden=sceneOneStage!=='quiz';
  $('#quiz-bar').hidden=sceneOneStage!=='quiz';
  if(sceneOneStage==='quiz'&&!keepAmount)setAmount(Math.max(amount,.82));
  if(!selected)selectPart(null);else selectPart(selected);
  updateLabels();
}
$('#stage-learn').onclick=()=>setSceneOneStage('learn',true);
$('#stage-quiz').onclick=()=>setSceneOneStage('quiz');
$('#quiz-check').onclick=()=>{
  let right=0,filled=0;
  for(const p of metadata){
    const row=$(`#parts [data-part="${p.id}"]`);
    const guess=row.querySelector('.part-guess').value;
    p.guessId=guess;if(guess)filled++;if(guess===p.id)right++;
    row.classList.toggle('guess-ok',guess===p.id);
    row.classList.toggle('guess-bad',Boolean(guess)&&guess!==p.id);
  }
  $('#quiz-score').textContent=filled===0?'請先為零件選擇名稱':`答對 ${right} / 8`;
  updateLabels();
};
$('#quiz-reset').onclick=()=>{
  for(const p of metadata){
    p.guessId='';
    const row=$(`#parts [data-part="${p.id}"]`);
    row.querySelector('.part-guess').value='';
    row.classList.remove('guess-ok','guess-bad');
  }
  $('#quiz-score').textContent='尚未核對';
  updateLabels();
};
if(pageParams.get('stage')==='2'||pageParams.get('stage')==='quiz')sceneOneStage='quiz';
function registerTools(){
  if(!document.modelContext?.registerTool)return;const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tool={name:'configure_cnc_view',title:'調整 CNC 爆炸圖',description:'設定 CNC 拆解百分比、選取零件和視角，對應頁面上的控制項。',inputSchema:{type:'object',properties:{explodePercent:{type:'number',minimum:0,maximum:100},part:{type:['string','null'],enum:[...metadata.map(p=>p.id),null]},view:{type:'string',enum:['iso','front','side','top']}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['explodePercent','part','view'].includes(k)))throw Error('無效的輸入');if('explodePercent'in input&&(!Number.isFinite(input.explodePercent)||input.explodePercent<0||input.explodePercent>100))throw Error('拆解程度須在 0 至 100 之間');if('part'in input&&input.part!==null&&!metadata.some(p=>p.id===input.part))throw Error('未知零件');if('view'in input&&!['iso','front','side','top'].includes(input.view))throw Error('未知視角');stopPlay();if('explodePercent'in input)setAmount(input.explodePercent/100,true);if('part'in input)selectPart(input.part);updateParts();if(input.view)fitView(input.view);await new Promise(requestAnimationFrame);return {explodePercent:Math.round(amount*100),selected};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(e){console.warn(e);}
  const simulationTools=[
    {name:'set_cnc_level',title:'切換 CNC 關卡',description:'切換組裝爆炸圖、手動切削、指令學習或第四關自由加工。',inputSchema:{type:'object',properties:{level:{type:'integer',enum:[1,2,3,4]}},required:['level'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||![1,2,3,4].includes(input.level))throw Error('關卡須為 1、2、3 或 4');await setLevel(input.level);return {level,machining:machining?.getState()};}},
    {name:'get_cnc_state',title:'讀取 CNC 模擬狀態',description:'讀取目前關卡、三軸位移、主軸、切削結果及指令執行狀態。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({level,explodePercent:Math.round(amount*100),machining:machining?.getState(),programming:programming?.state(),freeProgramming:freeProgramming?.state()})},
    {name:'jog_cnc_axis',title:'移動模擬 CNC 軸',description:'第二關中以毫米移動一個軸。只影響此網頁模擬；主軸開啟且刀具接觸工件時會移除模擬材料。正方向沿用 S001 配對。',inputSchema:{type:'object',properties:{axis:{type:'string',enum:['x','y','z']},distanceMm:{type:'number',minimum:-100,maximum:100}},required:['axis','distanceMm'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!machining||level!==2)throw Error('請先進入第二關');return machining.jog(input);}},
    {name:'set_cnc_spindle',title:'切換模擬主軸',description:'啟動或停止第二關的虛擬主軸。啟動後接觸工件會產生切削。',inputSchema:{type:'object',properties:{running:{type:'boolean'}},required:['running'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!machining||level!==2)throw Error('請先進入第二關');if(typeof input?.running!=='boolean')throw Error('running 須為布林值');machining.setSpindle(input.running);return machining.getState();}},
    {name:'reset_cnc_machining',title:'重置模擬加工',description:'停止虛擬主軸，將 XYZ 位移歸零，恢復本頁原始工件。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(!machining||level!==2)throw Error('請先進入第二關');machining.reset();return machining.getState();}},
    {name:'load_free_cnc_program',title:'預覽自由加工刀路',description:'第四關載入使用者自行輸入的 AeroBasic 程式，只檢查與顯示刀路，不移動或切削。',inputSchema:{type:'object',properties:{source:{type:'string',maxLength:50000}},required:['source'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(level!==4||!freeProgramming)throw Error('請先進入第四關');if(typeof input?.source!=='string'||input.source.length>50000)throw Error('程式文字格式錯誤');if(!freeProgramming.setProgram(input.source))throw Error('刀路載入失敗，請查看行號與錯誤訊息');return freeProgramming.state();}},
    {name:'execute_free_cnc_program',title:'確認自由加工刀路並執行',description:'確認第四關已載入的刀路並開始虛擬加工，對應「確認並執行」。必須先載入預覽；修改後必須重載。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(level!==4||!freeProgramming)throw Error('請先進入第四關');if(!freeProgramming.run())throw Error('請先載入有效刀路，再確認執行');return freeProgramming.state();}},
    {name:'configure_cnc_program',title:'載入 CNC 學習程式',description:'第三關載入一個範例或設定 AeroBasic 文字並檢查；只有 run=true 才執行本頁的虛擬切削。',inputSchema:{type:'object',properties:{source:{type:'string',maxLength:50000},example:{type:'string',enum:['linear','rapid','cw','ccw','quad','cubic','pvt']},run:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(level!==3||!programming)throw Error('請先進入第三關');if(input.source!==undefined&&input.example!==undefined)throw Error('source 和 example 請擇一');if(input.example)programming.loadExample(input.example);if(input.source!==undefined){if(typeof input.source!=='string'||input.source.length>50000)throw Error('程式文字過長或格式錯誤');if(!programming.setProgram(input.source))throw Error('程式檢查未通過，請查看行號與錯誤訊息');}if(input.run===true)programming.run();return programming.state();}}
  ];
  for(const entry of simulationTools){try{Promise.resolve(document.modelContext.registerTool(entry,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}}
}
init();

