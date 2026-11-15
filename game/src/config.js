// Every tuning number and colour for NEON RUSH in one place. The track is a closed loop
// in the XZ plane; all speeds are in track units per second, all times in seconds.

export const STEP = 1 / 60;

/** The race: laps around the loop, and the penalty for skipping a gate. */
export const RACE = {
  laps: 3,
  gateMissPenalty: 3.0,
  countdownSeconds: 3.2,
  gateCount: 6,
  padCount: 4,
};

/** The ship's arcade handling. */
export const SHIP = {
  maxSpeed: 58,
  boostSpeed: 80,
  accel: 26,
  brake: 42,
  coastDrag: 9,
  reverseMax: 12,
  turnRate: 2.0,
  radius: 1.6,
  /** Speed below which the ship barely turns. */
  turnGrip: 0.35,
};

/** The boost meter: how it fills and drains. */
export const BOOST = {
  max: 100,
  gateGain: 14,
  padGain: 30,
  drainPerSecond: 42,
  padKick: 18,
};

/** The track ribbon: half width, and how finely the loop is sampled. */
export const TRACK = {
  halfWidth: 9,
  samples: 720,
  /** Control points of the closed loop, in (x, z). A rounded loop with a hairpin
   *  on the east side and a sweeping banked curve on the west. */
  points: [
    [0, -120],
    [90, -112],
    [132, -46],
    [112, 34],
    [146, 96],
    [64, 138],
    [-18, 118],
    [-92, 142],
    [-142, 78],
    [-128, -2],
    [-152, -72],
    [-82, -118],
  ],
};

/** Gate progress fractions around the loop (0 = start line), in race order. */
export const GATES = [0.08, 0.25, 0.42, 0.58, 0.75, 0.92];
/** Boost pad progress fractions, and their sideways offset from the centre line. */
export const PADS = [
  { at: 0.15, lateral: 0 },
  { at: 0.35, lateral: -3 },
  { at: 0.65, lateral: 3 },
  { at: 0.85, lateral: 0 },
];
export const GATE = { halfWidth: 6, ringRadius: 6.5 };
export const PAD = { halfLength: 5, halfWidth: 3.5 };

export const PALETTE = {
  sky: 0x0b1026,
  fog: 0x0b1026,
  ground: 0x0d0a1a,
  track: 0x2e3454,
  trackLine: 0x3a3f5c,
  edgeLeft: 0x00e5ff,
  edgeRight: 0xff2ea6,
  gateNext: 0x00e5ff,
  gatePassed: 0x39ff88,
  gateMissed: 0xff3b30,
  pad: 0xff9f1c,
  shipHull: 0x2b2f45,
  shipTrim: 0x00e5ff,
  shipCanopy: 0x7df9ff,
  shipGlow: 0x00b3ff,
  trail: 0x00e5ff,
  star: 0xffffff,
  floodlight: 0xffe9a8,
  moon: 0xf4f1de,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best total time (milliseconds) is kept between visits, this browser only. */
export const BEST_KEY = 'neon-rush.best-ms';
