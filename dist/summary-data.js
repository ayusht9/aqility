import { category, guidance, bestHour } from "./engine.js";
import { actionPlan, routines } from "./action-plan.js";

const activities = { walk: "walking", run: "running", commute: "commuting" };
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const metric = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value : null;

// Whitelist environmental fields; account and health-profile data never leave the browser.
export function summaryInput(input) {
  if (!input || typeof input.city !== "string" || !input.city.trim() || input.city.length > 100 ||
      !Object.hasOwn(activities, input.activity) || !Array.isArray(input.hours) || input.hours.length > 24)
    throw new Error("Invalid environmental summary data.");
  function hour(value) {
    if (!value || typeof value.time !== "string" || !timePattern.test(value.time) ||
        !Number.isFinite(Date.parse(value.time + "Z")) ||
        new Date(value.time + "Z").toISOString().slice(0, 16) !== value.time.slice(0, 16))
      throw new Error("Invalid environmental reading.");
    return { time: value.time, aqi: metric(value.aqi, 0, 1000), temp: metric(value.temp, -100, 70),
      uv: metric(value.uv, 0, 100), rain: metric(value.rain, 0, 100) };
  }
  const current = hour(input.current);
  const routine = input.routine ?? "commute";
  if (!Object.hasOwn(routines, routine)) throw new Error("Invalid daily routine.");
  const hours = input.hours.map(hour).filter(h => h.time >= current.time &&
    Date.parse(h.time + "Z") - Date.parse(current.time + "Z") < 24 * 3600000);
  return { city: input.city.trim(), activity: input.activity, routine, demo: input.demo === true,
    current, hours };
}

export function localSummary(input) {
  const data = summaryInput(input), c = data.current;
  const value = (n, unit = "") => n === null ? "unavailable" : `${Math.round(n * 10) / 10}${unit}`;
  const best = bestHour(data.hours, { age: "adult" }, data.activity);
  const actions = actionPlan(c, { age: "adult" }, data.activity, data.routine)
    .map((item, index) => `${item.summary}${index < 2 ? ` Impact: ${item.impact}` : ""}`).join(" ");
  const outlook = best
    ? `For a general adult planning ${activities[data.activity]}, a lower-concern daytime option is ${best.time.slice(0, 10)} at ${best.time.slice(11, 16)} city local time, with US AQI ${value(best.aqi)}.`
    : "No lower-concern daytime window is available in the supplied forecast. Consider an indoor alternative and check again later.";
  return `${data.demo ? "Illustrative demo data. " : "Modeled environmental data. "}${data.city}, ${c.time.slice(11, 16)} city local time: US AQI ${value(c.aqi)} (${category(c.aqi)}). Temperature is ${value(c.temp, "°C")}, UV index ${value(c.uv)}, and rain probability ${value(c.rain, "%")}. ${guidance(c, { age: "adult" }, data.activity)[0][1]} ${outlook} Daily routine: ${routines[data.routine]}. ${actions} This is general guidance; your personal profile may call for extra precautions. Check local advisories. This is not medical advice.`;
}
