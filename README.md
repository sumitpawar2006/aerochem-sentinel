# AeroChem Sentinel

A map-first environmental intelligence experience for Malegaon. It works without a physical sensor: current and hourly air-quality estimates come from the Copernicus CAMS global model through Open-Meteo, and the interface labels them as model output rather than observed ground readings.

**Live application:** https://sumitpawar2006.github.io/aerochem-sentinel/

**Source repository:** https://github.com/sumitpawar2006/aerochem-sentinel

## Share with your team

Send this public link: **https://sumitpawar2006.github.io/aerochem-sentinel/**

It works from any phone or computer and does not require your machine or a localhost server. The in-app **Share** button always sends this public address, including when you are testing locally.

## Optional local development

From this folder, start the included Python server:

```powershell
python server.py
```

Open `http://127.0.0.1:4173`.

If port 4173 is occupied:

```powershell
$env:AEROCHEM_PORT='4174'
python server.py
```

Use `server.py`, not `python -m http.server`: the included server supplies the live-AQI proxy and optional Gmail report endpoint. There is no package install or build step. Internet access is needed for live AQI, map tiles, location search, OpenStreetMap place layers, Leaflet, and web fonts.

## What is included

- Full-screen Leaflet map with real Esri satellite imagery as the default, plus OpenStreetMap streets and OpenTopoMap terrain
- Live modeled US AQI, PM2.5, PM10, near-surface HCHO and NO2, a 24-hour CAMS model timeline, and current Open-Meteo temperature, humidity and wind
- Real OpenStreetMap places, hospitals, education, industry, transport, nearby-city autocomplete, global India search, and Malegaon Taluka boundary
- Transparent first-sensor recommendation with four candidate sites, a weighted score, a 3 km planning radius, and a live OpenStreetMap sensitive-site count
- Pollution-reduction sandbox for traffic, industrial housekeeping, and open-burning response assumptions
- Adjustable 12-week field-pilot plan with year-one cost assumptions and measurable community-impact targets
- HCHO chemistry brief and a five-stage evidence pipeline synthesized from the team's ML, domain, integration, manual, and Samarthya 2026 PDFs
- Transparent implementation matrix separating live data from planned Sentinel-5P rasters, ground-reference files, and RF/XGBoost artifacts
- Four work areas: Situation, Investigate, Trends, and Method
- Observed-versus-modeled comparison, monitoring coverage state, confidence/validation evidence state
- Clearly labeled demo hotspots when no local sensor or ground-station dataset is available
- Before/after and seasonal scenario comparison
- Downloadable, print-ready one-page HTML reports
- English/Marathi navigation support and an integrated presentation mode
- Project-evidence assistant on the public site, with optional server-powered general AI and Gmail delivery
- Mobile-first map view with four thumb-friendly workspace tabs, a compact live-AQI card, and full-height evidence sheets
- Participant Judge Kit with a public-link QR code, 90-second run of show, difficult-question answers, downloadable six-slide deck, printable field/validation pack, and 90-second offline MP4
- Installable web-app manifest and cached local shell for a safer repeat demo after the first online visit
- Desktop and tablet layouts

## One-click Gmail report delivery

On Windows, create a Google App Password at https://myaccount.google.com/apppasswords and run the one-time setup:

```powershell
.\setup-gmail.ps1
```

The script prompts securely for the Gmail address and 16-character App Password, encrypts the credential for the current Windows user, starts the correct Python server on an available local port, and opens the app. The recipient input then disappears and **Send formatted report now** delivers the HTML email and one-page attachment directly to the configured address. Reports send only after a click or an explicit assistant request; there are no cron jobs or scheduled emails.

For Linux or a hosted Python deployment, use environment variables instead:

```powershell
$env:AEROCHEM_GMAIL_USER='sender@gmail.com'
$env:AEROCHEM_GMAIL_APP_PASSWORD='your-16-character-app-password'
$env:AEROCHEM_REPORT_RECIPIENT='recipient@gmail.com'
python server.py
```

Open the Sentinel Assistant and choose **Email this report**. For safety, the server only sends to the configured recipient; browser input cannot redirect automatic reports to an arbitrary address. The Gmail password stays on the server and is never exposed to front-end code or committed to Git.

GitHub Pages hosts the static public frontend and loads live modeled AQI directly from Open-Meteo. Secure automatic Gmail sending requires `server.py`, so it is available when the repository is run locally or deployed to a Python-capable host with the environment variables above. On GitHub Pages or a basic static server, the assistant prepares a complete Gmail draft instead of showing a server error; the user reviews it and presses Send in Gmail.

## General Sentinel AI

The map and project assistant work without an API key. To enable general questions, spelling-tolerant multilingual answers, current web lookup, and cited sources, create an OpenAI API key and run the one-time Windows setup:

```powershell
.\setup-ai.ps1
```

The key is entered in a hidden prompt and encrypted for the current Windows user. It is never added to browser JavaScript or Git. OpenAI API usage is billed separately. If `server.py` is already running on port 4173, the script reuses it; otherwise it starts the server and opens the correct address.

## Data truth and integration

- Live values are CAMS model estimates, not readings from a device or monitoring station.
- Real places on the map do not receive invented AQI values.
- Demo hotspot values are opt-in and visibly marked `MODEL DEMO`.
- The sensor score is a planning heuristic, intervention reductions are illustrative scenarios, and costs are editable assumptions rather than forecasts or vendor quotes.
- The team PDFs document the intended HCHO/NO₂ and ML workflow, but do not contain deployable pollutant rasters, a trained model artifact, or validation results; the dashboard labels those items as not connected.
- Confidence intervals, MAE, RMSE, and R² remain unavailable until validated model artifacts are connected.
- Satellite basemap imagery is real reference imagery, not a Sentinel-5P pollutant raster.
- Add production pollutant tile URLs and verified ground-station coordinates through `data/app-config.json` and the data contract in the Method panel.

## Files

- `index.html` — application shell
- `v2.css` — complete responsive visual system
- `v2.js` — map, live data, decision tools, reports, and assistant
- `manifest.webmanifest`, `icon.svg`, and `service-worker.js` — installable/offline-safe participant demo shell
- `server.py` — static server, live-AQI proxy, and Gmail endpoint
- `setup-gmail.ps1` — one-time encrypted Windows Gmail setup and launcher
- `setup-ai.ps1` — one-time encrypted Windows OpenAI setup
- `data/app-config.json` — region and integration configuration
- `data/decision-model.json` — sensor siting, intervention, cost, and community-impact assumptions
- `data/nearby-cities.json` — real OpenStreetMap city/town autocomplete catalogue
- `data/environmental-snapshot.json` — labeled fallback/demo scenario data
