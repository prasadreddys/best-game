// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, countdown, racing, paused and
// results.
//
// ?seed=N fixes the stars and decoration. ?shot=start|play|end|corner (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, PHASE_COUNTDOWN, PHASE_PAUSED, PHASE_RACING, PHASE_RESULTS, PHASE_TITLE } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = {};
for (const id of [
  'speed', 'lap', 'time', 'bestLap', 'bestTotal', 'gate', 'penalty', 'boostFill',
  'title', 'countdown', 'results', 'paused', 'raceHud', 'hint', 'message',
  'finalTime', 'finalBestLap', 'finalGates', 'finalPenalties', 'finalBest',
]) {
  hud[id] = document.getElementById(id);
}

const random = createRandom(seed);
const world = createWorld(random);
const audio = createAudio();
const renderer = createRenderer(canvas, hud, random);

renderer.buildTrack(world.track);
renderer.buildFloodlights(world.track);
renderer.buildGates(world.track);
renderer.buildPads(world.track);

world.on('chime', () => audio.gateChime());
world.on('whoosh', () => audio.whoosh());
world.on('hit', () => audio.hit());
world.on('penalty', () => audio.penalty());
world.on('beep', (go) => audio.beep(go));

function readBest() {
  try {
    const value = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveBest(ms) {
  try {
    window.localStorage.setItem(BEST_KEY, String(ms));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

let bestMs = readBest();

/** The screen the loop is showing, for the playtest hook. */
let screenState = PHASE_TITLE;

/** When true (playtest only), the loop drives with the autopilot instead of the keys. */
let autoDrive = false;

function runShot(name) {
  const staged = stageShot(name, world);
  renderer.snapCamera(world.snapshot());
  let painted = 0;
  function paint() {
    const snapshot = world.snapshot();
    renderer.draw(snapshot, staged.screen, bestMs);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  let screen = screenState;
  let accumulator = 0;
  let last = performance.now();
  let announcedResults = false;

  function announce(message) {
    status.textContent = message;
  }

  function startRace() {
    audio.unlock();
    world.startCountdown();
    screen = PHASE_COUNTDOWN;
    announcedResults = false;
    announce('Race starting. Three, two, one, go.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.state.muted = muted;
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === PHASE_TITLE || screen === PHASE_RESULTS) startRace();
      else if (screen === PHASE_PAUSED) {
        screen = PHASE_RACING;
        announce('Racing.');
      }
    }
    if (actions & ACTION_RESTART) {
      if (screen === PHASE_RACING || screen === PHASE_PAUSED || screen === PHASE_RESULTS) startRace();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === PHASE_RACING || screen === PHASE_COUNTDOWN) {
        screen = PHASE_PAUSED;
        announce('Paused.');
      } else if (screen === PHASE_PAUSED) {
        screen = PHASE_RACING;
        announce('Racing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    screenState = screen;
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const racing = screen === PHASE_RACING || screen === PHASE_COUNTDOWN;
    if (screen === PHASE_TITLE || racing) {
      while (accumulator >= STEP && (screen === PHASE_TITLE || screen === PHASE_RACING || screen === PHASE_COUNTDOWN)) {
        if (screen === PHASE_TITLE) world.step(STEP, { steer: 0, throttle: 0, boost: false });
        else {
          const driving = autoDrive
            ? world.autopilot()
            : { steer: input.steer(), throttle: input.throttle(), boost: input.boosting() };
          world.step(STEP, driving);
        }
        accumulator -= STEP;
        if (world.state.phase === PHASE_RESULTS && screen !== PHASE_RESULTS) {
          screen = PHASE_RESULTS;
        }
        if (world.state.phase === PHASE_RACING && screen === PHASE_COUNTDOWN) screen = PHASE_RACING;
      }
    } else {
      accumulator = 0;
    }
    if (screen === PHASE_RESULTS && !announcedResults) {
      announcedResults = true;
      const totalMs = Math.round(world.state.totalTime * 1000);
      if (bestMs === null || totalMs < bestMs) {
        bestMs = totalMs;
        saveBest(bestMs);
      }
      announce(`Finished. Total time ${world.state.totalTime.toFixed(3)} seconds.`);
    }
    audio.setEngine(
      Math.min(1, Math.abs(world.state.ship.speed) / 58),
      screen === PHASE_RACING || screen === PHASE_COUNTDOWN,
    );
    renderer.draw(world.snapshot(), screen, bestMs);
  }

  // Leaving the tab pauses a running game rather than letting the race run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (screen === PHASE_RACING || screen === PHASE_COUNTDOWN)) {
      screen = PHASE_PAUSED;
      announce('Paused.');
    }
  });
  // Any gesture wakes the synthesised audio.
  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());

  announce('NEON RUSH. Press Space to race.');
  requestAnimationFrame(frame);
}

// Playtest hook: read the live state, and (tests only) move the ship along the loop
// so gate, lap, pad and barrier code paths can be driven without a full three laps.
window.__neonrush = {
  state() {
    return { ...world.snapshot(), screen: screenState };
  },
  warp(progress, lateral) {
    const track = world.track;
    const p = ((progress % 1) + 1) % 1;
    const point = track.pointAtLateral(p, lateral);
    const tangent = track.tangentAt(p);
    const st = world.state;
    st.ship.x = point[0];
    st.ship.z = point[1];
    st.ship.heading = Math.atan2(tangent[0], tangent[1]);
    st.ship.speed = 0;
    st.progress = progress;
    st.lastIndex = Math.floor(p * track.samples) % track.samples;
    st.lateral = lateral;
    st.lap = Math.floor(progress) + 1;
    const lapBase = Math.floor(progress);
    let next = 0;
    while (next < track.gates.length && lapBase + track.gates[next].at <= progress) next += 1;
    st.nextGate = next % track.gates.length;
    st.nextGateAt = next < track.gates.length ? lapBase + track.gates[next].at : lapBase + 1 + track.gates[0].at;
    st.gateStates = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'];
  },
  start() {
    world.startCountdown();
  },
  /** Playtest only: steer with the autopilot instead of the keyboard. */
  autopilot(on) {
    autoDrive = on;
  },
};

if (shot) runShot(shot);
else runGame();
