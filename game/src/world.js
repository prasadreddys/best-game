// The race itself: the ship's arcade physics, the closed loop, gates, boost pads, laps,
// penalties, particles and the screen flow (title, countdown, racing, paused, results).
// The simulation advances in fixed STEP steps and never touches the DOM or Three.js;
// the renderer reads this state and paints it.

import { BOOST, GATE, PAD, RACE, SHIP, STEP, TRACK } from './config.js';
import { createTrack } from './track.js';

export const PHASE_TITLE = 'title';
export const PHASE_COUNTDOWN = 'countdown';
export const PHASE_RACING = 'racing';
export const PHASE_PAUSED = 'paused';
export const PHASE_RESULTS = 'results';

const MAX_PARTICLES = 400;

function angleDiff(target, current) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const track = createTrack();
  const start = track.pointAt(0);
  const startTangent = track.tangentAt(0);

  const state = {
    phase: PHASE_TITLE,
    countdown: 0,
    countdownBeep: 4,
    ship: { x: start[0], z: start[1], heading: Math.atan2(startTangent[0], startTangent[1]), speed: 0 },
    progress: 0,
    lastIndex: 0,
    lateral: 0,
    lap: 1,
    lapStart: 0,
    raceTime: 0,
    penaltyTime: 0,
    penalties: 0,
    lapTimes: [],
    bestLap: null,
    totalTime: 0,
    nextGate: 0,
    nextGateAt: track.gates[0].at,
    gateStates: ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'],
    gatesPassed: 0,
    gatesMissed: 0,
    boost: 50,
    boosting: false,
    onPad: false,
    padCooldown: 0,
    barrierCooldown: 0,
    shake: 0,
    sparks: 0,
    message: null,
    messageUntil: 0,
    particles: [],
    muted: false,
  };

  // Sound hooks, wired by main.js (the world itself stays silent).
  const hooks = { chime: () => {}, whoosh: () => {}, hit: () => {}, penalty: () => {}, beep: () => {} };
  function on(name, fn) {
    hooks[name] = fn;
  }

  function setMessage(text, seconds) {
    state.message = text;
    state.messageUntil = state.raceTime + seconds;
  }

  function spawnParticle(x, y, z, vx, vy, vz, life, color) {
    if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
    state.particles.push({ x, y, z, vx, vy, vz, life, maxLife: life, color });
  }

  function burstSparks() {
    const ship = state.ship;
    const back = [Math.sin(ship.heading), Math.cos(ship.heading)];
    for (let i = 0; i < 14; i += 1) {
      const a = random() * Math.PI * 2;
      const s = 4 + random() * 10;
      spawnParticle(
        ship.x - back[0] * 1.5, 1.1, ship.z - back[1] * 1.5,
        Math.cos(a) * s, 1 + random() * 4, Math.sin(a) * s,
        0.4 + random() * 0.3, 0xffa726,
      );
    }
    state.sparks += 1;
  }

  function burstBoost() {
    const ship = state.ship;
    const back = [Math.sin(ship.heading), Math.cos(ship.heading)];
    for (let i = 0; i < 3; i += 1) {
      spawnParticle(
        ship.x - back[0] * 2 + (random() - 0.5) * 0.8, 0.9 + random() * 0.4, ship.z - back[1] * 2 + (random() - 0.5) * 0.8,
        -back[0] * 14 + (random() - 0.5) * 3, random() * 1.5, -back[1] * 14 + (random() - 0.5) * 3,
        0.35 + random() * 0.25, i % 2 === 0 ? 0x00e5ff : 0xff9f1c,
      );
    }
  }

  function resetRace() {
    const s = track.pointAt(0);
    const t = track.tangentAt(0);
    state.ship.x = s[0];
    state.ship.z = s[1];
    state.ship.heading = Math.atan2(t[0], t[1]);
    state.ship.speed = 0;
    state.progress = 0;
    state.lastIndex = 0;
    state.lateral = 0;
    state.lap = 1;
    state.lapStart = 0;
    state.raceTime = 0;
    state.penaltyTime = 0;
    state.penalties = 0;
    state.lapTimes = [];
    state.bestLap = null;
    state.totalTime = 0;
    state.nextGate = 0;
    state.nextGateAt = track.gates[0].at;
    state.gateStates = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'];
    state.gatesPassed = 0;
    state.gatesMissed = 0;
    state.boost = 50;
    state.boosting = false;
    state.onPad = false;
    state.padCooldown = 0;
    state.barrierCooldown = 0;
    state.shake = 0;
    state.message = null;
    state.particles = [];
  }

  function startCountdown() {
    resetRace();
    state.phase = PHASE_COUNTDOWN;
    state.countdown = RACE.countdownSeconds;
    state.countdownBeep = 4;
  }

  function finishRace() {
    state.phase = PHASE_RESULTS;
    state.totalTime = state.raceTime + state.penaltyTime;
    state.ship.speed = 0;
    setMessage('', 0);
  }

  /** Resolve the next gate now that the ship has crossed its line. */
  function resolveGate() {
    const resolved = state.nextGate;
    const passed = Math.abs(state.lateral) <= GATE.halfWidth;
    state.gateStates[resolved] = passed ? 'passed' : 'missed';
    if (passed) {
      state.gatesPassed += 1;
      state.boost = Math.min(BOOST.max, state.boost + BOOST.gateGain);
      hooks.chime();
      setMessage('GATE CLEAR  +boost', 1.4);
    } else {
      state.gatesMissed += 1;
      state.penalties += 1;
      state.penaltyTime += RACE.gateMissPenalty;
      hooks.penalty();
      setMessage(`GATE MISSED  +${RACE.gateMissPenalty.toFixed(0)}s penalty`, 2.2);
    }
    state.nextGate += 1;
    if (state.nextGate >= track.gates.length) {
      state.nextGate = 0;
      state.nextGateAt = Math.floor(state.nextGateAt) + 1 + track.gates[0].at;
    } else {
      state.nextGateAt = Math.floor(state.nextGateAt) + track.gates[state.nextGate].at;
    }
  }

  function stepPhysics(dt, steer, throttle, wantBoost) {
    const ship = state.ship;
    state.lastSteer = steer;
    const speedRatio = Math.min(1, Math.abs(ship.speed) / SHIP.maxSpeed);
    ship.heading += steer * SHIP.turnRate * (SHIP.turnGrip + (1 - SHIP.turnGrip) * speedRatio) * dt;

    const boosting = wantBoost && state.boost > 0 && ship.speed > 5;
    state.boosting = boosting;
    if (boosting) state.boost = Math.max(0, state.boost - BOOST.drainPerSecond * dt);
    const top = boosting ? SHIP.boostSpeed : SHIP.maxSpeed;

    if (throttle > 0) ship.speed = Math.min(top, ship.speed + SHIP.accel * dt);
    else if (throttle < 0) {
      if (ship.speed > 0.5) ship.speed = Math.max(0, ship.speed - SHIP.brake * dt);
      else ship.speed = Math.max(-SHIP.reverseMax, ship.speed - SHIP.accel * 0.5 * dt);
    } else if (ship.speed > 0) ship.speed = Math.max(0, ship.speed - SHIP.coastDrag * dt);
    else if (ship.speed < 0) ship.speed = Math.min(0, ship.speed + SHIP.coastDrag * dt);

    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    ship.x += fx * ship.speed * dt;
    ship.z += fz * ship.speed * dt;

    // Where the ship is on the loop now.
    const near = track.nearest(ship.x, ship.z, state.lastIndex);
    let delta = near.index - state.lastIndex;
    if (delta > track.samples / 2) delta -= track.samples;
    if (delta < -track.samples / 2) delta += track.samples;
    const previousProgress = state.progress;
    state.progress += delta / track.samples;
    state.lastIndex = near.index;
    state.lateral = near.lateral;

    // Barrier: push the ship back inside the ribbon along the track normal only,
    // so the along-track motion is kept and the ship slides along the wall.
    // (Teleporting it to the edge at the current progress erased each step's
    // forward motion, which pinned the ship against the wall forever.)
    if (Math.abs(state.lateral) > TRACK.halfWidth - SHIP.radius) {
      const maxLateral = TRACK.halfWidth - SHIP.radius;
      const excess = Math.abs(state.lateral) - maxLateral;
      const nrm = track.normal[near.index];
      const side = Math.sign(state.lateral);
      ship.x -= side * nrm[0] * excess;
      ship.z -= side * nrm[1] * excess;
      state.lateral = side * maxLateral;
      if (state.barrierCooldown <= 0 && Math.abs(ship.speed) > 8) {
        ship.speed *= 0.55;
        state.shake = 1;
        burstSparks();
        hooks.hit();
        state.barrierCooldown = 0.5;
        // Slide along the wall instead of grinding into it: turn part-way
        // toward the track direction, so a ship pushed into the barrier
        // scrapes along it and can escape, rather than pinning forever.
        const tangent = track.tangentAt(state.progress % 1 < 0 ? state.progress % 1 + 1 : state.progress % 1);
        const tangentHeading = Math.atan2(tangent[0], tangent[1]);
        ship.heading += angleDiff(tangentHeading, ship.heading) * 0.35;
      }
    }
    if (state.barrierCooldown > 0) state.barrierCooldown -= dt;

    // Boost pads: a burst, meter and particles when the ship rolls over one.
    state.onPad = false;
    if (state.padCooldown > 0) state.padCooldown -= dt;
    for (const pad of track.pads) {
      const padAt = Math.floor(state.progress) + pad.at;
      const along = Math.abs(state.progress - padAt) * track.length;
      if (along < PAD.halfLength && Math.abs(state.lateral - pad.lateral) < PAD.halfWidth && state.padCooldown <= 0) {
        state.onPad = true;
        state.padCooldown = 1.2;
        ship.speed = Math.min(SHIP.boostSpeed, ship.speed + BOOST.padKick);
        state.boost = Math.min(BOOST.max, state.boost + BOOST.padGain);
        hooks.whoosh();
        burstBoost();
        setMessage('BOOST PAD', 1.0);
        break;
      }
    }

    // Gates, in race order.
    while (state.progress >= state.nextGateAt) resolveGate();

    // Lap lines.
    const lapNow = Math.floor(state.progress) + 1;
    if (lapNow > state.lap && state.lap <= RACE.laps) {
      const lapTime = state.raceTime - state.lapStart;
      state.lapTimes.push(lapTime);
      if (state.bestLap === null || lapTime < state.bestLap) state.bestLap = lapTime;
      state.lap = lapNow;
      state.lapStart = state.raceTime;
      state.gateStates = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'];
      if (lapNow > RACE.laps) {
        finishRace();
        return;
      }
      setMessage(lapNow <= RACE.laps ? `LAP ${lapNow} / ${RACE.laps}` : '', 1.6);
    }
    void previousProgress;

    if (state.boosting) burstBoost();
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
  }

  function stepParticles(dt) {
    const list = state.particles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 6 * dt;
      if (p.y < 0.1) p.y = 0.1;
    }
  }

  /**
   * Advance the world one fixed step. `input` is { steer, throttle, boost } during
   * racing; during the title the ship idles on the start line.
   */
  function step(dt, input) {
    if (state.phase === PHASE_TITLE) {
      // A slow idle drift so the title scene is alive: the ship hovers in place.
      state.ship.speed = 0;
      stepParticles(dt);
      return;
    }
    if (state.phase === PHASE_COUNTDOWN) {
      state.countdown -= dt;
      const whole = Math.ceil(state.countdown);
      if (whole < state.countdownBeep && whole >= 1) {
        state.countdownBeep = whole;
        hooks.beep(false);
      }
      if (state.countdown <= 0) {
        state.phase = PHASE_RACING;
        state.countdownBeep = 0;
        hooks.beep(true);
        setMessage('GO', 0.8);
      }
      stepParticles(dt);
      return;
    }
    if (state.phase !== PHASE_RACING) {
      stepParticles(dt);
      return;
    }
    state.raceTime += dt;
    if (state.message && state.raceTime > state.messageUntil) state.message = null;
    stepPhysics(dt, input.steer, input.throttle, input.boost);
    stepParticles(dt);
  }

  /** Pure-pursuit autopilot: steer at a point a little way up the track, flat out. */
  function autopilot() {
    const ship = state.ship;
    const look = (state.progress + 0.018) % 1;
    const target = track.pointAt(look < 0 ? look + 1 : look);
    const desired = Math.atan2(target[0] - ship.x, target[1] - ship.z);
    const error = angleDiff(desired, ship.heading);
    const steer = error > 0.12 ? 1 : error < -0.12 ? -1 : 0;
    const throttle = Math.abs(error) > 1.1 ? -1 : 1;
    const boost = Math.abs(error) < 0.25 && state.boost > 60;
    return { steer, throttle, boost };
  }

  return {
    state,
    track,
    on,
    startCountdown,
    resetRace,
    step,
    autopilot,
    /** Snapshot for the renderer, HUD and playtest hook. */
    snapshot() {
      return {
        phase: state.phase,
        countdown: state.countdown,
        speed: state.ship.speed,
        speedKmh: Math.round(Math.abs(state.ship.speed) * 3.6),
        lap: Math.min(state.lap, RACE.laps),
        laps: RACE.laps,
        raceTime: state.raceTime,
        penaltyTime: state.penaltyTime,
        totalTime: state.phase === PHASE_RESULTS ? state.totalTime : state.raceTime + state.penaltyTime,
        bestLap: state.bestLap,
        lapTimes: [...state.lapTimes],
        gatesPassed: state.gatesPassed,
        gatesMissed: state.gatesMissed,
        gateStates: [...state.gateStates],
        nextGate: state.nextGate + 1,
        steer: state.lastSteer || 0,
        boost: Math.round(state.boost),
        boosting: state.boosting,
        onPad: state.onPad,
        progress: state.progress,
        lateral: state.lateral,
        message: state.message,
        shake: state.shake,
        sparks: state.sparks,
        ship: { x: state.ship.x, z: state.ship.z, heading: state.ship.heading },
        particles: state.particles,
        muted: state.muted,
      };
    },
  };
}
