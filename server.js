// HadleyRead — Teaching Engine v2
// Implements the First Build Slice defined in hadleyread-teaching-engine-v2.md
//
// Architecture principle: the engine controls structure, the AI controls language.
// GPT-4o never controls word choice, phase progression, or baseline sequence.
//
// Endpoints:
//   POST /api/auth/register
//   POST /api/auth/login
//   POST /api/session/start
//   POST /api/session/exchange
//   POST /api/session/end
//   GET  /api/progress

import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { randomBytes, createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error('\nMissing OPENAI_API_KEY. Copy .env.example to .env and paste your key.\n');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Database ───────────────────────────────────────────────────────────────────
const db = new Database(join(__dirname, 'hadleyread.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    phone             TEXT    NOT NULL UNIQUE,
    pin_hash          TEXT    NOT NULL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    baseline_done     INTEGER NOT NULL DEFAULT 0,
    baseline_progress TEXT,
    current_phase     TEXT,
    current_pattern   TEXT,
    last_session_date TEXT,
    total_sessions    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    started_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT,
    words_attempted  INTEGER NOT NULL DEFAULT 0,
    words_correct    INTEGER NOT NULL DEFAULT 0,
    phase_working_on TEXT,
    performance_pct  INTEGER
  );

  CREATE TABLE IF NOT EXISTS words (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    word             TEXT    NOT NULL,
    pattern          TEXT,
    phase            TEXT,
    times_attempted  INTEGER NOT NULL DEFAULT 0,
    times_correct    INTEGER NOT NULL DEFAULT 0,
    mastery_level    INTEGER NOT NULL DEFAULT 0,
    contexts_correct TEXT    NOT NULL DEFAULT '[]',
    sessions_correct INTEGER NOT NULL DEFAULT 0,
    first_seen       TEXT,
    last_attempted   TEXT,
    status           TEXT    NOT NULL DEFAULT 'learning',
    UNIQUE(user_id, word)
  );

  CREATE TABLE IF NOT EXISTS attempts (
    attempt_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    session_id     INTEGER NOT NULL REFERENCES sessions(id),
    word           TEXT    NOT NULL,
    pattern        TEXT,
    phase          TEXT,
    context        TEXT    NOT NULL DEFAULT 'isolated',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    transcript     TEXT,
    outcome        TEXT,
    confidence     TEXT,
    likely_error   TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exchanges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    role        TEXT    NOT NULL,
    transcript  TEXT    NOT NULL
  );
`);

// Migrations — add columns to existing databases without failing if already present
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN baseline_progress TEXT`,
  `ALTER TABLE users ADD COLUMN current_phase TEXT`,
  `ALTER TABLE users ADD COLUMN last_session_date TEXT`,
  `ALTER TABLE users ADD COLUMN total_sessions INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE sessions ADD COLUMN words_attempted INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE sessions ADD COLUMN words_correct INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE sessions ADD COLUMN phase_working_on TEXT`,
  `ALTER TABLE sessions ADD COLUMN performance_pct INTEGER`,
  `ALTER TABLE words ADD COLUMN phase TEXT`,
  `ALTER TABLE words ADD COLUMN mastery_level INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE words ADD COLUMN contexts_correct TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE words ADD COLUMN sessions_correct INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE words ADD COLUMN first_seen TEXT`,
  `ALTER TABLE users ADD COLUMN current_pattern TEXT`,
];
for (const m of MIGRATIONS) { try { db.exec(m); } catch(e) {} }

// ── Baseline sequence — 3 words × 9 levels ────────────────────────────────────
// Adaptive stopping: after each level of 3, if 0–1 correct → stop and teach at that level.
// If 2–3 correct → advance to next level. All 9 levels passed → start at phase_9.
const BASELINE_LEVELS = [
  { level: 1, startPhase: 'phase_1_short_vowels',     startPattern: 'short_a',        words: [
    { word: 'cat',  pattern: 'short_a', phase: 'phase_1_short_vowels' },
    { word: 'bin',  pattern: 'short_i', phase: 'phase_1_short_vowels' },
    { word: 'top',  pattern: 'short_o', phase: 'phase_1_short_vowels' },
  ]},
  { level: 2, startPhase: 'phase_2_consonant_blends', startPattern: 's_blends',       words: [
    { word: 'flat', pattern: 'l_blends', phase: 'phase_2_consonant_blends' },
    { word: 'grip', pattern: 'r_blends', phase: 'phase_2_consonant_blends' },
    { word: 'stop', pattern: 's_blends', phase: 'phase_2_consonant_blends' },
  ]},
  { level: 3, startPhase: 'phase_3_digraphs',         startPattern: 'sh',             words: [
    { word: 'shop', pattern: 'sh', phase: 'phase_3_digraphs' },
    { word: 'thin', pattern: 'th', phase: 'phase_3_digraphs' },
    { word: 'back', pattern: 'ck', phase: 'phase_3_digraphs' },
  ]},
  { level: 4, startPhase: 'phase_4_magic_e',          startPattern: 'a_e',            words: [
    { word: 'gate', pattern: 'a_e', phase: 'phase_4_magic_e' },
    { word: 'time', pattern: 'i_e', phase: 'phase_4_magic_e' },
    { word: 'home', pattern: 'o_e', phase: 'phase_4_magic_e' },
  ]},
  { level: 5, startPhase: 'phase_5_vowel_pairs',      startPattern: 'ai_ay',          words: [
    { word: 'rain', pattern: 'ai_ay', phase: 'phase_5_vowel_pairs' },
    { word: 'keep', pattern: 'ea_ee', phase: 'phase_5_vowel_pairs' },
    { word: 'road', pattern: 'oa_ow', phase: 'phase_5_vowel_pairs' },
  ]},
  { level: 6, startPhase: 'phase_6_r_controlled',     startPattern: 'ar',             words: [
    { word: 'card', pattern: 'ar',       phase: 'phase_6_r_controlled' },
    { word: 'sort', pattern: 'or',       phase: 'phase_6_r_controlled' },
    { word: 'burn', pattern: 'er_ir_ur', phase: 'phase_6_r_controlled' },
  ]},
  { level: 7, startPhase: 'phase_7_common_endings',   startPattern: 'ing',            words: [
    { word: 'working', pattern: 'ing', phase: 'phase_7_common_endings' },
    { word: 'called',  pattern: 'ed',  phase: 'phase_7_common_endings' },
    { word: 'faster',  pattern: 'er',  phase: 'phase_7_common_endings' },
  ]},
  { level: 8, startPhase: 'phase_8_multi_syllable',   startPattern: 'two_syllable',   words: [
    { word: 'basket',   pattern: 'two_syllable', phase: 'phase_8_multi_syllable' },
    { word: 'payment',  pattern: 'two_syllable', phase: 'phase_8_multi_syllable' },
    { word: 'scaffold', pattern: 'two_syllable', phase: 'phase_8_multi_syllable' },
  ]},
  { level: 9, startPhase: 'phase_8_multi_syllable',   startPattern: 'three_syllable', words: [
    { word: 'induction', pattern: 'three_syllable', phase: 'phase_8_multi_syllable' },
    { word: 'important', pattern: 'three_syllable', phase: 'phase_8_multi_syllable' },
    { word: 'tomorrow',  pattern: 'three_syllable', phase: 'phase_8_multi_syllable' },
  ]},
];
const BASELINE_SEQUENCE = BASELINE_LEVELS.flatMap(lv => lv.words.map(w => ({ ...w, level: lv.level })));

// ── Teaching word lists (from hadleyread-teaching-programme.md) ───────────────
// Baseline words excluded from their own pattern's practice list.
// Rule strings are the plain-English summaries passed to GPT-4o (§GPT-4o Rule Summary table).
const TEACHING_PATTERNS = {
  phase_1_short_vowels: {
    // simple CVC → CVC with end cluster → CVC with initial blend
    short_a:  { rule: 'A between two consonants makes a short flat sound — not the letter name', words: ['bag','van','tap','mat','cap','ran','man','fan','rat','hat','jam','lap','nap','rack','lack','wax','clap','trap'] },
    short_i:  { rule: 'I between two consonants makes a short light sound — not the letter name', words: ['hit','sit','tip','pin','win','bit','fit','lip','rip','big','dig','fix','mix','slip','trim','grit','skip','drip'] },
    short_o:  { rule: 'O between two consonants makes a short round sound — not the letter name', words: ['job','mop','rod','log','pot','dot','cot','hot','lot','pop','hop','rob','sob','nod','pod','cod','cop','box','fox'] },
    short_u:  { rule: 'U between two consonants makes a short flat sound — not the letter name', words: ['cup','run','cut','mud','bug','jug','mug','rug','tug','bun','fun','gun','sun','but','gut','hut','nut','dug','rub','bus'] },
    short_e:  { rule: 'E between two consonants makes a short flat sound — not the letter name', words: ['bed','set','pen','leg','get','let','net','wet','fed','led','red','beg','peg','gem','hem','step','help','melt','belt','shelf'] },
  },
  phase_2_consonant_blends: {
    // simple 2-letter blend + CVC → less common blend → 3-letter blend
    s_blends:   { rule: 'S followed by a consonant — say both sounds then the rest', words: ['step','slip','spin','spit','spot','snag','snap','swim','slim','sled','slug','spec','spud','span','skin','skill','strap','split','spray'] },
    // simple pl/cl/fl/gl/sl → those with end cluster
    l_blends:   { rule: 'Consonant followed by L — say both sounds then the rest', words: ['plan','clip','plug','flag','glad','flip','flop','plod','clap','clot','glob','glum','slap','slop','slug','clad','block','clamp','flask'] },
    // simple tr/dr/cr/fr/gr/br/pr → those with end cluster
    r_blends:   { rule: 'Consonant followed by R — say both sounds then the rest', words: ['trim','drop','crop','drip','drag','drum','frog','grab','grin','grit','prod','prop','tram','brim','press','prep','trek','brass','graft'] },
    // simple end cluster (-nd/-st) → -lt/-mp/-ft → with initial blend/digraph
    end_blends: { rule: 'Two consonants at the end — say both sounds', words: ['hand','best','fast','last','dust','must','rust','cost','lost','test','nest','rest','mast','belt','melt','lift','lamp','damp','shift','trust'] },
  },
  phase_3_digraphs: {
    // simple sh+CVC or CVC+sh, no end cluster → with end blend → with initial blend
    sh: { rule: 'S and H together make one smooth sound — sh', words: ['shed','ship','dish','fish','wish','rush','hush','shin','mesh','gush','lush','mush','shack','cash','flash','crush','brush','shelf','shift'] },
    // simple th words → with end cluster → with initial blend
    th: { rule: 'T and H together make one sound — th, tongue behind top teeth', words: ['this','that','then','than','them','thud','path','bath','moth','thick','with','both','worth','cloth','broth','froth','theft','tenth','filth'] },
    // simple ch+CVC or CVC+ch → with end cluster or blend
    ch: { rule: 'C and H together make one sound — ch', words: ['chat','chip','chop','chin','much','such','rich','each','inch','check','arch','march','torch','fetch','bench','chest','munch','lunch','bunch','punch'] },
    // simple CVC+ck → with initial blend
    ck:     { rule: 'C and K together at end make one sound — k', words: ['lock','kick','pack','rack','dock','sock','tick','pick','buck','duck','luck','muck','suck','tuck','beck','deck','neck','brick','trick'] },
    // wh words → longer/less common
    wh:     { rule: 'W and H together at the start — makes a plain w sound, but spelled with both letters', words: ['when','what','where','which','while','why','wheel','wheat','whip','white','whether','wherever','whenever','whatever'] },
    // simple ph words → less common
    ph:     { rule: 'P and H together make an f sound — not p, not h, just f', words: ['phone','photo','phrase','physical','pharmacy','graph','alphabet','trophy','dolphin','nephew','phase','triumph'] },
    // simple ng ending → longer words
    ng_end: { rule: 'N and G together at the end make one sound — ng, like a hum through the nose', words: ['ring','sing','long','song','bang','hang','rang','wing','thing','bring','strong','spring','along','belong','among','during','evening','morning'] },
    // ng embedded mid-word with hard g after
    ng_mid: { rule: 'N and G in the middle — ng hum, then a hard g sound after it', words: ['finger','anger','hunger','longer','stronger','younger','single','angle','jungle','mangle','England','language','angry','mango'] },
  },
  phase_4_magic_e: {
    // simple Ca_Ce → with end consonant cluster → with initial blend/digraph
    a_e: { rule: 'Silent E at end makes A say its name — ay', words: ['name','came','wave','cave','rake','fake','lake','make','take','gave','save','pave','safe','late','shade','plate','frame','trade','brave'] },
    // simple Ci_Ce → with initial blend
    i_e: { rule: 'Silent E at end makes I say its name — eye', words: ['site','fine','ride','wide','hide','tide','tile','mile','file','pile','fire','hire','wire','line','mine','wine','pride','drive','slide'] },
    // simple Co_Ce → with initial blend
    o_e: { rule: 'Silent E at end makes O say its name — oh', words: ['note','code','role','pole','bone','tone','bore','core','gore','lore','pore','hole','mole','sole','woke','smoke','stone','drove','spoke'] },
    // simple Cu_Ce → with initial blend
    u_e: { rule: 'Silent E at end makes U say its name — you', words: ['tune','rule','cube','fuse','cute','rude','duke','tube','dune','mute','lute','ruse','dude','nude','lure','cure','crude','prune','flute','plume'] },
  },
  phase_5_vowel_pairs: {
    // simple vowel pair + simple consonant → with end cluster → with initial blend
    ai_ay: { rule: 'A and I or A and Y together make one sound — ay', words: ['play','stay','pain','main','bail','fail','hail','mail','nail','rail','sail','train','chain','snail','trail','claim','drain','spray','brain'] },
    ea_ee: { rule: "E and A or two E's together make one sound — ee", words: ['read','lead','team','mean','feel','deal','heal','leak','beach','reach','teach','clean','sleep','steel','cream','dream','steam','stream','speak'] },
    oa_ow: { rule: 'O and A or O and W together make one sound — oh', words: ['flow','coat','load','goal','show','boat','crow','glow','know','low','slow','grow','own','coast','roast','toast','blow','float','groan'] },
    oo:       { rule: "Two O's together make one sound — oo", words: ['food','cool','mood','pool','moon','room','boom','doom','loom','zoom','boot','hoot','loot','root','soot','tool','spoon','tooth','proof','smooth'] },
    // short oo as in book — different from long oo
    oo_short: { rule: "Two O's together can make a shorter sound — pulled back, like in book not food", words: ['book','look','cook','took','hook','foot','wood','good','hood','stood','brook','shook','understood','notebook','overlook','football','wooden','childhood'] },
    // igh — i, g, h together, g and h silent
    igh:      { rule: 'I, G and H together make a long i sound — the g and h are silent', words: ['night','light','right','fight','sight','tight','might','bright','flight','fright','slight','knight','tonight','midnight','highlight','frightened','delighted','lightning'] },
    // ou/ow diphthong
    ou_ow:    { rule: 'O and U, or O and W together make an ow sound — like saying ouch', words: ['out','down','town','found','loud','cloud','count','ground','sound','round','brown','crown','power','tower','flower','amount','thousand','throughout'] },
    // oi/oy diphthong
    oi_oy:    { rule: 'O and I, or O and Y together make one sound — oy', words: ['oil','boy','coin','join','soil','toy','foil','joy','void','coil','point','joint','noise','choice','voice','avoid','annoy','employ','destroy','appointment'] },
    // au/aw
    au_aw:    { rule: 'A and U, or A and W together make one broad sound — aw', words: ['saw','law','jaw','raw','draw','claw','cause','pause','fault','vault','launch','sauce','autumn','always','because','exhaust','daughter','awkward'] },
  },
  phase_6_r_controlled: {
    // short ar words → ar + consonants → with digraph/blend
    ar:       { rule: 'A followed by R — ar sound', words: ['car','bar','tar','jar','far','hard','farm','yard','harm','dark','mark','park','bark','lark','star','scar','sharp','start','chart'] },
    // simple or words → or + consonant cluster → with digraph/blend
    or:       { rule: 'O followed by R — or sound', words: ['for','torn','born','corn','horn','cork','lord','cord','word','more','port','form','fork','worth','force','score','work','short','storm'] },
    // short er/ir/ur words → longer → with digraph
    er_ir_ur: { rule: 'E, I or U followed by R — all make the same er sound', words: ['her','fur','stir','term','girl','turn','hurt','curl','fern','firm','blur','surf','turf','bird','lurk','murk','first','shirt','church'] },
  },
  phase_7_common_endings: {
    // short base + ing → longer/less common base
    ing: { rule: 'Add ING — happening now', words: ['lifting','fixing','running','jumping','pulling','loading','calling','falling','pushing','walking','talking','eating','reading','writing','driving','checking','building','drinking','sleeping'] },
    // short base + ed → longer/less common base
    ed:  { rule: 'Add ED — already happened', words: ['worked','lifted','fixed','helped','closed','locked','picked','filled','moved','signed','passed','asked','opened','dropped','checked','stopped','clapped','grabbed','spilled'] },
    // agent nouns first, then comparatives simple → complex
    er:  { rule: 'Add ER — someone who does, or comparison', words: ['worker','loader','driver','builder','checker','harder','longer','wider','older','darker','deeper','lower','higher','stronger','younger','cleaner','sharper','lighter','manager'] },
    // simple base + ly → spelling-change cases
    ly:          { rule: 'Add LY — describes how', words: ['safely','badly','fully','slowly','loudly','really','early','firmly','clearly','daily','weekly','quickly','quietly','nearly','lightly','sharply','deeply','roughly','easily','heavily'] },
    // tion/sion — shun sound at the end
    tion_sion:   { rule: 'TION or SION at the end — always makes a shun sound', words: ['station','section','action','nation','option','mention','pension','tension','question','caution','fraction','function','junction','direction','collection','connection','inspection','instruction','permission','possession','discussion','profession','expression','impression'] },
    // ful/less/ness suffixes
    ful_less_ness: { rule: 'FUL means full of, LESS means without, NESS turns a describing word into a thing', words: ['helpful','careful','useful','harmful','painful','hopeless','useless','homeless','careless','endless','illness','darkness','fitness','kindness','madness','weakness','awareness','loneliness','breathless','worthless'] },
    // ment suffix
    ment:        { rule: 'MENT at the end turns a doing word into a thing', words: ['payment','employment','agreement','statement','treatment','argument','document','equipment','adjustment','appointment','assessment','achievement','announcement','arrangement','development','improvement','establishment','management','requirement','investment'] },
  },
  phase_8_multi_syllable: {
    // familiar/regular two-part words first → less common
    two_syllable:   { rule: 'Break into two parts, say each, put together', words: ['helmet','carpet','garden','market','pocket','jacket','tablet','socket','budget','forklift','permit','target','object','subject','contract','notice','project'] },
    // familiar three-part words first → less common
    three_syllable: { rule: 'Break into three parts, say each, put together', words: ['remember','together','however','another','example','hospital','telephone','umbrella','consider','employment','connection','direction','instruction','protection','inspection','delivered','collected'] },
    // more regular spelling/pronunciation first
    four_syllable:  { rule: 'Break into four parts, say each, put together', words: ['communication','organisation','qualification','authorisation','consideration','investigation','recommendation','identification','accommodation','administration','approximately','automatically','immediately','occasionally','unfortunately'] },
  },
  phase_9_adult_words: {
    // short/common words first → longer/less frequent
    general:        { rule: "Real adult words — some follow rules, some don't", words: ['message','missed','calling','contact','signal','mobile','search','delete','update','install','payment','balance','account','transfer','charges','receipt','refund','confirm','submit','arrival','journey','delayed','voicemail','settings','blocked','network','storage','battery','connect','download','received','delivered','statement','overdue','cashback','address','postcode','consent','platform','terminal','reserved','available','delivery','tracking','dispatched','employment','occupation','declaration','signature','reference','appointment','prescription','pharmacy','symptoms','treatment','medication','departure','destination','collection','estimated','cancelled'] },
    // silent letters — k before n, w before r, silent g, b, t
    silent_letters: { rule: 'Some letters in a word are completely silent — you see them but do not say them', words: ['knife','know','knock','kneel','knight','write','wrong','wrap','wrist','sign','design','debt','doubt','island','lamb','climb','comb','thumb','castle','whistle','listen','fasten','column','autumn'] },
    // soft c and g before e, i, y
    soft_c_g:       { rule: 'C before E, I or Y makes an s sound. G before E, I or Y makes a j sound', words: ['city','centre','circle','cycle','ceiling','certain','cinema','pencil','fancy','giant','gentle','ginger','gym','magic','engine','danger','urgent','agent','generous','original','emergency','digital','energy'] },
  },
};

const BASELINE_COMPLETE_SPEECH = "Thanks. I now know where to start. Let's begin.";

// ── Hardcoded fallbacks (spec §AI Coach — Server Validation) ──────────────────
const FALLBACKS = {
  correct:         "Yep. That pattern works every time.",
  close:           "Almost. Try it again.",
  wrong:           "Let's slow it down. Try the first sound, then the rest.",
  second_correct:  "There it is.",
  saved:           "I've saved that one. We'll come back to it.",
  session_close:   "That's it for today. Same time tomorrow.",
};

// ── Rule introduction scripts (from hadleyread-teaching-programme.md) ──────────
// Hardcoded — passed directly to TTS, never generated by GPT-4o.
// sound: null means no isolated sound step (blends and multi-syllable patterns).
const RULE_INTRO_SCRIPTS = {
  short_a:        { explanation: "Some short words have a vowel in the middle that makes a quick, flat sound. When you see the letter A between two consonants — like in cat or van — it makes that short A sound. Not the name of the letter. Just a quick, open sound.",  sound: 'short_a',   examples: ['cat', 'van', 'tap'] },
  short_i:        { explanation: "The letter I between two consonants makes a short, light sound. Not the name of the letter — just a quick I. Like in sit or bin.",                                                                                                         sound: 'short_i',   examples: ['sit', 'bin', 'tip'] },
  short_o:        { explanation: "When you see the letter O between two consonants it makes a short, round sound. Like the O in top or job. Not the name of the letter — just a short O.",                                                                                 sound: 'short_o',   examples: ['top', 'job', 'mop'] },
  short_u:        { explanation: "The letter U between two consonants makes a short, flat sound. Like the U in cup or run. Quick and low.",                                                                                                                                 sound: 'short_u',   examples: ['cup', 'run', 'cut'] },
  short_e:        { explanation: "The letter E between two consonants makes a short sound. Like the E in bed or pen. Quick and flat.",                                                                                                                                      sound: 'short_e',   examples: ['bed', 'pen', 'set'] },
  s_blends:       { explanation: "Some words start with two consonants together. When S is followed by another consonant you say both sounds — st. sp. sl. Then read the rest of the word.",                                                                                sound: null,        examples: ['stop', 'step', 'slip'] },
  l_blends:       { explanation: "When a consonant is followed by L at the start of a word, say both sounds together — fl. cl. pl. Then read the rest.",                                                                                                                   sound: null,        examples: ['flat', 'clip', 'plan'] },
  r_blends:       { explanation: "When a consonant is followed by R at the start of a word, say both sounds — gr. dr. tr. Then read the rest.",                                                                                                                            sound: null,        examples: ['grip', 'drop', 'trim'] },
  end_blends:     { explanation: "Some words end with two consonants together. Say both sounds at the end — lt. nd. ft. Don't drop either one.",                                                                                                                            sound: null,        examples: ['belt', 'hand', 'lift'] },
  sh:             { explanation: "When S and H appear together they make one smooth sound — sh. Like telling someone to be quiet.",                                                                                                                                         sound: 'sh',        examples: ['shop', 'shelf', 'wish'] },
  th:             { explanation: "T and H together make one sound — th. Put the tip of your tongue just behind your top teeth and push air through.",                                                                                                                      sound: 'th',        examples: ['this', 'with', 'then'] },
  ch:             { explanation: "C and H together make one sound — ch.",                                                                                                                                                                                                   sound: 'ch',        examples: ['chat', 'check', 'chip'] },
  ck:             { explanation: "C and K together at the end of a word make one sound — ck.",                                                                                                                                                                              sound: 'ck',        examples: ['back', 'lock', 'kick'] },
  wh:             { explanation: "Some words start with W and H together. They make the same sound as plain W — but knowing the spelling matters when you're reading forms or signs. When, where, what, which — they all start with W-H.",                                sound: 'wh',        examples: ['when', 'where', 'what'] },
  ph:             { explanation: "When P and H appear together they make an F sound — not two separate sounds, just F. You'll see this a lot on forms and in everyday life — phone, photo, pharmacy.",                                                                    sound: 'ph',        examples: ['phone', 'photo', 'phrase'] },
  ng_end:         { explanation: "When N and G appear together at the end of a word they make one sound — ng. It's a hum through your nose. Ring, song, long.",                                                                                                          sound: 'ng_end',    examples: ['ring', 'song', 'strong'] },
  ng_mid:         { explanation: "When N and G appear in the middle of a word, there's the ng hum — and then a hard g sound straight after it. Fin-ger. An-ger. Say both parts.",                                                                                       sound: null,        examples: ['finger', 'anger', 'single'] },
  a_e:            { explanation: "When a word ends in a silent E, it changes the vowel in the middle. The A stops making its short sound and says its name instead — ay. Like the difference between cap and cape.",                                                       sound: 'a_e',       examples: ['name', 'gate', 'safe'] },
  i_e:            { explanation: "A silent E at the end makes the I say its name — eye. Like the difference between bit and bite.",                                                                                                                                         sound: 'i_e',       examples: ['time', 'site', 'fine'] },
  o_e:            { explanation: "A silent E at the end makes the O say its name — oh. Like the difference between hop and hope.",                                                                                                                                          sound: 'o_e',       examples: ['home', 'note', 'code'] },
  u_e:            { explanation: "A silent E at the end makes the U say its name — you. Like the difference between cub and cube.",                                                                                                                                         sound: 'u_e',       examples: ['tune', 'rule', 'cube'] },
  ai_ay:          { explanation: "When A and I or A and Y appear together they make one sound — ay. The second vowel is silent.",                                                                                                                                            sound: 'ai_ay',     examples: ['rain', 'play', 'stay'] },
  ea_ee:          { explanation: "When E and A or two E's appear together they make one sound — ee.",                                                                                                                                                                       sound: 'ea_ee',     examples: ['read', 'keep', 'clean'] },
  oa_ow:          { explanation: "When O and A or O and W appear together they usually make one sound — oh.",                                                                                                                                                               sound: 'oa_ow',     examples: ['road', 'flow', 'coat'] },
  oo:             { explanation: "When two O's appear together they make one sound — oo.",                                                                                                                                                                                  sound: 'oo',        examples: ['tool', 'food', 'cool'] },
  oo_short:       { explanation: "You've already seen two O's making a long oo sound — like food or cool. But sometimes two O's make a shorter sound, further back in the mouth. Book, look, cook — that's the short oo.",                                               sound: 'oo_short',  examples: ['book', 'look', 'cook'] },
  igh:            { explanation: "These three letters together — I, G, H — make a long i sound. The G and H are completely silent. Night, light, right — just the long i sound, then the final consonant.",                                                              sound: 'igh',       examples: ['night', 'light', 'right'] },
  ou_ow:          { explanation: "When O and U appear together, or O and W at the end of a word, they usually make an ow sound — like you've been surprised. Out, down, found — that same sound written two different ways.",                                             sound: 'ou_ow',     examples: ['out', 'down', 'found'] },
  oi_oy:          { explanation: "When O and I appear together, or O and Y at the end of a word, they make one sound — oy. Oil, coin, boy — that same sound written two different ways.",                                                                                sound: 'oi_oy',     examples: ['oil', 'coin', 'boy'] },
  au_aw:          { explanation: "When A and U appear together, or A and W, they make a broad open sound — aw. Like you're at the doctor and they ask you to open wide. Cause, saw, draw.",                                                                              sound: 'au_aw',     examples: ['cause', 'saw', 'draw'] },
  ar:             { explanation: "When A is followed by R, the R changes the vowel sound — ar.",                                                                                                                                                                            sound: 'ar',        examples: ['car', 'hard', 'farm'] },
  or:             { explanation: "When O is followed by R, the R changes the vowel sound — or.",                                                                                                                                                                            sound: 'or',        examples: ['for', 'sort', 'short'] },
  er_ir_ur:       { explanation: "When E, I or U is followed by R they all make the same sound — er.",                                                                                                                                                                     sound: 'er_ir_ur',  examples: ['her', 'first', 'burn'] },
  ing:            { explanation: "When you add ING to the end of a word it means something is happening right now — ing. Like work becomes working.",                                                                                                                       sound: 'ing',       examples: ['working', 'lifting', 'driving'] },
  ed:             { explanation: "When you add ED to the end of a word it means something already happened — ed. Like work becomes worked.",                                                                                                                                sound: 'ed',        examples: ['worked', 'lifted', 'called'] },
  er:             { explanation: "Adding ER to a word means someone who does something — er. Like work becomes worker.",                                                                                                                                                    sound: 'er',        examples: ['worker', 'driver', 'builder'] },
  ly:             { explanation: "Adding LY to a word describes how something is done — ly. Like safe becomes safely.",                                                                                                                                                     sound: 'ly',        examples: ['safely', 'quickly', 'clearly'] },
  tion_sion:      { explanation: "These endings appear on almost every official form and letter you'll ever read. They always make the same shun sound at the end — station, direction, pension. Once you know this one, long words suddenly get a lot easier.",          sound: 'tion_sion', examples: ['station', 'direction', 'pension'] },
  ful_less_ness:  { explanation: "Three endings that change the meaning of a word. FUL means full of something — helpful, careful. LESS means without — useless, homeless. NESS turns a word into a thing — illness, darkness. Spot the base word first, then read the ending.", sound: null,   examples: ['helpful', 'useless', 'illness'] },
  ment:           { explanation: "MENT at the end usually turns a verb into a noun — something you can point to or refer to. Pay becomes payment. Employ becomes employment. You'll see this constantly on contracts, forms, and letters.",                               sound: 'ment',      examples: ['payment', 'employment', 'agreement'] },
  two_syllable:   { explanation: "Longer words are just shorter parts joined together. Break it into two parts, say each one, then put them together.",                                                                                                                     sound: null,        examples: ['for-klift', 'pay-ment', 'hel-met'] },
  three_syllable: { explanation: "This one has three parts. Say each part slowly, then put them together.",                                                                                                                                                                 sound: null,        examples: ['in-duc-tion', 'to-mor-row', 'hos-pi-tal'] },
  four_syllable:  { explanation: "Four parts this time. Take it slowly — each part on its own first, then put it all together.",                                                                                                                                            sound: null,        examples: ['com-mu-ni-ca-tion', 'or-gan-i-sa-tion'] },
  general:        { explanation: "These are words you'll see every day — on your phone, on forms, on signs. Some of them follow the rules you already know. Some don't. We'll take them one at a time.",                                                                   sound: null,        examples: [] },
  silent_letters: { explanation: "Some words have letters that are written but never said. K is silent before N — knife, know, knock. W is silent before R — write, wrap, wrong. G is sometimes silent — sign, design. These don't follow a sound rule, but once you've seen them a few times they stick.", sound: null, examples: ['knife', 'write', 'sign'] },
  soft_c_g:       { explanation: "The letters C and G have two sounds each. Before E, I, or Y — C makes an S sound and G makes a J sound. City, centre, giant, age. Before anything else they make their hard sounds — cat, got. The vowel after them is the clue.",    sound: null,        examples: ['city', 'centre', 'giant'] },
};

// PLACEHOLDER: These TTS approximations will be replaced with pre-recorded
// audio files when recordings are complete. Files will be stored in
// public/sounds/ named sound_[pattern].mp3 e.g. sound_short_a.mp3
// When files exist, serve them directly instead of calling TTS for the sound step.
const SOUND_TTS_MAP = {
  short_a:       'ah',
  short_i:       'ih',
  short_o:       'oh',
  short_u:       'uh',
  short_e:       'eh',
  sh:            'shh',
  th:            'th',
  ch:            'chh',
  ck:            'k',
  wh:            'w',
  ph:            'f',
  ng_end:        'ng',
  a_e:           'ay',
  i_e:           'eye',
  o_e:           'oh',
  u_e:           'you',
  ai_ay:         'ay',
  ea_ee:         'ee',
  oa_ow:         'oh',
  oo:            'oo',
  oo_short:      'uh-oo',
  igh:           'eye',
  ou_ow:         'ow',
  oi_oy:         'oy',
  au_aw:         'aw',
  ar:            'ar',
  or:            'or',
  er_ir_ur:      'er',
  er:            'er',
  ing:           'ing',
  ed:            'ed',
  ly:            'lee',
  tion_sion:     'shun',
  ment:          'ment',
};

function preprocessTTSText(soundKey) {
  const s = SOUND_TTS_MAP[soundKey];
  if (!s) return null;
  // Ellipsis causes TTS to pause and speak the sound slowly and clearly
  return `...${s}...`;
}

// Returns the pre-recorded sound file as a Buffer if it exists, otherwise null.
// Checks for .m4a first (recorded files), then .mp3 (legacy).
// Drop a file into public/sounds/sound_[pattern].m4a and it is used automatically
// — no code change needed.
function checkForRecordedSound(pattern) {
  for (const ext of ['m4a', 'mp3']) {
    const filePath = join(__dirname, 'public', 'sounds', `sound_${pattern}.${ext}`);
    if (existsSync(filePath)) return readFileSync(filePath);
  }
  return null;
}

function getRuleIntroScript(pattern) {
  return RULE_INTRO_SCRIPTS[pattern] ?? {
    explanation: `This pattern is ${pattern.replace(/_/g, ' ')}. Have a go when the word appears.`,
    sound: null,
    examples: [],
  };
}

// ── Forbidden learner-facing words (spec §AI Coach — Server Validation) ───────
const FORBIDDEN_WORDS = [
  'well done','great job','excellent','amazing','brilliant','fantastic','good job',
  'proud','clever','superb','perfect','awesome',
  'phoneme','grapheme','digraph','blend',
  'test','lesson','school','teacher','children','class','kids','pupil','student',
];

// Short common words exempt from the target-word-modelling check
const COMMON_SHORT_WORDS = new Set(['a','in','on','at','it','is','to','the']);

// ── Auth helpers ───────────────────────────────────────────────────────────────
function hashPin(pin) {
  return createHash('sha256').update(pin + (process.env.PIN_SALT || 'hadleyread')).digest('hex');
}

function generateToken() { return randomBytes(32).toString('hex'); }

const tokenStore = new Map(); // token → userId

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const userId = tokenStore.get(token);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  req.userId = userId;
  next();
}

// ── Baseline helpers ───────────────────────────────────────────────────────────
function normalizeWord(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z]/g, '');
}

function getBaselineProgress(user) {
  if (!user.baseline_progress) return { wordIndex: 0, results: [] };
  try { return JSON.parse(user.baseline_progress); }
  catch(e) { return { wordIndex: 0, results: [] }; }
}

function saveBaselineProgress(userId, progress) {
  db.prepare('UPDATE users SET baseline_progress = ? WHERE id = ?')
    .run(JSON.stringify(progress), userId);
}

// Quick string match — returns 'correct' or null (uncertain, needs GPT-4o judgement)
function judgeBaseline_quick(transcript, targetWord) {
  const norm   = normalizeWord(transcript);
  const target = normalizeWord(targetWord);
  if (norm === target) return 'correct';
  // Target appears as an isolated word in a longer transcript (Whisper adds filler)
  const words = transcript.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  if (words.includes(target)) return 'correct';
  return null;
}

// Silent GPT-4o judgement for ambiguous transcripts — returns assessment JSON, no speech
async function callBaselineJudgement(transcript, targetWord) {
  console.log(`[GPT-4o] callBaselineJudgement — target:"${targetWord}" transcript:"${transcript}"`);
  const prompt = `Assess whether a non-reader correctly read a word. Return JSON only — no other text.

Target word: "${targetWord}"
Whisper transcript: "${transcript}"

{
  "targetWord": "${targetWord}",
  "heardAs": "<what you think they actually said>",
  "outcome": "correct | close | wrong | unclear",
  "confidence": "high | medium | low",
  "likelyError": "initial_sound | vowel_sound | final_sound | added_sound | omitted_sound | whole_word | unclear | none"
}`;

  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return JSON.parse(result.choices[0].message.content);
  } catch(e) {
    console.error('[baseline judgement] error:', e.message);
    return { outcome: 'unclear', confidence: 'low', likelyError: 'unclear' };
  }
}

// Write all baseline data to DB — baseline_done only set to 1 after all writes succeed
function finaliseBaseline(userId, sessionId, progress, startPhase, startPattern) {
  const phase   = startPhase;
  const pattern = startPattern;

  for (const r of progress.results) {
    db.prepare(`
      INSERT INTO attempts (user_id, session_id, word, pattern, phase, context, attempt_number, transcript, outcome, confidence, likely_error)
      VALUES (?, ?, ?, ?, ?, 'isolated', 1, ?, ?, ?, ?)
    `).run(userId, sessionId, r.word, r.pattern, r.phase, r.transcript || '', r.outcome, r.confidence || 'high', r.likelyError || 'none');

    const isCorrect = r.outcome === 'correct';
    const existing  = db.prepare('SELECT id FROM words WHERE user_id = ? AND word = ?').get(userId, r.word);
    if (existing) {
      db.prepare(`UPDATE words SET times_attempted = times_attempted + 1, times_correct = times_correct + ?, last_attempted = datetime('now') WHERE user_id = ? AND word = ?`)
        .run(isCorrect ? 1 : 0, userId, r.word);
    } else {
      db.prepare(`INSERT INTO words (user_id, word, pattern, phase, times_attempted, times_correct, first_seen, last_attempted) VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`)
        .run(userId, r.word, r.pattern, r.phase, isCorrect ? 1 : 0);
    }
  }

  // Hard rule: baseline_done only set to 1 after all data is written
  db.prepare(`UPDATE users SET baseline_done = 1, current_phase = ?, current_pattern = ?, baseline_progress = NULL WHERE id = ?`)
    .run(phase, pattern, userId);

  return { phase, pattern };
}

// ── Session state — in-memory per active session ───────────────────────────────
// Lost on server restart: clients must call /api/session/start to rebuild state.
const sessionStates = new Map(); // sessionId → state

// ── Teaching helpers ───────────────────────────────────────────────────────────
function getPatternData(phase, pattern) {
  return TEACHING_PATTERNS[phase]?.[pattern] || null;
}

// Returns the practice word list for a pattern — 8 words for 3 rounds of practice
function buildWordList(phase, pattern) {
  return getPatternData(phase, pattern)?.words.slice(0, 8) ?? [];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PHASE_ORDER = Object.keys(TEACHING_PATTERNS);

function getNextPattern(phase, pattern) {
  const pats   = Object.keys(TEACHING_PATTERNS[phase] || {});
  const patIdx = pats.indexOf(pattern);
  if (patIdx < pats.length - 1) return { phase, pattern: pats[patIdx + 1] };
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  if (phaseIdx < PHASE_ORDER.length - 1) {
    const next = PHASE_ORDER[phaseIdx + 1];
    return { phase: next, pattern: Object.keys(TEACHING_PATTERNS[next])[0] };
  }
  return null; // programme complete
}

function buildFreshTeachingState(userId, phase, pattern, wordList) {
  return {
    userId,
    mode:                         'round',
    phase,
    pattern,
    wordList,
    currentRound:                 1,
    wordsInRound:                 [...wordList],
    currentWordIndex:             0,
    strugglingWords:              [],
    remainingStruggling:          [],
    additionalAttempts:           {},
    completedPatterns:            [],
    patternsCompletedThisSession: 0,
    wordsAttempted:               0,
    wordsCorrect:                 0,
    savedWords:                   [],
  };
}

// ── Speech validation (spec §AI Coach — Server Validation) ───────────────────
const REQUIRED_OPENERS = {
  correct: 'yep',
  close:   'almost',
  wrong:   "let's slow it down",
  saved:   "i've saved that one",
};

function validateSpeech(speech, wordOutcome, targetWord, isSecondAttemptCorrect = false) {
  if (!speech || typeof speech !== 'string') return { valid: false, reason: 'empty speech' };

  const lower     = speech.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  if (wordCount > 40) return { valid: false, reason: `too long (${wordCount} words)` };

  for (const fw of FORBIDDEN_WORDS) {
    if (lower.includes(fw)) return { valid: false, reason: `forbidden word: "${fw}"` };
  }

  if (isSecondAttemptCorrect) {
    if (!lower.startsWith('there it is')) return { valid: false, reason: 'second attempt correct must start with "There it is"' };
  } else if (wordOutcome && REQUIRED_OPENERS[wordOutcome]) {
    if (!lower.startsWith(REQUIRED_OPENERS[wordOutcome])) {
      return { valid: false, reason: `"${wordOutcome}" must start with "${REQUIRED_OPENERS[wordOutcome]}"` };
    }
  }

  if (targetWord && !COMMON_SHORT_WORDS.has(normalizeWord(targetWord))) {
    const t = normalizeWord(targetWord);
    const modellingPatterns = [
      `the word is ${t}`, `say ${t}`, `try ${t}`, `it says ${t}`,
      `that word is ${t}`, `that was ${t}`, `you read ${t}`,
    ];
    for (const p of modellingPatterns) {
      if (lower.includes(p)) return { valid: false, reason: `models target word "${targetWord}"` };
    }
  }

  return { valid: true };
}

// ── Teaching GPT-4o call with validation + retry (spec §AI Coach) ─────────────
const TEACHING_SYSTEM_PROMPT = `You are HadleyRead's reading tutor. You operate inside a structured teaching engine that controls all progression. You only generate spoken responses.

Respond ONLY with valid JSON — no text outside the object:
{
  "speech": "max 2 sentences, under 40 words",
  "wordOutcome": "correct | close | wrong | saved | null",
  "targetWord": "the word just attempted, or null",
  "nextAction": "retry_same_word | next_word | save_word | teach_rule | start_review | end_session"
}

OUTCOME DEFINITIONS:
- correct: user decoded the word accurately enough to count
- close: recognisably the right word but a small sound error (e.g. wrong vowel)
- wrong: did not decode the word — clearly wrong attempt
- saved: word has hit the stuck rule (engine will override if needed)
- null: not responding to a word attempt

SPEECH RULES — NON-NEGOTIABLE:
- correct → start with exactly "Yep."
- close → start with exactly "Almost."
- wrong → start with exactly "Let's slow it down."
- saved → start with exactly "I've saved that one."
- second attempt correct → start with exactly "There it is."
- Never say the target word aloud
- Never use: well done, great job, excellent, amazing, brilliant, fantastic, good job, proud, clever, superb, perfect, awesome
- Never mention: school, teacher, children, class, lesson, test, phoneme, grapheme, digraph, blend
- Max 40 words. Max 2 sentences. Write for speech — the user will hear this, not read it.

NEXTACTION RULES:
- correct → next_word
- close (attempt 1) → retry_same_word
- wrong (attempt 1) → retry_same_word
- The engine overrides nextAction if it conflicts with hard limits.`.trim();

async function callTeachingGPT(targetWord, transcript, attemptNumber, pattern, phase, rule) {
  console.log(`[GPT-4o] callTeachingGPT — word:"${targetWord}" attempt:${attemptNumber}`);
  const userMsg = `target_word: "${targetWord}"\ntranscript: "${transcript}"\nattempt_number: ${attemptNumber}\npattern: "${pattern}"\nphase: "${phase}"\npattern_rule: "${rule || ''}"`;

  let lastReason = '';

  for (let i = 0; i < 2; i++) {
    const sysContent = i === 0
      ? TEACHING_SYSTEM_PROMPT
      : TEACHING_SYSTEM_PROMPT + `\n\nYour previous response was rejected: ${lastReason}. Fix it.`;

    try {
      const result = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sysContent },
          { role: 'user',   content: userMsg },
        ],
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      const isSecondCorrect = attemptNumber > 1 && parsed.wordOutcome === 'correct';
      const validation = validateSpeech(parsed.speech, parsed.wordOutcome, targetWord, isSecondCorrect);

      if (validation.valid) return parsed;

      lastReason = validation.reason;
      console.warn(`[teaching] rejection ${i + 1}: ${validation.reason} | speech: "${parsed.speech}"`);
    } catch(e) {
      console.error('[teaching] GPT-4o error:', e.message);
    }
  }

  // Hardcoded fallback after 2 rejections
  console.warn('[teaching] using hardcoded fallback');
  const isExact = normalizeWord(transcript) === normalizeWord(targetWord);
  const outcome = isExact ? 'correct' : (attemptNumber > 1 ? 'saved' : 'wrong');
  return {
    speech:      isExact && attemptNumber > 1 ? FALLBACKS.second_correct
               : isExact                       ? FALLBACKS.correct
               : attemptNumber > 1             ? FALLBACKS.saved
               :                                 FALLBACKS.wrong,
    wordOutcome: outcome,
    targetWord,
    nextAction:  outcome === 'correct' ? 'next_word' : outcome === 'saved' ? 'save_word' : 'retry_same_word',
  };
}

// ── TTS ────────────────────────────────────────────────────────────────────────
function prepareTTSText(text) {
  return (text || '').replace(/\bPIN\b/g, 'pin');
}

async function textToSpeech(text) {
  console.log(`[TTS] textToSpeech — "${text.slice(0, 80)}..."`);
  const speech = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'fable',
    input: prepareTTSText(text),
  });
  return Buffer.from(await speech.arrayBuffer());
}

// ── Transcription ──────────────────────────────────────────────────────────────
async function transcribeAudio(audioBuffer, mimeType) {
  const ext  = mimeType.includes('mp4')  ? 'm4a'
             : mimeType.includes('webm') ? 'webm'
             : mimeType.includes('wav')  ? 'wav'
             : mimeType.includes('mpeg') ? 'mp3'
             : 'webm';
  const file = await OpenAI.toFile(audioBuffer, `audio.${ext}`, { type: mimeType });
  const res  = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'en' });
  return res.text;
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
function saveExchange(sessionId, userId, role, transcript) {
  db.prepare('INSERT INTO exchanges (session_id, user_id, role, transcript) VALUES (?, ?, ?, ?)')
    .run(sessionId, userId, role, transcript);
}

function recordAttempt({ userId, sessionId, word, pattern, phase, context = 'isolated', attemptNumber, transcript, outcome, confidence = 'high', likelyError = 'none' }) {
  db.prepare(`
    INSERT INTO attempts (user_id, session_id, word, pattern, phase, context, attempt_number, transcript, outcome, confidence, likely_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, sessionId, word, pattern, phase, context, attemptNumber, transcript, outcome, confidence, likelyError);
}

// Mastery levels (spec):
//   0 = Red       — introduced, not yet reliably correct
//   1 = Orange    — correct 2+ times, across 2+ sessions
//   2 = Green     — correct across 3+ sessions (secure)
//   3 = Dark green — correct across 4+ sessions, at least 7 days since first seen
//
// sessions_correct increments once per correct exchange (one call per word per exchange).
function upsertWordRecord(userId, word, pattern, phase, isCorrect, newStatus) {
  const existing = db.prepare('SELECT * FROM words WHERE user_id = ? AND word = ?').get(userId, word);

  if (existing) {
    const status             = newStatus || existing.status;
    const newSessionsCorrect = isCorrect ? existing.sessions_correct + 1 : existing.sessions_correct;
    const newTimesCorrect    = existing.times_correct + (isCorrect ? 1 : 0);

    // Mastery only ever increases
    let mastery = existing.mastery_level;
    if (isCorrect && mastery < 3) {
      const daysSinceFirst = existing.first_seen
        ? Math.floor((Date.now() - new Date(existing.first_seen).getTime()) / 86_400_000)
        : 0;
      if (mastery < 1 && newTimesCorrect >= 2 && newSessionsCorrect >= 2) mastery = 1;
      if (mastery < 2 && newSessionsCorrect >= 3)                          mastery = 2;
      if (mastery < 3 && newSessionsCorrect >= 4 && daysSinceFirst >= 7)   mastery = 3;
    }

    db.prepare(`
      UPDATE words
      SET times_attempted  = times_attempted + 1,
          times_correct    = times_correct + ?,
          sessions_correct = ?,
          mastery_level    = ?,
          status           = ?,
          last_attempted   = datetime('now')
      WHERE user_id = ? AND word = ?
    `).run(isCorrect ? 1 : 0, newSessionsCorrect, mastery, status, userId, word);

  } else {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO words
        (user_id, word, pattern, phase, times_attempted, times_correct, sessions_correct, mastery_level, status, first_seen, last_attempted)
      VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?, ?, datetime('now'))
    `).run(userId, word, pattern, phase, isCorrect ? 1 : 0, isCorrect ? 1 : 0, newStatus || 'learning', today);
  }
}

const ASKING_SPEECH = "Shall we move on to the next one, or are you done for today?";

// Transitions to sensecheck (every 2 patterns) or asking (every odd pattern)
async function handlePatternComplete(res, state, sessionId, userId, lastWordSpeech) {
  const { phase, pattern, wordList, completedPatterns, patternsCompletedThisSession } = state;
  const newCompleted     = [...completedPatterns, { phase, pattern, wordList }];
  const newPatternsCount = patternsCompletedThisSession + 1;

  if (newPatternsCount % 2 === 0) {
    const last2           = newCompleted.slice(-2);
    const senseCheckWords = shuffle([
      ...last2[0].wordList.map(w => ({ word: w, phase: last2[0].phase, pattern: last2[0].pattern })),
      ...last2[1].wordList.map(w => ({ word: w, phase: last2[1].phase, pattern: last2[1].pattern })),
    ]);
    const transitionText = "Now let's see how you do with a mix of both.";
    const fullSpeech     = lastWordSpeech ? `${lastWordSpeech} ${transitionText}` : transitionText;
    sessionStates.set(sessionId, {
      ...state, mode: 'sensecheck', senseCheckWords, senseCheckIndex: 0,
      completedPatterns: newCompleted, patternsCompletedThisSession: newPatternsCount,
    });
    const audio = await textToSpeech(fullSpeech);
    return res.json({ tutorText: fullSpeech, audio: audio.toString('base64'), currentWord: senseCheckWords[0].word, mode: 'sensecheck' });
  }

  const fullSpeech = lastWordSpeech ? `${lastWordSpeech} ${ASKING_SPEECH}` : ASKING_SPEECH;
  sessionStates.set(sessionId, {
    ...state, mode: 'asking',
    completedPatterns: newCompleted, patternsCompletedThisSession: newPatternsCount,
  });
  const audio = await textToSpeech(fullSpeech);
  return res.json({ tutorText: fullSpeech, audio: audio.toString('base64'), currentWord: null, mode: 'asking' });
}

// ── Express ────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'hadleyread-landing.html')));

app.get('/app', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.use(express.static(join(__dirname, 'public')));

// ── Auth: register ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, phone, pin } = req.body || {};
  if (!name || !phone || !pin) return res.status(400).json({ error: 'name, phone and pin required' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4 digits' });
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'Phone number already registered' });
  }
  try {
    const result = db.prepare('INSERT INTO users (name, phone, pin_hash) VALUES (?, ?, ?)').run(name.trim(), phone.trim(), hashPin(pin));
    const token  = generateToken();
    tokenStore.set(token, result.lastInsertRowid);
    res.json({ token, userId: result.lastInsertRowid, name: name.trim() });
  } catch(err) {
    console.error('register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Auth: login ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { phone, pin } = req.body || {};
  if (!phone || !pin) return res.status(400).json({ error: 'phone and pin required' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || user.pin_hash !== hashPin(pin)) return res.status(401).json({ error: 'Phone number or PIN not recognised' });
  const token = generateToken();
  tokenStore.set(token, user.id);
  res.json({ token, userId: user.id, name: user.name });
});

// ── Session: start ─────────────────────────────────────────────────────────────
app.post('/api/session/start', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user   = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    console.log('[session/start] userId:', userId, '| baseline_done:', user.baseline_done, '| phase:', user.current_phase, '| pattern:', user.current_pattern);

    const sessionResult = db.prepare('INSERT INTO sessions (user_id, phase_working_on) VALUES (?, ?)').run(userId, user.current_phase || null);
    const sessionId     = sessionResult.lastInsertRowid;

    // ── Phase 1: Baseline ──────────────────────────────────────────────────────
    if (!user.baseline_done) {
      const progress   = getBaselineProgress(user);
      const isResuming = progress.results.length > 0;
      const entry      = BASELINE_SEQUENCE[progress.wordIndex];
      const firstWord  = entry?.word || null;

      // Hard rule: opening message is hardcoded — GPT-4o not called
      const speech = isResuming
        ? `Welcome back ${user.name}. Let's carry on from where we were.`
        : `Hi ${user.name}, welcome to HadleyRead. I'm going to show you a few words and I want you to say them out loud. This is just so I know where to start with you.`;

      sessionStates.set(sessionId, { userId, mode: 'baseline', wordIndex: progress.wordIndex });
      saveExchange(sessionId, userId, 'assistant', speech);
      const audio = await textToSpeech(speech);

      return res.json({ sessionId, tutorText: speech, audio: audio.toString('base64'), currentWord: firstWord });
    }

    // ── Phase 2: Teaching ──────────────────────────────────────────────────────
    // Hard rule: must have both current_phase and current_pattern before teaching begins
    if (!user.current_phase || !user.current_pattern) {
      console.error('[session/start] Teaching requested but phase/pattern missing — userId:', userId);
      return res.status(500).json({ error: 'Session state incomplete. Please contact support.' });
    }

    const { current_phase: phase, current_pattern: pattern } = user;
    const baseWordList = buildWordList(phase, pattern);
    if (baseWordList.length === 0) {
      return res.status(500).json({ error: `No word list found for ${phase} / ${pattern}` });
    }

    // Prepend any words flagged for review in the previous session (sense check failures).
    // Cap at 3 so the session doesn't feel like a repeat. Remove dupes from main list.
    const flaggedRows = db.prepare(`
      SELECT word FROM words
      WHERE user_id = ? AND pattern = ? AND status = 'flagged_for_review'
      ORDER BY last_attempted DESC LIMIT 3
    `).all(userId, pattern).map(r => r.word);

    const flaggedSet  = new Set(flaggedRows);
    const dedupedBase = baseWordList.filter(w => !flaggedSet.has(w));
    const wordList    = [...flaggedRows, ...dedupedBase];

    if (flaggedRows.length > 0) {
      console.log(`[session/start] prepending ${flaggedRows.length} flagged word(s): ${flaggedRows.join(', ')}`);
      // Reset their status so they don't repeat every session once done
      db.prepare(`UPDATE words SET status = 'learning' WHERE user_id = ? AND word IN (${flaggedRows.map(() => '?').join(',')})`).run(userId, ...flaggedRows);
    }

    const firstWord = wordList[0];
    const { explanation, sound, examples } = getRuleIntroScript(pattern);
    const listenText     = examples.length ? `Listen — ${examples.join(', ')}.` : null;
    const fullText       = [explanation, listenText].filter(Boolean).join(' ');
    const recordedSound  = sound ? checkForRecordedSound(sound) : null;
    const soundTTSText   = (!recordedSound && sound) ? preprocessTTSText(sound) : null;

    sessionStates.set(sessionId, buildFreshTeachingState(userId, phase, pattern, wordList));

    const [audio1, audio2, audio3] = await Promise.all([
      textToSpeech(explanation),
      recordedSound  ? Promise.resolve(recordedSound)
        : soundTTSText ? textToSpeech(soundTTSText)
        : Promise.resolve(null),
      listenText ? textToSpeech(listenText) : Promise.resolve(null),
    ]);

    // Send as separate segments — client stitches with PCM silence via Web Audio API,
    // which avoids the Xing-frame stop issue that breaks concatenated MP3 in <audio>.
    const audioSegments = [audio1, audio2, audio3]
      .filter(Boolean)
      .map(buf => buf.toString('base64'));

    saveExchange(sessionId, userId, 'assistant', fullText);
    res.json({ sessionId, tutorText: fullText, audioSegments, currentWord: firstWord, pattern });

  } catch(err) {
    console.error('session/start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Session: exchange ──────────────────────────────────────────────────────────
app.post('/api/session/exchange', requireAuth,
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req, res) => {
    try {
      const userId    = req.userId;
      const sessionId = parseInt(req.headers['x-session-id'], 10);
      if (!sessionId) return res.status(400).json({ error: 'x-session-id header required' });

      const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
      if (!session) return res.status(403).json({ error: 'Session not found' });
      if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'No audio received' });

      const mimeType = req.get('content-type') || 'audio/webm';

      // ── Choice (JSON body from asking-mode buttons) ────────────────────────
      if (mimeType === 'application/json') {
        const { choice } = JSON.parse(req.body.toString());
        const user    = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        const tState  = sessionStates.get(sessionId);
        console.log(`[choice] userId:${userId} sessionId:${sessionId} choice:${choice} stateMode:${tState?.mode}`);

        if (!tState || tState.mode !== 'asking') {
          return res.status(400).json({ error: 'Not in asking state' });
        }

        if (choice === 'done') {
          const closingSpeech = "That's it for today. Same time tomorrow.";
          const audio         = await textToSpeech(closingSpeech);
          saveExchange(sessionId, userId, 'assistant', closingSpeech);
          const { wordsAttempted = 0, wordsCorrect = 0 } = tState;
          const perfPct = wordsAttempted > 0 ? Math.round((wordsCorrect / wordsAttempted) * 100) : 0;
          db.prepare(`UPDATE sessions SET ended_at = datetime('now'), words_attempted = ?, words_correct = ?, performance_pct = ? WHERE id = ?`)
            .run(wordsAttempted, wordsCorrect, perfPct, sessionId);
          db.prepare(`UPDATE users SET last_session_date = date('now'), total_sessions = total_sessions + 1 WHERE id = ?`).run(userId);
          sessionStates.delete(sessionId);
          return res.json({ sessionComplete: true, tutorText: closingSpeech, audio: audio.toString('base64') });
        }

        if (choice === 'continue') {
          const next = getNextPattern(tState.phase, tState.pattern);
          if (!next) {
            const completeSpeech = "You've worked through the whole programme.";
            const audio = await textToSpeech(completeSpeech);
            saveExchange(sessionId, userId, 'assistant', completeSpeech);
            sessionStates.delete(sessionId);
            return res.json({ sessionComplete: true, tutorText: completeSpeech, audio: audio.toString('base64') });
          }

          db.prepare('UPDATE users SET current_phase = ?, current_pattern = ? WHERE id = ?')
            .run(next.phase, next.pattern, userId);

          const newWordList = buildWordList(next.phase, next.pattern);
          console.log(`[choice/continue] → ${next.phase}/${next.pattern} | words:${newWordList.length}`);

          const { explanation, sound, examples } = getRuleIntroScript(next.pattern);
          const listenText    = examples.length ? `Listen — ${examples.join(', ')}.` : null;
          const fullText      = [explanation, listenText].filter(Boolean).join(' ');
          const recordedSound = sound ? checkForRecordedSound(sound) : null;
          const soundTTSText  = (!recordedSound && sound) ? preprocessTTSText(sound) : null;

          sessionStates.set(sessionId, {
            ...buildFreshTeachingState(userId, next.phase, next.pattern, newWordList),
            completedPatterns:            tState.completedPatterns,
            patternsCompletedThisSession: tState.patternsCompletedThisSession,
            wordsAttempted:               tState.wordsAttempted,
            wordsCorrect:                 tState.wordsCorrect,
            savedWords:                   tState.savedWords,
          });

          const [audio1, audio2, audio3] = await Promise.all([
            textToSpeech(explanation),
            recordedSound  ? Promise.resolve(recordedSound)
              : soundTTSText ? textToSpeech(soundTTSText)
              : Promise.resolve(null),
            listenText ? textToSpeech(listenText) : Promise.resolve(null),
          ]);
          const audioSegments = [audio1, audio2, audio3].filter(Boolean).map(buf => buf.toString('base64'));
          saveExchange(sessionId, userId, 'assistant', fullText);
          return res.json({ sessionId, tutorText: fullText, audioSegments, currentWord: newWordList[0], pattern: next.pattern });
        }

        return res.status(400).json({ error: 'Invalid choice' });
      }

      // ── Audio path ─────────────────────────────────────────────────────────
      const userTranscript = await transcribeAudio(req.body, mimeType);
      if (!userTranscript?.trim()) return res.status(400).json({ error: 'No speech detected' });

      saveExchange(sessionId, userId, 'user', userTranscript);

      const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      const state = sessionStates.get(sessionId);

      console.log(`[exchange] userId:${userId} sessionId:${sessionId} baseline_done:${user.baseline_done} stateMode:${state?.mode}`);

      // ── Baseline exchange ──────────────────────────────────────────────────
      if (!user.baseline_done) {
        const progress    = getBaselineProgress(user);
        const currentEntry = BASELINE_SEQUENCE[progress.wordIndex];

        // Judge the attempt — string match first, GPT-4o if uncertain
        let outcome, confidence, likelyError;
        const quick = judgeBaseline_quick(userTranscript, currentEntry?.word || '');

        if (quick === 'correct') {
          outcome = 'correct'; confidence = 'high'; likelyError = 'none';
        } else {
          const j = await callBaselineJudgement(userTranscript, currentEntry?.word || '');
          outcome    = j.outcome;
          confidence = j.confidence;
          likelyError = j.likelyError;
          // Spec: if confidence is low, do not automatically mark wrong
          if (confidence === 'low' && outcome === 'wrong') outcome = 'unclear';
        }

        if (currentEntry) {
          progress.results.push({
            word: currentEntry.word, pattern: currentEntry.pattern,
            phase: currentEntry.phase, level: currentEntry.level,
            transcript: userTranscript, outcome, confidence, likelyError,
            correct: outcome === 'correct',
          });
        }

        progress.wordIndex = (progress.wordIndex || 0) + 1;

        // Check adaptive stopping after every level of 3 words
        const justFinishedLevel = progress.wordIndex % 3 === 0;

        if (justFinishedLevel) {
          const levelResults    = progress.results.slice(-3);
          const correctCount    = levelResults.filter(r => r.outcome === 'correct').length;
          const levelIndex      = (progress.wordIndex / 3) - 1; // 0-based
          const completedLevel  = BASELINE_LEVELS[levelIndex];
          const isLastLevel     = levelIndex === BASELINE_LEVELS.length - 1;

          if (correctCount <= 1 || isLastLevel) {
            // 0–1 correct → stop and teach at this level.
            // All levels passed (isLastLevel + 2–3 correct) → start at phase_9.
            const sp = (correctCount >= 2 && isLastLevel)
              ? { startPhase: 'phase_9_adult_words', startPattern: 'general' }
              : { startPhase: completedLevel.startPhase, startPattern: completedLevel.startPattern };

            console.log(`[baseline DONE] level ${levelIndex + 1} score:${correctCount}/3 — start at ${sp.startPhase}/${sp.startPattern}`);
            finaliseBaseline(userId, sessionId, progress, sp.startPhase, sp.startPattern);
            sessionStates.delete(sessionId);
            const transitionAudio = await textToSpeech(BASELINE_COMPLETE_SPEECH);
            return res.json({ userTranscript, baselineComplete: true, currentWord: null, tutorText: BASELINE_COMPLETE_SPEECH, audio: transitionAudio.toString('base64') });
          }

          // 2–3 correct — advance to next level silently
          const nextEntry = BASELINE_SEQUENCE[progress.wordIndex];
          console.log(`[baseline level ${levelIndex + 1} pass] score:${correctCount}/3 → next word:"${nextEntry?.word}"`);
          saveBaselineProgress(userId, progress);
          sessionStates.set(sessionId, { ...(state || {}), userId, mode: 'baseline', wordIndex: progress.wordIndex });
          return res.json({ userTranscript, currentWord: nextEntry?.word || null });
        }

        // Mid-level — silent advance, no speech, no audio
        const nextEntry = BASELINE_SEQUENCE[progress.wordIndex];
        console.log(`[baseline advance] word:"${currentEntry?.word}" outcome:${outcome} wordIndex:${progress.wordIndex} → next:"${nextEntry?.word}"`);
        saveBaselineProgress(userId, progress);
        sessionStates.set(sessionId, { ...(state || {}), userId, mode: 'baseline', wordIndex: progress.wordIndex });
        return res.json({ userTranscript, currentWord: nextEntry?.word || null });
      }

      // ── Teaching exchange ──────────────────────────────────────────────────
      // Reconstruct session state if lost (server restart wipes sessionStates Map)
      let tState = ['round', 'struggling', 'sensecheck'].includes(state?.mode) ? state : null;
      if (!tState && user.baseline_done && user.current_phase && user.current_pattern) {
        const rebuildList = buildWordList(user.current_phase, user.current_pattern);
        if (rebuildList.length > 0) {
          console.log(`[exchange] reconstructing state userId:${userId} → ${user.current_phase}/${user.current_pattern}`);
          tState = buildFreshTeachingState(userId, user.current_phase, user.current_pattern, rebuildList);
          sessionStates.set(sessionId, tState);
        }
      }
      if (!tState) {
        return res.status(400).json({ error: 'No active teaching session — please start a new session.' });
      }

      // ── mode: round ──────────────────────────────────────────────────────
      if (tState.mode === 'round') {
        const { phase, pattern, wordList, currentRound, wordsInRound, currentWordIndex, strugglingWords } = tState;
        const currentWord = wordsInRound[currentWordIndex];
        const patternRule = getPatternData(phase, pattern)?.rule ?? '';

        const tutorResult = await callTeachingGPT(currentWord, userTranscript, 1, pattern, phase, patternRule);
        const wordOutcome = tutorResult.wordOutcome === 'saved' ? 'wrong' : tutorResult.wordOutcome;
        const isCorrect   = wordOutcome === 'correct';

        const newStruggling = [...strugglingWords];
        if (!isCorrect && !newStruggling.includes(currentWord)) newStruggling.push(currentWord);

        recordAttempt({ userId, sessionId, word: currentWord, pattern, phase, attemptNumber: 1, transcript: userTranscript, outcome: wordOutcome, confidence: 'high' });
        upsertWordRecord(userId, currentWord, pattern, phase, isCorrect, 'learning');
        saveExchange(sessionId, userId, 'assistant', tutorResult.speech);

        const updatedState = {
          ...tState,
          strugglingWords:  newStruggling,
          wordsAttempted:   tState.wordsAttempted + 1,
          wordsCorrect:     tState.wordsCorrect + (isCorrect ? 1 : 0),
          currentWordIndex: currentWordIndex + 1,
        };
        const nextIdx      = currentWordIndex + 1;
        const isEndOfRound = nextIdx >= wordsInRound.length;

        if (!isEndOfRound) {
          sessionStates.set(sessionId, updatedState);
          const audio = await textToSpeech(tutorResult.speech);
          return res.json({ userTranscript, tutorText: tutorResult.speech, audio: audio.toString('base64'), currentWord: wordsInRound[nextIdx], mode: 'round', round: currentRound });
        }

        if (currentRound < 3) {
          const nextRound = currentRound + 1;
          const nextWords = shuffle([...wordList]);
          sessionStates.set(sessionId, { ...updatedState, currentRound: nextRound, wordsInRound: nextWords, currentWordIndex: 0 });
          const audio = await textToSpeech(tutorResult.speech);
          return res.json({ userTranscript, tutorText: tutorResult.speech, audio: audio.toString('base64'), currentWord: nextWords[0], mode: 'round', round: nextRound });
        }

        // End of round 3
        if (newStruggling.length > 0) {
          const remaining      = shuffle([...newStruggling]);
          const transitionText = "Let's go back to the ones you found tricky.";
          const fullSpeech     = `${tutorResult.speech} ${transitionText}`;
          sessionStates.set(sessionId, { ...updatedState, mode: 'struggling', remainingStruggling: remaining, additionalAttempts: {} });
          const audio = await textToSpeech(fullSpeech);
          return res.json({ userTranscript, tutorText: fullSpeech, audio: audio.toString('base64'), currentWord: remaining[0], mode: 'struggling' });
        }

        return handlePatternComplete(res, updatedState, sessionId, userId, tutorResult.speech);
      }

      // ── mode: struggling ─────────────────────────────────────────────────
      if (tState.mode === 'struggling') {
        const { phase, pattern, remainingStruggling, additionalAttempts } = tState;
        const currentWord  = remainingStruggling[0];
        const prevAttempts = additionalAttempts[currentWord] || 0;
        const attemptNum   = prevAttempts + 1;
        const patternRule  = getPatternData(phase, pattern)?.rule ?? '';

        const tutorResult = await callTeachingGPT(currentWord, userTranscript, attemptNum, pattern, phase, patternRule);
        const isCorrect   = tutorResult.wordOutcome === 'correct';

        let newRemaining  = [...remainingStruggling];
        let newSaved      = [...tState.savedWords];
        let finalSpeech   = tutorResult.speech;
        let finalOutcome  = tutorResult.wordOutcome;
        const newAttempts = { ...additionalAttempts, [currentWord]: attemptNum };

        if (isCorrect) {
          newRemaining = newRemaining.slice(1);
        } else if (attemptNum >= 2) {
          newRemaining = newRemaining.slice(1);
          newSaved.push(currentWord);
          finalSpeech  = FALLBACKS.saved;
          finalOutcome = 'saved';
        }
        // attempt 1 wrong: stay on same word

        recordAttempt({ userId, sessionId, word: currentWord, pattern, phase, attemptNumber: attemptNum, transcript: userTranscript, outcome: finalOutcome, confidence: 'high' });
        upsertWordRecord(userId, currentWord, pattern, phase, isCorrect, finalOutcome === 'saved' ? 'saved' : 'learning');
        saveExchange(sessionId, userId, 'assistant', finalSpeech);

        const updatedState = {
          ...tState,
          remainingStruggling: newRemaining,
          additionalAttempts:  newAttempts,
          savedWords:          newSaved,
          wordsCorrect:        tState.wordsCorrect + (isCorrect ? 1 : 0),
        };

        if (newRemaining.length === 0) {
          return handlePatternComplete(res, updatedState, sessionId, userId, finalSpeech);
        }

        const nextWord = (isCorrect || attemptNum >= 2) ? newRemaining[0] : currentWord;
        sessionStates.set(sessionId, updatedState);
        const audio = await textToSpeech(finalSpeech);
        return res.json({ userTranscript, tutorText: finalSpeech, audio: audio.toString('base64'), currentWord: nextWord, mode: 'struggling' });
      }

      // ── mode: sensecheck ─────────────────────────────────────────────────
      if (tState.mode === 'sensecheck') {
        const { senseCheckWords, senseCheckIndex } = tState;
        const scEntry     = senseCheckWords[senseCheckIndex];
        const patternRule = getPatternData(scEntry.phase, scEntry.pattern)?.rule ?? '';

        const tutorResult = await callTeachingGPT(scEntry.word, userTranscript, 1, scEntry.pattern, scEntry.phase, patternRule);
        const isCorrect   = tutorResult.wordOutcome === 'correct';

        recordAttempt({ userId, sessionId, word: scEntry.word, pattern: scEntry.pattern, phase: scEntry.phase, attemptNumber: 1, transcript: userTranscript, outcome: tutorResult.wordOutcome, confidence: 'high' });
        upsertWordRecord(userId, scEntry.word, scEntry.pattern, scEntry.phase, isCorrect, isCorrect ? 'learning' : 'flagged_for_review');
        saveExchange(sessionId, userId, 'assistant', tutorResult.speech);

        const nextIdx      = senseCheckIndex + 1;
        const updatedState = { ...tState, senseCheckIndex: nextIdx, wordsCorrect: tState.wordsCorrect + (isCorrect ? 1 : 0) };

        if (nextIdx >= senseCheckWords.length) {
          const fullSpeech = `${tutorResult.speech} ${ASKING_SPEECH}`;
          sessionStates.set(sessionId, { ...updatedState, mode: 'asking' });
          const audio = await textToSpeech(fullSpeech);
          return res.json({ userTranscript, tutorText: fullSpeech, audio: audio.toString('base64'), currentWord: null, mode: 'asking' });
        }

        sessionStates.set(sessionId, updatedState);
        const audio = await textToSpeech(tutorResult.speech);
        return res.json({ userTranscript, tutorText: tutorResult.speech, audio: audio.toString('base64'), currentWord: senseCheckWords[nextIdx].word, mode: 'sensecheck' });
      }

      return res.status(400).json({ error: 'No active teaching session — please start a new session.' });

    } catch(err) {
      console.error('session/exchange error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Session: end ───────────────────────────────────────────────────────────────
app.post('/api/session/end', requireAuth, async (req, res) => {
  try {
    const userId    = req.userId;
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const existing = db.prepare('SELECT ended_at FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
    if (existing && !existing.ended_at) {
      const state           = sessionStates.get(sessionId) || {};
      const wordsAttempted  = state.wordsAttempted || 0;
      const wordsCorrect    = state.wordsCorrect   || 0;
      const perfPct         = wordsAttempted > 0 ? Math.round((wordsCorrect / wordsAttempted) * 100) : 0;
      db.prepare(`UPDATE sessions SET ended_at = datetime('now'), words_attempted = ?, words_correct = ?, performance_pct = ? WHERE id = ? AND user_id = ?`)
        .run(wordsAttempted, wordsCorrect, perfPct, sessionId, userId);
      db.prepare(`UPDATE users SET last_session_date = date('now'), total_sessions = total_sessions + 1 WHERE id = ?`).run(userId);
    }

    sessionStates.delete(sessionId);
    res.json({ ok: true });
  } catch(err) {
    console.error('session/end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Progress ───────────────────────────────────────────────────────────────────
app.get('/api/progress', requireAuth, (req, res) => {
  try {
    const userId = req.userId;
    const user   = db.prepare('SELECT name, current_phase, current_pattern, total_sessions, last_session_date FROM users WHERE id = ?').get(userId);
    const wordsSecure  = db.prepare(`SELECT word FROM words WHERE user_id = ? AND mastery_level >= 2`).all(userId).map(r => r.word);
    const wordsSaved   = db.prepare(`SELECT word FROM words WHERE user_id = ? AND status = 'saved' ORDER BY last_attempted DESC LIMIT 20`).all(userId).map(r => r.word);
    const sessions     = db.prepare(`SELECT started_at, words_attempted, words_correct, performance_pct, phase_working_on FROM sessions WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 10`).all(userId);
    res.json({ user, wordsSecure, wordsSaved, sessions });
  } catch(err) {
    console.error('progress error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nHadleyRead running.`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`iPhone:  run ngrok http ${PORT} and open the https URL in Safari\n`);
});
