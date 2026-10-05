export const CALM_PATTERNS = Object.freeze([
  Object.freeze({ id: 'light', label: '轻轻呼吸', inhaleMs: 3_000, exhaleMs: 3_000 }),
  Object.freeze({ id: 'steady', label: '从容呼吸', inhaleMs: 4_000, exhaleMs: 4_000 }),
  Object.freeze({ id: 'long-exhale', label: '慢慢呼出', inhaleMs: 4_000, exhaleMs: 6_000 }),
]);

function validateSettings({ patternId, durationMs }) {
  const pattern = CALM_PATTERNS.find(item => item.id === patternId);
  if (!pattern) throw new RangeError('Unknown breathing pattern');
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError('Duration must be a finite, nonnegative number of milliseconds');
  }
  return { patternId, durationMs, pattern };
}

/**
 * A session clock with explicit monotonic timestamps (milliseconds).
 * Only running time counts. read() also settles an elapsed deadline, so a
 * delayed frame or pause event cannot leave a completed session running.
 */
export function createCalmClock({ patternId = 'steady', durationMs = 60_000 } = {}) {
  let settings = validateSettings({ patternId, durationMs });
  let status = 'ready';
  let elapsedMs = 0;
  let activeBaseMs = 0;
  let startedAtMs = 0;
  let completedBy = null;

  function advance(nowMs) {
    if (!Number.isFinite(nowMs)) throw new TypeError('A finite timestamp is required');
    if (status !== 'running') return;
    elapsedMs = Math.max(elapsedMs, activeBaseMs + Math.max(0, nowMs - startedAtMs));
    if (settings.durationMs > 0 && elapsedMs >= settings.durationMs) {
      elapsedMs = settings.durationMs;
      status = 'finished';
      completedBy = 'duration';
    }
  }

  function snapshot() {
    const { inhaleMs, exhaleMs } = settings.pattern;
    const cycleMs = elapsedMs % (inhaleMs + exhaleMs);
    const phase = cycleMs < inhaleMs ? 'inhale' : 'exhale';
    const phaseDurationMs = phase === 'inhale' ? inhaleMs : exhaleMs;
    const phaseElapsedMs = phase === 'inhale' ? cycleMs : cycleMs - inhaleMs;
    const phaseProgress = phaseElapsedMs / phaseDurationMs;
    const eased = (1 - Math.cos(Math.PI * phaseProgress)) / 2;
    return {
      status,
      patternId: settings.patternId,
      durationMs: settings.durationMs,
      elapsedMs,
      remainingMs: settings.durationMs ? settings.durationMs - elapsedMs : null,
      progress: settings.durationMs ? elapsedMs / settings.durationMs : null,
      phase,
      phaseElapsedMs,
      phaseRemainingMs: phaseDurationMs - phaseElapsedMs,
      phaseProgress,
      expansion: phase === 'inhale' ? eased : 1 - eased,
      completedBy,
    };
  }

  return {
    read(nowMs) {
      advance(nowMs);
      return snapshot();
    },
    start(nowMs) {
      advance(nowMs);
      if (status === 'ready') {
        startedAtMs = nowMs;
        activeBaseMs = 0;
        status = 'running';
      }
      return snapshot();
    },
    pause(nowMs) {
      advance(nowMs);
      if (status === 'running') status = 'paused';
      return snapshot();
    },
    resume(nowMs) {
      advance(nowMs);
      if (status === 'paused') {
        startedAtMs = nowMs;
        activeBaseMs = elapsedMs;
        status = 'running';
      }
      return snapshot();
    },
    finish(nowMs) {
      advance(nowMs);
      if (status === 'running' || status === 'paused') {
        status = 'finished';
        completedBy = 'early';
      }
      return snapshot();
    },
    reset(nextSettings = {}) {
      settings = validateSettings({
        patternId: nextSettings.patternId ?? settings.patternId,
        durationMs: nextSettings.durationMs ?? settings.durationMs,
      });
      status = 'ready';
      elapsedMs = 0;
      activeBaseMs = 0;
      startedAtMs = 0;
      completedBy = null;
      return snapshot();
    },
  };
}
