import { category, concern, sensitive } from "./engine.js";

export const routines = Object.freeze({ commute: "Daily commute", home: "Mostly at home", family: "Family trips", community: "Community activities" });
const transportSource = { label: "EPA: cleaner transport", href: "https://www.epa.gov/transportation-air-pollution-and-climate-change/what-you-can-do-reduce-pollution-vehicles-and" };
const indoorSource = { label: "EPA: cleaner indoor air", href: "https://www.epa.gov/wildfires/how-create-cleaner-air-room-home" };

export function actionPlan(hour, profile, activity, routine = "commute") {
  const known = Number.isFinite(hour.aqi) && hour.aqi >= 0;
  const smog = known && hour.aqi > (sensitive(profile) ? 50 : 100);
  const activeTrip = known && hour.aqi <= 50 && concern(hour, profile, activity) === 0;
  const outdoorReason = !known
    ? "Outdoor AQI is unavailable, so a lower-pollution outdoor trip cannot be identified."
    : activeTrip
      ? `US AQI is ${Math.round(hour.aqi)} (${category(hour.aqi)}) and the supplied weather meets the planner's criteria.`
      : `US AQI is ${Math.round(hour.aqi)} (${category(hour.aqi)}). Pollution, weather, or personal precautions can make outdoor exertion less suitable.`;
  const travel = {
    commute: activeTrip ? {
      title: "Replace one short car trip", action: "Consider a short walk or cycle on a quieter route only while weather, your personal precautions, and local advisories allow.",
      impact: "Replacing a solo petrol or diesel trip avoids that vehicle's tailpipe emissions. Route and exposure still matter.",
      summary: "When conditions permit, replace a short solo car trip with a quieter-route walk; otherwise consider shared transport.",
    } : {
      title: "Make the essential trip cleaner", action: "If travel is necessary, consider accessible public transport or a shared ride instead of driving alone. Avoid adding a long or strenuous walk during poor conditions.",
      impact: "Sharing a trip can reduce the number of vehicles and fuel burned per traveler. It does not guarantee cleaner air along the route.",
      summary: "For essential travel, consider public transport or a shared ride; avoid strenuous outdoor travel during poor conditions.",
    },
    home: {
      title: "Combine your essential errands", action: "Group shopping into one trip. If ordering essentials, choose a consolidated delivery window when available rather than repeated urgent deliveries.",
      impact: "Fewer separate car trips can mean less fuel burned and fewer exhaust emissions. Delivery benefits depend on routing and vehicles.",
      summary: "Combine essential errands into fewer trips to reduce repeated driving and associated exhaust emissions.",
    },
    family: {
      title: "Share the family-trip miles", action: activeTrip
        ? "Coordinate a shared pickup or public-transport trip. For a short journey, consider a quieter walking route only if it suits every family member's precautions."
        : "Coordinate a shared pickup or accessible public transport when practical. Limit roadside waiting and avoid strenuous walks during poor conditions.",
      impact: "One shared journey can replace several solo car journeys. Less roadside waiting can also reduce time near exhaust.",
      summary: "Coordinate shared family trips and reduce roadside waiting; choose walking only when conditions and everyone's precautions allow.",
    },
    community: {
      title: "Make parked pickups engine-off", action: "Agree a no-idling habit for safely parked pickup vehicles. Check the local AQI before organizing outdoor gatherings, and keep indoor alternatives available.",
      impact: "Switching off a safely parked vehicle avoids unnecessary fuel use and tailpipe pollution while waiting.",
      summary: "Use an engine-off habit for safely parked pickups to avoid unnecessary fuel use and exhaust pollution.",
    },
  };
  const selected = travel[Object.hasOwn(routines, routine) ? routine : "commute"];
  const indoor = smog ? {
    title: "Keep outdoor smog from building up indoors", action: "Limit open-window airing during outdoor smog while keeping rooms cool and safe. Air out when outdoor conditions improve. Never block required appliance vents.",
    reason: "Outdoor air exceeds the precaution level used for your profile. Indoor air quality is not measured by this app.",
    impact: "Reducing outdoor pollution entry can lower exposure indoors. Ventilation and temperature still need attention; closing windows alone is not a complete solution.",
    summary: "During outdoor smog, limit open-window airing without overheating rooms; ventilate when outdoor conditions improve.",
  } : {
    title: "Ventilate with the outdoor conditions", action: "If outdoor air is cleaner than indoor air and temperatures are comfortable, briefly air out rooms. Check local smoke advisories first, and keep required appliance vents clear.",
    reason: known ? "Outdoor AQI alone cannot tell you how clean your indoor air is. Ventilation remains conditional on local conditions." : "Outdoor and indoor conditions cannot be compared reliably while AQI is unavailable.",
    impact: "Suitable ventilation can dilute indoor pollutants. Opening windows during outdoor pollution can bring pollutants inside instead.",
    summary: "Ventilate only when outdoor air is cleaner and temperatures allow; indoor air is not measured here.",
  };
  const sourceControl = routine === "commute" ? {
    title: "Skip unnecessary idling", action: "Switch off the engine while safely parked and waiting. Combine trips where practical; follow road-safety rules rather than turning the engine off in moving traffic.",
    reason: "A travel routine offers repeated chances to reduce pollution at its source.",
    impact: "Less idling means less wasted fuel and fewer exhaust pollutants. This is an emissions action, not a promise of a measured AQI change.",
    summary: "Switch off engines when safely parked to reduce wasted fuel and exhaust emissions.", source: transportSource,
  } : {
    title: "Reduce smoke inside shared spaces", action: "Keep rooms free of smoking, incense, and candles. Prefer lower-smoke meal preparation over frying or broiling. If using a particle air cleaner, choose one sized for the room that does not generate ozone.",
    reason: routine === "family" ? "Family routines can add cooking and combustion particles to shared rooms." : "Indoor activities can create pollution even when outdoor air looks clearer.",
    impact: "Reducing indoor particle sources lowers what is released into the room. Particle filtration can remove particles, but does not remove every gas or replace needed ventilation.",
    summary: "Avoid indoor smoke and high-smoke cooking; a correctly sized, non-ozone particle cleaner can help remove particles.", source: indoorSource,
  };
  return [
    { ...selected, reason: outdoorReason, kind: "Lower-emission routine", source: transportSource },
    { ...indoor, kind: "Indoor air quality", source: indoorSource },
    { ...sourceControl, kind: routine === "commute" ? "Sustainable habit" : "Cleaner shared spaces" },
  ];
}
