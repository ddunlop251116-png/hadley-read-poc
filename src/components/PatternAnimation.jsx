import { useEffect, useRef } from 'react';

const ANIM_PATTERNS = {
  short_a:    { type: 'cvc',         word: 'cat',  vowelIdx: 1 },
  short_i:    { type: 'cvc',         word: 'bin',  vowelIdx: 1 },
  short_o:    { type: 'cvc',         word: 'top',  vowelIdx: 1 },
  short_u:    { type: 'cvc',         word: 'cup',  vowelIdx: 1 },
  short_e:    { type: 'cvc',         word: 'bed',  vowelIdx: 1 },
  s_blends:   { type: 'blend_start', word: 'stop', blendLen: 2 },
  l_blends:   { type: 'blend_start', word: 'flat', blendLen: 2 },
  r_blends:   { type: 'blend_start', word: 'grip', blendLen: 2 },
  end_blends: { type: 'blend_end',   word: 'belt', blendLen: 2 },
};

function makeLetter(ch) {
  const span = document.createElement('span');
  span.className = 'anim-letter';
  span.textContent = ch;
  span.style.cssText = 'opacity:0; transform:translateY(6px); transition:opacity 0.45s ease, transform 0.5s ease, color 0.5s ease, text-shadow 0.5s ease;';
  return span;
}

function showLetter(span) {
  span.style.opacity = '1';
  span.style.transform = 'translateY(0)';
}

// Soft gold — resting state after pulse
function goldGlow(span) {
  span.style.color = '#F2B17A';
  span.style.textShadow = '0 0 22px #F2B17A, 0 0 44px rgba(242,177,122,0.5)';
  span.style.transform = 'translateY(0) scale(1.1)';
}

// Strong white-hot pulse — the sound emphasis moment at ~1.5 s
function goldPulse(span) {
  span.style.color = '#ffffff';
  span.style.textShadow = '0 0 28px #F2B17A, 0 0 56px rgba(242,177,122,0.9), 0 0 88px rgba(242,177,122,0.5)';
  span.style.transform = 'translateY(0) scale(1.5)';
}

// Settle back after the pulse — vowel stays prominent
function goldSettle(span) {
  span.style.color = '#F2B17A';
  span.style.textShadow = '0 0 22px #F2B17A, 0 0 44px rgba(242,177,122,0.5)';
  span.style.transform = 'translateY(0) scale(1.1)';
}

// Subtle soft glow — for consonants and whole-word finish state
function softGlow(span) {
  span.style.color = '#F2B17A';
  span.style.textShadow = '0 0 16px rgba(242,177,122,0.6)';
}

// CVC — letters appear one by one, vowel pulses and stays prominent
// while the explanation audio plays, consonants join softly much later
function animCVC(stage, { word, vowelIdx }, timers) {
  const spans = word.split('').map(ch => { const s = makeLetter(ch); stage.appendChild(s); return s; });
  void stage.getBoundingClientRect();

  // Letters appear with 400 ms gaps (3 letters = 800 ms total, done at 1200 ms)
  spans.forEach((s, i) => timers.push(setTimeout(() => showLetter(s), i * 400)));

  const afterAll = spans.length * 400; // 1200 ms

  // Initial gold glow on vowel only (~1.3 s)
  timers.push(setTimeout(() => goldGlow(spans[vowelIdx]), afterAll + 100));

  // Strong pulse at ~1.5 s — when audio speaks the vowel sound
  timers.push(setTimeout(() => goldPulse(spans[vowelIdx]), 1500));

  // Settle back (~1.9 s) — vowel holds its glow solo while explanation plays
  timers.push(setTimeout(() => goldSettle(spans[vowelIdx]), 1900));

  // Consonants softly join at ~4.5 s — after the vowel has had time to land
  timers.push(setTimeout(() => {
    spans.forEach((s, i) => { if (i !== vowelIdx) softGlow(s); });
  }, 4500));

  // Full whole-word soft glow at ~6 s — near the end of the explanation audio
  timers.push(setTimeout(() => spans.forEach(softGlow), 6000));
}

// Blend start — blend letters highlight then pulse, rest of word builds out after
function animBlendStart(stage, { word, blendLen }, timers) {
  const blend = word.slice(0, blendLen);
  const rest  = word.slice(blendLen);

  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex; gap:3px; transition:gap 0.55s ease;';
  stage.appendChild(wrap);

  const blendSpans = blend.split('').map(ch => { const s = makeLetter(ch); wrap.appendChild(s); return s; });
  const restSpans  = rest.split('').map(ch => { const s = makeLetter(ch); stage.appendChild(s); return s; });

  void stage.getBoundingClientRect();

  blendSpans.forEach((s, i) => timers.push(setTimeout(() => showLetter(s), i * 220)));
  timers.push(setTimeout(() => blendSpans.forEach(goldGlow), 650));

  // Strong pulse at 1.5 s — when audio speaks the blend sound
  timers.push(setTimeout(() => blendSpans.forEach(goldPulse), 1500));
  timers.push(setTimeout(() => blendSpans.forEach(goldSettle), 1900));

  // After the pulse settles, separate the blend and reveal the rest
  timers.push(setTimeout(() => { wrap.style.gap = '18px'; }, 2100));
  restSpans.forEach((s, i) => timers.push(setTimeout(() => showLetter(s), 2400 + i * 280)));
}

// Blend end — all letters appear, end cluster highlighted then pulses
function animBlendEnd(stage, { word, blendLen }, timers) {
  const baseStr  = word.slice(0, word.length - blendLen);
  const blendStr = word.slice(word.length - blendLen);

  const baseSpans = baseStr.split('').map(ch => { const s = makeLetter(ch); stage.appendChild(s); return s; });

  const div = document.createElement('span');
  div.className = 'anim-divider';
  div.style.cssText = 'width:2px; height:0.65em; background:transparent; border-radius:2px; margin:0 4px; transition:background 0.5s ease;';
  stage.appendChild(div);

  const blendSpans = blendStr.split('').map(ch => { const s = makeLetter(ch); stage.appendChild(s); return s; });

  void stage.getBoundingClientRect();

  timers.push(setTimeout(() => [...baseSpans, ...blendSpans].forEach(showLetter), 80));
  timers.push(setTimeout(() => { div.style.background = '#5A4BBC'; }, 950));
  timers.push(setTimeout(() => blendSpans.forEach(goldGlow), 1200));

  // Strong pulse at 1.5 s — when audio speaks the end-blend sound
  timers.push(setTimeout(() => blendSpans.forEach(goldPulse), 1500));
  timers.push(setTimeout(() => blendSpans.forEach(goldSettle), 1900));
  timers.push(setTimeout(() => { div.style.background = '#F2B17A'; }, 2100));
}

export default function PatternAnimation({ pattern, hideNow }) {
  const areaRef  = useRef(null);
  const stageRef = useRef(null);

  // Run animation when pattern changes
  useEffect(() => {
    const area  = areaRef.current;
    const stage = stageRef.current;
    if (!area || !stage) return;

    // Reset area visibility and stage content
    stage.innerHTML = '';
    stage.style.opacity = '1';
    stage.style.transition = '';
    area.style.opacity = '';
    area.style.transition = '';

    const cfg = ANIM_PATTERNS[pattern];
    if (!cfg) {
      area.classList.add('hidden');
      return;
    }

    area.classList.remove('hidden');
    const timers = [];

    if (cfg.type === 'cvc')              animCVC(stage, cfg, timers);
    else if (cfg.type === 'blend_start') animBlendStart(stage, cfg, timers);
    else if (cfg.type === 'blend_end')   animBlendEnd(stage, cfg, timers);

    // No auto-hide — animation stays until audio ends (hideNow effect below)
    return () => timers.forEach(clearTimeout);
  }, [pattern]);

  // Fade out when the audio has finished playing
  useEffect(() => {
    const area = areaRef.current;
    if (!hideNow || !area || area.classList.contains('hidden')) return;

    area.style.transition = 'opacity 0.6s ease';
    area.style.opacity = '0';
    const t = setTimeout(() => {
      if (!areaRef.current) return;
      areaRef.current.classList.add('hidden');
      areaRef.current.style.opacity = '';
      areaRef.current.style.transition = '';
    }, 600);

    return () => clearTimeout(t);
  }, [hideNow]);

  return (
    <div id="pattern-animation" ref={areaRef} className="hidden" aria-hidden="true">
      <div id="anim-stage" ref={stageRef} />
    </div>
  );
}
