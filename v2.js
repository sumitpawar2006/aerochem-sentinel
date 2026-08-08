(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const svgNS = "http://www.w3.org/2000/svg";

  const fallbackConfig = {
    region: {
      name: "Malegaon, Nashik, Maharashtra",
      center: [20.5576062, 74.5246514],
      zoom: 13,
      searchViewbox: [74.3091148, 20.8349688, 74.8127559, 20.3442422],
      osmBoundaryRelation: 10345577
    },
    environmentalDataUrl: "data/environmental-snapshot.json",
    reportEndpoint: "/api/report",
    reportStatusEndpoint: "/api/report/status"
  };

  const fallbackEnvironmentalData = {
    metadata: { status: "unavailable", scenarioDate: null, label: "Environmental dataset unavailable" },
    observed: { aqi: null, stations: [] },
    predicted: { aqi: null, confidenceInterval: null, reliability: null },
    modelEvaluation: { mae: null, rmse: null, r2: null },
    timeline: [], seasonalComparison: {}, hotspots: []
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
      searchPlaceholder: "Search a neighbourhood, road or place in Malegaon",
      demoButton: "Run demo scenario",
      mapOnline: "MAP ONLINE"
    },
    mr: {
      navSituation: "स्थिती", navInvestigate: "तपासा", navTrends: "कल", navMethod: "पद्धत",
      searchPlaceholder: "मालेगावमधील परिसर, रस्ता किंवा ठिकाण शोधा",
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
    ["situation", "Situation first", "Real geography stays separate from unavailable environmental evidence."],
    ["investigate", "Investigate every mapped place", "Search and inspect real OSM locations without assigning fabricated AQI."],
    ["trends", "Compare through time", "The permanent timeline and seasonal profiles demonstrate how connected outputs will behave."],
    ["method", "Finish with accountable AI", "The workflow exposes its evidence, missing metrics and integration contract."]
  ];

  const state = {
    config: fallbackConfig,
    environmental: fallbackEnvironmentalData,
    map: null,
    baseLayers: {},
    currentBase: null,
    categoryLayers: {},
    categoryData: {},
    activeCategory: "places",
    boundaryLayer: null,
    coverageLayer: null,
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
    mailService: { configured: false, recipient: "" }
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
      current: "us_aqi,pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide",
      hourly: "us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone",
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
    state.currentBase = streets.addTo(state.map);

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

  function overpassQueryFor(category) {
    const definition = categoryDefinitions[category];
    return `[out:json][timeout:30];${definition.query(state.config.region.center)}out center tags;`;
  }

  async function queryOverpass(category) {
    const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
    const query = overpassQueryFor(category);
    let lastError;
    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        try { controller.abort(); } catch { /* Navigation can dispose the request first. */ }
      }, 32000);
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

  async function searchLocations(query) {
    const results = $("#search-results");
    results.classList.add("open");
    results.innerHTML = '<p class="search-message">Searching OpenStreetMap…</p>';
    const viewbox = state.config.region.searchViewbox.join(",");
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&bounded=1&viewbox=${viewbox}&accept-language=${state.language === "mr" ? "mr,en" : "en"}&q=${encodeURIComponent(`${query}, Malegaon, Maharashtra, India`)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Search ${response.status}`);
      const items = await response.json();
      if (!items.length) {
        results.innerHTML = '<p class="search-message">No matching mapped location was found inside the Malegaon region.</p>';
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

  function setMode(mode) {
    if (!modeTitles[mode]) return;
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
    if (mode === "trends" && !state.liveAir) showToast("The live timeline is unavailable; seasonal and fallback values are clearly labelled demo.", 3800);
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
  }

  function updateSeason(key) {
    const season = state.environmental.seasonalComparison?.[key];
    if (!season) return;
    $$("[data-season]").forEach(button => button.classList.toggle("active", button.dataset.season === key));
    $("#season-readout").textContent = `${key[0].toUpperCase()}${key.slice(1)} · AQI ${season.aqi} · HCHO index ${season.hchoIndex}`;
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
    return {
      title: "AeroChem Sentinel — Malegaon Situation Report",
      summary: state.liveAir ? "The real geospatial basemap and a current CAMS global air-quality model feed are online. This is modeled atmospheric data, not a ground-sensor observation; reliability and satellite pollutant rasters remain unavailable." : "The real geospatial basemap is online. The live air-quality model is unavailable; demonstration outputs remain separately labelled.",
      generatedAt,
      status: "MIXED DATA AVAILABILITY",
      facts: [
        { label: "Region", value: state.config.region.name },
        { label: "Base geography", value: "OpenStreetMap · available" },
        { label: "Observed AQI", value: state.environmental.observed?.aqi ?? "Unavailable" },
        { label: "Predicted AQI", value: state.environmental.predicted?.aqi != null ? `${state.environmental.predicted.aqi} ${state.environmental.predicted.scale || "AQI"} · ${state.environmental.predicted.status === "live_model" ? "LIVE MODEL" : "DEMO"}` : "Unavailable" },
        { label: "Model reliability", value: state.environmental.predicted?.reliability ?? "Unavailable" }
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

  function addAssistantMessage(text, sender = "bot") {
    const messages = $("#assistant-messages");
    const message = document.createElement("div");
    message.className = `assistant-message ${sender}`;
    message.innerHTML = sender === "bot" ? `<span>✦</span><p>${escapeHtml(text)}</p>` : `<p>${escapeHtml(text)}</p>`;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
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

  function openAssistant(showEmail = false) {
    $("#assistant-panel").classList.add("open");
    if (showEmail) $("#email-composer").hidden = false;
  }

  function handleAssistantPrompt(prompt) {
    const normalized = prompt.toLowerCase();
    addAssistantMessage(prompt, "user");
    if (normalized.includes("email") || normalized.includes("gmail") || normalized === "email") {
      const report = buildReport();
      addAssistantMessage(`I prepared “${report.title}”. Enter the server-authorized Gmail address below to send it securely.`);
      $("#email-composer").hidden = false;
    } else if (normalized.includes("report") || normalized === "report") {
      const report = buildReport();
      addAssistantMessage(`The one-page report is ready: ${report.title}. I am downloading a printable copy now.`);
      downloadReport();
    } else if (normalized.includes("confidence") || normalized.includes("accuracy")) {
      addAssistantMessage("Model confidence, MAE, RMSE and R² are unavailable. AeroChem Sentinel deliberately does not invent these values.");
    } else if (normalized.includes("map") || normalized.includes("location")) {
      addAssistantMessage("The base geography, search results, locations and category layers come from OpenStreetMap. Environmental outputs remain a separate demo layer.");
    } else {
      const report = buildReport();
      addAssistantMessage(report.summary);
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
      if ([404, 501, 503].includes(response.status)) {
        offerGmailDraft(recipient, report);
        return;
      }
      if (!response.ok) throw new Error(result.error || `Mail service ${response.status}`);
      addAssistantMessage(`Report sent successfully to ${result.recipient || recipient}.`);
      $("#email-composer").hidden = true;
    } catch (error) {
      addAssistantMessage(`${error.message}. Start server.py with the Gmail environment variables configured; credentials must never be added to browser code.`);
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
    if (!state.demoEnabled) $("#demo-button strong").textContent = dictionary.demoButton;
    showToast(language === "mr" ? "मराठी इंटरफेस सक्रिय केला." : "English interface enabled.");
    if (state.currentMode === "investigate" && state.categoryData[state.activeCategory]) renderLocationList(state.categoryData[state.activeCategory], state.activeCategory);
  }

  function renderPresentation() {
    const step = presentationSteps[state.presentationIndex];
    $("#presentation-step").textContent = `${String(state.presentationIndex + 1).padStart(2, "0")} / 04`;
    $("#presentation-title").textContent = step[1];
    $("#presentation-copy").textContent = step[2];
    setMode(step[0]);
    if (step[0] === "investigate") loadCategory("places", { fit: false });
    if (step[0] === "trends" && !state.liveAir && !state.demoEnabled) toggleDemo(true);
  }

  function bindEvents() {
    $$("[data-base]").forEach(button => button.addEventListener("click", () => switchBase(button.dataset.base)));
    $$("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    $$("[data-category]").forEach(button => button.addEventListener("click", () => loadCategory(button.dataset.category, { fit: true })));
    $$("[data-layer]").forEach(button => button.addEventListener("click", () => {
      const layer = button.dataset.layer;
      if (categoryDefinitions[layer]) { setMode("investigate"); loadCategory(layer, { fit: true }); }
      else if (layer === "boundary") toggleBoundary(button);
      else if (layer === "coverage") toggleCoverage(button);
      else if (layer === "demo") toggleDemo();
    }));
    $$("[data-enable-layer]").forEach(button => button.addEventListener("click", () => {
      const layerButton = $(`[data-layer="${button.dataset.enableLayer}"]`);
      if (layerButton) layerButton.click();
    }));

    $("#map-search").addEventListener("submit", event => {
      event.preventDefault();
      const query = $("#location-query").value.trim();
      if (query.length > 1) searchLocations(query);
    });
    $("#location-query").addEventListener("input", () => { if (!$("#location-query").value.trim()) $("#search-results").classList.remove("open"); });
    $("#demo-button").addEventListener("click", () => toggleDemo());
    $("#inspector-close").addEventListener("click", () => $("#inspector").classList.remove("open"));
    $("#detail-back").addEventListener("click", () => setMode("investigate"));
    $("#hotspot-back").addEventListener("click", () => setMode("investigate"));
    $("#mobile-menu").addEventListener("click", () => {
      const open = $(".mode-nav").classList.toggle("open");
      $("#mobile-menu").setAttribute("aria-expanded", String(open));
    });
    $("#region-button").addEventListener("click", () => { state.map.flyTo(state.config.region.center, state.config.region.zoom, { duration: .7 }); showToast("Malegaon is the only data-enabled region in this build."); });

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
    $("#present-button").addEventListener("click", () => { state.presentationIndex = 0; $("#presentation-bar").hidden = false; renderPresentation(); });
    $("#presentation-close").addEventListener("click", () => $("#presentation-bar").hidden = true);
    $("#presentation-prev").addEventListener("click", () => { state.presentationIndex = Math.max(0, state.presentationIndex - 1); renderPresentation(); });
    $("#presentation-next").addEventListener("click", () => { if (state.presentationIndex < presentationSteps.length - 1) { state.presentationIndex += 1; renderPresentation(); } else $("#presentation-bar").hidden = true; });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { $("#search-results").classList.remove("open"); $("#assistant-panel").classList.remove("open"); $("#presentation-bar").hidden = true; }
    });
  }

  async function init() {
    state.config = await fetchJson("data/app-config.json", fallbackConfig);
    state.environmental = await fetchJson(state.config.environmentalDataUrl, fallbackEnvironmentalData);
    initMap();
    bindEvents();
    await Promise.all([loadLiveAirQuality(), loadMailServiceStatus()]);
    updateEnvironmentalUi();
    state.reportContext = null;
    loadCategory("places");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
