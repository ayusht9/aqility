import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cityTime,
  historySeries,
  weatherDescription,
  DEFAULT_CITY,
  demoEnvironment,
} from "../dist/data.js";

test("city time uses location timezone rather than host timezone", () => {
  assert.equal(
    cityTime(DEFAULT_CITY, new Date("2026-11-27T22:45:00Z")),
    "2026-11-28T04:15",
  );
});
test("daily history excludes the current local day and ignores missing readings", () => {
  const hours = [
    { time: "2026-11-26T00:00", aqi: 40 },
    { time: "2026-11-26T01:00", aqi: null },
    { time: "2026-11-26T02:00", aqi: 60 },
    { time: "2026-11-27T00:00", aqi: 300 },
  ];
  assert.deepEqual(historySeries(hours, "7d", "2026-11-27T12:30"), [
    { time: "2026-11-26", value: 50 },
  ]);
});
test("24-hour history excludes in-progress and future hours and preserves missing values", () => {
  const hours = [
    { time: "2026-11-27T09:00", aqi: null },
    { time: "2026-11-27T10:00", aqi: 45 },
    { time: "2026-11-27T11:00", aqi: 60 },
    { time: "2026-11-27T12:00", aqi: 80 },
  ];
  assert.deepEqual(historySeries(hours, "24h", "2026-11-27T11:45"), [
    { time: "2026-11-27T09:00", value: null },
    { time: "2026-11-27T10:00", value: 45 },
  ]);
});
test("missing weather is not described as a clear sky", () => {
  assert.equal(weatherDescription(null), "Weather unavailable");
  assert.equal(weatherDescription(0), "Clear sky");
  assert.equal(weatherDescription(45), "Fog");
  assert.equal(weatherDescription(95), "Thunderstorms");
});
test("demo has complete seven-day history and future forecast", () => {
  const data = demoEnvironment(DEFAULT_CITY);
  assert.ok(data.current);
  assert.equal(data.hours.length, 240);
  assert.equal(
    historySeries(data.hours, "7d", cityTime(DEFAULT_CITY)).length,
    7,
  );
});
