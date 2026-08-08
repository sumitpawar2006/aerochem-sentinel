# AeroChem Sentinel

A map-first environmental intelligence experience for Malegaon. It works without a physical sensor: current and hourly air-quality estimates come from the Copernicus CAMS global model through Open-Meteo, and the interface labels them as model output rather than observed ground readings.

**Live application:** https://sumitpawar2006.github.io/aerochem-sentinel/

**Source repository:** https://github.com/sumitpawar2006/aerochem-sentinel

## Run locally

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

- Full-screen Leaflet map with OpenStreetMap streets, Esri satellite imagery, and OpenTopoMap terrain
- Live modeled US AQI, PM2.5, PM10, and a 24-hour CAMS model timeline
- Real OpenStreetMap places, hospitals, education, industry, transport, search, and Malegaon Taluka boundary
- Four work areas: Situation, Investigate, Trends, and Method
- Observed-versus-modeled comparison, monitoring coverage state, confidence/validation evidence state
- Clearly labeled demo hotspots when no local sensor or ground-station dataset is available
- Before/after and seasonal scenario comparison
- Downloadable, print-ready one-page HTML reports
- English/Marathi navigation support and an integrated presentation mode
- Sentinel Assistant for evidence summaries, report preparation, downloads, and Gmail delivery
- Desktop, tablet, and mobile layouts

## Optional Gmail report delivery

Create a Gmail App Password for the sending account, then set these environment variables in the same terminal before starting the server:

```powershell
$env:AEROCHEM_GMAIL_USER='sender@gmail.com'
$env:AEROCHEM_GMAIL_APP_PASSWORD='your-16-character-app-password'
$env:AEROCHEM_REPORT_RECIPIENT='recipient@gmail.com'
python server.py
```

Open the Sentinel Assistant and choose **Email this report**. For safety, the server only sends to `AEROCHEM_REPORT_RECIPIENT`; browser input cannot redirect reports to an arbitrary address. The Gmail password stays on the server and is never exposed to front-end code.

GitHub Pages hosts the static public frontend and loads live modeled AQI directly from Open-Meteo. Secure Gmail sending requires `server.py`, so it is available when the repository is run locally or deployed to a Python-capable host with the environment variables above.

## Data truth and integration

- Live values are CAMS model estimates, not readings from a device or monitoring station.
- Real places on the map do not receive invented AQI values.
- Demo hotspot values are opt-in and visibly marked `MODEL DEMO`.
- Confidence intervals, MAE, RMSE, and R² remain unavailable until validated model artifacts are connected.
- Satellite basemap imagery is real reference imagery, not a Sentinel-5P pollutant raster.
- Add production pollutant tile URLs and verified ground-station coordinates through `data/app-config.json` and the data contract in the Method panel.

## Files

- `index.html` — application shell
- `v2.css` — complete responsive visual system
- `v2.js` — map, live data, interactions, reports, and assistant
- `server.py` — static server, live-AQI proxy, and Gmail endpoint
- `data/app-config.json` — region and integration configuration
- `data/environmental-snapshot.json` — labeled fallback/demo scenario data
