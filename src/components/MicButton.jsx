import { useEffect, useRef } from 'react';

const COUNTDOWN_MS = 8000;
const COUNTDOWN_C  = 2 * Math.PI * 66; // ≈ 414.69 — matches SVG r="66"

export default function MicButton({ state, statusText, onTap }) {
  const circleRef = useRef(null);

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;

    if (state === 'recording') {
      circle.style.transition = 'none';
      circle.style.strokeDashoffset = '0';
      void circle.getBoundingClientRect(); // force reflow before transition
      circle.style.transition = `stroke-dashoffset ${COUNTDOWN_MS}ms linear`;
      circle.style.strokeDashoffset = String(COUNTDOWN_C);
    } else {
      circle.style.transition = 'none';
      circle.style.strokeDashoffset = String(COUNTDOWN_C);
    }
  }, [state]);

  const isRecording = state === 'recording';
  const isDisabled  = state === 'disabled';

  return (
    <div className="mic-area">
      <div className="mic-btn-wrap">
        <button
          type="button"
          id="mic-btn"
          className={isRecording ? 'recording' : ''}
          disabled={isDisabled}
          aria-label="Tap to speak"
          onClick={onTap}
        >
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8"  y1="22" x2="16" y2="22" />
          </svg>
        </button>
        <svg className="countdown-ring" width="144" height="144" viewBox="0 0 144 144" aria-hidden="true">
          <circle ref={circleRef} cx="72" cy="72" r="66" />
        </svg>
      </div>
      <div id="status-text">{statusText}</div>
    </div>
  );
}
