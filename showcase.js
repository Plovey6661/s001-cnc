const params=new URLSearchParams(location.search),single=Number(params.get('scene'));
if(params.get('embed')==='1')document.body.classList.add('embedded');
if([1,2,3,4].includes(single)){document.body.classList.add('single');document.querySelectorAll('.scene-card').forEach(card=>{card.hidden=Number(card.dataset.scene)!==single;if(card.hidden)card.querySelector('iframe').remove();});}
const frames=[...document.querySelectorAll('iframe')],visible=new Map(frames.map(frame=>[frame,false]));
const reduced=matchMedia('(prefers-reduced-motion:reduce)');let playing=!reduced.matches;
const button=document.querySelector('#motion-toggle');
function sync(){button.textContent=playing?'暫停動畫':'播放動畫';button.setAttribute('aria-pressed',String(playing));frames.forEach(frame=>frame.contentWindow?.postMessage({type:'s001-demo-playback',playing:playing&&!document.hidden&&visible.get(frame)},location.origin));}
const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{const frame=entry.target;visible.set(frame,entry.isIntersecting);if(entry.isIntersecting&&!frame.getAttribute('src'))frame.src=frame.dataset.src;});sync();},{rootMargin:'80px'});
frames.forEach(frame=>{observer.observe(frame);frame.addEventListener('load',sync);});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='s001-demo-ready')sync();});
document.addEventListener('visibilitychange',sync);button.addEventListener('click',()=>{playing=!playing;sync();});reduced.addEventListener('change',()=>{playing=!reduced.matches;sync();});sync();
