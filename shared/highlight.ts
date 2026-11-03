import pluralize from "pluralize";
import { termRanges } from "./text";

// Pluralize also maps pronouns and auxiliary verbs (I → we, is → are).
// Those are separate study targets, not noun forms to highlight implicitly.
const exactOnly = new Set(
  "i we me us you he she it they them myself ourselves yourself yourselves itself themselves herself himself themself is are was were has have this these that those thou".split(
    " ",
  ),
);

export function highlightRanges(text: string, term: string, language = "en") {
  const target = term.trim();
  const forms = new Set([target]);
  if (
    /^en(?:-|$)/i.test(language) &&
    /^[a-z]+(?:[\s-]+[a-z]+)*$/i.test(target)
  ) {
    const [, prefix, last] = /^(.*?)([a-z]+)$/i.exec(target)!;
    if (!exactOnly.has(last.toLowerCase())) {
      forms.add(prefix + pluralize.singular(last));
      forms.add(prefix + pluralize.plural(last));
    }
  }
  // Reuse the Unicode boundary check and highlight the entire matched form.
  // Exact matching for cloze answers and dictionary searches stays independent.
  const matches = [...forms].flatMap((form) =>
    termRanges(text, form, language),
  );
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}
