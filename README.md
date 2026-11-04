# Study Grove

A personal study space for your words, your books, and your daily habits. Mobile-first English PWA at **https://anki.aneblober.com**, built with React/Vite, Fastify, persistent SQLite, and FSRS-7 (`ts-fsrs` 6).

Source: [brunoalksouza/study-grove](https://github.com/brunoalksouza/study-grove).

## Use the app

- **Home:** daily study progress, the reading goal, annual study heatmap, and your decks. Study days and visits are separate. Future days never lower your activity average.
- **Study:** private decks, spaced repetition, basic/reverse/cloze cards, and offline review. The focused mobile session keeps the card and difficulty buttons within the viewport.
- **Words:** definitions, examples, pronunciation, images, search, and CSV/JSON import/export. English words and their singular/plural forms are highlighted automatically.
- **Compete:** invite a friend to a seven-day consistency challenge. Each player studies their own private cards; compare study days first and distinct words reviewed second. Optional card quizzes use an explicitly shared deck.
- **Reading:** read every day, using confirmed Kindle dates. Access it from Home or Profile. Reading does not change flashcard points, schedules, or challenges.
- **Profile:** gallery photo, appearance, languages, time zone, limits, goals, history, exports, and recovery codes.

Install on iPhone through Safari → Share → Add to Home Screen, or use the install option in Profile. Download study decks to include their images and audio offline. Wait for **All synced** before clearing browser data or changing devices. Updates wait until you choose **Update now** outside an active review with no pending changes.

Existing Financeiro accounts were migrated once. This is not ongoing SSO: later passwords and new Financeiro users do not sync automatically. The app does not read financial records. Recovery codes are single-use; there is no recovery email service.

## Kindle daily reading

Open **Reading → Connect Kindle**. On a computer, sign in to Amazon Reading Insights and copy the `Cookie` request header from its `/insights/data` request in the browser's Network tools. Paste it into the masked field in Study Grove. The connection is saved only after a successful authenticated response. Never share this value in chat, screenshots, source files, or logs.

This uses an **unofficial Amazon endpoint**, not OAuth or a public Kindle API. The session grants broader Amazon account access. Each account has its own connection, encrypted with AES-256-GCM and account-bound authenticated data. Credentials never appear in snapshots, exports, client storage, or logs. The encryption key is a permission-restricted file in `DATA_DIR`. Disconnect removes the saved session and keeps confirmed reading history.

Once connected, the server checks every 15 minutes even when the phone and Mac are closed. The Kindle must sync with Amazon first. Manual checks are limited to once a minute. Expired authentication asks for reconnection; temporary failures retry and preserve the last successful data. No automatic connection is claimed until a session is verified from the server.

Only calendar days in the returned current daily streak are accumulated. Midnight ISO values retain Amazon's calendar date without shifting to the previous day in a local time zone. Repeated snapshots are idempotent; later streaks do not erase old dates. Blank calendar cells mean **no confirmed data**, not proof of no reading. A record streak or monthly total does not reconstruct the entire historical calendar. Marked-as-read titles are counted by unique ASIN and year; they are not proof a whole book was read. This endpoint does not provide reading minutes or pages.

## Run and validate

Node.js 24+ and npm. Public language sources require no paid AI key.

```sh
npm ci
npm test
npm run build
APP_ORIGIN=http://127.0.0.1:3100 npm start
```

Open http://127.0.0.1:3100. For development, run `npm run dev` and `npm run server`; Vite proxies `/api`. `.env.example` documents settings. `server/index.ts` loads an existing `.env`. Database, media, and optional Kindle session key live in `DATA_DIR`, excluded from Git.

```sh
bash deploy/publish.sh
node --import tsx scripts/verify-backup.ts /path/to/backup
```

The existing domain, Docker resources, database filename, account cookie, and IndexedDB identifiers retain their original names to preserve installed apps, sessions, queued reviews, and persistent data. The product name, PWA metadata, icon, package name, and exported filenames are **Study Grove**. Operational details and restoration instructions are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Data and offline behavior

SQLite uses WAL and transactions. Opaque HttpOnly sessions, hashed tokens, scrypt password verification, per-resource ownership, origin checks, and client headers protect private resources. Profile photos are visible to authenticated players; study media require ownership. There is no public host port for the API. The proxy supplies the trusted rate-limit IP.

IndexedDB isolates accounts. Downloaded cards/media and queued reviews survive closing the app. Atomic local writes and browser locks coordinate tabs. Action IDs make retries idempotent. Content conflicts preserve drafts for comparison, reapplication, or export. Concurrent reviews preserve history without duplicating scheduling or rewards. Offline reviews can sync for up to 90 days. The service worker caches only the app shell; private data and media stay in account-specific storage.

## Free language sources

- [Simple English Wiktionary](https://simple.wiktionary.org/) and [Free Dictionary API](https://dictionaryapi.dev/): short English meanings and same-sense examples with attribution. Preview and accept the meaning or the pair. Supported markup is parsed explicitly; unknown templates are skipped.
- [Tatoeba](https://api.tatoeba.org/): varied complete examples. The account's existing English cards guide length and vocabulary preferences, without rewriting those cards or sending the collection to providers. Only the looked-up term is sent. “Find another example” cycles cached candidates. Check the meaning when no verified dictionary pair is available.
- [Wikimedia Commons](https://commons.wikimedia.org/w/api.php): image search, preview, explicit selection, WebP conversion, and attribution. No Google scraping.

Provider quotas: 100 meaning and 100 sentence lookups per user/day, 50 image downloads/day, 24-hour query caches, and request timeouts. Failures do not prevent saving or studying. Visual meanings and fragments are excluded from definition style statistics. Personalization is recomputed per account outside shared provider caches. Suggestions use source selection and limited grammatical edits, without a paid generative model or guaranteed disambiguation.

## Import and export

Words accepts UTF-8 CSV or JSON (an array or `{ "words": [...] }`), up to 2 MB/1,000 words per batch. Explicit imports create words; retries of the same request are idempotent. Required fields: `term`, `meaning`. Optional fields: `language`, `color`, `tags`, `sentence`, `translation`, `kind` (`basic`, `reverse`, `cloze`). Content exports do not transfer binary media, accounts, or scheduling. Profile export includes personal history and pending changes; full restoration uses a server backup.

```csv
term,meaning,language,color,tags,sentence,translation,kind
horse,A large animal that people ride,en,#8058d8,animals,The horse runs across the field.,,basic
```

Administrative APKG migration uses `scripts/prepare-apkg.mjs` and `scripts/import-anki.ts`. It validates media checksums, archives the original, uses deterministic IDs to avoid duplicates, preserves source due dates, and reconstructs FSRS state from real reviews without granting historical points. Unsupported card templates are rejected. Original HTML is archived as text, never executed. Private imports and personal data are not in this repository.

## Competition

A consistency challenge requires an accepted invitation and covers seven calendar days including acceptance day. Each participant keeps their own deck private. Only participants can see the other player's aggregate daily counts, avatar, and nickname. One word counts once per study day, even across multiple cards. Study days decide the winner; total reviewed words break a tie.

Global points: 5 points for the first valid review of a word on a UTC day, at least 2 active seconds, up to 100 words/day. All self-ratings earn equally. Login, duplicates, early/suspended cards, and conflicts do not earn points. Active time pauses when hidden or idle and is capped at 120 seconds per answer. Self-ratings are not objective accuracy. Competitive weeks start Monday at 00:00 UTC; late offline reviews do not modify closed weeks.

Optional card quizzes require an accepted invitation and an authorized deck with four distinct pairs. Up to ten questions, 60 seconds each, 48-hour expiry. The server checks answers and timing. Correct answers rank first, then time on correct answers. Valid participation earns 10 points and a win 20, with caps of three rewards/day and one per opponent/week. Abandoned or expired quizzes give no rewards. Quizzes never alter personal card schedules.
