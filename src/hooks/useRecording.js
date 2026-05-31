import { useRef } from 'react';

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useRecording(onStop) {
  // Keep the callback in a ref so onstop always calls the latest version
  const onStopRef     = useRef(onStop);
  onStopRef.current   = onStop;

  const streamRef   = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);

  async function ensureStream() {
    if (streamRef.current && streamRef.current.active) return streamRef.current;
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return streamRef.current;
  }

  async function startRecording() {
    const stream   = await ensureStream();
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    chunksRef.current = [];
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const mime = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      onStopRef.current(blob);
    };
    recorder.start();
    recorderRef.current = recorder;
  }

  function stopRecording() {
    try { recorderRef.current?.stop(); } catch (e) {}
  }

  return { startRecording, stopRecording };
}
