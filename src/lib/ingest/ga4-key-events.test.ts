import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countsKeyEvent,
  dimensionIndex,
  firstKeyEventAttempt,
  keyEventRetryPlan,
} from "./ga4-key-events";
import { GA4_FORM_ID_DIMENSION, GA4_PLACEMENT_DIMENSION } from "../sources";

describe("key event report", () => {
  it("requests customEvent:form_id alongside placement", () => {
    const attempt = firstKeyEventAttempt();
    assert.equal(attempt.formIdKnown, true);
    assert.deepEqual(attempt.dimensions.slice(0, 4), ["date", "hostName", "eventName", "pagePath"]);
    assert.equal(dimensionIndex(attempt, GA4_FORM_ID_DIMENSION), 4);
    assert.equal(dimensionIndex(attempt, GA4_PLACEMENT_DIMENSION), 5);
  });

  it("drops form_id when GA4 says that dimension is not registered", () => {
    const plan = keyEventRetryPlan(
      new Error("Field customEvent:form_id is not a valid dimension."),
    );
    assert.equal(plan[0]?.formIdKnown, false);
    assert.equal(plan[0]?.hasPlacement, true);
    assert.equal(plan.at(-1)?.dimensions.includes(GA4_FORM_ID_DIMENSION), false);
  });

  it("keeps the form_id filter when placement is the dimension that failed", () => {
    const plan = keyEventRetryPlan(new Error("Did you mean customEvent:placement?"));
    assert.equal(plan[0]?.formIdKnown, true);
    assert.equal(plan[0]?.hasPlacement, false);
  });
});

describe("form_submit counting", () => {
  it("counts form_submit only when form_id is set", () => {
    assert.equal(countsKeyEvent("form_submission", "library_optin", true), true);
    assert.equal(countsKeyEvent("form_submission", "", true), false);
    assert.equal(countsKeyEvent("form_submission", "   ", true), false);
    assert.equal(countsKeyEvent("form_submission", "(not set)", true), false);
    assert.equal(countsKeyEvent("form_submission", "(Not Set)", true), false);
  });

  it("does not filter other events, even when form_id is missing", () => {
    assert.equal(countsKeyEvent("gate_open", "(not set)", true), true);
    assert.equal(countsKeyEvent("vsl_play", null, true), true);
    assert.equal(countsKeyEvent("calculator_completion", "", true), true);
    assert.equal(countsKeyEvent("calendly_outbound_click", "(not set)", true), true);
  });

  it("keeps form_submit when the form_id dimension could not be requested", () => {
    assert.equal(countsKeyEvent("form_submission", "(not set)", false), true);
  });
});
