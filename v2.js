(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const svgNS = "http://www.w3.org/2000/svg";
  const sentinelNo2Wms = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
  const sentinelNo2LayerId = "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column";

  const fallbackConfig = {
    region: {
      name: "Malegaon, Nashik, Maharashtra",
      center: [20.5576062, 74.5246514],
      zoom: 13,
      searchViewbox: [74.3091148, 20.8349688, 74.8127559, 20.3442422],
      osmBoundaryRelation: 10345577
    },
    environmentalDataUrl: "data/environmental-snapshot.json",
    decisionModelUrl: "data/decision-model.json",
    nearbyCitiesUrl: "data/nearby-cities.json",
    publicUrl: "https://sumitpawar2006.github.io/aerochem-sentinel/",
    weatherEndpoint: "https://api.open-meteo.com/v1/forecast",
    reportEndpoint: "/api/report",
    reportStatusEndpoint: "/api/report/status",
    chatEndpoint: "/api/chat",
    chatStatusEndpoint: "/api/chat/status"
  };

  const fallbackEnvironmentalData = {
    metadata: { status: "unavailable", scenarioDate: null, label: "Environmental dataset unavailable" },
    observed: { aqi: null, stations: [] },
    predicted: { aqi: null, confidenceInterval: null, reliability: null },
    modelEvaluation: { mae: null, rmse: null, r2: null },
    timeline: [], seasonalComparison: {}, hotspots: []
  };

  const fallbackDecisionModel = {
    metadata: { status: "unavailable", label: "Decision model unavailable", sources: [] },
    sensorSiting: { coverageRadiusKm: 3, weights: [], candidates: [] },
    interventions: { defaultIntervention: "traffic", defaultStrength: 60, options: [] },
    feasibility: { timelineWeeks: 12, costAssumptionsInr: {}, phases: [], communityImpact: [] },
    domainBrief: {},
    projectBlueprint: { stages: [], modelPlan: {}, evidence: [], team: [] }
  };

  const categoryDefinitions = {
    places: {
      title: "Mapped places",
      kicker: "REAL LOCATION CATALOGUE",
      icon: "⌖",
      markerClass: "",
      query: center => `nwr(around:18000,${center[0]},${center[1]})["place"]["name"];`
    },
    hospitals: {
      title: "Health facilities",
      kicker: "OPENSTREETMAP · HEALTH",
      icon: "+",
      markerClass: "health",
      query: center => `nwr(around:15000,${center[0]},${center[1]})["amenity"~"hospital|clinic|doctors"]["name"];`
    },
    schools: {
      title: "Education locations",
      kicker: "OPENSTREETMAP · EDUCATION",
      icon: "□",
      markerClass: "school",
      query: center => `nwr(around:15000,${center[0]},${center[1]})["amenity"~"school|college|university"]["name"];`
    },
    industry: {
      title: "Mapped industrial locations",
      kicker: "OPENSTREETMAP · INDUSTRY",
      icon: "⌂",
      markerClass: "industry",
      query: center => `(nwr(around:18000,${center[0]},${center[1]})["landuse"="industrial"]["name"];nwr(around:18000,${center[0]},${center[1]})["man_made"="works"]["name"];nwr(around:18000,${center[0]},${center[1]})["industrial"]["name"];);`
    },
    transport: {
      title: "Transport locations",
      kicker: "OPENSTREETMAP · TRANSPORT",
      icon: "⇄",
      markerClass: "transport",
      query: center => `(nwr(around:18000,${center[0]},${center[1]})["public_transport"]["name"];nwr(around:18000,${center[0]},${center[1]})["railway"~"station|halt"]["name"];nwr(around:18000,${center[0]},${center[1]})["amenity"="bus_station"]["name"];);`
    }
  };

  const modeTitles = {
    situation: ["SITUATION INTELLIGENCE", "Evidence before claims"],
    investigate: ["REAL LOCATION CATALOGUE", "Mapped places"],
    trends: ["TEMPORAL & SEASONAL ANALYSIS", "Compare conditions"],
    method: ["METHODOLOGY", "From orbit to action"]
  };

  const translations = {
    en: {
      navSituation: "Situation", navInvestigate: "Investigate", navTrends: "Trends", navMethod: "Method",
      searchPlaceholder: "Search nearby cities, roads or places",
      demoButton: "Run demo scenario",
      mapOnline: "MAP ONLINE"
    },
    mr: {
      navSituation: "स्थिती", navInvestigate: "तपासा", navTrends: "कल", navMethod: "पद्धत",
      searchPlaceholder: "जवळची शहरे, रस्ते किंवा ठिकाणे शोधा",
      demoButton: "डेमो परिस्थिती चालवा",
      mapOnline: "नकाशा ऑनलाइन"
    }
  };

  const methodExplanations = [
    ["Observe the environmental system", "Start with dated, quality-filtered inputs. Satellite column values remain distinct from ground-level concentrations."],
    ["Fuse evidence carefully", "Align space, time, units, missing-data rules and quality flags before any model receives the inputs."],
    ["Predict with versioned models", "Random Forest or XGBoost outputs should only appear with their artifact version, evaluation design and date."],
    ["Interpret without overclaiming", "Hotspots and probable sources guide investigation; they do not confirm a pollution source on their own."],
    ["Act with visible uncertainty", "Risk communication, monitoring priorities and reports preserve every data-status and confidence limitation."]
  ];

  const presentationSteps = [
    ["situation", "01 · Define the gap", "Malegaon needs local evidence. We show the live model honestly and never present it as a ground observation."],
    ["situation", "02 · Show what works", "A real dated Sentinel-5P NO₂ column layer, current CAMS modeled AQI/HCHO/NO₂ and live weather establish the evidence available today."],
    ["situation", "03 · Make a decision", "A transparent planning score recommends the strongest first monitoring location—and labels it as a scenario."],
    ["trends", "04 · Test one action", "The sandbox compares a pollution-reduction assumption without pretending that it is a causal forecast."],
    ["method", "05 · Prove feasibility", "One sensor, a 12-week pilot and an editable ₹1.86 lakh planning budget create a credible path from prototype to validation."]
  ];

  const state = {
    config: fallbackConfig,
    environmental: fallbackEnvironmentalData,
    decisionModel: fallbackDecisionModel,
    map: null,
    baseLayers: {},
    currentBase: null,
    categoryLayers: {},
    categoryData: {},
    activeCategory: "places",
    boundaryLayer: null,
    coverageLayer: null,
    sensorLayer: null,
    simulationLayer: null,
    satelliteNo2Layer: null,
    satelliteNo2Date: null,
    demoLayer: null,
    demoEnabled: false,
    searchMarker: null,
    selectedLocation: null,
    selectedHotspot: null,
    currentMode: "situation",
    language: "en",
    presentationIndex: 0,
    timelineTimer: null,
    reportContext: null,
    liveAir: null,
    liveWeather: null,
    mailService: { configured: false, recipient: "" },
    aiService: { configured: false, model: "local evidence mode" },
    chatHistory: [],
    nearbyCities: [],
    activeIntervention: "traffic",
    sensitiveSiteCount: null,
    pilotEvidence: { community: false, validation: false, partner: false }
  };

  async function fetchJson(url, fallback) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`Unable to load ${url}`, error);
      return fallback;
    }
  }

  function showToast(message, duration = 3300) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), duration);
  }

  function formatCoordinate(value, positive, negative) {
    return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
  }

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(state.language === "mr" ? "mr-IN" : "en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata"
    }).format(date);
  }

  function usAqiCategory(value) {
    if (!Number.isFinite(value)) return { name: "Unavailable", color: "#87918d" };
    if (value <= 50) return { name: "Good", color: "#0f7c65" };
    if (value <= 100) return { name: "Moderate", color: "#c08a20" };
    if (value <= 150) return { name: "Unhealthy for sensitive groups", color: "#e66b32" };
    if (value <= 200) return { name: "Unhealthy", color: "#c93e35" };
    if (value <= 300) return { name: "Very unhealthy", color: "#7a4b8e" };
    return { name: "Hazardous", color: "#792a35" };
  }

  async function loadLiveAirQuality() {
    const settings = state.config.liveAirQuality;
    if (!settings?.enabled) return false;
    const [latitude, longitude] = state.config.region.center;
    const params = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      current: "us_aqi,pm10,pm2_5,nitrogen_dioxide,formaldehyde,sulphur_dioxide,ozone,carbon_monoxide",
      hourly: "us_aqi,pm10,pm2_5,nitrogen_dioxide,formaldehyde,ozone",
      past_hours: "24", forecast_hours: "1", timezone: "Asia/Kolkata",
      domains: settings.domain || "cams_global"
    });
    const directEndpoint = "https://air-quality-api.open-meteo.com/v1/air-quality";
    const endpoints = [...new Set([settings.endpoint, directEndpoint].filter(Boolean))];
    try {
      let payload;
      let lastError;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Live AQ model ${response.status}`);
          payload = await response.json();
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!payload) throw lastError || new Error("Live AQ model unavailable");
      if (!Number.isFinite(payload.current?.us_aqi)) throw new Error("Live AQ model returned no AQI");
      state.liveAir = payload;
      const times = payload.hourly?.time || [];
      state.environmental.timeline = times.map((time, index) => ({
        label: index === times.length - 1 ? "Now" : time.slice(11, 16),
        date: time,
        aqi: payload.hourly.us_aqi?.[index],
        pm2_5: payload.hourly.pm2_5?.[index],
        pm10: payload.hourly.pm10?.[index],
        no2: payload.hourly.nitrogen_dioxide?.[index],
        hcho: payload.hourly.formaldehyde?.[index],
        ozone: payload.hourly.ozone?.[index]
      })).filter(item => Number.isFinite(item.aqi));
      state.environmental.predicted = {
        ...state.environmental.predicted,
        aqi: payload.current.us_aqi,
        category: usAqiCategory(payload.current.us_aqi).name,
        reliability: null,
        confidenceInterval: null,
        scale: "US AQI",
        source: settings.provider,
        status: "live_model"
      };
      state.environmental.metadata = {
        ...state.environmental.metadata,
        scenarioDate: payload.current.time,
        status: "live_model",
        label: settings.provider,
        spatialResolutionKm: settings.spatialResolutionKm
      };
      updateLiveAirCard(payload.current);
      return true;
    } catch (error) {
      console.warn("Live air-quality feed unavailable", error);
      $("#live-aqi").textContent = "—";
      $("#live-aqi-category").textContent = "Live model temporarily unavailable";
      $("#live-aqi-source").textContent = "Use the clearly labelled demo scenario as fallback.";
      $("#live-feed-status").textContent = "UNAVAILABLE";
      updateHealthAdvisory(null);
      return false;
    }
  }

  function updateLiveAirCard(current) {
    const category = usAqiCategory(current.us_aqi);
    $("#live-aqi").textContent = Math.round(current.us_aqi);
    $("#live-aqi").style.color = category.color;
    $("#live-aqi-category").textContent = `${category.name} · live model`;
    $("#live-aqi-category").style.color = category.color;
    $("#live-aqi-source").textContent = `PM₂.₅ ${current.pm2_5} µg/m³ · PM₁₀ ${current.pm10} µg/m³`;
    $("#live-feed-dot").classList.remove("waiting");
    $("#live-feed-dot").classList.add("ready");
    $("#live-feed-status").textContent = "CAMS / OPEN-METEO";
    $("#live-aqi-scale").textContent = "US AQI · MODEL";
    $("#live-hcho").textContent = Number.isFinite(current.formaldehyde) ? Number(current.formaldehyde).toFixed(1) : "—";
    $("#live-no2").textContent = Number.isFinite(current.nitrogen_dioxide) ? Number(current.nitrogen_dioxide).toFixed(1) : "—";
    updateHealthAdvisory(current.us_aqi);
    updateInterventionSimulation();
  }

  function updateHealthAdvisory(value) {
    const band = $("#health-band");
    const guidance = $("#health-guidance");
    if (!Number.isFinite(value)) {
      band.textContent = "UNAVAILABLE";
      band.style.color = "";
      guidance.textContent = "Current modeled AQI is unavailable. No activity guidance is inferred.";
      return;
    }
    const category = usAqiCategory(value);
    const rounded = Math.round(value);
    let message = "Most people can continue normal outdoor activity.";
    if (value > 50 && value <= 100) message = "Most people can continue normal activity; unusually sensitive people should monitor symptoms during prolonged exertion.";
    else if (value <= 150 && value > 100) message = "Sensitive groups should reduce prolonged or heavy outdoor exertion.";
    else if (value <= 200 && value > 150) message = "Everyone should reduce prolonged outdoor exertion; sensitive groups should avoid it.";
    else if (value <= 300 && value > 200) message = "Avoid prolonged outdoor exertion and prioritize indoor exposure reduction.";
    else if (value > 300) message = "Avoid outdoor exertion and follow official local health and emergency guidance.";
    band.textContent = `${category.name.toUpperCase()} · US AQI ${rounded}`;
    band.style.color = category.color;
    guidance.textContent = message;
  }

  function compassDirection(value) {
    if (!Number.isFinite(value)) return "—";
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return points[Math.round(value / 45) % 8];
  }

  async function loadLiveWeather() {
    const [latitude, longitude] = state.config.region.center;
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
      timezone: "Asia/Kolkata",
      forecast_days: "1"
    });
    try {
      const response = await fetch(`${state.config.weatherEndpoint}?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Live weather ${response.status}`);
      const payload = await response.json();
      if (!payload.current) throw new Error("Live weather returned no current values");
      state.liveWeather = payload.current;
      $("#weather-temperature").textContent = `${payload.current.temperature_2m}°C`;
      $("#weather-humidity").textContent = `${payload.current.relative_humidity_2m}%`;
      $("#weather-wind").textContent = `${payload.current.wind_speed_10m} km/h`;
      $("#weather-direction").textContent = `${compassDirection(payload.current.wind_direction_10m)} ${Math.round(payload.current.wind_direction_10m)}°`;
      return true;
    } catch (error) {
      console.warn("Live weather unavailable", error);
      ["weather-temperature", "weather-humidity", "weather-wind", "weather-direction"].forEach(id => { $(`#${id}`).textContent = "Unavailable"; });
      return false;
    }
  }

  function initMap() {
    if (!window.L) {
      showToast("The map library could not load. Check the internet connection.", 6000);
      return;
    }
    const { center, zoom } = state.config.region;
    state.map = L.map("map", { zoomControl: true, preferCanvas: true, minZoom: 8, maxZoom: 19 }).setView(center, zoom);

    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    });
    const satelliteImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
    });
    const satelliteLabels = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Labels © Esri"
    });
    const terrain = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "Map data © OpenStreetMap contributors · SRTM · OpenTopoMap"
    });
    state.baseLayers = { streets, satellite: L.layerGroup([satelliteImagery, satelliteLabels]), terrain };
    state.currentBase = state.baseLayers.satellite.addTo(state.map);
    $("#visible-layer-status").textContent = "Real satellite imagery · Esri / Maxar / Earthstar";

    state.map.on("mousemove", event => {
      $("#cursor-coordinates").textContent = `${formatCoordinate(event.latlng.lat, "N", "S")} · ${formatCoordinate(event.latlng.lng, "E", "W")}`;
    });
    state.map.on("click", () => $("#search-results").classList.remove("open"));
  }

  function switchBase(name) {
    if (!state.map || !state.baseLayers[name]) return;
    if (state.currentBase) state.map.removeLayer(state.currentBase);
    state.currentBase = state.baseLayers[name].addTo(state.map);
    $$("[data-base]").forEach(button => button.classList.toggle("active", button.dataset.base === name));
    const label = name === "satellite" ? "Real satellite imagery basemap · Esri (not a pollutant layer)" : name === "terrain" ? "Terrain · OpenTopoMap" : "Streets and mapped places · OpenStreetMap";
    $("#visible-layer-status").textContent = label;
    showToast(label);
  }

  function latestCompleteSatelliteDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function updateSatelliteNo2Date(dateValue) {
    const latestComplete = latestCompleteSatelliteDate();
    const candidate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || "")) ? String(dateValue) : latestComplete;
    const date = candidate < latestComplete ? candidate : latestComplete;
    state.satelliteNo2Date = date;
    if (state.satelliteNo2Layer) state.satelliteNo2Layer.setParams({ time: date }, false);
    const label = $("#satellite-no2-date");
    if (label) label.textContent = `${date} · daily tropospheric column`;
  }

  function setSatelliteNo2Visible(visible, button = $('[data-layer="satellite-no2"]')) {
    if (!state.map || !window.L) return;
    if (visible) {
      if (!state.satelliteNo2Layer) {
        state.satelliteNo2Layer = L.tileLayer.wms(sentinelNo2Wms, {
          layers: sentinelNo2LayerId,
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          opacity: .72,
          attribution: "Sentinel-5P/TROPOMI NO₂ · NASA GIBS / GES DISC"
        });
        state.satelliteNo2Layer.setZIndex(340);
      }
      const timelinePoint = state.environmental.timeline?.[Number($("#map-time")?.value)];
      updateSatelliteNo2Date(timelinePoint?.date?.slice(0, 10) || latestCompleteSatelliteDate());
      if (!state.map.hasLayer(state.satelliteNo2Layer)) state.satelliteNo2Layer.addTo(state.map);
      button?.classList.add("active");
      $("#satellite-no2-legend").hidden = false;
      $("#visible-layer-status").textContent = `Sentinel-5P TROPOMI NO₂ column · ${state.satelliteNo2Date} · NASA GIBS`;
      showToast("Real daily Sentinel-5P NO₂ column enabled. It is atmospheric column density—not a ground sensor reading.", 5400);
    } else {
      if (state.satelliteNo2Layer && state.map.hasLayer(state.satelliteNo2Layer)) state.map.removeLayer(state.satelliteNo2Layer);
      button?.classList.remove("active");
      $("#satellite-no2-legend").hidden = true;
      $("#visible-layer-status").textContent = "Real satellite imagery · Esri / Maxar / Earthstar";
      showToast("Sentinel-5P NO₂ column hidden.");
    }
  }

  function toggleSatelliteNo2(button) {
    setSatelliteNo2Visible(!(state.satelliteNo2Layer && state.map.hasLayer(state.satelliteNo2Layer)), button);
  }

  function formatInr(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
  }

  function recommendedSensorCandidate() {
    const candidates = state.decisionModel.sensorSiting?.candidates || [];
    return [...candidates].sort((a, b) => b.score - a.score)[0] || null;
  }

  function renderCommunityImpact() {
    const impact = state.decisionModel.feasibility?.communityImpact || [];
    const container = $("#community-impact");
    if (!container) return;
    container.innerHTML = impact.map(item => {
      const value = item.label === "Sensitive sites" && Number.isFinite(state.sensitiveSiteCount)
        ? `${state.sensitiveSiteCount} mapped within 3 km`
        : item.value;
      return `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }).join("");
  }

  function updateFeasibility() {
    const feasibility = state.decisionModel.feasibility || {};
    const assumptions = feasibility.costAssumptionsInr || {};
    const count = Number($("#pilot-sensor-count")?.value || 1);
    if ($("#pilot-sensor-count-label")) $("#pilot-sensor-count-label").textContent = count;
    const perSensor = (assumptions.sensorAllowance || 0) + (assumptions.installationAndCalibration || 0) + (assumptions.connectivityAndMaintenance || 0);
    const fixed = (assumptions.communityTraining || 0) + (assumptions.softwareLicence || 0);
    const total = perSensor * count + fixed;
    if ($("#pilot-budget")) $("#pilot-budget").textContent = formatInr(total);
    const labels = {
      sensorAllowance: "Sensor allowance",
      installationAndCalibration: "Installation + calibration",
      connectivityAndMaintenance: "Connectivity + maintenance",
      communityTraining: "Community training",
      softwareLicence: "Software licence"
    };
    if ($("#cost-breakdown")) {
      $("#cost-breakdown").innerHTML = Object.entries(assumptions).map(([key, value]) => {
        const multiplied = ["sensorAllowance", "installationAndCalibration", "connectivityAndMaintenance"].includes(key) ? value * count : value;
        return `<div><span>${escapeHtml(labels[key] || key)}</span><strong>${formatInr(multiplied)}</strong></div>`;
      }).join("");
    }
    renderCommunityImpact();
  }

  function updateInterventionSimulation() {
    const interventions = state.decisionModel.interventions || {};
    const option = interventions.options?.find(item => item.id === state.activeIntervention) || interventions.options?.[0];
    if (!option) return;
    const strength = Number($("#intervention-strength")?.value || interventions.defaultStrength || 60);
    const reduction = option.maxPm25ReductionPct * strength / 100;
    const baseline = state.liveAir?.current?.pm2_5 ?? state.environmental.timeline?.at(-1)?.pm2_5;
    const result = Number.isFinite(baseline) ? baseline * (1 - reduction / 100) : null;
    $$('[data-intervention]').forEach(button => button.classList.toggle("active", button.dataset.intervention === option.id));
    if ($("#intervention-strength-label")) $("#intervention-strength-label").textContent = `${strength}%`;
    if ($("#simulation-baseline")) $("#simulation-baseline").textContent = Number.isFinite(baseline) ? `${baseline.toFixed(1)} µg/m³` : "Unavailable";
    if ($("#simulation-result")) $("#simulation-result").textContent = Number.isFinite(result) ? `${result.toFixed(1)} µg/m³` : "Awaiting live model";
    if ($("#simulation-change")) $("#simulation-change").textContent = `−${reduction.toFixed(1)}%`;
    if ($("#simulation-action")) $("#simulation-action").textContent = option.name;
    if ($("#simulation-implementation")) $("#simulation-implementation").textContent = `${option.description} · ${option.implementation}`;
    if ($("#simulation-method")) $("#simulation-method").textContent = `At ${strength}% implementation, the sandbox applies ${reduction.toFixed(1)}% of the current modeled PM₂.₅ value. This is an editable planning assumption, not a measured or causal forecast.`;
  }

  function showSimulationArea() {
    if (state.simulationLayer && state.map.hasLayer(state.simulationLayer)) {
      state.map.removeLayer(state.simulationLayer);
      state.simulationLayer = null;
      showToast("Planning intervention area hidden.");
      return;
    }
    const option = state.decisionModel.interventions?.options?.find(item => item.id === state.activeIntervention);
    if (!option) return;
    const strength = Number($("#intervention-strength")?.value || 60);
    const radius = 2800 + strength * 22;
    state.simulationLayer = L.circle(state.config.region.center, {
      radius, color: "#b9d767", weight: 2, dashArray: "8 6", fillColor: "#b9d767", fillOpacity: .12
    }).bindTooltip(`${escapeHtml(option.name)} · planning area only`, { className: "location-tooltip" }).addTo(state.map);
    state.map.fitBounds(state.simulationLayer.getBounds().pad(.12));
    $("#visible-layer-status").textContent = `${option.name} · planning scenario, not forecast`;
    showToast("Illustrative intervention area shown. No measured reduction is claimed.", 4600);
  }

  function showSensorRecommendation(candidateId, compareAll = false) {
    const siting = state.decisionModel.sensorSiting || {};
    const candidates = siting.candidates || [];
    const candidate = candidates.find(item => item.id === candidateId) || recommendedSensorCandidate();
    if (!candidate || !state.map) return;
    if (state.sensorLayer && state.map.hasLayer(state.sensorLayer)) state.map.removeLayer(state.sensorLayer);
    state.sensorLayer = L.layerGroup();
    const visibleCandidates = compareAll ? candidates : [candidate];
    visibleCandidates.forEach(item => {
      const isRecommended = item.id === recommendedSensorCandidate()?.id;
      const color = isRecommended ? "#b9d767" : "#f2f4ef";
      const icon = L.divIcon({
        className: "",
        html: `<span class="sensor-site-marker ${isRecommended ? "recommended" : ""}"><b>${item.score}</b><small>${isRecommended ? "BEST" : "ALT"}</small></span>`,
        iconSize: [48, 48], iconAnchor: [24, 24]
      });
      L.marker([item.lat, item.lng], { icon, zIndexOffset: 1200 }).bindTooltip(`<strong>${escapeHtml(item.name)}</strong><br>Planning score ${item.score}/100`, { className: "location-tooltip", direction: "top" }).addTo(state.sensorLayer);
      L.circle([item.lat, item.lng], { radius: (siting.coverageRadiusKm || 3) * 1000, color, weight: isRecommended ? 2 : 1, dashArray: "7 6", fillColor: color, fillOpacity: isRecommended ? .11 : .035, interactive: false }).addTo(state.sensorLayer);
    });
    state.sensorLayer.addTo(state.map);
    const bounds = L.latLngBounds(visibleCandidates.map(item => [item.lat, item.lng]));
    state.map.fitBounds(bounds.pad(compareAll ? .45 : .8), { maxZoom: compareAll ? 13 : 14 });
    $('[data-layer="sensor"]')?.classList.add("active");
    $("#visible-layer-status").textContent = compareAll ? "Sensor-site candidate comparison · planning model" : `${candidate.name} · planning recommendation`;
    showToast(compareAll ? "Comparing four planning candidates." : "Recommended sensor site shown with a 3 km planning radius.");
  }

  function toggleSensorLayer(button) {
    if (state.sensorLayer && state.map.hasLayer(state.sensorLayer)) {
      state.map.removeLayer(state.sensorLayer);
      button.classList.remove("active");
      return;
    }
    showSensorRecommendation();
  }

  async function loadSensitiveSiteEvidence() {
    const candidate = recommendedSensorCandidate();
    if (!candidate) return;
    const radius = state.decisionModel.sensorSiting?.coverageRadiusKm || 3;
    try {
      const radiusMeters = radius * 1000;
      const query = `[out:json][timeout:20];nwr(around:${radiusMeters},${candidate.lat},${candidate.lng})["amenity"~"school|college|university|hospital|clinic|doctors"]["name"];out center tags;`;
      const sites = await queryOverpassRequest(query, "sensitive");
      state.sensitiveSiteCount = sites.filter(site => distanceKm(candidate.lat, candidate.lng, site.lat, site.lng) <= radius).length;
      $("#sensor-sensitive-sites").textContent = `${state.sensitiveSiteCount} mapped`;
      renderCommunityImpact();
    } catch (error) {
      console.warn("Sensitive-site evidence unavailable", error);
      $("#sensor-sensitive-sites").textContent = "OSM unavailable";
    }
  }

  function renderDocumentSynthesis() {
    const domain = state.decisionModel.domainBrief || {};
    $("#domain-brief-title").textContent = domain.title || "Why the project focuses on HCHO";
    $("#domain-description").textContent = domain.description || "The team document synthesis is unavailable.";
    $("#domain-status").textContent = domain.status || "NOT CONNECTED";
    $("#domain-caution").textContent = domain.satelliteMeaning || "Satellite column values must remain distinct from ground concentration.";
    $("#chemistry-chain").innerHTML = (domain.chemistry || []).map(item => `<span>${escapeHtml(item)}</span>`).join("");

    const blueprint = state.decisionModel.projectBlueprint || {};
    $("#blueprint-title").textContent = blueprint.title || "PDF-to-dashboard evidence pipeline";
    $("#blueprint-description").textContent = blueprint.description || "Project architecture unavailable.";
    $("#blueprint-stages").innerHTML = (blueprint.stages || []).map(item => {
      const tone = item.status === "ACTIVE" ? "active" : item.status === "PARTIAL" ? "partial" : "";
      return `<div class="blueprint-stage"><span>${escapeHtml(item.number)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary)}<br>${escapeHtml(item.note)}</small></div><em class="${tone}">${escapeHtml(item.status)}</em></div>`;
    }).join("");
    $("#blueprint-evidence").innerHTML = (blueprint.evidence || []).map(item => `<div><span>${escapeHtml(item.label)}</span><strong class="${item.tone === "live" ? "live" : ""}">${escapeHtml(item.status)}</strong></div>`).join("");

    const plan = blueprint.modelPlan || {};
    $("#model-plan").innerHTML = [
      ["Features", (plan.features || []).join(", ") || "Not documented"],
      ["Target + models", `${plan.target || "AQI"} · ${(plan.models || []).join(" + ") || "Not documented"}`],
      ["Documented split", plan.documentedSplit || "Not documented"],
      ["Validation required", (plan.requiredMetrics || []).join(", ") || "Not documented"],
      ["Current status", plan.status || "Unavailable"]
    ].map(item => `<div><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(item[1])}</strong></div>`).join("");
    $("#project-team").innerHTML = (blueprint.team || []).map(member => `<div><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.role)}</span></div>`).join("");
    const synthesis = state.decisionModel.documentSynthesis || {};
    $("#document-provenance").textContent = `${synthesis.label || "Team documents"} · ${(synthesis.documents || []).join(" · ")}`;
  }

  function renderDecisionUi() {
    const model = state.decisionModel;
    renderDocumentSynthesis();
    const siting = model.sensorSiting || {};
    const best = recommendedSensorCandidate();
    if (best) {
      $("#sensor-score").textContent = `${best.score}/100`;
      $("#sensor-description").textContent = siting.description;
      $("#sensor-site-name").textContent = best.name;
      $("#sensor-site-reason").textContent = best.reason;
      $("#sensor-radius").textContent = `${siting.coverageRadiusKm || 3} km`;
      $("#sensor-weights").innerHTML = (siting.weights || []).map(item => `<div><span>${escapeHtml(item.label)}</span><strong>${item.weight}%</strong></div>`).join("");
      $("#sensor-candidates").innerHTML = (siting.candidates || []).map(item => `<button type="button" data-sensor-candidate="${escapeHtml(item.id)}"><span>${item.score}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.reason)}</small></div></button>`).join("");
    }

    const interventions = model.interventions || {};
    state.activeIntervention = interventions.defaultIntervention || interventions.options?.[0]?.id || "traffic";
    $("#intervention-description").textContent = interventions.description || "Planning sandbox unavailable.";
    $("#intervention-strength").value = interventions.defaultStrength || 60;
    $("#intervention-switch").innerHTML = (interventions.options || []).map(item => `<button type="button" data-intervention="${escapeHtml(item.id)}">${escapeHtml(item.short || item.name)}</button>`).join("");

    const feasibility = model.feasibility || {};
    $("#feasibility-title").textContent = feasibility.title || "Field pilot";
    $("#feasibility-description").textContent = feasibility.description || "Planning model unavailable.";
    $("#pilot-phases").innerHTML = (feasibility.phases || []).map(item => `<div><span>${escapeHtml(item.weeks)}</span><p><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></p></div>`).join("");
    $("#decision-sources").innerHTML = `<span>REFERENCE PATHWAYS</span>${(model.metadata?.sources || []).map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(source.label)}</strong><small>${escapeHtml(source.use)}</small></a>`).join("")}`;
    renderCommunityImpact();
    updateFeasibility();
    updateInterventionSimulation();
  }

  function overpassQueryFor(category) {
    const definition = categoryDefinitions[category];
    return `[out:json][timeout:30];${definition.query(state.config.region.center)}out center tags;`;
  }

  async function queryOverpassRequest(query, category) {
    const endpoints = [
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://overpass-api.de/api/interpreter"
    ];
    let lastError;
    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        try { controller.abort(); } catch { /* Navigation can dispose the request first. */ }
      }, 18000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        const payload = await response.json();
        return normalizeOsmElements(payload.elements || [], category);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error("OpenStreetMap feature service unavailable");
  }

  async function queryOverpass(category) {
    return queryOverpassRequest(overpassQueryFor(category), category);
  }

  function normalizeOsmElements(elements, category) {
    const seen = new Set();
    return elements.map(element => {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      const tags = element.tags || {};
      const name = tags["name:en"] || tags.name || tags["name:mr"];
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const type = tags.place || tags.amenity || tags.landuse || tags.man_made || tags.railway || tags.public_transport || category;
      return {
        id: `${element.type}-${element.id}`,
        osmType: element.type,
        osmId: element.id,
        name,
        marathiName: tags["name:mr"] || null,
        type: String(type).replaceAll("_", " "),
        category,
        lat,
        lng,
        address: [tags["addr:street"], tags["addr:suburb"], tags["addr:city"]].filter(Boolean).join(", ") || state.config.region.name,
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`
      };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }

  function markerIcon(category) {
    const definition = categoryDefinitions[category];
    return L.divIcon({
      className: "",
      html: `<span class="real-place-marker ${definition.markerClass}" aria-hidden="true"></span>`,
      iconSize: [21, 21], iconAnchor: [10, 10]
    });
  }

  function createCategoryLayer(category, locations) {
    const group = L.layerGroup();
    locations.forEach(location => {
      const marker = L.marker([location.lat, location.lng], { icon: markerIcon(category), keyboard: true })
        .bindTooltip(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.type)}`, { className: "location-tooltip", direction: "top", offset: [0, -8] })
        .on("click", () => inspectLocation(location));
      marker.addTo(group);
    });
    return group;
  }

  async function loadCategory(category, options = {}) {
    if (!categoryDefinitions[category]) return;
    state.activeCategory = category;
    const definition = categoryDefinitions[category];
    $("#location-list").innerHTML = Array.from({ length: 6 }, () => '<div class="loading-row"></div>').join("");
    $("#location-count").textContent = "—";
    $("#catalogue-status").className = "";
    $("#catalogue-status").innerHTML = "<i></i> Loading live OpenStreetMap features…";
    if (state.currentMode === "investigate") {
      $("#inspector-kicker").textContent = definition.kicker;
      $("#inspector-title").textContent = definition.title;
    }
    $$("[data-category]").forEach(button => button.classList.toggle("active", button.dataset.category === category));
    $$('[data-layer="places"],[data-layer="hospitals"],[data-layer="schools"],[data-layer="industry"],[data-layer="transport"]').forEach(button => button.classList.toggle("active", button.dataset.layer === category));

    if (state.categoryLayers[state.activeCategory]) {
      Object.entries(state.categoryLayers).forEach(([key, layer]) => { if (state.map.hasLayer(layer)) state.map.removeLayer(layer); });
    }

    try {
      if (!state.categoryData[category]) state.categoryData[category] = await queryOverpass(category);
      const locations = state.categoryData[category];
      if (!state.categoryLayers[category]) state.categoryLayers[category] = createCategoryLayer(category, locations);
      Object.entries(state.categoryLayers).forEach(([key, layer]) => {
        if (key !== category && state.map.hasLayer(layer)) state.map.removeLayer(layer);
      });
      state.categoryLayers[category].addTo(state.map);
      renderLocationList(locations, category);
      $("#location-count").textContent = locations.length;
      $("#catalogue-status").className = "loaded";
      $("#catalogue-status").innerHTML = "<i></i> Loaded from OpenStreetMap";
      $("#visible-layer-status").textContent = `${definition.title} · OpenStreetMap`;
      if (options.fit && locations.length) {
        const bounds = L.latLngBounds(locations.map(item => [item.lat, item.lng]));
        state.map.fitBounds(bounds.pad(.15), { maxZoom: 14 });
      }
    } catch (error) {
      console.error(error);
      $("#location-count").textContent = "0";
      $("#catalogue-status").className = "error";
      $("#catalogue-status").innerHTML = "<i></i> Live feature service unavailable";
      $("#location-list").innerHTML = '<p class="empty-list">The real basemap and its labels remain available. Retry this layer when the OpenStreetMap feature service is reachable.</p>';
      showToast("The live location catalogue could not load. Base map labels remain available.", 5200);
    }
  }

  function renderLocationList(locations, category) {
    const definition = categoryDefinitions[category];
    const list = $("#location-list");
    if (!locations.length) {
      list.innerHTML = '<p class="empty-list">No named features in this category were returned for the current region.</p>';
      return;
    }
    list.innerHTML = locations.map(location => `<button class="location-item" type="button" data-location-id="${location.id}">
      <span>${definition.icon}</span><div><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml(location.type)}</small></div><i>→</i>
    </button>`).join("");
    $$("[data-location-id]", list).forEach(button => button.addEventListener("click", () => {
      const location = locations.find(item => item.id === button.dataset.locationId);
      if (location) inspectLocation(location);
    }));
  }

  function inspectLocation(location) {
    state.selectedLocation = location;
    state.selectedHotspot = null;
    state.reportContext = { kind: "location", data: location };
    hideInspectorContents();
    $("#location-detail").hidden = false;
    $("#inspector-kicker").textContent = "REAL OSM LOCATION";
    $("#inspector-title").textContent = "Location evidence";
    $("#detail-type").textContent = `${location.type.toUpperCase()} · OPENSTREETMAP`;
    $("#detail-name").textContent = state.language === "mr" && location.marathiName ? location.marathiName : location.name;
    $("#detail-address").textContent = location.address;
    $("#detail-lat").textContent = location.lat.toFixed(6);
    $("#detail-lng").textContent = location.lng.toFixed(6);
    $("#detail-osm-link").href = location.osmUrl;
    $("#inspector").classList.add("open");
    state.map.flyTo([location.lat, location.lng], Math.max(state.map.getZoom(), 15), { duration: .65 });
  }

  async function toggleBoundary(button) {
    if (state.boundaryLayer && state.map.hasLayer(state.boundaryLayer)) {
      state.map.removeLayer(state.boundaryLayer);
      button.classList.remove("active");
      return;
    }
    if (state.boundaryLayer) {
      state.boundaryLayer.addTo(state.map);
      button.classList.add("active");
      return;
    }
    showToast("Loading the real Malegaon Taluka boundary from OpenStreetMap…");
    try {
      const relation = state.config.region.osmBoundaryRelation;
      const response = await fetch(`https://nominatim.openstreetmap.org/lookup?format=jsonv2&osm_ids=R${relation}&polygon_geojson=1`, { headers: { "Accept-Language": state.language === "mr" ? "mr,en" : "en" } });
      if (!response.ok) throw new Error(`Boundary ${response.status}`);
      const result = await response.json();
      if (!result[0]?.geojson) throw new Error("Boundary geometry missing");
      state.boundaryLayer = L.geoJSON(result[0].geojson, { style: { color: "#0f7c65", weight: 2, opacity: .85, fillColor: "#0f7c65", fillOpacity: .025, dashArray: "7 7" } })
        .bindTooltip("Malegaon Taluka boundary · OpenStreetMap", { className: "location-tooltip" })
        .addTo(state.map);
      button.classList.add("active");
      showToast("Real Malegaon Taluka boundary loaded.");
    } catch (error) {
      console.error(error);
      showToast("Boundary service unavailable. Try again later.", 4600);
    }
  }

  function toggleCoverage(button) {
    const stations = state.environmental.observed?.stations || [];
    if (!stations.length) {
      showToast("No verified monitoring-station coordinates are connected. Coverage is intentionally blank.", 5200);
      button.classList.remove("active");
      return;
    }
    if (!state.coverageLayer) {
      state.coverageLayer = L.layerGroup();
      stations.forEach(station => {
        L.circle([station.lat, station.lng], { radius: station.coverageRadiusM || 5000, color: "#347faa", weight: 1, fillColor: "#347faa", fillOpacity: .09 })
          .bindTooltip(`${escapeHtml(station.name)} · observed coverage`, { className: "location-tooltip" }).addTo(state.coverageLayer);
        L.circleMarker([station.lat, station.lng], { radius: 5, color: "white", weight: 2, fillColor: "#347faa", fillOpacity: 1 }).addTo(state.coverageLayer);
      });
    }
    if (state.map.hasLayer(state.coverageLayer)) { state.map.removeLayer(state.coverageLayer); button.classList.remove("active"); }
    else { state.coverageLayer.addTo(state.map); button.classList.add("active"); }
  }

  function hotspotColor(aqi) {
    if (aqi > 300) return "#c93e35";
    if (aqi > 200) return "#e66b32";
    return "#e9a73a";
  }

  function createDemoLayer() {
    const group = L.layerGroup();
    state.environmental.hotspots.forEach(hotspot => {
      const color = hotspotColor(hotspot.aqi);
      L.circle([hotspot.lat, hotspot.lng], { radius: 850 + hotspot.aqi * 1.8, color, weight: 1, opacity: .32, fillColor: color, fillOpacity: .12, interactive: false }).addTo(group);
      const icon = L.divIcon({ className: "", html: `<span class="demo-hotspot" style="color:${color}" aria-hidden="true"></span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([hotspot.lat, hotspot.lng], { icon }).bindTooltip(`<strong>${escapeHtml(hotspot.name)}</strong><br>Demo AQI ${hotspot.aqi}`, { className: "location-tooltip", direction: "top" }).on("click", () => inspectHotspot(hotspot)).addTo(group);
    });
    return group;
  }

  function toggleDemo(force) {
    if (!state.demoLayer) state.demoLayer = createDemoLayer();
    const enable = typeof force === "boolean" ? force : !state.demoEnabled;
    state.demoEnabled = enable;
    if (enable) state.demoLayer.addTo(state.map); else state.map.removeLayer(state.demoLayer);
    if (enable) state.map.flyTo(state.config.region.center, state.config.region.zoom, { duration: .7 });
    $("#aqi-empty").hidden = enable;
    $("#aqi-demo").hidden = !enable;
    $("#demo-legend").hidden = !enable;
    $("#demo-button").classList.toggle("active", enable);
    $("#demo-button strong").textContent = enable ? "Hide demo scenario" : translations[state.language].demoButton;
    $('[data-layer="demo"]').classList.toggle("active", enable);
    showToast(enable ? "Demo AQI overlay enabled. It is not live environmental data." : "Demo AQI overlay hidden. Real geography remains visible.", 4200);
  }

  function inspectHotspot(hotspot) {
    state.selectedHotspot = hotspot;
    state.selectedLocation = null;
    state.reportContext = { kind: "hotspot", data: hotspot };
    hideInspectorContents();
    $("#hotspot-detail").hidden = false;
    $("#inspector-kicker").textContent = "HOTSPOT INTELLIGENCE · DEMO";
    $("#inspector-title").textContent = "Model scenario";
    $("#hotspot-aqi").textContent = hotspot.aqi;
    $("#hotspot-category").textContent = hotspot.category.toUpperCase();
    $("#hotspot-name").textContent = hotspot.name;
    $("#hotspot-coordinates").textContent = `${formatCoordinate(hotspot.lat, "N", "S")} · ${formatCoordinate(hotspot.lng, "E", "W")}`;
    $("#hotspot-hcho").textContent = hotspot.hcho;
    $("#hotspot-no2").textContent = hotspot.no2;
    $("#hotspot-source").textContent = hotspot.source;
    $("#hotspot-reliability").textContent = state.environmental.predicted.reliability ?? "Unavailable";
    $("#inspector").classList.add("open");
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const toRadians = value => value * Math.PI / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function suggestNearbyCities(query) {
    const results = $("#search-results");
    const value = query.trim().toLocaleLowerCase(state.language === "mr" ? "mr-IN" : "en-IN");
    if (!value) { results.classList.remove("open"); return; }
    const [centerLat, centerLng] = state.config.region.center;
    const matches = state.nearbyCities
      .filter(city => [city.name, city.nameMr].filter(Boolean).some(name => name.toLocaleLowerCase().includes(value)))
      .map(city => ({ ...city, distance: distanceKm(centerLat, centerLng, city.lat, city.lng) }))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(value) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(value) ? 0 : 1;
        return aStarts - bStarts || a.distance - b.distance;
      })
      .slice(0, 7);
    results.classList.add("open");
    if (!matches.length) {
      results.innerHTML = '<p class="search-message">Press Enter to search all real OpenStreetMap locations.</p>';
      return;
    }
    results.innerHTML = `<div class="search-suggestion-label">NEARBY CITIES · OPENSTREETMAP</div>${matches.map((city, index) => `
      <button class="search-result city-suggestion" type="button" data-city-index="${index}">
        <span>◎</span><div><strong>${escapeHtml(state.language === "mr" && city.nameMr ? city.nameMr : city.name)}</strong>
        <small>${escapeHtml(city.type)} · ${Math.round(city.distance)} km from Malegaon${city.nameMr && state.language !== "mr" ? ` · ${escapeHtml(city.nameMr)}` : ""}</small></div>
      </button>`).join("")}<p class="search-message search-all-note">Press Enter to search roads and every mapped place.</p>`;
    $$('[data-city-index]', results).forEach(button => button.addEventListener("click", () => selectNearbyCity(matches[Number(button.dataset.cityIndex)])));
  }

  function selectNearbyCity(city) {
    $("#location-query").value = city.name;
    selectSearchResult({
      lat: String(city.lat), lon: String(city.lng), osm_type: "node", osm_id: city.id,
      name: city.name, type: city.type, category: "place",
      display_name: `${city.name}, nearby city/town, India`
    });
    state.map.flyTo([city.lat, city.lng], city.type === "city" ? 12 : 13, { duration: .8 });
  }

  async function searchLocations(query) {
    const results = $("#search-results");
    results.classList.add("open");
    results.innerHTML = '<p class="search-message">Searching OpenStreetMap…</p>';
    const viewbox = state.config.region.searchViewbox.join(",");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&bounded=0&countrycodes=in&viewbox=${viewbox}&accept-language=${state.language === "mr" ? "mr,en" : "en"}&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Search ${response.status}`);
      const items = await response.json();
      if (!items.length) {
        results.innerHTML = '<p class="search-message">No matching real OpenStreetMap location was found.</p>';
        return;
      }
      results.innerHTML = items.map((item, index) => `<button class="search-result" type="button" data-search-index="${index}"><span>⌖</span><div><strong>${escapeHtml(item.name || item.display_name.split(",")[0])}</strong><small>${escapeHtml(item.display_name)}</small></div></button>`).join("");
      $$('[data-search-index]', results).forEach(button => button.addEventListener("click", () => selectSearchResult(items[Number(button.dataset.searchIndex)])));
    } catch (error) {
      console.error(error);
      results.innerHTML = '<p class="search-message">Location search is temporarily unavailable. The real basemap labels remain visible.</p>';
    }
  }

  function selectSearchResult(item) {
    const lat = Number(item.lat), lng = Number(item.lon);
    $("#search-results").classList.remove("open");
    if (state.searchMarker) state.searchMarker.remove();
    state.searchMarker = L.marker([lat, lng], { icon: L.divIcon({ className: "", html: '<span class="search-pin"></span>', iconSize: [34, 42], iconAnchor: [17, 39] }) }).addTo(state.map);
    const location = {
      id: `${item.osm_type}-${item.osm_id}`,
      osmType: item.osm_type,
      osmId: item.osm_id,
      name: item.name || item.display_name.split(",")[0],
      type: item.type || item.category || "mapped location",
      category: "search",
      lat, lng,
      address: item.display_name,
      osmUrl: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`
    };
    inspectLocation(location);
  }

  function hideInspectorContents() {
    $$(".inspector-body.mode-panel, .location-detail").forEach(panel => panel.hidden = true);
  }

  function setMobileLayerMenu(open) {
    const dock = $(".layer-dock");
    const toggle = $("#mobile-layer-toggle");
    const backdrop = $("#mobile-layer-backdrop");
    if (!dock || !toggle || !backdrop) return;
    const shouldOpen = Boolean(open && window.matchMedia("(max-width: 900px)").matches);
    dock.classList.toggle("mobile-open", shouldOpen);
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    const label = $("strong", toggle);
    if (label) label.textContent = shouldOpen ? "Choose layer" : "Layers";
    backdrop.hidden = !shouldOpen;
    if (!shouldOpen) $(".map-workspace").scrollTop = 0;
    if (shouldOpen) {
      $("#inspector").classList.remove("open");
      $("#assistant-panel").classList.remove("open");
    }
  }

  function setMode(mode) {
    if (!modeTitles[mode]) return;
    setMobileLayerMenu(false);
    if (window.matchMedia("(max-width: 900px)").matches) $("#assistant-panel").classList.remove("open");
    state.currentMode = mode;
    hideInspectorContents();
    $(`#${mode}-panel`).hidden = false;
    $("#inspector-kicker").textContent = modeTitles[mode][0];
    $("#inspector-title").textContent = modeTitles[mode][1];
    $$("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    $("#inspector").classList.add("open");
    $(".mode-nav").classList.remove("open");
    $("#mobile-menu").setAttribute("aria-expanded", "false");
    if (mode === "investigate") {
      const definition = categoryDefinitions[state.activeCategory];
      $("#inspector-kicker").textContent = definition.kicker;
      $("#inspector-title").textContent = definition.title;
      if (!state.categoryData[state.activeCategory]) loadCategory(state.activeCategory);
    }
    if (mode === "trends") {
      updateInterventionSimulation();
      if (!state.liveAir) showToast("The live timeline is unavailable; seasonal and fallback values are clearly labelled demo.", 3800);
    }
  }

  function updateEnvironmentalUi() {
    const environmental = state.environmental;
    const predicted = environmental.predicted || {};
    $("#predicted-aqi").textContent = predicted.aqi ?? "—";
    $("#observed-aqi").textContent = environmental.observed?.aqi ?? "—";
    const isLiveModel = environmental.metadata?.status === "live_model";
    $("#model-date").textContent = environmental.metadata?.scenarioDate ? `${environmental.metadata.status === "demo" ? "Demo · " : ""}${formatDate(environmental.metadata.scenarioDate)}` : "Not available";
    $("#snapshot-status").textContent = isLiveModel ? `LIVE MODEL · ${environmental.metadata.spatialResolutionKm || 45} KM GRID` : String(environmental.metadata?.status || "unavailable").toUpperCase();
    $("#predicted-source").textContent = isLiveModel ? "CAMS global via Open-Meteo · not observed" : "Demo model output";
    $(".timeline-state").textContent = isLiveModel ? "LIVE MODEL TIMELINE" : "DEMO WHEN AQI LAYER IS ON";
    $("#trend-source-label").textContent = isLiveModel ? "CAMS global model timeline" : "Example model timeline";
    $("#trend-status-label").textContent = isLiveModel ? "LIVE MODEL DATA" : "DEMO DATA";
    if (predicted.aqi != null) $("#aqi-demo").querySelector("strong").textContent = predicted.aqi;
    renderCompareChart();
    updateTimeline(Math.max(0, (environmental.timeline || []).length - 1));
    updateInterventionSimulation();
  }

  function renderCompareChart() {
    const svg = $("#compare-chart");
    const data = state.environmental.timeline || [];
    svg.innerHTML = "";
    if (!data.length) return;
    const W = 340, H = 150, pad = { l: 22, r: 10, t: 12, b: 22 };
    const values = data.map(item => item.aqi).filter(Number.isFinite);
    const min = Math.min(...values) - 12, max = Math.max(...values) + 12;
    const x = i => pad.l + i * ((W - pad.l - pad.r) / Math.max(1, data.length - 1));
    const y = value => pad.t + (1 - (value - min) / (max - min)) * (H - pad.t - pad.b);
    [0, .5, 1].forEach(fraction => {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", pad.l); line.setAttribute("x2", W - pad.r); line.setAttribute("y1", pad.t + fraction * (H - pad.t - pad.b)); line.setAttribute("y2", pad.t + fraction * (H - pad.t - pad.b)); line.setAttribute("stroke", "rgba(24,33,30,.1)");
      svg.appendChild(line);
    });
    const points = data.map((item, index) => [x(index), y(item.aqi)]);
    const area = document.createElementNS(svgNS, "path");
    area.setAttribute("d", `M ${points[0][0]} ${H-pad.b} L ${points.map(point => point.join(" ")).join(" L ")} L ${points.at(-1)[0]} ${H-pad.b} Z`); area.setAttribute("fill", "rgba(230,107,50,.09)");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M ${points.map(point => point.join(" ")).join(" L ")}`); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#e66b32"); path.setAttribute("stroke-width", "2"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
    svg.append(area, path);
    points.forEach((point, index) => {
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", point[0]); circle.setAttribute("cy", point[1]); circle.setAttribute("r", index === points.length - 1 ? "4" : "2.5"); circle.setAttribute("fill", "#e66b32"); circle.setAttribute("stroke", "#fafbf7"); circle.setAttribute("stroke-width", "2"); svg.appendChild(circle);
    });
  }

  function updateTimeline(index) {
    const data = state.environmental.timeline || [];
    if (!data.length) return;
    const point = data[Math.max(0, Math.min(data.length - 1, index))];
    $("#map-time").max = data.length - 1;
    $("#map-time").value = index;
    $("#compare-time").max = data.length - 1;
    $("#compare-time").value = index;
    $("#timeline-date").textContent = formatDate(point.date);
    $("#compare-aqi").textContent = point.aqi ?? "—";
    $("#compare-hcho").textContent = point.pm2_5 != null ? `${point.pm2_5} µg/m³` : point.hchoIndex ?? "—";
    $("#compare-wind").textContent = point.pm10 != null ? `${point.pm10} µg/m³` : point.windKmh != null ? `${point.windKmh} km/h` : "—";
    $("#predicted-aqi").textContent = point.aqi ?? "—";
    if (!state.demoEnabled && state.liveAir) {
      $("#live-aqi").textContent = Math.round(point.aqi);
      const category = usAqiCategory(point.aqi);
      $("#live-aqi").style.color = category.color;
      $("#live-aqi-category").textContent = `${category.name} · ${index === data.length - 1 ? "current model" : "model timeline"}`;
      $("#live-aqi-category").style.color = category.color;
      $("#live-aqi-source").textContent = `PM₂.₅ ${point.pm2_5} µg/m³ · PM₁₀ ${point.pm10} µg/m³`;
    }
    if (state.satelliteNo2Layer && state.map?.hasLayer(state.satelliteNo2Layer)) {
      updateSatelliteNo2Date(point.date?.slice(0, 10));
      $("#visible-layer-status").textContent = `Sentinel-5P TROPOMI NO₂ column · ${state.satelliteNo2Date} · NASA GIBS`;
    }
  }

  function updateSeason(key) {
    const season = state.environmental.seasonalComparison?.[key];
    if (!season) return;
    $$("[data-season]").forEach(button => button.classList.toggle("active", button.dataset.season === key));
    $("#season-readout").textContent = `${key[0].toUpperCase()}${key.slice(1)} scenario · AQI ${season.aqi} · HCHO index ${season.hchoIndex}`;
    showToast(`${key[0].toUpperCase()}${key.slice(1)} demonstration profile selected for map comparison.`);
    if (!state.demoEnabled) toggleDemo(true);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function buildReport(context = state.reportContext) {
    const generatedAt = new Date().toISOString();
    if (context?.kind === "hotspot") {
      const h = context.data;
      return {
        title: `AeroChem Hotspot Report — ${h.name}`,
        summary: `Demonstration hotspot scenario at ${h.name}. This is a model-demo report, not a current environmental observation or confirmed source attribution.`,
        generatedAt,
        status: "DEMO",
        facts: [
          { label: "Predicted AQI", value: `${h.aqi} · ${h.category} · DEMO` },
          { label: "HCHO", value: h.hcho },
          { label: "NO₂", value: h.no2 },
          { label: "Probable source", value: h.source },
          { label: "Coordinates", value: `${h.lat.toFixed(6)}, ${h.lng.toFixed(6)}` },
          { label: "Reliability", value: state.environmental.predicted?.reliability ?? "Unavailable" }
        ]
      };
    }
    if (context?.kind === "location") {
      const l = context.data;
      return {
        title: `AeroChem Location Report — ${l.name}`,
        summary: `${l.name} is a real mapped OpenStreetMap location. No AQI observation or model output is currently connected to this location.`,
        generatedAt,
        status: "REAL LOCATION · ENVIRONMENTAL DATA UNAVAILABLE",
        facts: [
          { label: "Location type", value: l.type },
          { label: "Coordinates", value: `${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}` },
          { label: "Map source", value: "OpenStreetMap" },
          { label: "Environmental data", value: "Not connected" },
          { label: "Source feature", value: l.osmUrl }
        ]
      };
    }
    const bestSensor = recommendedSensorCandidate();
    const feasibilityCosts = state.decisionModel.feasibility?.costAssumptionsInr || {};
    const oneSensorBudget = Object.values(feasibilityCosts).reduce((total, value) => total + (Number(value) || 0), 0);
    const intervention = state.decisionModel.interventions?.options?.find(item => item.id === state.activeIntervention);
    return {
      title: "AeroChem Sentinel — Malegaon Situation Report",
      summary: state.liveAir ? "The real geospatial basemap, a dated Sentinel-5P TROPOMI NO₂ column and a current CAMS global air-quality model feed are online. CAMS formaldehyde and nitrogen dioxide remain modeled near-surface context—not ground-sensor observations or Sentinel-5P column values; the HCHO satellite raster and local validation evidence remain unavailable." : "The real geospatial basemap and dated Sentinel-5P NO₂ layer are online. The live air-quality model is unavailable; demonstration outputs remain separately labelled.",
      generatedAt,
      status: "MIXED DATA AVAILABILITY",
      facts: [
        { label: "Region", value: state.config.region.name },
        { label: "Base geography", value: "OpenStreetMap · available" },
        { label: "Observed AQI", value: state.environmental.observed?.aqi ?? "Unavailable" },
        { label: "Predicted AQI", value: state.environmental.predicted?.aqi != null ? `${state.environmental.predicted.aqi} ${state.environmental.predicted.scale || "AQI"} · ${state.environmental.predicted.status === "live_model" ? "LIVE MODEL" : "DEMO"}` : "Unavailable" },
        { label: "Sentinel-5P NO₂ column", value: `NASA GIBS / TROPOMI · ${state.satelliteNo2Date || latestCompleteSatelliteDate()} · daily atmospheric column product` },
        { label: "Modeled HCHO / NO₂", value: state.liveAir ? `${state.liveAir.current.formaldehyde ?? "—"} / ${state.liveAir.current.nitrogen_dioxide ?? "—"} µg/m³ · CAMS near-surface model` : "Unavailable" },
        { label: "Current meteorology", value: state.liveWeather ? `${state.liveWeather.temperature_2m}°C · ${state.liveWeather.relative_humidity_2m}% RH · ${state.liveWeather.wind_speed_10m} km/h ${compassDirection(state.liveWeather.wind_direction_10m)}` : "Unavailable" },
        { label: "Satellite pollutant workflow", value: "NO₂ column connected via NASA GIBS · HCHO raster not connected" },
        { label: "RF / XGBoost model", value: "Design documented · trained artifact and validation metrics not connected" },
        { label: "Model reliability", value: state.environmental.predicted?.reliability ?? "Unavailable" },
        { label: "Recommended first sensor site", value: bestSensor ? `${bestSensor.name} · planning score ${bestSensor.score}/100` : "Planning model unavailable" },
        { label: "Sensitive sites within planning radius", value: Number.isFinite(state.sensitiveSiteCount) ? `${state.sensitiveSiteCount} mapped OSM sites` : "Live OSM count unavailable" },
        { label: "Intervention sandbox", value: intervention ? `${intervention.name} · illustrative scenario, not forecast` : "Unavailable" },
        { label: "One-sensor year-1 planning budget", value: `${formatInr(oneSensorBudget)} · editable assumption, not quote` },
        { label: "Pilot timeline", value: `${state.decisionModel.feasibility?.timelineWeeks || 12} weeks` }
      ]
    };
  }

  function reportHtml(report) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#18211e;font:14px Arial,sans-serif}.head{padding:28px;background:#18211e;color:white}.brand{color:#b9d767;font-size:11px;letter-spacing:2px}.head h1{margin:8px 0 0;font-size:28px}.content{padding:28px;border:1px solid #dce2dc;border-top:0}.status{display:inline-block;padding:6px 8px;border-radius:20px;background:#eef2e9;color:#0f7c65;font-size:10px;font-weight:bold}.summary{line-height:1.6;color:#4d5b55}table{width:100%;margin:22px 0;border-collapse:collapse}td{padding:11px;border-bottom:1px solid #dce2dc}td:first-child{width:34%;color:#63706a}.note{padding:12px;background:#f1f3ee;color:#63706a;font-size:11px;line-height:1.5}.footer{margin-top:24px;color:#8a938f;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="head"><div class="brand">AEROCHEM SENTINEL</div><h1>${escapeHtml(report.title)}</h1></div><div class="content"><span class="status">${escapeHtml(report.status)}</span><p class="summary">${escapeHtml(report.summary)}</p><table>${report.facts.map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.value)}</td></tr>`).join("")}</table><div class="note">Data transparency: values marked DEMO are illustrative. Probable sources are heuristic interpretations. This report is not an official AQI bulletin or medical advice.</div><div class="footer">Generated ${escapeHtml(formatDate(report.generatedAt))} · AeroChem Sentinel</div></div></body></html>`;
  }

  function downloadReport(context) {
    const report = buildReport(context);
    const blob = new Blob([reportHtml(report)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("One-page printable report downloaded.");
  }

  function addAssistantMessage(text, sender = "bot", sources = []) {
    const messages = $("#assistant-messages");
    const message = document.createElement("div");
    message.className = `assistant-message ${sender}`;
    if (sender === "bot") {
      const icon = document.createElement("span");
      icon.textContent = "✦";
      message.appendChild(icon);
    }
    const bubble = document.createElement("p");
    bubble.textContent = text;
    if (sources.length) {
      const sourceList = document.createElement("span");
      sourceList.className = "assistant-sources";
      sources.forEach(source => {
        if (!source?.url) return;
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title || "Source";
        sourceList.appendChild(link);
      });
      bubble.appendChild(sourceList);
    }
    message.appendChild(bubble);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function offerGmailDraft(recipient, report) {
    const body = [
      report.status,
      "",
      report.summary,
      "",
      ...report.facts.map(item => `${item.label}: ${item.value}`),
      "",
      `Generated: ${formatDate(report.generatedAt)}`,
      "Data note: modeled and demo values are labelled and are not ground-sensor observations."
    ].join("\n");
    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: recipient,
      su: report.title,
      body
    });
    const message = document.createElement("div");
    message.className = "assistant-message";
    message.innerHTML = `<span>✦</span><p>Automatic mail delivery is not configured on this host. Your complete report is ready as a Gmail draft.</p>`;
    const action = document.createElement("a");
    action.className = "assistant-action";
    action.href = `https://mail.google.com/mail/?${params.toString()}`;
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.textContent = "Open Gmail draft →";
    message.querySelector("p").append(document.createElement("br"), action);
    const messages = $("#assistant-messages");
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  async function loadMailServiceStatus() {
    try {
      const response = await fetch(state.config.reportStatusEndpoint, { cache: "no-store" });
      if (!response.ok) return;
      state.mailService = await response.json();
    } catch {
      state.mailService = { configured: false, recipient: "" };
    }
    const input = $("#report-email");
    const label = $("#report-email-label");
    const note = $("#email-service-note");
    const button = $("#send-email-report");
    if (state.mailService.configured) {
      input.hidden = true;
      label.textContent = `Automatic recipient · ${state.mailService.recipient}`;
      note.textContent = "Secure automatic delivery is ready. The formatted report and one-page attachment will be sent immediately.";
      button.textContent = "Send formatted report now";
    }
  }

  async function loadAiServiceStatus() {
    try {
      const response = await fetch(state.config.chatStatusEndpoint, { cache: "no-store" });
      if (!response.ok) return;
      state.aiService = await response.json();
    } catch {
      state.aiService = { configured: false, model: "local evidence mode" };
    }
    const status = $("#assistant-ai-status");
    const subtitle = $("#assistant-subtitle");
    if (state.aiService.configured) {
      status.textContent = "GENERAL AI ONLINE";
      status.classList.add("online");
      subtitle.textContent = `${state.aiService.model} · web-aware`;
    } else {
      status.textContent = "PROJECT MODE";
      subtitle.textContent = "Configure general AI with setup-ai.ps1";
    }
  }

  function assistantContext() {
    const point = state.environmental.timeline?.[Number($("#map-time")?.value)] || null;
    const bestSensor = recommendedSensorCandidate();
    const activeAction = state.decisionModel.interventions?.options?.find(item => item.id === state.activeIntervention);
    return {
      region: state.config.region.name,
      language: state.language,
      visibleBasemap: $("[data-base].active")?.dataset.base || "satellite",
      liveModelAqi: state.liveAir?.current?.us_aqi ?? null,
      liveModelHchoUgM3: state.liveAir?.current?.formaldehyde ?? null,
      liveModelNo2UgM3: state.liveAir?.current?.nitrogen_dioxide ?? null,
      sentinelNo2Column: { source: "NASA GIBS / Sentinel-5P TROPOMI", date: state.satelliteNo2Date || latestCompleteSatelliteDate(), visible: Boolean(state.satelliteNo2Layer && state.map?.hasLayer(state.satelliteNo2Layer)), meaning: "daily tropospheric column, not ground-level concentration" },
      liveModelTime: state.liveAir?.current?.time ?? null,
      selectedLocation: state.selectedLocation ? { name: state.selectedLocation.name, type: state.selectedLocation.type, lat: state.selectedLocation.lat, lng: state.selectedLocation.lng } : null,
      selectedHotspot: state.selectedHotspot ? { name: state.selectedHotspot.name, status: "demo" } : null,
      timelinePoint: point ? { date: point.date, aqi: point.aqi, pm2_5: point.pm2_5, pm10: point.pm10 } : null,
      recommendedSensor: bestSensor ? { name: bestSensor.name, score: bestSensor.score, status: "planning heuristic" } : null,
      activeIntervention: activeAction ? { name: activeAction.name, status: "illustrative planning scenario" } : null,
      currentWeather: state.liveWeather ? { temperatureC: state.liveWeather.temperature_2m, humidityPct: state.liveWeather.relative_humidity_2m, windKmh: state.liveWeather.wind_speed_10m, windDirectionDeg: state.liveWeather.wind_direction_10m } : null,
      projectPipeline: state.decisionModel.projectBlueprint?.modelPlan || null,
      evidenceWarning: "A dated Sentinel-5P TROPOMI NO₂ column layer is connected through NASA GIBS. CAMS values remain modeled near-surface estimates; no verified ground sensor, HCHO satellite raster, or trained RF/XGBoost artifact is connected."
    };
  }

  async function askGeneralAi(prompt) {
    const pending = addAssistantMessage("Thinking and checking the available evidence…");
    pending.classList.add("thinking");
    try {
      const response = await fetch(state.config.chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, messages: state.chatHistory.slice(-10), context: assistantContext() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `AI service ${response.status}`);
      pending.remove();
      addAssistantMessage(result.answer, "bot", result.sources || []);
      state.chatHistory.push({ role: "user", content: prompt }, { role: "assistant", content: result.answer });
      state.chatHistory = state.chatHistory.slice(-12);
    } catch (error) {
      pending.remove();
      addAssistantMessage(`${error.message}. Run setup-ai.ps1 once to enable typo-tolerant, general web-aware answers. Project reports and map evidence remain available without an API key.`);
    }
  }

  function openAssistant(showEmail = false) {
    setMobileLayerMenu(false);
    if (window.matchMedia("(max-width: 900px)").matches) $("#inspector").classList.remove("open");
    $("#assistant-panel").classList.add("open");
    if (showEmail) $("#email-composer").hidden = false;
  }

  function editDistance(first, second) {
    const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let row = 1; row <= first.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= second.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[second.length];
  }

  function resemblesAny(tokens, targets) {
    return tokens.some(token => targets.some(target => {
      if (token === target) return true;
      const tolerance = target.length >= 5 ? 2 : 1;
      return Math.abs(token.length - target.length) <= tolerance && editDistance(token, target) <= tolerance;
    }));
  }

  function detectAssistantIntent(prompt) {
    const tokens = prompt.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim().split(/\s+/).filter(Boolean);
    const wantsEmail = resemblesAny(tokens, ["email", "gmail", "mail"]);
    const wantsReport = resemblesAny(tokens, ["report", "reporte"]);
    const commandToken = tokens.find(token => !["please", "kindly", "can", "could", "would", "you"].includes(token));
    const wantsSend = Boolean(commandToken) && resemblesAny([commandToken], ["send", "forward", "deliver"]);
    if ((wantsEmail && (wantsReport || wantsSend)) || (wantsEmail && tokens.length <= 3)) {
      return { name: "email", autoSend: wantsSend && state.mailService.configured };
    }
    if (wantsReport || resemblesAny(tokens, ["download"])) return { name: "report", autoSend: false };
    if (resemblesAny(tokens, ["summary", "summarize", "summarise"])) return { name: "summary", autoSend: false };
    if (resemblesAny(tokens, ["sensor", "monitor", "station", "siting"])) return { name: "sensor", autoSend: false };
    if (resemblesAny(tokens, ["hcho", "formaldehyde", "chemical", "ozone", "voc"])) return { name: "domain", autoSend: false };
    if (resemblesAny(tokens, ["pipeline", "random", "forest", "xgboost", "model", "training", "weather"])) return { name: "pipeline", autoSend: false };
    if (resemblesAny(tokens, ["simulation", "intervention", "reduction", "traffic", "industry", "burning"])) return { name: "simulation", autoSend: false };
    if (resemblesAny(tokens, ["cost", "budget", "feasibility", "impact", "pilot"])) return { name: "feasibility", autoSend: false };
    if (resemblesAny(tokens, ["confidence", "accuracy", "reliability"])) return { name: "confidence", autoSend: false };
    if (resemblesAny(tokens, ["map", "location", "satellite"])) return { name: "map", autoSend: false };
    return { name: "general", autoSend: false };
  }

  async function handleAssistantPrompt(prompt) {
    const intent = detectAssistantIntent(prompt);
    addAssistantMessage(prompt, "user");
    if (intent.name === "email") {
      const report = buildReport();
      if (intent.autoSend) {
        addAssistantMessage(`I understood your email request despite the spelling. Sending “${report.title}” now to ${state.mailService.recipient}…`);
        await sendEmailReport();
        return;
      }
      addAssistantMessage(state.mailService.configured
        ? `I prepared “${report.title}”. Click Send below and it will go immediately to ${state.mailService.recipient}.`
        : `I prepared “${report.title}”. Automatic Gmail delivery needs the one-time secure server setup.`);
      $("#email-composer").hidden = false;
    } else if (intent.name === "report") {
      const report = buildReport();
      addAssistantMessage(`The one-page report is ready: ${report.title}. I am downloading a printable copy now.`);
      downloadReport();
    } else if (intent.name === "summary") {
      addAssistantMessage(buildReport().summary);
    } else if (intent.name === "sensor") {
      const best = recommendedSensorCandidate();
      setMode("situation");
      showSensorRecommendation();
      addAssistantMessage(best ? `${best.name} is the recommended first sensor site with a planning score of ${best.score}/100. This is a transparent siting heuristic, not an installed or observed station.` : "The sensor-siting model is unavailable.");
    } else if (intent.name === "simulation") {
      setMode("trends");
      updateInterventionSimulation();
      addAssistantMessage("The pollution-reduction sandbox is open. Its changes are adjustable planning assumptions applied to the current modeled PM₂.₅ value—not a forecast.");
    } else if (intent.name === "feasibility") {
      setMode("method");
      addAssistantMessage(`The field-pilot plan is open: ${state.decisionModel.feasibility?.timelineWeeks || 12} weeks with an adjustable cost model and explicitly labelled community-impact targets.`);
    } else if (intent.name === "domain") {
      setMode("situation");
      addAssistantMessage("The team documents make HCHO the project differentiator: a Sentinel-5P column-density signal for investigating VOC-related industrial patterns. No live HCHO raster is connected yet, so the dashboard does not claim a measured Malegaon HCHO hotspot.");
    } else if (intent.name === "pipeline") {
      setMode("method");
      addAssistantMessage("The documented pipeline is Sentinel-5P HCHO/NO₂ + meteorology + a verified ground reference → aligned data fusion → Random Forest/XGBoost → MAE, RMSE and R² validation → dashboard. A real dated Sentinel-5P NO₂ column and live meteorology are connected; the HCHO raster, ground dataset, trained model and validation metrics remain pilot work.");
    } else if (state.aiService.configured) {
      await askGeneralAi(prompt);
    } else if (intent.name === "confidence") {
      addAssistantMessage("Model confidence, MAE, RMSE and R² are unavailable. AeroChem Sentinel deliberately does not invent these values.");
    } else if (intent.name === "map") {
      addAssistantMessage("The default map is real Esri satellite imagery with real OpenStreetMap locations. CAMS AQI is a live atmospheric model estimate, not a ground sensor reading.");
    } else {
      addAssistantMessage("General AI is not configured on this server yet. Run setup-ai.ps1 once; then I can understand spelling mistakes and answer questions beyond this project. I can still create reports, email them, and explain the current map evidence now.");
    }
  }

  async function sendEmailReport() {
    const recipient = state.mailService.configured ? "" : $("#report-email").value.trim();
    if (!state.mailService.configured && (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))) {
      addAssistantMessage("Enter a valid Gmail recipient address.");
      return;
    }
    const report = buildReport();
    if (location.hostname.endsWith("github.io")) {
      offerGmailDraft(recipient, report);
      return;
    }
    const button = $("#send-email-report");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch(state.config.reportEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, report })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Mail service ${response.status}`);
      addAssistantMessage(`Report sent successfully to ${result.recipient || recipient}.`);
      $("#email-composer").hidden = true;
    } catch (error) {
      addAssistantMessage(`${error.message}. Automatic delivery is unavailable on this server. Run setup-gmail.ps1 once; credentials must never be added to browser code.`);
    } finally {
      button.disabled = false;
      button.textContent = state.mailService.configured ? "Send formatted report now" : "Send secure report";
    }
  }

  function setLanguage(language) {
    state.language = language;
    const dictionary = translations[language];
    $$('[data-i18n]').forEach(element => {
      const key = element.dataset.i18n;
      if (dictionary[key]) element.textContent = dictionary[key];
    });
    $("#location-query").placeholder = dictionary.searchPlaceholder;
    $("#language-button").textContent = language === "en" ? "EN / मराठी" : "मराठी / EN";
    updateConnectivity(false);
    if (!state.demoEnabled) $("#demo-button strong").textContent = dictionary.demoButton;
    showToast(language === "mr" ? "मराठी इंटरफेस सक्रिय केला." : "English interface enabled.");
    if (state.currentMode === "investigate" && state.categoryData[state.activeCategory]) renderLocationList(state.categoryData[state.activeCategory], state.activeCategory);
  }

  function renderPresentation() {
    const step = presentationSteps[state.presentationIndex];
    $("#presentation-step").textContent = `${String(state.presentationIndex + 1).padStart(2, "0")} / ${String(presentationSteps.length).padStart(2, "0")}`;
    $("#presentation-title").textContent = step[1];
    $("#presentation-copy").textContent = step[2];
    $("#presentation-next").textContent = state.presentationIndex === presentationSteps.length - 1 ? "Finish" : "Next →";
    setMode(step[0]);
    if (state.presentationIndex === 0) {
      $("#situation-panel").scrollTop = $(".domain-brief").offsetTop - 10;
    }
    if (state.presentationIndex === 1) {
      $("#situation-panel").scrollTop = 0;
      setSatelliteNo2Visible(true);
    }
    if (state.presentationIndex === 2) {
      showSensorRecommendation();
      $("#situation-panel").scrollTop = $(".sensor-decision").offsetTop - 10;
    }
    if (state.presentationIndex === 3) {
      updateInterventionSimulation();
      $("#trends-panel").scrollTop = 0;
    }
    if (state.presentationIndex === 4) {
      $("#method-panel").scrollTop = $(".blueprint-module").offsetTop - 10;
    }
  }

  function setPresentationActive(active) {
    document.body.classList.toggle("presentation-active", active);
    $("#presentation-bar").hidden = !active;
    $("#present-button").classList.toggle("active", active);
    if (active) $("#assistant-panel").classList.remove("open");
  }

  function startJudgePitch() {
    if ($("#judge-dialog").open) $("#judge-dialog").close();
    state.presentationIndex = 0;
    setPresentationActive(true);
    renderPresentation();
  }

  function updateConnectivity(announce = false) {
    const online = navigator.onLine;
    document.body.classList.toggle("is-offline", !online);
    $("#connection-label").textContent = online
      ? translations[state.language].mapOnline
      : (state.language === "mr" ? "ऑफलाइन डेमो तयार" : "OFFLINE DEMO READY");
    if (announce) showToast(online ? "Connection restored. Live services are available again." : "Connection lost. The cached dashboard and labelled backup scenario remain available.", 5200);
  }

  function registerOfflineShell() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("service-worker.js").catch(error => console.warn("Offline shell unavailable", error));
  }

  async function sharePublicApp() {
    const publicUrl = state.config.publicUrl || "https://sumitpawar2006.github.io/aerochem-sentinel/";
    const button = $("#share-button");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else {
        const helper = document.createElement("textarea");
        helper.value = publicUrl;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      button.innerHTML = "<span>✓</span> Copied";
      showToast("Public team link copied — it works without localhost.");
      setTimeout(() => { button.innerHTML = "<span>↗</span> Share"; }, 1800);
    } catch (error) {
      console.warn("Could not copy public link", error);
      showToast(publicUrl, 6500);
    }
  }

  function csvRecordCount(text) {
    return String(text || "").split(/\r?\n/).slice(1).filter(row => row.trim() && row.split(",").some(value => value.trim())).length;
  }

  function updatePilotEvidenceStatus() {
    const complete = Object.values(state.pilotEvidence).filter(Boolean).length;
    $("#pilot-evidence-summary").textContent = `${complete} / 3 optional evidence packs complete`;
    $("#pilot-evidence-bar").style.width = `${(complete / 3) * 100}%`;
  }

  async function inspectCsvEvidence(input, kind) {
    const file = input.files?.[0];
    const status = kind === "community" ? $("#community-evidence-state") : $("#validation-evidence-state");
    if (!file) {
      state.pilotEvidence[kind] = false;
      status.textContent = "Template ready · no records loaded";
      updatePilotEvidenceStatus();
      return;
    }
    try {
      const text = await file.text();
      const header = text.split(/\r?\n/, 1)[0].toLowerCase();
      const expected = kind === "community" ? ["interview_id", "anonymous_consent"] : ["timestamp_ist", "reference_pm25_ugm3"];
      if (!expected.every(name => header.includes(name))) throw new Error("Template columns do not match");
      const count = csvRecordCount(text);
      const target = kind === "community" ? 5 : 10;
      state.pilotEvidence[kind] = count >= target;
      status.textContent = `${count} record${count === 1 ? "" : "s"} checked · ${count >= target ? "evidence pack complete" : `${target - count} more needed`}`;
      showToast(`${kind === "community" ? "Community" : "Validation"} evidence checked locally: ${count} records.`, 4200);
    } catch (error) {
      state.pilotEvidence[kind] = false;
      status.textContent = "Could not verify this file · use the supplied CSV template";
      showToast("Evidence file columns do not match the supplied template.", 4600);
    }
    updatePilotEvidenceStatus();
  }

  function inspectPartnerEvidence(input) {
    const file = input.files?.[0];
    state.pilotEvidence.partner = Boolean(file);
    $("#partner-evidence-state").textContent = file ? `${file.name} · document selected` : "Template ready · no document loaded";
    updatePilotEvidenceStatus();
    if (file) showToast("Partner evidence selected locally. It has not been uploaded.", 4200);
  }

  function bindEvents() {
    $$("[data-base]").forEach(button => button.addEventListener("click", () => switchBase(button.dataset.base)));
    $$("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    $$("[data-category]").forEach(button => button.addEventListener("click", () => loadCategory(button.dataset.category, { fit: true })));
    $$("[data-layer]").forEach(button => button.addEventListener("click", () => {
      const layer = button.dataset.layer;
      if (categoryDefinitions[layer]) { setMode("investigate"); loadCategory(layer, { fit: true }); }
      else if (layer === "satellite-no2") toggleSatelliteNo2(button);
      else if (layer === "boundary") toggleBoundary(button);
      else if (layer === "coverage") toggleCoverage(button);
      else if (layer === "sensor") toggleSensorLayer(button);
      else if (layer === "demo") toggleDemo();
      if (window.matchMedia("(max-width: 900px)").matches) setMobileLayerMenu(false);
    }));
    $("#mobile-layer-toggle").addEventListener("click", () => setMobileLayerMenu(!$(".layer-dock").classList.contains("mobile-open")));
    $("#mobile-layer-backdrop").addEventListener("click", () => setMobileLayerMenu(false));
    $$("[data-enable-layer]").forEach(button => button.addEventListener("click", () => {
      const layerButton = $(`[data-layer="${button.dataset.enableLayer}"]`);
      if (layerButton) layerButton.click();
    }));

    $("#map-search").addEventListener("submit", event => {
      event.preventDefault();
      const query = $("#location-query").value.trim();
      if (query.length > 1) searchLocations(query);
    });
    $("#location-query").addEventListener("input", event => suggestNearbyCities(event.target.value));
    $("#demo-button").addEventListener("click", () => toggleDemo());
    $("#inspector-close").addEventListener("click", () => $("#inspector").classList.remove("open"));
    $("#detail-back").addEventListener("click", () => setMode("investigate"));
    $("#hotspot-back").addEventListener("click", () => setMode("investigate"));
    $("#mobile-menu").addEventListener("click", () => {
      const open = $(".mode-nav").classList.toggle("open");
      $("#mobile-menu").setAttribute("aria-expanded", String(open));
    });
    $("#region-button").addEventListener("click", () => { state.map.flyTo(state.config.region.center, state.config.region.zoom, { duration: .7 }); showToast("Malegaon is the only data-enabled region in this build."); });
    $("#share-button").addEventListener("click", sharePublicApp);
    $("#judge-kit-button").addEventListener("click", () => $("#judge-dialog").showModal());
    $("#judge-dialog-close").addEventListener("click", () => $("#judge-dialog").close());
    $("#judge-copy-link").addEventListener("click", sharePublicApp);
    $("#judge-start-pitch").addEventListener("click", startJudgePitch);
    $("#judge-backup-demo").addEventListener("click", () => {
      $("#judge-dialog").close();
      toggleDemo(true);
      $("#inspector").classList.remove("open");
      showToast("Backup scenario is running and clearly labelled MODEL DEMO.", 5000);
    });
    $("#judge-dialog").addEventListener("click", event => { if (event.target === $("#judge-dialog")) $("#judge-dialog").close(); });
    window.addEventListener("online", () => updateConnectivity(true));
    window.addEventListener("offline", () => updateConnectivity(true));

    $("#map-time").addEventListener("input", event => updateTimeline(Number(event.target.value)));
    $("#compare-time").addEventListener("input", event => updateTimeline(Number(event.target.value)));
    $("#timeline-play").addEventListener("click", () => {
      if (state.timelineTimer) {
        clearInterval(state.timelineTimer); state.timelineTimer = null; $("#timeline-play").textContent = "▶"; return;
      }
      const data = state.environmental.timeline || [];
      if (!data.length) return;
      if (!state.liveAir && !state.demoEnabled) toggleDemo(true);
      let index = Number($("#map-time").value);
      if (index >= data.length - 1) index = -1;
      $("#timeline-play").textContent = "Ⅱ";
      state.timelineTimer = setInterval(() => {
        index += 1; updateTimeline(index);
        if (index >= data.length - 1) { clearInterval(state.timelineTimer); state.timelineTimer = null; $("#timeline-play").textContent = "▶"; }
      }, 1000);
    });
    $$("[data-compare-state]").forEach(button => button.addEventListener("click", () => {
      $$("[data-compare-state]").forEach(item => item.classList.toggle("active", item === button));
      const index = button.dataset.compareState === "before" ? 0 : Number($("#map-time").value);
      updateTimeline(index);
      if (!state.liveAir && !state.demoEnabled) toggleDemo(true);
    }));
    $$("[data-season]").forEach(button => button.addEventListener("click", () => updateSeason(button.dataset.season)));
    $$("[data-intervention]").forEach(button => button.addEventListener("click", () => {
      state.activeIntervention = button.dataset.intervention;
      updateInterventionSimulation();
      if (state.simulationLayer && state.map.hasLayer(state.simulationLayer)) {
        state.map.removeLayer(state.simulationLayer);
        state.simulationLayer = null;
      }
    }));
    $("#intervention-strength").addEventListener("input", updateInterventionSimulation);
    $("#show-simulation-map").addEventListener("click", showSimulationArea);
    $("#pilot-sensor-count").addEventListener("input", updateFeasibility);
    $("#community-evidence-file").addEventListener("change", event => inspectCsvEvidence(event.target, "community"));
    $("#validation-evidence-file").addEventListener("change", event => inspectCsvEvidence(event.target, "validation"));
    $("#partner-evidence-file").addEventListener("change", event => inspectPartnerEvidence(event.target));
    $("#show-sensor-site").addEventListener("click", () => showSensorRecommendation());
    $("#compare-sensor-sites").addEventListener("click", () => {
      const list = $("#sensor-candidates");
      list.hidden = !list.hidden;
      $("#compare-sensor-sites").textContent = list.hidden ? "Compare candidates" : "Hide comparison";
      showSensorRecommendation(undefined, !list.hidden);
    });
    $$("[data-sensor-candidate]").forEach(button => button.addEventListener("click", () => showSensorRecommendation(button.dataset.sensorCandidate)));

    $$("[data-step]").forEach(button => button.addEventListener("click", () => {
      $$("[data-step]").forEach(item => item.classList.toggle("active", item === button));
      const content = methodExplanations[Number(button.dataset.step)];
      $("#method-explanation").innerHTML = `<strong>${content[0]}</strong><p>${content[1]}</p>`;
    }));
    $("#show-contract").addEventListener("click", () => $("#contract-dialog").showModal());
    $("#contract-close").addEventListener("click", () => $("#contract-dialog").close());

    $("#download-report").addEventListener("click", () => downloadReport({ kind: "location", data: state.selectedLocation }));
    $("#download-hotspot-report").addEventListener("click", () => downloadReport({ kind: "hotspot", data: state.selectedHotspot }));
    $("#email-location-report").addEventListener("click", () => { state.reportContext = { kind: "location", data: state.selectedLocation }; openAssistant(true); });
    $("#email-hotspot-report").addEventListener("click", () => { state.reportContext = { kind: "hotspot", data: state.selectedHotspot }; openAssistant(true); });

    $("#assistant-launcher").addEventListener("click", () => openAssistant());
    $("#assistant-close").addEventListener("click", () => $("#assistant-panel").classList.remove("open"));
    $$("[data-prompt]").forEach(button => button.addEventListener("click", () => handleAssistantPrompt(button.dataset.prompt)));
    $("#assistant-form").addEventListener("submit", event => { event.preventDefault(); const input = $("#assistant-input"); const message = input.value.trim(); if (message) { handleAssistantPrompt(message); input.value = ""; } });
    $("#send-email-report").addEventListener("click", sendEmailReport);

    $("#language-button").addEventListener("click", () => setLanguage(state.language === "en" ? "mr" : "en"));
    $("#present-button").addEventListener("click", startJudgePitch);
    $("#presentation-close").addEventListener("click", () => setPresentationActive(false));
    $("#presentation-prev").addEventListener("click", () => { state.presentationIndex = Math.max(0, state.presentationIndex - 1); renderPresentation(); });
    $("#presentation-next").addEventListener("click", () => { if (state.presentationIndex < presentationSteps.length - 1) { state.presentationIndex += 1; renderPresentation(); } else setPresentationActive(false); });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { $("#search-results").classList.remove("open"); $("#assistant-panel").classList.remove("open"); setMobileLayerMenu(false); setPresentationActive(false); }
    });
  }

  async function init() {
    state.config = await fetchJson("data/app-config.json", fallbackConfig);
    state.environmental = await fetchJson(state.config.environmentalDataUrl, fallbackEnvironmentalData);
    state.decisionModel = await fetchJson(state.config.decisionModelUrl, fallbackDecisionModel);
    const nearbyData = await fetchJson(state.config.nearbyCitiesUrl, { cities: [] });
    state.nearbyCities = nearbyData.cities || [];
    initMap();
    renderDecisionUi();
    bindEvents();
    updateConnectivity(false);
    registerOfflineShell();
    if (window.matchMedia("(min-width: 901px)").matches) $("#inspector").classList.add("open");
    await Promise.all([loadLiveAirQuality(), loadLiveWeather(), loadMailServiceStatus(), loadAiServiceStatus()]);
    updateEnvironmentalUi();
    state.reportContext = null;
    await loadCategory("places");
    loadSensitiveSiteEvidence();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
