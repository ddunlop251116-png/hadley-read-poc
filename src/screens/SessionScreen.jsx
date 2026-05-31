import { useState, useEffect, useRef } from 'react';
import { startSession, sendAudio, sendChoice } from '../api/session.js';
import { useRecording } from '../hooks/useRecording.js';
import { useAudio } from '../hooks/useAudio.js';
import WordDisplay from '../components/WordDisplay.jsx';
import TutorTranscript from '../components/TutorTranscript.jsx';
import MicButton from '../components/MicButton.jsx';
import PatternAnimation from '../components/PatternAnimation.jsx';

// appState: 'THINKING' | 'SPEAKING' | 'IDLE' | 'RECORDING' | 'ASKING' | 'COMPLETE'
const STATUS = {
  IDLE:      'Tap to speak',
  RECORDING: 'Listening…',
  THINKING:  'Thinking…',
  SPEAKING:  '',
  ASKING:    '',
  COMPLETE:  '',
};

export default function SessionScreen({ authToken, onProgress }) {
  const [appState,        setAppState]        = useState('THINKING');
  const [sessionId,       setSessionId]       = useState(null);
  const [currentWord,     setCurrentWord]     = useState(null);
  const [currentPattern,  setCurrentPattern]  = useState(null);
  const [tutorText,       setTutorText]       = useState(null);
  const [animHide,        setAnimHide]        = useState(false);
  const [tutorPaced,      setTutorPaced]      = useState(false);
  const [completionMsg,   setCompletionMsg]   = useState('');

  // Refs to avoid stale closures in async callbacks
  const sessionIdRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const { play, playSegments }            = useAudio();
  const { startRecording, stopRecording } = useRecording(handleRecordingStop);

  // Auto-stop after 8 seconds of recording
  useEffect(() => {
    if (appState !== 'RECORDING') return;
    const t = setTimeout(stopRecording, 8000);
    return () => clearTimeout(t);
  }, [appState]);

  // Start session on mount — guard against StrictMode double-invoke
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    beginSession();
  }, []);

  async function beginSession() {
    setCurrentWord(null);
    setCurrentPattern(null);
    setAnimHide(false);
    setTutorPaced(false);
    setTutorText(null);
    setAppState('THINKING');

    try {
      const data = await startSession(authTokenRef.current);
      sessionIdRef.current = data.sessionId;
      setSessionId(data.sessionId);

      if (data.pattern) {
        setCurrentPattern(data.pattern);
        setTutorPaced(true);  // rule intro — show text in paced phrases
      }

      setTutorText(data.tutorText);
      setAppState('SPEAKING');
      if (data.audioSegments) {
        await playSegments(data.audioSegments, 800);
      } else {
        await play(data.audio);
      }

      // Audio has ended — signal animation to fade out
      setAnimHide(true);

      if (data.currentWord) setCurrentWord(data.currentWord);
      setAppState('IDLE');
    } catch (err) {
      console.error('[session/start] error:', err);
      setAppState('IDLE');
    }
  }

  async function handleRecordingStop(blob) {
    if (blob.size < 1000) {
      setAppState('IDLE');
      return;
    }

    setAppState('THINKING');

    try {
      const data = await sendAudio(authTokenRef.current, sessionIdRef.current, blob);

      if (data.baselineComplete) {
        setCurrentWord(null);
        setTutorText(null);
        setAppState('SPEAKING');
        await play(data.audio);
        await beginSession();
        return;
      }

      if (!data.audio) {
        // Baseline mid-sequence — silent advance
        if (data.currentWord !== undefined) setCurrentWord(data.currentWord);
        setAppState('IDLE');
        return;
      }

      // Coaching response — show all text immediately (not paced)
      setTutorPaced(false);
      setTutorText(data.tutorText);
      setAppState('SPEAKING');
      await play(data.audio);

      if (data.currentWord !== undefined) setCurrentWord(data.currentWord);

      if (data.mode === 'asking') {
        setAppState('ASKING');
      } else {
        setAppState('IDLE');
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('no speech')) {
        setAppState('IDLE');
        return;
      }
      console.error('[exchange] error:', err);
      setTimeout(() => setAppState('IDLE'), 2000);
    }
  }

  async function handleChoice(choice) {
    setAppState('THINKING');
    try {
      const data = await sendChoice(authTokenRef.current, sessionIdRef.current, choice);

      if (data.sessionComplete) {
        setCurrentWord(null);
        setTutorText(data.tutorText);
        setAppState('SPEAKING');
        await play(data.audio);
        setCompletionMsg(data.tutorText || "That's it for today. Same time tomorrow.");
        setAppState('COMPLETE');
        return;
      }

      // 'continue' → next pattern rule intro
      if (data.pattern) {
        setCurrentPattern(data.pattern);
        setTutorPaced(true);
        setAnimHide(false);
      }
      setTutorText(data.tutorText);
      setAppState('SPEAKING');
      if (data.audioSegments) {
        await playSegments(data.audioSegments, 800);
      } else {
        await play(data.audio);
      }
      setAnimHide(true);
      if (data.currentWord) setCurrentWord(data.currentWord);
      setAppState('IDLE');
    } catch (err) {
      console.error('[choice] error:', err);
      setAppState('IDLE');
    }
  }

  function handleMicTap() {
    if (appState === 'IDLE') {
      startRecording().catch(err => {
        console.error('[mic] error:', err);
        setAppState('IDLE');
      });
      setAppState('RECORDING');
    } else if (appState === 'RECORDING') {
      stopRecording();
    }
  }

  const micState = appState === 'RECORDING' ? 'recording'
                 : appState === 'IDLE'      ? 'idle'
                 : 'disabled';

  return (
    <div className="session-root">
      <div className="session-col">

        <div className="session-header">
          <div className="header-logo">
            <svg width="28" height="26" viewBox="0 0 72 68" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="lgHeader" x1="0" y1="0" x2="72" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#F2B17A" />
                  <stop offset="100%" stopColor="#A78BD7" />
                </linearGradient>
              </defs>
              <path d="M4,10 C4,7.8 5.8,6 8,6 L34,6 L34,62 L8,62 C5.8,62 4,60.2 4,58 Z" fill="url(#lgHeader)" opacity="0.55" />
              <rect x="33" y="6" width="6" height="56" fill="url(#lgHeader)" opacity="0.8" />
              <path d="M39,6 L64,6 C66.2,6 68,7.8 68,10 L68,58 C68,60.2 66.2,62 64,62 L39,62 Z" fill="url(#lgHeader)" />
            </svg>
            <span className="header-wordmark">HadleyRead</span>
          </div>
          <button className="progress-icon-btn" onClick={onProgress} aria-label="View progress">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6"  y1="20" x2="6"  y2="14" />
            </svg>
          </button>
        </div>

        <PatternAnimation pattern={currentPattern} hideNow={animHide} />
        <WordDisplay word={currentWord} />
        <TutorTranscript text={tutorText} paced={tutorPaced} />

        <div className="flex-spacer" />

        {appState === 'COMPLETE' ? (
          <div className="complete-area">
            <p className="complete-message">{completionMsg}</p>
            <button
              className="choice-btn choice-btn--done"
              onClick={() => window.location.reload()}
            >
              Done for today
            </button>
          </div>
        ) : appState === 'ASKING' ? (
          <div className="choice-area">
            <button className="choice-btn choice-btn--continue" onClick={() => handleChoice('continue')}>
              Keep going
            </button>
            <button className="choice-btn choice-btn--done" onClick={() => handleChoice('done')}>
              Done for today
            </button>
          </div>
        ) : (
          <MicButton
            state={micState}
            statusText={STATUS[appState] ?? ''}
            onTap={handleMicTap}
          />
        )}

      </div>
    </div>
  );
}
