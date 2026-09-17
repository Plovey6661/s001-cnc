const select=document.querySelector('#embed-scene'),code=document.querySelector('#embed-code'),status=document.querySelector('#copy-status');
function update(){
  const scene=select.value,single=scene!=='all',url=new URL('./showcase.html',location.href);url.searchParams.set('embed','1');if(single)url.searchParams.set('scene',scene);
  const css=single?'width:100%;max-width:620px;height:580px;':'width:100%;height:1080px;';
  const responsive=single?'':'\n<style>\n@media(max-width:620px){.s001-cnc-showcase{height:2250px!important;}}\n</style>';
  code.value=`<iframe class="s001-cnc-showcase" src="${url.href}" title="S001 CNC ${single?'場景 '+scene:'四場景'}動畫展示" style="${css}border:0;display:block;" loading="lazy"></iframe>${responsive}`;status.textContent='';
}
select.addEventListener('change',update);
document.querySelector('#copy-embed').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.value);status.textContent='已複製，可貼到個人主頁。';}catch{code.focus();code.select();status.textContent='已選取嵌入碼，請複製後貼上。';}});update();
