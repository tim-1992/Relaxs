// Short, original synthesized percussion. Nothing is loaded or recorded.
export function createReleaseAudio() {
  let context = null;
  let master = null;
  let compressor = null;
  let noise = null;
  let enabled = false;
  let paused = false;
  let destroyed = false;
  let volume = .25;
  const voices = new Set();

  function stopVoices() {
    for (const voice of [...voices]) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* The short note may already have ended. */ }
      for (const node of voice.nodes) node.disconnect();
      voices.delete(voice);
    }
  }

  async function activate() {
    if (destroyed || !enabled || paused) return false;
    try {
      if (!context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) { enabled = false; return false; }
        context = new AudioContextClass();
        master = context.createGain();
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 24;
        compressor.ratio.value = 5;
        compressor.attack.value = .003;
        compressor.release.value = .12;
        master.gain.value = volume * .65;
        master.connect(compressor);
        compressor.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .16), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const activeContext = context;
      if (activeContext.state !== 'running') await activeContext.resume();
      // A blur, mute or unmount can happen while permission to play is pending.
      if (destroyed || !enabled || paused) {
        if (activeContext.state === 'running') await activeContext.suspend();
        return !destroyed && enabled;
      }
      return true;
    } catch {
      enabled = false;
      return false;
    }
  }

  function hit(index = 0, strength = .7) {
    if (!enabled || paused || destroyed || context?.state !== 'running') return;
    if (voices.size >= 10) return;
    const now = context.currentTime;
    const gain = context.createGain();
    const note = Math.max(0, Math.min(3, Math.round(index)));
    const duration = [.32, .13, .1, .24][note];
    const amplitude = Math.max(.05, Math.min(1, Number.isFinite(strength) ? strength : .7));
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(amplitude * .48, now + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    const source = note === 2 ? context.createBufferSource() : context.createOscillator();
    const nodes = [source, gain];
    if (note === 2) {
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1250;
      filter.Q.value = .7;
      source.connect(filter);
      filter.connect(gain);
      nodes.push(filter);
    } else {
      source.type = note === 1 ? 'triangle' : 'sine';
      source.frequency.setValueAtTime([145, 620, 0, 240][note], now);
      source.frequency.exponentialRampToValueAtTime([54, 230, 1, 95][note], now + duration);
      source.connect(gain);
    }
    gain.connect(master);
    const voice = {source, nodes};
    voices.add(voice);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      voices.delete(voice);
    };
    source.start(now);
    source.stop(now + duration + .02);
  }

  return {
    async enable() {
      if (destroyed) return false;
      enabled = true;
      return activate();
    },
    disable() {
      enabled = false;
      stopVoices();
      if (context?.state === 'running') void context.suspend().catch(() => {});
    },
    pause() {
      paused = true;
      stopVoices();
      if (context?.state === 'running') void context.suspend().catch(() => {});
    },
    async resume() {
      if (destroyed) return false;
      paused = false;
      return enabled ? activate() : true;
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(.5, value));
      if (master && context?.state !== 'closed') {
        master.gain.setTargetAtTime(volume * .65, context.currentTime, .025);
      }
    },
    hit,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      stopVoices();
      master?.disconnect();
      compressor?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      noise = master = compressor = context = null;
    },
  };
}
