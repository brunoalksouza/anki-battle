import type { Credit } from "./model";

export type StudyStyle = {
  cards: number;
  definitions: number;
  sentenceWords: [number, number];
  meaningWords: [number, number];
  personalized: boolean;
};
export type DefinitionSuggestion = {
  meaning: string;
  part: string;
  examples: string[];
  example: string;
  credit: Credit;
  exampleCredit?: Credit;
};
export type ExampleSuggestion = {
  sentence: string;
  translation: string;
  credit: Credit;
  translationCredit: Credit | null;
  // Present only for an example attached to this particular dictionary sense.
  meaning?: string;
};
