// Intl.Segmenter supplies Unicode word boundaries, including CJK and Thai.
// Expression matches must begin/end at segment boundaries; substrings never count.
export function termRanges(
  text: string,
  term: string,
  language = "en",
): { start: number; end: number }[] {
  if (!text || !term.trim()) return [];
  let locale = language;
  try {
    new Intl.Locale(locale);
  } catch {
    locale = "en";
  }
  const segments = [
    ...new Intl.Segmenter(locale, { granularity: "word" }).segment(text),
  ];
  const boundaries = new Set([
    0,
    text.length,
    ...segments.flatMap((s) => [s.index, s.index + s.segment.length]),
  ]);
  const escaped = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const rx = new RegExp(escaped, "giu");
  const matches = [];
  for (const m of text.matchAll(rx)) {
    const start = m.index!,
      end = start + m[0].length;
    if (boundaries.has(start) && boundaries.has(end))
      matches.push({ start, end });
  }
  return matches;
}
export function cloze(text: string, term: string, lang: string) {
  const ranges = termRanges(text, term, lang);
  if (!ranges.length) return null;
  let out = "",
    pos = 0;
  for (const r of ranges) {
    out += text.slice(pos, r.start) + "［…］";
    pos = r.end;
  }
  return out + text.slice(pos);
}
