import type { Word, Credit } from "../shared/model";
import type {
  StudyStyle,
  DefinitionSuggestion,
  ExampleSuggestion,
} from "../shared/suggestions";
import { termRanges } from "../shared/text";

const tokens = (text: string): string[] =>
  text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
const count = (text: string) => tokens(text).length;
const normalize = (text: string) => tokens(text).join(" ");
const stop = new Set(
  "a an the to of in on at for with from by as and or but is are was were be been being it its you your i my he his she her we our they their them this that these those something someone person people do does did have has had can could will would should very usually often".split(
    " ",
  ),
);
const content = (text: string, term: string) =>
  new Set(
    tokens(text).filter((t) => !stop.has(t) && !tokens(term).includes(t)),
  );

function range(values: number[], fallback: [number, number]): [number, number] {
  if (values.length < 5) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return [
    sorted[Math.floor((sorted.length - 1) * 0.25)],
    sorted[Math.floor((sorted.length - 1) * 0.75)],
  ];
}

export function learnStyle(words: Word[]) {
  const english = words.filter((w) => w.language === "en");
  const sentences = english.filter(
    (w) =>
      count(w.sentence) >= 4 &&
      count(w.sentence) <= 24 &&
      normalize(w.sentence) !== normalize(w.term),
  );
  const definitions = english.filter(
    (w) =>
      w.meaning &&
      !/^visual meaning\b/i.test(w.meaning) &&
      count(w.meaning) >= 2 &&
      count(w.meaning) <= 32,
  );
  const style: StudyStyle = {
    cards: english.length,
    definitions: definitions.length,
    sentenceWords: range(
      sentences.map((w) => count(w.sentence)),
      [6, 10],
    ),
    meaningWords: range(
      definitions.map((w) => count(w.meaning)),
      [5, 10],
    ),
    personalized: sentences.length >= 5,
  };
  // Stays on the server. Neither the corpus nor its vocabulary is sent to providers.
  const familiar = new Set(sentences.flatMap((w) => tokens(w.sentence)));
  return { style, familiar };
}
export type LearnedStyle = ReturnType<typeof learnStyle>;

function distance(n: number, [low, high]: [number, number]) {
  return n < low ? low - n : n > high ? n - high : 0;
}

export function exampleQuality(
  sentence: string,
  term: string,
  language = "en",
) {
  // English style rules should not reject languages without spaces or with
  // different sentence punctuation. They retain the existing exact-term check.
  if (language !== "en")
    return (
      !!sentence.trim() &&
      sentence.length <= 2000 &&
      termRanges(sentence, term, language).length === 1
    );
  const n = count(sentence);
  return (
    n >= 4 &&
    n <= 20 &&
    sentence.length <= 240 &&
    termRanges(sentence, term, language).length === 1 &&
    !/[\n{}<>]|https?:|\.{3}|…/.test(sentence) &&
    // A complete sentence, not a vocabulary fragment or a quoted dictionary label.
    /[.!?]["”']?$/.test(sentence.trim()) &&
    Array.from(
      new Intl.Segmenter(language, { granularity: "sentence" }).segment(
        sentence,
      ),
    ).length === 1
  );
}

export function sentenceScore(sentence: string, learned: LearnedStyle) {
  const words = tokens(sentence);
  return (
    20 -
    distance(words.length, learned.style.sentenceWords) * 1.5 +
    (words.filter((w) => learned.familiar.has(w)).length /
      Math.max(1, words.length)) *
      3
  );
}

export function sameSense(a: string, b: string, term: string) {
  // Lexical similarity cannot prove that two definitions mean the same thing
  // ("increase the amount" vs "decrease the amount", for example).
  return normalize(a) === normalize(b);
}

export function rankDefinitions(
  definitions: DefinitionSuggestion[],
  term: string,
  learned: LearnedStyle,
) {
  const seen = new Set<string>();
  return definitions
    .filter((d) => {
      const key = `${d.part}:${normalize(d.meaning)}`;
      if (
        seen.has(key) ||
        count(d.meaning) < 3 ||
        d.meaning.length > 1000 ||
        /(?:plural|past tense|past participle|alternative form|misspelling) of\b/i.test(
          d.meaning,
        )
      )
        return false;
      seen.add(key);
      return true;
    })
    .map((d, i) => {
      const example =
        d.examples
          .filter((e) => exampleQuality(e, term))
          .sort(
            (a, b) => sentenceScore(b, learned) - sentenceScore(a, learned),
          )[0] || "";
      const score =
        (d.credit.source === "Simple English Wiktionary" ? 14 : 0) +
        (example ? 5 : 0) -
        Math.min(10, distance(count(d.meaning), learned.style.meaningWords)) -
        (/\b(archaic|obsolete|dated|taxonomy|taxonomic|genus|species|vulgar)\b/i.test(
          d.meaning,
        )
          ? 12
          : 0) -
        (d.part === "noun" && count(d.meaning) < 5 ? 5 : 0) -
        i * 0.15;
      return { ...d, example, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ score, ...d }) => d);
}

export function cardDefinition(meaning: string, term: string, part: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let text = meaning;
  if (part === "noun") {
    text = text.replace(
      new RegExp(`^(?:A|An) ${escaped} is (?=(?:a|an|the) )`, "i"),
      "",
    );
  } else if (part === "verb") {
    // Only this unambiguous single-verb construction; never drop negations,
    // parenthetical qualifiers, additional sentences or pieces of a definition.
    text = text.replace(
      new RegExp(`^If you ${escaped} something, you ([a-z]+) it\\.$`, "i"),
      "To $1 something.",
    );
  } else if (part === "adjective") {
    text = text.replace(
      new RegExp(`^A(?:n)? ${escaped} person is someone who is `, "i"),
      "",
    );
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function rankExamples(
  examples: ExampleSuggestion[],
  word: Word,
  learned: LearnedStyle,
) {
  const seen = new Set<string>();
  return examples
    .filter((e) => {
      const key = normalize(e.sentence);
      if (
        !exampleQuality(e.sentence, word.term, word.language) ||
        seen.has(key) ||
        (e.meaning && !sameSense(e.meaning, word.meaning, word.term))
      )
        return false;
      seen.add(key);
      return true;
    })
    .map((e) => ({
      e,
      score:
        sentenceScore(e.sentence, learned) +
        (e.meaning
          ? 30
          : Math.min(
              3,
              [...content(word.meaning, word.term)].filter((t) =>
                content(e.sentence, word.term).has(t),
              ).length,
            ) * 2),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
}

// Parse a deliberately small, known subset of Simple Wiktionary markup. Unknown
// templates reject a line instead of silently dropping a qualifier or a meaning.
export function wikiText(line: string): string | null {
  let text = line
    .replace(/\{\{(?:countable|uncountable|transitive|intransitive)\}\}/gi, "")
    .replace(/\{\{synonyms\|[^{}]*\}\}/gi, "")
    .replace(/\{\{r\|([^{}|]+)(?:\|([^{}|]+))?\}\}/g, "$1$2")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,5}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (/[{}<>\[\]]|&\w+;/.test(text)) return null;
  return text;
}

export function parseSimpleDictionary(
  wikitext: string,
  title: string,
  revision?: number,
): DefinitionSuggestion[] {
  const credit: Credit = {
    source: "Simple English Wiktionary",
    url: `https://simple.wiktionary.org/w/index.php?title=${encodeURIComponent(title)}${revision ? `&oldid=${revision}` : ""}`,
    author: "Wiktionary contributors",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  };
  const results: DefinitionSuggestion[] = [];
  let part = "",
    current: DefinitionSuggestion | undefined;
  for (const line of wikitext.split("\n")) {
    const heading = /^={2,}\s*([^=]+?)\s*={2,}$/.exec(line.trim());
    if (heading) {
      part =
        /^(noun|verb|adjective|adverb|preposition|pronoun|conjunction|interjection|phrase|idiom)$/i.test(
          heading[1],
        )
          ? heading[1].toLowerCase()
          : "";
      current = undefined;
    } else if (part && /^# /.test(line)) {
      const meaning = wikiText(line.slice(2));
      current = meaning
        ? { meaning, part, examples: [], example: "", credit }
        : undefined;
      if (current) results.push(current);
    } else if (/^##/.test(line)) {
      // Sub-senses cannot inherit the parent's examples.
      current = undefined;
    } else if (current && /^#: /.test(line)) {
      const example = wikiText(line.slice(3));
      if (example) current.examples.push(example);
    }
  }
  return results;
}
