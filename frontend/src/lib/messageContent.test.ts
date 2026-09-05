import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { parseContent } from "./messageContent.ts";

describe("parseContent", () => {
  it("leaves a regular markdown answer untouched", () => {
    assert.deepEqual(parseContent("Pierwsza linia\n\n**ważna odpowiedź**"), {
      text: "Pierwsza linia\n\n**ważna odpowiedź**",
      quotes: [],
    });
  });

  it("extracts a multiline quote with speaker, source and timestamp", () => {
    const content = [
      "Odpowiedź",
      "",
      "> „Pierwsza linia",
      "> druga linia” — Gimper, ZGRZYT #42, 12:34",
    ].join("\n");

    assert.deepEqual(parseContent(content), {
      text: "Odpowiedź",
      quotes: [
        {
          quote: '"Pierwsza linia druga linia"',
          speaker: "Gimper",
          source: "ŹRÓDŁO: ZGRZYT #42",
          timestamp: "12:34",
        },
      ],
    });
  });

  it("keeps an unstructured blockquote as a quote", () => {
    assert.deepEqual(parseContent("> cytat bez metadanych"), {
      text: "",
      quotes: [{ quote: "cytat bez metadanych" }],
    });
  });
});
