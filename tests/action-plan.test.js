import test from "node:test";
import assert from "node:assert/strict";
import { actionPlan, routines } from "../dist/action-plan.js";
import { localSummary, summaryInput } from "../dist/summary-data.js";
const hour = { time: "2026-11-28T10:00", aqi: 35, temp: 23, uv: 2, rain: 0 };
const adult = { age: "adult" };

test("active travel is conditional on low AQI, weather and personal precautions", () => {
  assert.equal(actionPlan(hour, adult, "walk")[0].title, "Replace one short car trip");
  for (const change of [{ aqi: 180 }, { temp: 36 }, { aqi: null }, { rain: 80 }]) {
    assert.equal(actionPlan({ ...hour, ...change }, adult, "walk")[0].title, "Make the essential trip cleaner");
  }
  assert.match(actionPlan({ ...hour, aqi: 80 }, { age: "adult", asthma: true }, "walk")[1].title, /smog/);
  assert.doesNotMatch(actionPlan({ ...hour, aqi: 80 }, adult, "walk")[1].title, /smog/);
});

test("poor outdoor air guidance preserves ventilation and heat caveats", () => {
  const indoor = actionPlan({ ...hour, aqi: 220 }, adult, "walk")[1];
  assert.match(indoor.action, /cool and safe/);
  assert.match(indoor.action, /Never block required appliance vents/);
  assert.match(indoor.reason, /not measured/);
  const unknown = actionPlan({ ...hour, aqi: null }, adult, "walk")[1];
  assert.match(unknown.reason, /AQI is unavailable/);
  assert.match(unknown.action, /If outdoor air is cleaner/);
});

test("routine alternatives explain their impact and link to primary sources", () => {
  const titles = new Set();
  for (const routine of Object.keys(routines)) {
    const cards = actionPlan(hour, adult, "walk", routine);
    assert.equal(cards.length, 3); titles.add(cards[0].title);
    for (const card of cards) {
      assert.ok(card.action && card.reason && card.impact);
      assert.equal(new URL(card.source.href).hostname, "www.epa.gov");
    }
  }
  assert.equal(titles.size, 4);
  assert.match(actionPlan(hour, adult, "walk", "home")[2].action, /does not generate ozone/);
  assert.match(actionPlan(hour, adult, "walk", "home")[2].impact, /does not remove every gas/);
});

test("AI summaries include routine impact but never carry health or account fields", () => {
  const input = { city: "New Delhi", activity: "walk", routine: "family", current: hour, hours: [hour],
    profile: { asthma: true }, email: "private@example.com" };
  assert.doesNotMatch(JSON.stringify(summaryInput(input)), /asthma|email|profile|private/);
  assert.match(localSummary(input), /Family trips/);
  assert.match(localSummary(input), /solo car journeys/);
  assert.match(localSummary(input), /Indoor|indoor/);
  assert.throws(() => summaryInput({ ...input, routine: "invented" }));
  for (const routine of Object.keys(routines)) {
    assert.ok(localSummary({ ...input, city: "A".repeat(100), routine }).length <= 2000, "local briefing must fit voice request limit");
  }
});
