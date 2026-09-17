import * as THREE from 'three';
import {StockField,motionAxes,sceneMotion} from './machining-core.js';

const $=s=>document.querySelector(s);
export async function createMachining({scene,camera,controls,meshes,scale,shift,wholeView,preview=false}){
  const load=async (path,kind)=>{const r=await fetch(path);if(!r.ok)throw Error('加工模型載入失敗');return r[kind]();};
  const [toolInfo,toolBin,settings]=await Promise.all([load('./assets/tool.json','json'),load('./assets/tool.bin','arrayBuffer'),load('./assets/cutting.json','json')]);
  const mm=.001*scale,field=preview?new StockField(40,60,20,180,270):new StockField(),axes={x:0,y:0,z:0};
  const point=coords=>new THREE.Vector3(...coords).add(shift).multiplyScalar(scale);
  const stockOrigin=point(settings.workpiece.originThree),toolTip=point(toolInfo.cutReferenceThree);
  const stock=new THREE.Group();stock.position.copy(stockOrigin);scene.add(stock);
  const {mesh:stockMesh,sync:syncStock}=createStockGeometry(field,mm);stock.add(stockMesh);
  const programPath=new THREE.Group();programPath.visible=false;stock.add(programPath);
  const cutter=new THREE.Group();cutter.position.set(toolTip.x,0,toolTip.z);scene.add(cutter);
  for(const data of toolInfo.meshes){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(toolBin,data.position.byteOffset,data.position.count).slice(),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(toolBin,data.normal.byteOffset,data.normal.count),3));g.translate(shift.x,shift.y,shift.z);g.scale(scale,scale,scale);g.translate(-toolTip.x,0,-toolTip.z);
    const color=new THREE.Color().setRGB(...toolInfo.baseColor.slice(0,3),THREE.SRGBColorSpace);
    cutter.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.3,side:THREE.DoubleSide})));
  }
  for(const m of meshes)m.userData.motionAxes=motionAxes(m.userData.source);
  const previewAxesBox=new THREE.Box3();
  for(const mesh of meshes)if(mesh.userData.motionAxes.length&&mesh.geometry?.boundingBox)previewAxesBox.union(mesh.geometry.boundingBox);
  if(previewAxesBox.isEmpty())previewAxesBox.setFromCenterAndSize(stockOrigin,new THREE.Vector3(.8,1.5,.7).multiplyScalar(scale));
  previewAxesBox.expandByScalar(.1*scale);
  let active=false,spindle=false,hold=null,nearView=true,feed=10,step=1,engaged=false,uiTimer=0,batchDepth=0,batchChanged=new Set();
  stock.visible=cutter.visible=false;
  function relativeTip(){return [(toolTip.x-stock.position.x)/mm,(toolTip.y+axes.z*mm-stock.position.y)/mm,(toolTip.z-stock.position.z)/mm];}
  function place(){for(const mesh of meshes)mesh.position.set(...sceneMotion(axes,mesh.userData.motionAxes,scale));stock.position.copy(stockOrigin).add(new THREE.Vector3(...sceneMotion(axes,['x','y'],scale)));cutter.position.y=axes.z*mm;}
  function carve(from,to){if(active&&spindle){const n=field.carve(from,to,toolInfo.cutRadiusMm);if(n){if(batchDepth)for(const k of field.lastChanged)batchChanged.add(k);else syncStock(field.lastChanged);}}}
  function moveTo(target){if(!active)return;const next={...axes,...target};if(!['x','y','z'].every(a=>Number.isFinite(next[a])))throw Error('位移必須是有限數值');const from=relativeTip();Object.assign(axes,next);place();carve(from,relativeTip());if(!batchDepth)updateUI();}
  function beginBatch(){batchDepth++;}
  function endBatch(){if(batchDepth>0)batchDepth--;if(!batchDepth){if(batchChanged.size){syncStock([...batchChanged]);batchChanged.clear();}updateUI();}}
  function move(axis,delta){if(!active||!['x','y','z'].includes(axis)||!Number.isFinite(delta))return;moveTo({[axis]:axes[axis]+delta});}
  function setToolPath(motions){for(const line of [...programPath.children]){line.geometry.dispose();line.material.dispose();programPath.remove(line);}const base=toolTip.clone().sub(stockOrigin);for(const motion of motions){if(motion.kind==='DWELL')continue;const positions=new Float32Array(motion.points.length*3);motion.points.forEach((p,i)=>positions.set([base.x+p.x*mm,base.y+p.z*mm+.0001,base.z-p.y*mm],i*3));const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:motion.kind==='RAPID'?0xdd9951:0x287be2,transparent:true,opacity:.7,depthTest:false,depthWrite:false}));line.renderOrder=10;programPath.add(line);}}
  function stop(){hold=null;document.querySelectorAll('.jog-button').forEach(b=>b.classList.remove('held'));}
  function updateUI(){
    for(const a of ['x','y','z'])$(`#coord-${a}`).textContent=(Math.abs(axes[a])<.0005?0:axes[a]).toFixed(3);
    const p=relativeTip(),surface=field.sample(p[0],p[2]),gap=p[1]-(surface??field.height);engaged=spindle&&surface!==null&&p[1]<=surface+1e-4&&p[1]>=-.1;
    $('#tool-gap').textContent=(p[1]-field.height).toFixed(2)+' mm';$('#cut-depth').textContent=field.maxDepth.toFixed(2)+' mm';$('#cut-volume').textContent=field.removedVolume.toFixed(1)+' mm³';
    $('#machine-status').textContent=!spindle?'主軸停止':p[1]<0?'刀尖低於工件底面':engaged?'切削中':surface===null?'刀具在工件範圍外':'主軸運轉 · 等待接觸';
    $('#machine-status').dataset.cutting=String(engaged);$('#spindle').textContent=spindle?'停止主軸':'啟動主軸';$('#spindle').setAttribute('aria-pressed',String(spindle));
    $('#cut-hint').textContent=!spindle?'啟動主軸，按住 Z− 下刀，再用 X／Y 移動工件。':surface===null?'使用 X／Y 按鈕，把工件移回刀具下方。':gap>0?`再下降約 ${gap.toFixed(2)} mm 可接觸目前表面。`:'刀具已接觸工件；使用 X／Y 按鈕進行切削。';
  }
  function setSpindle(on){spindle=Boolean(on);if(spindle)carve(relativeTip(),relativeTip());updateUI();}
  function reset(){stop();setSpindle(false);axes.x=axes.y=axes.z=0;field.reset();syncStock(null);place();updateUI();focus('iso');}
  function focus(view='iso'){
    if(!active)return;
    if(!nearView){wholeView(view);return;}
    const center=stock.position.clone();center.y+=mm*(field.height+12);center.x=(center.x+toolTip.x)/2;center.z=(center.z+toolTip.z)/2;
    const tipY=toolTip.y+axes.z*mm;center.y=Math.max(center.y,(stock.position.y+tipY)/2);
    const dirs={iso:[1.15,.8,1.7],front:[0,.1,1],side:[1,.1,0],top:[0,1,.001]};const extent=Math.max(.105*scale,Math.abs(tipY-stock.position.y)+.04*scale);
    const d=extent/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*Math.max(1,1/camera.aspect)*1.35;
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...dirs[view]).normalize().multiplyScalar(d));controls.update();
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  }
  for(const b of document.querySelectorAll('.jog-button')){
    const axis=b.dataset.axis,sign=Number(b.dataset.sign);
    let pointerClickPending=false;
    const begin=()=>{if(!active)return;stop();move(axis,sign*step);hold={axis,sign,since:performance.now()};b.classList.add('held');};
    b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pointerClickPending=true;b.focus({preventScroll:true});b.setPointerCapture(e.pointerId);begin();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,stop);
    b.addEventListener('pointercancel',()=>{pointerClickPending=false;});
    b.addEventListener('blur',stop);
    b.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat){pointerClickPending=false;begin();}}});
    b.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stop();}});
    b.addEventListener('click',()=>{if(pointerClickPending){pointerClickPending=false;return;}move(axis,sign*step);});
  }
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pointerup',stop);
  window.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){stop();setSpindle(false);}});
  $('#feed').onchange=e=>{feed=Number(e.target.value);};$('#step').onchange=e=>{step=Number(e.target.value);};
  $('#spindle').onclick=()=>setSpindle(!spindle);$('#reset-machining').onclick=reset;
  $('#closeup').onclick=()=>{nearView=true;$('#closeup').classList.add('active');$('#whole-machine').classList.remove('active');focus('iso');};
  $('#whole-machine').onclick=()=>{nearView=false;$('#closeup').classList.remove('active');$('#whole-machine').classList.add('active');focus('iso');};
  updateUI();
  return {
    activate(on){stop();active=on;stock.visible=cutter.visible=on;camera.near=on?.0001:.02;camera.updateProjectionMatrix();controls.minDistance=on?.02:1;if(on){place();focus('iso');updateUI();}else for(const m of meshes)m.position.set(0,0,0);},
    update(dt){if(!active)return;if(hold&&performance.now()-hold.since>250)move(hold.axis,hold.sign*feed*dt);if(spindle)cutter.rotation.y+=dt*24;uiTimer+=dt;if(uiTimer>.15){updateUI();uiTimer=0;}},
    focus,
    framePreview(view='cutting'){
      if(view==='axes'){
        const center=previewAxesBox.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(1.05,.75,1.5).normalize();
        const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let distance=0;
        for(const x of [previewAxesBox.min.x,previewAxesBox.max.x])for(const y of [previewAxesBox.min.y,previewAxesBox.max.y])for(const z of [previewAxesBox.min.z,previewAxesBox.max.z]){const p=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,Math.abs(p.dot(right))/tanH+p.dot(direction),Math.abs(p.dot(up))/tanV+p.dot(direction));}
        controls.target.copy(center);camera.position.copy(center).add(direction.multiplyScalar(distance*1.08));
      }else{
        const center=stock.position.clone();center.y+=field.height*mm;controls.target.copy(center);const distance=.044*scale/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.max(1,.85/camera.aspect);camera.position.copy(center).add(new THREE.Vector3(.7,1.05,1.35).normalize().multiplyScalar(distance));
      }
      camera.up.set(0,1,0);controls.update();
    },
    stop,reset,move,moveTo,beginBatch,endBatch,setSpindle,setToolPath,showToolPath:visible=>{programPath.visible=visible;},
    getState:()=>({active,axes:{...axes},spindle,feedMmPerSec:feed,stepMm:step,cutDepthMm:field.maxDepth,removedVolumeMm3:field.removedVolume,toolHeightAboveOriginalTopMm:relativeTip()[1]-field.height,stockSizeMm:[40,60,20],grid:[field.nx,field.nz],radiusMm:toolInfo.cutRadiusMm,engaged}),
    jog(input){if(!active)throw Error('請先進入第二關');if(!input||!['x','y','z'].includes(input.axis)||!Number.isFinite(input.distanceMm)||Math.abs(input.distanceMm)>100)throw Error('軸須為 x、y、z，單次位移須在 ±100 mm 內');stop();move(input.axis,input.distanceMm);return this.getState();}
  };
}

function createStockGeometry(field,mm){
  const {nx,nz}=field,row=nx+1,n=(nx+1)*(nz+1),positions=new Float32Array((2*n+4*(nx+nz+2))*3),normals=new Float32Array(positions.length),colors=new Float32Array(positions.length);
  const indices=new Uint32Array(nx*nz*12+(nx+nz)*12);const baseColor=new THREE.Color('#c9d2d5').toArray(),cutColor=new THREE.Color('#4ca899').toArray();let ptr=0,vptr=2*n;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const k=j*row+i;for(const offset of [0,n]){positions[(k+offset)*3]=(i*field.dx-field.width/2)*mm;positions[(k+offset)*3+1]=offset?0:field.height*mm;positions[(k+offset)*3+2]=(j*field.dz-field.depth/2)*mm;normals[(k+offset)*3+1]=offset?-1:1;colors.set(baseColor,(k+offset)*3);}}
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*row+i,b=a+1,c=a+row+1,d=a+row;indices.set([a,d,b,b,d,c,a+n,b+n,d+n,b+n,c+n,d+n],ptr);ptr+=12;}
  const sideCopies=new Map(),edges=[Array.from({length:nx+1},(_,i)=>i),Array.from({length:nz+1},(_,j)=>j*row+nx),Array.from({length:nx+1},(_,i)=>nz*row+nx-i),Array.from({length:nz+1},(_,j)=>(nz-j)*row)],norms=[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
  edges.forEach((edge,ei)=>{const start=vptr;for(const k of edge){const p=vptr;positions.set(positions.subarray(k*3,k*3+3),p*3);positions.set(positions.subarray((k+n)*3,(k+n)*3+3),(p+1)*3);normals.set(norms[ei],p*3);normals.set(norms[ei],(p+1)*3);colors.set(baseColor,p*3);colors.set(baseColor,(p+1)*3);if(!sideCopies.has(k))sideCopies.set(k,[]);sideCopies.get(k).push(p);vptr+=2;}for(let i=0;i<edge.length-1;i++){const a=start+i*2;indices.set([a,a+1,a+2,a+2,a+1,a+3],ptr);ptr+=6;}});
  const g=new THREE.BufferGeometry();for(const [name,data]of [['position',positions],['normal',normals],['color',colors]])g.setAttribute(name,new THREE.BufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));g.setIndex(new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage));g.setDrawRange(0,ptr);g.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.28,roughness:.5,side:THREE.DoubleSide});const mesh=new THREE.Mesh(g,material);mesh.name='Mesh4 - S001 workpiece';
  function sync(changed){
    const all=changed===null,points=all?Array.from({length:n},(_,i)=>i):changed,normalPoints=new Set();
    let lo=Infinity,hi=-1,posHi=-1,normalLo=Infinity,normalHi=-1,indexLo=Infinity,indexHi=-1;
    for(const k of points){lo=Math.min(lo,k);hi=Math.max(hi,k);posHi=Math.max(posHi,k);const i=k%row,j=Math.floor(k/row),height=field.heights[k];positions[k*3+1]=height*mm;colors.set(height<field.height-1e-4?cutColor:baseColor,k*3);for(const p of sideCopies.get(k)||[]){positions[p*3+1]=height*mm;posHi=Math.max(posHi,p);}for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++)if(i+di>=0&&i+di<=nx&&j+dj>=0&&j+dj<=nz)normalPoints.add((j+dj)*row+i+di);
      for(const cj of [j-1,j])for(const ci of [i-1,i])if(cj>=0&&cj<nz&&ci>=0&&ci<nx){const a=cj*row+ci,b=a+1,c=a+row+1,d=a+row,q=(cj*nx+ci)*12;if(field.heights[a]<=0&&field.heights[b]<=0&&field.heights[c]<=0&&field.heights[d]<=0){indices.fill(0,q,q+12);indexLo=Math.min(indexLo,q);indexHi=Math.max(indexHi,q+11);}else if(all){indices.set([a,d,b,b,d,c,a+n,b+n,d+n,b+n,c+n,d+n],q);indexLo=Math.min(indexLo,q);indexHi=Math.max(indexHi,q+11);}}
    }
    for(const k of normalPoints){normalLo=Math.min(normalLo,k);normalHi=Math.max(normalHi,k);const i=k%row,j=Math.floor(k/row),left=field.heights[j*row+Math.max(0,i-1)],right=field.heights[j*row+Math.min(nx,i+1)],back=field.heights[Math.max(0,j-1)*row+i],front=field.heights[Math.min(nz,j+1)*row+i],dx=(right-left)/(field.dx*(i===0||i===nx?1:2)),dz=(front-back)/(field.dz*(j===0||j===nz?1:2)),len=Math.hypot(dx,1,dz);normals[k*3]=-dx/len;normals[k*3+1]=1/len;normals[k*3+2]=-dz/len;}
    for(const [attr,first,last,size]of [[g.attributes.position,lo,posHi,3],[g.attributes.color,lo,hi,3],[g.attributes.normal,normalLo,normalHi,3],[g.index,indexLo,indexHi,1]])if(last>=first){attr.addUpdateRange(first*size,(last-first+1)*size);attr.needsUpdate=true;}
  }
  return {mesh,sync};
}
