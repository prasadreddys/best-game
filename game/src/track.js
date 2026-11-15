// The closed-loop track: a Catmull-Rom loop through the control points, sampled into a
// dense polyline, plus everything the race and the renderer need from it — the nearest
// point on the loop to a ship, gate and pad positions, and the ribbon geometry.
//
// The loop is walked by progress in [0, 1): sample i sits at progress i / samples.

import { GATES, PADS, TRACK } from './config.js';

/** Catmull-Rom through four points, t in [0, 1]. Returns [x, z]. */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
  const z =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  return [x, z];
}

function wrapIndex(i, n) {
  return ((i % n) + n) % n;
}

export function createTrack() {
  const points = TRACK.points;
  const n = points.length;
  const samples = TRACK.samples;
  const perSegment = samples / n;

  // Sample the loop.
  const centre = new Array(samples);
  for (let s = 0; s < samples; s += 1) {
    const seg = Math.floor(s / perSegment);
    const t = (s - seg * perSegment) / perSegment;
    centre[s] = catmullRom(
      points[wrapIndex(seg - 1, n)],
      points[wrapIndex(seg, n)],
      points[wrapIndex(seg + 1, n)],
      points[wrapIndex(seg + 2, n)],
      t,
    );
  }

  // Tangent and left normal per sample, from neighbours.
  const tangent = new Array(samples);
  const normal = new Array(samples);
  for (let s = 0; s < samples; s += 1) {
    const a = centre[wrapIndex(s - 1, samples)];
    const b = centre[wrapIndex(s + 1, samples)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    tangent[s] = [tx, tz];
    normal[s] = [-tz, tx];
  }

  // Total loop length, for lap timing and speed readouts.
  let length = 0;
  for (let s = 0; s < samples; s += 1) {
    const a = centre[s];
    const b = centre[wrapIndex(s + 1, samples)];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // Sharpest turn on the loop, for the corner screenshot.
  let sharpest = 0;
  let sharpestTurn = 0;
  for (let s = 0; s < samples; s += 1) {
    const a = tangent[wrapIndex(s - 4, samples)];
    const b = tangent[wrapIndex(s + 4, samples)];
    const cross = a[0] * b[1] - a[1] * b[0];
    const turn = Math.abs(Math.asin(Math.max(-1, Math.min(1, cross))));
    if (turn > sharpestTurn) {
      sharpestTurn = turn;
      sharpest = s;
    }
  }

  /** Point on the centre line at progress p in [0, 1). */
  function pointAt(p) {
    const s = wrapIndex(Math.floor(p * samples), samples);
    return centre[s];
  }
  /** Tangent at progress p. */
  function tangentAt(p) {
    const s = wrapIndex(Math.floor(p * samples), samples);
    return tangent[s];
  }
  /** Left normal at progress p. */
  function normalAt(p) {
    const s = wrapIndex(Math.floor(p * samples), samples);
    return normal[s];
  }
  /** World point at progress p, offset sideways by `lateral` (positive = left). */
  function pointAtLateral(p, lateral) {
    const c = pointAt(p);
    const nrm = normalAt(p);
    return [c[0] + nrm[0] * lateral, c[1] + nrm[1] * lateral];
  }

  /**
   * Nearest sample to (x, z), searched in a window around `hint` so the result stays
   * continuous as the ship moves. Returns { index, lateral, distance } where lateral is
   * the signed sideways offset from the centre line (positive = left of travel).
   */
  function nearest(x, z, hint) {
    const window = 48;
    let bestIndex = hint;
    let bestD2 = Infinity;
    for (let o = -window; o <= window; o += 1) {
      const s = wrapIndex(hint + o, samples);
      const c = centre[s];
      const dx = x - c[0];
      const dz = z - c[1];
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIndex = s;
      }
    }
    const c = centre[bestIndex];
    const nrm = normal[bestIndex];
    const lateral = (x - c[0]) * nrm[0] + (z - c[1]) * nrm[1];
    return { index: bestIndex, lateral, distance: Math.sqrt(bestD2) };
  }

  const gates = GATES.map((at, i) => ({ index: i, at, sample: Math.floor(at * samples) }));
  const pads = PADS.map((pad, i) => ({ index: i, at: pad.at, lateral: pad.lateral, sample: Math.floor(pad.at * samples) }));

  return {
    samples,
    length,
    centre,
    tangent,
    normal,
    gates,
    pads,
    sharpest,
    sharpestProgress: sharpest / samples,
    pointAt,
    tangentAt,
    normalAt,
    pointAtLateral,
    nearest,
  };
}
