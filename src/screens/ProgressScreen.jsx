import { useState, useEffect } from 'react';
import { getProgress } from '../api/progress.js';

function PhaseLabel({ phase }) {
  const labels = {
    phase_1_short_vowels:     'Short vowels',
    phase_2_consonant_blends: 'Consonant blends',
    phase_3_digraphs:         'Digraphs',
    phase_4_magic_e:          'Magic E',
    phase_5_vowel_pairs:      'Vowel pairs',
    phase_6_r_controlled:     'R-controlled',
    phase_7_common_endings:   'Common endings',
    phase_8_multi_syllable:   'Multi-syllable',
    phase_9_adult_words:      'Adult words',
  };
  return labels[phase] || phase || '—';
}

function SessionDot({ session }) {
  const pct = session.performance_pct ?? 0;
  const color = pct >= 90 ? '#1a6b3a'
              : pct >= 70 ? '#27ae60'
              : pct >= 40 ? '#e67e22'
              : '#c0392b';

  const date = new Date(session.started_at);
  const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className="session-dot-wrap" title={`${label} — ${pct}%`}>
      <div className="session-dot" style={{ background: color }} />
      <span className="session-dot-date">{label}</span>
    </div>
  );
}

export default function ProgressScreen({ authToken, onBack }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [savedOpen, setSavedOpen] = useState(false);

  useEffect(() => {
    getProgress(authToken)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [authToken]);

  return (
    <div className="progress-root">
      <div className="progress-col">

        <div className="progress-header">
          <button className="back-btn" onClick={onBack} aria-label="Back to session">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="progress-title">Your progress</span>
          <div style={{ width: 24 }} />
        </div>

        {loading && (
          <div className="progress-loading">
            <div className="progress-pulse" />
          </div>
        )}

        {error && (
          <p className="progress-error">Couldn't load progress. Try again.</p>
        )}

        {data && (
          <>
            {/* ── Words known ─────────────────────────────── */}
            <div className="stat-hero">
              <span className="stat-number">{data.wordsSecure?.length ?? 0}</span>
              <span className="stat-label">words you know</span>
            </div>

            {/* ── Divider ──────────────────────────────────── */}
            <div className="progress-divider" />

            {/* ── Current position ────────────────────────── */}
            <div className="progress-section">
              <p className="progress-section-label">Working on</p>
              <p className="progress-current-phase">
                <PhaseLabel phase={data.user?.current_phase} />
              </p>
            </div>

            <div className="progress-divider" />

            {/* ── Sessions ────────────────────────────────── */}
            <div className="progress-section">
              <p className="progress-section-label">Sessions</p>
              <p className="progress-sessions-count">
                {data.user?.total_sessions ?? 0}
                <span> total</span>
              </p>

              {data.sessions?.length > 0 ? (
                <div className="session-dots-row">
                  {[...data.sessions].reverse().map((s, i) => (
                    <SessionDot key={i} session={s} />
                  ))}
                </div>
              ) : (
                <p className="progress-empty">No sessions yet.</p>
              )}

              <div className="session-legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#1a6b3a' }} />90%+</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#27ae60' }} />70–90%</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#e67e22' }} />40–70%</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#c0392b' }} />Under 40%</span>
              </div>
            </div>

            <div className="progress-divider" />

            {/* ── Saved words ─────────────────────────────── */}
            <div className="progress-section">
              <button
                className="saved-toggle"
                onClick={() => setSavedOpen(o => !o)}
              >
                <span>{data.wordsSaved?.length ?? 0} words saved for later</span>
                <svg
                  width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: savedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {savedOpen && (
                <div className="saved-words-list">
                  {data.wordsSaved?.length > 0 ? (
                    data.wordsSaved.map((w, i) => (
                      <span key={i} className="saved-word">{w}</span>
                    ))
                  ) : (
                    <p className="progress-empty">None saved yet.</p>
                  )}
                </div>
              )}
            </div>

          </>
        )}

      </div>
    </div>
  );
}
