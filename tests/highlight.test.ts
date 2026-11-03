import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Highlight } from "../src/ui";
import { highlightRanges } from "../shared/highlight";
import { termRanges, cloze } from "../shared/text";
import type { Word } from "../shared/model";

const marked = (text: string, term: string, language = "en") =>
  highlightRanges(text, term, language).map((r) => text.slice(r.start, r.end));

test("A newly saved singular word highlights the full plural in its sentence with its chosen color", () => {
  const text = "Beer is often sold in bottles.";
  const word = { term: "Bottle", language: "en", color: "#8058d8" } as Word;
  const html = renderToStaticMarkup(createElement(Highlight, { text, word }));
  assert.match(html, /<mark[^>]*>bottles<\/mark>/);
  assert.match(html, /background-color:#8058d822/);
  assert.match(html, /border-bottom-color:#8058d8/);
  assert.equal(html.replace(/<[^>]+>/g, ""), text);
});

test("English highlights handle regular, irregular, reverse and phrase plural forms", () => {
  for (const [term, text, expected] of [
    ["bottle", "Bottle, BOTTLES and bottle.", ["Bottle", "BOTTLES", "bottle"]],
    ["bottles", "A bottle beside two bottles.", ["bottle", "bottles"]],
    ["box", "Put the boxes inside the box.", ["boxes", "box"]],
    ["city", "These cities surround the city.", ["cities", "city"]],
    ["child", "A child is playing with the children.", ["child", "children"]],
    ["knife", "Keep the knives next to that knife.", ["knives", "knife"]],
    [
      "coffee maker",
      "We bought two coffee makers and a coffee maker.",
      ["coffee makers", "coffee maker"],
    ],
    ["ice cream", "I like ice   cream.", ["ice   cream"]],
  ] as const)
    assert.deepEqual(marked(text, term), expected);
  assert.deepEqual(marked("Two bottles.", "Bottle", "en-US"), ["bottles"]);
});

test("Highlight variants preserve word boundaries, uncountables, other languages and exact exercises", () => {
  assert.deepEqual(
    marked("horses horse seahorse seahorses horseshoe", "horse"),
    ["horses", "horse"],
  );
  assert.deepEqual(marked("bottle bottleneck rebottles bottle2", "bottle"), [
    "bottle",
  ]);
  assert.deepEqual(marked("new news newspapers", "news"), ["news"]);
  assert.deepEqual(marked("I know we can try.", "I"), ["I"]);
  assert.deepEqual(marked("She is here; they are outside.", "is"), ["is"]);
  assert.deepEqual(marked("bottle bottles", "bottle", "fr"), ["bottle"]);
  assert.deepEqual(marked("私は馬が好きです。馬車も好きです。", "馬", "ja"), [
    "馬",
  ]);
  assert.deepEqual(marked("a+b, a+b", "a+b"), ["a+b", "a+b"]);
  // Broader visual matches must not change cloze questions or source filters.
  assert.deepEqual(termRanges("bottles", "bottle"), []);
  assert.equal(cloze("Beer is sold in bottles.", "bottle", "en"), null);
  assert.equal(
    cloze("The bottle is empty.", "bottle", "en"),
    "The ［…］ is empty.",
  );
});

test("Multiple study words retain the longest non-overlapping highlight", () => {
  const text = "Two coffee makers and a bottle.";
  const words = [
    { term: "coffee", language: "en", color: "#111111" },
    { term: "coffee maker", language: "en", color: "#222222" },
    { term: "bottles", language: "en", color: "#333333" },
  ] as Word[];
  const html = renderToStaticMarkup(createElement(Highlight, { text, words }));
  assert.match(
    html,
    /<mark[^>]*border-bottom-color:#222222[^>]*>coffee makers<\/mark>/,
  );
  assert.match(
    html,
    /<mark[^>]*border-bottom-color:#333333[^>]*>bottle<\/mark>/,
  );
  assert.equal((html.match(/<mark/g) || []).length, 2);
  assert.equal(html.replace(/<[^>]+>/g, ""), text);
});
