import { useState } from 'react';
import { login, register } from '../api/auth.js';
import { unlockAudio } from '../hooks/useAudio.js';

function speakError(msg) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(
    Object.assign(new SpeechSynthesisUtterance(msg), { rate: 0.9 })
  );
}

function SpeakBtn({ label }) {
  return (
    <button
      className="speak-btn"
      type="button"
      aria-label="Hear label"
      onClick={() => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(
          Object.assign(new SpeechSynthesisUtterance(label), { rate: 0.9 })
        );
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>
  );
}

export default function LoginScreen({ onLogin }) {
  const [mode, setMode]       = useState('login'); // 'login' | 'register'
  const [phone, setPhone]     = useState('');
  const [pin, setPin]         = useState('');
  const [name, setName]       = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!phone || !pin) return;
    setLoading(true);
    try {
      const data = await login(phone.trim(), pin.trim());
      onLogin(data.token);
    } catch (err) {
      setLoading(false);
      speakError(err.message);
    }
  }

  async function handleRegister() {
    if (!name || !regPhone || !regPin) return;
    if (!/^\d{4}$/.test(regPin)) { speakError('PIN must be 4 digits.'); return; }
    setLoading(true);
    try {
      const data = await register(name.trim(), regPhone.trim(), regPin.trim());
      onLogin(data.token);
    } catch (err) {
      setLoading(false);
      speakError(err.message);
    }
  }

  return (
    <div className="login-root">
      <div className="login-col">

        <div className="logo-block">
          <svg width="72" height="68" viewBox="0 0 72 68" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="lgLogin" x1="0" y1="0" x2="72" y2="68" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#F2B17A" />
                <stop offset="100%" stopColor="#A78BD7" />
              </linearGradient>
            </defs>
            <path d="M4,10 C4,7.8 5.8,6 8,6 L34,6 L34,62 L8,62 C5.8,62 4,60.2 4,58 Z" fill="url(#lgLogin)" opacity="0.55" />
            <rect x="33" y="6" width="6" height="56" fill="url(#lgLogin)" opacity="0.8" />
            <path d="M39,6 L64,6 C66.2,6 68,7.8 68,10 L68,58 C68,60.2 66.2,62 64,62 L39,62 Z" fill="url(#lgLogin)" />
            <line x1="47" y1="24" x2="61" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
            <line x1="47" y1="34" x2="61" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
            <line x1="47" y1="44" x2="55" y2="44" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          </svg>
          <div className="logo-wordmark">
            <span className="hadley">Hadley</span>
            <span className="read">read</span>
          </div>
        </div>

        <p className="tagline">Your tutor. Your pace. Your progress.</p>

        {mode === 'login' ? (
          <div className="form">
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Phone number</span>
                <SpeakBtn label="Phone number" />
              </div>
              <input
                type="tel"
                placeholder="07700 000 000"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">PIN</span>
                <SpeakBtn label="P I N — four digits" />
              </div>
              <input
                type="tel"
                placeholder="4-digit PIN"
                maxLength={4}
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onPointerDown={unlockAudio}
              onClick={handleLogin}
            >
              {loading ? 'Signing in…' : 'Get started'}
            </button>
            <p className="switch-link">
              New here?{' '}
              <button type="button" onClick={() => { setMode('register'); setLoading(false); }}>
                Register
              </button>
            </p>
          </div>
        ) : (
          <div className="form">
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Your name</span>
                <SpeakBtn label="Your name" />
              </div>
              <input
                type="text"
                placeholder="First name"
                autoComplete="given-name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Phone number</span>
                <SpeakBtn label="Phone number" />
              </div>
              <input
                type="tel"
                placeholder="07700 000 000"
                autoComplete="tel"
                inputMode="tel"
                value={regPhone}
                onChange={e => setRegPhone(e.target.value)}
              />
            </div>
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Choose a PIN</span>
                <SpeakBtn label="Choose a P I N — four digits" />
              </div>
              <input
                type="tel"
                placeholder="4 digits"
                maxLength={4}
                inputMode="numeric"
                value={regPin}
                onChange={e => setRegPin(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onPointerDown={unlockAudio}
              onClick={handleRegister}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <p className="switch-link">
              Already registered?{' '}
              <button type="button" onClick={() => { setMode('login'); setLoading(false); }}>
                Sign in
              </button>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
