// The Three.js renderer and the DOM HUD. The world is simulated in world.js; this file
// only paints what is there, so the simulation stays honest and the frame stays cheap
// enough for software rendering.

import * as THREE from 'three';
import { BOOST, GATE, PAD, PALETTE, TRACK } from './config.js';

const TRAIL_POINTS = 42;

function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(160,230,255,0.7)');
  gradient.addColorStop(1, 'rgba(0,180,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ribbonGeometry(track, halfWidth, lift, hex) {
  const samples = track.samples;
  const positions = new Float32Array((samples + 1) * 2 * 3);
  const colours = new Float32Array((samples + 1) * 2 * 3);
  const colour = new THREE.Color(hex);
  for (let s = 0; s <= samples; s += 1) {
    const i = s % samples;
    const c = track.centre[i];
    const n = track.normal[i];
    const o = s * 2 * 3;
    positions[o] = c[0] - n[0] * halfWidth;
    positions[o + 1] = lift;
    positions[o + 2] = c[1] - n[1] * halfWidth;
    positions[o + 3] = c[0] + n[0] * halfWidth;
    positions[o + 4] = lift;
    positions[o + 5] = c[1] + n[1] * halfWidth;
    colours[o] = colour.r;
    colours[o + 1] = colour.g;
    colours[o + 2] = colour.b;
    colours[o + 3] = colour.r;
    colours[o + 4] = colour.g;
    colours[o + 5] = colour.b;
  }
  const indices = [];
  for (let s = 0; s < samples; s += 1) {
    const a = s * 2;
    const b = s * 2 + 1;
    const c = s * 2 + 2;
    const d = s * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

export function createRenderer(canvas, hud, random) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 240);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 8, -14);

  scene.add(new THREE.AmbientLight(0x8a90c0, 0.85));
  const moonLight = new THREE.DirectionalLight(0xbfd0ff, 1.1);
  moonLight.position.set(-60, 90, -40);
  scene.add(moonLight);

  const glowTexture = makeGlowTexture();

  // Stars, scattered on a dome above the track.
  {
    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const e = 0.12 + random() * 1.1;
      const r = 300;
      positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
      positions[i * 3 + 1] = Math.sin(e) * r * 0.6 + 12;
      positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: PALETTE.star, size: 1.6, sizeAttenuation: false, fog: false }),
    );
    scene.add(stars);
  }

  // The moon: a pale disc low on the horizon.
  {
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(14, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false }),
    );
    moon.position.set(-150, 95, -260);
    moon.lookAt(0, 20, 0);
    scene.add(moon);
  }

  // Ground: one dark plane under everything.
  {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);
  }

  // The track ribbon, its glowing edge strips and a faint centre line.
  let trackRef = null;
  function buildTrack(track) {
    trackRef = track;
    const ribbon = new THREE.Mesh(
      ribbonGeometry(track, TRACK.halfWidth, 0, PALETTE.track),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    scene.add(ribbon);
    const left = new THREE.Mesh(
      ribbonGeometry(track, TRACK.halfWidth + 0.55, 0.06, PALETTE.edgeLeft),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    // The two edges need different colours: rebuild the right strip's colours.
    const rightGeo = ribbonGeometry(track, TRACK.halfWidth + 0.55, 0.06, PALETTE.edgeRight);
    const right = new THREE.Mesh(rightGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    // Shift the left strip's vertices to the left edge only and the right strip's to
    // the right edge only, so each strip is a thin neon line along its side.
    for (const [mesh, side] of [[left, -1], [right, 1]]) {
      const pos = mesh.geometry.attributes.position;
      const n = track.normal;
      for (let s = 0; s <= track.samples; s += 1) {
        const i = s % track.samples;
        const c = track.centre[i];
        const nx = n[i][0];
        const nz = n[i][1];
        const x = c[0] + nx * side * TRACK.halfWidth;
        const z = c[1] + nz * side * TRACK.halfWidth;
        const o = s * 2 * 3;
        pos.array[o] = x - nx * side * 0.35;
        pos.array[o + 1] = 0.06;
        pos.array[o + 2] = z - nz * side * 0.35;
        pos.array[o + 3] = x + nx * side * 0.35;
        pos.array[o + 4] = 0.06;
        pos.array[o + 5] = z + nz * side * 0.35;
      }
      pos.needsUpdate = true;
      scene.add(mesh);
    }
    const centre = new THREE.Mesh(
      ribbonGeometry(track, 0.18, 0.05, PALETTE.trackLine),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
    );
    scene.add(centre);
  }

  // Floodlight poles with warm lamps, a few real lights among many fake ones.
  function buildFloodlights(track) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242e });
    const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.floodlight });
    const spots = [0.03, 0.2, 0.38, 0.55, 0.72, 0.88];
    spots.forEach((p, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const c = track.pointAtLateral(p, side * (TRACK.halfWidth + 4));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 11, 8), poleMat);
      pole.position.set(c[0], 5.5, c[1]);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), lampMat);
      lamp.position.set(c[0], 11.2, c[1]);
      scene.add(lamp);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture, color: PALETTE.floodlight, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      sprite.scale.set(9, 9, 1);
      sprite.position.set(c[0], 11.2, c[1]);
      scene.add(sprite);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(0xffe9a8, 900, 70, 1.8);
        light.position.set(c[0], 10.5, c[1]);
        scene.add(light);
      }
    });
  }

  // Gates: glowing rings standing on the track, coloured by state.
  const gateMeshes = [];
  function buildGates(track) {
    const ringGeo = new THREE.TorusGeometry(GATE.ringRadius, 0.35, 10, 40);
    for (const gate of track.gates) {
      const c = track.pointAt(gate.at);
      const t = track.tangentAt(gate.at);
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PALETTE.gateNext }));
      mesh.position.set(c[0], GATE.ringRadius + 0.4, c[1]);
      mesh.rotation.y = Math.atan2(t[0], t[1]);
      mesh.userData.baseY = GATE.ringRadius + 0.4;
      scene.add(mesh);
      gateMeshes.push(mesh);
    }
  }

  // Boost pads: flat glowing strips laid on the track.
  const padMeshes = [];
  function buildPads(track) {
    const padGeo = new THREE.PlaneGeometry(PAD.halfWidth * 2, PAD.halfLength * 2);
    for (const pad of track.pads) {
      const c = track.pointAtLateral(pad.at, pad.lateral);
      const t = track.tangentAt(pad.at);
      const mesh = new THREE.Mesh(
        padGeo,
        new THREE.MeshBasicMaterial({ color: PALETTE.pad, transparent: true, opacity: 0.85 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -Math.atan2(t[0], t[1]);
      mesh.position.set(c[0], 0.08, c[1]);
      scene.add(mesh);
      padMeshes.push(mesh);
    }
  }

  // The hover-ship: a low wedge hull, a glowing canopy, side pods, engine glow and a
  // light trail made from its own recent positions.
  const shipGroup = new THREE.Group();
  {
    const hullMat = new THREE.MeshStandardMaterial({ color: PALETTE.shipHull, metalness: 0.7, roughness: 0.35 });
    const trimMat = new THREE.MeshBasicMaterial({ color: PALETTE.shipTrim });
    const canopyMat = new THREE.MeshBasicMaterial({ color: PALETTE.shipCanopy });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 3.4), hullMat);
    hull.position.y = 1.0;
    shipGroup.add(hull);
    // The nose cone: its apex is forward (+Z after the quarter turn), so the ship
    // reads as pointing the way it flies from any angle.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 4), hullMat);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 1.0, 2.4);
    shipGroup.add(nose);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.1), trimMat);
      fin.position.set(side * 0.8, 1.25, -1.7);
      fin.rotation.z = -side * 0.35;
      shipGroup.add(fin);
    }
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), canopyMat);
    canopy.scale.set(0.9, 0.55, 1.4);
    canopy.position.set(0, 1.45, 0.3);
    shipGroup.add(canopy);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 2.2), hullMat);
      pod.position.set(side * 1.35, 0.85, -0.4);
      shipGroup.add(pod);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 2.0), trimMat);
      strip.position.set(side * 1.35, 1.05, -0.4);
      shipGroup.add(strip);
      const engine = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.shipGlow }));
      engine.position.set(side * 0.85, 0.95, -2.1);
      shipGroup.add(engine);
    }
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: PALETTE.shipGlow, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    glow.scale.set(4.5, 2.2, 1);
    glow.position.set(0, 0.95, -2.4);
    shipGroup.add(glow);
    shipGroup.userData.glow = glow;
    shipGroup.scale.setScalar(1.3);
    const light = new THREE.PointLight(0x00b3ff, 260, 26, 1.8);
    light.position.set(0, 1.4, -2.2);
    shipGroup.add(light);
    scene.add(shipGroup);
  }

  // Trail: a fading line through the ship's recent positions.
  const trailPositions = new Float32Array(TRAIL_POINTS * 3);
  const trailColours = new Float32Array(TRAIL_POINTS * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColours, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }),
  );
  trail.frustumCulled = false;
  scene.add(trail);
  const trailHistory = [];

  // Particles: one Points cloud, recoloured and moved every frame.
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(400 * 3);
  const particleColours = new Float32Array(400 * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColours, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  particles.frustumCulled = false;
  scene.add(particles);

  const cameraTarget = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3(0, 8, -14);
  let time = 0;

  /** Put the chase camera exactly where it belongs, for screenshots (the live
   *  loop eases into the same spot over a few frames instead). */
  function snapCamera(snapshot) {
    const ship = snapshot.ship;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    cameraPosition.set(ship.x - fx * 11, 5.2, ship.z - fz * 11);
    camera.position.copy(cameraPosition);
    cameraTarget.set(ship.x + fx * 9, 1.6, ship.z + fz * 9);
    camera.lookAt(cameraTarget);
  }

  function draw(snapshot, screen, bestMs) {
    time += 1 / 60;
    const ship = snapshot.ship;
    const speedRatio = Math.min(1, Math.abs(snapshot.speed) / 58);

    // Ship pose: hover bob, lean into steering, engine flare on boost.
    shipGroup.position.set(ship.x, 1.0 + Math.sin(time * 5) * 0.08, ship.z);
    shipGroup.rotation.y = ship.heading;
    shipGroup.rotation.z = -snapshot.steer * 0.22;
    shipGroup.userData.glow.scale.set(4.5 + (snapshot.boosting ? 3.5 : 0) + speedRatio * 1.5, 2.2 + (snapshot.boosting ? 1.6 : 0), 1);
    shipGroup.userData.glow.material.opacity = 0.55 + speedRatio * 0.4;

    // Trail: keep the last positions, fade the tail.
    trailHistory.unshift([ship.x, 1.0, ship.z]);
    if (trailHistory.length > TRAIL_POINTS) trailHistory.pop();
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const p = trailHistory[Math.min(i, trailHistory.length - 1)] || [ship.x, 1.0, ship.z];
      trailPositions[i * 3] = p[0];
      trailPositions[i * 3 + 1] = p[1];
      trailPositions[i * 3 + 2] = p[2];
      const fade = 1 - i / TRAIL_POINTS;
      trailColours[i * 3] = 0;
      trailColours[i * 3 + 1] = 0.9 * fade;
      trailColours[i * 3 + 2] = 1 * fade;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    // Particles.
    const list = snapshot.particles;
    for (let i = 0; i < 400; i += 1) {
      const p = list[i];
      if (p) {
        particlePositions[i * 3] = p.x;
        particlePositions[i * 3 + 1] = p.y;
        particlePositions[i * 3 + 2] = p.z;
        const colour = new THREE.Color(p.color);
        const fade = Math.max(0, p.life / p.maxLife);
        particleColours[i * 3] = colour.r * fade;
        particleColours[i * 3 + 1] = colour.g * fade;
        particleColours[i * 3 + 2] = colour.b * fade;
      } else {
        particlePositions[i * 3 + 1] = -100;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;

    // Gates: next one pulses cyan, passed ones go green, missed ones go red.
    for (let i = 0; i < gateMeshes.length; i += 1) {
      const mesh = gateMeshes[i];
      const gateState = snapshot.gateStates ? snapshot.gateStates[i] : 'pending';
      const isNext = snapshot.nextGate === i + 1 && snapshot.phase === 'racing';
      if (isNext) {
        mesh.material.color.setHex(PALETTE.gateNext);
        const pulse = 1 + Math.sin(time * 6) * 0.12;
        mesh.scale.set(pulse, pulse, pulse);
        mesh.position.y = mesh.userData.baseY + Math.sin(time * 3) * 0.15;
      } else if (gateState === 'passed') {
        mesh.material.color.setHex(PALETTE.gatePassed);
        mesh.scale.set(1, 1, 1);
      } else if (gateState === 'missed') {
        mesh.material.color.setHex(PALETTE.gateMissed);
        mesh.scale.set(1, 1, 1);
      } else {
        mesh.material.color.setHex(0x1d3a4a);
        mesh.scale.set(1, 1, 1);
      }
    }

    // Pads pulse gently.
    for (const pad of padMeshes) {
      pad.material.opacity = 0.65 + Math.sin(time * 4 + pad.position.x) * 0.2;
    }

    // Chase camera: behind and above the ship, shaken by barrier hits.
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    const shake = snapshot.shake;
    const sx = (Math.random() - 0.5) * shake * 0.9;
    const sy = (Math.random() - 0.5) * shake * 0.6;
    cameraTarget.set(ship.x + fx * 9, 1.6, ship.z + fz * 9);
    cameraPosition.lerp(new THREE.Vector3(ship.x - fx * 11 + sx, 5.2 + sy, ship.z - fz * 11), 0.12);
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
    drawHud(snapshot, screen, bestMs);
  }

  function setText(id, value) {
    const el = hud[id];
    if (el && el.textContent !== value) el.textContent = value;
  }

  function drawHud(snapshot, screen, bestMs) {
    setText('speed', `${snapshot.speedKmh}`);
    setText('lap', `LAP ${snapshot.lap}/${snapshot.laps}`);
    setText('time', formatTime(snapshot.totalTime));
    setText('bestLap', `BEST LAP ${formatTime(snapshot.bestLap)}`);
    setText('bestTotal', `BEST TIME ${formatTime(bestMs === null ? null : bestMs / 1000)}`);
    setText('gate', `NEXT GATE ${snapshot.nextGate}/${6}`);
    setText('penalty', snapshot.penaltyTime > 0 ? `PENALTIES +${snapshot.penaltyTime.toFixed(1)}s` : '');
    if (hud.boostFill) hud.boostFill.style.width = `${snapshot.boost}%`;
    if (hud.boostFill) hud.boostFill.classList.toggle('low', snapshot.boost < 25);

    const show = (el, visible) => {
      if (el) el.classList.toggle('hidden', !visible);
    };
    show(hud.title, screen === 'title');
    show(hud.countdown, screen === 'countdown');
    show(hud.results, screen === 'results');
    show(hud.paused, screen === 'paused');
    show(hud.raceHud, screen === 'countdown' || screen === 'racing' || screen === 'paused');
    show(hud.hint, screen === 'title' || screen === 'racing');

    if (screen === 'countdown') {
      const n = Math.ceil(snapshot.countdown);
      setText('countdown', n >= 1 ? String(n) : 'GO!');
    }
    if (screen === 'results') {
      setText('finalTime', formatTime(snapshot.totalTime));
      setText('finalBestLap', formatTime(snapshot.bestLap));
      setText('finalGates', `${snapshot.gatesPassed} / 18 gates cleared`);
      setText('finalPenalties', snapshot.penalties > 0 ? `${snapshot.penalties} missed gate${snapshot.penalties > 1 ? 's' : ''} · +${snapshot.penaltyTime.toFixed(1)}s` : 'No gates missed — clean race');
      setText('finalBest', bestMs === null ? 'First finish on this browser' : `Best total ${formatTime(bestMs / 1000)}`);
    }
    if (snapshot.message) {
      setText('message', snapshot.message);
      show(hud.message, true);
    } else {
      show(hud.message, false);
    }
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return {
    scene,
    snapCamera,
    buildTrack,
    buildFloodlights,
    buildGates,
    buildPads,
    draw,
    resize,
  };
}
