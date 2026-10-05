// Original procedural score: slow overlapping chords, filtered water and small bubbles.
// No context or sound is created until play() is called from the Start gesture.
export function createDiveAudio({view = globalThis, onUnavailable = () => {}} = {}) {
  const Context = view.AudioContext || view.webkitAudioContext;
  const nodes = new Set(), sources = new Set(), transient = new Set();
  const chords = [
    [130.81,164.81,196,246.94], [110,146.83,196,261.63],
    [116.54,174.61,220,293.66], [98,146.83,196,246.94],
  ];
  let context = null, master = null, banks = [], disposed = false, playing = false, desired = false, failed = false;
  let version = 0, interval = null, suspendTimer = null, nextChordAt = 0, chordIndex = 0;
  const own = (node, source = false) => {nodes.add(node); if (source) sources.add(node); return node;};
  function gain(value, destination) {
    const node = own(context.createGain()); node.gain.value = value; node.connect(destination); return node;
  }
  function oscillator(frequency, destination, type = 'sine') {
    const node = own(context.createOscillator(), true);
    node.type = type; node.frequency.value = frequency; node.connect(destination); node.start(); return node;
  }
  function stopTransient() {
    for (const voice of [...transient]) {
      try {voice.source.stop();} catch { /* A scheduled sound can already have ended. */ }
      voice.source.disconnect(); voice.envelope.disconnect();
      nodes.delete(voice.source); nodes.delete(voice.envelope); sources.delete(voice.source);
    }
    transient.clear();
  }
  function stopScheduling() {
    if (interval !== null) view.clearInterval(interval);
    if (suspendTimer !== null) view.clearTimeout(suspendTimer);
    interval = suspendTimer = null;
  }
  function release() {
    stopScheduling(); stopTransient();
    for (const source of sources) {try {source.stop();} catch { /* Already stopped. */ }}
    sources.clear();
    for (const node of nodes) {try {node.disconnect();} catch { /* Already disconnected. */ }}
    nodes.clear(); banks = []; master = null;
    const previous = context; context = null;
    if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
  }
  function unavailable() {
    if (failed || disposed) return;
    failed = true; playing = desired = false; version++; release(); onUnavailable();
  }
  function initialize() {
    context = new Context();
    master = gain(0, context.destination);
    const lowpass = own(context.createBiquadFilter());
    lowpass.type = 'lowpass'; lowpass.frequency.value = 1150; lowpass.Q.value = .3; lowpass.connect(master);
    const delay = own(context.createDelay(.8)); delay.delayTime.value = .42;
    const echo = gain(.22, delay), wet = gain(.15, master);
    delay.connect(echo); delay.connect(wet); lowpass.connect(delay);
    banks = [0,1].map(() => {
      const envelope = gain(0, lowpass);
      const voices = chords[0].map((frequency, index) => {
        let destination = envelope;
        if (context.createStereoPanner) {
          const pan = own(context.createStereoPanner()); pan.pan.value = (index - 1.5) * .24;
          pan.connect(envelope); destination = pan;
        }
        return oscillator(frequency, destination, index === 0 ? 'triangle' : 'sine');
      });
      return {envelope, voices};
    });
    const waterFilter = own(context.createBiquadFilter());
    waterFilter.type = 'lowpass'; waterFilter.frequency.value = 620; waterFilter.Q.value = .4;
    const highpass = own(context.createBiquadFilter()); highpass.type = 'highpass'; highpass.frequency.value = 70;
    const waterGain = gain(.18, master); waterFilter.connect(highpass); highpass.connect(waterGain);
    const noise = own(context.createBufferSource(), true);
    const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * 5), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * .022) / 1.022;
        data[i] = previous * 3;
      }
      const seam = data.at(-1) - data[0];
      for (let i = 0; i < data.length; i++) data[i] -= seam * i / (data.length - 1);
    }
    noise.buffer = buffer; noise.loop = true; noise.connect(waterFilter); noise.start();
    oscillator(.12, gain(.055, waterGain.gain));
    oscillator(.047, gain(110, waterFilter.frequency));
  }
  function tone(at, frequency, duration, volume) {
    if (!context || !master) return;
    const source = own(context.createOscillator(), true), envelope = gain(0, master);
    const voice = {source,envelope}; transient.add(voice);
    source.type = 'sine';
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(frequency * .36, at + duration);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(envelope);
    source.onended = () => {
      if (!transient.delete(voice)) return;
      source.disconnect(); envelope.disconnect();
      nodes.delete(source); nodes.delete(envelope); sources.delete(source);
    };
    source.start(at); source.stop(at + duration + .01);
  }
  function schedule() {
    if (!playing || !context || disposed) return;
    // Browser timer throttling can skip a bar, but never queues a burst of old notes.
    nextChordAt = Math.max(nextChordAt, context.currentTime + .025);
    while (nextChordAt < context.currentTime + 16) {
      const bank = banks[chordIndex % 2], chord = chords[chordIndex % chords.length], at = nextChordAt;
      bank.voices.forEach((voice, index) => voice.frequency.setValueAtTime(chord[index], at));
      bank.envelope.gain.setValueAtTime(0, at);
      bank.envelope.gain.linearRampToValueAtTime(.055, at + 2.8);
      bank.envelope.gain.setValueAtTime(.055, at + 8);
      bank.envelope.gain.linearRampToValueAtTime(0, at + 10.8);
      tone(at + 2.4, 460 + chordIndex % 3 * 70, .24, .045);
      tone(at + 5.9, 610 - chordIndex % 4 * 45, .2, .028);
      nextChordAt += 8; chordIndex++;
    }
  }
  return {
    get available() {return typeof Context === 'function' && !failed && !disposed;},
    async play() {
      if (disposed || failed) return false;
      if (typeof Context !== 'function') {unavailable(); return false;}
      desired = true;
      const request = ++version;
      if (playing) return true;
      stopScheduling();
      try {
        if (!context) initialize();
        const requestedContext = context;
        if (requestedContext.state !== 'running') await requestedContext.resume();
        if (disposed || request !== version || context !== requestedContext) {
          if (!disposed && !desired && context === requestedContext) void requestedContext.suspend().catch(() => {});
          return false;
        }
        if (context.state !== 'running') throw new Error('Audio resume unavailable');
        playing = true;
        const now = context.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(.14, now, .25);
        nextChordAt = now + .035; schedule();
        interval = view.setInterval(schedule, 1500);
        return true;
      } catch {
        if (request === version) unavailable();
        return false;
      }
    },
    capture() {
      if (!playing || disposed || !context) return false;
      tone(context.currentTime + .005, 1150, .065, .095);
      return true;
    },
    pause() {
      if (disposed) return;
      version++; playing = desired = false; stopScheduling(); stopTransient();
      if (!context || !master) return;
      const now = context.currentTime, previous = context;
      master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(0, now, .018);
      for (const bank of banks) {
        bank.envelope.gain.cancelScheduledValues(now); bank.envelope.gain.setTargetAtTime(0, now, .018);
        bank.voices.forEach(voice => voice.frequency.cancelScheduledValues(now));
      }
      suspendTimer = view.setTimeout(() => {
        suspendTimer = null;
        if (!disposed && !playing && context === previous) void previous.suspend().catch(unavailable);
      }, 120);
    },
    dispose() {
      if (disposed) return;
      disposed = true; playing = desired = false; version++;
      if (master && context) {master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0,context.currentTime);}
      release();
    },
  };
}
