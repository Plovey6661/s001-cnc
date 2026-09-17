import {compileProgram,sampleMotion} from './program-core.js';
import {lessons} from './program-lessons.js';
import {catProgram} from './cat-program.js';

// Uses the same compiler, axis pairing and stock removal as the interactive scenes.
export function createShowcaseDemo({level,machining,controls,camera,setAmount,fitView}){
  const caption=document.querySelector('#demo-caption');
  let time=0,lessonIndex=0,index=0,elapsed=0,pointIndex=1,hold=0,plan=null;
  const cycle=['linear','cw','cubic','pvt'].map(id=>lessons.find(lesson=>lesson.id===id));
  const manual='METRIC\nSECONDS\nABSOLUTE\nLINEAR X90 F60\nLINEAR X-90 F60\nLINEAR X0 F60\nLINEAR Y90 F60\nLINEAR Y-90 F60\nLINEAR Y0 F60\nLINEAR Z55 F35\nLINEAR Z0 F35\nRAPID X-10 Y-10 Z0\nLINEAR Z-28 F12\nLINEAR X12 F10\nLINEAR Y10 F10\nLINEAR X-10 F10\nLINEAR Y-10 F10\nLINEAR Z0 F12';
  function begin(){
    if(level===1){setAmount(.55,true);fitView('iso',1);camera.zoom=1.15;camera.updateProjectionMatrix();controls.autoRotate=true;controls.autoRotateSpeed=.55;return;}
    plan=compileProgram(level===2?manual:level===3?cycle[lessonIndex].code:catProgram);
    machining.reset();machining.setSpindle(true);machining.setToolPath([]);machining.showToolPath(false);machining.framePreview(level===2?'axes':'cutting');index=0;elapsed=0;pointIndex=1;hold=0;
  }
  function advance(budget){
    machining.beginBatch();
    try{while(budget>0&&index<plan.motions.length){
      const motion=plan.motions[index],used=Math.min(budget,Math.max(0,motion.duration-elapsed)),end=elapsed+used;
      while(pointIndex<motion.points.length&&motion.times[pointIndex]<=end+1e-10)machining.moveTo(motion.points[pointIndex++]);
      machining.moveTo(sampleMotion(motion,end));elapsed=end;budget-=used;
      if(elapsed>=motion.duration-1e-9){index++;elapsed=0;pointIndex=1;}else break;
    }}finally{machining.endBatch();}
    machining.framePreview(level===2?'axes':'cutting');
    if(index>=plan.motions.length)machining.setSpindle(false);
  }
  function label(){
    if(level===1){caption.textContent='ASSEMBLE / EXPLODE';return;}
    const motion=plan.motions[index],done=index>=plan.motions.length;
    if(level===2){const axes=machining.getState().axes;caption.textContent=`${index<8?'三軸移動':'切削加工'}  /  X ${axes.x.toFixed(0)}  Y ${axes.y.toFixed(0)}  Z ${axes.z.toFixed(0)} mm`;}
    if(level===3)caption.textContent=`${cycle[lessonIndex].command}  /  ${done?'刀痕完成':motion?.kind??'刀路展示'}`;
    if(level===4)caption.textContent=done?'小貓圖案 × 2  /  加工完成':'AEROBASIC  /  小貓圖案加工中';
  }
  begin();if(level===4)advance(plan.duration+1);label();
  return {
    update(dt){
      time+=dt;
      if(level===1){setAmount(.5-.5*Math.cos(time*Math.PI/5),true);label();return;}
      if(index>=plan.motions.length){hold+=dt;if(hold>4){if(level===3)lessonIndex=(lessonIndex+1)%cycle.length;begin();}}
      else advance(dt*(level===4?4:1.8));
      label();
    },
    finish(){if(level===1)setAmount(.65,true);else advance(plan.duration+1);label();}
  };
}
