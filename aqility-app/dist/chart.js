import { category, average } from "./engine.js";

export function formatNumber(value, suffix = "") {
  return Number.isFinite(value)
    ? `${Math.round(value)}${suffix}`
    : "Unavailable";
}
export function hourLabel(time) {
  return new Date(time + "Z").toLocaleTimeString("en", {
    timeZone: "UTC",
    hour: "numeric",
    hour12: true,
  });
}
export function dateLabel(time) {
  return new Date(time.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function renderChart(series, period, demo) {
  const container = document.querySelector("#chart"),
    body = document.querySelector("#history-rows");
  body.replaceChildren();
  const title = `${demo ? "Demo · " : ""}${period === "7d" ? "Previous 7 days, daily average" : "Previous 24 hours, hourly"} US AQI`;
  document.querySelector("#history-caption").textContent = title;
  document.querySelector("#history-average").textContent =
    `Average ${formatNumber(average(series.map((d) => d.value)))}`;
  for (const point of series) {
    const row = document.createElement("tr");
    for (const text of [
      point.time.replace("T", " "),
      formatNumber(point.value),
      category(point.value === null ? null : Math.round(point.value)),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  const valid = series.filter((d) => d.value !== null);
  if (!valid.length) {
    container.textContent = "Trend data unavailable. Refresh to try again.";
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  const width = Math.max(260, container.clientWidth);
  svg.setAttribute("viewBox", `0 0 ${width} 230`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${title}. Average ${formatNumber(average(valid.map((p) => p.value)))}. An exact-value data table is available below.`,
  );
  function add(tag, attrs, text) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs))
      el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    svg.append(el);
    return el;
  }
  const max = Math.ceil(Math.max(100, ...valid.map((d) => d.value)) / 50) * 50;
  const x = (i) => 42 + i * ((width - 60) / Math.max(1, series.length - 1)),
    y = (value) => 190 - (value / max) * 168;
  for (let i = 0; i <= 4; i++) {
    const value = (max * i) / 4,
      pos = y(value);
    add("line", {
      x1: 42,
      y1: pos,
      x2: width - 18,
      y2: pos,
      stroke: "#dbe4ea",
      "stroke-dasharray": "3 5",
    });
    add("text", { x: 29, y: pos + 4, "text-anchor": "end" }, Math.round(value));
  }
  // Split at missing values so unavailable hours are never bridged or invented.
  let segment = [];
  function flush() {
    if (!segment.length) return;
    const path = "M" + segment.map((p) => `${p.x},${p.y}`).join(" L");
    add("path", {
      d: path + ` L${segment.at(-1).x},190 L${segment[0].x},190 Z`,
      fill: "#e7f4f0",
    });
    add("path", {
      d: path,
      stroke: "#087c72",
      "stroke-width": 2.7,
      fill: "none",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
    segment = [];
  }
  series.forEach((point, i) => {
    if (point.value === null) flush();
    else segment.push({ x: x(i), y: y(point.value) });
  });
  flush();
  const labelEvery =
    period === "7d" ? (width < 430 ? 2 : 1) : width < 430 ? 8 : 5;
  series.forEach((point, i) => {
    if (point.value !== null) {
      const dot = add("circle", {
        cx: x(i),
        cy: y(point.value),
        r: period === "7d" ? 4 : 2.4,
        fill: "#087c72",
        stroke: "white",
        "stroke-width": 1.5,
      });
      const tooltip = document.createElementNS(ns, "title");
      tooltip.textContent = `${point.time}: ${formatNumber(point.value)} US AQI`;
      dot.append(tooltip);
    }
    const isLast = i === series.length - 1;
    if (
      isLast ||
      (i % labelEvery === 0 && (i === 0 || series.length - 1 - i >= labelEvery))
    )
      add(
        "text",
        {
          x: x(i),
          y: 219,
          "text-anchor": i === 0 ? "start" : isLast ? "end" : "middle",
        },
        period === "7d" ? dateLabel(point.time) : hourLabel(point.time),
      );
  });
  container.replaceChildren(svg);
}

export function downloadCSV(series, period, city, demo) {
  // Quote all user/provider-derived text and neutralize spreadsheet formula prefixes.
  const cell = (value) =>
    '"' +
    String(value)
      .replace(/^[=+@\-]/, " $&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    [
      "Source",
      demo ? "Illustrative demo" : "Open-Meteo / CAMS modeled estimates",
    ],
    ["Location", city.name],
    ["Timezone", city.timezone],
    ["Period", period],
    ["Date / time", "US AQI", "Category"],
    ...series.map((p) => [
      p.time,
      p.value === null ? "" : p.value.toFixed(2),
      category(p.value === null ? null : Math.round(p.value)),
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `aqility-${demo ? "demo-" : ""}${period}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
