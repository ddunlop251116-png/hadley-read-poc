import { useEffect, useRef } from 'react';

// Split on ". " followed by an uppercase letter — keeps "Listen — cat. van." intact
function splitPhrases(text) {
  const parts = text.split(/\.\s+(?=[A-Z])/).filter(Boolean);
  // Group into pairs so each display shows ~2 sentences
  const groups = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts.slice(i, i + 2);
    // Re-add the period that split() consumed, except on the very last fragment
    const joined = chunk.map((p, j) => p + (j < chunk.length - 1 ? '.' : '')).join(' ');
    groups.push(joined);
  }
  return groups;
}

export default function TutorTranscript({ text, paced }) {
  const elRef          = useRef(null);
  const timerRef       = useRef(null);
  const phraseTimers   = useRef([]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // Clear all pending timers from previous text
    clearTimeout(timerRef.current);
    phraseTimers.current.forEach(clearTimeout);
    phraseTimers.current = [];

    if (!text) {
      el.classList.remove('visible');
      return;
    }

    if (!paced) {
      // Coaching responses — show everything immediately
      el.textContent = text;
      el.classList.remove('visible');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => el.classList.add('visible'))
      );
      timerRef.current = setTimeout(() => el.classList.remove('visible'), 8000);
      return;
    }

    // Rule introductions — show phrase-by-phrase, paced with the spoken audio
    const phrases = splitPhrases(text);

    phrases.forEach((phrase, i) => {
      const t = setTimeout(() => {
        el.textContent = phrase;
        if (i === 0) {
          // First phrase: fade in from invisible
          el.classList.remove('visible');
          requestAnimationFrame(() =>
            requestAnimationFrame(() => el.classList.add('visible'))
          );
        }
        // Subsequent phrases: element already visible, text updates in place
      }, i * 2500);
      phraseTimers.current.push(t);
    });

    return () => {
      clearTimeout(timerRef.current);
      phraseTimers.current.forEach(clearTimeout);
    };
  }, [text, paced]);

  return <div id="tutor-transcript" ref={elRef} aria-live="polite" />;
}
