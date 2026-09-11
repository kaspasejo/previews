const frames=[...document.querySelectorAll('.frame')];
const select=document.querySelector('#frame-select');
const count=document.querySelector('#count');
function show(n,replace=false){
  n=Math.max(1,Math.min(frames.length,Number(n)||1));
  frames.forEach((frame,index)=>{frame.classList.toggle('active',index===n-1);frame.hidden=index!==n-1});
  select.value=String(n);
  count.textContent=`${String(n).padStart(2,'0')} / ${String(frames.length).padStart(2,'0')}`;
  const url=new URL(location.href);url.searchParams.set('frame',n);
  history[replace?'replaceState':'pushState']({frame:n},'',url);
  document.title=`${String(n).padStart(2,'0')} · Arlowrites wireframes`;
  scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function current(){return Number(select.value)}
document.querySelector('#previous').addEventListener('click',()=>show(current()===1?frames.length:current()-1));
document.querySelector('#next').addEventListener('click',()=>show(current()===frames.length?1:current()+1));
select.addEventListener('change',()=>show(select.value));
addEventListener('popstate',()=>show(new URL(location.href).searchParams.get('frame')||1,true));
addEventListener('keydown',event=>{
  if(event.key==='ArrowRight')show(current()===frames.length?1:current()+1);
  if(event.key==='ArrowLeft')show(current()===1?frames.length:current()-1);
});
/* orphan control: bind the last three words of running text with nbsp */
const eligible='p, blockquote, dd, li, h3, h4';
document.querySelectorAll(eligible).forEach(element=>{
  for(const node of element.childNodes){
    if(node.nodeType!==Node.TEXT_NODE||!node.textContent.trim())continue;
    node.textContent=node.textContent.replace(/(\S+)\s+(\S+)\s*$/, '$1 $2');
  }
});
show(new URL(location.href).searchParams.get('frame')||1,true);
