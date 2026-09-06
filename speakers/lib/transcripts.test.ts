import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import {
  applySpeakerMapping,
  extractSpeakers,
  findUnlabeledSpeakers,
  type Utterance,
} from "./transcripts.ts";

const transcript: Utterance[] = [
  {
    start: 1,
    end: 2,
    text: "  pierwsza wypowiedź  ",
    speaker: "SPEAKER_00",
    words: [{ word: "pierwsza", speaker: "SPEAKER_00" }],
  },
  {
    start: 3,
    end: 4,
    text: "druga wypowiedź",
    speaker: "SPEAKER_01",
    words: [{ word: "druga", speaker: "SPEAKER_01" }],
  },
  {
    start: 5,
    end: 6,
    text: "już podpisana",
    speaker: "Gimper",
    words: [{ word: "podpisana", speaker: "Gimper" }],
  },
];

describe("transcript speaker mapping", () => {
  it("extracts only unnamed speakers and their examples", () => {
    assert.deepEqual(extractSpeakers(transcript), {
      SPEAKER_00: {
        examples: [{ text: "pierwsza wypowiedź", timestamp: 1 }],
      },
      SPEAKER_01: {
        examples: [{ text: "druga wypowiedź", timestamp: 3 }],
      },
    });
  });

  it("applies mapping to utterances and individual words", () => {
    const updated = applySpeakerMapping(transcript, {
      SPEAKER_00: "Gimper",
      SPEAKER_01: "Revo",
    });

    assert.equal(updated[0].speaker, "Gimper");
    assert.equal(updated[0].words[0].speaker, "Gimper");
    assert.equal(updated[1].speaker, "Revo");
    assert.equal(updated[1].words[0].speaker, "Revo");
    assert.deepEqual(findUnlabeledSpeakers(updated), []);
  });

  it("reports every speaker left after an incomplete mapping", () => {
    const updated = applySpeakerMapping(transcript, { SPEAKER_00: "Gimper" });

    assert.deepEqual(findUnlabeledSpeakers(updated), ["SPEAKER_01"]);
  });
});
