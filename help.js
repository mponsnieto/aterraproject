let HELP_ENABLED = true;

const HELP = {
  area: {
    name: "Superficie disponible (ha)",
    desc: "Extensión del terreno cultivable sobre el que se instalarán los paneles. El simulador acepta una superficie disponible mayor que la ocupada por la zona agrovoltaica, aunque eso incrementa el tiempo de simulación.",
    meta: "Típico: 0.5, 2 – 7 ha"
  },
  latitud: {
    name: "Latitud y longitud(°)",
    desc: "Coordenadas en grados de la localización del proyecto. \nCabe mencionar que el simulador está diseñado para proyectos en Baleares.",
    meta: "Ejemplo: Ibiza 38.9743901° – 1.41974631785153°"
  },
  albedo: {
    name: "Albedo (0–1)",
    desc: "El albedo refleja la capacidad del terreno para devolver parte de la radiación solar que recibe. No es un valor fijo, oscila entre 0 y 1: cambia con la estación del año y con la superficie presente, como tierra, roca o vegetación. En general, los suelos claros reflejan más energía que los oscuros, lo que influye directamente en el rendimiento del sistema agrovoltaico. \nComo referencia en el contexto balear, la hierba suele situarse entre 0,15 y 0,25; la tierra clara o seca alrededor de 0,20–0,30; mientras que un olivar o viñedo con suelo descubierto puede acercarse a 0,25–0,35.",
    meta: "Typical: 0.15–0.35"
  },
  resolucion_malla:{
    name: "Resolucion Malla (uds)",
    desc: "Número de divisiones usadas para discretizar el terreno en una malla regular sobre la que calcular la irradianza y sombras.\nValores más elevados implican mayor resolución sobre el terreno y precisión, pero también implican un alto coste computacional (tiempo).",
    meta: "Typical: 10, 50, 100"
  },
  G0: {
    name: "Solar constant (W/m²)",
    desc: "Extraterrestrial irradiance constant used in the theoretical model.\nDefault is commonly ~1367 W/m².",
    meta: "Default: 1367 W/m²"
  },
  fecha_inicio: {
    name: "Fecha de inicio",
    desc: "Primer día incluido en la simulación.",
    meta: "Formato: YYYY-MM-DD"
  },
  fecha_fin: {
    name: "Fecha de fin de simulación",
    desc: "Último día incluido en la simulación",
    meta: "Formato: YYYY-MM-DD"
  },
  day_interval: {
    name: "Intervalo de días",
    desc: "Paso del tiempo (en días) usado para avanzar en el periodo de simulación.\nValores más altos reducen el coste computacional aunque tienen disminuye la resolución temporal.",
    meta: "Típico: 1–10"
  },
  hotel: {
    name: "Categoría del hotel",
    desc: "Este dato permitirá comparar la producción energética y el consumo del cultivo con los parámetros medios para un establecimiento de la misma tipología.",
    meta: "Si se especifican los campos de demanda de alimento y energía, este campo no es relevante."
  },
  foodDemand: {
    name: "Demanda específica de alimentos y energía (kg y kWh por periodo)",
    desc: "Este dato permitirá comparar la producción energética y el consumo del cultivo con los parámetros medios para un establecimiento de la misma tipología.",
    meta: "Si se especifican los campos de demanda de alimento y energía, este campo no es relevante."
  },
  nFilas: {
    name: "Numero de filas de paneles solar",
    desc: "Numero de filas de placas/strings contempladas en la simulación.",
    meta: "Número entero ≥ 1"
  },
  nCols: {
    name: "Numero de columnas de paneles solar",
    desc: "Numero de columnas de placas contempladas en la simulación.",
    meta: "Número entero ≥ 1"
  },
  sepX: {
    name: "Separación entre columnas (m)",
    desc: "Distancia entre paneles sobre el eje X (entre columnas).",
    meta: "Típico: 0.2–3 m"
  },
  sepY: {
    name: "Separación entre filas (m)",
    desc: "Distancia entre paneles sobre el eje Y (entre filas).",
    meta: "Típico: 1–10 m"
  },
  panelW: {
    name: "Dimensiones del panel: alto y ancho (m)",
    desc: "Dimensiones de un panel fotovoltaico. Estos valores aparecen especificados en la ficha técnica del fabricante y determinan la superficie ocupada por cada módulo en la instalación.",
    meta: "Example: 0.8–1.2 m"
  },
  h_pv: {
    name: "Elevación de los paneles (m)",
    desc: "Height of the panel structure above ground.\nAffects shading footprint and agricultural machinery clearance.",
    meta: "Tipico: 2–5 m"
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
  tau_dir: {
    name: "Transparencia del panel (%)",
    desc: "porcentaje de radiación solar que atraviesa los paneles y llega al cultivo. Un mayor nivel de transparencia permite que la planta reciba más luz, aunque disminuye la producción eléctrica; con menor transparencia ocurre lo contrario. No existe un valor estándar, ya que depende del diseño y del fabricante.",
    meta: "Rango: 0% (opaco) - 100% (transparente)"
  },
  crop: {
    name: "Tipo de cultivo",
    desc: `La investigación del proyecto ATERRA se centra en los cultivos seleccionados, permitiendo analizar el resultado de cultivos con una tolerancia alta, media y baja a la sombra. 
    Para más información: <a href="https://clusterteib.es/rendimientos-agricolas/"
       target="_blank" rel="noopener"> click aquí
    </a>
    `
    ,
    meta: "Categorías: lechuga, tomate, calabacín, patata, fresa, sandía, pimiento"
  },
  yieldBase: {
    name: "Rendimiento del cultivo base (kg/ha)",
    desc: `
    Rendimiento del cultivo en condiciones normales y cielo abierto. Si conoce el rendimiento de su terreno y cultivo puede introducirlo. Sino puede consultar valores estandar para Baleares en: <a href="https://clusterteib.es/rendimientos-agricolas/"
       target="_blank" rel="noopener"> click aquí
    </a>
    `,
    meta: "Typical: lettuce, tomato, zucchini"
  },
  efficiency: {
    name: "Eficiencia del sistema (%)",
    desc: "Porcentaje de radiación solar que se transforma en electricidad utilizable. ",
    meta: "Rango: 14% - 23%"
  },
  weather: {
    name: "Modelo de clima",
    desc: "El modelo de clima define la metodología por la que se calcula la irradiancia en ese terreno. En el modelo teórico se aplican fórmulas matemáticas simplificadas (modelo teórico) y en el modelo basado en PVGIS se emplean datos reales de irradiancia.",
    meta: "PVGIS es más lento pero se basa en datos actualizados."
  }
};

// --- Panel controls ---
function openHelp(key){
  if (!HELP_ENABLED) return;

  const item = HELP[key] || { name: key, desc: "No description available.", meta: "" };
  document.getElementById("helpParamName").textContent = item.name || key;
  document.getElementById("helpParamDesc").innerHTML = item.desc || "";
  document.getElementById("helpParamMeta").textContent = item.meta || "";
  document.getElementById("helpOverlay").style.display = "flex";

}


function disableHelp() {
  HELP_ENABLED = false;

  const icons = document.querySelectorAll(".help-icon");
  const dataHelp = document.querySelectorAll("[data-help]");

  console.log("disableHelp() CALLED");
  console.log("Found .help-icon:", icons.length, "Found [data-help]:", dataHelp.length);

  document.querySelectorAll(".help-icon, [data-help]").forEach(el => el.remove());

  console.log("After remove .help-icon:", document.querySelectorAll(".help-icon").length);

  const overlay = document.getElementById("helpOverlay");
  if (overlay) overlay.style.display = "none";
}
window.disableHelp = disableHelp;


function closeHelp(){
  document.getElementById("helpOverlay").style.display = "none";
}

// --- Inject ⓘ icons next to labels based on input/select id ---
function attachHelpIcons(){
  if (!HELP_ENABLED) return;
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
    icon.textContent = "?";
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

window.disableHelp = disableHelp;
window.openHelp = openHelp;   
window.closeHelp = closeHelp; 
