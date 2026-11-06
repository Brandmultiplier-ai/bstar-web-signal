import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keyEventDimensionList, shrinkKeyEventDimensions } from "./ga4-key-events";
import {
  GA4_EVENT_RULES,
  gateEvent,
  gateNote,
  requiredCustomDimensions,
  unappliedGates,
} from "../ga4-event-rules";
import { GA4_PLACEMENT_DIMENSION } from "../sources";

describe("rules table drives the request", () => {
  it("requests every custom dimension the rules table names", () => {
    const dimensions = keyEventDimensionList();
    assert.deepEqual(dimensions.slice(0, 4), ["date", "hostName", "eventName", "pagePath"]);
    assert.ok(dimensions.includes("customEvent:form_id"));
    assert.equal(dimensions.at(-1), GA4_PLACEMENT_DIMENSION);
    assert.deepEqual(requiredCustomDimensions(), ["customEvent:form_id"]);
  });

  it("adds a new rule's dimension without a pull change", () => {
    const rules = {
      ...GA4_EVENT_RULES,
      quiz_complete: { requiredDimensions: ["quiz_id"] },
    };
    const dimensions = keyEventDimensionList(rules);
    assert.ok(dimensions.includes("customEvent:quiz_id"));
    assert.equal(gateEvent("quiz_complete", { quiz_id: "" }, dimensions, rules), "exclude");
    assert.equal(gateEvent("quiz_complete", { quiz_id: "intro" }, dimensions, rules), "count");
  });

  it("drops an unregistered dimension and records that the gate was not applied", () => {
    const first = keyEventDimensionList();
    const next = shrinkKeyEventDimensions(
      first,
      new Error("Field customEvent:form_id is not a valid dimension."),
    );
    assert.ok(next);
    assert.equal(next?.includes("customEvent:form_id"), false);
    assert.equal(next?.includes(GA4_PLACEMENT_DIMENSION), true);
    const note = gateNote(unappliedGates(next ?? []), {});
    assert.match(note ?? "", /form_submit gate was not applied/);
    assert.match(note ?? "", /unfiltered/);
  });
});

describe("event gate", () => {
  const dimensions = keyEventDimensionList();

  it("lets an event with no rule through", () => {
    assert.equal(gateEvent("gate_open", { form_id: "(not set)" }, dimensions), "count");
    assert.equal(gateEvent("vsl_play", {}, dimensions), "count");
  });

  it("drops form_submit when form_id is missing", () => {
    assert.equal(gateEvent("form_submit", { form_id: "library_optin" }, dimensions), "count");
    assert.equal(gateEvent("form_submit", { form_id: "" }, dimensions), "exclude");
    assert.equal(gateEvent("form_submit", { form_id: "   " }, dimensions), "exclude");
    assert.equal(gateEvent("form_submit", { form_id: "(not set)" }, dimensions), "exclude");
    assert.equal(gateEvent("form_submit", { form_id: "(Not Set)" }, dimensions), "exclude");
  });

  it("keeps form_submit and says so when form_id could not be requested", () => {
    const without = dimensions.filter((name) => name !== "customEvent:form_id");
    assert.equal(gateEvent("form_submit", { form_id: "(not set)" }, without), "unfiltered");
    const note = gateNote({ form_submit: ["form_id"] }, { form_submit: 3 });
    assert.match(note ?? "", /not applied/);
    assert.match(note ?? "", /Excluded rows: form_submit 3/);
  });
});
