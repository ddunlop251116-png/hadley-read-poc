
Read RULES.md before touching any file.
Reference hadleyread-teaching-programme.md for all word lists and rule scripts.

# Hadley Read — Project Context for Claude

Read this before touching anything. It captures every decision made, the reasoning behind it, and the exact state of the build.

---

## What this project is

A voice-first AI reading tutor for capable adults who struggle to decode written text. The primary user is a working-age man in a physical trade (groundwork, construction) who is intelligent, uses these words every day in speech, and has likely never been properly taught how written words work.

**The core problem is decoding, not comprehension or vocabulary.** He already knows what "induction" means. He cannot read the written form of it.

**The product is a voice loop:**
1. Coach explains a phonics rule and speaks examples aloud
2. User attempts a word by speaking into the microphone
3. Coach responds to exactly what was said

Everything is spoken. The user never has to read the interface to use it.

---

## The single most important rule

**Teach first. Always.**

The coach explains the pattern and reads examples aloud *before* the user ever attempts a word. Asking someone to read a word they have not been taught is a test, not teaching. This is not a test. It is a lesson.

The old approach (show a word, ask the user to say it, react to their attempt) was wrong. It was scrapped. Do not go back to it.

---

## Current build state

- **Frontend**: React 18 + Vite 6. Built with `npm run build` → output to `public/`. Served as static files by Express on port 3000.
- **Dev workflow**: `npm run dev:all` starts both the Express server (port 3000) and Vite dev server (port 5173) with the proxy forwarding `/api/*` to port 3000. Use `localhost:5173` during development. For iPhone testing: build first, then run `ngrok http 3000`.
- **Teaching loop**: 3 rounds per pattern (round 1 in order, rounds 2–3 shuffled). Words wrong in any round go to a struggling queue after round 3. Struggling words get up to 2 extra attempts then saved for later. Sense check after every 2 patterns: all words from both patterns mixed randomly, wrong words flagged for next session. After the sense check (and after odd-numbered patterns), the coach asks "Shall we move on to the next one, or are you done for today?" — mic hides, two buttons appear (Keep going / Done for today).
- **Baseline**: 3 words per level across 9 levels (27 words total). Adaptive stopping: after each level of 3, if 0–1 correct → stop and teach at that level; if 2–3 correct → advance to next level.
- **Pure sounds**: TTS approximations in place via SOUND_TTS_MAP (`...ah...` etc). Will be replaced with pre-recorded mp3 files. Drop a file into `public/sounds/sound_[pattern].mp3` and it is used automatically — no code change needed.
- **Pattern progression**: `getNextPattern(phase, pattern)` steps through all phases and patterns in order. `choice: 'continue'` in the exchange endpoint advances to next pattern and returns the rule intro audio segments.

## Previous build history

### What is done

**Stage 1 — POC (complete)**
Proved the core loop works: mic → Whisper → GPT-4o coach → TTS voice. Whisper handles speech accurately. The 1–2 second latency is acceptable. Tested on real speech.

**Stage 2 — Phonics progression with teach-first flow (complete)**
Rebuilt the entire UI around a phonics pattern progression. The flow is now:
1. Pattern is shown with its rule written out
2. "Hear the examples" button — coach speaks the rule aloud, then speaks each example word
3. Coach says "Now you try. Say '[word]'."
4. Mic button appears — user attempts the word
5. Two-attempt loop with dots tracking each attempt
6. Coach responds via GPT-4o + TTS
7. Next word or next pattern

### What is NOT done yet

- Step 3: System prompt refinement (current one is solid but needs real-world testing to tune)
- Step 4: The "saved for later" words are logged in UI state only — no persistence, no actual revisit mechanic
- Step 5: Workplace document context layer (reading a WhatsApp message, RAMS doc, etc.) — this comes after basics are mastered
- Step 6: Name entry and home screen ("Welcome to Hadley Read. You don't need to read the screen.")
- Step 7: Full test with the primary tester on iPhone

---

## File structure

```
hadley-read-poc/
├── server.js          — Express server, three endpoints
├── public/
│   └── index.html     — The entire UI, single file
├── .env               — OpenAI API key (never share or commit)
├── .env.example       — Template for the above
├── package.json
└── CLAUDE.md          — This file
```

### server.js — three endpoints

`POST /api/transcribe` — accepts raw audio bytes, sends to Whisper, returns `{ transcript }`.

`POST /api/coach` — accepts `{ transcript, targetWord, patternName, patternRule, attempt }`, calls GPT-4o with a pattern-aware system prompt, returns `{ reply }`.

`POST /api/tts` — accepts `{ text }`, returns mp3 audio via OpenAI TTS (voice: onyx — calm, low male voice).

### index.html — all logic is here

Single-page app with no framework. Key sections:
- `PATTERNS` array — all phonics pattern data (name, rule, examples, practice words)
- `renderPattern(pi, wi)` — sets up the UI for pattern `pi`, word `wi`
- `hearBtn` click handler — speaks the rule, then each example, then the intro prompt
- `handleStop()` — runs after recording stops: Whisper → coach → TTS
- Progress strip at the top — one pip per practice word, fills as user progresses

---

## The phonics progression (in PATTERNS array)

The sequence goes from simple to complex. Do not reorder it.

1. **Short A** — CVC words where 'a' makes the short sound (cat, van → cab, mat, trap, clap)
2. **Short I** — CVC words where 'i' makes the short sound (sit, kit → bin, hit, slip, trim)
3. **Magic E** — silent e makes the vowel say its name (name, site → gate, time, gave, ride)
4. **SH sound** — 's' and 'h' together make one sound (shop, shed → ship, wish, shelf, rush)
5. **TH sound** — tongue behind top teeth (this, that → then, path, thick, both)
6. **-TION ending** — always says 'shun' (action, section → nation, mention, protection, induction)

"Induction" is the *last* practice word in the *last* pattern. It belongs there — not at the start.

---

## Coach system prompt principles (non-negotiable)

These come from the handover doc and have been validated. Do not soften or change them without a specific reason.

**Never:**
- Explain what a word means (he already knows)
- Say "well done", "great job", "excellent" or similar praise
- Reference school, teachers, children, or lessons
- Use phonics jargon (phoneme, grapheme, blend, digraph) — use plain language
- Give a response longer than two sentences

**Always:**
- Respond to what the user *actually* said, not a generic response
- Stay calm, steady, direct — like a knowledgeable colleague
- Write for speech, not the screen (it is spoken aloud)
- On correct: brief confirmation + one sentence on why the pattern works
- On wrong: identify the exact part that went wrong, break the word into segments, ask them to try again

**Response patterns (exact):**
- Correct: `"Yep."` + one sentence on the rule
- Close: `"Almost."` + which sound was off + `"Try it again."`
- Wrong: `"Let's slow it down."` + word broken into parts with hyphens + `"Now put it together."`
- Second attempt correct: `"There it is."`
- Still wrong after two: `"I've saved that one. We'll come back to it."`

---

## What to watch for in the next test

1. Does the rule explanation make sense when spoken aloud? (It was written to be read — it may need shortening for TTS)
2. Does the gap between "Hear the examples" and the mic button appearing feel right, or too long?
3. Does he navigate between patterns on his own, or does he wait to be told?
4. Does the two-attempt limit feel respectful, or does it feel like being cut off?
5. Do the practice words feel too simple / childish, or appropriately matter-of-fact?

---

## Tech stack

- **Node.js + Express** — web server
- **OpenAI Whisper** — speech transcription
- **OpenAI GPT-4o** — coach brain
- **OpenAI TTS** (tts-1, voice: onyx) — coach voice
- No framework, no build step — just `npm start`

**To run:**
```bash
cd "/Users/danielledunlop/Documents/Claude/Projects/Hadley Read/hadley-read-poc"
npm start
# → http://localhost:3000
```

**For iPhone (HTTPS required for mic):**
```bash
ngrok http 3000
# Open the https://...ngrok-free.app URL in iPhone Safari
```

---

## What this project is NOT

- Not a children's phonics app. Never reference children, Jolly Phonics, reading ages, or school.
- Not a comprehension tool. Never ask if he understood something. He understood it.
- Not a test. The user is never shown a word without having been taught the pattern first.
- Not a game. No stars, badges, streaks, levels, or scores.
- Not built for a developer with time and prior experience — every script and instruction must be runnable by a non-developer on a Mac.

---

## The full handover doc

`Hadley-Read-Handover.docx` is in the parent folder (`/Users/danielledunlop/Documents/Claude/Projects/Hadley Read/`). It contains the original product brief, all key decisions with reasoning, the three demo pathways (WhatsApp, CSCS safety question, RAMS extract), and the original build sequence. Read it if you need the full backstory.

The build sequence from that doc:
- [x] Step 1 — Prove speech recognition works on iPhone in noise
- [x] Step 2 — Build read-aloud layer / phonics teach-first flow
- [ ] Step 3 — Refine system prompt based on real test results
- [ ] Step 4 — "Saved for later" persistence + revisit mechanic
- [ ] Step 5 — Workplace document context layer (reading actual texts)
- [ ] Step 6 — Name entry and welcome screen
- [ ] Step 7 — Full test with primary tester on iPhone
