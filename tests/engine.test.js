import { test } from "node:test";
import assert from "node:assert/strict";
import {
  category,
  concern,
  bestHour,
  average,
  guidance,
} from "../dist/engine.js";
const adult = { age: "adult" },
  sensitive = { age: "adult", asthma: true };
const hour = { time: "2026-11-27T10:00", aqi: 45, temp: 23, rain: 0, uv: 2 };
test("US AQI categories honor each boundary and unavailable values", () => {
  for (const [n, label] of [
    [0, "Good"],
    [50, "Good"],
    [51, "Moderate"],
    [100, "Moderate"],
    [101, "Unhealthy for sensitive groups"],
    [150, "Unhealthy for sensitive groups"],
    [151, "Unhealthy"],
    [200, "Unhealthy"],
    [201, "Very unhealthy"],
    [300, "Very unhealthy"],
    [301, "Hazardous"],
    [null, "Unavailable"],
    [-1, "Unavailable"],
  ])
    assert.equal(category(n), label);
});
test("sensitive users and strenuous exercise receive extra caution", () => {
  assert.equal(concern({ ...hour, aqi: 80 }, adult, "walk"), 0);
  assert.equal(concern({ ...hour, aqi: 80 }, sensitive, "walk"), 1);
  assert.equal(concern({ ...hour, aqi: 80 }, adult, "run"), 1);
  assert.equal(concern({ ...hour, aqi: 120 }, sensitive, "walk"), 2);
});
test("heat, cold, rain, extreme UV, and missing values prevent recommendation", () => {
  for (const override of [
    { temp: 36 },
    { temp: -1 },
    { rain: 80 },
    { uv: 11 },
    { aqi: null },
    { temp: null },
    { rain: null },
    { uv: null },
  ])
    assert.equal(concern({ ...hour, ...override }, adult, "walk"), 2);
});
test("planner excludes nighttime and never recommends an unsafe least-bad hour", () => {
  assert.equal(
    bestHour(
      [
        { ...hour, time: "2026-11-27T02:00" },
        { ...hour, aqi: 190 },
      ],
      adult,
      "walk",
    ),
    null,
  );
  assert.equal(bestHour([hour, { ...hour, aqi: 90 }], adult, "walk"), hour);
});
test("averages exclude unavailable values and do not invent missing history", () => {
  assert.equal(average([null, 40, 60]), 50);
  assert.equal(average([null, undefined]), null);
});
test("severe conditions yield indoor advice", () =>
  assert.match(
    guidance({ ...hour, aqi: 240 }, adult, "walk")[0][1],
    /indoors/,
  ));
