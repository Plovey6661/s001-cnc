// AeroBasic subset verified against the supplied A3200.chm (2001–2015).
const AXES=['x','y','z'],NUM='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:E[+-]?\\d+)?';
const copy=p=>({...p}),distance=(a,b)=>Math.hypot(...AXES.map(k=>b[k]-a[k]));
const mix=(a,b,t)=>Object.fromEntries(AXES.map(k=>[k,a[k]+(b[k]-a[k])*t]));
const aliases={G0:'RAPID',G1:'LINEAR',G2:'CW',G3:'CCW',G90:'ABSOLUTE',G91:'INCREMENTAL',G70:'ENGLISH',G71:'METRIC',G75:'MINUTES',G76:'SECONDS'};
export class ProgramError extends Error{constructor(line,message){super(`第 ${line} 行：${message}`);this.line=line;}}
function tokens(text,line){const out=[];let rest=text.trim();const re=new RegExp(`^([XYZ]F|[XYZIJRF])\\s*(${NUM})`,'i');while(rest){const m=rest.match(re);if(!m)throw new ProgramError(line,`無法辨識「${rest.slice(0,28)}」。請使用命令卡上的數值語法。`);out.push([m[1].toUpperCase(),Number(m[2])]);rest=rest.slice(m[0].length).trim();}if(new Set(out.map(t=>t[0])).size!==out.length)throw new ProgramError(line,'同一個參數不可重複。');return out;}
function polyline(points,speed){let elapsed=0;const times=[0];for(let i=1;i<points.length;i++){elapsed+=distance(points[i-1],points[i])/speed;times.push(elapsed);}return {points,times,duration:elapsed};}
function bezierAt(control,t){let p=control.map(copy);while(p.length>1)p=p.slice(0,-1).map((v,i)=>mix(v,p[i+1],t));return p[0];}
function bezierPolyline(control,tolerance){const result=[copy(control[0])];function split(c,depth){const a=c[0],b=c.at(-1),chord=distance(a,b);let flat=0;for(const p of c.slice(1,-1)){const t=chord?Math.max(0,Math.min(1,AXES.reduce((s,k)=>s+(p[k]-a[k])*(b[k]-a[k]),0)/(chord*chord))):0;flat=Math.max(flat,distance(p,mix(a,b,t)));}if(flat<=tolerance||depth>=18){result.push(copy(b));return;}const left=[c[0]],right=[c.at(-1)];let row=c;while(row.length>1){row=row.slice(0,-1).map((v,i)=>mix(v,row[i+1],.5));left.push(row[0]);right.unshift(row.at(-1));}split(left,depth+1);split(right,depth+1);}split(control,0);return result;}
function sweepAngle(a,b,cw,full=false){if(full)return cw?-Math.PI*2:Math.PI*2;let d=(b-a)%(2*Math.PI);if(cw&&d>=0)d-=2*Math.PI;if(!cw&&d<=0)d+=2*Math.PI;return d;}
export function sampleMotion(motion,seconds){if(!motion.points.length)return null;if(seconds<=0)return copy(motion.points[0]);if(seconds>=motion.duration)return copy(motion.points.at(-1));let lo=0,hi=motion.times.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(motion.times[m]<=seconds)lo=m;else hi=m;}const span=motion.times[hi]-motion.times[lo];return mix(motion.points[lo],motion.points[hi],span?(seconds-motion.times[lo])/span:1);}

export function compileProgram(source,{start={x:0,y:0,z:0}}={}){
  const lines=String(source).split(/\r?\n/);if(lines.length>500)throw new ProgramError(1,'每次最多 500 行。');
  let position=copy(start),absolute=true,unit=1,timeBase=1,feed=10,tolerance=null,moved=false,previousVelocity={x:0,y:0,z:0},previousPVT=false,pvtPeriod=null;
  const axisSpeed={x:25,y:25,z:25},motions=[],warnings=[];let totalTime=0,totalPoints=0;
  const fail=(line,msg)=>{throw new ProgramError(line,msg);};
  const finite=(v,line,label)=>{if(!Number.isFinite(v))fail(line,`${label}須為有限數值。`);return v;};
  const check=(p,line)=>{for(const k of AXES)if(!Number.isFinite(p[k])||Math.abs(p[k])>250)fail(line,'超出本網頁 ±250 mm 的練習範圍；此範圍不代表實機行程。');};
  for(let index=0;index<lines.length;index++){
    const line=index+1,raw=lines[index],text=raw.split(/[;']/)[0].trim().toUpperCase().replace(/^N\d+\s+/,'');if(!text)continue;
    const directive=text.match(new RegExp(`^#BEZIER\\s+TOLERANCE\\s+(${NUM})$`));
    if(directive){if(moved)fail(line,'#bezier tolerance 必須放在任何運動命令之前。');tolerance=Number(directive[1])*unit;if(!(tolerance>0&&tolerance<=.1))fail(line,'本關容許的曲線公差為 0 至 0.1 mm（不含 0）。');continue;}
    let match=text.match(/^([A-Z]+\d*|G\d+)\b\s*(.*)$/),command=match?.[1],rest=match?.[2]??'';
    if(/^G\d+$/.test(command)){command='G'+Number(command.slice(1));if(aliases[command]){if(!warnings.includes('G 碼是手冊中的 CNC Option 對照；實機是否可用取決於授權。'))warnings.push('G 碼是手冊中的 CNC Option 對照；實機是否可用取決於授權。');command=aliases[command];}}
    if(['ABSOLUTE','INCREMENTAL','METRIC','ENGLISH','SECONDS','MINUTES'].includes(command)){if(rest)fail(line,'模式命令請單獨寫一行。');if(command==='ABSOLUTE')absolute=true;if(command==='INCREMENTAL')absolute=false;if(command==='METRIC')unit=1;if(command==='ENGLISH')unit=25.4;if(command==='SECONDS')timeBase=1;if(command==='MINUTES')timeBase=60;continue;}
    const feedOnly=text.match(new RegExp(`^F\\s*(${NUM})$`));if(feedOnly){feed=finite(Number(feedOnly[1])*unit/timeBase,line,'速度');if(feed<=0||feed>1000)fail(line,'速度必須大於 0，且不超過 1000 mm/s。');continue;}
    if(command==='WAIT'&&/^MOVEDONE(?:\s+[XYZ](?:\s+[XYZ])*)?$/.test(rest)){previousPVT=false;previousVelocity={x:0,y:0,z:0};pvtPeriod=null;continue;}
    let motion={line,source:raw.trim(),kind:command,description:'',points:[],times:[],duration:0};const from=copy(position);
    if(command==='DWELL'){if(!new RegExp(`^${NUM}$`).test(rest))fail(line,'使用 DWELL 秒數，例如 DWELL 0.5。');const duration=Number(rest);if(duration<0||duration>60)fail(line,'本關停留時間須在 0 至 60 秒之間。');motion={...motion,description:'原地停留',points:[from,copy(from)],times:[0,duration],duration};}
    else if(['LINEAR','RAPID','CW','CCW'].includes(command)){
      const entries=tokens(rest,line),params=Object.fromEntries(entries),orderedAxes=entries.filter(([k])=>AXES.includes(k.toLowerCase())).map(([k])=>k.toLowerCase());
      const allowed=command==='RAPID'?['X','Y','Z','XF','YF','ZF']:command==='LINEAR'?['X','Y','Z','F']:['X','Y','Z','I','J','R','F'];if(entries.some(([k])=>!allowed.includes(k)))fail(line,`${command} 不接受此參數。`);
      if(!orderedAxes.length)fail(line,'請至少指定一個移動軸。');
      const end=copy(from);for(const axis of orderedAxes)end[axis]=(absolute?0:from[axis])+params[axis.toUpperCase()]*unit;check(end,line);
      if(params.F!==undefined){feed=params.F*unit/timeBase;if(!(feed>0&&feed<=1000))fail(line,'F 必須大於 0，且不超過 1000 mm/s。');}
      if(command==='LINEAR'){Object.assign(motion,polyline([from,end],feed),{description:'同步直線插補'});}
      if(command==='RAPID'){
        for(const a of AXES)if(params[a.toUpperCase()+'F']!==undefined){axisSpeed[a]=params[a.toUpperCase()+'F']*unit/timeBase;if(!(axisSpeed[a]>0&&axisSpeed[a]<=1000))fail(line,`${a.toUpperCase()}F 速度必須大於 0，且不超過 1000 mm/s。`);}
        const durations=Object.fromEntries(AXES.map(a=>[a,Math.abs(end[a]-from[a])/axisSpeed[a]])),times=[...new Set([0,...Object.values(durations)])].sort((a,b)=>a-b);if(times.length===1)times.push(0);
        const points=times.map(t=>Object.fromEntries(AXES.map(a=>[a,from[a]+(end[a]-from[a])*(durations[a]?Math.min(1,t/durations[a]):1)])));
        Object.assign(motion,{points,times,duration:times.at(-1),description:'各軸獨立速度快速定位'});
      }
      if(command==='CW'||command==='CCW'){
        if(orderedAxes.length!==2)fail(line,'CW／CCW 須明確指定兩個軸。本關不把第三軸參數當作螺旋指令。');
        const [h,v]=orderedAxes,cw=command==='CW',full=Math.hypot(end[h]-from[h],end[v]-from[v])<1e-9;let center,radius,sweep;
        if(params.R!==undefined){if(params.I!==undefined||params.J!==undefined)fail(line,'R 與 I／J 不能混用。');if(full)fail(line,'R 不能建立整圓；改用 I、J 偏移。');radius=Math.abs(params.R*unit);const dx=end[h]-from[h],dy=end[v]-from[v],chord=Math.hypot(dx,dy);if(radius<=0||chord>2*radius+1e-7)fail(line,'半徑太小，無法連接起點與終點。');const offset=Math.sqrt(Math.max(0,radius*radius-chord*chord/4));const candidates=[1,-1].map(sign=>({h:(from[h]+end[h])/2-sign*dy/chord*offset,v:(from[v]+end[v])/2+sign*dx/chord*offset}));center=candidates.find(c=>{const d=sweepAngle(Math.atan2(from[v]-c.v,from[h]-c.h),Math.atan2(end[v]-c.v,end[h]-c.h),cw);return params.R>0?Math.abs(d)<=Math.PI+1e-8:Math.abs(d)>=Math.PI-1e-8;})||candidates[0];}
        else{if(params.I===undefined||params.J===undefined)fail(line,'請指定 R，或完整的 I、J 起點相對偏移。');center={h:from[h]+params.I*unit,v:from[v]+params.J*unit};radius=Math.hypot(params.I*unit,params.J*unit);const rEnd=Math.hypot(end[h]-center.h,end[v]-center.v);if(radius<=1e-8)fail(line,'圓弧半徑不可為零。');if(Math.abs(rEnd-radius)>Math.max(.001,radius*1e-5))fail(line,`起點與終點到圓心的半徑不一致（${radius.toFixed(3)}／${rEnd.toFixed(3)} mm）。`);}
        const angle=Math.atan2(from[v]-center.v,from[h]-center.h);sweep=sweepAngle(angle,Math.atan2(end[v]-center.v,end[h]-center.h),cw,full);
        const count=Math.max(12,Math.ceil(Math.abs(sweep)/.04),Math.ceil(Math.abs(sweep)*radius/.15));if(count>50000)fail(line,'圓弧過長，請縮小練習尺寸。');const points=Array.from({length:count+1},(_,i)=>{const p=copy(from),a=angle+sweep*i/count;p[h]=center.h+radius*Math.cos(a);p[v]=center.v+radius*Math.sin(a);return p;});points[0]=from;points[count]=end;
        Object.assign(motion,polyline(points,feed),{description:`${h.toUpperCase()}${v.toUpperCase()} 平面${cw?'順':'逆'}時針${full?'整圓':'圓弧'}`,radius,sweep});
      }
    }
    else if(command==='BEZIER'){
      if(!absolute)fail(line,'BEZIER 必須使用 ABSOLUTE 絕對座標。');if(tolerance===null)fail(line,'先在程式開頭加入 #bezier tolerance 0.001。');const m=rest.match(/^(QUAD|CUBIC)\s+(.+)$/);if(!m)fail(line,'請使用 BEZIER QUAD 或 BEZIER CUBIC。');const count=m[1]==='QUAD'?3:4,args=m[2].split(',').map(v=>v.trim()),size=count+1;if(args.length!==size*2||!AXES.includes(args[0]?.toLowerCase())||!AXES.includes(args[size]?.toLowerCase())||args[0]===args[size])fail(line,'依手冊順序填入兩個軸及所有控制點，以逗號分隔。');
      const h=args[0].toLowerCase(),v=args[size].toLowerCase();const numbers=args.filter((_,i)=>i!==0&&i!==size);if(numbers.some(x=>!new RegExp(`^${NUM}$`).test(x)))fail(line,'控制點須為數值，本關不支援變數。');const control=Array.from({length:count},(_,i)=>({...from,[h]:Number(args[i+1])*unit,[v]:Number(args[size+i+1])*unit}));control.forEach(p=>check(p,line));if(distance(control[0],from)>.001)fail(line,'BEZIER 的 P0 必須等於目前兩軸位置；請先 LINEAR 到 P0。');
      Object.assign(motion,polyline(bezierPolyline(control,tolerance),feed),{kind:'BEZIER '+m[1],description:m[1]==='QUAD'?'二次貝茲曲線':'三次貝茲曲線',control});
    }
    else if(command==='PVT'){
      const tm=rest.match(/\s+TIME\s+([^\s]+)\s*$/);if(!tm)fail(line,'使用 PVT X 位置,末速度 ... TIME 毫秒。');let milliseconds=Number(tm[1]);const fractions={'1/2':.5,'1/4':.25,'1/8':.125,'1/16':.0625,'1/24':1/24,'1/48':1/48};if(tm[1] in fractions)milliseconds=fractions[tm[1]];if(!(Number.isInteger(milliseconds)&&milliseconds>=1||tm[1] in fractions)||milliseconds>60000)fail(line,'TIME 使用正整數毫秒或手冊允許的分數；本關單段上限 60000 ms。');const duration=milliseconds/1000,end=copy(from),endVelocity={x:0,y:0,z:0},seen=new Set();let restAxes=rest.slice(0,tm.index).trim();const re=new RegExp(`^([XYZ])\\s*(${NUM})\\s*,\\s*(${NUM})\\s*`);
      while(restAxes){const m=restAxes.match(re);if(!m)fail(line,'PVT 每軸格式為 X 位置,末速度。');const a=m[1].toLowerCase();if(seen.has(a))fail(line,'PVT 軸不可重複。');seen.add(a);end[a]=(absolute?0:from[a])+Number(m[2])*unit;endVelocity[a]=Number(m[3])*unit/timeBase;restAxes=restAxes.slice(m[0].length).trim();}if(!seen.size)fail(line,'PVT 至少需要一個軸。');check(end,line);
      if(previousPVT&&(pvtPeriod<1||milliseconds<1)&&pvtPeriod!==milliseconds)fail(line,'同一串 PVT 使用小於 1 ms 的 TIME 時，每段 TIME 必須相同。');pvtPeriod=milliseconds;
      const startVelocity=previousPVT?previousVelocity:{x:0,y:0,z:0};for(const a of AXES)if(!seen.has(a)&&Math.abs(startVelocity[a])>1e-9)fail(line,'連續 PVT 須包含仍有末速度的軸。');const control=[from,Object.fromEntries(AXES.map(a=>[a,from[a]+startVelocity[a]*duration/3])),Object.fromEntries(AXES.map(a=>[a,end[a]-endVelocity[a]*duration/3])),end];
      const count=Math.max(64,Math.ceil(duration/.01),Math.ceil(control.slice(1).reduce((s,p,i)=>s+distance(control[i],p),0)/.08));if(count>50000)fail(line,'PVT 曲線過大，請縮小位置或速度。');const points=Array.from({length:count+1},(_,i)=>bezierAt(control,i/count)),times=points.map((_,i)=>duration*i/count);Object.assign(motion,{points,times,duration,description:'位置・末速度・時間插補',endVelocity});previousVelocity=endVelocity;
    }
    else{const details=/^G(17|18|19|93|94)$|^M[35]$/.test(command||'')?'此命令涉及 CNC Option／實機設定；本關請使用 AeroBasic 命令卡及畫面的切削開關。':'本關支援 LINEAR、RAPID、CW、CCW、BEZIER、PVT，以及座標、單位、時間模式和 DWELL。';fail(line,`不支援「${command||text}」。${details}`);}
    motion.points.forEach(p=>check(p,line));if(!Number.isFinite(motion.duration)||motion.duration<0)fail(line,'運動時間無效。');totalTime+=motion.duration;totalPoints+=motion.points.length;if(totalTime>1800||totalPoints>150000)fail(line,'程式超過本關 30 分鐘或 150000 路徑點的練習上限。');
    motions.push(motion);position=copy(motion.points.at(-1));moved=moved||command!=='DWELL';previousPVT=command==='PVT';if(!previousPVT){previousVelocity={x:0,y:0,z:0};pvtPeriod=null;}
  }
  if(!motions.length)throw new ProgramError(1,'請輸入至少一個運動或停留命令。');return {motions,duration:totalTime,end:position,warnings,pointCount:totalPoints};
}
