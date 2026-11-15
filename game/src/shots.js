// The screenshot scenes behind ?shot=start|play|end|corner. Each one plays the real
// rules forward from a fresh world, steered by the same autopilot a player could
// follow, so the frame is what a short game really looks like and the same seed always
// gives the same frame.

import { STEP } from './config.js';
import { PHASE_RESULTS } from './world.js';

const START_SECONDS = 5;
const PLAY_CAP_SECONDS = 90;
const END_LIMIT_SECONDS = 600;
const CORNER_CAP_SECONDS = 120;

/** Drive the countdown out, then the race, with the autopilot. */
function drive(world, seconds) {
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = world.autopilot();
    world.step(STEP, input);
    if (world.state.phase === PHASE_RESULTS) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title screen over the ship on the start line.
 * play: mid-race, closing on the next gate with the boost meter charged.
 * end: the results screen after a full three-lap race.
 * corner: mid-race, boosting into the sharpest turn on the loop.
 */
export function stageShot(name, world) {
  world.resetRace();
  if (name !== 'play' && name !== 'end' && name !== 'corner') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { steer: 0, throttle: 0, boost: false });
    return { screen: 'title' };
  }

  world.startCountdown();
  if (name === 'end') {
    drive(world, END_LIMIT_SECONDS);
    return { screen: 'results' };
  }
  if (name === 'corner') {
    const target = world.track.sharpestProgress - 0.03;
    const cap = Math.ceil(CORNER_CAP_SECONDS / STEP);
    for (let i = 0; i < cap; i += 1) {
      const input = world.autopilot();
      input.boost = true;
      world.step(STEP, input);
      if (world.state.progress >= target || world.state.phase === PHASE_RESULTS) break;
    }
    return { screen: 'racing' };
  }
  // play: drive to mid-lap, near the fourth gate, so the frame shows a gate ahead,
  // a boost pad behind and the boost meter charged.
  const cap = Math.ceil(PLAY_CAP_SECONDS / STEP);
  for (let i = 0; i < cap; i += 1) {
    const input = world.autopilot();
    world.step(STEP, input);
    if (world.state.phase === PHASE_RESULTS) break;
    if (world.state.phase === 'racing' && world.state.progress >= 0.55) break;
  }
  return { screen: 'racing' };
}
