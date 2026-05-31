# HadleyRead — Rules for Claude Code

Read this before touching any file. These rules are non-negotiable.
Full rationale in hadleyread-teaching-engine-v2.md.

---

## Core Rule

The engine controls structure. GPT-4o controls language only.

GPT-4o must never control: word choice, phase progression, baseline sequence, move forward/back decisions, mastery levels, session structure.

---

## Database Schema

### users
id, name, phone, pin_hash, created_at, baseline_done (0|1), baseline_progress (JSON), current_phase, current_pattern, last_session_date, total_sessions

### sessions
id, user_id, started_at, ended_at, words_attempted, words_correct, phase_working_on, performance_pct

### words
id, user_id, word, pattern, phase, times_attempted, times_correct, mastery_level (0-3), contexts_correct (JSON), sessions_correct, first_seen, last_attempted, status (learning|secure|saved|problem)

### attempts
attempt_id, user_id, session_id, word, pattern, phase, context (isolated|sentence|wild), attempt_number, transcript, outcome (correct|close|wrong|saved|unclear), confidence (high|medium|low), likely_error, created_at

### exchanges
id, session_id, user_id, created_at, role (user|assistant), transcript

---

## Baseline Rules

- Runs once only. baseline_done = 0.
- Opening message is a hardcoded server string — never GPT-4o:
  "Hi [name], welcome to HadleyRead. I'm going to show you a few words and I want you to say them out loud. This is just so I know where to start with you."
- GPT-4o is completely silent during baseline — no speech, no coaching, no word choice.
- GPT-4o may only be used as a silent judgement fallback for ambiguous transcripts — returns JSON only, no speech.
- Words appear on screen silently — never spoken aloud.
- No feedback between words — silence only.
- Server controls word sequence entirely.

### Baseline word sequence
1. cat — short vowel
2. stop — blend
3. shop — digraph
4. gate — magic E
5. rain — vowel pair
6. card — r-controlled
7. working — ending
8. induction — multi-syllable
9. confirmed — high value

Stop when: 2 wrong in a row, or all 9 exhausted.

### Baseline completion
- Set baseline_done = 1 only after all data written to DB
- Set current_phase and current_pattern to earliest unstable level
- If all correct: set to Phase 8/9, not beginner
- If unclear: start slightly below uncertain level
- Never begin teaching unless baseline_done = 1 AND current_phase AND current_pattern are all present

### Baseline interruption
- Store progress in baseline_progress JSON
- On resume: "Welcome back [name]. Let's carry on from where we were."
- Never restart from scratch

### Baseline judgement JSON (GPT-4o fallback only)
```json
{
  "targetWord": "cat",
  "heardAs": "cap",
  "outcome": "correct|close|wrong|unclear",
  "confidence": "high|medium|low",
  "likelyError": "initial_sound|vowel_sound|final_sound|added_sound|omitted_sound|whole_word|unclear|none"
}
```
- Low confidence = do not mark wrong automatically
- Unclear = try another word at same level

---

## Teaching Rules

### Session state (track this on the server per session)
```json
{
  "currentMode": "baseline|rule_intro|practice|review|close",
  "currentPhase": "phase_1_short_vowels",
  "currentPattern": "short_a",
  "ruleIntroducedThisSession": false,
  "currentContext": "isolated|sentence|wild"
}
```

### Rule introduction
- One short spoken introduction per pattern per session
- Not repeated before every word
- Engine may trigger re-teach only as a deliberate event
- Practice words always appear silently after intro

### Word ordering per session
1. 2-3 known words (mastery 2+) — confidence first
2. Current phase words — main work
3. Review words if mixing applies
4. End with 1-2 known words

### Stuck detection
- 2 failures on same word in one session → save it, move on
- Word saved 3 times across sessions → flag as problem, address components first
- Never present same word more than twice per session
- Never present more than 3 saved words per session

### Progression
Move to next phase when: 80% of words green+, no word still red after 3 sessions, at least 1 session since phase introduced.
Go back when: words from previous phase appear wrong in sentence/wild context.

### Mixing (only when: 1 phase at 80% green+, in phase 3+, 3+ sessions completed)
- 60% current phase
- 20% previous phase review (green not dark green)
- 20% mastered words in sentence/wild context

---

## AI Coach Output — Teaching Mode Only

Every GPT-4o response must return:
```json
{
  "speech": "max 2 sentences, under 40 words",
  "wordOutcome": "correct|close|wrong|saved|null",
  "targetWord": "word attempted or null",
  "nextAction": "retry_same_word|next_word|save_word|teach_rule|start_review|end_session"
}
```

### nextAction logic
- correct → next_word
- close → retry_same_word
- wrong → retry_same_word (unless stuck rule hit)
- saved → save_word
- null → teach_rule | next_word | start_review | end_session

Engine validates and may override nextAction. Engine is final authority.

---

## Server Validation (speech field only)

### Reject if speech:
- Over 40 words
- More than 2 sentences
- Contains forbidden words: well done, great job, excellent, amazing, brilliant, fantastic, good job, proud, clever, superb, perfect, awesome, phoneme, grapheme, digraph, blend, test, lesson, school, teacher, children, class, kids, pupil, student
- Contains these patterns with targetWord: "The word is X", "Say X", "Try X", "It says X", "That word is X", "That was X", "You read X", or X as standalone modelled utterance
- Exception: do not reject if targetWord is: a, in, on, at, it, is, to, the

### speech must start with:
- correct → "Yep."
- close → "Almost."
- wrong → "Let's slow it down."
- saved → "I've saved that one."
- second attempt correct → "There it is."

### Rejection handling
- Max 2 rejections then use hardcoded fallback
- Log every rejection with reason

### Hardcoded fallbacks
- correct: "Yep. That pattern works every time."
- close: "Almost. Try it again."
- wrong: "Let's slow it down. Try the first sound, then the rest."
- second attempt correct: "There it is."
- saved: "I've saved that one. We'll come back to it."
- rule intro: "Here's how this one works. [rule in plain English]"
- session close: "That's it for today. Same time tomorrow."

All fallbacks must pass forbidden word check and stay under 40 words.

---

## Mastery Levels

0 = Red = Introduced (seen, not yet correct)
1 = Orange = Emerging (correct isolated 2+ times, 2+ sessions)
2 = Green = Secure (correct isolated + sentence, 3+ sessions)
3 = Dark green = Mastered (correct all 3 contexts, 4+ sessions, one session 7+ days after first seen)

---

## First Build Slice — Build Only This

Include:
- Register and login
- Baseline — adaptive 5-9 words, interruption/resume, results stored
- Transition to teaching — only when baseline_done = 1, current_phase and current_pattern set
- One teaching pattern from baseline result
- Rule introduction once per pattern per session
- 5-8 isolated practice words shown silently
- User reads via mic
- Validated AI feedback
- Words marked correct/close/wrong/saved
- Session ends naturally
- Progress saved to DB

Do not build yet:
- Progress calendar UI
- All 9 phases
- Mixed phase sessions
- Sentence/wild context
- Animations
- B2B features
