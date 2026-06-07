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

// Plays a recorded sound segment (base64 MP3) via Web Audio API with boosted
// gain and reduced playback rate — used for Danielle's phoneme recordings so
// they play louder and slower than normal TTS segments.
function playRecordedSound(base64) {
  return new Promise((resolve, reject) => {
    try {
      const ctx     = new (window.AudioContext || window.webkitAudioContext)();
      const binary  = atob(base64);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      ctx.decodeAudioData(bytes.buffer, (buffer) => {
        const source = ctx.createBufferSource();
        const gain   = ctx.createGain();

        source.buffer             = buffer;
        source.playbackRate.value = 0.75;  // 25% slower
        gain.gain.value           = 1.5;   // 50% louder

        source.connect(gain);
        gain.connect(ctx.destination);

        source.onended = () => {
          setTimeout(resolve, POST_PLAY_BUFFER_MS);
          ctx.close().catch(() => {});
        };

        source.start(0);
      }, (err) => {
        ctx.close().catch(() => {});
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function useAudio() {
  function play(base64) {
    if (!base64) return Promise.resolve();
    return playOne(base64);
  }

  // segments: array of base64 strings, or objects { data, isRecordedSound }
  // Pass objects when a segment needs the recorded-sound treatment.
  async function playSegments(segments, silenceMs = 800) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg && typeof seg === 'object' && seg.isRecordedSound) {
        await playRecordedSound(seg.data);
      } else {
        await playOne(seg);
      }
      if (i < segments.length - 1 && silenceMs > 0) {
        await new Promise(r => setTimeout(r, silenceMs));
      }
    }
  }

  return { play, playSegments, unlock: unlockAudio };
}
