const HELP = {
  area: {
    name: "Available area (m²)",
    desc: "Total available ground area for the agrivoltaic layout.\nUsed to contextualize spacing and results.",
    meta: "Typical: 500–50,000 m²"
  },
  latitud: {
    name: "Latitude (°)",
    desc: "Site latitude in decimal degrees.\nAffects sun position and seasonal irradiance.",
    meta: "Ibiza approx.: 38.9–39.1°"
  },
  longitud: {
    name: "Longitude (°)",
    desc: "Site longitude in decimal degrees.\nUsed together with latitude for solar geometry.",
    meta: "Ibiza approx.: 1.2–1.6°E"
  },
  albedo: {
    name: "Albedo (0–1)",
    desc: "Fraction of global horizontal irradiance reflected by the ground.\nUsed for reflected component on panels and terrain.",
    meta: "Typical: 0.15–0.35"
  },
  G0: {
    name: "Solar constant (W/m²)",
    desc: "Extraterrestrial irradiance constant used in the theoretical model.\nDefault is commonly ~1367 W/m².",
    meta: "Default: 1367 W/m²"
  },
  fecha_inicio: {
    name: "Simulation start date",
    desc: "First day included in the simulation period.",
    meta: "Format: YYYY-MM-DD"
  },
  fecha_fin: {
    name: "Simulation end date",
    desc: "Last day included in the simulation period.",
    meta: "Format: YYYY-MM-DD"
  },
  day_interval: {
    name: "Day interval",
    desc: "Time step (in days) used to sample days within the simulation period.\nHigher values reduce computation time but lower temporal resolution.",
    meta: "Typical: 1–10"
  },
  nFilas: {
    name: "Number of PV rows",
    desc: "Number of panel rows in the layout.",
    meta: "Integer ≥ 1"
  },
  nCols: {
    name: "Number of PV columns",
    desc: "Number of panels per row (columns).",
    meta: "Integer ≥ 1"
  },
  sepX: {
    name: "Row-wise spacing (m)",
    desc: "Spacing between panels along the X direction (between columns).",
    meta: "Typical: 0.2–3 m"
  },
  sepY: {
    name: "Inter-row spacing (m)",
    desc: "Spacing between rows along the Y direction.\nStrongly affects shading and land use.",
    meta: "Typical: 1–10 m"
  },
  panelW: {
    name: "Panel width (m)",
    desc: "Panel dimension across the short side (width).",
    meta: "Example: 0.8–1.2 m"
  },
  panelH: {
    name: "Panel height/length (m)",
    desc: "Panel dimension along the long side (length).",
    meta: "Example: 1.6–2.4 m"
  },
  h_pv: {
    name: "Panel elevation (m)",
    desc: "Height of the panel structure above ground.\nAffects shading footprint and agricultural machinery clearance.",
    meta: "Typical: 2–5 m"
  },
  inclinacion: {
    name: "Tilt angle β (°)",
    desc: "Panel tilt with respect to horizontal.\nImpacts energy yield and shading geometry.",
    meta: "Typical: 10–35°"
  },
  gamma: {
    name: "Azimuth γ (°)",
    desc: "Panel orientation azimuth.\n180° typically corresponds to South-facing in many conventions.",
    meta: "Common: 180° (South)"
  },
  crop: {
    name: "Crop type",
    desc: "Crop selection used to estimate yield response under shading (RSR).",
    meta: "Examples: lettuce, tomato, zucchini"
  },
  weather: {
    name: "Climate model",
    desc: "PVGIS uses real climatological datasets.\nStandard uses a simplified theoretical climate model.",
    meta: "PVGIS is slower but more data-driven."
  }
};

// --- Panel controls ---
function openHelp(key){
  const item = HELP[key] || { name: key, desc: "No description available.", meta: "" };
  document.getElementById("helpParamName").textContent = item.name || key;
  document.getElementById("helpParamDesc").textContent = item.desc || "";
  document.getElementById("helpParamMeta").textContent = item.meta || "";
  document.getElementById("helpOverlay").style.display = "flex";
}

function closeHelp(){
  document.getElementById("helpOverlay").style.display = "none";
}

// --- Inject ⓘ icons next to labels based on input/select id ---
function attachHelpIcons(){
  // For each input/select with an id, try to find the previous label and add the icon
  const controls = document.querySelectorAll("input[id], select[id]");
  controls.forEach(ctrl => {
    const id = ctrl.id;
    if (!id || !HELP[id]) return;

    // Find the nearest previous label in the same container
    // Your HTML uses <label> just before input, so this works:
    let label = ctrl.previousElementSibling;
    while (label && label.tagName !== "LABEL") label = label.previousElementSibling;
    if (!label) return;

    // Avoid duplicates
    if (label.querySelector(`[data-help="${id}"]`)) return;

    const icon = document.createElement("span");
    icon.className = "help-icon";
    icon.textContent = "i";
    icon.setAttribute("title", "More info");
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.dataset.help = id;

    icon.addEventListener("click", () => openHelp(id));
    icon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openHelp(id);
    });

    label.appendChild(icon);
  });

  // Close handlers
  document.getElementById("helpCloseBtn").addEventListener("click", closeHelp);
  document.getElementById("helpOverlay").addEventListener("click", (e) => {
    if (e.target.id === "helpOverlay") closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
  });
}

document.addEventListener("DOMContentLoaded", attachHelpIcons);
