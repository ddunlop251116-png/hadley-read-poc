# HadleyRead — UI Specification for Claude Code

Build a single-file web app (`public/index.html`) for the HadleyRead AI reading tutor.
This replaces the existing index.html entirely.

---

## Design System

### Colours
```
--bg:          #0F1326   /* deep navy — primary background */
--purple:      #5A4BBC   /* primary purple */
--purple-light:#A78BD7   /* light purple — accents, secondary text */
--gold:        #F2B17A   /* gold — active states, highlights */
--cream:       #FFF4E6   /* cream — primary text on dark */
--slate:       #5B6070   /* slate — muted text, inactive */
--red:         #C0392B   /* error, recording state */
--green-dark:  #1a6b3a   /* mastered */
--green:       #27ae60   /* correct */
--orange:      #e67e22   /* nearly there */
--red-prog:    #c0392b   /* struggling */
```

### Typography
- Headlines: Playfair Display (load from Google Fonts)
- Body / UI: Inter (load from Google Fonts)
- Base size: 18px minimum — this user needs large readable text
- Target word shown during practice: 64px, Playfair Display, cream

### General rules
- Dark background throughout — `#0F1326` everywhere
- Large touch targets — minimum 56px height on all interactive elements
- Maximum width 480px, centred — mobile first
- No clutter — one primary action per screen
- Gradient on logo and key accents: gold `#F2B17A` → purple `#A78BD7`

---

## App Structure

Four screens, shown one at a time:
1. `#screen-login` — phone + PIN entry
2. `#screen-session` — the main tutor session
3. `#screen-progress` — progress calendar and word count
4. `#screen-loading` — shown briefly between transitions

---

## Screen 1 — Login

### Layout
- Full screen, dark navy background
- Centred column, vertically centred
- Logo at top: the HadleyRead book icon (SVG, gradient gold→purple) + "Hadley" in Playfair Display cream + "read" in light purple below
- Tagline below logo: "Your tutor. Your pace. Your progress." — Inter, slate, small

### Form
- Phone number input — large, cream text on slightly lighter navy card, rounded, labelled "Phone number"
- PIN input — same style, type=tel, maxlength=4, labelled "PIN"
- Both inputs have a speaker icon button beside the label — tapping it speaks the label aloud via the server TTS endpoint
- "Get started" button — full width, gradient background gold→purple, Playfair Display, cream text, 56px height, rounded
- "New here? Register" link below in slate — tapping switches to a register form (name + phone + PIN)

### Behaviour
- On load, tutor speaks: "Enter your phone number and a PIN to get started."
- On successful login, transition to session screen
- On error, tutor speaks the error — never show a text error alone

---

## Screen 2 — Session

### Layout (top to bottom)
1. Header bar — HadleyRead logo mark (small, top left) + progress icon (top right, taps to progress screen)
2. Word display area — centre of screen, shows current word large when relevant
3. Animation area — sits below the word, shows phonics animation when teaching a rule
4. Tutor transcript — small Inter text in slate, shows what the tutor just said (fades in, not permanent)
5. Mic button — large circle, bottom centre, always present
6. Status text — tiny, below mic button, e.g. "Hold to speak" / "Listening…" / "Thinking…"

### Word display
- Word shown in 64px Playfair Display, cream
- Individual letters rendered as separate spans so they can be animated independently
- Hidden when not in a word-practice moment

### Mic button
- 120px diameter circle
- Default state: `#5A4BBC` background, white mic SVG icon
- Recording state: `#C0392B` background, pulsing ring animation in gold
- Disabled state: 40% opacity
- Press and hold to record, release to send
- On release: status shows "Thinking…", button disabled until tutor responds
- Tutor audio plays automatically when received — no play button needed

### Tutor transcript
- Shows the text of what the tutor just said
- Fades in as audio plays
- Inter, 16px, `#A78BD7`
- Max 3 lines — truncates gracefully
- Fades out after 8 seconds or when next exchange begins

---

## Phonics Animations

Animations play in the animation area below the word display.
Each is a self-contained SVG or CSS animation, triggered by the session state.
All animations use the brand colours — gold for active sound, purple for the rule, cream for neutral letters.
Animations are smooth and warm — glows and pulses, not mechanical snaps.

### How animations are triggered
The server response will include a `animationType` field when a rule is being taught.
The client reads this and plays the corresponding animation.

Animation types and what they show:

**`short-vowel`**
Letters of the word appear one by one, cream. The vowel letter pulses gold and grows slightly when spoken. C — A (pulses gold) — T. Then the full word assembles.

**`consonant-blend`**
Two consonant letters slide in from either side, pause close together (showing they stay separate), then the rest of the word builds out to the right. Both blend letters glow gold briefly.

**`digraph`**
Two letters (e.g. S and H) appear side by side. They pulse, then merge into a single glowing gold block labelled "SH". The block then sits at the start of the word.

**`magic-e`**
The word appears without the final E. Then the E fades in at the end, gold. An arc animates from the E back to the vowel — the vowel changes colour from slate to gold and grows slightly, showing it now says its name.

**`vowel-pair`**
Two vowel letters appear and lock together — a subtle glow connects them into one unit. The pair pulses gold together.

**`r-controlled`**
The vowel appears first in cream. The R fades in beside it and its colour bleeds into the vowel, changing it to a warm gold-purple blend.

**`common-ending`**
The root word appears solid in cream. A vertical dividing line appears, then the ending attaches and lights up in gold — e.g. WORK | ING, the ING glows.

**`multi-syllable`**
The word appears split into syllables with subtle gaps — e.g. IN · DUC · TION. Each syllable lights up gold in sequence as it is spoken, then all merge back into the full word.

**`exception-word`**
The word appears with a distinct amber/gold border around it and a small star marker. A brief text note fades in below: "This one doesn't follow the rules." Different visual treatment from all other words.

**`none`**
No animation — just the word displayed. Used during practice attempts after the rule has been taught.

---

## Screen 3 — Progress

### Layout
- Back arrow top left returns to session
- "Your progress" heading — Playfair Display, cream, large
- Words you know — a single large number in gold, Playfair Display, 80px. Label below in Inter slate: "words you know"
- Session calendar grid below
- Words saved for later — a small count at the bottom

### Session calendar
- One cell per day the user has opened the app
- Cells are small rounded squares, arranged in rows of 7 (weeks)
- Colour per cell based on session performance:
  - No session: `#1a1f3a` (dark, empty)
  - Struggled (< 40% correct): `#c0392b` red
  - Some progress (40–70%): `#e67e22` orange
  - Good session (70–90%): `#27ae60` green
  - Excellent (90%+): `#1a6b3a` dark green
- Tapping a cell shows a small tooltip: date + words covered that day
- Calendar scrolls horizontally through weeks if needed
- Label above: "Your sessions" in Inter slate

### Words saved for later
- Small count: "X words to revisit" in slate
- Tapping expands a list of those words in cream Inter text

---

## Screen 4 — Loading

- Full screen navy
- HadleyRead logo mark centred, gently pulsing
- No text — just the logo breathing

---

## API Integration

Base URL: same origin (server runs on localhost:3000 or ngrok URL)

### Auth
```
POST /api/auth/login      { phone, pin } → { token, userId, name }
POST /api/auth/register   { name, phone, pin } → { token, userId, name }
```
Store token in memory (not localStorage — not supported in this environment).

### Session
```
POST /api/session/start
  Header: Authorization: Bearer {token}
  → { sessionId, tutorText, audio (base64 mp3) }

POST /api/session/exchange
  Header: Authorization: Bearer {token}
  Header: x-session-id: {sessionId}
  Body: raw audio bytes
  Content-Type: audio/webm (or audio/mp4 on iOS)
  → { userTranscript, tutorText, audio (base64 mp3), animationType?, currentWord? }

POST /api/session/end
  Header: Authorization: Bearer {token}
  Body: { sessionId }
  → { summary }

GET /api/progress
  Header: Authorization: Bearer {token}
  → { sessions, wordsSecure, wordsLearning, wordsSaved }
```

### Audio playback
- Decode base64 audio response to a Blob
- Play via Web Audio API or Audio element
- On iOS: unlock audio context on first user gesture (the login button tap counts)
- Never autoplay before user interaction

### Recording
- Use MediaRecorder API
- Prefer `audio/webm;codecs=opus` on desktop, `audio/mp4` on iOS
- Send raw bytes to `/api/session/exchange`
- Minimum recording length: 0.5 seconds — ignore shorter recordings

---

## State Machine

The app has these states. Only one is active at a time.

```
LOADING         → show loading screen
LOGIN           → show login screen
REGISTERING     → show register form
SESSION_IDLE    → session screen, mic ready, waiting for user
SESSION_RECORDING → mic active, red, pulsing
SESSION_THINKING  → mic disabled, status "Thinking…"
SESSION_SPEAKING  → tutor audio playing, word/animation showing
PROGRESS        → progress screen
```

Transitions:
- LOADING → LOGIN (on app start)
- LOGIN → SESSION_IDLE (on successful auth + session start)
- SESSION_IDLE → SESSION_RECORDING (mic press)
- SESSION_RECORDING → SESSION_THINKING (mic release)
- SESSION_THINKING → SESSION_SPEAKING (tutor response received)
- SESSION_SPEAKING → SESSION_IDLE (audio ended)
- SESSION_IDLE → PROGRESS (progress icon tap)
- PROGRESS → SESSION_IDLE (back arrow)

---

## File structure

```
public/
  index.html    ← everything in one file: HTML + CSS + JS
```

No build step. No framework. No dependencies loaded from npm — CDN only for Google Fonts.

---

## Important notes for Claude Code

1. The mic button must work on iPhone Safari — use touchstart/touchend not click for press-and-hold
2. iOS requires HTTPS for microphone — remind in console log, not in UI
3. Audio must be unlocked by user gesture before any playback — do this on the login button tap
4. All text on screen must be readable at arm's length — minimum 18px, prefer larger
5. The app must be fully usable without reading the interface — the tutor speaks everything important
6. Test that the login flow works end to end before moving to session screen
7. The brand colours and fonts are non-negotiable — use exactly the hex values in this spec
8. Playfair Display and Inter must load from Google Fonts at the top of the file
