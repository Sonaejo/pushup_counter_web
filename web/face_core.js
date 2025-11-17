// face_core.js — vGutsy-SoloFirst (maxEmbPerUser = 80) + Alias Linking
// MediaPipe-free core: DB・埋め込み・距離・しきい値・クラス判定・ReID（セントロイド主導）

/* ======================= Config ======================= */
export const VERIFY_CFG = {
  distAccept: 0.275,
  distReject: 0.300,
  marginMin:  0.060,
  centroidK:  1.0,
  window: 8,
  needAgree: 5,
  maxEmbPerUser: 80,
  minConfidence: 0.50,
};

// “吸い込み”抑止・新規作成の閾値
export let SAFE_MERGE_DIST = 0.245;
export let CREATE_MIN_DIST = 0.325;

// ランタイム側で参照されるロスター関連設定
export const ROSTER_CFG = {
  reidWindow: 8,
  forgetMs:  4500,
  maxFaces:  3,
  autoEnroll: true,
  minSeenFramesForCreate: 3,
};

// Re-ID（短期復帰）
export const REID = {
  horizonMs: 15000,
  dist: 0.290,
  minVotes: 1,
};

// 少サンプル時の“吸い込み”防止
export const SYPHON_GUARD = {
  minSamples: 10,
  extraMargin: 0.05,
  extraTighten: 0.03,
};

export function setThresholds(opts = {}) {
  if (typeof opts.distAccept === 'number') VERIFY_CFG.distAccept = opts.distAccept;
  if (typeof opts.distReject === 'number') VERIFY_CFG.distReject = opts.distReject;
  if (typeof opts.marginMin  === 'number') VERIFY_CFG.marginMin  = opts.marginMin;
  if (typeof opts.centroidK  === 'number') VERIFY_CFG.centroidK  = opts.centroidK;
  if (typeof opts.window     === 'number') VERIFY_CFG.window     = Math.max(3, opts.window|0);
  if (typeof opts.needAgree  === 'number') VERIFY_CFG.needAgree  = Math.max(1, opts.needAgree|0);
  if (typeof opts.maxEmbPerUser === 'number') VERIFY_CFG.maxEmbPerUser = Math.max(1, opts.maxEmbPerUser|0);
  if (typeof opts.minConfidence === 'number') VERIFY_CFG.minConfidence = Math.max(0, Math.min(1, opts.minConfidence));
  if (typeof opts.minSeenFramesForCreate === 'number') ROSTER_CFG.minSeenFramesForCreate = Math.max(1, opts.minSeenFramesForCreate|0);
  if (typeof opts.safeMergeDist === 'number') SAFE_MERGE_DIST = opts.safeMergeDist;
  if (typeof opts.createMinDist === 'number') CREATE_MIN_DIST = opts.createMinDist;
}
export function setMaxFaces(n){ ROSTER_CFG.maxFaces = Math.max(1, Math.min(8, n|0)); }
export function setAutoEnrollEnabled(b){ ROSTER_CFG.autoEnroll = !!b; }

/* ======================= DB v3 (+aliases) ======================= */
const STORAGE_KEY_V2 = 'face_enrollments_v2';
const STORAGE_KEY_V3 = 'face_people_v3'; // { v, people:{P#:{name,embs[],createdAt}}, nextId, aliases:{ pid -> canonicalPid } }

function _emptyDBv3(){ return { v:3, people:{}, nextId:1, aliases:{} }; }
function _migrateV2toV3(){
  if (localStorage.getItem(STORAGE_KEY_V3)) return;
  const raw = localStorage.getItem(STORAGE_KEY_V2);
  if (!raw) { localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(_emptyDBv3())); return; }
  try {
    const v2 = JSON.parse(raw);
    const v3 = _emptyDBv3();
    let nid = 1;
    for (const name of Object.keys(v2?.people || {})) {
      const pid = `P${nid++}`;
      v3.people[pid] = { name, embs: v2.people[name].embs || [], createdAt: Date.now() };
    }
    v3.nextId = nid;
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(v3));
  } catch {
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(_emptyDBv3()));
  }
}
export function getDB(){
  _migrateV2toV3();
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_V3) || '') || _emptyDBv3(); }
  catch { return _emptyDBv3(); }
}
export function setDB(db){ localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(db)); }
export function newPersonId(){
  const db=getDB(); const pid=`P${db.nextId++}`; setDB(db); return pid;
}

/* ---------- Alias / Grouping ---------- */
export function resolveCanonical(pid){
  const db=getDB(); if (!pid) return null;
  const seen = new Set(); let cur = pid;
  while (db.aliases && db.aliases[cur]) {
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = db.aliases[cur];
  }
  return cur;
}
export function listLinks(){
  const db=getDB();
  return Object.entries(db.aliases || {});
}
export function linkPersons(a,b){
  const db=getDB(); if(!db.people[a] || !db.people[b]) return false;
  const ca = resolveCanonical(a), cb = resolveCanonical(b);
  if (ca === cb) return true;
  db.aliases = db.aliases || {};
  db.aliases[cb] = ca; // link “b-group” -> “a-group”
  setDB(db);
  return true;
}
export function unlinkPerson(pid){
  const db=getDB();
  if (!db.aliases) return false;
  if (db.aliases[pid]) { delete db.aliases[pid]; setDB(db); return true; }
  return false;
}
export function groupMembersOf(canonPid){
  const db=getDB(); const canon = resolveCanonical(canonPid);
  const out = [];
  for (const id of Object.keys(db.people||{})) if (resolveCanonical(id) === canon) out.push(id);
  return out;
}
function canonicalRepresentatives(){
  const db=getDB();
  const reps = new Set();
  for (const id of Object.keys(db.people||{})) {
    const c = resolveCanonical(id);
    if (c === id) reps.add(id);
  }
  return [...reps];
}

/* ---------- Listings (canonicalized) ---------- */
export function listPersons(){
  const db=getDB();
  const reps = canonicalRepresentatives();
  return reps.map((rid)=>{
    const members = groupMembersOf(rid);
    const count = members.reduce((s, m)=>s + ((db.people[m]?.embs||[]).length), 0);
    const name  = db.people[rid]?.name || null;
    return { id: rid, name, count };
  });
}
export function listPersonsDetail(){
  const db=getDB();
  const reps = canonicalRepresentatives();
  return reps.map((rid)=>{
    const members = groupMembersOf(rid);
    const count = members.reduce((s,m)=>s + ((db.people[m]?.embs||[]).length), 0);
    const createdAt = db.people[rid]?.createdAt || null;
    const name = db.people[rid]?.name || null;
    return { id: rid, name, count, createdAt, members };
  });
}
function _findPersonIdByName(name){
  const db=getDB();
  for (const rid of canonicalRepresentatives()){
    if ((db.people[rid]?.name || '') === name) return rid;
  }
  return null;
}
export function listDBNames(){
  const names = new Set();
  for (const rid of canonicalRepresentatives()){
    const nm = getDB().people[rid]?.name;
    if (nm) names.add(nm);
  }
  return [...names];
}
export function clearDBName(name){
  const id=_findPersonIdByName(name);
  return id ? clearPerson(id) : false;
}

/* ---------- Basic ops ---------- */
export function renamePerson(id, name){
  const db=getDB();
  const rid = resolveCanonical(id);
  if(!db.people[rid]) return false;
  db.people[rid].name = (name||'').trim() || null;
  for (const mid of groupMembersOf(rid)) {
    if (mid !== rid && db.people[mid]) db.people[mid].name = null;
  }
  setDB(db); return true;
}
export function clearPerson(id){
  const db=getDB(); const rid = resolveCanonical(id);
  if(!db.people[rid]) return false;
  for (const mid of groupMembersOf(rid)) delete db.people[mid];
  if (db.aliases) {
    for (const [k,v] of Object.entries({...db.aliases})) {
      if (k===rid || v===rid || !db.people[k]) delete db.aliases[k];
    }
  }
  setDB(db); return true;
}
export function addEmbToPerson(id, emb){
  const db=getDB();
  const rid = resolveCanonical(id);
  if(!db.people[rid]) db.people[rid] = { name:null, embs:[], createdAt: Date.now() };
  const arr = db.people[rid].embs;
  arr.push(emb);
  while (arr.length > VERIFY_CFG.maxEmbPerUser) arr.shift();
  setDB(db);
}
export function exportDB(){ return JSON.stringify(getDB()); }
export function importDB(json){
  try{
    const v=JSON.parse(json);
    if(!v||!v.people||typeof v.nextId!=='number') return false;
    if (!v.aliases) v.aliases = {};
    setDB(v); return true;
  }catch{ return false; }
}
export function clearDBAll(){ setDB(_emptyDBv3()); return true; }
export function dbIsEmpty(){ return canonicalRepresentatives().length === 0; }

/* ======================= Embedding / 距離 ======================= */
export function embeddingFromLandmarks(lms) {
  const idx = [1,33,61,199,263,291,4,94,326,168,2,13,14,17,152];
  const pts = idx.map(i => lms[i]);

  const eyeL = lms[33], eyeR = lms[263];
  const cx = (eyeL.x + eyeR.x) * 0.5;
  const cy = (eyeL.y + eyeR.y) * 0.5;
  const scale = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeL.y) + 1e-9;

  const ang = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
  const cosA = Math.cos(-ang), sinA = Math.sin(-ang);

  const npts = pts.map(p => {
    const x = (p.x - cx) / scale;
    const y = (p.y - cy) / scale;
    return { x: x * cosA - y * sinA, y: x * sinA + y * cosA, z: (p.z ?? 0) / scale };
  });

  const feats = [];
  for (let i=0;i<npts.length;i++){
    for (let j=i+1;j<npts.length;j++){
      const dx = npts[i].x - npts[j].x;
      const dy = npts[i].y - npts[j].y;
      const dz = npts[i].z - npts[j].z;
      feats.push(dx,dy,dz);
      if (feats.length >= 128) break;
    }
    if (feats.length >= 128) break;
  }
  while (feats.length < 128) feats.push(0);
  return feats;
}
export function cosineDistance(a,b){
  let dot=0,na=0,nb=0;
  for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  const denom = Math.sqrt(na)*Math.sqrt(nb) + 1e-9;
  const sim = dot / denom;
  return 1 - sim;
}
export function distToConfidence(d){
  const a=VERIFY_CFG.distAccept, b=VERIFY_CFG.distReject;
  const t=(b-d)/(b-a+1e-9); return Math.max(0,Math.min(1,t));
}
// 鏡不変距離
export function mirrorInvariantDistance(a, b){
  return cosineDistance(a, b);
}
function meanStd(arr){
  if (!arr.length) return { mean:Infinity, std:Infinity };
  const m = arr.reduce((x,y)=>x+y,0)/arr.length;
  const v = arr.reduce((x,y)=>(x+(y-m)*(y-m)),0)/arr.length;
  return { mean:m, std:Math.sqrt(Math.max(0,v)) };
}

/* ======================= クラスタ検索＆判定（グループ対応） ======================= */
export function classStats(pid){
  const db=getDB();
  const rid = resolveCanonical(pid);
  const members = groupMembersOf(rid);
  const all = [];
  for (const m of members) for (const e of (db.people[m]?.embs||[])) all.push(e);
  if (!all.length) return null;
  const D=all[0].length; const cen=new Array(D).fill(0);
  for(const e of all) for(let i=0;i<D;i++) cen[i]+=e[i];
  for(let i=0;i<D;i++) cen[i]/=all.length;
  const dists=all.map(e=>cosineDistance(e,cen));
  const {mean,std}=meanStd(dists);
  return { centroid:cen, mean, std, count:all.length };
}

export function bestMatchPerClass(emb){
  const db=getDB();
  const reps = (function(){
    const s=new Set(); for(const id of Object.keys(db.people||{})){ const c=resolveCanonical(id); if(c===id) s.add(id); } return [...s];
  })();

  let best = { id:null, dist:1e9 }, second = { id:null, dist:1e9 };
  for (const rid of reps){
    const stats = classStats(rid);
    if (!stats) continue;
    const dCen  = cosineDistance(emb, stats.centroid);
    const score = dCen;
    if (score < best.dist){ second=best; best={ id:rid, dist:score }; }
    else if (score < second.dist){ second={ id:rid, dist:score }; }
  }

  let bestCentroidDist=null, bestSpread=null, bestCount=0;
  if (best.id){
    const stats=classStats(best.id);
    if (stats){
      bestCentroidDist=cosineDistance(emb, stats.centroid);
      bestSpread={ mean:stats.mean, std:stats.std };
      bestCount=stats.count||0;
    }
  }
  return { best, second, bestCentroidDist, bestSpread, bestCount };
}

export function decideForClass(emb){
  const { best, second, bestCentroidDist, bestSpread, bestCount } = bestMatchPerClass(emb);
  const hasSecond = Number.isFinite(second?.dist);
  const margin = hasSecond ? (second.dist - best.dist) : Infinity;

  const safeMerge = !!best?.id && best.dist <= SAFE_MERGE_DIST;

  const centroidOk = (bestCount < 6)
    ? (best?.id && best.dist <= SAFE_MERGE_DIST)
    : (bestCentroidDist != null && bestSpread
        ? (bestCentroidDist <= (bestSpread.mean + VERIFY_CFG.centroidK * (bestSpread.std || 0)))
        : false);

  let siphonGuardOk = true;
  if (best?.id && bestCount < (SYPHON_GUARD.minSamples || 0)) {
    const needMargin = (VERIFY_CFG.marginMin + (SYPHON_GUARD.extraMargin || 0));
    const needDistOk = (best.dist <= (SAFE_MERGE_DIST - (SYPHON_GUARD.extraTighten || 0)));
    siphonGuardOk = (margin >= needMargin) || needDistOk;
  }

  const confidentSame =
    !!best?.id && siphonGuardOk && (safeMerge || (
      best.dist <= VERIFY_CFG.distAccept &&
      centroidOk &&
      margin >= VERIFY_CFG.marginMin
    )),

  weakSame =
    !!best?.id && siphonGuardOk && (safeMerge || (
      best.dist <= VERIFY_CFG.distReject &&
      centroidOk &&
      margin >= VERIFY_CFG.marginMin
    ));

  return { best, second, margin, centroidOk, confidentSame, weakSame, bestCount };
}

/* ======================= Re-ID（短期復帰） ======================= */
const _recentPersons = new Map();
export function updateRecent(pid){
  const rid = resolveCanonical(pid);
  if (!rid) return;
  const st = classStats(rid);
  if (st?.centroid) {
    const cur = _recentPersons.get(rid) || { centroid: st.centroid, lastSeen: 0, votes: 0 };
    cur.centroid = st.centroid;
    cur.lastSeen = performance.now();
    cur.votes = 0;
    _recentPersons.set(rid, cur);
  }
}
export function clearRecent(){ _recentPersons.clear(); }
function sweepRecent(now){
  for (const [pid,info] of [..._recentPersons]) {
    if (now - info.lastSeen > REID.horizonMs) _recentPersons.delete(pid);
  }
}
export function reidLookup(emb, now){
  sweepRecent(now);
  let pick=null, bestD=1e9;
  for (const [pid, info] of _recentPersons) {
    const d = cosineDistance(emb, info.centroid);
    if (d < bestD) { bestD = d; pick = { pid, info }; }
  }
  if (!pick) return null;
  if (bestD <= REID.dist) {
    pick.info.votes = (pick.info.votes || 0) + 1;
    pick.info.lastSeen = now;
    if (pick.info.votes >= (REID.minVotes || 1)) {
      pick.info.votes = 0;
      return { pid: pick.pid, dist: bestD };
    }
  } else {
    pick.info.votes = 0;
  }
  return null;
}

/* ======================= Verify 集計 ======================= */
export const verifyBuf = [];
export function pushVerifyVote(id, dist){
  const rid = resolveCanonical(id);
  verifyBuf.push({ id: rid, dist, t:performance.now() });
  while (verifyBuf.length > VERIFY_CFG.window) verifyBuf.shift();
}
export function stableDecision(){
  const goods = verifyBuf.filter(v => v.id && v.dist != null && v.dist <= VERIFY_CFG.distAccept);
  if (!goods.length) return { pid:null, dist:null, confPct:null };
  const tally={}; for(const g of goods){ tally[g.id]=(tally[g.id]||0)+1; }
  const winner = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  if (!winner || winner[1] < VERIFY_CFG.needAgree) return { pid:null, dist:null, confPct:null };
  const dists = goods.filter(g=>g.id===winner[0]).map(g=>g.dist).sort((a,b)=>a-b);
  const medDist=dists[Math.floor(dists.length/2)];
  const confPct=Math.round(distToConfidence(medDist)*100);
  return { pid:winner[0], dist:medDist, confPct };
}
