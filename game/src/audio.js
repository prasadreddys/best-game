// Synthesised sound only: every effect is built from oscillators and filtered noise, so
// the game ships no audio files and makes no network request. The audio context is
// created on the first user gesture; M mutes everything.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      // One second of white noise, reused by the whoosh and the hit.
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // The engine hum: a sawtooth plus a sub sine, quiet until the race starts.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineSub = context.createOscillator();
      engineSub.type = 'sine';
      engineSub.frequency.value = 28;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineSub.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineSub.start();
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  /** Engine pitch and loudness follow the ship's speed (0..1 of top speed). */
  function setEngine(ratio, racing) {
    if (!context || !engineGain) return;
    const t = context.currentTime;
    const target = racing ? 0.05 + ratio * 0.075 : 0;
    engineGain.gain.setTargetAtTime(target, t, 0.08);
    engineOsc.frequency.setTargetAtTime(55 + ratio * 165, t, 0.08);
    engineSub.frequency.setTargetAtTime(28 + ratio * 62, t, 0.08);
  }

  function blip(frequency, seconds, type, volume, when = 0) {
    if (!context) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  function noiseBurst(seconds, filterFrom, filterTo, volume) {
    if (!context || !noiseBuffer) return;
    const t = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrom, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t + seconds);
    filter.Q.value = 1.2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + seconds + 0.05);
  }

  return {
    /** Call from any key or pointer gesture; safe to call repeatedly. */
    unlock() {
      if (ensure()) resume();
    },
    setEngine,
    /** The short beep of the countdown, higher for GO. */
    beep(go) {
      if (!ensure()) return;
      blip(go ? 1318 : 880, go ? 0.35 : 0.16, 'sine', 0.25);
    },
    /** Two-note chime when a gate is passed cleanly. */
    gateChime() {
      if (!ensure()) return;
      blip(1046, 0.14, 'sine', 0.22);
      blip(1568, 0.22, 'sine', 0.2, 0.09);
    },
    /** Airy sweep for a boost pad or a boost burst. */
    whoosh() {
      if (!ensure()) return;
      noiseBurst(0.55, 500, 4200, 0.3);
    },
    /** Dull thud plus grit when the ship scrapes a barrier. */
    hit() {
      if (!ensure()) return;
      blip(90, 0.18, 'square', 0.28);
      noiseBurst(0.16, 900, 160, 0.22);
    },
    /** Low two-note sting for a missed gate. */
    penalty() {
      if (!ensure()) return;
      blip(220, 0.2, 'triangle', 0.22);
      blip(165, 0.3, 'triangle', 0.2, 0.14);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
