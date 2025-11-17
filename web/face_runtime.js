// face_runtime.js — vGutsy-SoloFirst + Ghost overlay + Solo/Multi fast-create
// + ghost-safe (no absorption) + HUD/roster on ghost-only + 80-sample enroll (full)
// + Mirror-invariant matching everywhere (confidence & safe-learn use MI distance)
// + Alias linking (P# <-> P#) / canonical IDs everywhere
// + Thumbnail DB (localStorage) & listPersonsDetail / getPersonThumbs API
// + Auto thumbnail milestone (every 10 embeddings per canonical group)
// + ★ 学習品質ゲート / 単体高速新規の強化 / synthetic由来の学習禁止 / IIFE末尾の全角スペース除去

import {
  VERIFY_CFG, ROSTER_CFG, SAFE_MERGE_DIST, CREATE_MIN_DIST,
  setThresholds, setMaxFaces as _setMaxFaces, setAutoEnrollEnabled,
  getDB, setDB, newPersonId, listPersons, renamePerson, clearPerson as _coreClearPerson,
  addEmbToPerson, listDBNames, clearDBName, exportDB, importDB as _coreImportDB, clearDBAll as _coreClearDBAll,
  dbIsEmpty, embeddingFromLandmarks, distToConfidence,
  decideForClass, bestMatchPerClass, reidLookup, updateRecent, clearRecent,
  verifyBuf, pushVerifyVote, stableDecision,
  SYPHON_GUARD, REID,
  mirrorInvariantDistance, classStats,
  // グループ（エイリアス）
  linkPersons, unlinkPerson, listLinks, resolveCanonical, groupMembersOf,
} from './face_core.js';

import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3';

/* =======================================================================
 *  Thumbnail DB (localStorage)
 * ======================================================================= */
const THUMB_KEY   = 'face.thumbs';
const CREATE_KEY  = 'face.createdAt';

function _loadThumbDB(){ try{ return JSON.parse(localStorage.getItem(THUMB_KEY)||'{}')||{}; }catch(_){ return {}; } }
function _saveThumbDB(m){ try{ localStorage.setItem(THUMB_KEY, JSON.stringify(m)); }catch(_){} }
function _loadCreatedDB(){ try{ return JSON.parse(localStorage.getItem(CREATE_KEY)||'{}')||{}; }catch(_){ return {}; } }
function _saveCreatedDB(m){ try{ localStorage.setItem(CREATE_KEY, JSON.stringify(m)); }catch(_){} }

function pushThumb(pid, dataUrl){
  if (!pid || !dataUrl) return;
  const m = _loadThumbDB();
  const a = Array.isArray(m[pid]) ? m[pid] : [];
  // 上限8枚（写真は8枚で打ち止め）
  if (a.length >= 8) return;
  if (!a.includes(dataUrl)) {
    a.unshift(dataUrl);
    m[pid] = a;
    _saveThumbDB(m);
  }
}

function setCreatedAt(pid, ts){ if(!pid) return; const m=_loadCreatedDB(); if(!m[pid]){ m[pid]=ts||Date.now(); _saveCreatedDB(m);} }
function getThumbs(pid){ const m=_loadThumbDB(); return Array.isArray(m[pid])?m[pid]:[]; }
function getCreatedAt(pid){ const m=_loadCreatedDB(); return m[pid]||null; }

// 正方形にクロップして dataURL を返す（video用）
function _captureThumbFromVideo(video, bbox){
  try{
    const vw=video.videoWidth, vh=video.videoHeight; if(!vw||!vh) return null;
    const [x,y,w,h]=bbox||[0,0,1,1];
    const sx=Math.max(0,Math.floor(x*vw)), sy=Math.max(0,Math.floor(y*vh));
    const sw=Math.max(1,Math.floor(w*vw)), sh=Math.max(1,Math.floor(h*vh));
    const s=Math.max(sw,sh), size=96;
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    c.getContext('2d').drawImage(video, sx, sy, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', .85);
  }catch(_){ return null; }
}
// 画像から正方形にクロップ
function _captureThumbFromImage(img){
  try{
    const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height; if(!w||!h) return null;
    const s=Math.min(w,h), sx=Math.floor((w-s)/2), sy=Math.floor((h-s)/2), size=96;
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    c.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', .85);
  }catch(_){ return null; }
}

/* ---------- 10カウントごとに自動サムネ保存 ---------- */
const THUMB_EVERY = 10;      // 10埋め込みごと
const THUMB_MAX   = 24;      // 代表IDあたりの最大サムネ数（節目保存用）
function _getGroupEmbCount(repId){
  try{
    const db = getDB() || {}; const people = db.people || {};
    const members = (typeof groupMembersOf==='function') ? groupMembersOf(repId) : [repId];
    return (members||[]).reduce((sum, mid)=>{
      const embs = people?.[mid]?.embs || people?.[mid]?.embeddings || [];
      return sum + (Array.isArray(embs)?embs.length:0);
    }, 0);
  }catch(_){ return 0; }
}
function ensureThumbOnMilestone(repId, opts = {}){
  try{
    const thumbs = getThumbs(repId);
    if (thumbs.length >= THUMB_MAX) return;
    const count = _getGroupEmbCount(repId);
    const shouldHave = Math.floor(count / THUMB_EVERY);
    if (thumbs.length >= shouldHave) return;

    const video = opts.video || (window.state?.videoEl);
    if (!video || video.readyState < 2) return;
    const dataUrl = _captureThumbFromVideo(video, opts.normRect || null);
    if (!dataUrl) return;

    pushThumb(repId, dataUrl);
    try{
      window.dispatchEvent(new CustomEvent('face:onPreviewSaved', {
        detail: { personId: repId, total: thumbs.length+1, count }
      }));
    }catch(_){}
  }catch(e){ console.warn('[face_runtime] ensureThumbOnMilestone failed:', e); }
}

/* =======================================================================
 *  State
 * ======================================================================= */
export const state = {
  videoEl: null, canvasEl: null, ctx: null, stream: null, landmarker: null,
  running: false, verifying: false, lastHasFace: false, noFaceFrames: 0,
  fpsCounter: { lastT: 0, frames: 0, fps: 0 },
  fitMode: 'cover', _resizeHandler: null,
  hud: { label: null, percent: null, instantLabel: null, instantPercent: null },
  overlay: [], 
  debug: { enabled:false, panel:null, last:null, level:1 },
  controls: { bar:null, toggle:null, file:null, name:null, ghostEnrollBtn:null },
  ghostPids: new Set(), // canonicalで保持
};

/* =======================================================================
 *  Ghost
 * ======================================================================= */
const ghost = { enabled:false, imgBitmap:null, imgEl:null, emb:null, box:{ x:0.78, y:0.70, w:0.20, h:0.26 } };

let _imageLandmarker = null;
async function ensureImageLandmarker() {
  if (_imageLandmarker) return _imageLandmarker;
  const fileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
  );
  _imageLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    },
    runningMode: 'IMAGE',
    numFaces: 1,
    minFaceDetectionConfidence: 0.4,
    minFacePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  return _imageLandmarker;
}
async function _embeddingFromImageBitmap(bmp) {
  const lm = await ensureImageLandmarker();
  const res = lm.detect(bmp);
  const lms = res?.faceLandmarks?.[0];
  if (!lms) return null;
  return embeddingFromLandmarks(lms);
}
export function enableGhost(on = true) { ghost.enabled = !!on; }
export function setGhostBox(x, y, w, h) { ghost.box = { x, y, w, h }; }
export async function setGhostImage(fileOrBitmap, opts = {}) {
  try {
    let bmp = null;
    if (fileOrBitmap instanceof ImageBitmap) {
      bmp = fileOrBitmap;
    } else if (fileOrBitmap instanceof Blob) {
      bmp = await createImageBitmap(fileOrBitmap, { resizeQuality: 'high' });
      const imgURL = URL.createObjectURL(fileOrBitmap);
      const img = new Image(); img.crossOrigin='anonymous';
      await new Promise((res,rej)=>{ img.onload=()=>res(); img.onerror=rej; img.src=imgURL; });
      ghost.imgEl = img;
      setTimeout(()=>URL.revokeObjectURL(imgURL), 1000);
    } else return false;
    const emb = await _embeddingFromImageBitmap(bmp);
    if (!emb) return false;
    ghost.imgBitmap = bmp; ghost.emb = emb;
    if (typeof opts.enabled === 'boolean') ghost.enabled = !!opts.enabled;
    return true;
  } catch {
    return false;
  }
}

/* =======================================================================
 *  Debug & small helpers
 * ======================================================================= */
let _lastCreatedAtMs = 0;
let _lastForcedAutoEnrollMs = 0;
let _reidBlockUntilMs = 0;
let _lastSingleBBox = null;

const _FORCED_AUTOENROLL_INTERVAL_MS = 700;
const TRACK_CREATE_COOLDOWN_MS = 500;

const NEW_PERSON_STACK_FRAMES  = 6;
const NO_MATCH_VOTES_N         = 1;
// ★ 単体新規を立てやすく
const NOVELTY_DIST             = 0.285;
const SINGLE_CREATE_BONUS      = 0.110;
const SINGLE_REID_TIGHTEN      = 0.040;
const SINGLE_REID_MIN_VOTES    = 3;
const SINGLE_NO_MATCH_STREAK   = 1;

const MULTI_PIDTAKEN_CREATE_SEEN = 2;
const MULTI_CREATE_GAP_MS        = 300;

const SINGLE_GHOST_CREATE_STREAK = 3;
const SINGLE_GHOST_CREATE_GAP_MS = 900;

let _singleGhostActive = false;

// 小さすぎる顔は除外（誤吸着抑止）
const MIN_FACE_AREA = 0.035; // 正規化bboxの w*h

function iouRect(a, b) {
  const ax2 = a[0] + a[2], ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2], by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const uni = a[2]*a[3] + b[2]*b[3] - inter;
  return uni > 0 ? inter/uni : 0;
}

let _forceNewOnce = false;
export function forceNewOnce(){ _forceNewOnce = true; }

function dbHas(pid){ return !!getDB().people[pid]; }
function purgeTracksForMissingPids() {
  const db = getDB();
  for (const [, tr] of tracks) {
    if (tr.personId && !db.people[tr.personId]) tr.personId = null;
  }
}
function purgeAllRuntimeCaches() {
  clearRecent();
  verifyBuf.length = 0;
  _bootstrapSeenFrames = 0;
  _lastForcedAutoEnrollMs = 0;
  _lastCreatedAtMs = 0;
  state.overlay = [];
  _reidBlockUntilMs = 0;
  _lastSingleBBox = null;
}

export function enableFaceDebug(on=true, level=1){
  state.debug.enabled = !!on; state.debug.level = level|0;
  if (on) {
    if (!state.debug.panel) {
      const p = document.createElement('div');
      p.style.cssText = `position:fixed; right:12px; bottom:308px; width:280px; max-height:40vh; overflow:auto;
                         z-index:10060; background:rgba(0,0,0,.75); color:#fff; font:12px/1.45 ui-sans-serif,system-ui,-apple-system;
                         border-radius:10px; padding:10px; box-shadow:0 10px 25px rgba(0,0,0,.35); white-space:pre-wrap;`;
      p.innerHTML = '<b>Face Debug</b><div id="dbg" style="margin-top:6px;opacity:.9"></div>';
      document.body.appendChild(p); state.debug.panel = p;
    }
  } else {
    state.debug.panel?.remove(); state.debug.panel = null;
  }
  return state.debug.enabled;
}
function _dbg(info){
  state.debug.last = info;
  if (!state.debug.enabled) return;
  const el = state.debug.panel?.querySelector('#dbg');
  if (el) el.textContent = Object.entries(info).map(([k,v])=>`${k}: ${typeof v==='number'?v.toFixed?.(3)??v:v}`).join('\n');
  window.dispatchEvent(new CustomEvent('face:debug', { detail: info } ));
}

/* ★ 学習品質ゲート：小さすぎる/暗すぎる/のっぺり等は学習しない */
function _goodForLearning({bbox, video, lms}){
  try{
    if (bbox){
      const minSide = Math.max(bbox[2], bbox[3]); // 正規化
      if (minSide < 0.22) return false;
      if ((bbox[2]*bbox[3]) < MIN_FACE_AREA) return false;
    }
    if (video && video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const [x,y,w,h] = bbox || [0,0,1,1];
      const cx = Math.floor((x + w/2) * vw), cy = Math.floor((y + h/2) * vh);
      const s = 64, sx = Math.max(0, cx - (s>>1)), sy = Math.max(0, cy - (s>>1));
      const c = document.createElement('canvas'); c.width = s; c.height = s;
      const g = c.getContext('2d');
      g.drawImage(video, sx, sy, s, s, 0, 0, s, s);
      const d = g.getImageData(0,0,s,s).data;
      let sum=0; for (let i=0;i<d.length;i+=4) sum += (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114);
      const mean = sum / (s*s);
      if (mean < 42) return false;
    }
    if (lms && lms.length >= 20){
      let mx=0,my=0; for (const p of lms){ mx+=p.x; my+=p.y; }
      mx/=lms.length; my/=lms.length;
      let varsum=0; for (const p of lms){ const dx=p.x-mx, dy=p.y-my; varsum+=dx*dx+dy*dy; }
      if ((varsum / lms.length) < 1e-4) return false;
    }
    return true;
  }catch{ return true; }
}

/* =======================================================================
 *  UI (video/canvas + controls bar)
 * ======================================================================= */
function ensureUi() {
  const old = document.getElementById('facecam-wrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'facecam-wrap';
  wrap.style.cssText =
    'position:fixed; right:12px; bottom:12px; width:280px; aspect-ratio:4/3;' +
    'z-index:10050; background:#000; border-radius:12px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,.2);';

  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:absolute','top:8px','right:8px','z-index:10060',
    'background:rgba(32,32,32,.75)','backdrop-filter:blur(4px)',
    'color:#fff','font:12px/1 ui-sans-serif,system-ui,-apple-system',
    'display:flex','align-items:center','gap:6px','padding:6px 8px','border-radius:10px'
  ].join(';');

  const tog = document.createElement('input');
  tog.type = 'checkbox'; tog.id = 'ghost-toggle'; tog.checked = false;

  const togLbl = document.createElement('label');
  togLbl.htmlFor = 'ghost-toggle'; togLbl.textContent = 'ゴーストON';

  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.style.cssText = 'max-width:120px';

  const name = document.createElement('span');
  name.textContent = ''; name.style.cssText = 'max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

  const gbtn = document.createElement('button');
  gbtn.textContent = 'ゴースト登録';
  gbtn.style.cssText = 'margin-left:4px; padding:4px 8px; border-radius:8px; border:0; background:#3b82f6; color:#fff; cursor:pointer;';
  gbtn.addEventListener('click', async () => {
    const ok = await enrollGhost();
    if (!ok) window.dispatchEvent(new CustomEvent('face:onError', { detail:{ message: 'ゴースト登録に失敗（画像未設定？）' } }));
  });

  bar.appendChild(tog); bar.appendChild(togLbl); bar.appendChild(file); bar.appendChild(name); bar.appendChild(gbtn);

  tog.addEventListener('change', () => { enableGhost(tog.checked); });
  file.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    const ok = await setGhostImage(f, { enabled: true });
    if (ok) { tog.checked = true; name.textContent = f.name; }
    else { name.textContent = '(解析失敗)'; }
  });

  const v = document.createElement('video');
  v.autoplay = true; v.playsInline = true; v.muted = true;
  v.style.cssText = `
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:${state.fitMode}; display:block; transform:scaleX(-1); transform-origin:center;
  `;
  const c = document.createElement('canvas');
  c.style.cssText = `position:absolute; inset:0; width:100%; height:100%; pointer-events:none; object-fit:${state.fitMode};`;

  wrap.appendChild(v); wrap.appendChild(c); wrap.appendChild(bar);
  document.body.appendChild(wrap);

  state.videoEl = v; state.canvasEl = c; state.ctx = c.getContext('2d');
  state.controls = { bar, toggle: tog, file, name, ghostEnrollBtn: gbtn };

  const onResize = () => syncCanvasPixelSizeToCSS();
  window.addEventListener('resize', onResize);
  state._resizeHandler = onResize;
  syncCanvasPixelSizeToCSS();
}
function syncCanvasPixelSizeToCSS() {
  const c = state.canvasEl; if (!c) return;
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(rect.width  * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}
function computeDrawRect(cw, ch, vw, vh, fitMode) {
  const videoAR  = vw / vh; const canvasAR = cw / ch;
  if (fitMode === 'contain') {
    if (canvasAR > videoAR) { const drawH = ch; const drawW = Math.round(ch * videoAR); return { drawW, drawH, offX: Math.round((cw - drawW) / 2), offY: 0 }; }
    const drawW = cw; const drawH = Math.round(cw / videoAR); return { drawW, drawH, offX: 0, offY: Math.round((ch - drawH) / 2) };
  } else {
    if (canvasAR > videoAR) { const drawW = cw; const drawH = Math.round(cw / videoAR); return { drawW, drawH, offX: 0, offY: Math.round((ch - drawH) / 2) }; }
    const drawH = ch; const drawW = Math.round(ch * videoAR); return { drawW, drawH, offX: Math.round((cw - drawW) / 2), offY: 0 };
  }
}
function draw(hasFace) {
  const ctx = state.ctx, c = state.canvasEl, v = state.videoEl; if (!ctx || !c || !v) return;
  const cw = c.width, ch = c.height;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cw,ch);

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cw - 190, 8, 182, 92);
  ctx.fillStyle = '#fff';
  const dpr = Math.max(1, (window.devicePixelRatio||1));
  ctx.font = `${Math.round(12*dpr)}px ui-sans-serif, system-ui, -apple-system`;
  ctx.fillText(`FPS: ${state.fpsCounter.fps}`, cw - 182, 26*dpr/1.6);
  ctx.fillText(`Face: ${hasFace ? 'YES' : 'no'}`, cw - 182, 44*dpr/1.6);
  const label = state.hud.label ?? state.hud.instantLabel; const pct = state.hud.percent ?? state.hud.instantPercent;
  if (label && pct != null) ctx.fillText(`${label} ${pct}%`, cw - 182, 62*dpr/1.6);

  const { drawW, drawH, offX, offY } =
    computeDrawRect(cw, ch, (v.videoWidth||cw), (v.videoHeight||ch), state.fitMode);

  ctx.setTransform(-drawW, 0, 0, drawH, offX + drawW, offY);

  // ゴーストサムネ
  if (ghost.enabled && ghost.imgBitmap) {
    const { x, y, w, h } = ghost.box;
    try {
      ctx.drawImage(ghost.imgBitmap, x, y, w, h);
      ctx.lineWidth = 0.004;
      ctx.strokeStyle = 'rgba(0,180,255,.95)';
      ctx.strokeRect(x, y, w, h);
      const text = 'GHOST';
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(x, Math.max(0, y - 0.03), Math.max(0.12, 0.06 + text.length * 0.012), 0.028);
      ctx.fillStyle = '#fff';
      ctx.font = '0.018px ui-sans-serif, system-ui, -apple-system';
      ctx.fillText(text, x + 0.006, Math.max(0, y - 0.012));
    } catch {}
  }

  // オーバーレイ
  for (const item of state.overlay || []) {
    const [x,y,w,h] = item.bbox || [0,0,0,0];
    const pad=0.008;
    ctx.lineWidth=0.006; ctx.strokeStyle='rgba(255,180,0,.95)';
    ctx.strokeRect(x-pad, y-pad, w+pad*2, h+pad*2);
    const text = item.label + (item.pct!=null ? ` ${item.pct}%` : '');
    ctx.fillStyle='rgba(0,0,0,.6)';
    ctx.fillRect(x-pad, Math.max(0,y-pad-0.03), Math.max(0.12, 0.06 + text.length*0.012), 0.028);
    ctx.fillStyle='#fff';
    ctx.font = '0.018px ui-sans-serif, system-ui, -apple-system';
    ctx.fillText(text, x - pad + 0.006, Math.max(0,y - pad - 0.012));
  }

  ctx.setTransform(1,0,0,1,0,0);

  if (!hasFace) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('No face… (近づく/明るく)', 10, ch - 12);
  }
}

/* =======================================================================
 *  Camera & MediaPipe
 * ======================================================================= */
async function setupCamera() {
  ensureUi();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    window.dispatchEvent(new CustomEvent('face:onError', { detail:{ message: 'カメラの起動に失敗しました: ' + String(e) } }));
    throw e;
  }
  state.videoEl.srcObject = state.stream; await state.videoEl.play(); syncCanvasPixelSizeToCSS();
}
async function setupLandmarker() {
  if (state.landmarker) return;
  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
  );
  state.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
    runningMode: 'VIDEO',
    numFaces: ROSTER_CFG.maxFaces,
    minFaceDetectionConfidence: 0.25, minFacePresenceConfidence: 0.25, minTrackingConfidence: 0.25,
  });
}
async function applyNumFacesOption() {
  if (!state.landmarker) return;
  try { await state.landmarker.setOptions?.({ numFaces: ROSTER_CFG.maxFaces }); } catch(_) {}
}
export function setMaxFacesAndApply(n){ _setMaxFaces(n); applyNumFacesOption(); }

/* =======================================================================
 *  Tracking / Assignment
 * ======================================================================= */
const tracks = new Map(); // tid -> {...}
let _nextTrackId = 1;

function bboxFromLandmarks(lms){
  let minX= 1e9, minY= 1e9, maxX= -1e9, maxY= -1e9;
  for(const p of lms){ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
  return [minX,minY,Math.max(0,maxX-minX),Math.max(0,maxY-minY)];
}

/* ---------------- メイン割当 ---------------- */
function assignFacesGreedy(faces){
  const now = performance.now();

  // 小顔除外（実顔のみ）
  const realFaces = faces.filter(f => !f.synthetic).filter(f => (f.bbox[2]*f.bbox[3]) >= MIN_FACE_AREA);
  const realCount = realFaces.length;

  const tids = [...tracks.keys()]; const pairs = []; const usedT = new Set(), usedF = new Set();

  const cost = [];
  for (let i=0;i<tids.length;i++){
    const tr = tracks.get(tids[i]); const tb = tr.bbox || [0,0,0,0];
    for (let j=0;j<faces.length;j++){ const fb = faces[j].bbox; cost.push({ i, j, v:iouRect(tb, fb) }); }
  }
  cost.sort((a,b)=>b.v-a.v);
  for(const e of cost){
    if(usedT.has(e.i)||usedF.has(e.j)) continue;
    if(e.v < 0.02) continue;
    usedT.add(e.i); usedF.add(e.j);
    pairs.push([faces[e.j], tids[e.i]]);
  }

  for(let j=0;j<faces.length;j++){
    if(usedF.has(j)) continue;
    const f=faces[j];
    if (f.synthetic) continue;
    if ((f.bbox[2]*f.bbox[3]) < MIN_FACE_AREA) continue; // 小顔無視
    const tid=_nextTrackId++;
    tracks.set(tid, { personId:null, lastSeen:now, lastEmb:f.emb, bbox:f.bbox, seenCount:1, noMatchVotes:1, _prevPid:null, _noMatchStreak:0, _embStack:[], lastCreateAt:0, _lowConfStreak:0 });
    pairs.push([f, tid]);
  }

  for (const [f,tid] of pairs){
    const tr = tracks.get(tid);
    tr._prevPid = tr.personId || null;
    tr.personId = null;
    tr.lastSeen = now; tr.lastEmb = f.emb; tr.bbox = f.bbox; tr.seenCount = (tr.seenCount||0)+1;
  }

  // Presence gate（単体時のReID抑制）
  if (realCount === 1) {
    const cur = pairs.map(p=>p[0]).find(ff => !ff.synthetic && (ff.bbox[2]*ff.bbox[3])>=MIN_FACE_AREA);
    const curB = cur?.bbox;
    _lastSingleBBox = curB || _lastSingleBBox;
    if (curB && _lastSingleBBox) {
      const prevB = _lastSingleBBox;
      const ax2=prevB[0]+prevB[2], ay2=prevB[1]+prevB[3];
      const bx2=curB[0]+curB[2],  by2=curB[1]+curB[3];
      const ix=Math.max(0, Math.min(ax2,bx2)-Math.max(prevB[0],curB[0]));
      const iy=Math.max(0, Math.min(ay2,by2)-Math.max(Math.min(prevB[1],curB[1]), Math.min(prevB[1],curB[1])));
      const inter=ix*iy, uni=prevB[2]*prevB[3]+curB[2]*curB[3]-inter;
      const ov = uni>0 ? inter/uni : 0;
      const area = (b)=>Math.max(1e-6, b[2]*b[3]);
      const ar   = area(curB)/area(prevB);
      if (ov < 0.08 || ar < 0.50 || ar > 2.00) {
        _reidBlockUntilMs = now + 1800;
        clearRecent();
      }
    }
  } else {
    _lastSingleBBox = null;
  }

  const reidDistBackup = REID.dist;
  const reidVotesBackup = REID.minVotes;
  if (realCount === 1) {
    REID.dist = Math.max(0, REID.dist - SINGLE_REID_TIGHTEN);
    REID.minVotes = SINGLE_REID_MIN_VOTES;
  }

  // synthetic（ゴースト）にもwishを作る（学習は禁止）
  const wishes = [];
  for (const [f, tid] of pairs){
    const dec = decideForClass(f.emb);
    let wishPid = null, wishDist = null, secondPid = null, secondDist = null;
    const singleMode = (realCount === 1);

    const createMinDistEffBase = (CREATE_MIN_DIST - SINGLE_CREATE_BONUS);
    let createMinDistEff = singleMode
      ? Math.max(SAFE_MERGE_DIST + 0.01, createMinDistEffBase - 0.015)
      : CREATE_MIN_DIST;

    if (dec) {
      if (dec.confidentSame || dec.weakSame) {
        wishPid = dec.best.id; wishDist = dec.best.dist;
      } else {
        let allowReid = true;
        if (singleMode && (performance.now() < _reidBlockUntilMs)) allowReid = false;
        if (singleMode && _singleGhostActive) allowReid = false;
        if (allowReid) {
          const re = reidLookup(f.emb, now);
          if (re?.pid) { wishPid = re.pid; wishDist = re.dist; }
        }
      }
      secondPid = dec?.second?.id ?? null;
      secondDist = dec?.second?.dist ?? null;
      _dbg({ phase:'wish', faces:realCount, single:singleMode?1:0,
             best: dec?.best?.dist ?? null, bestPid: wishPid || null,
             second: secondDist ?? null, margin: dec?.margin,
             createEff: createMinDistEff, syn:f.synthetic?1:0 });
    } else {
      _dbg({ phase:'wish-none', syn:f.synthetic?1:0 });
    }

    wishPid = wishPid ? resolveCanonical(wishPid) : null;
    secondPid = secondPid ? resolveCanonical(secondPid) : null;

    wishes.push({ tid, f, isSynth: !!f.synthetic, dec, wishPid, wishDist, secondPid, secondDist, createMinDistEff });
  }

  if (realCount === 1) { REID.dist = reidDistBackup; REID.minVotes = reidVotesBackup; }

  const claim = new Map();
  const losers = [];
  for (const w of wishes){
    if (w.f.synthetic) { losers.push(w); continue; }
    if (!w.wishPid) { losers.push(w); continue; }
    const cur = claim.get(w.wishPid);
    if (cur || !dbHas(w.wishPid)) {
      if (!cur) losers.push(w);
      else if (w.wishDist < cur.dist) { losers.push({ ...wishes.find(x=>x.tid===cur.tid) }); claim.set(w.wishPid, { tid: w.tid, dist: w.wishDist }); }
      else { losers.push(w); }
    } else {
      claim.set(w.wishPid, { tid: w.tid, dist: w.wishDist });
    }
  }

  // 勝者：学習 & recent（★ syntheticは学習禁止 / 品質ゲート適用 / 10カウント節目サムネ）
  for (const [rid, info] of claim){
    const tr = tracks.get(info.tid); if(!tr) continue;
    const wish = wishes.find(w => w.tid === info.tid);

    if(!dbHas(rid)) { tr.personId = null; continue; }
    tr.personId = rid;

    const stats = classStats(rid);
    const cen = stats?.centroid || null;
    const dMI = (cen ? mirrorInvariantDistance(tr.lastEmb, cen) : info.dist);

    const allowLearn =
      (!!wish?.dec?.confidentSame &&
        ((wish?.dec?.margin ?? 0) >= (VERIFY_CFG.marginMin + 0.04))) ||
      ((stats?.count ?? 0) >= (SYPHON_GUARD.minSamples || 0) &&
        (wish?.dec?.confidentSame));

    if (!wish?.isSynth && allowLearn && !state.ghostPids.has(rid) &&
        _goodForLearning({bbox: tr.bbox, video: state.videoEl, lms: null})) {
      addEmbToPerson(rid, tr.lastEmb);
      updateRecent(rid);
      ensureThumbOnMilestone(rid, { video: state.videoEl, normRect: tr.bbox });
    }

    if (dMI > 0.310) { _reidBlockUntilMs = performance.now() + 1400; }

    tr.noMatchVotes=0;
    tr._noMatchStreak = 0;

    for (const [otid, otr] of tracks) { if (otid !== info.tid && otr.personId === rid) { otr.personId = null; } }
  }

  // 敗者/未希望 → 新規作成（syntheticは新規を作らない）
  for (const w of losers){
    const tr = tracks.get(w.tid); if(!tr) continue;
    if (w.f.synthetic) { tr.personId = tr.personId || null; continue; }
    if (tr._prevPid) tr._prevPid = null;

    const now2 = performance.now();
    const singleMode = (realCount === 1);
    const createMinDistEff = w.createMinDistEff;

    const pidTaken = !!(w.dec?.best?.id && claim.has(resolveCanonical(w.dec.best.id)));

    const farEnough =
      !w.dec?.best?.id ||
      (w.dec?.best?.dist ?? 1e9) >= createMinDistEff ||
      (w.dec?.best?.dist ?? 0) > SAFE_MERGE_DIST + 0.01;

    const noveltyOverride = (
      ((w.dec?.best?.dist ?? 1e9) >= NOVELTY_DIST) &&
      ((w.dec?.margin ?? 1e9) < (singleMode ? 0.05 : 0.02))
    );

    tr.noMatchVotes = (tr.noMatchVotes||0) + 1;
    tr._noMatchStreak = (tr._noMatchStreak || 0) + 1;

    // ★ 低信頼ストリーク → 新規許可フォース
    let lowConfForce = false;
    if (w.dec?.best?.id) {
      const bestDist = w.dec.best.dist ?? 1e9;
      const secondDist = w.secondDist ?? (w.dec?.second?.dist ?? 1e9);
      const margin = (secondDist - bestDist);
      const confApprox = 1 - Math.min(1, Math.max(0, bestDist)); // 簡易近似
      if (confApprox < 0.82 && margin < 0.02) tr._lowConfStreak = (tr._lowConfStreak||0) + 1;
      else tr._lowConfStreak = 0;
      if (tr._lowConfStreak >= 12) lowConfForce = true; // 約0.4〜0.6秒
    } else {
      tr._lowConfStreak = (tr._lowConfStreak||0) + 1;
      if (tr._lowConfStreak >= 8) lowConfForce = true;
    }

    const multiPidTakenFastPath = (!singleMode) && pidTaken && (tr.seenCount >= MULTI_PIDTAKEN_CREATE_SEEN);
    const singleGhostFastCreate = (singleMode && _singleGhostActive && (tr._noMatchStreak >= SINGLE_GHOST_CREATE_STREAK));

    const trackCooldownOk  = (now2 - (tr.lastCreateAt || 0)) > TRACK_CREATE_COOLDOWN_MS;
    const globalCooldownOk = (now2 - _lastCreatedAtMs) > ( singleMode ? SINGLE_GHOST_CREATE_GAP_MS : MULTI_CREATE_GAP_MS );
    const singleStreakOk   = singleMode && (tr._noMatchStreak >= SINGLE_NO_MATCH_STREAK);

    if (ROSTER_CFG.autoEnroll &&
        tr.seenCount >= Math.min(ROSTER_CFG.minSeenFramesForCreate, MULTI_PIDTAKEN_CREATE_SEEN) &&
        tr.noMatchVotes >= NO_MATCH_VOTES_N &&
        ( singleGhostFastCreate || multiPidTakenFastPath || farEnough || noveltyOverride || pidTaken || singleStreakOk || _forceNewOnce || lowConfForce ) &&
        trackCooldownOk && globalCooldownOk) {

      const newPid = newPersonId();
      const stack = (tr._embStack || []).slice(-NEW_PERSON_STACK_FRAMES);
      const base  = w.f.emb;
      let avg = base.slice();
      if (stack.length) {
        for (const e of stack) for (let i=0;i<avg.length;i++) avg[i] += e[i];
        for (let i=0;i<avg.length;i++) avg[i] /= (stack.length+1);
      }
      addEmbToPerson(newPid, avg);
      const rid = resolveCanonical(newPid);
      tr.personId = rid;
      _lastCreatedAtMs = now2;
      tr.lastCreateAt  = now2;
      tr._noMatchStreak = 0;
      tr._lowConfStreak = 0;
      updateRecent(rid);

      // サムネ保存（この瞬間の顔）＋イベント
      setCreatedAt(rid, Date.now());
      const thumb = _captureThumbFromVideo(state.videoEl, w.f.bbox);
      if (thumb) { pushThumb(rid, thumb); window.dispatchEvent(new CustomEvent('face:onPreviewSaved', { detail:{ id: rid } })); }

      window.dispatchEvent(new CustomEvent('face:onAutoEnroll',{ detail:{ id:rid } }));
      tr.noMatchVotes = 0;
      _forceNewOnce = false;
      claim.set(rid, { tid: w.tid, dist: 0 });
    } else {
      tr._embStack = (tr._embStack || []);
      tr._embStack.push(w.f.emb);
      if (tr._embStack.length > 16) tr._embStack.shift();
    }
  }

  // roster
  const db=getDB(); const overlay=[]; const roster=[];
  for(const [tid,tr] of tracks){
    if (tr.personId && !db.people[tr.personId]) tr.personId = null;
    const p=db.people[tr.personId||'']||null;

    let pct=null;
    if(tr.lastEmb && tr.personId){
      const stats = classStats(tr.personId);
      const cen = stats?.centroid || null;
      const dMI = cen ? mirrorInvariantDistance(tr.lastEmb, cen)
                      : (bestMatchPerClass(tr.lastEmb).best?.dist ?? 1);
      pct = Math.round(distToConfidence(dMI)*100);
    }

    roster.push({ trackId: tid, personId: tr.personId, name: p?.name || null, confidencePercent: pct, bbox: tr.bbox });

    const label = tr.personId ? ((p?.name && p.name.trim()) ? `${p.name}` : `${tr.personId}`) : '未割当';
    overlay.push({ bbox: tr.bbox, label, pct });
  }
  state.overlay = overlay;
  window.dispatchEvent(new CustomEvent('face:onRoster',{ detail:{ roster } }));
}

/* =======================================================================
 *  Main loop
 * ======================================================================= */
let _bootstrapSeenFrames = 0;

export function tick() {
  if (!state.running) return;
  try {
    if (state.videoEl.readyState >= 2) {
      syncCanvasPixelSizeToCSS();
      const now = performance.now();
      const res = state.landmarker.detectForVideo(state.videoEl, now);

      const lmsArr = res?.faceLandmarks || [];
      const hasFace = lmsArr.length > 0;

      const fc = state.fpsCounter; if (!fc.lastT) fc.lastT = now; fc.frames++; if (now - fc.lastT >= 1000) { fc.fps = fc.frames; fc.frames = 0; fc.lastT = now; }

      if (hasFace !== state.lastHasFace) { window.dispatchEvent(new CustomEvent('face:onResult', { detail: { hasFace } })); state.lastHasFace = hasFace; }
      state.noFaceFrames = hasFace ? 0 : state.noFaceFrames+1;

      if (hasFace) {
        const faces = [];
        for (const lms of lmsArr) { const emb  = embeddingFromLandmarks(lms); faces.push({ lms, emb, bbox: bboxFromLandmarks(lms), synthetic: false }); }

        // DB空の初回自動登録
        if (ROSTER_CFG.autoEnroll && dbIsEmpty()) {
          _bootstrapSeenFrames++;
          if (_bootstrapSeenFrames >= Math.max(1, ROSTER_CFG.minSeenFramesForCreate)) {
            for (const f of faces) {
              const pid=newPersonId();
              if (_goodForLearning({bbox: f.bbox, video: state.videoEl, lms: f.lms})) {
                addEmbToPerson(pid, f.emb);
              }
              const rid = resolveCanonical(pid);
              updateRecent(rid);
              setCreatedAt(rid, Date.now());
              const thumb = _captureThumbFromVideo(state.videoEl, f.bbox);
              if (thumb) { pushThumb(rid, thumb); window.dispatchEvent(new CustomEvent('face:onPreviewSaved', { detail:{ id: rid } })); }
              window.dispatchEvent(new CustomEvent('face:onAutoEnroll',{ detail:{ id:rid } }));
            }
            _bootstrapSeenFrames = 0;
          }
        } else { _bootstrapSeenFrames = 0; }

        // 定期“安全学習” + 10カウント節目サムネ（★ 品質ゲート & ゴースト代表IDは除外）
        if (ROSTER_CFG.autoEnroll && (now - _lastForcedAutoEnrollMs) > _FORCED_AUTOENROLL_INTERVAL_MS) {
          for (const f of faces) {
            const m = bestMatchPerClass(f.emb);
            const ridCand = m.best?.id ? resolveCanonical(m.best.id) : null;
            if (ridCand && !state.ghostPids.has(ridCand) && _goodForLearning({bbox: f.bbox, video: state.videoEl, lms: f.lms})) {
              addEmbToPerson(ridCand, f.emb);
              updateRecent(ridCand);
              ensureThumbOnMilestone(ridCand, { video: state.videoEl, normRect: f.bbox });
            }
          }
          _lastForcedAutoEnrollMs = now;
        }

        // 単体ならゴースト注入
        const realCount = faces.filter(ff=>!ff.synthetic).length;
        const canInjectGhost = ghost.enabled && ghost.emb && ghost.imgBitmap;
        _singleGhostActive = false;
        if (canInjectGhost && realCount === 1) {
          const gb = ghost.box;
          faces.push({ lms:null, emb:ghost.emb, bbox:[gb.x,gb.y,gb.w,gb.h], synthetic:true });
          _singleGhostActive = true;
        }

        if (faces.length) assignFacesGreedy(faces);

        // 照合テストHUD
        if (state.verifying) {
          const f0 = (faces.find(ff => !ff.synthetic) || faces[0]) ?? null;
          const emb = f0 ? f0.emb : (ghost.enabled && ghost.emb ? ghost.emb : null);
          if (!emb) {
            pushVerifyVote(null, null);
            state.hud.instantLabel = null; state.hud.instantPercent = null;
            state.hud.label = null; state.hud.percent = null;
          } else {
            const m = bestMatchPerClass(emb);
            if (!m.best.id) {
              pushVerifyVote(null, null);
              state.hud.instantLabel = null; state.hud.instantPercent = null;
              state.hud.label = null; state.hud.percent = null;
            } else {
              const rid = resolveCanonical(m.best.id);
              const stats = classStats(rid);
              const cen = stats?.centroid || null;
              const dMI = cen ? mirrorInvariantDistance(emb, cen) : m.best.dist;
              const conf = distToConfidence(dMI);

              const labelNow = (getDB().people[rid]?.name || rid);
              state.hud.instantLabel = labelNow;
              state.hud.instantPercent = Math.round(conf * 100);

              pushVerifyVote(rid, dMI);
              const stable = stableDecision();
              const stableLabel = stable.pid ? (getDB().people[stable.pid]?.name || stable.pid) : null;
              state.hud.label = stableLabel || null; state.hud.percent = stable.confPct || null;

              window.dispatchEvent(new CustomEvent('face:onResult', {
                detail: {
                  hasFace: !!f0,
                  matchName: stableLabel || null,
                  distance:  dMI,
                  stableConfidencePercent: stable.confPct || null,
                  candidateName: labelNow,
                  confidencePercent: Math.round(conf * 100),
                  bestDist: dMI,
                  secondDist: m.second?.dist ?? null,
                }
              }));
            }
          }
        } else {
          state.hud.label = null; state.hud.percent = null;
          state.hud.instantLabel = null; state.hud.instantPercent = null;
        }

        draw(true);

      } else {
        // 実顔ゼロ：ゴーストのみHUD/roster
        if (ghost.enabled && ghost.emb) {
          const m = bestMatchPerClass(ghost.emb);
          if (m.best.id) {
            const rid = resolveCanonical(m.best.id);
            const stats = classStats(rid);
            const cen = stats?.centroid || null;
            const dMI = cen ? mirrorInvariantDistance(ghost.emb, cen) : m.best.dist;
            const conf = distToConfidence(dMI);
            const labelNow = (getDB().people[rid]?.name || rid);

            if (state.verifying) {
              state.hud.instantLabel = labelNow;
              state.hud.instantPercent = Math.round(conf * 100);
              pushVerifyVote(rid, dMI);
              const stable = stableDecision();
              const stableLabel = stable.pid ? (getDB().people[stable.pid]?.name || stable.pid) : null;
              state.hud.label = stableLabel || null; state.hud.percent = stable.confPct || null;
            } else {
              state.hud.instantLabel = labelNow;
              state.hud.instantPercent = Math.round(conf * 100);
              state.hud.label = labelNow; state.hud.percent = Math.round(conf * 100);
            }

            const db = getDB(); const p = db.people[rid] || null; const gb = ghost.box; const pct = Math.round(conf*100);
            const roster = [{ trackId:-1, personId:rid, name:p?.name||null, confidencePercent:pct, bbox:[gb.x,gb.y,gb.w,gb.h] }];
            state.overlay = [{ bbox:[gb.x, gb.y, gb.w, gb.h], label:(p?.name || rid), pct }];
            window.dispatchEvent(new CustomEvent('face:onRoster',{ detail:{ roster } }));
          } else {
            state.hud.label = null; state.hud.percent = null;
            state.hud.instantLabel = null; state.hud.instantPercent = null;
            state.overlay = [];
            window.dispatchEvent(new CustomEvent('face:onRoster',{ detail:{ roster: [] } }));
          }
        } else {
          state.hud.label = null; state.hud.percent = null;
          state.hud.instantLabel = null; state.hud.instantPercent = null;
          state.overlay = [];
          window.dispatchEvent(new CustomEvent('face:onRoster',{ detail:{ roster: [] } }));
        }

        draw(false);

        if (state.noFaceFrames === 5) { clearRecent(); _reidBlockUntilMs = performance.now() + 1200; }
      }
    }
  } catch (e) {
    window.dispatchEvent(new CustomEvent('face:onError', { detail:{ message: 'detect で例外: ' + String(e) } }));
  }
  requestAnimationFrame(tick);
}

/* =======================================================================
 *  Public API
 * ======================================================================= */
export async function initFaceModule(opts = {}) {
  if (opts.fitMode === 'contain' || opts.fitMode === 'cover') state.fitMode = opts.fitMode;
  if (typeof opts.maxFaces === 'number') setMaxFacesAndApply(opts.maxFaces);
  if (typeof opts.autoEnroll === 'boolean') setAutoEnrollEnabled(opts.autoEnroll);
  if (opts.thresholds) setThresholds(opts.thresholds);
}
export async function startFaceCamera() {
  if (state.running) return true;
  await setupCamera(); await setupLandmarker(); await applyNumFacesOption();
  state.running = true; state.verifying = false; state.lastHasFace = false; state.noFaceFrames = 0;
  state.fpsCounter = { lastT: 0, frames: 0, fps: 0 }; verifyBuf.length = 0;
  state.hud = { label:null, percent:null, instantLabel:null, instantPercent:null };
  state.overlay = [];
  _lastForcedAutoEnrollMs = 0; _lastCreatedAtMs = 0; _bootstrapSeenFrames = 0;
  requestAnimationFrame(tick); return true;
}
export async function stopFaceCamera() {
  state.running = false; state.verifying = false; state.lastHasFace = false;
  try { if (state.stream) { for (const tr of state.stream.getTracks()) tr.stop(); } } catch(_) {}
  state.stream = null;
  const wrap = document.getElementById('facecam-wrap'); if (wrap) wrap.remove();
  if (state._resizeHandler) { window.removeEventListener('resize', state._resizeHandler); state._resizeHandler = null; }
  state.videoEl = null; state.canvasEl = null; state.ctx = null;
  tracks.clear(); purgeAllRuntimeCaches();
  return true;
}

export async function enrollGhost(nameOpt) {
  if (!ghost.enabled || !ghost.emb) return false;
  const db = getDB();
  const pid = newPersonId();
  if (typeof nameOpt === 'string' && nameOpt.trim()) renamePerson(pid, nameOpt.trim());
  const copies = 80;
  for (let i=0;i<copies;i++) addEmbToPerson(pid, ghost.emb);
  state.ghostPids.add(resolveCanonical(pid));
  updateRecent(pid);
  const rid = resolveCanonical(pid);

  // サムネ（ゴースト画像ベース）＋イベント
  setCreatedAt(rid, Date.now());
  let thumb = null;
  if (ghost.imgEl) thumb = _captureThumbFromImage(ghost.imgEl);
  if (!thumb && ghost.imgBitmap) {
    const c=document.createElement('canvas'); c.width=ghost.imgBitmap.width; c.height=ghost.imgBitmap.height;
    c.getContext('2d').drawImage(ghost.imgBitmap,0,0);
    thumb=c.toDataURL('image/jpeg', .85);
  }
  if (thumb) { pushThumb(rid, thumb); window.dispatchEvent(new CustomEvent('face:onPreviewSaved', { detail:{ id: rid } })); }

  window.dispatchEvent(new CustomEvent('face:onEnroll', { detail:{ ok:true, name: db.people[rid]?.name || rid, samples: copies } }));
  return true;
}

export async function enrollFace(name) {
  if (!state.running) {
    if (ghost.enabled && ghost.emb) return enrollGhost(name);
    return { ok:false, reason:'not_running' };
  }
  name = (name||'').trim();

  const db=getDB(); const pid = newPersonId();
  if (name) renamePerson(pid, name);

  const start = performance.now(); const durationMs = 1200, target = 20; let kept = 0;
  while (performance.now() - start < durationMs && kept < target){
    const res = state.landmarker?.detectForVideo?.(state.videoEl, performance.now());
    const lms = res?.faceLandmarks?.[0];

    if (lms) {
      if (_goodForLearning({bbox: bboxFromLandmarks(lms), video: state.videoEl, lms})) {
        addEmbToPerson(pid, embeddingFromLandmarks(lms)); kept++;
        ensureThumbOnMilestone(resolveCanonical(pid), { video: state.videoEl });
      }
    } else if (ghost.enabled && ghost.emb) {
      addEmbToPerson(pid, ghost.emb); kept++;
      ensureThumbOnMilestone(resolveCanonical(pid), { video: state.videoEl });
    }
    await new Promise(r => setTimeout(r, 30));
  }
  if (kept === 0 && ghost.enabled && ghost.emb) {
    for (let i=0;i<80;i++) addEmbToPerson(pid, ghost.emb);
    kept = 80;
    state.ghostPids.add(resolveCanonical(pid));
  }

  const rid = resolveCanonical(pid);
  updateRecent(rid);

  // サムネ保存（ビデオ or ゴースト）＋イベント
  setCreatedAt(rid, Date.now());
  let thumb = null;
  if (state.videoEl && state.videoEl.readyState >= 2) {
    const bbox = [0.38, 0.22, 0.24, 0.24]; // 近似
    thumb = _captureThumbFromVideo(state.videoEl, bbox);
  }
  if (!thumb && ghost.enabled && (ghost.imgEl || ghost.imgBitmap)) {
    if (ghost.imgEl) thumb = _captureThumbFromImage(ghost.imgEl);
    else {
      const c=document.createElement('canvas'); c.width=ghost.imgBitmap.width; c.height=ghost.imgBitmap.height;
      c.getContext('2d').drawImage(ghost.imgBitmap,0,0);
      thumb=c.toDataURL('image/jpeg', .85);
    }
  }
  if (thumb) { pushThumb(rid, thumb); window.dispatchEvent(new CustomEvent('face:onPreviewSaved', { detail:{ id: rid } })); }

  window.dispatchEvent(new CustomEvent('face:onEnroll', { detail:{ ok: kept>0, name: (db.people[rid]?.name || rid), samples: kept } }));
  return { ok: kept>0, samples: kept };
}

export function startVerify(){ state.verifying = true; verifyBuf.length = 0; state.hud = { label:null, percent:null, instantLabel:null, instantPercent:null }; return true; }
export function stopVerify(){ state.verifying = false; verifyBuf.length = 0; state.hud = { label:null, percent:null, instantLabel:null, instantPercent:null }; return true; }

/* =======================================================================
 *  DB helper wrappers
 * ======================================================================= */
export function clearPerson(id){
  const ok = _coreClearPerson(id);
  if (ok) {
    for (const [, tr] of tracks) if (tr.personId === id) tr.personId = null;
    state.ghostPids.delete(resolveCanonical(id));
    purgeAllRuntimeCaches();
    window.dispatchEvent(new CustomEvent('face:onRoster', { detail:{ roster: [] } }));
  }
  return ok;
}
export function clearDBAll(){
  const ok = _coreClearDBAll();
  tracks.clear();
  state.ghostPids.clear();
  purgeAllRuntimeCaches();
  window.dispatchEvent(new CustomEvent('face:onRoster', { detail:{ roster: [] } }));
  return ok;
}
export function importDB(json){
  const ok = _coreImportDB(json);
  purgeTracksForMissingPids();
  state.ghostPids.clear();
  purgeAllRuntimeCaches();
  return ok;
}

export {
  listPersons, renamePerson,
  listDBNames as listEnrollments, clearDBName, exportDB,
  setThresholds, setMaxFacesAndApply as setMaxFacesConfig, setAutoEnrollEnabled,
  linkPersons, unlinkPerson, listLinks, resolveCanonical, groupMembersOf,
};

/* =======================================================================
 *  Window Bridge（公開API） — 合体版
 * ======================================================================= */
(function registerWindowBridge(){
  if (typeof window === 'undefined') return;
  if (window.__faceRuntimeBridgeRegistered) return;
  window.__faceRuntimeBridgeRegistered = true;

  const w = window;
  const expose = (name, fn, {returns=null} = {}) => {
    if (typeof fn === 'function') w[name] = fn;
    else { w[name] = function(){ console.warn(`[face_runtime] ${name} is not available`); return returns; }; }
  };

  // 基本操作
  expose('initFaceModule', initFaceModule);
  expose('startFaceCamera', startFaceCamera);
  expose('stopFaceCamera',  stopFaceCamera);
  expose('startVerify',     startVerify);
  expose('stopVerify',      stopVerify);
  expose('enrollFace',      enrollFace);
  expose('enrollGhost',     enrollGhost);

  // ゴースト
  expose('enableGhost',  enableGhost);
  expose('setGhostImage',setGhostImage);
  expose('setGhostBox',  setGhostBox);

  // デバッグ
  expose('enableFaceDebug', enableFaceDebug);
  expose('forceNewOnce',    forceNewOnce);

  // DB
  expose('clearPerson', clearPerson);
  expose('clearDBAll',  clearDBAll);
  expose('importDB',    importDB);
  expose('listPersons', listPersons);
  expose('renamePerson',renamePerson);
  expose('listEnrollments', (typeof listDBNames==='function') ? listDBNames : null, {returns: []});
  expose('clearDBName', clearDBName);
  expose('exportDB',    exportDB);

  // しきい値/人数/自動登録
  expose('setThresholds', setThresholds);
  expose('setMaxFacesConfig', (typeof setMaxFacesAndApply!=='undefined') ? setMaxFacesAndApply : (typeof setMaxFaces!=='undefined' ? setMaxFaces : null));
  expose('setAutoEnrollEnabled', setAutoEnrollEnabled);

  // 代表IDベースの詳細一覧
  expose('listPersonsDetail', (function(){
    const HAS = (f)=>typeof f==='function';
    const canRep = HAS(resolveCanonical) && HAS(groupMembersOf);
    if (!HAS(getDB)) return null;

    return function listPersonsDetail(){
      try{
        const db = getDB() || {}; const people = db.people || {}; const out = [];
        if (canRep) {
          const reps = [];
          for (const id of Object.keys(people)) if (resolveCanonical(id) === id) reps.push(id);
          for (const rid of reps) {
            const members = (groupMembersOf(rid) || []).filter(Boolean);
            const count = members.reduce((sum, mid)=>{
              const embs = people?.[mid]?.embs || people?.[mid]?.embeddings || [];
              return sum + (Array.isArray(embs)?embs.length:0);
            }, 0);
            const name = people?.[rid]?.name ?? null;
            const createdAt = (typeof getCreatedAt==='function') ? (getCreatedAt(rid) ?? people?.[rid]?.createdAt ?? null)
                                                                 : (people?.[rid]?.createdAt ?? null);
            const thumbs = (typeof getThumbs==='function') ? (getThumbs(rid) || []) : [];
            out.push({ id: rid, name, count, createdAt, thumbs, members });
          }
        } else {
          for (const id of Object.keys(people)) {
            const p = people[id] || {};
            const embs = p.embs || p.embeddings || [];
            const count = Array.isArray(embs) ? embs.length : 0;
            const createdAt = (typeof getCreatedAt==='function') ? (getCreatedAt(id) ?? p.createdAt ?? null) : (p.createdAt ?? null);
            const thumbs = (typeof getThumbs==='function') ? (getThumbs(id) || []) : [];
            out.push({ id, name:(p.name ?? null), count, createdAt, thumbs, members:[id] });
          }
        }
        return out;
      }catch(e){ console.warn('[face_runtime] listPersonsDetail failed:', e); return []; }
    };
  })(), {returns: []});

  // サムネ取得
  expose('getPersonThumbs', (function(){
    if (typeof getThumbs !== 'function') return null;
    return function getPersonThumbs(pid){ try{ return getThumbs(pid)||[]; }catch(e){ return []; } };
  })(), {returns: []});

  // 便利UI
  expose('chooseGhostImage', function(){ try{ window.state?.controls?.file?.click?.(); }catch(_){} });
  expose('setGhostEnabled',  function(on){ try{ enableGhost(!!on); if(window.state?.controls?.toggle) window.state.controls.toggle.checked=!!on; }catch(_){} });

  try { window.dispatchEvent(new CustomEvent('face:moduleReady')); } catch(_) {}
})();
