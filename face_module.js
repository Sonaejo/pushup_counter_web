// face_module.js
import {
  initFaceModule,
  startFaceCamera,
  stopFaceCamera,
  enrollFace,

  // デバッグ・テスト操作
  enableFaceDebug,
  forceNewOnce,

  // アンカー操作（将来用のプレースホルダ。実装側に合わせてください）
  anchorEnable,
  anchorReset,
  anchorInfo,

  // 単体でも“2人目”化の設定
  setVirtualSecond,

  // runtime 側は listDBNames を listEnrollments 名で公開済み
  listEnrollments,

  // clearEnrollment = clearDBName の再公開
  clearDBName,

  listPersons,
  renamePerson,

  // ランタイムパージ付きラッパー
  clearPerson,
  clearDBAll,
  importDB,

  // しきい値・同時人数・自動登録
  setThresholds,
  setMaxFacesConfig,      // ← こちらをそのまま公開
  setAutoEnrollEnabled,

  // DBエクスポート
  exportDB,

  // 照合テスト
  startVerify,
  stopVerify,
} from './face_runtime.js';

// 旧互換
const clearEnrollment = clearDBName;

// window へバインド（Dart 側から直接参照できるように）
Object.assign(window, {
  initFaceModule,
  startFaceCamera,
  stopFaceCamera,
  enrollFace,

  enableFaceDebug,
  forceNewOnce,

  anchorEnable,
  anchorReset,
  anchorInfo,

  // ★ 単体→“2人目”化の設定を外から調整
  setVirtualSecond,

  listEnrollments,
  clearEnrollment,

  listPersons,
  renamePerson,
  clearPerson,

  // ★ 両方の名前で公開（既存コード互換）
  setMaxFacesConfig,
  setMaxFaces: setMaxFacesConfig,

  setAutoEnrollEnabled,
  setThresholds,

  exportDB,
  importDB,
  clearDBAll,

  startVerify,
  stopVerify,
});

// ESM エクスポート
export {
  initFaceModule,
  startFaceCamera,
  stopFaceCamera,
  enrollFace,

  enableFaceDebug,
  forceNewOnce,

  anchorEnable,
  anchorReset,
  anchorInfo,
  setVirtualSecond,

  listEnrollments,
  clearEnrollment,

  listPersons,
  renamePerson,
  clearPerson,

  setMaxFacesConfig as setMaxFaces, // ESM 側は互換名を維持
  setMaxFacesConfig,
  setAutoEnrollEnabled,
  setThresholds,

  exportDB,
  importDB,
  clearDBAll,

  startVerify,
  stopVerify,
};
