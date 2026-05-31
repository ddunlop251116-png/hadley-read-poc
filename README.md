# Hadley Read — stage two

Stage one proved the loop: Whisper transcribes speech accurately, the 1–2s latency is acceptable, and the coach response feels right.

Stage two adds the read-aloud layer — the text is now shown in context before the word challenge begins.

---

## What's new in stage two

**Three pathways** — A (WhatsApp), B (Safety question), C (Site document). Switch between them with the tabs at the top.

**Read it to me** — tap the button and the full sentence is spoken aloud. The source is styled appropriately: green WhatsApp bubble, plain form question, left-bordered site document.

**Target word highlighted** — the key word is bolded in the sentence before anything is spoken.

**Coach introduction** — after the sentence plays, the coach says *"Now you try. Say 'induction'."* before the mic button appears.

**Two-attempt loop** — two dots track attempts. First attempt wrong: coach explains, try again. Still wrong: saved for later, move on.

**Context passed to coach** — the coach now receives the source sentence alongside the transcript, so it can teach the word in the context it lives in.

---

## How to run

Everything is the same as before. If the server is already stopped:

```bash
cd "/Users/danielledunlop/Documents/Claude/Projects/Hadley Read/hadley-read-poc"
npm start
```

Then open http://localhost:3000

For iPhone, the ngrok tunnel is still needed (see setup instructions below).

---

## What to watch for in the next test

1. **Does the read-aloud layer help?** Does hearing the sentence before being asked to say a word reduce hesitation?
2. **Does the coach intro feel right?** "Now you try. Say 'induction'." — is the transition from sentence to word challenge natural?
3. **Does he attempt more than one pathway unprompted?** If he taps A, B, C on his own, the navigation is working.
4. **Two-attempt loop** — does the "saved for later" exit feel respectful, not like a failure state?
5. **Timing** — three API calls happen in the read-aloud phase before the mic appears. Note if the wait feels long.

---

## Build sequence — where we are

- [x] Step 1 — Prove speech recognition works on iPhone in noise
- [x] Step 2 — Build read-aloud layer — text input, TTS output
- [ ] Step 3 — Write the system prompt properly
- [ ] Step 4 — Connect speech recognition to the confidence check loop (refine)
- [ ] Step 5 — Build the three demo pathways (done structurally — needs tuning after test)
- [ ] Step 6 — Name entry and home screen
- [ ] Step 7 — Put it in front of the primary tester

---

## File layout

```
hadley-read-poc/
├── package.json
├── server.js         <- three endpoints; coach now accepts context + attempt
├── public/
│   └── index.html    <- full stage two UI
├── .env              <- your API key (never shared)
├── .env.example
└── README.md
```

---

## Setup (if starting fresh)

### What you need
- MacBook with Node.js 18+
- OpenAI API key in a `.env` file (copy `.env.example`, paste your key)

### Run it
```bash
cd "/Users/danielledunlop/Documents/Claude/Projects/Hadley Read/hadley-read-poc"
npm install    # first time only
npm start
```

Open http://localhost:3000

### iPhone (HTTPS via ngrok)
Apple requires HTTPS for microphone access off localhost.

```bash
brew install ngrok
ngrok config add-authtoken <your-ngrok-token>
ngrok http 3000
```

Open the `https://...ngrok-free.app` URL in iPhone Safari.

---

## Things that might go wrong

**Audio doesn't play after Read it to me** — iOS mutes web audio if the silent switch is on. Flip it off.

**Mic button does nothing** — you may have opened the `http://` URL instead of the `https://` ngrok URL on iPhone.

**Slow read-aloud** — two TTS calls happen (sentence + coach intro). Combined ~2–3s. If this feels too slow, the sentence and intro can be merged into one call.
