import { average } from "./engine.js";

export const DEFAULT_CITY = {
  name: "New Delhi",
  country: "India",
  latitude: 28.6139,
  longitude: 77.209,
  timezone: "Asia/Kolkata",
};

export function cityTime(city, now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: city.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .replace(" ", "T");
}

export async function fetchJSON(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Data provider returned ${response.status}`);
  return response.json();
}

export async function loadEnvironment(city, signal) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    past_days: 7,
    forecast_days: 3,
  });
  const [air, weather] = await Promise.all([
    fetchJSON(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${params}&hourly=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone`,
      signal,
    ),
    fetchJSON(
      `https://api.open-meteo.com/v1/forecast?${params}&hourly=temperature_2m,precipitation_probability,uv_index&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`,
      signal,
    ),
  ]);
  if (!air.hourly?.time?.length || !weather.hourly?.time?.length)
    throw new Error("Incomplete environmental data");
  const weatherByTime = new Map(
    weather.hourly.time.map((time, i) => [
      time,
      {
        temp: weather.hourly.temperature_2m?.[i],
        rain: weather.hourly.precipitation_probability?.[i],
        uv: weather.hourly.uv_index?.[i],
      },
    ]),
  );
  const hours = air.hourly.time.map((time, i) => ({
    time,
    aqi: air.hourly.us_aqi?.[i],
    pm2_5: air.hourly.pm2_5?.[i],
    pm10: air.hourly.pm10?.[i],
    nitrogen_dioxide: air.hourly.nitrogen_dioxide?.[i],
    ozone: air.hourly.ozone?.[i],
    ...weatherByTime.get(time),
  }));
  const current = hours.find(
    (hour) => hour.time === cityTime(city).slice(0, 13) + ":00",
  );
  if (!current || !Number.isFinite(current.aqi))
    throw new Error("Current air quality unavailable");
  return {
    hours,
    current,
    humidity: weather.current?.relative_humidity_2m,
    wind: weather.current?.wind_speed_10m,
    feels: weather.current?.apparent_temperature,
    weather: weather.current?.weather_code,
  };
}

export function demoEnvironment(city) {
  const now = cityTime(city),
    start = new Date(now.slice(0, 10) + "T00:00:00Z");
  const hours = Array.from({ length: 240 }, (_, index) => {
    const i = index - 168,
      date = new Date(+start + i * 3600000),
      h = date.getUTCHours();
    return {
      time: date.toISOString().slice(0, 16),
      aqi: Math.round(
        68 + 25 * Math.sin(((h + 5) / 24) * Math.PI * 2) + Math.sin(i / 12) * 9,
      ),
      temp: Math.round(24 + 5 * Math.sin(((h - 8) / 24) * Math.PI * 2)),
      rain: 0,
      uv: h > 7 && h < 18 ? Math.max(0, 6 - Math.abs(13 - h)) : 0,
      pm2_5: 24 + Math.round(Math.sin(i / 12) * 7),
      pm10: 48,
      nitrogen_dioxide: 19,
      ozone: 56,
    };
  });
  return {
    hours,
    current: hours.find((h) => h.time === now.slice(0, 13) + ":00"),
    humidity: 58,
    wind: 8,
    feels: 26,
    weather: 1,
  };
}

export function historySeries(hours, period, now) {
  const cutoff = now.slice(0, 13) + ":00";
  if (period === "24h")
    return hours
      .filter((h) => h.time < cutoff)
      .slice(-24)
      .map((h) => ({
        time: h.time,
        value: Number.isFinite(h.aqi) ? h.aqi : null,
      }));
  const days = new Map();
  for (const hour of hours) {
    const day = hour.time.slice(0, 10);
    if (day >= now.slice(0, 10)) continue;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(hour.aqi);
  }
  return [...days]
    .slice(-7)
    .map(([time, values]) => ({ time, value: average(values) }));
}

export function weatherDescription(code) {
  if (!Number.isFinite(code)) return "Weather unavailable";
  if (code === 0) return "Clear sky";
  if (code <= 3) return ["", "Mainly clear", "Partly cloudy", "Overcast"][code];
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 86) return "Showers";
  return "Thunderstorms";
}
