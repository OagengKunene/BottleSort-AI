import { image, predict, route, random, W, H, CLASS_NAMES, formatTime } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('conveyor'), ctx = canvas.getContext('2d');
const camera = $('camera-image'), cameraCtx = camera.getContext('2d');
const STORAGE = 'bottlesort-lab-v1';
const ROUTE_NAMES = { accept: 'Accept', reject: 'Reject', review: 'Review' };
const COLORS = { accept: '#608b60', reject: '#c28667', review: '#bd9d5f' };
const icons = { accept: 'i-check', reject: 'i-x', review: 'i-info' };
const settings = { speed: 1, defect: 25, threshold: 85, difficulty: 15 };
let history = [], nextId = 1, simTime = 0, mode = 'ready', bottles = [], spawnClock = 0;
let model, selected = null, lastFrame = 0, frameTime = 0, rng = random(56417), pulse = 0, storageWarned = false;
let toastTimer, dirty = true;

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved && Array.isArray(saved.history)) {
    history = saved.history.filter(validRecord).slice(-2000).map(e => ({...e, state: e.state === 'sorted' ? 'sorted' : 'interrupted'}));
    nextId = Math.max(Number(saved.nextId) || 1, ...history.map(e => e.id + 1), 1);
    simTime = Number(saved.simTime) || 0;
    for (const [name, input] of Object.entries(settings)) {
      const el = $(name), value = Number(saved.settings?.[name]);
      if (Number.isFinite(value) && value >= Number(el.min) && value <= Number(el.max)) settings[name] = value;
    }
    if (history.length) selected = history.at(-1);
  }
} catch { /* An unavailable or malformed browser store does not block a run. */ }

function validRecord(e) {
  return e && Number.isInteger(e.id) && e.id > 0 && [0,1,2].includes(e.truth) && [0,1,2].includes(e.predicted)
    && ['accept','reject','review'].includes(e.route) && Array.isArray(e.probabilities) && e.probabilities.length === 3
    && e.probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1) && Number.isFinite(e.confidence)
    && Number.isFinite(e.seed) && Number.isFinite(e.difficulty) && Number.isFinite(e.time);
}

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ history, nextId, simTime, settings })); }
  catch { if (!storageWarned) { toast('Browser storage is unavailable. Export CSV to keep this run.'); storageWarned = true; } }
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}

function showView(view) {
  if (!['simulation','model','activity','guide'].includes(view)) view = 'simulation';
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${view}`; });
  document.querySelectorAll('[data-view]').forEach(el => {
    const active = el.dataset.view === view;
    el.classList.toggle('active', active);
    active ? el.setAttribute('aria-current','page') : el.removeAttribute('aria-current');
  });
  if (location.hash !== `#${view}`) window.history.replaceState(null, '', `#${view}`);
  if (view === 'activity') renderLog();
  if (view === 'model') renderModel();
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => showView(el.dataset.view)));
document.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => showView(el.dataset.open)));
$('guide-shortcut').addEventListener('click', () => showView('guide'));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

for (const name of Object.keys(settings)) {
  $(name).value = settings[name];
  setControlValue(name);
  $(name).addEventListener('input', () => { settings[name] = Number($(name).value); setControlValue(name); save(); });
}
function setControlValue(name) {
  $(`${name}-value`).textContent = name === 'speed' ? `${settings[name].toFixed(1)}×` : `${settings[name]}%`;
}

function setMode(newMode) {
  mode = newMode;
  const running = newMode === 'running' || newMode === 'stepping';
  const label = { ready:'Standby',running:'Running',paused:'Paused',stepping:'Single cycle' }[newMode];
  $('line-state').innerHTML = `<span class="dot"></span>${label}`;
  $('line-state').classList.toggle('is-running', running);
  $('heading-status').innerHTML = `<span class="dot"></span>${running ? 'Line running' : newMode === 'paused' ? 'Line paused' : 'Line ready'}`;
  $('start-button').innerHTML = `<svg><use href="#${newMode === 'running' ? 'i-pause' : 'i-play'}"/></svg><span>${newMode === 'running' ? 'Pause simulation' : newMode === 'paused' || bottles.length ? 'Resume simulation' : 'Start simulation'}</span>`;
  $('start-button').classList.toggle('is-running', newMode === 'running');
  $('step-button').disabled = !model || newMode === 'running' || newMode === 'stepping';
  $('initial-hint').hidden = bottles.length > 0 || history.length > 0 || running;
}

function spawn(forcedTruth) {
  let truth = forcedTruth;
  if (truth === undefined) truth = rng() * 100 < settings.defect ? (rng() < .5 ? 1 : 2) : 0;
  const seed = 2000000 + nextId * 7919;
  const bottle = { id:nextId++,truth,seed,progress:0, inspected:false, record:null };
  bottles.push(bottle);
  dirty = true;
  return bottle;
}

function inspect(bottle) {
  const difficulty = settings.difficulty / 100;
  const pixels = image(bottle.truth, bottle.seed, difficulty);
  const prediction = predict(pixels, model);
  const record = { id:bottle.id,seed:bottle.seed,time:simTime,truth:bottle.truth,...prediction,
    route:route(prediction, settings.threshold / 100),threshold:settings.threshold / 100,
    difficulty,defectFrequency:settings.defect,speed:settings.speed,state:'In transit' };
  bottle.inspected = true; bottle.record = record;
  history.push(record);
  if (history.length > 2000) history.shift();
  selected = record; pulse = 1;
  renderInspection(record); renderStats(); renderFeed(); renderLog(); renderModel(); save();
}

$('start-button').addEventListener('click', () => {
  if (!model) return;
  if (mode === 'running') { setMode('paused'); save(); return; }
  if (!bottles.length) { spawn(); spawnClock = 0; }
  setMode('running');
});
$('step-button').addEventListener('click', () => {
  if (!model || mode === 'running' || mode === 'stepping') return;
  // A single cycle advances existing in-flight bottles, or introduces exactly one new bottle.
  if (!bottles.length) spawn();
  setMode('stepping');
});
function inject(truth) {
  if (!model) { toast('The inspection model is still loading.'); return; }
  spawn(truth);
  // A paused challenge runs a single cycle, without enabling automatic spawning.
  if (mode !== 'running') setMode('stepping');
  toast(`${CLASS_NAMES[truth]} bottle sent to the line.`);
}
$('inject-missing').addEventListener('click', () => inject(1));
$('inject-tilted').addEventListener('click', () => inject(2));
$('reset-button').addEventListener('click', () => {
  history = []; bottles = []; nextId = 1; simTime = 0; spawnClock = 0; selected = null; rng = random(56417);
  setMode('ready'); renderStats(); renderFeed(); renderLog(); renderModel(); clearInspection(); save(); dirty = true;
  toast('Run reset. Your control settings are preserved.');
});

function badge(name) { return `<span class="badge ${name}"><svg><use href="#${icons[name]}"/></svg>${ROUTE_NAMES[name]}</span>`; }
const bottleId = id => `BT-${String(id).padStart(4,'0')}`;
const stateText = e => e.state === 'sorted' ? 'Sorted' : e.state === 'interrupted' ? 'Interrupted' : 'In transit';
function renderStats() {
  const counts = { accept:0,reject:0,review:0 };
  history.forEach(e => counts[e.route]++);
  $('kpi-total').textContent = history.length.toLocaleString();
  $('kpi-accepted').textContent = counts.accept.toLocaleString();
  $('kpi-rejected').textContent = counts.reject.toLocaleString();
  $('kpi-review').textContent = counts.review.toLocaleString();
  $('kpi-yield').textContent = history.length ? `${(100*counts.accept/history.length).toFixed(1)}% acceptance rate` : '— acceptance rate';
  $('nav-count').textContent = history.length > 999 ? '999+' : history.length;
}
function bindRows(tbody) {
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    const select = () => {
      const record = history.find(e => e.id === Number(row.dataset.id));
      if (record) { selected = record; showView('simulation'); renderInspection(record); $('inspection-detail').scrollIntoView({behavior:'smooth', block:'nearest'}); }
    };
    row.addEventListener('click', select);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
  });
}
function renderFeed() {
  $('feed-empty').hidden = history.length > 0;
  $('feed-body').innerHTML = history.slice(-5).reverse().map(e => `<tr data-id="${e.id}" tabindex="0" aria-label="Inspect ${bottleId(e.id)}"><td>${bottleId(e.id)}</td><td>${CLASS_NAMES[e.predicted]}</td><td class="mono">${(e.confidence*100).toFixed(1)}%</td><td>${badge(e.route)}</td><td><span class="state-label ${e.state === 'sorted' ? 'sorted' : ''}">${stateText(e)}</span></td></tr>`).join('');
  bindRows($('feed-body'));
}
function renderLog() {
  const filter = $('filter-log').value, term = $('search-log').value.trim().toLowerCase();
  const records = history.filter(e => (filter === 'all' || e.route === filter) && (!term || bottleId(e.id).toLowerCase().includes(term))).reverse();
  $('log-count').textContent = `${records.length} inspection${records.length === 1 ? '' : 's'}`;
  $('log-empty').hidden = records.length > 0;
  $('log-body').innerHTML = records.map(e => `<tr data-id="${e.id}" tabindex="0" aria-label="Inspect ${bottleId(e.id)}"><td>${bottleId(e.id)}</td><td class="mono">${formatTime(e.time)}</td><td>${CLASS_NAMES[e.truth]}</td><td>${CLASS_NAMES[e.predicted]}</td><td class="mono">${(e.confidence*100).toFixed(1)}%</td><td>${badge(e.route)}</td><td><span class="state-label ${e.state === 'sorted' ? 'sorted' : ''}">${stateText(e)}</span></td></tr>`).join('');
  bindRows($('log-body'));
}
$('search-log').addEventListener('input', renderLog);
$('filter-log').addEventListener('change', renderLog);

function drawCamera(pixels) {
  const buffer = document.createElement('canvas'); buffer.width = W; buffer.height = H;
  const c = buffer.getContext('2d'), raster = c.createImageData(W,H);
  for (let i = 0; i < pixels.length; i++) {
    const v = Math.round(pixels[i]*255);
    raster.data[i*4] = v; raster.data[i*4+1] = v; raster.data[i*4+2] = v; raster.data[i*4+3] = 255;
  }
  c.putImageData(raster,0,0); cameraCtx.imageSmoothingEnabled = false;
  cameraCtx.drawImage(buffer,0,0,camera.width,camera.height);
}
function clearInspection() {
  cameraCtx.fillStyle = '#1c2924'; cameraCtx.fillRect(0,0,camera.width,camera.height);
  $('camera-id').textContent = 'AWAITING INPUT';
  $('inspection-detail').innerHTML = '<span class="empty-label">No bottle inspected yet</span><p>Camera pixels become the model’s input. The prediction chooses the route.</p><div class="prob-placeholder"></div><div class="prob-placeholder short"></div>';
}
function renderInspection(record) {
  drawCamera(image(record.truth,record.seed,record.difficulty));
  $('camera-id').textContent = bottleId(record.id);
  $('inspection-detail').innerHTML = `<h3 class="decision-title">${CLASS_NAMES[record.predicted]}</h3><div class="inspection-result">${badge(record.route)}<span class="mono">${(record.confidence*100).toFixed(1)}%</span></div>` + record.probabilities.map((p,i) => `<div class="prob-row ${i === record.predicted ? 'best' : ''}"><div class="prob-label"><span>${CLASS_NAMES[i]}</span><span>${(p*100).toFixed(1)}%</span></div><div class="prob-track"><div class="prob-bar" style="width:${Math.max(0,Math.min(100,p*100))}%"></div></div></div>`).join('');
}
function renderModel() {
  if (!model) return;
  const report = model.report;
  $('model-train').textContent = report.training_samples.toLocaleString();
  $('model-test').textContent = report.test_samples.toLocaleString();
  $('model-accuracy').textContent = `${(report.test_accuracy*100).toFixed(1)}%`;
  $('live-accuracy').textContent = history.length ? `${(100*history.filter(e => e.truth === e.predicted).length/history.length).toFixed(1)}%` : '—';
  $('confusion-matrix').innerHTML = `<table><thead><tr><th>Actual ↓<br>Predicted →</th>${CLASS_NAMES.map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${report.confusion_matrix.map((row,i)=>`<tr><td>${CLASS_NAMES[i]}</td>${row.map((v,j)=>`<td class="${i===j?'matrix-diag':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

$('export-csv').addEventListener('click', () => {
  if (!history.length) { toast('Inspect a bottle before exporting a CSV.'); return; }
  const cols = ['bottle_id','simulation_seconds','synthetic_condition','predicted_condition','confidence','route','sorting_state','p_aligned_cap','p_missing_cap','p_tilted_cap','confidence_threshold','lighting_disturbance','defect_frequency_percent','line_speed','image_seed'];
  const rows = history.map(e=>[bottleId(e.id),e.time.toFixed(3),CLASS_NAMES[e.truth],CLASS_NAMES[e.predicted],e.confidence.toFixed(6),e.route,e.state,...e.probabilities.map(p=>p.toFixed(6)),e.threshold,e.difficulty,e.defectFrequency,e.speed,e.seed]);
  const quote = v => `"${String(v).replaceAll('"','""')}"`;
  const blob = new Blob(['\uFEFF'+[cols,...rows].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url;a.download='BottleSort_Inspection_Log_Kunene.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  toast(`Exported ${history.length} inspection records.`);
});

// Presentation geometry uses a fixed logical space; rendering is scaled for screen density.
const L = { width:980, height:365, begin:48, end:927, base:226, camera:.36, diverter:.70 };
function roundRect(x,y,w,h,r,fill,stroke) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
}
function text(label,x,y,color='#8b9f7d',size=10,font='DM Sans',align='left') {
  ctx.font=`${size}px ${font}, Arial`; ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(label,x,y);ctx.textAlign='left';
}
function path(points,color,width=1,dash=[]) {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);
}
function drawBottle(bottle,x,y,scale=1) {
  const jitter = ((bottle.seed%13)-6)*.08;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle='#b5c1a817';ctx.beginPath();ctx.ellipse(0,4,16,5,0,0,Math.PI*2);ctx.fill();
  const glass=ctx.createLinearGradient(-10,0,10,0);glass.addColorStop(0,'#d7b86c');glass.addColorStop(.38,'#edda9d');glass.addColorStop(1,'#c8aa61');
  ctx.fillStyle=glass;ctx.strokeStyle='#b9a264';ctx.lineWidth=.7;
  ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(-10,-37);ctx.quadraticCurveTo(-10,-42,-5,-45);ctx.lineTo(-5,-55);ctx.lineTo(5,-55);ctx.lineTo(5,-45);ctx.quadraticCurveTo(10,-42,10,-37);ctx.lineTo(10,0);ctx.quadraticCurveTo(0,3,-10,0);ctx.fill();ctx.stroke();
  roundRect(-10,-33,20,19,1,'#f1edcf');
  text('B',0,-20,'#8b9f6d',8,'Manrope','center');
  path([[-6,-37],[-6,-3]],'#fff8d080',1.4);
  if(bottle.truth!==1){ctx.save();ctx.translate(bottle.truth===2?2:0,-55);ctx.rotate(bottle.truth===2?-.37:jitter);roundRect(-7,-7,14,9,1.5,'#678562','#536f4d');for(let k=-5;k<=5;k+=2)path([[k,-5],[k,0]],'#93a780',.7);ctx.restore();}
  if(bottle.inspected){const col=COLORS[bottle.record.route];ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,-76,3.5,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawConveyor() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1,2), cssW = canvas.clientWidth;
  const targetW = Math.round(cssW * pixelRatio), targetH = Math.round(canvas.clientHeight * pixelRatio);
  if(canvas.width!==targetW||canvas.height!==targetH){canvas.width=targetW;canvas.height=targetH;}
  ctx.setTransform(canvas.width/L.width,0,0,canvas.height/L.height,0,0);ctx.clearRect(0,0,L.width,L.height);
  ctx.fillStyle='#f9fbf7';ctx.fillRect(0,0,L.width,L.height);
  // Factory plan grid.
  ctx.fillStyle='#cddac226';for(let x=18;x<980;x+=22)for(let y=16;y<365;y+=22)ctx.fillRect(x,y,1.3,1.3);
  text('01  INFEED',49,55,'#9aad90',9,'Courier New');text('02  OPTICAL INSPECTION',330,55,'#78936a',9,'Courier New');text('03  AUTOMATIC SORTING',669,55,'#9aad90',9,'Courier New');
  const cameraX = L.begin+(L.end-L.begin)*L.camera, divX=L.begin+(L.end-L.begin)*L.diverter;
  // Belt chassis and legs.
  path([[79,248],[79,279],[137,279]],'#c3ceb9',4);path([[602,248],[602,279],[655,279]],'#c3ceb9',4);
  roundRect(27,L.base-10,909,25,11,'#dce4d3','#c6d2bc');
  roundRect(32,L.base-6,900,17,8,'#e9efdf','#cfdac2');
  for(let i=0;i<44;i++){const x=42+((i*22+frameTime*34)%877);path([[x,L.base-4],[x,L.base+9]],'#c3ceb5',1);}
  ctx.lineWidth=1;roundRect(42,L.base-1,878,3,0,'#f7fbef');
  // Review and reject branches.
  path([[divX,225],[divX+72,113],[927,113]],'#dde5d2',17);path([[divX,225],[divX+72,113],[927,113]],'#edf1e4',11);
  path([[divX,229],[divX+72,316],[927,316]],'#e3e5d5',17);path([[divX,229],[divX+72,316],[927,316]],'#f3f0e4',11);
  for(let k=0;k<11;k++){const xx=divX+100+k*18;if(xx<927){path([[xx,107],[xx,119]],'#d1d9c4',1);path([[xx,310],[xx,322]],'#ded9c3',1);}}
  // Camera arch and inspection field.
  path([[cameraX-54,220],[cameraX-54,105],[cameraX+53,105],[cameraX+53,220]],'#9aaf8d',3);
  roundRect(cameraX-24,90,48,25,5,'#506b4b','#3d5839');
  roundRect(cameraX-12,94,24,15,3,'#304e38');ctx.fillStyle='#8da985';ctx.beginPath();ctx.arc(cameraX,101,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c4d9b3';ctx.beginPath();ctx.arc(cameraX+1,100,2,0,Math.PI*2);ctx.fill();
  text('CAM 01',cameraX,83,'#91a47f',7,'Courier New','center');
  ctx.fillStyle=`rgba(123,168,97,${pulse*.13+.04})`;ctx.fillRect(cameraX-31,124,62,95);
  ctx.setLineDash([4,5]);ctx.strokeStyle='#b0c29d';ctx.lineWidth=1;ctx.strokeRect(cameraX-31,124,62,95);ctx.setLineDash([]);
  if(mode==='running'||mode==='stepping'){const sy=132+(Math.sin(frameTime*3)+1)*37;path([[cameraX-29,sy],[cameraX+29,sy]],'#9bbb82',1.2);}
  // Detection beam, diverter, and route signs.
  roundRect(173,218,7,17,2,'#7d9670');path([[176,157],[176,217]],'#b9cf9a',1,[3,4]);roundRect(173,152,7,7,2,'#829f73');
  text('SENSOR',176,145,'#a1b18f',6,'Courier New','center');
  roundRect(divX-8,239,24,20,4,'#bdcdb0','#9caf89');
  const angle=pulse>.5?.5:0;ctx.save();ctx.translate(divX+3,228);ctx.rotate(angle);roundRect(-4,-23,8,28,3,'#819c6d','#6f8c5a');ctx.restore();
  text('DIVERTER',divX+5,278,'#9daf8b',7,'Courier New','center');
  const sign=(label,y,col,bg)=>{roundRect(832,y-21,92,18,4,bg);ctx.fillStyle=col;ctx.beginPath();ctx.arc(841,y-12,2.5,0,Math.PI*2);ctx.fill();text(label,851,y-9,col,8);};
  sign('REVIEW',94,'#b69659','#f4eeda');sign('ACCEPT',207,'#6e925b','#e8f0df');sign('REJECT',297,'#bd8c6b','#f7ecdf');
  // Bottles travel with a latched per-ID routing decision.
  for(const bottle of bottles){
    const p=bottle.progress;let x=L.begin+(L.end-L.begin)*p,y=L.base-9;
    if(bottle.record&&p>L.diverter){const q=Math.min(1,(p-L.diverter)/.13);const delta=bottle.record.route==='reject'?87:bottle.record.route==='review'?-112:0;y+=q*delta;}
    drawBottle(bottle,x,y,.93);
    if(bottle.inspected)text(String(bottle.id).padStart(3,'0'),x,y+19,'#a6b496',6,'Courier New','center');
  }
  // Floor annotations.
  const stations=[[59,'Virtual sensor'],[cameraX-45,'Pixel-based inference'],[divX-44,'ID-linked routing']];
  stations.forEach(([x,label])=>text(label,x,345,'#b0bda3',7));
  $('belt-count').textContent = `${bottles.length} bottle${bottles.length===1?'':'s'} on line`;
  $('sim-time').textContent = formatTime(simTime);
}

function frame(timestamp) {
  const dt = Math.min((timestamp-lastFrame)/1000 || 0,.08); lastFrame=timestamp;
  const active=mode==='running'||mode==='stepping';
  if(active&&model){
    const delta=dt*settings.speed;simTime+=delta;frameTime+=delta;spawnClock+=delta;
    if(mode==='running'&&spawnClock>=1.85){spawnClock-=1.85;spawn();}
    let changed=false;
    for(const bottle of bottles){bottle.progress+=delta*.126;if(!bottle.inspected&&bottle.progress>=L.camera)inspect(bottle);if(bottle.progress>=1.04&&bottle.record){bottle.record.state='sorted';changed=true;}}
    bottles=bottles.filter(b=>b.progress<1.04);
    if(changed){renderFeed();renderLog();save();}
    if(mode==='stepping'&&!bottles.length){setMode('paused');save();}
    pulse=Math.max(0,pulse-delta*.8);dirty=true;
  }
  if(dirty||active){drawConveyor();dirty=false;}
  requestAnimationFrame(frame);
}
window.addEventListener('resize',()=>{dirty=true;});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden)save();});
window.addEventListener('pagehide',save);

clearInspection();renderStats();renderFeed();renderLog();setMode('ready');showView(location.hash.slice(1));requestAnimationFrame(frame);
try {
  const response=await fetch('./model.json');if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
  model=await response.json();
  if(model.width!==W||model.height!==H||model.coefficients.length!==3||model.coefficients.some(row=>row.length!==W*H))throw new Error('Model shape mismatch');
  $('start-button').disabled=false;$('step-button').disabled=false;setMode('ready');
  renderModel();if(selected)renderInspection(selected);
} catch(error) { console.error('Inspection model failed:',error);$('load-error').hidden=false;$('start-button').innerHTML='<span>Model unavailable</span>'; }
