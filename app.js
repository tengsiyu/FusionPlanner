'use strict';
const $ = s => document.querySelector(s);
let catalog, records = [], field = 'input', objectURL, request = 0;
const releaseBase = 'https://github.com/tengsiyu/FusionPlanner/releases/download/data-v1/';
function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function plot(record) {
  const W=560,H=300,pad={l:49,r:22,t:26,b:42};
  const groups=[record.lane,record.history,[[0,0]],record.trajectory];
  const all=groups.flat().filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
  let x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0]));
  let y0=Math.min(...all.map(p=>p[1])),y1=Math.max(...all.map(p=>p[1]));
  const cx=(x0+x1)/2,cy=(y0+y1)/2;
  const scale=Math.max((x1-x0+12)/(W-pad.l-pad.r),(y1-y0+10)/(H-pad.t-pad.b));
  const dx=scale*(W-pad.l-pad.r),dy=scale*(H-pad.t-pad.b);
  x0=cx-dx/2;x1=cx+dx/2;y0=cy-dy/2;y1=cy+dy/2;
  const X=x=>pad.l+(x-x0)/scale,Y=y=>H-pad.b-(y-y0)/scale;
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`Stored four-point future trajectory for source record ${record.index+1}. X forward, Y left, in metres.`);
  function add(tag,attrs,text){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;svg.append(n);return n;}
  for(let i=0;i<=4;i++){
    const x=x0+dx*i/4,y=y0+dy*i/4;
    add('line',{x1:X(x),x2:X(x),y1:pad.t,y2:H-pad.b,stroke:'#dce1d5','stroke-width':.7});
    add('line',{x1:pad.l,x2:W-pad.r,y1:Y(y),y2:Y(y),stroke:'#dce1d5','stroke-width':.7});
    add('text',{x:X(x),y:H-23,'text-anchor':'middle',fill:'#65725f','font-size':10,'font-family':'monospace'},x.toFixed(0));
    add('text',{x:pad.l-9,y:Y(y)+3,'text-anchor':'end',fill:'#65725f','font-size':10,'font-family':'monospace'},y.toFixed(0));
  }
  const line=(pts,color,dash,width)=>add('polyline',{points:pts.map(p=>`${X(p[0])},${Y(p[1])}`).join(' '),fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dash,'stroke-linejoin':'round'});
  line(record.lane,'#7c8e76','5 4',2);line(record.history,'#698cbd','4 3',2);line([[0,0],...record.trajectory],'#d64b1d','',3);
  add('circle',{cx:X(0),cy:Y(0),r:5,fill:'#254c3b'});
  record.trajectory.forEach((p,i)=>{add('circle',{cx:X(p[0]),cy:Y(p[1]),r:4,fill:'#d64b1d',stroke:'#fafaf6','stroke-width':1.5});add('text',{x:X(p[0])+4,y:Y(p[1])-11,fill:'#a53b1c','font-size':10,'font-family':'monospace'},`${i+1}s`);});
  add('text',{x:W-pad.r,y:H-6,'text-anchor':'end',fill:'#65725f','font-size':10},'X forward (m)');add('text',{x:pad.l,y:15,fill:'#65725f','font-size':10},'Y left (m)');
  $('#trajectory').replaceChildren(svg);
}
function showSample(){
  const r=records[Number($('#sample').value)];if(!r)return;
  $('#sample-content').textContent=r[field];plot(r);
  const d=catalog.datasets.find(x=>x.id===$('#dataset').value);
  $('#sample-caption').textContent=`${d.label} · source record ${(r.index+1).toLocaleString()} / ${d.count.toLocaleString()} · 4 future labels at 1 s intervals. Equal axis scale.`;
  if(objectURL)URL.revokeObjectURL(objectURL);
  const original={instruction:r.instruction,input:r.input,output:r.output};
  objectURL=URL.createObjectURL(new Blob([JSON.stringify(original,null,2)],{type:'application/json'}));
  $('#sample-download').href=objectURL;$('#sample-download').download=`${d.id}-record-${r.index+1}.json`;
}
async function loadDataset(){
  const id=++request;
  $('#sample-content').textContent='Loading samples…';$('#sample').disabled=true;
  try{
    const d=catalog.datasets.find(x=>x.id===$('#dataset').value);
    const response=await fetch(d.samples);if(!response.ok)throw Error(`Samples returned HTTP ${response.status}`);
    const data=await response.json();if(id!==request)return;
    records=data;$('#sample').replaceChildren(...records.map((r,i)=>{const o=el('option',`Record ${(r.index+1).toLocaleString()}`);o.value=i;return o;}));
    $('#sample').disabled=false;$('#data-error').hidden=true;showSample();
  }catch(e){if(id!==request)return;$('#sample-content').textContent='Samples could not be loaded.';showError(e);}
}
function showError(e){$('#data-error').hidden=false;$('#data-error').textContent=`Data could not be loaded. Refresh the page or download the manifest directly. ${e.message}`;}
async function init(){
 try{
  const response=await fetch('data/catalog.json');if(!response.ok)throw Error(`Catalogue returned HTTP ${response.status}`);catalog=await response.json();
  const metrics=[[catalog.datasets.length,'downloadable bundles'],[catalog.records_across_variants.toLocaleString(),'records across variants'],[catalog.inventory.length,'source JSON files']];
  $('#data-metrics').replaceChildren(...metrics.map(([n,t])=>{const d=el('div');d.append(el('strong',n),document.createTextNode(t));return d;}));
  $('#dataset').replaceChildren(...catalog.datasets.map(d=>{const o=el('option',d.label);o.value=d.id;return o;}));
  // Start with the richer object-level MiningCoT representation.
  $('#dataset').value=catalog.datasets.find(d=>d.id==='mining-s3')?.id||catalog.datasets[0].id;
  $('#dataset-rows').replaceChildren(...catalog.datasets.map(d=>{const tr=el('tr');tr.append(el('td',d.label),el('td',d.count.toLocaleString()),el('td',`${(d.bytes/1e6).toFixed(2)} MB`));const variant=el('td');variant.append(el('span',d.variant,'variant'));tr.append(variant);const cell=el('td');const a=el('a','JSON ↓');a.href=releaseBase+d.asset;a.setAttribute('aria-label',`Download ${d.label}, ${(d.bytes/1e6).toFixed(2)} MB`);cell.append(a);tr.append(cell);return tr;}));
  await loadDataset();
 }catch(e){$('#data-metrics').textContent='Dataset catalogue unavailable.';showError(e);}
}
$('#dataset').addEventListener('change',loadDataset);$('#sample').addEventListener('change',showSample);
document.querySelectorAll('[data-field]').forEach(b=>b.addEventListener('click',()=>{field=b.dataset.field;document.querySelectorAll('[data-field]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});showSample();}));
$('#copy-citation').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#citation').textContent);$('#copy-status').textContent='Citation copied.';}catch{const range=document.createRange();range.selectNodeContents($('#citation'));const s=window.getSelection();s.removeAllRanges();s.addRange(range);$('#copy-status').textContent='Citation selected. Press Ctrl+C or ⌘C to copy.';}});
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('current',a.hash===`#${entry.target.id}`));},{rootMargin:'-15% 0px -65% 0px'});document.querySelectorAll('section[id]').forEach(s=>observer.observe(s));}
init();
