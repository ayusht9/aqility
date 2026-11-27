import {
  category,
  sensitive,
  concern,
  bestHour,
  average,
  guidance,
} from "./engine.js";
import {
  DEFAULT_CITY,
  cityTime,
  loadEnvironment,
  demoEnvironment,
  fetchJSON,
  historySeries,
  weatherDescription,
} from "./data.js";
import {
  formatNumber as number,
  hourLabel,
  dateLabel,
  renderChart,
  downloadCSV,
} from "./chart.js";
import { initAuth } from "./auth.js";
import { initSummary } from "./summary.js";

const summary = initSummary();

const $ = (selector) => document.querySelector(selector);
const state = {
  profile: { age: "adult" },
  activity: "walk",
  city: { ...DEFAULT_CITY },
  data: null,
  demo: false,
  period: "7d",
  selectedHour: null,
  controller: null,
};
const activityNames = { walk: "walking", run: "running", commute: "commuting" };
const riskNames = ["Lower concern", "Precautions", "Prefer indoors"];
const riskClasses = ["good", "caution", "poor"];

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}
function aqiClass(aqi) {
  if (!Number.isFinite(aqi)) return "neutral";
  return aqi <= 50
    ? "good"
    : aqi <= 100
      ? "caution"
      : aqi <= 150
        ? "sensitive-risk"
        : aqi <= 200
          ? "poor"
          : aqi <= 300
            ? "very-poor"
            : "hazardous";
}
function announce(message) {
  $("#announcement").textContent = message;
}

async function load() {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const city = { ...state.city },
    demo = state.demo;
  $("#refresh").disabled = true;
  $("#export-data").disabled = true;
  $("#error-banner").hidden = true;
  $("#dashboard-content").setAttribute("aria-busy", "true");
  $("#dashboard-content").classList.add("loading");
  $("#mode-badge").className = "mode-badge";
  $("#mode-badge").textContent = "Updating";
  $("#source-status").textContent = `Loading ${city.name} environmental data…`;
  $("#city-name").textContent = [city.name, city.country]
    .filter(Boolean)
    .join(", ");
  $("#date").textContent = new Intl.DateTimeFormat("en", {
    timeZone: city.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  // Clear the previous city's values immediately; they must not appear as the new city's data.
  state.data = null;
  state.selectedHour = null;
  clearData(true);
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const result = demo
      ? demoEnvironment(city)
      : await loadEnvironment(city, controller.signal);
    if (state.controller !== controller) return;
    state.data = result;
    render();
    $("#mode-badge").textContent = demo ? "Demo data" : "Modeled data";
    $("#mode-badge").classList.toggle("demo", demo);
    $("#source-status").textContent = demo
      ? `Illustrative only · ${city.timezone}`
      : `Current hour ${hourLabel(result.current.time)} · ${city.timezone}`;
    $("#export-data").disabled = false;
  } catch (error) {
    if (state.controller !== controller) return;
    state.data = null;
    clearData(false);
    $("#error-banner").hidden = false;
    $("#mode-badge").textContent = "Unavailable";
    $("#mode-badge").className = "mode-badge error";
    $("#source-status").textContent = "Refresh to retry, or explore demo data.";
  } finally {
    clearTimeout(timeout);
    if (state.controller === controller) {
      $("#refresh").disabled = false;
      $("#dashboard-content").setAttribute("aria-busy", "false");
      $("#dashboard-content").classList.remove("loading");
    }
  }
}

function clearData(loading) {
  summary.reset(null);
  for (const id of [
    "aqi",
    "temperature",
    "pm-value",
    "baseline-value",
    "humidity",
    "wind",
    "uv",
    "rain",
  ])
    $("#" + id).textContent = "—";
  $("#aqi-label").textContent = loading ? "Loading" : "Unavailable";
  $("#aqi-label").className = "risk-badge neutral";
  $("#comparison").textContent = loading
    ? "Comparing historical data…"
    : "Historical comparison unavailable";
  $("#weather-description").textContent = loading
    ? "Loading weather…"
    : "Weather unavailable";
  $("#feels-like").textContent = "Feels like —";
  $("#insight-title").textContent = loading
    ? "Assessing conditions"
    : "Conditions unavailable";
  $("#air-summary").textContent = loading
    ? "Checking air quality and weather for your profile."
    : "Current environmental data is required for guidance.";
  $("#chart").textContent = loading
    ? "Loading trend data…"
    : "Trend data unavailable.";
  $("#history-average").textContent = "Average —";
  for (const id of ["hours", "advice", "pollutants", "history-rows"])
    $("#" + id).replaceChildren();
  $("#best-title").textContent = loading
    ? "Finding a suitable time"
    : "No forecast available";
  $("#best-window").textContent = loading
    ? "Comparing daytime air quality, temperature, UV, and rain."
    : "Refresh data to retrieve outdoor planning guidance.";
  $("#hour-detail").textContent = loading
    ? "Loading hourly forecast…"
    : "Hourly details unavailable.";
}

function render() {
  if (!state.data) return;
  const { current: c, hours } = state.data,
    { profile, activity, city } = state,
    now = cityTime(city);
  $("#aqi").textContent = number(c.aqi);
  $("#aqi-label").textContent = category(c.aqi);
  $("#aqi-label").className = "risk-badge " + aqiClass(c.aqi);
  $("#temperature").textContent = number(c.temp);
  $("#pm-value").textContent = number(c.pm2_5);
  $("#weather-description").textContent = weatherDescription(
    state.data.weather,
  );
  $("#feels-like").textContent = `Feels like ${number(state.data.feels, "°C")}`;
  $("#humidity").textContent = number(state.data.humidity, "%");
  $("#wind").textContent = number(state.data.wind, " km/h");
  $("#uv").textContent = number(c.uv);
  $("#rain").textContent = number(c.rain, "%");
  const historical = hours.filter(
      (h) => h.time.slice(0, 10) < now.slice(0, 10),
    ),
    baseline = average(historical.map((h) => h.aqi));
  $("#baseline-value").textContent = number(baseline);
  const delta = baseline === null ? null : Math.round(c.aqi - baseline);
  $("#comparison").textContent =
    delta === null
      ? "Historical data unavailable"
      : delta === 0
        ? "Current AQI matches baseline"
        : `${Math.abs(delta)} points ${delta > 0 ? "above" : "below"} baseline`;
  const advice = guidance(c, profile, activity);
  $("#insight-title").textContent = advice[0][0];
  $("#air-summary").textContent = advice[0][1];
  renderTrend();
  renderForecast();
  renderAdvice(advice);
  renderPollutants(c);
  const profileName = sensitive(profile)
    ? "Sensitive profile"
    : profile.age === "adult"
      ? "General adult profile"
      : "Personal profile";
  $("#header-profile").textContent = profileName;
  $("#profile-summary").textContent =
    `${profileName} · ${activityNames[activity]}${sensitive(profile) ? " · extra precautions applied" : ""}`;
  summary.reset({
    city: [city.name, city.country].filter(Boolean).join(", ").slice(0, 100),
    activity, demo: state.demo, current: c,
    hours: hours.filter(h => h.time >= c.time).slice(0, 24),
  });
}

function renderTrend() {
  if (!state.data) return;
  $("#chart-subtitle").textContent =
    state.period === "7d"
      ? "Daily averages across the previous 7 days"
      : "Hourly AQI across the previous 24 complete hours";
  renderChart(
    historySeries(state.data.hours, state.period, cityTime(state.city)),
    state.period,
    state.demo,
  );
}

function renderForecast() {
  const now = cityTime(state.city),
    hours = state.data.hours
      .filter((h) => h.time >= now.slice(0, 13) + ":00")
      .slice(0, 24),
    best = bestHour(hours, state.profile, state.activity);
  $("#best-title").textContent = best
    ? `Recommended: ${dateLabel(best.time)}, ${hourLabel(best.time)}`
    : "No lower-concern daytime window";
  $("#best-window").textContent = best
    ? `AQI ${number(best.aqi)} · ${number(best.temp, "°C")} · lower concern for ${activityNames[state.activity]}. Check local advisories before leaving.`
    : "Consider an indoor alternative and check again later. No daytime hour meets the planning criteria in the next 24 hours.";
  // Eight representative hours, always including the recommended hour if one exists.
  let visible = hours.filter((_, i) => i % 3 === 0).slice(0, 8);
  if (best && !visible.includes(best)) {
    visible[visible.length - 1] = best;
    visible.sort((a, b) => a.time.localeCompare(b.time));
  }
  const selected =
    visible.find((h) => h.time === state.selectedHour) ?? best ?? visible[0];
  state.selectedHour = selected?.time ?? null;
  const container = $("#hours");
  container.replaceChildren();
  for (const h of visible) {
    const risk = concern(h, state.profile, state.activity),
      button = element("button", "hour");
    button.type = "button";
    button.dataset.time = h.time;
    button.setAttribute("aria-pressed", String(h === selected));
    const time = element("time", "", hourLabel(h.time));
    time.dateTime = h.time;
    const day = element(
      "span",
      "forecast-day",
      dateLabel(h.time) + (h === best ? " · Best time" : ""),
    );
    const value = element("span", "hour-value");
    value.append(
      element("strong", "", number(h.aqi)),
      element("span", "", "AQI"),
    );
    button.append(
      time,
      day,
      value,
      element("span", "risk-badge " + riskClasses[risk], riskNames[risk]),
      element("span", "hour-weather", number(h.temp, "°C")),
    );
    button.setAttribute(
      "aria-label",
      `${dateLabel(h.time)}, ${hourLabel(h.time)}. AQI ${number(h.aqi)}, ${number(h.temp, " degrees Celsius")}. ${riskNames[risk]}${h === best ? ". Recommended hour" : ""}`,
    );
    button.addEventListener("click", () => {
      state.selectedHour = h.time;
      container
        .querySelectorAll("button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      renderHourDetail(h);
    });
    container.append(button);
  }
  if (selected) renderHourDetail(selected);
  else $("#hour-detail").textContent = "No forecast hours are available.";
}

function renderHourDetail(hour) {
  const detail = $("#hour-detail"),
    title = element(
      "strong",
      "",
      `${dateLabel(hour.time)}, ${hourLabel(hour.time)}: `,
    );
  const sentence = `${number(hour.temp, "°C")} · UV ${number(hour.uv)} · rain ${number(hour.rain, "%")}. ${guidance(hour, state.profile, state.activity)[0][1]}`;
  detail.replaceChildren(title, document.createTextNode(sentence));
}

function renderAdvice(items) {
  const container = $("#advice");
  container.replaceChildren();
  items.forEach(([title, copy], i) => {
    const row = element("article", "advice-row"),
      symbol = element("span", "advice-icon"),
      content = element("div");
    symbol.append(icon(["air", "sun", "shield"][i]));
    content.append(element("h3", "", title), element("p", "", copy));
    row.append(symbol, content);
    container.append(row);
  });
}

function renderPollutants(current) {
  const container = $("#pollutants");
  container.replaceChildren();
  const specs = [
    [
      "pm2_5",
      "PM₂.₅",
      "Fine particulate matter",
      "Fine particles can reach deep into the lungs.",
    ],
    [
      "pm10",
      "PM₁₀",
      "Coarse particulate matter",
      "Larger airborne particles include dust and smoke.",
    ],
    [
      "nitrogen_dioxide",
      "NO₂",
      "Nitrogen dioxide",
      "Often associated with fuel combustion and traffic.",
    ],
    [
      "ozone",
      "O₃",
      "Ground-level ozone",
      "Can irritate airways during outdoor exertion.",
    ],
  ];
  for (const [key, label, name, description] of specs) {
    const card = element("div", "pollutant"),
      heading = element("div", "pollutant-heading");
    heading.append(element("strong", "", label));
    card.append(
      heading,
      element("div", "pollutant-name", name),
      element("span", "pollutant-value", number(current[key])),
      element("p", "", description),
    );
    container.append(card);
  }
}

function syncProfileForm() {
  const form = $("#profile-form");
  form.elements.age.value = state.profile.age;
  for (const name of ["asthma", "heart", "sensitive"])
    form.elements[name].checked = !!state.profile[name];
}
document.querySelectorAll(".profile-open").forEach((button) =>
  button.addEventListener("click", () => {
    syncProfileForm();
    $("#profile-dialog").showModal();
  }),
);
document
  .querySelectorAll(".close")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
$("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  state.profile = {
    age: values.get("age"),
    asthma: values.has("asthma"),
    heart: values.has("heart"),
    sensitive: values.has("sensitive"),
  };
  $("#profile-dialog").close();
  render();
  announce(
    "Health profile applied. Outdoor recommendations and precautions updated.",
  );
});
$("#reset-profile").addEventListener("click", () => {
  $("#profile-form").reset();
  $("#profile-age").focus();
});
$("#activity").addEventListener("change", (event) => {
  state.activity = event.target.value;
  render();
  announce(
    `Outdoor recommendations updated for ${activityNames[state.activity]}.`,
  );
});
$("#refresh").addEventListener("click", load);
$("#demo-toggle").addEventListener("click", () => {
  state.demo = !state.demo;
  $("#demo-toggle").setAttribute("aria-pressed", String(state.demo));
  $("#demo-toggle").textContent = state.demo
    ? "Return to live data"
    : "Explore demo";
  load();
});
document.querySelectorAll("[data-period]").forEach((button) =>
  button.addEventListener("click", () => {
    state.period = button.dataset.period;
    document
      .querySelectorAll("[data-period]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    renderTrend();
    announce(
      `Trend view changed to ${state.period === "7d" ? "7 days" : "24 hours"}.`,
    );
  }),
);
$("#table-toggle").addEventListener("click", () => {
  const expanded = $("#table-toggle").getAttribute("aria-expanded") !== "true";
  $("#table-toggle").setAttribute("aria-expanded", String(expanded));
  $("#table-toggle").textContent = expanded
    ? "Hide data table"
    : "Show data table";
  $("#history-table-wrap").hidden = !expanded;
});
$("#export-data").addEventListener("click", () => {
  if (state.data)
    downloadCSV(
      historySeries(state.data.hours, state.period, cityTime(state.city)),
      state.period,
      state.city,
      state.demo,
    );
});

let searchController = null;
$("#city-open").addEventListener("click", () => {
  $("#city-dialog").showModal();
  $("#city-query").focus();
});
$("#city-dialog").addEventListener("close", () => searchController?.abort());
$("#city-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("#city-query").value.trim();
  if (query.length < 2) {
    $("#search-status").textContent = "Enter at least two characters.";
    $("#city-query").focus();
    return;
  }
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  $("#city-results").replaceChildren();
  $("#search-status").textContent = "Searching cities…";
  $("#search-submit").disabled = true;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const results = await fetchJSON(
      "https://geocoding-api.open-meteo.com/v1/search?" +
        new URLSearchParams({
          name: query,
          count: 6,
          language: "en",
          format: "json",
        }),
      controller.signal,
    );
    if (searchController !== controller) return;
    $("#search-status").textContent = results.results?.length
      ? `${results.results.length} locations found. Select one below.`
      : "No matching cities. Try another city name.";
    for (const location of results.results ?? []) {
      const button = element(
        "button",
        "",
        [location.name, location.admin1, location.country]
          .filter(Boolean)
          .join(", "),
      );
      button.type = "button";
      button.addEventListener("click", () => {
        state.city = { ...location, timezone: location.timezone || "UTC" };
        $("#city-dialog").close();
        load();
      });
      $("#city-results").append(button);
    }
  } catch {
    if (searchController === controller && $("#city-dialog").open)
      $("#search-status").textContent =
        "City search unavailable. Please try again.";
  } finally {
    clearTimeout(timeout);
    if (searchController === controller) $("#search-submit").disabled = false;
  }
});
$("#geolocate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    $("#search-status").textContent =
      "Location access is unavailable. Search by city instead.";
    return;
  }
  $("#search-status").textContent = "Waiting for location permission…";
  $("#geolocate").disabled = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.city = {
        name: "Your location",
        country: "",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      $("#geolocate").disabled = false;
      $("#city-dialog").close();
      load();
    },
    () => {
      $("#geolocate").disabled = false;
      $("#search-status").textContent =
        "Location could not be accessed. Search by city instead.";
    },
    { timeout: 12000, maximumAge: 300000 },
  );
});

// Mark the section currently being read without moving focus or forcing scroll.
const navLinks = [...document.querySelectorAll(".sidebar nav a")];
function updateNavigation() {
  const targets = navLinks.map((link) => document.querySelector(link.hash));
  let active = targets[0];
  for (const target of targets)
    if (target.getBoundingClientRect().top <= 180) active = target;
  navLinks.forEach((link) => {
    if (link.hash === "#" + active.id)
      link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}
let scrolling = false;
addEventListener(
  "scroll",
  () => {
    if (scrolling) return;
    scrolling = true;
    requestAnimationFrame(() => {
      updateNavigation();
      scrolling = false;
    });
  },
  { passive: true },
);
let previousChartWidth = 0;
new ResizeObserver((entries) => {
  const width = Math.round(entries[0].contentRect.width);
  if (width !== previousChartWidth) {
    previousChartWidth = width;
    renderTrend();
  }
}).observe($("#chart"));
window.addEventListener("aqility:signedout", () => {
  state.profile = { age: "adult" };
  $("#profile-form").reset();
  render();
});
initAuth();
load();
