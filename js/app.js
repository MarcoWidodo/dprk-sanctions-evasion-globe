'use strict';
function fatal(msg){const l=document.getElementById('load');if(l){l.classList.remove('hidden');
  l.innerHTML='<p style="color:#ff9a8f;max-width:440px;text-align:center;line-height:1.55">The globe couldn’t start.<br><span style="color:#6b7d99;font-size:11px">'+msg+'</span></p>';}}
if(typeof Globe==='undefined'){fatal('3D globe library did not load.');throw new Error('Globe missing');}
if(typeof topojson==='undefined'){fatal('map library did not load.');throw new Error('topojson missing');}

const $=id=>document.getElementById(id);
const ROLE_COLORS={ctl:'#ff5252',fin:'#ffb020',proc:'#38bdf8',rev:'#34d399',trspt:'#a78bfa'};
const ROLE_ORDER=['proc','rev','fin','trspt','ctl'];
const ROLE_LABEL={ctl:'Control',fin:'Finance',proc:'Procurement',rev:'Revenue',trspt:'Transport'};
const TYPES={organization:'Organizations',individual:'Individuals',vessel:'Vessels',aircraft:'Aircraft'};
const TYPE_ONE={organization:'organization',individual:'individual',vessel:'vessel',aircraft:'aircraft'};
const BIT=DATA.bit;
const E=DATA.entities;
const DISPLAY_NAME={DPRK:'North Korea',ROK:'South Korea'};
const cname=c=>DISPLAY_NAME[c]||c;
const CCOORD={},REGION_OF={};
DATA.countries.forEach(c=>{CCOORD[c.c]=[c.lat,c.lng];REGION_OF[c.c]=c.reg;});
// countries with no actors of their own still anchor country–country links
DATA.flows.forEach(f=>{if(!CCOORD[f.a])CCOORD[f.a]=[f.slat,f.slng];if(!CCOORD[f.b])CCOORD[f.b]=[f.tlat,f.tlng];});
E.forEach((e,i)=>{e.tg=(e.f||[]).some(([k,v])=>k==='Targetable (RAND)'&&v==='TRUE');e.deg=METRICS.degree[i]||0;e.br=METRICS.brokerRank[i]||0;});
const MIN_N=5;      // below this many actors a country's averages are too noisy to shade
const GAP_TOP=0.6;  // designation share at which the gap scale tops out
const SMALL_FILL='rgba(150,162,180,0.30)',SMALL_RGB=[150,162,180];
const EMPTY_FILL='rgba(70,95,125,0.16)',QUIET_FILL='rgba(105,130,160,0.40)';

const FILLS={
  gap:{title:'Share of actors designated',stops:['#f0642e','#9a938c','#4c8dff'],lo:'0%',hi:Math.round(GAP_TOP*100)+'%+'},
  actors:{title:'Number of actors',stops:['#cfe6ff','#3f80b8','#0c3152'],lo:'few',hi:'many'},
  s:{title:'Activity diversity (S-score)',stops:['#ece1ff','#8b5cf6','#4c1d95'],lo:'single-purpose',hi:'diversified'},
  none:{title:'Outlines only',stops:null}
};

// ---------- helpers ----------
function h2r(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function mix(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
function ramp(t,stops){t=Math.max(0,Math.min(1,t));const n=stops.length-1;let seg=Math.min(n-1,Math.floor(t*n));const lt=t*n-seg;return mix(h2r(stops[seg]),h2r(stops[seg+1]),lt);}
function rgba(c,a){return`rgba(${c[0]},${c[1]},${c[2]},${a})`;}
function gradCSS(stops){return`linear-gradient(90deg,${stops.join(',')})`;}
const desigRGB=p=>ramp(p/GAP_TOP,FILLS.gap.stops);
function fmt(n){return(n||0).toLocaleString('en-US');}
function pct(a,b){return b?Math.round(1000*a/b)/10:0;}
function pct0(a,b){return b?Math.round(100*a/b):0;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function maskRoles(m){return ROLE_ORDER.filter(r=>m&BIT[r]);}
function pairKey(a,b){return a<b?a+'|'+b:b+'|'+a;}
function zeroRoles(){return{proc:0,rev:0,fin:0,trspt:0,ctl:0};}
function roleDots(roles){return roles.map(r=>`<span style="color:${ROLE_COLORS[r]}" title="${ROLE_LABEL[r]}">●</span>`).join('');}
function list(items){return items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items[items.length-1];}
const cOf=f=>DATA.name2canon[f.properties.name];

// ---------- links ----------
// Every documented link once: actor–actor pairs (adj is symmetric) and actor–country links.
const EDGES=[];
for(const[k,items]of Object.entries(DATA.adj)){const i=+k;
  for(const[ref,mask]of items){
    if(typeof ref==='number'){if(ref<i)continue;EDGES.push({i,j:ref,ca:E[i].c,cb:E[ref].c,mask});}
    else EDGES.push({i,j:null,ca:E[i].c,cb:ref,mask});}}
// Country–country links exist only in the precomputed flows: keep whatever the actor links don't explain.
const NATION_LINKS=(()=>{const seen={};
  for(const ed of EDGES){if(ed.ca===ed.cb||!CCOORD[ed.ca]||!CCOORD[ed.cb])continue;
    const s=seen[pairKey(ed.ca,ed.cb)]||(seen[pairKey(ed.ca,ed.cb)]={n:0,roles:zeroRoles()});s.n++;maskRoles(ed.mask).forEach(r=>s.roles[r]++);}
  const out=[];
  for(const f of DATA.flows){const s=seen[pairKey(f.a,f.b)]||{n:0,roles:zeroRoles()},n=f.count-s.n;if(n<=0)continue;
    const roles=zeroRoles();ROLE_ORDER.forEach(r=>roles[r]=Math.max(0,(f.roles[r]||0)-s.roles[r]));out.push({ca:f.a,cb:f.b,n,roles});}
  return out;})();

// ---------- filters (take a filter object so the story can use unfiltered data) ----------
const DEFAULT_FILTERS=()=>({roles:new Set(ROLE_ORDER),types:new Set(Object.keys(TYPES)),desig:'all',region:'all',countries:new Set()});
const allRoles=f=>f.roles.size===ROLE_ORDER.length;
function roleBits(f){let b=0;f.roles.forEach(r=>b|=BIT[r]);return b;}
function attrPasses(e,f){
  if(!f.types.has(e.type))return false;
  if(f.desig==='d'&&!e.d)return false;
  if(f.desig==='u'&&e.d)return false;
  return allRoles(f)||(e.roles||[]).some(r=>f.roles.has(r));
}
function placePasses(c,reg,f){
  if(f.region!=='all'&&reg!==f.region)return false;
  if(f.countries.size&&!f.countries.has(c))return false;
  return true;
}
const entityPasses=(e,f)=>attrPasses(e,f)&&placePasses(e.c,e.reg,f);
const attrDefault=f=>f.desig==='all'&&f.types.size===Object.keys(TYPES).length;
const filtersDefault=f=>attrDefault(f)&&allRoles(f)&&f.region==='all'&&!f.countries.size;

function computeCountries(f){
  const by={};
  for(const e of E){if(!CCOORD[e.c]||!entityPasses(e,f))continue;
    let m=by[e.c];if(!m){m={value:0,d:0,s:0,roles:zeroRoles()};by[e.c]=m;}
    m.value++;if(e.d)m.d++;m.s+=(e.s||0);if(e.roles)for(const r of e.roles)if(m.roles[r]!==undefined)m.roles[r]++;}
  let mx=1,mxa=1;const list=[];
  for(const c of DATA.countries){const m=by[c.c];if(!m||!m.value)continue;
    mx=Math.max(mx,m.value);if(m.value>=MIN_N)mxa=Math.max(mxa,m.s/m.value);
    list.push(Object.assign({},c,{value:m.value,dcount:m.d,pct:m.d/m.value,avgS:m.s/m.value,rmix:m.roles}));}
  return{list,by,max:mx,maxAvgS:mxa};
}
// Links pass when they carry a selected role and involve at least one matching actor in the selected place.
// With an ego set, only those actors' own links count (place/type filters don't hide part of a network).
function computeLinks(f,ego){
  const bits=roleBits(f),all=allRoles(f),agg={},egoSet=ego&&ego.length?new Set(ego):null;
  let total=0,domestic=0,unplaced=0;
  const add=(a,b,n,rc)=>{const k=pairKey(a,b);const p=agg[k]||(agg[k]={a,b,count:0,roles:zeroRoles()});p.count+=n;ROLE_ORDER.forEach(r=>p.roles[r]+=rc[r]||0);};
  for(const ed of EDGES){
    if(egoSet&&!egoSet.has(ed.i)&&!(ed.j!==null&&egoSet.has(ed.j)))continue;
    if(!all&&!(ed.mask&bits))continue;
    const A=E[ed.i],B=ed.j!==null?E[ed.j]:null;
    if(!egoSet){
      if(!(attrPasses(A,f)||(B&&attrPasses(B,f))))continue;
      if(!(placePasses(ed.ca,A.reg,f)||placePasses(ed.cb,B?B.reg:REGION_OF[ed.cb],f)))continue;
    }
    total++;
    if(!CCOORD[ed.ca]||!CCOORD[ed.cb]){unplaced++;continue;}
    if(ed.ca===ed.cb){domestic++;continue;}
    const rc={};maskRoles(all?ed.mask:ed.mask&bits).forEach(r=>rc[r]=1);add(ed.ca,ed.cb,1,rc);
  }
  if(!egoSet&&attrDefault(f))for(const l of NATION_LINKS){
    if(!all&&!ROLE_ORDER.some(r=>f.roles.has(r)&&l.roles[r]))continue;
    if(!(placePasses(l.ca,REGION_OF[l.ca],f)||placePasses(l.cb,REGION_OF[l.cb],f)))continue;
    total+=l.n;add(l.ca,l.cb,l.n,l.roles);
  }
  const arcs=Object.values(agg).map(p=>{const s=CCOORD[p.a],t=CCOORD[p.b];
    let dom='ctl',bv=0;for(const r of ROLE_ORDER)if(f.roles.has(r)&&p.roles[r]>bv){bv=p.roles[r];dom=r;}
    return Object.assign(p,{slat:s[0],slng:s[1],tlat:t[0],tlng:t[1],dom});});
  return{arcs,total,domestic,unplaced,mapped:arcs.reduce((s,a)=>s+a.count,0)};
}
const BASE={cs:computeCountries(DEFAULT_FILTERS()),links:computeLinks(DEFAULT_FILTERS(),null)};

// ---------- globe ----------
const globeEl=$('globeViz');
const feats=topojson.feature(POLY,POLY.objects.countries).features;
let SCENE={fill:()=>EMPTY_FILL};
const globe=Globe()(globeEl)
  .backgroundColor('#05060f')
  .showGlobe(true).showAtmosphere(true).atmosphereColor('#3a6ea5').atmosphereAltitude(0.16)
  .polygonsData(feats).polygonAltitude(0.006).polygonSideColor(()=>'rgba(0,0,0,0)')
  .onPolygonClick(f=>{const c=cOf(f);if(mode==='explore'&&c&&CUR.by[c])openCountry(c);})
  .arcStartLat(d=>d.slat).arcStartLng(d=>d.slng).arcEndLat(d=>d.tlat).arcEndLng(d=>d.tlng)
  .arcAltitudeAutoScale(0.42).arcDashInitialGap(()=>Math.random())
  .arcLabel(arcLabel)
  .pointLat(d=>d.lat).pointLng(d=>d.lng)
  .pointColor(d=>rgba(d.value<MIN_N?SMALL_RGB:desigRGB(d.pct),1))
  .pointRadius(d=>0.14+0.55*Math.sqrt(d.value/CUR.max)).pointAltitude(d=>0.008+0.11*Math.sqrt(d.value/CUR.max))
  .pointLabel(pointLabel).onPointClick(d=>{if(mode==='explore')openCountry(d.c);}).pointsTransitionDuration(300)
  .ringColor(()=>t=>`rgba(255,107,94,${1-t})`).ringMaxRadius(4).ringPropagationSpeed(2).ringRepeatPeriod(1400);
const controls=globe.controls();
controls.autoRotateSpeed=0.35;controls.enableDamping=true;
const gm=globe.globeMaterial();gm.color.set('#0c1c30');gm.emissive.set('#040a16');gm.shininess=6;

function arcLabel(d){
  if(mode!=='explore')return'';
  const rows=ROLE_ORDER.filter(r=>d.roles[r]).sort((x,y)=>d.roles[y]-d.roles[x]).map(r=>`<span style="color:${ROLE_COLORS[r]}">●</span> ${ROLE_LABEL[r]} ${fmt(d.roles[r])}`).join('<br>');
  return`<div style="font:12px sans-serif;color:#fff;background:#0d1426;padding:7px 10px;border:1px solid #2a3a5a;border-radius:7px;line-height:1.45"><b>${esc(cname(d.a))} — ${esc(cname(d.b))}</b><br>${fmt(d.count)} link${d.count>1?'s':''}<div style="color:#9fb0c8;font-size:11px;margin-top:3px">${rows}</div><div style="color:#6b7d99;font-size:10px;margin-top:3px">links can carry several roles</div></div>`;
}
function pointLabel(d){
  if(mode!=='explore')return'';
  return`<div style="font:12px sans-serif;color:#fff;background:#0d1426;padding:8px 11px;border:1px solid #2a3a5a;border-radius:8px;min-width:150px"><b style="font-size:13px">${esc(cname(d.c))}</b> <span style="color:#6b7d99">· ${d.reg}</span><br><span style="color:#9fb0c8">${fmt(d.value)} actors · ${d.dcount} designated (${Math.round(d.pct*100)}%)</span>${d.value<MIN_N?'<br><span style="color:#6b7d99;font-size:11px">too few actors to compare</span>':''}<br><span style="color:#6b7d99;font-size:11px">click for details</span></div>`;
}
function polyLabel(f){
  if(mode!=='explore')return'';
  const c=cOf(f),st=c?CUR.by[c]:null;if(!st)return'';
  return`<div style="font:12px sans-serif;color:#fff;background:#0d1426;padding:7px 10px;border:1px solid #2a3a5a;border-radius:8px"><b>${esc(cname(c))}</b><br><span style="color:#9fb0c8">${fmt(st.value)} actors · ${Math.round(100*st.d/st.value)}% designated</span>${st.value<MIN_N?'<br><span style="color:#6b7d99;font-size:11px">too few actors to compare</span>':''}</div>`;
}
// country fill for a shading mode, from a computeCountries() result
function shade(c,cs,modeName){
  const st=c?cs.by[c]:null;
  if(!st||!st.value)return EMPTY_FILL;
  if(modeName==='none')return QUIET_FILL;
  if(modeName==='actors')return rgba(ramp(Math.sqrt(st.value/cs.max),FILLS.actors.stops),0.85);
  if(st.value<MIN_N)return SMALL_FILL;
  if(modeName==='s'){const t=(st.s/st.value-1)/((cs.maxAvgS-1)||1);return rgba(ramp(t,FILLS.s.stops),0.85);}
  return rgba(desigRGB(st.d/st.value),0.85);
}
const arcStrokeFor=(min)=>d=>Math.min(2.6,Math.max(min,Math.sqrt(d.count)/10));
// paint one scene: {fill(c), arcs, arcAlpha, animate, minStroke, points, rings, borders}
function paint(sc){
  SCENE=sc;
  const alpha=sc.arcAlpha||'ff';
  globe.arcsData(sc.arcs||[])
    .arcColor(d=>{const c=ROLE_COLORS[d.dom];return[c+'00',c+alpha,c+'00'];})
    .arcStroke(arcStrokeFor(sc.minStroke||0.3))
    .arcDashLength(sc.animate?0.45:1).arcDashGap(sc.animate?0.9:0)
    .arcDashAnimateTime(sc.animate?(d=>Math.max(900,3200-d.count*3)):0);
  globe.pointsData(sc.points||[]);
  globe.ringsData(sc.rings||[]);
  globe.polygonCapColor(f=>sc.fill(cOf(f)))
    .polygonStrokeColor(()=>sc.borders===false?'rgba(0,0,0,0)':'rgba(150,180,210,0.30)')
    .polygonLabel(polyLabel);
}
function sizeGlobe(){globe.width(globeEl.clientWidth||innerWidth);globe.height(globeEl.clientHeight||innerHeight);}
function mountGlobe(id){const host=$(id);if(globeEl.parentElement!==host)host.appendChild(globeEl);sizeGlobe();}
window.addEventListener('resize',()=>{sizeGlobe();closePop();});

// ---------- story ----------
const F=(()=>{
  const nk=E.filter(e=>e.c==='DPRK'),abroad=E.filter(e=>e.c!=='DPRK'&&e.c!=='Unknown');
  const cross=BASE.links.mapped,flows=BASE.links.arcs;
  const touching=c=>flows.filter(a=>a.a===c||a.b===c).reduce((s,a)=>s+a.count,0);
  const chinaDprk=(flows.find(a=>pairKey(a.a,a.b)===pairKey('China','DPRK'))||{count:0}).count;
  const big=DATA.countries.filter(c=>c.n>=20);
  const zero=big.filter(c=>c.desig===0).sort((a,b)=>b.n-a.n);
  const near=big.filter(c=>c.desig>0&&c.desig/c.n<=0.05).sort((a,b)=>b.n-a.n);
  const ssa=E.filter(e=>e.reg==='Sub-Saharan Africa');
  const ssaTop=DATA.countries.filter(c=>c.reg==='Sub-Saharan Africa').sort((a,b)=>b.n-a.n).slice(0,4);
  const roleRate=r=>{const a=E.filter(e=>(e.roles||[]).includes(r));return pct0(a.filter(e=>e.d).length,a.length);};
  const vessels=E.filter(e=>e.type==='vessel'),flagCount={};
  vessels.forEach(e=>{const fl=(e.f||[]).find(x=>x[0]==='Flag(s)');if(fl)fl[1].split(/[,;]/).map(s=>s.trim()).filter(Boolean).forEach(s=>flagCount[s]=(flagCount[s]||0)+1);});
  const flags=Object.entries(flagCount).filter(([c])=>!['DPRK','China','Unknown'].includes(c)).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
  const ranked=E.filter(e=>e.br).sort((a,b)=>a.br-b.br),top100=ranked.slice(0,100);
  const foreignBroker=ranked.find(e=>!e.d&&e.c!=='DPRK'&&e.c!=='Unknown');
  return{
    total:E.length,links:DATA.kpi.links,countries:DATA.countries.length,desPct:pct0(E.filter(e=>e.d).length,E.length),
    nkN:nk.length,nkPct:pct0(nk.filter(e=>e.d).length,nk.length),nkShips:nk.filter(e=>e.type==='vessel').length,
    abroadN:abroad.length,abroadPct:pct0(abroad.filter(e=>e.d).length,abroad.length),
    domesticPct:pct0(BASE.links.domestic,BASE.links.total),
    chinaN:E.filter(e=>e.c==='China').length,chinaShare:pct0(touching('China'),cross),chinaDprkShare:pct0(chinaDprk,cross),
    zero,near,ssaN:ssa.length,ssaPct:pct0(ssa.filter(e=>e.d).length,ssa.length),ssaRev:pct0(ssa.filter(e=>(e.roles||[]).includes('rev')).length,ssa.length),ssaTop,
    revRate:roleRate('rev'),trsptRate:roleRate('trspt'),ctlRate:roleRate('ctl'),vessels:vessels.length,flags,
    topUndes:top100.filter(e=>!e.d).length,topAbroad:top100.filter(e=>e.c!=='DPRK').length,foreignBroker,
    component:METRICS.largestComponent,componentPct:pct0(METRICS.largestComponent,E.length)
  };
})();

const fillOnly=(set,inFill,outFill=EMPTY_FILL)=>c=>set.has(c)?(typeof inFill==='function'?inFill(c):inFill):(BASE.cs.by[c]?QUIET_FILL.replace('0.40','0.22'):outFill);
const gapFill=c=>shade(c,BASE.cs,'gap');
const arcsWhere=(pred,role)=>BASE.links.arcs.filter(pred).map(a=>role?Object.assign({},a,{dom:role,count:a.roles[role]}):a).filter(a=>a.count>0);
const ringAt=cs=>cs.filter(c=>CCOORD[c]).map(c=>({lat:CCOORD[c][0],lng:CCOORD[c][1]}));
const nm=c=>`<b>${esc(cname(c.c||c))}</b>`;

const STEPS=[
  {html:`<div class="kicker">An interactive investigation</div>
    <h1>North Korea's sanctions-evasion network spans ${F.countries} countries. Most of it has never been sanctioned.</h1>
    <p>Investigators have named thousands of companies, people, ships and aircraft that help North Korea earn money and buy what its weapons programs need. Only about one in five has been put on a sanctions list.</p>
    <div class="facts"><div class="fact"><div class="v">${fmt(F.total)}</div><div class="l">actors identified</div></div><div class="fact"><div class="v">${fmt(F.links)}</div><div class="l">documented links</div></div><div class="fact"><div class="v u">${F.desPct}%</div><div class="l">designated</div></div></div>
    <div class="cta"><button class="btn primary" data-go="1">Start the story ↓</button><button class="btn" data-explore="globe">Skip to the explorer</button></div>`,
   scene:()=>({fill:c=>BASE.cs.by[c]?QUIET_FILL:EMPTY_FILL,arcs:BASE.links.arcs,arcAlpha:'88',minStroke:0.25}),
   pov:{lat:25,lng:100,altitude:2.45},rotate:true},

  {html:`<div class="kicker">1 · It starts at home</div>
    <h2>A third of the network is inside North Korea itself</h2>
    <p><b>${fmt(F.nkN)}</b> of the ${fmt(F.total)} actors are North Korean: ministries, banks, trading companies, military bureaus and <b>${fmt(F.nkShips)}</b> ships. This is where enforcement has focused, and <span class="d">${F.nkPct}%</span> of them are designated.</p>
    <p>Most of the network's links never cross a border: <b>${F.domesticPct}%</b> connect two actors in the same country. That's why the map alone can't show the whole story.</p>`,
   scene:()=>({fill:fillOnly(new Set(['DPRK']),'rgba(240,100,46,.85)'),rings:ringAt(['DPRK'])}),
   pov:{lat:39.5,lng:127,altitude:1.25}},

  {html:`<div class="kicker">2 · The main channel</div>
    <h2>China carries ${F.chinaShare}% of every cross-border link</h2>
    <p><b>${fmt(F.chinaN)}</b> actors are based in China, more than anywhere outside North Korea. The China–North Korea connection alone accounts for <b>${F.chinaDprkShare}%</b> of all links between countries in the data.</p>
    <p>Arcs are colored by their most common role:</p>
    <div class="key">${ROLE_ORDER.map(r=>`<span><i style="background:${ROLE_COLORS[r]}"></i>${ROLE_LABEL[r]}</span>`).join('')}</div>`,
   scene:()=>({fill:fillOnly(new Set(['China','DPRK']),c=>c==='China'?'rgba(240,100,46,.62)':'rgba(240,100,46,.32)'),arcs:arcsWhere(a=>a.a==='China'||a.b==='China'),minStroke:0.45}),
   pov:{lat:31,lng:112,altitude:1.85}},

  {html:`<div class="kicker">3 · Abroad, the gap widens</div>
    <h2>Outside North Korea, ${100-F.abroadPct}% of actors were never designated</h2>
    <p>Investigators identified <b>${fmt(F.abroadN)}</b> actors abroad. Only <span class="d">${F.abroadPct}%</span> made it onto a sanctions list, about half the rate inside North Korea. The people and firms who make evasion possible abroad are the least likely to be sanctioned.</p>
    <p>Countries are shaded by the share of their actors that are designated:</p>
    <div class="scale" style="background:${gradCSS(FILLS.gap.stops)};height:9px;border-radius:5px;margin:6px 0 4px"></div>
    <div class="scale-lbl"><span>0%</span><span>${FILLS.gap.hi}</span></div>
    <div class="key"><span><i style="background:${SMALL_FILL}"></i>fewer than ${MIN_N} actors</span></div>`,
   scene:()=>({fill:gapFill}),
   pov:{lat:18,lng:70,altitude:2.6},rotate:true},

  {html:`<div class="kicker">4 · Blind spots</div>
    <h2>In some countries, nobody was designated at all</h2>
    <p>Among countries with at least 20 identified actors, these have <span class="u">zero</span> designations:</p>
    <ul>${F.zero.map(c=>`<li>${nm(c)}: ${c.n} actors</li>`).join('')}</ul>
    <p>${list(F.near.map(c=>nm(c)))} are close behind, at ${(r=>r[0]===r[1]?r[0]:r[0]+'–'+r[1])([Math.min(...F.near.map(c=>pct0(c.desig,c.n))),Math.max(...F.near.map(c=>pct0(c.desig,c.n)))])}% designated.</p>`,
   scene:()=>{const z=new Set(F.zero.map(c=>c.c)),n=new Set(F.near.map(c=>c.c));
     return{fill:c=>z.has(c)?'rgba(240,100,46,.9)':n.has(c)?'rgba(240,100,46,.5)':(BASE.cs.by[c]?'rgba(105,130,160,.22)':EMPTY_FILL),rings:ringAt([...z])};},
   pov:{lat:20,lng:75,altitude:2.7},rotate:true},

  {html:`<div class="kicker">5 · Earning hard currency</div>
    <h2>Africa: workers, construction and arms</h2>
    <p><b>${fmt(F.ssaN)}</b> actors are in sub-Saharan Africa, led by ${list(F.ssaTop.map(c=>nm(c)))}. Most earn money for the regime: building monuments and military facilities, supplying workers and selling arms. <b>${F.ssaRev}%</b> have a revenue role.</p>
    <p>Only <span class="d">${F.ssaPct}%</span> are designated. Green arcs are revenue links.</p>`,
   scene:()=>{const africa=c=>REGION_OF[c]==='Sub-Saharan Africa';
     return{fill:c=>africa(c)?gapFill(c):(BASE.cs.by[c]?'rgba(105,130,160,.18)':EMPTY_FILL),arcs:arcsWhere(a=>africa(a.a)||africa(a.b),'rev'),minStroke:0.5,animate:true};},
   pov:{lat:2,lng:22,altitude:1.95}},

  {html:`<div class="kicker">6 · The least-touched roles</div>
    <h2>Ships and money-making are rarely sanctioned</h2>
    <p>Only <span class="d">${F.revRate}%</span> of revenue actors and <span class="d">${F.trsptRate}%</span> of transport actors are designated, against <span class="d">${F.ctlRate}%</span> for command and control.</p>
    <p>The data names <b>${fmt(F.vessels)}</b> ships. Apart from North Korea's and China's, the most common flags are ${list(F.flags.map(c=>`<b>${esc(c)}</b>`))}: open registries, or flags of convenience, that make ships harder to trace. Purple arcs are transport links; flag states are highlighted.</p>`,
   scene:()=>{const fl=new Set(F.flags);
     return{fill:c=>fl.has(c)?'rgba(167,139,250,.75)':(BASE.cs.by[c]?'rgba(105,130,160,.2)':EMPTY_FILL),arcs:arcsWhere(()=>true,'trspt'),minStroke:0.35,animate:true};},
   pov:{lat:24,lng:112,altitude:2.5}},

  {html:`<div class="kicker">7 · The go-betweens</div>
    <h2>Many of the best-connected brokers are still free to operate</h2>
    <p><b>${F.componentPct}%</b> of actors belong to one connected network, so some matter more than others: the brokers that sit between everyone else. We ranked actors by how often they lie on the shortest path between two others.</p>
    <p><span class="u">${F.topUndes}</span> of the top 100 brokers are not designated, and ${F.topAbroad} of the top 100 are outside North Korea. The strongest foreign broker, <b>${esc(F.foreignBroker.name)}</b> in ${esc(cname(F.foreignBroker.c))}, ranks <b>#${F.foreignBroker.br}</b> and has never been listed. Its network is shown here.</p>`,
   scene:()=>{const L=computeLinks(DEFAULT_FILTERS(),[F.foreignBroker.i]);
     return{fill:fillOnly(new Set([F.foreignBroker.c,...L.arcs.flatMap(a=>[a.a,a.b])]),c=>c===F.foreignBroker.c?'rgba(240,100,46,.8)':'rgba(240,100,46,.3)'),arcs:L.arcs,minStroke:0.9,animate:true,rings:ringAt([F.foreignBroker.c])};},
   pov:{lat:12,lng:110,altitude:1.9}},

  {html:`<div class="kicker">Your turn</div>
    <h2>Explore the network yourself</h2>
    <p>Search any actor, filter by role, type or country, and see who was identified but never sanctioned.</p>
    <div class="cta" style="flex-direction:column;align-items:stretch">
      <button class="btn primary" data-explore="globe">Open the globe →</button>
      <button class="btn" data-explore="countries">Compare countries</button>
      <button class="btn" data-explore="targets">See ${fmt(E.filter(e=>e.tg&&!e.d).length)} unsanctioned targets</button>
    </div>
    <p class="note" style="margin-top:14px">Data: RAND Corporation's coding of UN Panel of Experts reports (2010–2022) with C4ADS Sanctions Explorer data. A snapshot of what investigators documented, not a live map. Broker ranking is our own calculation.</p>`,
   scene:()=>({fill:c=>BASE.cs.by[c]?QUIET_FILL:EMPTY_FILL,arcs:BASE.links.arcs,arcAlpha:'88',minStroke:0.25}),
   pov:{lat:25,lng:100,altitude:2.45},rotate:true}
];
let curStep=-1;
function buildStory(){
  $('steps').innerHTML=STEPS.map((s,k)=>`<section class="step" data-k="${k}"><div class="card">${s.html}</div></section>`).join('');
  $('stProgress').innerHTML=STEPS.map((s,k)=>`<button data-go="${k}" aria-label="Go to step ${k+1}"></button>`).join('');
  document.querySelectorAll('#story [data-go]').forEach(b=>b.onclick=()=>goStep(+b.dataset.go));
  document.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>showExplore(b.dataset.explore));
  const io=new IntersectionObserver(entries=>{entries.forEach(en=>{if(en.isIntersecting)applyStep(+en.target.dataset.k);});},{rootMargin:'-45% 0px -45% 0px'});
  document.querySelectorAll('.step').forEach(s=>io.observe(s));
}
function goStep(k){const s=document.querySelector(`.step[data-k="${k}"]`);if(s)s.scrollIntoView({behavior:'smooth',block:'center'});}
function applyStep(k,force){
  if(mode!=='story'||(k===curStep&&!force))return;
  curStep=k;const s=STEPS[k];
  document.querySelectorAll('.step').forEach(el=>el.classList.toggle('active',+el.dataset.k===k));
  document.querySelectorAll('#stProgress button').forEach((b,i)=>b.classList.toggle('on',i===k));
  paint(s.scene());
  controls.autoRotate=!!s.rotate;
  globe.pointOfView(s.pov,1600);
}

// ---------- explorer state ----------
const state=Object.assign(DEFAULT_FILTERS(),{
  showArcs:true,showNodes:true,showBorders:true,fill:'gap',
  view:'globe',pins:[],insp:null,
  tmode:'tu',tq:'',tsort:'br',tdir:1,tlimit:100,
  csort:'actors',csmall:false
});
let mode='story',CUR=BASE.cs,LINKS=BASE.links;
const inspHistory=[];
const TMODES={tu:'Targetable, not designated',ta:'All targetable',all:'All actors'};

// actors whose networks are drawn: pinned ones plus the one being inspected
function egoIds(){const ids=[...state.pins];if(state.insp&&state.insp.kind==='actor'&&!ids.includes(state.insp.i))ids.push(state.insp.i);return ids;}
function refresh(){
  CUR=computeCountries(state);LINKS=computeLinks(state,null);
  if(state.view==='globe')paintExplore();
  if(state.view==='countries')renderCountries();
  if(state.view==='targets')renderTargets();
  if(state.insp&&state.insp.kind==='country')renderInspector();
  renderPills();updateSummary();updateLegend();writeHash();
}
function paintExplore(){
  const ego=egoIds(),links=ego.length?computeLinks(state,ego):LINKS;
  const homes=[...new Set(ego.map(i=>E[i].c))];
  const focus=state.insp&&state.insp.kind==='country'?state.insp.c:null;
  paint({
    fill:c=>{const base=shade(c,CUR,state.fill);return focus&&c!==focus&&CUR.by[c]?base.replace(/[\d.]+\)$/,'0.35)'):base;},
    arcs:state.showArcs?links.arcs:[],arcAlpha:ego.length?'ff':'aa',minStroke:ego.length?0.9:0.28,animate:ego.length>0,
    points:state.showNodes?CUR.list:[],rings:ringAt(focus?[focus]:homes),borders:state.showBorders
  });
}
function updateSummary(){
  const ents=E.filter(e=>entityPasses(e,state)),des=ents.filter(e=>e.d).length;
  const hidden=[`${fmt(LINKS.mapped)} cross-border, drawn as arcs`,LINKS.domestic&&`${fmt(LINKS.domestic)} within one country`,LINKS.unplaced&&`${fmt(LINKS.unplaced)} with an unknown location`].filter(Boolean).join('; ');
  const s=$('summary');
  s.innerHTML=`<b>${fmt(ents.length)}</b> actors · <span class="u">${pct(des,ents.length)}%</span> designated · <b>${fmt(LINKS.total)}</b> links`;
  s.title=`Links: ${hidden}. ${fmt(ents.filter(e=>!CCOORD[e.c]).length)} actors have no known location and aren't on the map.`;
}

// ---------- mode + views ----------
function showStory(){
  mode='story';closePop();
  document.body.classList.remove('exploring');
  $('explore').hidden=true;$('story').hidden=false;
  controls.enabled=false;globe.resumeAnimation();
  mountGlobe('storyStage');
  history.replaceState(null,'',location.pathname+location.search);
  applyStep(Math.max(0,curStep),true);
}
function showExplore(view){
  mode='explore';
  document.body.classList.add('exploring');
  $('story').hidden=true;$('explore').hidden=false;
  controls.enabled=true;
  if(view)state.view=view;
  setView(state.view,true);
  if(state.view==='globe'&&!state.insp&&!state.pins.length){controls.autoRotate=true;globe.pointOfView({lat:22,lng:105,altitude:2.4},900);}
}
function setView(v,silent){
  state.view=v;closePop();
  ['globe','countries','targets'].forEach(k=>{$('view-'+k).hidden=k!==v;$('tab-'+k).setAttribute('aria-selected',k===v);$('tab-'+k).tabIndex=k===v?0:-1;});
  if(v==='globe'){mountGlobe('exploreStage');globe.resumeAnimation();}else globe.pauseAnimation();
  refresh();
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>setView(t.dataset.view));
document.querySelector('.tabs').addEventListener('keydown',ev=>{
  if(ev.key!=='ArrowRight'&&ev.key!=='ArrowLeft')return;
  const order=['globe','countries','targets'],k=order.indexOf(state.view)+(ev.key==='ArrowRight'?1:-1);
  const v=order[(k+3)%3];setView(v);$('tab-'+v).focus();
});
$('toStory').onclick=showStory;
$('storySkip').onclick=()=>showExplore('globe');

// ---------- filter bar ----------
const pop=$('pop');let popBtn=null,popRender=null;
function openPop(btn,render){
  if(popBtn===btn){closePop();return;}
  popBtn=btn;popRender=render;pop.hidden=false;drawPop();
}
function drawPop(){
  if(!popBtn)return;popRender(pop);
  const r=popBtn.getBoundingClientRect();
  pop.style.top=(r.bottom+6)+'px';
  pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+'px';
}
function closePop(){pop.hidden=true;popBtn=null;popRender=null;}
document.addEventListener('pointerdown',ev=>{if(!pop.hidden&&!pop.contains(ev.target)&&!(popBtn&&popBtn.contains(ev.target)))closePop();});
// after a change inside a popover: recompute, keep the popover open on the (re-rendered) pill
function changed(pillId){refresh();if(popRender){popBtn=document.querySelector(`[data-pill="${pillId}"]`)||popBtn;drawPop();}}

function checkList(items,sel,onToggle){
  return items.map(it=>`<label class="opt"><input type="checkbox" data-k="${esc(it.k)}" ${sel.has(it.k)?'checked':''}>${it.dot?`<span class="dot" style="background:${it.dot}"></span>`:''}<span>${esc(it.label)}</span>${it.cnt!==undefined?`<span class="cnt">${fmt(it.cnt)}</span>`:''}</label>`).join('');
}
const PILLS={
  role:{label:()=>allRoles(state)?'Role':`Role · ${state.roles.size} of 5`,set:()=>!allRoles(state),
    render:p=>{p.innerHTML=`<h4>Functional role</h4>`+checkList(ROLE_ORDER.map(r=>({k:r,label:ROLE_LABEL[r],dot:ROLE_COLORS[r]})),state.roles)
      +`<div class="row"><button class="linkbtn" data-all>Select all</button></div><div class="note">Filters actors and the links they carry.</div>`;
      p.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{cb.checked?state.roles.add(cb.dataset.k):state.roles.delete(cb.dataset.k);changed('role');});
      p.querySelector('[data-all]').onclick=()=>{state.roles=new Set(ROLE_ORDER);changed('role');};}},
  type:{label:()=>state.types.size===4?'Type':`Type · ${[...state.types].map(t=>TYPES[t]).join(', ')}`,set:()=>state.types.size!==4,
    render:p=>{const cnt=t=>E.filter(e=>e.type===t).length;
      p.innerHTML=`<h4>Actor type</h4>`+checkList(Object.keys(TYPES).map(t=>({k:t,label:TYPES[t],cnt:cnt(t)})),state.types)+`<div class="row"><button class="linkbtn" data-all>Select all</button></div>`;
      p.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{cb.checked?state.types.add(cb.dataset.k):state.types.delete(cb.dataset.k);changed('type');});
      p.querySelector('[data-all]').onclick=()=>{state.types=new Set(Object.keys(TYPES));changed('type');};}},
  status:{label:()=>({all:'Status',u:'Status · Not designated',d:'Status · Designated'})[state.desig],set:()=>state.desig!=='all',
    render:p=>{p.innerHTML=`<h4>Sanctions status</h4>`+[['all','All actors'],['u','Not designated'],['d','Designated']].map(([k,l])=>`<label class="opt"><input type="radio" name="desig" value="${k}" ${state.desig===k?'checked':''}>${k==='all'?'':`<span class="mk ${k}"></span>`}${l}</label>`).join('');
      p.querySelectorAll('input').forEach(r=>r.onchange=()=>{state.desig=r.value;changed('status');});}},
  region:{label:()=>state.region==='all'?'Region':`Region · ${state.region}`,set:()=>state.region!=='all',
    render:p=>{p.innerHTML=`<h4>Region</h4>`+[{r:'all',n:DATA.kpi.placed}].concat(DATA.regions).map(r=>`<label class="opt"><input type="radio" name="region" value="${esc(r.r)}" ${state.region===r.r?'checked':''}>${r.r==='all'?'All regions':esc(r.r)}<span class="cnt">${fmt(r.n)}</span></label>`).join('');
      p.querySelectorAll('input').forEach(r=>r.onchange=()=>{state.region=r.value;
        if(state.region!=='all'&&state.view==='globe'){const cs=DATA.countries.filter(c=>c.reg===state.region);if(cs.length){controls.autoRotate=false;globe.pointOfView({lat:cs.reduce((s,c)=>s+c.lat,0)/cs.length,lng:cs.reduce((s,c)=>s+c.lng,0)/cs.length,altitude:1.9},900);}}
        changed('region');});}},
  countries:{label:()=>state.countries.size?`Countries · ${state.countries.size}`:'Countries',set:()=>state.countries.size>0,
    render:p=>{const q=(p.querySelector('.cfilter')||{}).value||'';
      p.innerHTML=`<h4>Isolate countries</h4><input class="cfilter" placeholder="Filter countries" value="${esc(q)}"><div class="clist"></div><div class="row"><button class="linkbtn" data-clear>Clear</button></div>`;
      const fill=()=>{const qq=p.querySelector('.cfilter').value.toLowerCase();
        p.querySelector('.clist').innerHTML=checkList(DATA.countries.slice().sort((a,b)=>b.n-a.n).filter(c=>cname(c.c).toLowerCase().includes(qq)||c.c.toLowerCase().includes(qq)).map(c=>({k:c.c,label:cname(c.c),cnt:c.n})),state.countries);
        p.querySelectorAll('.clist input').forEach(cb=>cb.onchange=()=>{cb.checked?state.countries.add(cb.dataset.k):state.countries.delete(cb.dataset.k);refresh();renderPills();popBtn=document.querySelector('[data-pill="countries"]');});};
      fill();const inp=p.querySelector('.cfilter');inp.oninput=fill;if(q){inp.focus();inp.setSelectionRange(q.length,q.length);}
      p.querySelector('[data-clear]').onclick=()=>{state.countries.clear();changed('countries');};}},
  display:{label:()=>'Display',set:()=>false,globeOnly:true,
    render:p=>{p.innerHTML=`<h4>Globe display</h4>`+[['showArcs','Connections (arcs)'],['showNodes','Country markers'],['showBorders','Country borders']].map(([k,l])=>`<div class="tg ${state[k]?'on':''}" data-k="${k}" role="switch" aria-checked="${state[k]}" tabindex="0"><span>${l}</span><span class="sw"></span></div>`).join('')
      +`<h4 style="margin-top:10px">Shade countries by</h4><select class="sel">${Object.entries(FILLS).map(([k,f])=>`<option value="${k}" ${state.fill===k?'selected':''}>${f.title}</option>`).join('')}</select>`;
      p.querySelectorAll('.tg').forEach(t=>t.onclick=t.onkeydown=ev=>{if(ev.type==='keydown'&&ev.key!=='Enter'&&ev.key!==' ')return;ev.preventDefault();state[t.dataset.k]=!state[t.dataset.k];changed('display');});
      p.querySelector('select').onchange=ev=>{state.fill=ev.target.value;changed('display');};}}
};
function renderPills(){
  const html=Object.entries(PILLS).filter(([k,p])=>!p.globeOnly||state.view==='globe').map(([k,p])=>`<button class="pill ${p.set()?'set':''}" data-pill="${k}" aria-haspopup="true">${esc(p.label())} <span class="chev">▾</span></button>`).join('')
    +(filtersDefault(state)?'':`<button class="pill reset" id="resetPill">Reset filters</button>`)
    +(state.view==='globe'?state.pins.map(i=>`<button class="pill netpin" data-unpin="${i}" title="Pinned network: ${esc(E[i].name)}. Click to remove."><span class="nm">${esc(E[i].name)}</span><span class="x">×</span></button>`).join(''):'');
  const el=$('pills');el.innerHTML=html;
  el.querySelectorAll('[data-pill]').forEach(b=>b.onclick=()=>openPop(b,PILLS[b.dataset.pill].render));
  const rs=$('resetPill');if(rs)rs.onclick=()=>{Object.assign(state,DEFAULT_FILTERS());closePop();refresh();};
  el.querySelectorAll('[data-unpin]').forEach(b=>b.onclick=()=>{state.pins=state.pins.filter(x=>x!==+b.dataset.unpin);refresh();});
  if(popBtn&&popRender){const k=Object.keys(PILLS).find(k=>PILLS[k].render===popRender);popBtn=el.querySelector(`[data-pill="${k}"]`)||popBtn;}
}

// ---------- search ----------
const search=$('search'),results=$('searchResults');let kb=-1;
function searchHits(q){return E.filter(e=>e.name.toLowerCase().includes(q)).sort((a,b)=>(a.br||1e9)-(b.br||1e9)||(b.deg-a.deg)).slice(0,25);}
search.oninput=()=>{const q=search.value.trim().toLowerCase();kb=-1;
  if(q.length<2){results.hidden=true;return;}
  const hits=searchHits(q);results.hidden=false;
  results.innerHTML=hits.length?hits.map(e=>`<div class="res" data-i="${e.i}" role="option"><span class="nm"><span class="mk ${e.d?'d':'u'}"></span> ${esc(e.name)} <span style="color:#6b7d99">· ${esc(cname(e.c))}</span></span><span class="meta">${e.deg} links</span></div>`).join(''):`<div class="note" style="padding:8px">No actor matches “${esc(search.value)}”</div>`;
  results.querySelectorAll('.res').forEach(r=>r.onmousedown=ev=>{ev.preventDefault();pickResult(+r.dataset.i);});
};
search.onkeydown=ev=>{const rs=[...results.querySelectorAll('.res')];
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();if(!rs.length)return;kb=(kb+(ev.key==='ArrowDown'?1:-1)+rs.length)%rs.length;rs.forEach((r,i)=>r.classList.toggle('kb',i===kb));rs[kb].scrollIntoView({block:'nearest'});}
  else if(ev.key==='Enter'){const r=rs[kb>=0?kb:0];if(r)pickResult(+r.dataset.i);}
  else if(ev.key==='Escape'){results.hidden=true;search.blur();}
};
search.onblur=()=>setTimeout(()=>results.hidden=true,150);
function pickResult(i){search.value='';results.hidden=true;openActor(i);}

// ---------- inspector ----------
function inspKey(x){return x?x.kind+':'+(x.kind==='actor'?x.i:x.c):'';}
function openActor(i,fromBack){
  if(!E[i])return;
  if(!fromBack&&state.insp&&inspKey(state.insp)!==inspKey({kind:'actor',i}))inspHistory.push(state.insp);
  state.insp={kind:'actor',i};
  if(state.view==='globe'){const co=CCOORD[E[i].c];controls.autoRotate=false;if(co)globe.pointOfView({lat:co[0],lng:co[1],altitude:2.1},900);}
  renderInspector();refresh();
}
function openCountry(c,fromBack){
  if(!fromBack&&state.insp&&inspKey(state.insp)!==inspKey({kind:'country',c}))inspHistory.push(state.insp);
  state.insp={kind:'country',c};
  if(state.view==='globe'&&CCOORD[c]){controls.autoRotate=false;globe.pointOfView({lat:CCOORD[c][0],lng:CCOORD[c][1],altitude:1.7},900);}
  renderInspector();refresh();
}
function closeInspector(){state.insp=null;inspHistory.length=0;$('inspector').hidden=true;requestAnimationFrame(sizeGlobe);refresh();if(!state.pins.length&&state.view==='globe')controls.autoRotate=true;}
$('inspClose').onclick=closeInspector;
$('inspBack').onclick=()=>{const prev=inspHistory.pop();if(!prev)return;prev.kind==='actor'?openActor(prev.i,true):openCountry(prev.c,true);};

function renderInspector(){
  const x=state.insp,box=$('inspector');
  if(!x){box.hidden=true;return;}
  const wasHidden=box.hidden;box.hidden=false;if(wasHidden)requestAnimationFrame(sizeGlobe);
  $('inspBack').hidden=!inspHistory.length;
  $('inspBody').innerHTML=x.kind==='actor'?actorHTML(E[x.i]):countryHTML(x.c);
  $('inspBody').scrollTop=0;
  wireInspector(x);
}
// UN document symbols such as S/2014/127 link to the official document
function linkSources(v){return esc(v).replace(/\bS\/(\d{4})\/(\d+)/g,(m,y,n)=>`<a href="https://undocs.org/S/${y}/${n}" target="_blank" rel="noopener">${m}</a>`);}
const HIDE_FIELDS=new Set(['Type','Country','Continent','Sanctions status']);
function actorHTML(e){
  const items=(DATA.adj[String(e.i)]||[]).slice().sort((a,b)=>b[1]-a[1]);
  let cross=0,home=0,unk=0;const where=new Set();
  items.forEach(([ref])=>{const nc=typeof ref==='number'?E[ref].c:ref;if(!CCOORD[nc]||!CCOORD[e.c])unk++;else if(nc===e.c)home++;else{cross++;where.add(nc);}});
  const rows=(e.f||[]).filter(([k,v])=>!HIDE_FIELDS.has(k)&&v&&!/^unknown$/i.test(String(v).trim()))
    .map(([k,v])=>`<tr><td class="k">${esc(k)}</td><td class="v">${/^Source/.test(k)?linkSources(v):esc(v)}</td></tr>`).join('');
  const pinned=state.pins.includes(e.i);
  const parts=[cross&&`<b>${cross}</b> to ${where.size} other countr${where.size>1?'ies':'y'}`,home&&`<b>${home}</b> within ${esc(cname(e.c))}`,unk&&`<b>${unk}</b> with an unknown location`].filter(Boolean);
  return`<div class="insp-kicker">${esc(TYPE_ONE[e.type]||e.type)} · ${esc(cname(e.c))}</div>
    <div class="insp-title">${esc(e.name)}</div>
    <div class="badges"><span class="badge ${e.d?'d':'u'}">${e.d?'● Designated':'○ Not designated'}</span>${e.tg?'<span class="badge t">RAND: targetable</span>':''}<span class="badge">${esc(e.reg)}</span></div>
    <div class="stats"><div class="stat"><div class="v">${fmt(items.length)}</div><div class="l">links</div></div><div class="stat"><div class="v" style="color:var(--gold)">${e.br?'#'+fmt(e.br):'—'}</div><div class="l">broker rank</div></div><div class="stat"><div class="v dots">${roleDots(e.roles||[])||'—'}</div><div class="l">roles</div></div></div>
    ${items.length?`<div class="subhd">Direct connections</div>${egoSVG(e,items)}<div class="connsum">${parts.join(' · ')}</div>`:''}
    <div class="actions">${state.view!=='globe'?`<button class="btn primary" id="aGlobe">Show network on globe</button>`:''}<button class="btn ${pinned?'warn':''}" id="aPin">${pinned?'Unpin network':'Pin network to compare'}</button></div>
    ${items.length?`<div class="subhd">All ${items.length} connections</div><div>`+items.map(([ref,mask],n)=>{
      const isE=typeof ref==='number',ne=isE?E[ref]:null;
      return`<button class="conn ${isE?'':'nolink'}" ${isE?`data-i="${ref}"`:'tabindex="-1"'} ${n>=40?'hidden':''}><span class="cn">${isE?`<span class="mk ${ne.d?'d':'u'}"></span> `:''}${esc(isE?ne.name:cname(ref))} <span style="color:#6b7d99">· ${esc(isE?cname(ne.c):'country')}</span></span><span class="cr">${roleDots(maskRoles(mask))}</span></button>`;}).join('')
      +(items.length>40?`<button class="linkbtn" id="moreConns">Show all ${items.length}</button>`:'')+'</div>':''}
    <details class="rec"><summary>Dataset record</summary><table class="fieldtab">${rows}</table>
    <div class="note">B-Score = 16·procurement + 8·revenue + 4·finance + 2·transport + 1·control. S-Score = how many of the five roles. Broker rank = how often this actor sits on the shortest path between two others (our calculation, 1 = most central of ${fmt(METRICS.ranked)}).</div></details>`;
}
// radial diagram of an actor's direct connections, grouped by country
function egoSVG(e,items){
  const MAX=48,shown=items.slice().sort((a,b)=>{const ca=typeof a[0]==='number'?E[a[0]].c:a[0],cb=typeof b[0]==='number'?E[b[0]].c:b[0];return ca<cb?-1:ca>cb?1:0;}).slice(0,MAX);
  const n=shown.length,R=n>24?112:n>8?96:72,W=300,H=260,cx=W/2,cy=H/2;
  const nodes=shown.map(([ref,mask],k)=>{const a=-Math.PI/2+2*Math.PI*k/n,x=cx+R*Math.cos(a),y=cy+R*Math.sin(a);
    const isE=typeof ref==='number',ne=isE?E[ref]:null,col=ROLE_COLORS[maskRoles(mask)[0]||'ctl'];
    const tip=esc((isE?ne.name+' · '+cname(ne.c)+(ne.d?' · designated':' · not designated'):cname(ref)+' (country)'));
    const mark=isE?`<circle cx="${x}" cy="${y}" r="5.5" fill="${ne.d?'#4c8dff':'#0a1120'}" stroke="${ne.d?'#4c8dff':'#f0642e'}" stroke-width="1.6"/>`
      :`<rect x="${x-5}" y="${y-5}" width="10" height="10" rx="2" fill="#56657d"/>`;
    return{line:`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${col}" stroke-opacity=".55" stroke-width="1.2"/>`,
      node:`<g class="nb" ${isE?`data-i="${ref}"`:''}><title>${tip}</title>${mark}</g>`};});
  return`<svg class="ego" viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagram of ${n} direct connections">${nodes.map(d=>d.line).join('')}
    <circle cx="${cx}" cy="${cy}" r="10" fill="${e.d?'#4c8dff':'#f0642e'}" stroke="#fff" stroke-width="1.5"/>${nodes.map(d=>d.node).join('')}</svg>
    <div class="note">Center: this actor. <span style="color:#9ec0ff">●</span> designated · <span style="color:#ffab85">○</span> not designated · ■ a country. Lines are colored by role.${items.length>MAX?` Showing ${MAX} of ${items.length}.`:''}</div>`;
}
function countryHTML(c){
  const ents=E.filter(e=>e.c===c&&entityPasses(e,state)).sort((a,b)=>(a.br||1e9)-(b.br||1e9)||(b.deg-a.deg));
  const des=ents.filter(e=>e.d).length,roles=zeroRoles();
  ents.forEach(e=>(e.roles||[]).forEach(r=>{if(roles[r]!==undefined)roles[r]++;}));
  const rtot=Object.values(roles).reduce((a,b)=>a+b,0)||1;
  const tgU=ents.filter(e=>e.tg&&!e.d).length;
  return`<div class="insp-kicker">Country · ${esc(REGION_OF[c]||'')}</div><div class="insp-title">${esc(cname(c))}</div>
    <div class="stats"><div class="stat"><div class="v">${fmt(ents.length)}</div><div class="l">actors</div></div><div class="stat"><div class="v" style="color:var(--gap)">${ents.length?pct0(des,ents.length):0}%</div><div class="l">designated</div></div><div class="stat"><div class="v">${fmt(tgU)}</div><div class="l">open targets</div></div></div>
    ${ents.length<MIN_N?`<div class="note">Fewer than ${MIN_N} actors match your filters, so this share says little.</div>`:''}
    <div class="subhd">Role mix</div><div class="rolebar">${ROLE_ORDER.map(r=>roles[r]?`<i style="width:${100*roles[r]/rtot}%;background:${ROLE_COLORS[r]}" title="${ROLE_LABEL[r]}: ${roles[r]}"></i>`:'').join('')}</div>
    <div class="key" style="font-size:11px">${ROLE_ORDER.filter(r=>roles[r]).map(r=>`<span><i style="background:${ROLE_COLORS[r]};width:9px;height:9px"></i>${ROLE_LABEL[r]} ${roles[r]}</span>`).join('')}</div>
    <div class="actions"><button class="btn" id="cIso">${state.countries.size===1&&state.countries.has(c)?'Stop isolating':'Isolate this country'}</button>${state.view!=='targets'?`<button class="btn" id="cTargets">Open targets here</button>`:''}</div>
    <div class="subhd">Actors, most central first</div>
    ${ents.slice(0,60).map(e=>`<button class="ent" data-i="${e.i}"><div class="ent-top"><span class="ent-nm">${esc(e.name)}</span><span class="ent-r">${e.br?'#'+fmt(e.br):''}</span></div><div class="ent-meta"><span class="mk ${e.d?'d':'u'}"></span>${e.d?'designated':'not designated'}<span>${esc(TYPE_ONE[e.type]||e.type)}</span><span>${e.deg} links</span><span class="dots">${roleDots(e.roles||[])}</span></div></button>`).join('')}
    ${ents.length>60?`<div class="note">+ ${ents.length-60} more. Use the Targets view to see them all.</div>`:''}`;
}
function wireInspector(x){
  const b=$('inspBody');
  b.querySelectorAll('[data-i]').forEach(el=>el.onclick=()=>openActor(+el.dataset.i));
  const more=$('moreConns');if(more)more.onclick=()=>{b.querySelectorAll('.conn[hidden]').forEach(c=>c.hidden=false);more.remove();};
  if(x.kind==='actor'){
    const g=$('aGlobe');if(g)g.onclick=()=>{setView('globe');openActor(x.i,true);};
    $('aPin').onclick=()=>{state.pins.includes(x.i)?state.pins=state.pins.filter(p=>p!==x.i):state.pins.push(x.i);renderInspector();refresh();};
  }else{
    $('cIso').onclick=()=>{const only=state.countries.size===1&&state.countries.has(x.c);state.countries=only?new Set():new Set([x.c]);renderInspector();refresh();};
    const t=$('cTargets');if(t)t.onclick=()=>{state.countries=new Set([x.c]);setView('targets');renderInspector();};
  }
}

// ---------- countries view ----------
function renderCountries(){
  const rows=CUR.list.filter(c=>state.csmall||c.value>=MIN_N);
  const hiddenSmall=CUR.list.length-rows.length;
  const sorters={actors:(a,b)=>b.value-a.value,share:(a,b)=>a.pct-b.pct||b.value-a.value,undes:(a,b)=>(b.value-b.dcount)-(a.value-a.dcount)};
  rows.sort(sorters[state.csort]);
  const v=$('view-countries');
  v.innerHTML=`<div class="pane"><div class="pane-hd"><div><h2>Countries compared</h2>
    <p>Each bar is one country's actors that match your filters: <span style="color:#9ec0ff">blue</span> designated, <span style="color:#ffab85">orange</span> identified but never designated.</p></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Sort countries">${[['actors','Most actors'],['share','Lowest share designated'],['undes','Most undesignated']].map(([k,l])=>`<button data-sort="${k}" class="${state.csort===k?'on':''}">${l}</button>`).join('')}</div>
    <label class="opt" style="font-size:12px"><input type="checkbox" id="csmall" ${state.csmall?'checked':''}>Include countries with fewer than ${MIN_N} actors</label></div></div>
    <div class="clist2"><div class="crow2 hdr"><span class="rk">#</span><span>Country</span><span class="num">Actors</span><span>Designated vs. not</span><span class="num">Desig.</span></div>
    ${rows.map((c,k)=>`<button class="crow2 ${c.value<MIN_N?'small':''}" data-c="${esc(c.c)}"><span class="rk">${k+1}</span><span class="cn"><b>${esc(cname(c.c))}</b><span>${esc(c.reg)}</span></span><span class="num">${fmt(c.value)}</span><span class="sbar" title="${c.dcount} designated, ${c.value-c.dcount} not"><i style="width:${100*c.pct}%"></i></span><span class="pct" style="color:${rgba(desigRGB(c.pct),1)}">${Math.round(100*c.pct)}%</span></button>`).join('')}
    </div>${!state.csmall&&hiddenSmall?`<div class="note">${hiddenSmall} countries with fewer than ${MIN_N} matching actors are hidden.</div>`:''}
    ${rows.length?'':'<div class="note">No countries match these filters.</div>'}</div>`;
  v.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{state.csort=b.dataset.sort;renderCountries();writeHash();});
  $('csmall').onchange=ev=>{state.csmall=ev.target.checked;renderCountries();writeHash();};
  v.querySelectorAll('.crow2[data-c]').forEach(b=>b.onclick=()=>openCountry(b.dataset.c));
}

// ---------- targets view ----------
function targetRows(){
  const q=state.tq.trim().toLowerCase();
  const rows=E.filter(e=>entityPasses(e,state)&&(state.tmode==='all'||e.tg)&&(state.tmode!=='tu'||!e.d)&&(!q||e.name.toLowerCase().includes(q)));
  const key={name:e=>e.name.toLowerCase(),c:e=>cname(e.c).toLowerCase(),deg:e=>-e.deg,br:e=>e.br||1e9,d:e=>e.d}[state.tsort];
  return rows.sort((a,b)=>{const x=key(a),y=key(b);return(x<y?-1:x>y?1:(a.br||1e9)-(b.br||1e9))*state.tdir;});
}
function renderTargets(){
  const rows=targetRows(),v=$('view-targets'),focus=document.activeElement&&document.activeElement.id==='tsearch';
  const th=(k,l,cls='')=>`<th class="${cls}"><button data-tsort="${k}">${l}${state.tsort===k?(state.tdir>0?' ↑':' ↓'):''}</button></th>`;
  v.innerHTML=`<div class="pane"><div class="pane-hd"><div><h2>${fmt(rows.length)} ${state.tmode==='tu'?'open targets':'actors'}</h2>
    <p>${state.tmode==='tu'?'Actors RAND judged targetable for sanctions that no authority has designated. ':''}Sorted by broker rank: how often an actor sits on the shortest path between two others in the network. Your filters apply.</p></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Which actors">${Object.entries(TMODES).map(([k,l])=>`<button data-tmode="${k}" class="${state.tmode===k?'on':''}">${l}</button>`).join('')}</div>
    <input class="tsearch" id="tsearch" placeholder="Filter by name" value="${esc(state.tq)}" style="width:180px" aria-label="Filter table by name">
    <button class="btn" id="csvBtn">Download CSV</button></div></div>
    <table class="ttable"><thead><tr>${th('name','Actor')}${th('c','Country')}<th class="hide-sm">Roles</th>${th('deg','Links','num')}${th('br','Broker rank','num')}${th('d','Status','hide-sm')}</tr></thead>
    <tbody>${rows.slice(0,state.tlimit).map(e=>`<tr data-i="${e.i}" tabindex="0"><td class="nm"><b>${esc(e.name)}</b><span>${esc(TYPE_ONE[e.type]||e.type)}</span></td><td>${esc(cname(e.c))}</td><td class="hide-sm dots">${roleDots(e.roles||[])}</td><td class="num">${e.deg}</td><td class="num br">${e.br?'#'+fmt(e.br):'—'}</td><td class="hide-sm"><span class="mk ${e.d?'d':'u'}"></span> ${e.d?'designated':'not designated'}</td></tr>`).join('')}</tbody></table>
    ${rows.length>state.tlimit?`<div class="more"><button class="btn" id="tMore">Show ${Math.min(100,rows.length-state.tlimit)} more of ${fmt(rows.length-state.tlimit)}</button></div>`:''}
    ${rows.length?'':'<div class="note">No actors match. Try clearing filters or the name filter.</div>'}</div>`;
  v.querySelectorAll('[data-tmode]').forEach(b=>b.onclick=()=>{state.tmode=b.dataset.tmode;state.tlimit=100;renderTargets();writeHash();});
  v.querySelectorAll('[data-tsort]').forEach(b=>b.onclick=()=>{const k=b.dataset.tsort;state.tdir=state.tsort===k?-state.tdir:1;state.tsort=k;renderTargets();});
  v.querySelectorAll('tbody tr').forEach(tr=>{tr.onclick=()=>openActor(+tr.dataset.i);tr.onkeydown=ev=>{if(ev.key==='Enter')openActor(+tr.dataset.i);};});
  const ts=$('tsearch');ts.oninput=()=>{state.tq=ts.value;state.tlimit=100;renderTargets();};
  if(focus){ts.focus();ts.setSelectionRange(ts.value.length,ts.value.length);}
  const more=$('tMore');if(more)more.onclick=()=>{state.tlimit+=100;renderTargets();};
  $('csvBtn').onclick=()=>downloadCSV(rows);
}
function downloadCSV(rows){
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const src=e=>((e.f||[]).find(x=>x[0]==='Source(s)')||[,''])[1];
  const lines=[['name','country','region','type','roles','links','broker_rank','designated','rand_targetable','sources'].join(',')]
    .concat(rows.map(e=>[e.name,cname(e.c),e.reg,e.type,(e.roles||[]).map(r=>ROLE_LABEL[r]).join('; '),e.deg,e.br||'',e.d?'yes':'no',e.tg?'yes':'no',src(e)].map(q).join(',')));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
  a.download='dprk-network-'+(state.tmode==='tu'?'open-targets':'actors')+'.csv';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

// ---------- legend ----------
function updateLegend(){
  const f=FILLS[state.fill];
  let sh;
  if(!f.stops)sh=`<div>Countries show <b>outlines only</b>.</div>`;
  else sh=`<div>Countries: <b>${f.title.toLowerCase()}</b></div><div class="scale" style="background:${gradCSS(f.stops)}"></div><div class="scale-lbl"><span>${f.lo}</span><span>${f.hi}</span></div>`
    +(state.fill==='actors'?'':`<div class="legrow" style="margin-top:6px"><span class="swatch" style="background:${SMALL_FILL};height:9px"></span>fewer than ${MIN_N} actors</div>`);
  $('legend').innerHTML=sh+`<div style="margin-top:8px">Arcs: links between countries, colored by most common role</div>`
    +`<div class="key" style="margin-top:4px;font-size:11px">${ROLE_ORDER.map(r=>`<span><i style="background:${ROLE_COLORS[r]};width:9px;height:9px"></i>${ROLE_LABEL[r]}</span>`).join('')}</div>`
    +`<div class="note">Markers: height = actors, color = share designated. Links within one country aren't drawn as arcs.</div>`;
}
$('legendToggle').onclick=()=>{const c=$('legendCard').classList.toggle('closed');$('legendToggle').setAttribute('aria-expanded',!c);};
if(matchMedia('(max-width:860px)').matches)$('legendCard').classList.add('closed');

// ---------- shareable links: the explorer view lives in the URL hash ----------
let hashReady=false;
function writeHash(){
  if(!hashReady||mode!=='explore')return;
  const p=new URLSearchParams();
  p.set('view',state.view);
  if(state.insp)p.set(state.insp.kind==='actor'?'actor':'country',state.insp.kind==='actor'?state.insp.i:state.insp.c);
  if(state.pins.length)p.set('pins',state.pins.join(','));
  if(state.region!=='all')p.set('region',state.region);
  if(state.countries.size)p.set('isolate',[...state.countries].join('|'));
  if(!allRoles(state))p.set('roles',[...state.roles].join(','));
  if(state.types.size<4)p.set('types',[...state.types].join(','));
  if(state.desig!=='all')p.set('desig',state.desig);
  if(state.fill!=='gap')p.set('shade',state.fill);
  const hide=[!state.showArcs&&'arcs',!state.showNodes&&'nodes',!state.showBorders&&'borders'].filter(Boolean);
  if(hide.length)p.set('hide',hide.join(','));
  if(state.view==='targets'&&state.tmode!=='tu')p.set('targets',state.tmode);
  if(state.view==='countries'&&state.csort!=='actors')p.set('sort',state.csort);
  history.replaceState(null,'','#'+p.toString());
}
function readHash(){
  const p=new URLSearchParams(location.hash.slice(1));
  if(![...p.keys()].length)return false;
  const lst=(k,sep=',')=>(p.get(k)||'').split(sep).filter(Boolean);
  const okId=v=>Number.isInteger(+v)&&E[+v]?+v:null;
  if(['globe','countries','targets'].includes(p.get('view')))state.view=p.get('view');
  state.pins=lst('pins').map(okId).filter(v=>v!==null);
  // links from the first redesign used actors=/open=
  lst('actors').map(okId).forEach(v=>{if(v!==null&&!state.pins.includes(v))state.pins.push(v);});
  const a=okId(p.get('actor')??p.get('open'));
  if(p.has('actor')||p.has('open')){if(a!==null)state.insp={kind:'actor',i:a};}
  else if(p.has('country')&&CCOORD[p.get('country')])state.insp={kind:'country',c:p.get('country')};
  if(state.insp&&state.insp.kind==='actor')state.pins=state.pins.filter(v=>v!==state.insp.i);
  if(p.has('region')&&DATA.regions.some(r=>r.r===p.get('region')))state.region=p.get('region');
  state.countries=new Set(lst('isolate','|').filter(c=>CCOORD[c]));
  if(p.has('roles'))state.roles=new Set(lst('roles').filter(r=>ROLE_LABEL[r]));
  if(p.has('types'))state.types=new Set(lst('types').filter(t=>TYPES[t]));
  if(['d','u'].includes(p.get('desig')))state.desig=p.get('desig');
  if(FILLS[p.get('shade')])state.fill=p.get('shade');
  const hide=lst('hide');state.showArcs=!hide.includes('arcs');state.showNodes=!hide.includes('nodes');state.showBorders=!hide.includes('borders');
  if(TMODES[p.get('targets')])state.tmode=p.get('targets');
  if(['actors','share','undes'].includes(p.get('sort')))state.csort=p.get('sort');
  return true;
}
// a pasted link in an open tab only changes the hash; rebuild the view from it
window.addEventListener('hashchange',()=>location.reload());
$('shareBtn').onclick=async()=>{
  const lbl=$('shareLbl');
  try{await navigator.clipboard.writeText(location.href);lbl.textContent='Copied!';}
  catch(err){window.prompt('Copy this link:',location.href);}
  setTimeout(()=>lbl.textContent='Copy link',1600);
};

// ---------- about ----------
function buildAbout(){
  const rk=ROLE_ORDER.map(r=>`<span><i style="background:${ROLE_COLORS[r]}"></i>${ROLE_LABEL[r]}</span>`).join('');
  $('aboutBody').innerHTML=`
    <h3>Why this matters</h3>
    <p>For two decades North Korea has funded its weapons programs by evading international sanctions — smuggling coal and oil, selling arms, sending workers abroad, moving luxury goods, and, more recently, stealing and laundering cryptocurrency. Much of this runs not through North Korea directly but through a web of front companies, middlemen, banks, and ships spread across the world.</p>
    <p>The problem isn't only finding these actors — investigators have identified <b>thousands</b>. It's that only a small share are ever formally <b>sanctioned</b>: just <b>${F.desPct}%</b> of the actors here are designated, and ${F.abroadPct}% of those outside North Korea. RAND's 2025 study found that authorities failed to sanction roughly <b>45–70%</b> of the highest-value targets in North Korea's networks.</p>
    <div class="defbox"><span class="term">Read this as an illustration, not a live map.</span> The data is a fixed <b>snapshot</b> — UN Panel of Experts reporting coded through 2022 — and captures only what investigators documented and made public. It is best read as a worked example of a broader lesson: <b>sanctions only bite when they are enforced thoroughly</b>. Treat specific figures as illustrative rather than as a complete, up-to-date account.</div>
    <h3>Key terms</h3>
    <div class="defbox"><span class="term">Actor.</span> Any entity in the network: an organization, an individual, a vessel (ship), or an aircraft.</div>
    <div class="defbox"><span class="term">Designated vs. not designated.</span> An actor is <b>designated</b> when a government or the UN has formally placed it on a sanctions list (blue). It is <b>not designated</b> when investigators identified it as part of an evasion network but no authority listed it (orange).</div>
    <div class="defbox"><span class="term">RAND: targetable.</span> RAND's judgment that an actor is a practical sanctions target. The <b>Targets</b> view lists the targetable actors that were never designated.</div>
    <div class="defbox"><span class="term">Functional roles.</span> Each relationship is tagged with what it does:<div class="rolekey">${rk}</div><b>Procurement</b> = buying goods/technology; <b>Revenue</b> = earning hard currency (workers, construction, arms, minerals); <b>Finance</b> = moving and laundering money; <b>Transport</b> = shipping and ship-to-ship transfers; <b>Control</b> = command and direction.</div>
    <div class="defbox"><span class="term">Broker rank.</span> Our own measure (not RAND's): actors are ranked by betweenness centrality, how often they lie on the shortest path between two other actors. Rank 1 is the most central; ${fmt(METRICS.ranked)} actors broker at least one path. RAND's report uses a weighted version of this idea (Bell's subgroup betweenness), which isn't in this dataset. Computed by <code>scripts/build-metrics.js</code>.</div>
    <div class="defbox"><span class="term">B-Score and S-Score.</span> RAND's codes for <i>which</i> roles an actor performs (B: procurement 16, revenue 8, finance 4, transport 2, control 1, summed) and <i>how many</i> (S: 0–5). They describe function, not importance.</div>
    <h3>How to use it</h3>
    <p>The <b>story</b> walks through the main findings. The <b>explorer</b> has three views of the same data: the <b>Globe</b> (links between countries), <b>Countries</b> (designation rates compared), and <b>Targets</b> (a sortable, downloadable table). Filters in the bar apply to all three. Click any actor or country for details, and <b>Copy link</b> to share exactly what you're looking at.</p>
    <h3>Data &amp; caveats</h3>
    <p>Data: RAND Corporation's coding of UN Panel of Experts reports (2010–2022), enhanced with C4ADS Sanctions Explorer data (Mallory et al., 2025). Country positions are approximate centroids — an arc means a relationship exists, not a route. ${F.domesticPct}% of links are between actors in the same country; they're counted and listed but can't be drawn as arcs. ${fmt(DATA.kpi.entities-DATA.kpi.placed)} actors have no known location; they're searchable and counted but not on the map. Countries with fewer than ${MIN_N} actors are greyed out when comparing shares.</p>
    <p class="src"><b>Sources.</b> Mallory et al. <i>North Korea's Black Knights and Dark Networks.</i> RAND Corporation, RR-A3413-1, 2025. · C4ADS, <i>Sanctions Explorer</i>, 2024. · UN Panel of Experts reports, 2010–2024.</p>`;
}
const openAbout=()=>$('aboutModal').classList.add('open');
$('aboutBtn').onclick=openAbout;$('storyAbout').onclick=openAbout;
$('aboutClose').onclick=()=>$('aboutModal').classList.remove('open');
$('aboutModal').addEventListener('click',ev=>{if(ev.target.id==='aboutModal')ev.currentTarget.classList.remove('open');});
document.addEventListener('keydown',ev=>{
  if(ev.key!=='Escape')return;
  const m=$('aboutModal');
  if(m.classList.contains('open'))m.classList.remove('open');
  else if(!pop.hidden)closePop();
  else if(mode==='explore'&&state.insp)closeInspector();
});

// ---------- start ----------
try{
  buildStory();buildAbout();
  const fromLink=readHash();
  hashReady=true;
  if(fromLink){
    showExplore(state.view);
    if(state.insp){const x=state.insp;state.insp=null;x.kind==='actor'?openActor(x.i,true):openCountry(x.c,true);}
  }else{
    showStory();
  }
  requestAnimationFrame(sizeGlobe);
  setTimeout(()=>{sizeGlobe();$('load').classList.add('hidden');},500);
}catch(err){fatal(String(err&&err.stack||err));}
