export function category(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return 'Unavailable';
  return aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for sensitive groups' : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous';
}
export function sensitive(profile) { return profile.age === 'child' || profile.age === 'older' || profile.asthma || profile.heart || profile.sensitive; }
export function concern(hour, profile, activity) {
  if (![hour.aqi, hour.temp, hour.rain, hour.uv].every(Number.isFinite) || hour.aqi < 0) return 2;
  const threshold = sensitive(profile) ? 50 : 100;
  if (hour.aqi > 150 || (sensitive(profile) && hour.aqi > 100) || hour.temp >= 35 || hour.temp <= 0 || hour.rain >= 70 || hour.uv >= 11) return 2;
  if (hour.aqi > threshold || (activity === 'run' && hour.aqi > 50) || hour.temp >= 30 || hour.temp < 10 || hour.rain >= 40 || hour.uv >= 6) return 1;
  return 0;
}
export function bestHour(hours, profile, activity) {
  const candidates = hours.filter(h => Number(h.time.slice(11,13)) >= 6 && Number(h.time.slice(11,13)) < 21 && concern(h,profile,activity) === 0);
  return candidates.sort((a,b) => (a.aqi + Math.abs(a.temp-22)*2 + (a.uv ?? 0)*3 + (a.rain ?? 0)) - (b.aqi + Math.abs(b.temp-22)*2 + (b.uv ?? 0)*3 + (b.rain ?? 0)))[0] ?? null;
}
export function average(values) { const valid=values.filter(Number.isFinite); return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null; }
export function guidance(hour, profile, activity) {
  const risk=concern(hour,profile,activity), isSensitive=sensitive(profile);
  const first= risk===2 ? ['Choose an indoor alternative','Conditions call for caution. Move exercise indoors and reduce outdoor exertion.'] : risk===1 ? ['Keep it short and gentle','Reduce prolonged or strenuous outdoor activity. Take breaks and watch for symptoms.'] : ['A better moment to step outside','Conditions look more favorable for your selected activity. Check local advisories before leaving.'];
  const second=hour.temp>=30 ? ['Take heat seriously','Choose shade, take cooling breaks, and drink water. Heat adds to the strain of outdoor activity.'] : hour.temp<10 ? ['Plan for the cold','Wear warm layers. Cold air may irritate sensitive airways; consider indoor activity.'] : hour.uv>=6 ? ['Bring sun protection','Seek shade, wear protective clothing, and use sunscreen outdoors.'] : ['Choose a quieter route','Prefer paths away from heavy traffic to help reduce direct exposure to vehicle emissions.'];
  const third=isSensitive ? ['Follow your personal care plan','Your profile calls for extra caution. Follow your clinician’s plan and stop activity if symptoms develop.'] : ['Listen to your body','If you develop coughing, wheezing, or breathing discomfort, stop activity and seek a cleaner-air space.'];
  return [first,second,third];
}
