# 🎮 WhatsApp Bot — Game Analysis & Suggestions

## Current Games

| Game | Command(s) | Type | Points |
|---|---|---|---|
| **Trivia** | `!trivia`, `/t`, `/trivia` | MCQ, 30s timer | 1–4 pts (fewer wrong = more pts) |
| **Word Hangman** | `!word`, `!g <letter>`, `!wordstop` | Letter-by-letter word guessing | 1 pt/correct letter + bonus on win |
| **Movie Hangman** | `/h`, `!h`, `/hangman` | Movie title guessing (vowels pre-revealed) | 1 pt/letter + bonus on full solve |
| **Wordle** | `wordle`, `start`, `skip` | Continuous word guessing (pixelated hint) | pts = word length |

### Architecture Patterns Observed
- **State**: `Map<chatId, gameState>` — per-chat, concurrent-safe
- **Points**: `addPoints(user, pts, guesses, leaderboard)` — existing unified scoring
- **Display names**: `getUserDisplayName(user, user, leaderboard)` — name resolution handled
- **Commands**: `/cmd` and `!cmd` dual-prefix style
- **Timers**: `setTimeout` with `clearTimeout` for time-limited games
- **Words source**: `words.json` already loaded — can reuse for new word games

---

## 💡 Suggested New Games

### 1. 🔢 Number Guessr — `/numguess`
**Type:** Binary search guessing game  
**How it works:**
- Bot picks a secret number (1–100)
- Players say a number; bot replies *higher* / *lower* / *correct!*
- Points based on how few guesses it took (10 – guesses, min 1)
- Optional 60-second timer or unlimited guesses

**Why it fits:** Dead simple to implement (no external APIs, no data files), fast-paced, any number of players can compete.

```
Commands: /numguess → starts game
          /numstop → cancels
          Just type a number while game is active
```

---

### 2. 🔡 Anagram — `/anagram`
**Type:** Rearranged letters → find the word  
**How it works:**
- Pick a word from `words.json`, shuffle its letters
- Show scrambled letters + definition hint
- First to type the correct word wins
- Points = word length (same as Wordle)

**Why it fits:** Reuses the existing `words.json`. Mirrors Wordle's reward curve. No external dependency.

```
Commands: /anagram → new puzzle
          /anagram skip → skip this word
          /anagramstop → end game
          (type word freely to guess)
```

---

### 3. ⚡ Lightning Round Trivia — `/ltrivia`
**Type:** Multi-question rapid-fire trivia  
**How it works:**
- Fires 5 trivia questions back-to-back (15s each)
- Tracks per-player score across all 5
- Announces leaderboard at the end
- Uses the same `fetchTrivia()` API already in `apiService.js`

**Why it fits:** Trivia is already live — this is just a wrapper that chains 5 rounds and tracks a session scoreboard.

```
Commands: /lround → start lightning round
          Auto-progresses through 5 questions
          Players answer A/B/C/D normally
```

---

### 4. 🎭 Who Am I? (20 Questions) — `/whoami`
**Type:** Yes/No identity guessing game  
**How it works:**
- Bot picks a famous person / character / animal from a curated list
- Players ask yes/no questions (`Is it a human?`, `Is it alive?`)
- Bot uses the **existing `aiService.js`** to answer each question
- 20 questions max; first to guess correctly wins 5 pts
- If nobody guesses in 20 Qs → bot wins

**Why it fits:** Leverages the AI service already integrated. Social & hilarious in groups.

```
Commands: /whoami → bot picks and announces the category
          Ask any yes/no question to the chat
          Guess by saying "Is it <name>?"
          /whostop → reveal and stop
```

---

### 5. 🎯 Rapid Math — `/math`
**Type:** Mental math race  
**How it works:**
- Bot posts an arithmetic problem (e.g. `47 × 8 = ?`)
- Scales difficulty each round (addition → multiplication → mixed)
- 20-second timer; first correct answer wins 1–3 pts
- Auto-posts next problem after each solve

**Why it fits:** Pure JS logic, zero external dependencies. Very spammy and fun for groups. Same pattern as trivia.

```
Commands: /math → start continuous session
          /mathstop → end session
          Type the numeric answer to guess
```

---

### 6. 📺 Movie Emoji Puzzle — `/emojimovie`
**Type:** Decode the movie from emoji clues  
**How it works:**
- Bot posts 3–5 emojis that hint at a movie title (e.g. `🦁👑` = *The Lion King*)
- Players type the full movie name to guess
- Uses your existing MOVIES dataset for the titles; emojis curated manually in a small JSON

**Why it fits:** Uses the same MOVIES list from `movieHangman.js`. Emojis render beautifully in WhatsApp.

```
Commands: /emojimovie → new puzzle
          Type full movie title to guess
          /emojistart → alias
          /emojistop → cancel
```

---

### 7. 🔤 Spelling Bee (No-Vowel Challenge) — `/spellingbee`
**Type:** Spell a word from consonants + definition  
**How it works:**
- Show only the consonants of a word + its definition (like reverse Movie Hangman)
- Players fill in the vowels and type the full word
- e.g. `H__S_ = a dwelling place` → answer: `HOUSE`
- Points scale with word length; 30-second timer

**Why it fits:** Inverts the existing Word Hangman mechanic (consonants shown, vowels hidden). Reuses `words.json`.

```
Commands: /spellingbee → new word
          Type the full word to guess
          /beestop → cancel
```

---

## 🧱 Implementation Complexity

| Game | Complexity | New Dependencies | Reuses |
|---|---|---|---|
| Number Guessr | ⭐ Very Easy | None | State pattern |
| Anagram | ⭐⭐ Easy | None | `words.json` |
| Lightning Trivia | ⭐⭐ Easy | None | `fetchTrivia()`, trivia state |
| Rapid Math | ⭐⭐ Easy | None | State pattern |
| Spelling Bee | ⭐⭐ Easy | None | `words.json` |
| Emoji Movie | ⭐⭐⭐ Medium | Emoji-movie JSON | `MOVIES` list |
| Who Am I? | ⭐⭐⭐ Medium | None | `aiService.js` |

> [!TIP]
> **My recommendation:** Start with **Anagram** or **Lightning Trivia** — they reuse existing infrastructure (`words.json` and `fetchTrivia()`) and can be built in under 50 lines each following the exact same pattern as your current games. Want me to implement any of them?

---

## 💡 Batch 2 — More Suggestions

### 8. 🔗 Word Chain — `/wordchain`
**Type:** Vocabulary chain reaction  
**How it works:**
- Bot starts with a random word (e.g. `APPLE`)
- Each player must reply with a word that **starts with the last letter** of the previous word (`APPLE → ELEPHANT → TIGER → ...`)
- 20-second timer per turn. Fail or repeat → you're out
- Last player standing wins
- Words validated against `words.json`

**Why it fits:** `words.json` already loaded, group competitive mechanics, near-zero code.

```
Commands: /wordchain → start game
          /wstop → cancel
          Type a valid word to continue the chain
```

### 9. 🃏 Truth or Dare Bot — `/tod`
**Type:** Social group prompt game  
**How it works:**
- Someone triggers `/tod @mention`
- Bot randomly picks *Truth* or *Dare* and sends a prompt from a curated JSON list
- Truths: fun personal questions (`"What's the most embarrassing thing in your camera roll?"`)
- Dares: group challenges (`"Send a voice note singing happy birthday"`)
- No scoring — pure social fun

**Why it fits:** No logic, just a prompt JSON file + random picker. Huge group engagement.

```
Commands: /tod → random T or D for yourself
          /truth → force a truth
          /dare → force a dare
```

### 10. 🎵 Song Lyrics Quiz — `/lyrics`
**Type:** Fill-in-the-blank from famous songs  
**How it works:**
- Bot posts a lyric snippet with one word blanked: `"We will ___ you" — Queen`
- First to type the missing word wins 2 pts
- 30-second timer, then reveals answer
- Songs sourced from a curated JSON (Bollywood + Hollywood split)

**Why it fits:** Your `lyricsService.js` already exists — you can pull real lyrics and blank a word programmatically.

```
Commands: /lyrics → new lyric puzzle
          /lyricsb → Bollywood mode
          /lyricsstop → end session
          Type the missing word to guess
```

### 11. 🧩 Cryptic Clue — `/cryptic`
**Type:** Crossword-style wordplay  
**How it works:**
- Bot posts a cryptic clue from a curated list (e.g. `"Sounds like a vegetable but means brave (6 letters)"`)
- Answer: `CARROT` → `COURAGE` (sounds like... puns)
- No letter hints, pure wordplay
- 5 minutes to answer, 3 pts reward

**Why it fits:** Intellectual, slow-burn game that doesn't spam the chat. One clue at a time.

```
Commands: /cryptic → post a clue
          Type the answer freely
          /crypticstop → reveal answer
```

### 12. 🌍 Geography Quiz — `/geo`
**Type:** Capital cities & flag guessing  
**How it works:**
- Bot posts a flag emoji + country name → players guess the capital
- OR: posts a capital → players guess the country
- Uses the free `restcountries.com` API (no key needed)
- 30-second timer, 1–2 pts

**Why it fits:** WhatsApp renders flag emojis natively. Free API, no key required.

```
Commands: /geo → random country→capital
          /flag → random flag→country
          /geostop → cancel
          Type the answer
```

### 13. 🤯 Would You Rather Voting — `/wyr`
**Type:** Group poll + debate  
**How it works:**
- Bot posts two wild scenarios: `"Would you rather fight 100 duck-sized horses OR 1 horse-sized duck?"`
- Players reply `A` or `B`
- After 60 seconds, bot reveals the vote tally + announces majority winner
- The **minority** voters lose 1 pt (losers penalty — optional)
- Uses your existing `!wyr` command as inspiration (already in `infoHandler.js`!)

**Why it fits:** `!wyr` is already partially implemented — this is just upgrading it to a voting+scoring game.

```
Commands: /wyr → post a dilemma
          Reply A or B within 60 seconds
          Auto-tallies and scores
```

### 14. 🐾 Guess the Emoji Story — `/emojistory`
**Type:** Creative emoji→narrative decoding  
**How it works:**
- Bot posts a short sequence of emojis that narrates a famous movie/story/proverb
- e.g. `🕷️👨‍🦸💪🏙️` = *Spider-Man*
- First correct guess wins 3 pts
- Three-hint system: first hint costs 0 pts to answer, 2nd hint shown at 30s, 3rd at 60s

**Why it fits:** Extends your existing `/emojimovie` idea but generalises beyond movies — proverbs, fairy tales, songs.

```
Commands: /emojistory → new story
          Type the answer
          /emojiclue → request a hint (−1 pt from winnings)
```

### 15. 🔐 Secret Word (Codenames-lite) — `/codename`
**Type:** Clue-giving deduction game  
**How it works:**
- Bot picks 9 words and lays them out in a 3×3 grid
- One player is the **Clue Giver** (randomly chosen)
- Clue Giver sends ONE word + a number (`Fruit 2`) to hint at 2 words in the grid
- Other players guess which grid words the clue points to
- 5 pts for the team if all guessed correctly, 0 otherwise

**Why it fits:** Multiplayer social deduction — perfect for active groups. Uses `words.json`. Unique from everything else.

```
Commands: /codename → start, bot picks clue giver
          Clue giver: "word number" format
          Others: type grid words to select
          /codenamestop → cancel
```

### 16. ⏳ Story Builder (AI-assisted) — `/story`
**Type:** Collaborative creative writing  
**How it works:**
- Bot starts a story with one sentence: `"It was a dark and stormy night when..."`
- Each participant adds ONE sentence to continue it (in order, 60s each)
- After 10 sentences, bot uses **`aiService.js`** to write a dramatic ending + rate the group's story
- Most creative contributor (AI-judged) gets 5 pts

**Why it fits:** Leverages `aiService.js` for a unique interactive experience. Great for creative groups.

```
Commands: /story → bot starts a prompt
          Reply with your sentence to continue
          Auto-advances after 10 contributions
```

### 17. 🎲 Daily Challenge — `/daily`  *(replaces the LeetCode one)*
**Type:** One-question-a-day per chat  
**How it works:**
- A single trivia question drops at a scheduled time (or on `/daily`)
- Everyone has **until midnight** to answer it once
- Points posted in a daily digest at the end of the day
- No rushing — encourages passive engagement

**Why it fits:** Your `/daily` command is already LeetCode-only. This generalises it to trivia + wordplay + math on rotation. Low pressure, high retention.

```
Commands: /daily → post today's challenge
          Answer any time (once per user)
          /dailystats → see who's answered today
```

---

## 🧱 Full Complexity Table (All 17 Games)

| # | Game | Complexity | New Deps | Reuses |
|---|---|---|---|---|
| 1 | Number Guessr | ⭐ | None | State pattern |
| 2 | Anagram | ⭐ | None | `words.json` |
| 3 | Lightning Trivia | ⭐ | None | `fetchTrivia()` |
| 4 | Rapid Math | ⭐ | None | State pattern |
| 5 | Spelling Bee | ⭐⭐ | None | `words.json` |
| 6 | Emoji Movie | ⭐⭐ | Emoji map JSON | `MOVIES` list |
| 7 | Who Am I? | ⭐⭐⭐ | None | `aiService.js` |
| 8 | Word Chain | ⭐ | None | `words.json` |
| 9 | Truth or Dare | ⭐ | Prompts JSON | State pattern |
| 10 | Lyrics Quiz | ⭐⭐ | Lyrics JSON | `lyricsService.js` |
| 11 | Cryptic Clue | ⭐⭐ | Clues JSON | State pattern |
| 12 | Geography Quiz | ⭐⭐ | `restcountries` API | `fetchTrivia()` pattern |
| 13 | WYR Voting | ⭐⭐ | None | `infoHandler.js` (partial) |
| 14 | Emoji Story | ⭐⭐ | Story JSON | `emojimovie` idea |
| 15 | Codenames-lite | ⭐⭐⭐ | None | `words.json` |
| 16 | Story Builder | ⭐⭐⭐ | None | `aiService.js` |
| 17 | Daily Challenge | ⭐⭐ | None | `fetchTrivia()` + scheduler |

> [!TIP]
> **Word Chain** is the highest bang-for-buck in Batch 2 — it's as easy as Anagram but creates *competitive* group dynamics unlike any existing game. **WYR Voting** is also an easy win since the prompt infra is already half-built in `infoHandler.js`.

> [!NOTE]
> All games follow the same architecture: `Map<chatId, state>`, `addPoints()` for scoring, and dual `/!` command prefixes. Any new game file fits directly as a new module under `src/games/` with a handler export wired into `handler.js`.
