export type Schedule = {
  cardId: string;
  stability: number;
  stabilityFast: number;
  difficulty: number;
  state: number;
  scheduleStatus: string;
  dueAt: string;
  lastReviewAt: string | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
};
export type User = {
  id: string;
  email: string;
  nickname: string;
  avatar: string;
  avatarPhotoId?: string | null;
  nativeLang: string;
  studyLang: string;
  timezone: string;
  dailyNew: number;
  dailyReview: number;
  theme: "system" | "light" | "dark";
  createdAt: string;
};
export type Deck = {
  id: string;
  name: string;
  description: string;
  language: string;
  color: string;
  icon: string;
  shared: boolean;
  version: number;
  createdAt: string;
};
export type Credit = {
  source: string;
  url: string;
  author: string;
  license: string;
  licenseUrl?: string;
  modified?: boolean;
};
export type Word = {
  extraImages?: string[];
  audio?: { id: string; name: string }[];
  source?: {
    name: string;
    noteId: string;
    needsMeaning: boolean;
    originalFront: string;
    originalBack: string;
  };
  id: string;
  deckId: string;
  term: string;
  meaning: string;
  language: string;
  color: string;
  tags: string[];
  sentence: string;
  translation: string;
  sentenceStatus: "pending" | "ready" | "manual";
  sentenceCredit: Credit | null;
  translationCredit?: Credit | null;
  meaningCredit: Credit | null;
  imageId: string | null;
  imageCredit: Credit | null;
  kind: "basic" | "reverse" | "cloze";
  version: number;
  createdAt: string;
};
export type Card = {
  id: string;
  wordId: string;
  direction: "forward" | "reverse" | "cloze";
  schedule: Schedule;
  revision: number;
  suspended: boolean;
};
export type ReviewAction = {
  id: string;
  cardId: string;
  baseRevision: number;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: string;
  activeMs: number;
};
export type ReviewRecord = ReviewAction & {
  status: string;
  points: number;
  localDay: string;
  before?: Schedule;
  after?: Schedule;
};
export type Goal = {
  week: string;
  reviews: number;
  days: number;
  words: number;
};
export type Day = {
  day: string;
  reviews: number;
  activeMs: number;
  words: number;
  access: boolean;
  selfRatings: number[];
  objectiveCorrect: number;
  objectiveTotal: number;
};
export type Ranking = {
  id: string;
  nickname: string;
  avatar: string;
  avatarPhotoId?: string | null;
  points: number;
  rank: number;
};
export type Group = { id: string; name: string; code: string; members: number };
export type Battle = {
  id: string;
  hostId: string;
  guestId: string;
  hostName: string;
  guestName: string;
  hostAvatar: string;
  guestAvatar: string;
  hostAvatarPhotoId?: string | null;
  guestAvatarPhotoId?: string | null;
  deckName: string;
  status:
    "invited" | "active" | "completed" | "declined" | "abandoned" | "expired";
  createdAt: string;
  expiresAt: string;
  winnerId: string | null;
  hostCorrect: number;
  guestCorrect: number;
  hostTime: number;
  guestTime: number;
  rounds: number;
  myAnswered: number;
};
export type Snapshot = {
  user: User;
  decks: Deck[];
  words: Word[];
  cards: Card[];
  reviews: ReviewRecord[];
  days: Day[];
  goals: Goal[];
  rankings: { weekly: Ranking[]; all: Ranking[] };
  battles: Battle[];
  groups: Group[];
  now: string;
  integrations: { sentences: string; images: string };
  points: number;
};
export const languages = [
  { code: "en", name: "English", flag: "🇬🇧", tatoeba: "eng" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", tatoeba: "jpn" },
  { code: "es", name: "Spanish", flag: "🇪🇸", tatoeba: "spa" },
  { code: "fr", name: "French", flag: "🇫🇷", tatoeba: "fra" },
  { code: "de", name: "German", flag: "🇩🇪", tatoeba: "deu" },
  { code: "it", name: "Italian", flag: "🇮🇹", tatoeba: "ita" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", tatoeba: "por" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", tatoeba: "cmn" },
  { code: "ko", name: "Korean", flag: "🇰🇷", tatoeba: "kor" },
  { code: "ru", name: "Russian", flag: "🇷🇺", tatoeba: "rus" },
  { code: "ar", name: "Arabic", flag: "🇸🇦", tatoeba: "ara" },
  { code: "nl", name: "Dutch", flag: "🇳🇱", tatoeba: "nld" },
];
export const colors = [
  "#8058d8",
  "#3275d9",
  "#20866b",
  "#c06a19",
  "#c34e72",
  "#667085",
];
export const dayKey = (date: Date | string, timezone = "UTC") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function weekKey(date: Date | string = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const level = (points: number) =>
  1 + Math.floor(Math.sqrt(points / 100));
export const normalizeAnswer = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");
export function streak(days: Day[], today: string) {
  const set = new Set(days.filter((d) => d.reviews > 0).map((d) => d.day));
  let d = new Date(today + "T12:00:00Z");
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
