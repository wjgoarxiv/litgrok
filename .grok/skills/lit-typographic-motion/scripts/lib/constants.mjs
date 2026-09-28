// Every number the engine and gate use, in one place. Values marked PROVISIONAL are the spec's
// [NEW] defaults (MO-C-05/06/07/08/13/14/25/29, MO-D-02/03/04): no user sign-off is recorded, so
// they are implemented exactly as written and labelled provisional here and in each report.

export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  NO_CHROME: 10,
  NO_WEBGL2: 11,
  NO_FFMPEG_FOR_VIDEO: 12,
  GATE_FAIL_QA: 13,
  DEPS_NOT_PREWARMED: 14,
  FONT_FETCH: 15,
  TREATMENT_INVALID: 16,
  STAGE_CONTRACT: 17,
  STAGE_NONDETERMINISTIC: 18,
  STAGE_NETWORK: 19,
  SOUND_INVALID: 20,
});

export const EXIT_NAMES = Object.freeze({
  0: 'OK',
  10: 'BLOCKED_NO_CHROME',
  11: 'BLOCKED_NO_WEBGL2',
  12: 'BLOCKED_NO_FFMPEG_FOR_VIDEO',
  13: 'GATE_FAIL_QA',
  14: 'BLOCKED_DEPS_NOT_PREWARMED',
  15: 'BLOCKED_FONT_FETCH',
  16: 'BLOCKED_TREATMENT_INVALID',
  17: 'STAGE_CONTRACT_ERROR',
  18: 'STAGE_NONDETERMINISTIC',
  19: 'STAGE_NETWORK_REQUEST',
  20: 'SOUND_INVALID',
});

export class BlockedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ENGINE_CREDIT = 'mexicat/pdoom-video ca251e3dddda422b364385eb484b5a3593a0990d (MIT)';
export const ONE_LINE_CREDIT = 'Typographic-motion engine adapted from mexicat/pdoom-video (MIT, Giacomo Magnanini), commit `ca251e3`.';

export const FRAME = Object.freeze({ width: 1920, height: 1080, fps: 60 });

export const RENDER = Object.freeze({
  masterSamples: 4, // MO-A-26
  masterShutter: 0.5,
  stillSamples: 1, // MO-A-27
  defaultBpm: 100, // MO-A-14
  defaultSeed: 20260926,
  maxRounds: 3, // MO-C-16
});

export const TIMING = Object.freeze({
  generatorPace: 1.25, // MO-A-09/10: 1.25 x the MO-C-07/08 floor
  minSceneBeats: 2, // MO-A-16
  cutToleranceFrames: 1, // MO-A-15
  // MO-C-07/08 floor function (PROVISIONAL)
  latinLineFloor: 0.9,
  hangulLineFloor: 1.0,
  wordFloor: 0.5,
  revealFloor: 0.35,
  secondsPerHangulSyllable: 0.2,
  latinWordsPerSecond: 3.3,
  latinCharsPerSecond: 17,
});

export const SAFE = Object.freeze({
  title: Object.freeze([96, 54, 1824, 1026]), // MO-C-04
  action: Object.freeze([48, 27, 1872, 1053]), // MO-C-05 (PROVISIONAL)
});

export const TYPE = Object.freeze({
  bodyContrast: 4.5, // MO-C-06
  largeContrast: 3.0,
  largeFontPx: 32, // PROVISIONAL translation of "large"
  largeBoldFontPx: 25,
  largeBoldWeight: 700,
  displayTrackingFloorEm: -0.04, // MO-C-25 (PROVISIONAL)
  machineTrackingFloorEm: 0,
  latinLineHeight: 1.5, // MO-C-26
  cjkLineHeight: 1.6,
  denseLineHeight: 1.4,
  denseLines: 3,
  paragraphMinCh: 60, // MO-C-27
  paragraphMaxCh: 75,
  cjkParagraphAdvisory: Object.freeze([30, 45]),
});

export const COLOUR = Object.freeze({
  saturationFloor: 0.5, // MO-C-29 (PROVISIONAL)
  hueTolerance: 15,
  minFillPx: 24,
  maxSaturatedClusters: 2, // one signal + one accent
  accentEntries: 1,
  accentFrameFraction: 0.1,
});

export const FLASH = Object.freeze({
  gridW: 320, // MO-C-03
  gridH: 180,
  windowCellsW: 107,
  windowCellsH: 60,
  windowTriggerPx: 57600, // more than this many logical px in one 640x360 window
  cellPx: 36,
  delta: 0.1,
  darkCeiling: 0.8,
  redRatio: 0.8,
  redDelta: 20,
  redScale: 320,
  spanFrames: 2, // transitions in [f-2, f] combine
  maxGeneral: 3,
  maxRed: 3,
  fullFrameStepArea: 0.25, // MO-SH-04a
});

export const PASS_CAPS = Object.freeze({
  glitchHitRate: 2.0, // MO-SH-05
  glitchAreaPct: 20,
  surgeRate: 2, // MO-SH-06
  surgeEdgeFloor: 0.1,
  crtFlicker: 0.06, // MO-SH-07
  eventsPerSecondPerShot: 2, // MO-SH-03
  flashEventThreshold: 0.1, // MO-A-58: each rise of flash above 0.1 is one event
  terminalLayers: 2, // MO-SH-11
});

export const OUTPUT = Object.freeze({
  previewBytes: 3_000_000, // MO-C-13 (PROVISIONAL)
  posterBytes: 1_000_000,
  mp4WarnBytesPer10s: 100_000_000,
  minWidth: 1920, // MO-C-10
  minHeight: 1080,
  minFps: 30, // MO-C-11
  minDurationSec: 3, // MO-C-12
  warnDurationSec: 90,
  stillInkFloor: 0.9, // MO-C-14 (PROVISIONAL)
  previewLadder: Object.freeze([[960, 30], [720, 24], [540, 20]]), // MO-A-38
  previewMinWidth: 540,
  previewMinGlyphPx: 10,
});

export const PERF = Object.freeze({
  gpuP95Ms: 40, // MO-D-02 (PROVISIONAL)
  softwareP95Ms: 250,
  minFrames: 120,
});

export const DARK = Object.freeze({
  luminanceP995: 0.05, // MO-D-03 (PROVISIONAL)
  runBeatsFactor: 2,
  edgeAllowanceSec: 1,
});

export const PROVISIONAL_RULES = Object.freeze(['MO-C-05', 'MO-C-06', 'MO-C-07', 'MO-C-08', 'MO-C-13', 'MO-C-14', 'MO-C-25', 'MO-C-29', 'MO-D-02', 'MO-D-03', 'MO-D-04']);

// Wave 3 director: the treatment schema's closed sets and floors (brief section 5) and the two
// stage formats (section 6). Faces are the families /lit/fonts.css serves from the verified pins.
export const DIRECTOR = Object.freeze({
  genres: Object.freeze(['announcement', 'brand-mood', 'event', 'explainer', 'motion-graphics', 'type-led', 'other']),
  arcStages: Object.freeze({ announcement: 5, 'brand-mood': 4, event: 4, explainer: 4, 'motion-graphics': 5, other: 3 }),
  floorGenres: Object.freeze(['announcement', 'event', 'explainer', 'motion-graphics']),
  floorSec: 10,
  durationRange: Object.freeze([4, 90]),
  minBeatSec: 1.2,
  maxGapSec: 0.25,
  deviceKinds: Object.freeze(['illustration', 'diagram', 'chart', 'icon', 'shape', 'path', 'mask', 'depth3d', 'particles', 'grid', 'gradient', 'photo-texture']),
  textureKinds: Object.freeze(['grid', 'gradient', 'particles', 'photo-texture']),
  subjectCoverage: 0.5,
  faces: Object.freeze(['Archivo', 'Pretendard', 'VT323', 'Silkscreen', 'Galmuri9', 'Meslo']),
  soundModes: Object.freeze(['generated', 'supplied', 'authored', 'none']),
  timbres: Object.freeze(['glass', 'felt', 'pulse']),
});

export const STAGE = Object.freeze({
  formats: Object.freeze({ '16:9': Object.freeze([1920, 1080]), '9:16': Object.freeze([1080, 1920]) }),
  origin: 'http://lit.stage',
  host: 'lit.stage',
  fpsAllowed: Object.freeze([60, 30]),
  durationTolerance: 0.1,
  maxRasters: 24,
  maxRasterBytes: 8_000_000,
  flipbookCount: 10,
  kitMaxBytes: 60 * 1024,
  determinismMin: 8,
  determinismMax: 16,
});
