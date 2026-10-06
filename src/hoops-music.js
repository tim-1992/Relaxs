// Original eight-bar court-pop sketch, synthesized locally; no recordings/assets.
const STEP = 60 / 118 / 2;
const ROOTS = [50, 47, 43, 45, 50, 43, 40, 45];
const LEAD = [
  [74, null, 69, 71, 73, null, 69, 66],
  [71, null, 66, 69, 71, 69, 66, null],
  [67, 69, null, 74, 71, null, 69, 67],
  [69, null, 73, 76, 73, 71, 69, null],
  [74, 73, 71, null, 69, 66, 69, null],
  [67, null, 71, 74, 71, 69, 67, null],
  [64, 67, 69, null, 71, 69, 67, 64],
  [69, 73, null, 76, 73, 71, 69, null],
];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export function createHoopsMusic() {
  let context = null, bus = null, output = null, noise = null;
  let enabled = false, paused = false, disposed = false, playing = false;
  let request = 0, preference = 0, timer = null, position = 0, anchor = 0, nextStep = 0;
  const voices = new Set(), persistent = [];
  const own = node => (persistent.push(node), node);
  const desired = () => enabled && !paused && !disposed;
  function silence() {
    if (playing && context) position = Math.max(0, context.currentTime - anchor) % (STEP * 64);
    playing = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (output && context?.state !== 'closed') {
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(0, context.currentTime);
    }
    for (const voice of voices) {
      voice.source.onended = null;
      try { voice.source.stop(context.currentTime); } catch { /* Already ended. */ }
      voice.nodes.forEach(node => node.disconnect());
    }
    voices.clear();
  }
  function suspend() {
    if (context && context.state !== 'closed') void context.suspend().catch(() => {});
  }
  function releaseContext() {
    silence();
    persistent.splice(0).forEach(node => node.disconnect());
    const previous = context;
    context = bus = output = noise = null;
    if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
  }
  function initialize() {
    if (context) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof Context !== 'function') throw new Error('Web Audio unavailable');
    context = new Context();
    bus = own(context.createGain());
    const filter = own(context.createBiquadFilter());
    filter.type = 'lowpass'; filter.frequency.value = 5200; filter.Q.value = .45;
    const compressor = own(context.createDynamicsCompressor());
    compressor.threshold.value = -18; compressor.knee.value = 24; compressor.ratio.value = 3.5;
    compressor.attack.value = .006; compressor.release.value = .16;
    output = own(context.createGain()); output.gain.value = 0;
    bus.connect(filter); filter.connect(compressor); compressor.connect(output); output.connect(context.destination);
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  }
  function voice(at, duration, amount, frequency, type = 'triangle', cutoff = 1800) {
    if (voices.size >= 24) return;
    const source = frequency == null ? context.createBufferSource() : context.createOscillator();
    const gain = context.createGain(), filter = context.createBiquadFilter();
    filter.type = frequency == null ? type : 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at); filter.Q.value = .55;
    if (frequency == null) source.buffer = noise;
    else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, at);
      if (type === 'sine') source.frequency.exponentialRampToValueAtTime(48, at + duration * .9);
      else filter.frequency.exponentialRampToValueAtTime(Math.max(350, cutoff * .45), at + duration);
    }
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(amount, at + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    const entry = {source, nodes: [source, filter, gain]};
    voices.add(entry);
    source.onended = () => {
      source.onended = null;
      entry.nodes.forEach(node => node.disconnect());
      voices.delete(entry);
    };
    source.start(at); source.stop(at + duration + .012);
  }
  function schedule(step, at) {
    const bar = Math.floor(step / 8) % 8, beat = step % 8, root = ROOTS[bar];
    // Backbeat, restrained eighth-note hats, and a small turnaround fill.
    if (beat === 0 || beat === 4 || beat === 7 && bar % 2 === 1) voice(at, .20, .65, 135, 'sine', 750);
    if (beat === 2 || beat === 6) {
      voice(at, .13, .25, null, 'bandpass', 1450);
      voice(at, .075, .08, 185, 'triangle', 1100);
    }
    voice(at, beat === 7 ? .085 : .045, beat % 2 ? .052 : .038, null, 'highpass', 4300);
    if (beat % 2 === 0) voice(at, .22, .20, hz(root + (beat === 6 ? 7 : 0)), 'triangle', 650);
    // Muted power-dyad strums give the loop a guitar-like pulse without distortion.
    if ([0, 3, 6].includes(beat)) {
      voice(at, .17, .042, hz(root + 12), 'sawtooth', 1850);
      voice(at + .008, .15, .033, hz(root + 19), 'sawtooth', 1700);
    }
    const note = LEAD[bar][beat];
    if (note !== null) voice(at + .012, beat === 7 ? .22 : .18, bar >= 4 ? .105 : .085, hz(note), 'triangle', 2300);
  }
  function tick() {
    timer = null;
    if (!playing || !desired() || context?.state !== 'running') return;
    try {
      const now = context.currentTime;
      // Skip a delayed timer's missed notes; never emit a catch-up burst.
      if (anchor + nextStep * STEP < now - .035) nextStep = Math.ceil((now - anchor) / STEP);
      while (anchor + nextStep * STEP < now + .14) {
        schedule(nextStep, Math.max(now + .002, anchor + nextStep * STEP));
        nextStep++;
      }
      timer = setTimeout(tick, 25);
    } catch {
      enabled = false; request++; releaseContext();
    }
  }
  async function activate(version) {
    if (!desired()) return false;
    if (playing && context?.state === 'running') return true;
    if (playing) silence();
    const active = context;
    try {
      // Always queue resume, even if a preceding asynchronous suspend is pending.
      await active.resume();
      if (version !== request || !desired() || active !== context) {
        if (active === context && !desired()) suspend();
        return false;
      }
      if (active.state !== 'running') throw new Error('Audio context did not resume');
      anchor = active.currentTime + (position === 0 ? .025 : 0) - position;
      nextStep = Math.ceil(position / STEP - 1e-8);
      output.gain.cancelScheduledValues(active.currentTime);
      output.gain.setValueAtTime(0, active.currentTime);
      output.gain.linearRampToValueAtTime(.12, active.currentTime + .035);
      playing = true;
      tick();
      return playing;
    } catch {
      if (version === request && !disposed) { enabled = false; releaseContext(); }
      return false;
    }
  }
  return {
    async enable() {
      if (disposed) return false;
      enabled = true;
      const selected = ++preference;
      const version = ++request;
      try { initialize(); }
      catch { enabled = false; releaseContext(); return false; }
      if (paused) { suspend(); return true; }
      const started = await activate(version);
      // Starting/resuming the game may supersede this activation, but not
      // the user's enabled preference. A later toggle does supersede it.
      return started || (!disposed && enabled && preference === selected);
    },
    disable() {
      if (disposed) return;
      enabled = false; preference++; request++; silence(); suspend();
    },
    pause() {
      if (disposed) return;
      paused = true; request++; silence(); suspend();
    },
    async resume() {
      if (disposed) return false;
      paused = false;
      const version = ++request;
      return enabled ? activate(version) : true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; preference++; request++; releaseContext();
    },
  };
}
