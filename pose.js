// web/pose.js
// MediaPipe Tasks Vision 0.10.3 を利用
import {
  PoseLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let videoEl = null;
let stream = null;
let landmarker = null;
let running = false;
let rafId = 0;
let selfieMode = true; // フロントカメラ想定（見た目をミラー）

// --- しきい値（Flutter側のロジック方針に合わせてやや厳しめ） ---
const CONF = {
  minPoseDetectionConfidence: 0.7,
  minPosePresenceConfidence: 0.6,
  minTrackingConfidence: 0.7,
};

function logOnce(msg) { console.log("[pose.js]", msg); }

// ---- MediaPipe の初期化 ---------------------------------------------------
async function initLandmarker() {
  if (landmarker) return landmarker;
  const fileset = await FilesetResolver.forVisionTasks(
    // wasm等のCDNパス（jsdelivr）
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/pose_landmarker_lite.task",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: CONF.minPoseDetectionConfidence,
    minPosePresenceConfidence: CONF.minPosePresenceConfidence,
    minTrackingConfidence: CONF.minTrackingConfidence,
    outputSegmentationMasks: false,
  });
  return landmarker;
}

// ---- カメラ開始 -----------------------------------------------------------
async function startCamera() {
  if (stream) return stream;

  videoEl = document.getElementById("cam");
  if (!videoEl) throw new Error("video element #cam not found");

  const constraints = {
    audio: false,
    video: {
      facingMode: selfieMode ? "user" : "environment",
      width: { ideal: 1280 }, height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    },
  };

  stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;
  videoEl.classList.toggle("mirror", selfieMode);
  await videoEl.play();

  document.getElementById("loading")?.remove();

  return stream;
}

// ---- 座標を 0..1 正規化して Flutter へブリッジ（12点だけ渡す） ----------
function dispatchPose(landmarks) {
  // landmarks: [{x:0..1, y:0..1, z:..., visibility:...}, ...33個]

  const idx = {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28,
  };

  const obj = {};
  Object.entries(idx).forEach(([name, i]) => {
    const lm = landmarks[i];
    if (!lm) return;
    // MediaPipe landmarks are already normalized to video frame by default (0..1)
    // 念のためクランプ
    const x = Math.min(1, Math.max(0, lm.x));
    const y = Math.min(1, Math.max(0, lm.y));
    obj[name] = { x, y };
  });

  // Flutter側の _convertWebNamedToBlazeList が空オブジェクトも受け付ける仕様
  window.dispatchEvent(new CustomEvent("pose", { detail: { landmarks: obj } }));
}

// 無効フレームを通知（Flutter側で「欠損フレーム」として扱わせる）
function dispatchInvalid() {
  window.dispatchEvent(new CustomEvent("pose", { detail: { landmarks: {} } }));
}

// ---- メインループ ---------------------------------------------------------
function loop() {
  if (!running || !videoEl || !landmarker) return;

  const nowMs = performance.now();
  const result = landmarker.detectForVideo(videoEl, nowMs);
  if (result && result.landmarks && result.landmarks.length > 0) {
    const lms = result.landmarks[0];

    // presence / visibility が十分でないときは無効扱い
    let okCount = 0;
    for (const p of lms) {
      // visibility は 0..1（null のこともある）
      const vis = (typeof p.visibility === "number") ? p.visibility : 1.0;
      if (vis >= 0.5) okCount++;
    }
    if (okCount >= 10) {
      // だいたい十二分に可視なら送る
      dispatchPose(lms);
    } else {
      dispatchInvalid();
    }
  } else {
    dispatchInvalid();
  }

  rafId = requestAnimationFrame(loop);
}

// ---- 外部公開API（Flutterから呼ぶ） ---------------------------------------
async function poseStart() {
  if (running) return;
  try {
    await initLandmarker();
    await startCamera();
    running = true;
    loop();
    logOnce("poseStart: ok");
  } catch (e) {
    console.error(e);
    window.dispatchEvent(new CustomEvent("error", { detail: { message: String(e) } }));
  }
}

async function poseStop() {
  running = false;
  cancelAnimationFrame(rafId);
  if (landmarker) {
    try { landmarker.close(); } catch (_) {}
    landmarker = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  logOnce("poseStop: stopped");
}

// ---- グローバルへ公開（Flutterの jsutil.callMethod 用） -------------------
window.poseStart = poseStart;
window.poseStop = poseStop;
