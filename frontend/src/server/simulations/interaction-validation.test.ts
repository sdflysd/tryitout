import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAgentActionsResponse,
  validateArbiterResponse,
  validateWorldEventResponse,
} from "./interaction-validation.js";

test("validateWorldEventResponse accepts a minimal valid customer feedback event", () => {
  const result = validateWorldEventResponse({
    event: {
      type: "customer_feedback",
      title: "Customer is worried",
      description: "A target customer says the promise is interesting but still unclear.",
      impact: "negative",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      event: {
        type: "customer_feedback",
        title: "Customer is worried",
        description: "A target customer says the promise is interesting but still unclear.",
        impact: "negative",
      },
    });
  }
});

test("validateAgentActionsResponse rejects unknown action types and malformed votes", () => {
  const unknownActionResult = validateAgentActionsResponse({
    actions: [
      {
        id: "act_1",
        type: "dance",
        actorAgentId: "skeptic_agent",
        content: "This is a dramatic interpretation.",
        reason: "Trying to express disagreement.",
        impact: "neutral",
      },
    ],
    votes: [
      {
        agentId: "skeptic_agent",
        verdict: "continue",
        confidence: 55,
        stateDeltaVote: {
          confidence: -3,
        },
        rationale: "The plan still needs evidence.",
      },
    ],
  });

  assert.equal(unknownActionResult.ok, false);
  if (!unknownActionResult.ok) {
    assert.match(unknownActionResult.error, /action type/i);
  }

  const malformedVoteResult = validateAgentActionsResponse({
    actions: [
      {
        id: "act_1",
        type: "challenge",
        actorAgentId: "skeptic_agent",
        content: "This assumption needs evidence.",
        reason: "The plan depends on trust that has not been tested.",
        impact: "negative",
      },
    ],
    votes: [
      {
        agentId: "skeptic_agent",
        verdict: "continue",
        confidence: "high",
        stateDeltaVote: {
          confidence: -3,
        },
        rationale: "The plan still needs evidence.",
      },
    ],
  });

  assert.equal(malformedVoteResult.ok, false);
  if (!malformedVoteResult.ok) {
    assert.match(malformedVoteResult.error, /vote|confidence/i);
  }
});

test("validateArbiterResponse accepts finalDelta without clamping", () => {
  const result = validateArbiterResponse({
    summary: "The skeptical evidence should carry extra weight.",
    acceptedAgentIds: ["skeptic_agent"],
    rejectedAgentIds: ["optimist_agent"],
    verdict: "pivot",
    finalDelta: {
      confidence: -80,
    },
    keyDecision: "Interview target users before building more.",
    nextSuggestion: "Schedule three customer calls tomorrow.",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.finalDelta.confidence, -80);
  }
});

test("validateArbiterResponse rejects malformed arbiter string fields", () => {
  const malformedSummaryResult = validateArbiterResponse({
    summary: { text: "Not a plain string" },
    acceptedAgentIds: ["skeptic_agent"],
    rejectedAgentIds: ["optimist_agent"],
    finalDelta: {
      confidence: -5,
    },
    keyDecision: "Interview target users before building more.",
    nextSuggestion: "Schedule three customer calls tomorrow.",
  });

  assert.equal(malformedSummaryResult.ok, false);
  if (!malformedSummaryResult.ok) {
    assert.match(malformedSummaryResult.error, /summary/i);
  }

  const missingKeyDecisionResult = validateArbiterResponse({
    summary: "The skeptical evidence should carry extra weight.",
    acceptedAgentIds: ["skeptic_agent"],
    rejectedAgentIds: ["optimist_agent"],
    finalDelta: {
      confidence: -5,
    },
    nextSuggestion: "Schedule three customer calls tomorrow.",
  });

  assert.equal(missingKeyDecisionResult.ok, false);
  if (!missingKeyDecisionResult.ok) {
    assert.match(missingKeyDecisionResult.error, /keyDecision/i);
  }

  const malformedNextSuggestionResult = validateArbiterResponse({
    summary: "The skeptical evidence should carry extra weight.",
    acceptedAgentIds: ["skeptic_agent"],
    rejectedAgentIds: ["optimist_agent"],
    finalDelta: {
      confidence: -5,
    },
    keyDecision: "Interview target users before building more.",
    nextSuggestion: "",
  });

  assert.equal(malformedNextSuggestionResult.ok, false);
  if (!malformedNextSuggestionResult.ok) {
    assert.match(malformedNextSuggestionResult.error, /nextSuggestion/i);
  }
});
