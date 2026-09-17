import {compileProgram,sampleMotion} from './program-core.js';
import {lessons} from './program-lessons.js';

export function createProgramming({machining,mode='lesson'}){
  const free=mode==='free',prefix=free?'free':'program';
  const $=selector=>document.querySelector(selector.replace('#program-',`#${prefix}-`));
  const editor=$('#program-editor'),lessonSelect=free?null:$('#lesson-select');
  let active=false,compiled=null,running=false,paused=false,index=0,elapsed=0,totalElapsed=0;
  let pointIndex=1,lastLine=-1,uiTime=0,singleStep=false,preview=null;

  if(!free){
    for(const lesson of lessons){const option=document.createElement('option');option.value=lesson.id;option.textContent=lesson.name;lessonSelect.append(option);}
    lessonSelect.value='cw';
  }
  function lessonInfo(){const lesson=lessons.find(l=>l.id===lessonSelect.value);$('#lesson-command').textContent=lesson.command;$('#lesson-behavior').textContent=lesson.behavior;$('#lesson-tip').textContent=lesson.tip;$('#lesson-syntax').textContent=lesson.syntax;$('#lesson-source').textContent=`A3200.chm › ${lesson.source}`;}
  function setMessage(text,error=false){$('#program-message').textContent=text;$('#program-message').dataset.error=String(error);}
  function signature(){return JSON.stringify({source:editor.value,restart:$('#program-restart').checked,cut:$('#program-cut').checked,start:$('#program-restart').checked?{x:0,y:0,z:0}:machining.getState().axes});}
  function state(){return {active,status:running?'running':paused?'paused':compiled&&index>=compiled.motions.length?'complete':free&&preview?'ready':'idle',previewReady:!!preview,currentLine:compiled?.motions[index]?.line??null,elapsedSeconds:totalElapsed,durationSeconds:compiled?.duration??0,motionCount:compiled?.motions.length??0,machining:machining.getState()};}
  function ui(){
    if(active)document.body.dataset.programStatus=running?'running':paused?'paused':'idle';
    const s=machining.getState();
    for(const a of ['x','y','z'])$(`#program-${a}`).textContent=s.axes[a].toFixed(3);
    $('#program-depth').textContent=s.cutDepthMm.toFixed(2)+' mm';$('#program-volume').textContent=s.removedVolumeMm3.toFixed(1)+' mm³';
    const locked=running||paused,blocked=free&&!paused&&!preview;
    $('#program-run').textContent=paused?'繼續執行':free?'確認並執行':'執行程式';
    $('#program-run').disabled=running||blocked;$('#program-pause').disabled=!running;
    $('#program-step').disabled=running||blocked;$('#program-step').textContent=free?(paused?'下一段':'確認逐段'):'逐段執行';
    $('#program-stop').disabled=!locked;editor.readOnly=locked;
    if(!free)$('#lesson-load').disabled=locked;
    $('#program-validate').disabled=locked;$('#program-restart').disabled=locked;$('#program-cut').disabled=locked;
    $('#program-progress').value=compiled?.duration?Math.min(100,totalElapsed/compiled.duration*100):0;
    $('#program-time').textContent=`${totalElapsed.toFixed(1)} / ${(compiled?.duration??0).toFixed(1)} s`;
    const current=compiled?.motions[index];
    $('#program-current').textContent=locked?`第 ${current?.line??'—'} 行 · ${current?.description??''}`:compiled&&index>=compiled.motions.length?'程式完成':free&&preview?'刀路已載入 · 等待確認':free?'等待載入刀路':'等待執行';
    const rowLine=locked?(current?.line??-1):-1;
    if(rowLine!==lastLine){lastLine=rowLine;$('#program-lines').querySelectorAll('.program-line').forEach(row=>row.classList.toggle('executing',Number(row.dataset.line)===lastLine));}
    if(free){const step=locked||(compiled&&index>=compiled.motions.length)?3:preview?2:1;document.querySelectorAll('.free-flow li').forEach((row,i)=>{row.classList.toggle('current',i+1===step);if(i+1===step)row.setAttribute('aria-current','step');else row.removeAttribute('aria-current');});}
  }
  function clearPlan(){compiled=null;preview=null;index=0;elapsed=totalElapsed=0;pointIndex=1;lastLine=-1;$('#program-lines').replaceChildren();if(active)machining.setToolPath([]);}
  function invalidate(message){clearPlan();setMessage(message);ui();}
  function stop(message='已停止；保留目前工件與位置。'){
    running=paused=false;singleStep=false;preview=null;
    if(active){machining.stop();machining.setSpindle(false);}
    setMessage(message+(free?' 再次加工前請重新載入刀路。':''));ui();
  }
  function validate(){
    if(running||paused)return null;
    try{
      const result=compileProgram(editor.value,{start:$('#program-restart').checked?{x:0,y:0,z:0}:machining.getState().axes});
      if(!result.motions.length)throw Error('請輸入至少一個運動命令，再載入刀路。');
      compiled=result;preview=free?signature():null;index=0;elapsed=totalElapsed=0;pointIndex=1;lastLine=-1;
      if(active){machining.setToolPath(result.motions);machining.showToolPath($('#program-path').checked);}
      const list=$('#program-lines');list.replaceChildren();
      for(const motion of result.motions){const row=document.createElement('div');row.className='program-line';row.dataset.line=motion.line;const n=document.createElement('b'),code=document.createElement('code'),time=document.createElement('span');n.textContent=motion.line;code.textContent=motion.source;time.textContent=motion.duration.toFixed(2)+' s';row.append(n,code,time);list.append(row);}
      setMessage(`${free?'刀路已載入':'檢查通過'}：${result.motions.length} 段，預計 ${result.duration.toFixed(1)} 秒。${free?' 藍線為加工路徑，橘線為快速定位；旋轉視圖確認後再執行。':''}${result.warnings.length?' '+result.warnings.join(' '):''}`);ui();
      if(free&&active&&matchMedia('(max-width:760px)').matches)$('.viewer').scrollIntoView({block:'start',behavior:'smooth'});
      return result;
    }catch(error){clearPlan();setMessage(error.message,true);if(active)$('#program-message').scrollIntoView({block:'nearest'});ui();return null;}
  }
  function start(one=false){
    if(!active||running)return false;
    if(!paused){
      if(free){
        if(!preview||preview!==signature()){invalidate('程式或加工設定已變更，請先載入刀路再確認執行。');return false;}
      }else if(!validate())return false;
      if($('#program-restart').checked)machining.reset();
      index=0;elapsed=totalElapsed=0;pointIndex=1;preview=null;
    }
    singleStep=one;running=true;paused=false;machining.stop();machining.setSpindle($('#program-cut').checked);
    setMessage(one?'逐段執行中；完成本段後暫停。':'程式執行中。藍線為預計路徑，橘線為快速定位。');ui();
    if(matchMedia('(max-width:760px)').matches)$('.viewer').scrollIntoView({block:'start',behavior:'smooth'});
    return true;
  }
  function pause(){if(!running)return;running=false;paused=true;machining.setSpindle(false);setMessage('已暫停；可繼續或逐段執行。');ui();}
  function loadLesson(){stop('');editor.value=lessons.find(l=>l.id===lessonSelect.value).code;compiled=null;lessonInfo();validate();}
  if(!free){$('#lesson-load').onclick=loadLesson;lessonSelect.onchange=lessonInfo;}
  $('#program-validate').onclick=validate;$('#program-run').onclick=()=>start(false);$('#program-step').onclick=()=>start(true);$('#program-pause').onclick=pause;$('#program-stop').onclick=()=>stop();
  $('#program-reset').onclick=()=>{stop('已恢復完整工件與 S001 初始位置。');machining.reset();clearPlan();ui();};
  $('#program-path').onchange=()=>machining.showToolPath(active&&!!compiled&&$('#program-path').checked);
  $('#program-restart').onchange=()=>invalidate(free?'加工起點已變更，請重新載入刀路。':'加工起點已變更，請重新檢查程式。');
  $('#program-cut').onchange=()=>{if(!running)machining.setSpindle(false);if(free)invalidate('切削設定已變更，請重新載入刀路。');};
  editor.addEventListener('input',()=>{if(!running&&!paused)invalidate(free?'程式已修改，請載入刀路進行預覽。':'程式已修改，先檢查或直接執行。');});
  window.addEventListener('keydown',e=>{if(active&&e.key==='Escape')stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
  if(free){setMessage('輸入自己的 AeroBasic 程式，再按「載入刀路」。');ui();}else loadLesson();
  return {
    activate(on){
      if(!on&&active){if(running||paused)stop(`已離開第${free?'四':'三'}關，程式停止。`);if(free)invalidate('程式已保留；請重新載入刀路，確認加工起點。');machining.showToolPath(false);}
      active=on;
      if(on){machining.setToolPath(compiled?.motions??[]);machining.showToolPath($('#program-path').checked&&!!compiled);ui();}
    },
    update(dt){
      if(!active)return;
      if(free&&preview&&preview!==signature())invalidate('加工起點已變更，請重新載入刀路。');
      if(running&&compiled){machining.beginBatch();try{
        let budget=dt*Number($('#program-speed').value),guard=0;
        while(budget>=0&&running&&index<compiled.motions.length&&guard++<1000){
          const motion=compiled.motions[index],remaining=Math.max(0,motion.duration-elapsed),used=Math.min(budget,remaining),targetTime=elapsed+used;
          while(pointIndex<motion.points.length&&motion.times[pointIndex]<=targetTime+1e-10){machining.moveTo(motion.points[pointIndex]);pointIndex++;}
          machining.moveTo(sampleMotion(motion,targetTime));elapsed=targetTime;totalElapsed+=used;budget-=used;
          if(elapsed>=motion.duration-1e-9){index++;elapsed=0;pointIndex=1;
            if(index>=compiled.motions.length){running=paused=false;machining.setSpindle(false);setMessage('程式完成。拖曳旋轉或放大工件，查看加工刀痕。'+(free?' 再次加工前請重新載入刀路。':''));ui();break;}
            if(singleStep){pause();break;}
          }else break;
        }
      }finally{machining.endBatch();}}
      uiTime+=dt;if(uiTime>.1){ui();uiTime=0;}
    },
    state,stop,pause,validate,
    setProgram(source){if(running||paused)throw Error('請先停止程式再修改');editor.value=source;return validate();},
    loadExample(id){if(free)throw Error('第四關請自行輸入程式');if(!lessons.some(l=>l.id===id))throw Error('未知範例');lessonSelect.value=id;loadLesson();return state();},
    run:()=>start(false)
  };
}
