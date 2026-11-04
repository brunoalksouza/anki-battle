import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Service } from "./service";
import { fail } from "./service";
import { dayKey, languages, type Credit, type Word } from "../shared/model";
import { termRanges } from "../shared/text";
import type {
  DefinitionSuggestion,
  ExampleSuggestion,
} from "../shared/suggestions";
import {
  learnStyle,
  rankDefinitions,
  rankExamples,
  parseSimpleDictionary,
  cardDefinition,
} from "./suggestion-style";
const ua =
  "StudyGrove/1.0 (https://anki.aneblober.com; educational flashcards)";
async function json(url: URL | string) {
  const r = await fetch(url, {
    headers: { "User-Agent": ua },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    fail(502, "The free source is unavailable. Please try again later.");
  return r.json() as Promise<any>;
}
const licenseUrl = (license: string) =>
  license.toUpperCase().includes("CC0")
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : "https://creativecommons.org/licenses/by/2.0/fr/";
const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, 1000);
export class Integrations {
  constructor(
    private svc: Service,
    private dataDir: string,
  ) {}
  quota(user: string, kind: string, max: number) {
    const day = dayKey(this.svc.now());
    const used =
      this.svc.db.get(
        "SELECT count FROM usage WHERE user_id=? AND day=? AND kind=?",
        user,
        day,
        kind,
      )?.count || 0;
    if (used >= max)
      fail(
        429,
        "You have reached the daily limit for this search. You can keep studying and edit the text.",
      );
    this.svc.db.run(
      "INSERT INTO usage VALUES(?,?,?,1) ON CONFLICT(user_id,day,kind) DO UPDATE SET count=count+1",
      user,
      day,
      kind,
    );
  }
  async cached(key: string, fn: () => Promise<any>) {
    const cached = this.svc.db.get(
      "SELECT data FROM provider_cache WHERE key=? AND expires>?",
      key,
      this.svc.now().toISOString(),
    );
    if (cached) return JSON.parse(cached.data);
    const data = await fn();
    this.svc.db.run(
      "INSERT OR REPLACE INTO provider_cache VALUES(?,?,?)",
      key,
      JSON.stringify(data),
      new Date(+this.svc.now() + 86400000).toISOString(),
    );
    return data;
  }
  private style(user: string, excludeWord?: string) {
    return learnStyle(
      this.svc.list<Word>("words", user).filter((w) => w.id !== excludeWord),
    );
  }
  private async dictionary(
    term: string,
  ): Promise<{ definitions: DefinitionSuggestion[]; unavailable: boolean }> {
    const lookup = term
      .trim()
      .toLowerCase()
      .replace(/^to\s+(?=\S)/, "");
    const sources = await Promise.allSettled([
      this.cached("dictionary:english-v2:" + lookup, async () => {
        const r = await fetch(
          "https://api.dictionaryapi.dev/api/v2/entries/en/" +
            encodeURIComponent(lookup),
          {
            headers: { "User-Agent": ua },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (r.status === 404) return [];
        if (!r.ok) fail(502, "Dictionary temporarily unavailable.");
        const data = (await r.json()) as any[];
        return data.flatMap((entry) =>
          entry.meanings.flatMap((m: any) =>
            m.definitions.map((d: any) => ({
              meaning: d.definition,
              part: m.partOfSpeech,
              example: "",
              examples: d.example ? [d.example] : [],
              credit: {
                source: "Wiktionary / Free Dictionary",
                url: entry.sourceUrls?.[0] || "https://dictionaryapi.dev/",
                author: "Wiktionary contributors",
                license: entry.license?.name || "CC BY-SA 3.0",
                licenseUrl: entry.license?.url,
              },
            })),
          ),
        );
      }),
      this.cached("simple-dictionary:v1:" + lookup, async () => {
        const url = new URL("https://simple.wiktionary.org/w/api.php");
        url.search = new URLSearchParams({
          action: "parse",
          page: lookup,
          prop: "wikitext|revid",
          redirects: "1",
          format: "json",
        }).toString();
        const r = await fetch(url, {
          headers: { "User-Agent": ua },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) fail(502, "Simple dictionary temporarily unavailable.");
        const data = (await r.json()) as any;
        if (data.error?.code === "missingtitle") return [];
        if (!data.parse?.wikitext)
          fail(502, "Simple dictionary temporarily unavailable.");
        return parseSimpleDictionary(
          data.parse.wikitext["*"],
          data.parse.title,
          data.parse.revid,
        );
      }),
    ]);
    const definitions = sources
      .flatMap((r) =>
        r.status === "fulfilled" ? (r.value as DefinitionSuggestion[]) : [],
      )
      .map((d) => {
        const meaning = cardDefinition(d.meaning, lookup, d.part);
        return {
          ...d,
          meaning,
          credit:
            meaning === d.meaning ? d.credit : { ...d.credit, modified: true },
          exampleCredit: d.credit,
        };
      });
    return {
      definitions,
      unavailable: sources.some((r) => r.status === "rejected"),
    };
  }
  async definitions(user: string, term: string, lang: string) {
    this.quota(user, "dictionary", 100);
    const learned = this.style(user);
    if (lang !== "en")
      return {
        definitions: [],
        style: learned.style,
        notice:
          "Dictionary suggestions are available for English words. You can write your own meaning in English.",
      };
    const result = await this.dictionary(term);
    // Only raw source data is shared in the cache; ranking always uses this account.
    const definitions = rankDefinitions(result.definitions, term, learned);
    return {
      definitions,
      style: learned.style,
      notice: definitions.length
        ? result.unavailable
          ? "One source is unavailable. Showing suggestions from the other dictionary."
          : ""
        : result.unavailable
          ? "The free dictionaries are unavailable. Try again or write your own meaning."
          : "No clear definition found. Try the base form or write your own meaning in English.",
    };
  }
  async examples(user: string, word: Word) {
    this.quota(user, "sentences", 100);
    const lang =
        languages.find((l) => l.code === word.language)?.tatoeba ||
        word.language,
      to = "eng";
    // Keep explanations in English, independent of the user's native language.
    // A new cache namespace also avoids reusing old Portuguese suggestions.
    return this.cached(`examples:english-v2:${lang}:${word.term}`, async () => {
      const url = new URL("https://api.tatoeba.org/v1/sentences");
      url.search = new URLSearchParams({
        lang,
        q: '"' + word.term.replace(/["\\]/g, "") + '"',
        sort: "random",
        ...(lang === to ? {} : { "trans:lang": to }),
        limit: "100",
        is_unapproved: "no",
        word_count: word.language === "en" ? "4-20" : "3-18",
      }).toString();
      const data = await json(url);
      return (data.data || [])
        .filter((s: any) => termRanges(s.text, word.term, word.language).length)
        .map((s: any) => {
          const trans = (lang === to ? [] : s.translations || [])
            .flat(Infinity)
            .filter((t: any) => t && t.lang === to);
          return {
            sentence: s.text,
            translation: trans[0]?.text || "",
            credit: {
              source: "Tatoeba",
              url: `https://tatoeba.org/en/sentences/show/${s.id}`,
              author: s.owner || "Tatoeba contributors",
              license: s.license || "CC BY 2.0 FR",
              licenseUrl: licenseUrl(s.license || "CC BY 2.0 FR"),
            },
            translationCredit: trans[0]
              ? {
                  source: "Tatoeba",
                  url: `https://tatoeba.org/en/sentences/show/${trans[0].id}`,
                  author: trans[0].owner || "Tatoeba contributors",
                  license: trans[0].license || "CC BY 2.0 FR",
                  licenseUrl: licenseUrl(trans[0].license || "CC BY 2.0 FR"),
                }
              : null,
          };
        })
        .slice(0, 100);
    });
  }
  async suggest(user: string, wordId: string, another = false) {
    const before = this.svc.owned<Word>("words", wordId, user);
    if (!another && before.sentence)
      return {
        word: before,
        examples: [],
        notice: "Your existing example was kept.",
      };
    // Exclude the word being changed so each new example cannot reorder its own
    // candidate pool through the learned vocabulary.
    const learned = this.style(user, wordId);
    // Charge once per user action, even when a dictionary example is available.
    this.quota(user, "dictionary", 100);
    const [dictionary, source] = await Promise.allSettled([
      before.language === "en"
        ? this.dictionary(before.term)
        : Promise.resolve({ definitions: [], unavailable: false }),
      this.examples(user, before),
    ]);
    // A quota rejection must not be hidden as an upstream outage.
    if (source.status === "rejected" && source.reason?.statusCode === 429)
      throw source.reason;
    const definitions =
      dictionary.status === "fulfilled" ? dictionary.value.definitions : [];
    const paired: ExampleSuggestion[] = definitions.flatMap((d) =>
      d.examples.map((sentence) => ({
        sentence,
        translation: "",
        credit: d.exampleCredit || d.credit,
        translationCredit: null,
        meaning: d.meaning,
      })),
    );
    const ranked = rankExamples(
      [...paired, ...(source.status === "fulfilled" ? source.value : [])],
      before,
      learned,
    );
    const current = this.svc.owned<Word>("words", wordId, user);
    if (current.version !== before.version)
      fail(
        409,
        "The word changed while the example was loading. Please try again.",
      );
    if (!ranked.length)
      return {
        word: current,
        examples: [],
        notice:
          "No suitable example found. Your card is unchanged. Try the base form or write a short sentence in Edit.",
      };
    const index = ranked.findIndex((e) => e.sentence === before.sentence);
    const choice =
      ranked[another && index >= 0 ? (index + 1) % ranked.length : 0];
    if (choice.sentence === before.sentence)
      return {
        word: current,
        examples: ranked,
        notice:
          "No different example is available yet. Your current example was kept.",
      };
    const next: Word = {
      ...current,
      sentence: choice.sentence,
      translation: choice.translation,
      sentenceStatus: "ready",
      sentenceCredit: choice.credit,
      translationCredit: choice.translationCredit,
      version: current.version + 1,
    };
    this.svc.save("words", next);
    return {
      word: next,
      examples: ranked,
      notice: choice.meaning
        ? "A short example from the matching dictionary meaning."
        : "A short example in your study style. Check that it uses your chosen meaning.",
    };
  }
  private commonsUrl() {
    return new URL("https://commons.wikimedia.org/w/api.php");
  }
  private toImage(p: any) {
    const i = p.imageinfo?.[0],
      m = i?.extmetadata;
    if (!i?.thumburl || !m?.LicenseShortName?.value) return null;
    return {
      pageId: p.pageid,
      title: plain(p.title.replace(/^File:/, "")),
      url: i.thumburl,
      credit: {
        source: "Wikimedia Commons",
        url: i.descriptionurl,
        author: plain(
          m.Artist?.value || m.Credit?.value || "Wikimedia contributors",
        ),
        license: plain(m.LicenseShortName.value),
        licenseUrl: m.LicenseUrl?.value
          ?.replace(/^\/\//, "https://")
          .replace(/^http:/, "https:"),
      },
    };
  }
  async images(user: string, q: string) {
    this.quota(user, "images", 100);
    return this.cached("images:" + q, async () => {
      const url = this.commonsUrl();
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: q + " filetype:bitmap",
        gsrnamespace: "6",
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "480",
      }).toString();
      const data = await json(url);
      return Object.values(data.query?.pages || {})
        .map((p) => this.toImage(p))
        .filter(Boolean);
    });
  }
  async selectImage(
    user: string,
    wordId: string,
    pageId: number,
    version: number,
  ) {
    const word = this.svc.owned<Word>("words", wordId, user);
    if (word.version !== version)
      fail(409, "The word changed. Refresh before choosing an image.");
    this.quota(user, "image-download", 50);
    const url = this.commonsUrl();
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      pageids: String(pageId),
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "800",
    }).toString();
    const data = await json(url),
      image = Object.values(data.query?.pages || {})
        .map((p) => this.toImage(p))
        .find(Boolean);
    if (!image) fail(400, "Image unavailable.");
    const source = new URL(image.url);
    if (
      source.protocol !== "https:" ||
      !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(source.hostname)
    )
      fail(400, "Invalid image source.");
    const r = await fetch(source, {
      headers: { "User-Agent": ua },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
      fail(502, "Could not download the image.");
    if (Number(r.headers.get("content-length")) > 6000000)
      fail(400, "Image too large.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of r.body as any) {
      bytes += chunk.length;
      if (bytes > 6000000) fail(400, "Image too large.");
      chunks.push(chunk);
    }
    const buffer = await sharp(Buffer.concat(chunks), {
      limitInputPixels: 20000000,
    })
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    const current = this.svc.owned<Word>("words", wordId, user);
    if (current.version !== version)
      fail(
        409,
        "The word changed during the download. Please select it again.",
      );
    const assetId = randomUUID();
    mkdirSync(join(this.dataDir, "media"), { recursive: true, mode: 0o700 });
    writeFileSync(join(this.dataDir, "media", assetId + ".webp"), buffer, {
      mode: 0o600,
    });
    this.svc.db.run(
      "INSERT INTO assets VALUES(?,?,?)",
      assetId,
      user,
      JSON.stringify(image.credit),
    );
    const next = {
      ...current,
      imageId: assetId,
      imageCredit: { ...image.credit, modified: true },
      version: current.version + 1,
    };
    this.svc.save("words", next);
    return next;
  }
}
