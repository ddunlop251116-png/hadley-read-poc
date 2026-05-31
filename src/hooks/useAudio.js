let audioUnlocked = false;

// A single persistent Audio element reused for all playback.
// iOS Safari only trusts .play() calls on an element it has already played —
// creating a new Audio() after an async gap is treated as unprompted and blocked.
let sharedAudio = null;

function getSharedAudio() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  try {
    const a = getSharedAudio();
    a.volume = 0;
    a.play().catch(() => {});
    a.volume = 1;
  } catch (e) {}

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {}
}

function b64ToBlob(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/mpeg' });
}

// How long to wait after audio ends before resolving — gives the speaker
// time to fully clear so the mic doesn't capture playback bleed.
const POST_PLAY_BUFFER_MS = 300;

function playOne(base64) {
  return new Promise((resolve, reject) => {
    const audio = getSharedAudio();
    const url   = URL.createObjectURL(b64ToBlob(base64));

    audio.onended  = null;
    audio.onerror  = null;
    audio.volume   = 1;
    audio.src      = url;

    const cleanup = () => URL.revokeObjectURL(url);

    audio.onended = () => {
      cleanup();
      audio.onended = null;
      audio.onerror = null;
      // Buffer before resolving — prevents mic picking up speaker tail
      setTimeout(resolve, POST_PLAY_BUFFER_MS);
    };

    audio.onerror = () => {
      cleanup();
      audio.onended = null;
      audio.onerror = null;
      reject(new Error('audio playback error'));
    };

    audio.load();
    audio.play().catch(err => {
      cleanup();
      reject(err);
    });
  });
}

export function useAudio() {
  function play(base64) {
    if (!base64) return Promise.resolve();
    return playOne(base64);
  }

  async function playSegments(segments, silenceMs = 800) {
    for (let i = 0; i < segments.length; i++) {
      await playOne(segments[i]);
      if (i < segments.length - 1 && silenceMs > 0) {
        await new Promise(r => setTimeout(r, silenceMs));
      }
    }
  }

  return { play, playSegments, unlock: unlockAudio };
}
