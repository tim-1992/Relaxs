/** Quiet, local synthesis. play() must only be called from a user gesture. */
export function createCalmAudio({ onUnavailable = () => {} } = {}) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  let available = typeof Context === 'function';
  let context = null;
  let master = null;
  let nodes = [];
  let sources = [];
  let voices = {};
  let volume = 30;
  let playing = false;
  let disposed = false;
  let request = 0;
  let suspendTimer = null;
  let closeTimer = null;

  function track(node, source = false) {
    nodes.push(node);
    if (source) sources.push(node);
    return node;
  }

  function gain(value, destination) {
    const node = track(context.createGain());
    node.gain.value = value;
    node.connect(destination);
    return node;
  }

  function noise(buffer, destination) {
    const source = track(context.createBufferSource(), true);
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start();
  }

  function oscillator(frequency, destination, detune = 0) {
    const source = track(context.createOscillator(), true);
    source.type = 'sine';
    source.frequency.value = frequency;
    source.detune.value = detune;
    source.connect(destination);
    source.start();
  }

  function filter(type, frequency, destination) {
    const node = track(context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = .5;
    node.connect(destination);
    return node;
  }

  function makeNoise(brown) {
    const buffer = context.createBuffer(2, context.sampleRate * 6, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        previous = (previous + white * .025) / 1.025;
        data[i] = brown ? previous * 3.5 : white;
      }
      // Remove a low-frequency seam without imposing a periodic silence.
      if (brown) {
        const seam = data[data.length - 1] - data[0];
        for (let i = 0; i < data.length; i++) data[i] -= seam * i / (data.length - 1);
      }
    }
    return buffer;
  }

  function initialize() {
    context = new Context();
    master = gain(0, context.destination);
    voices = {
      sea: gain(0, master),
      rain: gain(0, master),
      space: gain(0, master),
    };

    const brown = makeNoise(true);
    const white = makeNoise(false);
    const seaLevel = gain(.5, voices.sea);
    noise(brown, filter('lowpass', 750, filter('highpass', 60, seaLevel)));
    oscillator(.085, gain(.18, seaLevel.gain));

    const rainLevel = gain(.22, voices.rain);
    noise(white, filter('lowpass', 3_000, filter('highpass', 450, rainLevel)));

    const spaceLevel = gain(.8, voices.space);
    oscillator(130.81, gain(.09, spaceLevel), -3);
    oscillator(164.81, gain(.045, spaceLevel), 1);
    oscillator(196, gain(.065, spaceLevel), 2);
    oscillator(261.63, gain(.035, spaceLevel), 1);
    oscillator(293.66, gain(.025, spaceLevel), -1);
    noise(brown, filter('lowpass', 420, gain(.12, spaceLevel)));
    oscillator(.055, gain(.12, spaceLevel.gain));
  }

  function fade(parameter, value, seconds = .09) {
    const time = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') {
      parameter.cancelAndHoldAtTime(time);
    } else {
      const current = parameter.value;
      parameter.cancelScheduledValues(time);
      parameter.setValueAtTime(current, time);
    }
    parameter.setTargetAtTime(value, time, seconds);
  }

  function stopSources(atTime) {
    for (const source of sources) {
      try { source.stop(atTime); } catch { /* A source may already be stopped. */ }
    }
    sources = [];
  }

  function close() {
    clearTimeout(closeTimer);
    closeTimer = null;
    for (const node of nodes) {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    nodes = [];
    voices = {};
    master = null;
    const previous = context;
    context = null;
    if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
  }

  function unavailable() {
    if (disposed) return;
    available = false;
    playing = false;
    request++;
    clearTimeout(suspendTimer);
    stopSources(context?.currentTime ?? 0);
    close();
    onUnavailable();
  }

  return {
    get available() { return available; },
    async play(sound = 'space', nextVolume = volume) {
      if (disposed || !available) return false;
      const version = ++request;
      clearTimeout(suspendTimer);
      suspendTimer = null;
      volume = Math.max(0, Math.min(100, Number(nextVolume) || 0));
      try {
        if (!context) initialize();
        // Both construction and resume are reached only by the caller's gesture.
        if (context.state !== 'running') await context.resume();
        if (disposed || version !== request || !context) return false;
        if (context.state !== 'running') throw new Error('Audio context could not resume');
        const selected = Object.hasOwn(voices, sound) ? sound : 'space';
        for (const [name, voice] of Object.entries(voices)) {
          fade(voice.gain, name === selected ? 1 : 0, .16);
        }
        playing = true;
        fade(master.gain, volume / 100 * .16);
        return true;
      } catch {
        if (version === request) unavailable();
        return false;
      }
    },
    setVolume(nextVolume) {
      volume = Math.max(0, Math.min(100, Number(nextVolume) || 0));
      if (disposed || !master || !playing) return;
      fade(master.gain, volume / 100 * .16);
    },
    pause() {
      if (disposed) return;
      request++;
      playing = false;
      clearTimeout(suspendTimer);
      if (!context || context.state === 'closed') return;
      fade(master.gain, 0, .025);
      const pausedContext = context;
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (disposed || playing || pausedContext !== context) return;
        void pausedContext.suspend().catch(unavailable);
      }, 160);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      request++;
      clearTimeout(suspendTimer);
      suspendTimer = null;
      if (!context) return;
      if (context.state === 'running' && master) {
        fade(master.gain, 0, .012);
        stopSources(context.currentTime + .065);
        // Let the final fade finish before disconnecting and closing the graph.
        closeTimer = setTimeout(close, 80);
      } else {
        stopSources(context.currentTime);
        close();
      }
    },
  };
}
