# WhatsApp Web Bot

A feature-rich WhatsApp Web bot built with [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js), featuring a modular architecture, hot-reloading message handlers, external API service integrations, interactive games, media downloaders, and utility commands.

---

## 📁 Architecture Overview

```
c:\Codes\JS\Whatsapp-Web-Bot\
├── index.js                  # Main entry point & client setup with hot-reloading handler
├── handler.js                # Command routing engine
├── src/
│   ├── constants.js          # Regex patterns, prompt lists, zodiac signs, hangman stages
│   ├── helpers.js            # Pure utility functions (pixelify, decodeHtml, parseTimeString)
│   ├── commands/             # Individual command handler modules
│   │   ├── leetcodeHandler.js
│   │   ├── spamHandler.js
│   │   ├── replyHandler.js
│   │   ├── iplHandler.js
│   │   ├── mediaHandler.js
│   │   ├── groupHandler.js
│   │   ├── reminderHandler.js
│   │   ├── botProxyHandler.js
│   │   ├── searchHandler.js
│   │   └── infoHandler.js
│   ├── games/                # Interactive game engines
│   │   ├── hangman.js
│   │   ├── trivia.js
│   │   └── wordle.js
│   └── services/             # Third-party & external API integrations
│       ├── aiService.js
│       ├── apiService.js
│       ├── cricbuzzService.js
│       ├── instagramService.js
│       ├── lyricsService.js
│       └── movieService.js
├── leaderboard.json          # Persistent leaderboard data
└── words.json                # Word dictionary for games
```

---

## 🛠️ Services Summary (`src/services/`)

| Service | Description |
| :--- | :--- |
| **`aiService.js`** | Communicates with the Google Gemini API to answer general search queries and prompts. |
| **`apiService.js`** | Handles external API requests: Trivia (OpenTDB), Horoscopes (FreeHoroscope API), Memes (Meme-API), and Definitions (Free Dictionary API). |
| **`cricbuzzService.js`** | Live IPL match score scraper that parses Next.js payload structures on Cricbuzz for innings, overs, run rates, and batsmen stats. |
| **`instagramService.js`** | Downloads Instagram Reels/Posts/TV videos via `yt-dlp` child process execution with H.264 video codec optimization for WhatsApp compatibility. |
| **`lyricsService.js`** | Searches Genius API for song lyrics. |
| **`movieService.js`** | Queries TMDB API for movie information and watch links. |

---

## 🤖 Commands Summary (`src/commands/`)

| Command | Usage | Description |
| :--- | :--- | :--- |
| **LeetCode Leaderboard** | `/lc` | Queries LeetCode GraphQL API to generate a solved-problem leaderboard (Easy/Medium/Hard/Total) for tracked usernames. |
| **Daily LeetCode Challenge** | `/daily` | Fetches today's LeetCode daily problem, title, difficulty, formatted problem statement, and link. |
| **Spam Generator** | `/spam <count> <message>` | *(Group Only)* Sends up to 50 repeated messages with a 500ms delay to prevent rate-limiting. |
| **Auto-Reply Config** | `/reply <text>` / `/reply stop` | Configures the bot to automatically reply with specific text whenever a quoted user speaks in the chat. |
| **IPL Live Updates** | `/ipl` / `/ipl stop` / `/ipl status` | Polls live IPL scores every 5 minutes and posts updates to the chat. |
| **Instagram Downloader** | *(Paste Instagram Link)* | Automatically detects Instagram video URLs in messages, downloads them, sends the video media, and deletes temporary files. |
| **Sticker Generator** | `!sticker` | Converts attached or quoted images/videos into WhatsApp stickers. |
| **Tag Everyone** | `!everyone <optional text>` | *(Group Only)* Tags all participants in the group chat in a single message. |
| **One-time Reminder** | `!remindme <duration> <message>` | Sets a one-time reminder timer (e.g. `!remindme 10m Take break`). |
| **Recurring Reminder** | `!remindme every <duration> <message>` | Sets a recurring reminder interval (e.g. `!remindme every 1h Drink water`). |
| **Cancel Reminder** | `!cancelreminder` | Cancels any active recurring reminder in the current chat. |
| **Flask Bot Proxy** | `!bot <prompt>` | Proxies messages to a local Flask server on `http://localhost:5000/process`. |
| **AI Search & Context Chat** | `!ai <prompt>` / `/ai <prompt>` | Contextual AI assistant that analyzes the last 5 messages, current prompt, and quoted message. Uses Google Gemini API as primary and OpenRouter as automatic fallback. |
| **Song Lyrics** | `!lyrics <song name>` | Fetches lyrics for a song from Genius. |
| **Movie Search** | `!movie <movie title>` | Searches TMDB for a movie and returns a streaming link. |
| **Dictionary Definition** | `!define <word>` | Looks up word definitions, phonetics, and usage examples. |
| **Daily Horoscope** | `!horoscope <zodiac sign>` | Fetches daily horoscopes for a zodiac sign (e.g. `!horoscope leo`). |
| **Random Meme** | `!meme` | Fetches a random trending meme image from Reddit. |
| **Would You Rather** | `!wyr` | Sends a random "Would You Rather" scenario prompt. |
| **Update Display Name** | `!name <new name>` | *(Replying to user)* Updates a user's display name on the bot leaderboard. |

---

## 🎮 Interactive Games (`src/games/`)

| Game | Command | Description |
| :--- | :--- | :--- |
| **Hangman** | `!hangman`<br>`!g <letter>`<br>`!hangmanstop` | Guess a word letter by letter with hint definitions, ASCII hangman visuals, 6 allowed wrong guesses, and point rewards for winners. |
| **Trivia** | `!trivia`<br>`A` / `B` / `C` / `D` | Multiple-choice trivia questions with a 30-second timer. Award 2 points on the leaderboard for correct answers. |
| **Wordle** | `wordle`<br>`start`<br>`skip`<br>`!stop`<br>`leaderboard` | Guess pixelated words (`_ _ a _ _`) using clue definitions. Correct guesses increment score and update `leaderboard.json`. |
