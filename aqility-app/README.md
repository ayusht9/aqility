# Aqility

An urban air-quality assistant for a hackathon. Run `npm start`, then open http://localhost:5173. Run `npm test` for the health-guidance and planning checks. No dependencies or API keys required.

## Features

- City search and optional device location.
- Open-Meteo/CAMS modeled US AQI, pollutant concentrations, and weather.
- Previous seven days of archived hourly AQI estimates, aggregated daily.
- Next 24 hours of outdoor planning, filtered for daytime, pollution, temperature, rain, and UV.
- Optional in-memory age and health profile; no health fields sent to providers or saved in browser storage.
- Explicit demo mode, error states, keyboard-accessible native dialogs, responsive layout, and chart text alternatives.

## Scope and sources

This prototype uses an explainable rules engine, not a trained AI or clinical risk model. It connects environmental conditions with published health precautions, not patient records or epidemiological outcome statistics. Historical data are archived model estimates, not observations. Do not interpret the historical comparison as evidence of a causal health relationship.

AQI precautions: https://www.airnow.gov/aqi/aqi-basics/ and https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf. Model data: https://open-meteo.com/en/docs/air-quality-api, https://open-meteo.com/en/docs and https://atmosphere.copernicus.eu/. Open-Meteo free endpoint is for noncommercial use; review its licensing before commercialization.

The planner applies conservative prototype thresholds (temperature below 10°C or at least 30°C, UV at least 6, rain probability at least 40%) alongside AQI rules. These thresholds are planning heuristics, not validated medical cutoffs. The app does not diagnose, prescribe medication, or guarantee safe outdoor conditions. A production LLM integration would require a server-side secret, grounded sources, and evaluation. No credentials should be added to static browser code.
