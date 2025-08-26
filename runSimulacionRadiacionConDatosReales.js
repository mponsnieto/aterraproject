async function runSimulacionRadiacionConDatosReales (datos, paneles){



 const container = document.getElementById("visualRadiacion");
  container.innerHTML = ""; // Limpiar si ya existe

 //Realiza toda la simulación de radiación solar y devuelve resultados estructurados
 // === Parámetros de entrada ===
  const {
    fecha_inicio, fecha_fin,latitud, longitud, nFilas, nCols, margen, day_interval,
    inclinacion, orientacion: gamma, albedo, malla, G0, tau_dir, f_gap,k_t, fd, sepY, sepX
    } = datos;
  
  beta=90-inclinacion;

  if (!Array.isArray(paneles)) {
  console.error("❌ 'paneles' no es un array válido:", paneles);
  return;
  }
  console.log("datos:", datos);
  // === Malla del terreno ===
  const allX = paneles.flatMap(p => [p.PL[0], p.PR[0], p.TL[0], p.TR[0]]);
  const allY = paneles.flatMap(p => [p.PL[1], p.PR[1], p.TL[1], p.TR[1]]);
  const xmin = Math.min(...allX) - margen;
  const xmax = Math.max(...allX) + margen;
  const ymin = Math.min(...allY) - margen;
  const ymax = Math.max(...allY) + margen;

  const xgv = linspace(xmin, xmax, malla);
  const ygv = linspace(ymin, ymax, malla);

  const { XX, YY } = meshgrid(xgv, ygv);

  const nRows = XX.length;
  const nColsGrid = XX[0].length;
  const area_terreno = (xmax - xmin) * (ymax - ymin);
  const area_malla = area_terreno / (malla * malla);

  const E_terreno_dias = [];
  const E_paneles_dias = [];
  const E_por_panel_dias = [];

  console.log(`Área estimada del terreno = ${area_terreno.toFixed(2)} m²`);

  // === Bucle por días ===
  let dia = new Date(fecha_inicio);
  const end = new Date(fecha_fin);

  if (dia > end){
    console.error("❌ la fecha de inicio no puede ser posterior a la final", paneles);
    return;
  }

for (let dia = new Date(fecha_inicio); dia <= new Date(fecha_fin); dia.setDate(dia.getDate() + day_interval)) {
    const yyyy = dia.getFullYear();
    const mm = String(dia.getMonth() + 1).padStart(2, '0');
    const dd = String(dia.getDate()).padStart(2, '0');
    const fechaISO = `${yyyy}-${mm}-${dd}`;

    // === 3.1) Leer datos PVGIS para este día (06–20h) ===
    const datosDia = await leerDatosPVGISmasCercano(latitud, longitud, fechaISO);
    // datosDia: [{Hora(dec), DNI, DHI, GHI}, ...] típicamente cada 60min
    
    if (!datosDia.length) {
      // si no hay datos, crea matrices a cero y continúa
      E_terreno_dias.push(zeros(nRows, nColsGrid));
      E_paneles_dias.push(0);
      E_por_panel_dias.push(new Array(nFilas * nCols).fill(0));
      continue;
    }

  // === 3.2) Tiempo de simulación interno (ej. cada 900 s = 15 min) ===
    const dt = 900; // s
    const times = generateTimeSeries(dia, 6, 20, dt); // array de Date

    // === 3.3) Acumuladores del día ===
    const E_accum = zeros(nRows, nColsGrid);    // kWh/m² sobre terreno
    const E_por_panel = new Array(nFilas * nCols).fill(0); // kWh por panel

    // === 3.4) Lazo horario ===
    for (let t = 0; t < times.length; t++) {
      const time = times[t];

      // — Buscar el registro PVGIS más cercano en hora decimal —
      const horaDec = time.getUTCHours() + time.getUTCMinutes() / 60;
      let reg = datosDia[0], bestDiff = Infinity;



      // Recorre directamente las muestras PVGIS:
      for (const reg of datosDia) {
        const DNI = reg.DNI, DHI = reg.DHI, GHI = reg.GHI;
        if (DNI < 1 && DHI < 1 && GHI < 1) continue; // noche
      }
      for (const r of datosDia) {
        const d = Math.abs(r.Hora - horaDec);
        if (d < bestDiff) { bestDiff = d; reg = r; }
      }
      
      // Irradiancias de PVGIS (clamp y safe)
      const DNI = Math.max(0, Number(reg.DNI) || 0);
      const DHI = Math.max(0, Number(reg.DHI) || 0);
      const GHI = Math.max(0, Number(reg.GHI) || 0);
      
      //console.log(reg,horaDec,DNI);
      
      // Si todo es 0, salta rápido (noche o valores nulos)
      if (DNI === 0 && DHI === 0 && GHI === 0) continue;

      

      // — Vector solar aproximado a partir de irradiancias —
      const { sunAz, sunAlt } = sunPositionLike(time, latitud, longitud);
      if (!Number.isFinite(sunAlt) || sunAlt <= 0) continue;
      const sv = normalize([
        Math.cos(deg2rad(sunAlt)) * Math.sin(deg2rad(sunAz)),
        Math.cos(deg2rad(sunAlt)) * Math.cos(deg2rad(sunAz)),
        Math.sin(deg2rad(sunAlt))
      ]);

      console.log(reg,horaDec,DNI);

      // — Normal del panel —
      const nn = normalize([
        Math.sin(deg2rad(beta)) * Math.sin(deg2rad(gamma)),
        Math.sin(deg2rad(beta)) * Math.cos(deg2rad(gamma)),
        Math.cos(deg2rad(beta))
      ]);
      const cos_theta_i = Math.max(0, dot(nn, sv));

      // Radiación sobre panel inclinado (directa + difusa + reflejada)
      const DNI_pv = Math.max(0, DNI * cos_theta_i);
      const DHI_pv = DHI * (1 + Math.cos(deg2rad(beta))) / 2;

      console.log(DNI_pv,DHI_pv);

      // === Terreno: sombreado celda a celda ===
      for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nColsGrid; j++) {
          const P = [XX[i][j], YY[i][j], 0];
          let inShadow = false;
          for (let k = 0; k < paneles.length; k++) {
            if (rayIntersectsPanel(P, sv, paneles[k])) { inShadow = true; break; }
          }
          // Transparencias y gaps
          const I_dir = DNI * (inShadow ? (Number.isFinite(tau_dir) ? tau_dir : 0) : 1);
          const f_vis = inShadow ? (Number.isFinite(f_gap) ? f_gap : 0) : 1;
          const I_dif = DHI * f_vis;
          const I_ref = (Number.isFinite(albedo) ? albedo : 0) * (I_dir + I_dif);
          let I_total = I_dir + I_dif + I_ref;
          if (!Number.isFinite(I_total) || I_total < 0) I_total = 0;
          //console.log(I_total);

          // Acumular kWh/m²
          E_accum[i][j] += I_total * (dt / 3600) / 1000;
        }
      }

      // === Paneles: sombreado “panel a panel” ===
      for (let p = 0; p < paneles.length; p++) {
        const V = paneles[p];
        // Sombra por otros paneles (chequeo en 3 puntos)
        const pts = [
          averagePoints([V.PL, V.PR, V.TL, V.TR]),
          V.PL, V.PR
        ];
        let sombra = false;
        for (let q = 0; q < paneles.length && !sombra; q++) if (q !== p) {
          for (let pp = 0; pp < pts.length; pp++) {
            if (rayIntersectsPanel(pts[pp], sv, paneles[q])) { sombra = true; break; }
          }
        }
        if (sombra) continue;

        const areaPanel = vectorNorm(cross(sub(V.PR, V.PL), sub(V.TL, V.PL)));
        const I_ref_pv = (Number.isFinite(albedo) ? albedo : 0) * GHI * (1 + Math.cos(deg2rad(beta))) / 2;
        let I_total_pv = Math.max(0, DNI_pv) + Math.max(0, DHI_pv) + Math.max(0, I_ref_pv);
        if (!Number.isFinite(I_total_pv)) I_total_pv = 0;

        E_por_panel[p] += I_total_pv * areaPanel * (dt / 3600) / 1000; // kWh por panel
      }
    } // fin lazo horario
    console.log(E_accum,E_por_panel);
    // Guardar el día
    E_terreno_dias.push(sanitizeGrid(E_accum, 0));
    E_paneles_dias.push(E_por_panel.reduce((a, b) => a + b, 0));
    E_por_panel_dias.push(E_por_panel);
  } // fin lazo días

  // === 4) Acumulados multi-día ===
  const { dias_por_intervalo } = daysCoverage(new Date(fecha_inicio), new Date(fecha_fin), day_interval);
  const E_terreno_total = accumulateTerreno(E_terreno_dias, dias_por_intervalo);
  const E_por_panel_total = sumPaneles(E_por_panel_dias, dias_por_intervalo);
  const E_paneles_total = E_por_panel_total.reduce((a, b) => a + b, 0);

  mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles)
  mostrarGraficoPaneles(E_por_panel_total)

  return {
    E_paneles_dias,
    E_por_panel_dias,
    E_paneles_total,
    E_por_panel_total,
    xgv, ygv,
    Area_terreno: area_terreno,
    Area_malla: area_malla,
    E_terreno_dias,
    E_terreno_total,
    fecha_inicio, fecha_fin, latitud, longitud
  };
}

function sunPositionLike(time, lat, lon) {
  const date = new Date(time);
  const hour = date.getUTCHours() + date.getUTCMinutes()/60;
  // Azimut 180° al mediodía, elevación simple “campana”
  const sunAlt = Math.max(0, 70 * Math.sin(Math.PI * (hour - 6) / 14)); // 0 en 6h y 20h
  const sunAz = 90 + 180 * ((hour - 6) / 14); // 90→270
  return { sunAz, sunAlt };
}

function sunPosition(time, lat, lon) {

  // Día del año
  const doy = getDayOfYear(time);
  //console.log("time:", time);
  //console.log("doy:", doy);
  // Declinación solar
  const delta = 23.45 * Math.sin(deg2rad(360 * (284 + doy) / 365));

  // Hora local en horas decimales
  const hora_local = time.getHours() + time.getMinutes() / 60 + time.getSeconds() / 3600;

  // Longitud estándar del huso horario (en grados) → UTC+0 → 0°
  const LSTM = 15 * 0;  // Cambiar a 15*1 para España peninsular

  // Ecuación del Tiempo (EoT)
  const B = deg2rad(360 * (doy - 81) / 365);
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);  // minutos

  // Hora solar real
  const solarTime = hora_local + (4 * (LSTM - lon) + EoT) / 60;

  // Ángulo horario (HRA)
  const HRA = 15 * (solarTime - 12); // grados

  // Elevación solar (altura)
  //console.log("hora_local:", hora_local, "solarTime", solarTime, "EoT", EoT, "lon", lon)
  const sinAlt = Math.sin(deg2rad(lat)) * Math.sin(deg2rad(delta)) + Math.cos(deg2rad(lat)) * Math.cos(deg2rad(delta)) * Math.cos(deg2rad(HRA));
  //console.log("sinAlt:", sinAlt);
  const sunAlt = rad2deg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
  //console.log("sunAlt:", sunAlt);

  // Azimut solar
  const cosAz = (Math.sin(deg2rad(delta)) - Math.sin(deg2rad(sunAlt)) * Math.sin(deg2rad(lat))) /
                (Math.cos(deg2rad(sunAlt)) * Math.cos(deg2rad(lat)));
  let A = rad2deg(Math.acos(clamp(cosAz, -1, 1)));

  // Ajuste según el signo del HRA
  const sunAz = Math.sin(deg2rad(HRA)) > 0 ? (360 - A) % 360 : A;

  return [sunAz, sunAlt];
}

function rayIntersectsPanel(P, sv, panel) {
  const PL = panel.PL;
  const PR = panel.PR;
  const TL = panel.TL;

  // Vector normal al panel
  const N = crossProduct(subtract(PR, PL), subtract(TL, PL));

  const dotSvN = dotProduct(sv, N);
  if (dotSvN === 0) return false; // rayo paralelo al plano

  const t = dotProduct(subtract(PL, P), N) / dotSvN;
  if (t <= 0) return false; // intersección detrás del punto origen

  // Punto de intersección
  const I = add(P, multiply(sv, t));

  // Sistema de coordenadas local en el plano
  const v1 = subtract(PR, PL);
  const v2 = subtract(TL, PL);

  const M = [v1, v2]; // matriz 3x2
  const rhs = subtract(I, PL);

  // Resolver sistema M * [u v] = rhs usando mínimos cuadrados
  const uv = solve2x2(M, rhs);
  if (!uv) return false;

  const [u, v] = uv;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}


//Funciones auxiliares

function deg2rad(deg) {
  return deg * Math.PI / 180;
}
function rad2deg(rad) {
  return rad * 180 / Math.PI;
}
function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function generateDayIntervals(startDate, endDate, intervalDays){
  const dates = [];
  const current = new Date(startDate); // copia para no modificar original

  while (current <= endDate) {
    dates.push(new Date(current)); // clonar
    current.setDate(current.getDate() + intervalDays);
  }

  return dates;
}

function subtract(a, b) {
  return a.map((val, i) => val - b[i]);
}

function add(a, b) {
  return a.map((val, i) => val + b[i]);
}

function multiply(vec, scalar) {
  return vec.map(val => val * scalar);
}

function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function crossProduct(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function solve2x2(M, rhs) {
  // M es un array de dos vectores [v1, v2], cada uno de longitud 3
  const A = [
    [M[0][0], M[1][0]],
    [M[0][1], M[1][1]]
  ];
  const b = [rhs[0], rhs[1]];

  const det = A[0][0]*A[1][1] - A[0][1]*A[1][0];
  if (Math.abs(det) < 1e-8) return null; // no tiene solución única

  const u = (b[0]*A[1][1] - b[1]*A[0][1]) / det;
  const v = (A[0][0]*b[1] - A[1][0]*b[0]) / det;
  return [u, v];
}

function linspace(start, end, num) {
  const result = [];
  if (num === 1) {
    result.push(start);
  } else {
    const step = (end - start) / (num - 1);
    for (let i = 0; i < num; i++) {
      result.push(start + step * i);
    }
  }
  return result;
}

function meshgrid(x,y){
  const XX = [];
  const YY = [];
  //console.log("Y:", y);
  //console.log("X:", x);
  for (let j = 0; j < y.length; j++) {
    const rowX = [];
    const rowY = [];
    for (let i = 0; i < x.length; i++) {
      rowX.push(x[i]);
      rowY.push(y[j]);
    }
    XX.push(rowX);
    YY.push(rowY);
  }
  //console.log("XX:", XX);
  return { XX, YY };
}

function sanitizeGrid(G, fallback=0) {
  for (let i=0;i<G.length;i++) for (let j=0;j<G[i].length;j++)
    if (!Number.isFinite(G[i][j])) G[i][j] = fallback;
  return G;
}

function normalize(v){ const n = Math.hypot(...v); return n? v.map(x=>x/n) : [0,0,0]; }

function daysCoverage(d1, d2, step) {
  const dias = [];
  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+step)) dias.push(new Date(d));
  // pesos (último tramo puede ser menor si no cae exacto)
  const n1 = dayOfYear(d1), n2 = dayOfYear(d2);
  const dias_por_intervalo = Array(dias.length).fill(step);
  dias_por_intervalo[dias_por_intervalo.length - 1] = (n2 - dayOfYear(dias[dias.length - 1])) + 1;
  return { dias, dias_por_intervalo };
}

function dayOfYear(d){ const start=new Date(d.getFullYear(),0,0); const diff=d-start; return Math.floor(diff/86400000); }


function mostrarGraficoPaneles(E_por_panel_total) {
  const ctx = document.getElementById("graficoPorPanel").getContext("2d");
  ctx.innerHTML = ""; // Limpiar si ya existe
  
  const labels = E_por_panel_total.map((_, i) => `Panel ${i + 1}`);
  console.log("E_por_panel",E_por_panel_total);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Energía total por panel (kWh)',
        data: E_por_panel_total,
        backgroundColor: 'rgba(30, 144, 255, 0.6)',
        borderColor: 'rgba(30, 144, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Energía total por panel'
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Panel' }
        },
        y: {
          title: { display: true, text: 'Energía (kWh)' },
          beginAtZero: true
        }
      }
    }
  });
}

function mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles){
  console.log("--------E_terreno_total---",E_terreno_total)
  const canvas = document.createElement("canvas");
    
  const padding = 50; // espacio para etiquetas
  const scale = 4;
  const width = xgv.length * scale + padding*2;
  const height = ygv.length * scale + padding;
  const width_legend = 30;

  canvas.width = width+(width_legend*2);
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const nRows = ygv.length;
  const nCols = xgv.length;

  const minVal = Math.ceil(Math.min(...E_terreno_total.flat()));
  const maxVal = Math.ceil(Math.max(...E_terreno_total.flat()));
  console.log("E_terreno_total", E_terreno_total,"minVal",minVal,"maxVal",maxVal)
  const getColor = (v) => {
    const ratio = (v - minVal) / (maxVal - minVal);
    const r = Math.floor(255 * ratio);
    const g = Math.floor(255 * ratio);
    const b = Math.floor(255 * (1 - ratio)); //Valor más bajo
    return `rgb(${r},${g},${b})`;
  };


  // Dibujar heatmap
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nRows; j++) {
      const val = E_terreno_total[j][i];
      ctx.fillStyle = getColor(val);
      const y = (nRows - j - 1) * scale;
      ctx.fillRect(padding + i * scale, y, scale, scale);
    }
  }

  // Dibujar paneles
  ctx.fillStyle = "rgba(180,180,255,0.6)";
  ctx.strokeStyle = "black";
  for (const p of paneles) {
    const xs = [p.PL[0], p.PR[0], p.TL[0], p.TR[0]];
    const ys = [p.PL[1], p.PR[1], p.TL[1], p.TR[1]];

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const xIdx = xgv.findIndex(val => val >= xMin);
    const yIdx = ygv.findIndex(val => val >= yMin);
    const w = Math.round((xMax - xMin) / (xgv[1] - xgv[0]));
    const h = Math.round((yMax - yMin) / (ygv[1] - ygv[0]));

    ctx.fillRect(padding + xIdx * scale, (nRows - yIdx - h) * scale, w * scale, h * scale);
    ctx.strokeRect(padding + xIdx * scale, (nRows - yIdx - h) * scale, w * scale, h * scale);
  }

  // Etiquetas del eje Y
  ctx.save();
  ctx.fillStyle = "black";
  ctx.translate(15, (ygv.length * scale) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Y (m)", 0, 0);
  ctx.restore();

  ctx.fillStyle = "black";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let j = nRows-1; j > 0; j -= 5) {
    const y = (nRows - j) * scale + scale / 2;
    ctx.fillText(ygv[j].toFixed(1), padding-5 , y);
  }

  // Etiquetas del eje X
  ctx.textAlign = "center";
  ctx.fillStyle = "black";

  ctx.fillText("X (m)", padding + (xgv.length * scale) / 2, height - 10);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = nCols-1; i>0; i-=5){//0; i < nCols; i += 5) {
    ctx.fillText(xgv[i].toFixed(1), padding + i * scale + scale / 2, height - padding + 5);
  }

  // Ejes
  ctx.beginPath();
  ctx.moveTo(padding, 0);
  ctx.lineTo(padding, nRows * scale);
  ctx.moveTo(padding, nRows * scale);
  ctx.lineTo(width, nRows * scale);
  ctx.stroke();

  // Leyenda vertical
  const legendHeight = height - padding-15;
  const legendX = width - width_legend;
  const legendY = 5;//Primer punto de la leyenda
  const gradient = ctx.createLinearGradient(0, legendY, 0, legendHeight);
  gradient.addColorStop(0, getColor(maxVal));
  gradient.addColorStop(1, getColor(minVal));

  ctx.fillStyle = gradient;
  ctx.fillRect(legendX, legendY, 20, legendHeight);

  ctx.strokeStyle = "black";
  ctx.strokeRect(legendX, legendY,20, legendHeight);

  ctx.fillStyle = "black";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  
  const nTicks = 5; // Número total de marcas (incluye min y max)
  for (let i = 0; i < nTicks; i++) {
    const t = i / (nTicks - 1);
    const y = legendY + t * legendHeight;
    const val = maxVal - t * (maxVal - minVal);

    ctx.fillText(val.toFixed(1), legendX + width_legend, y);
  }

  // Añadir a la página
  const container = document.getElementById("visualRadiacion");
  container.innerHTML = "";

  const titulo = document.createElement("h3");
  titulo.textContent = "Energía acumulada en el terreno (kWh/m²)";
  titulo.style.textAlign = "center";
  titulo.style.marginBottom = "10px";
  container.appendChild(titulo);

  container.appendChild(canvas);
}


function sumPaneles(E_por_panel_dias, dias_por_intervalo) {
  const n = E_por_panel_dias[0].length;
  const total = new Array(n).fill(0);
  console.log("E_por_panel_dias[0]",n,"total", total,"E_por_panel_dias.length", E_por_panel_dias.length)
  for (let i = 0; i < E_por_panel_dias.length; i++) {
    const pesos = dias_por_intervalo[i];
    const energiaDia = E_por_panel_dias[i];

    for (let j = 0; j < n; j++) {
      if (isFinite(energiaDia[j])&&isFinite(pesos)){
        total[j] += energiaDia[j] * pesos;
        console.log("energiaDia[j]", energiaDia[j],"total", total);
      }
    }
  }
  console.log("total", total);
  return total;
}

function generateTimeSeries(date, startHour, endHour, stepSeconds) {
  const times = [];
  const base = new Date(date);
  const stepMs = stepSeconds * 1000;

  for (let h = startHour; h < endHour; h += stepSeconds / 3600) {
    const t = new Date(base);
    const totalMinutes = h * 60;
    t.setHours(0, 0, 0, 0); // reset hora
    t.setMinutes(totalMinutes);
    times.push(t);
  }

  return times;
}

function zeros(rows, cols){
  const arr = new Array(rows);
  for (let i = 0; i < rows; i++) {
    arr[i] = new Array(cols).fill(0);
  }
  return arr;
}

function accumulateTerreno(E_terreno_dias, dias_por_intervalo) {
  if (!E_terreno_dias.length) {
    console.warn("E_terreno_dias vacío");
    return [];
  }

  const nRows = E_terreno_dias[0].length;
  const nCols = E_terreno_dias[0][0].length;
  console.log("dias_por_intervalo",dias_por_intervalo[1])

  const total = zeros(nRows, nCols);

  for (let k = 0; k < E_terreno_dias.length; k++) {
    const matrizDia = E_terreno_dias[k];
    const peso = Number.isFinite(dias_por_intervalo[k]) ? dias_por_intervalo[k] : 0; //dias_por_intervalo[k];
    //console.log("matrizDia",matrizDia,"peso", peso)
    for (let i = 0; i < matrizDia.length; i++) {
      for (let j = 0; j < matrizDia[i].length; j++) {
        const v = matrizDia[i][j];
        if (Number.isFinite(v)) total[i][j] += v * peso;
      }
    }
  }

  return total;
}

function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vectorNorm(v){ return Math.hypot(...v); }
function averagePoints(arr){ const n=arr.length; return [arr.reduce((s,p)=>s+p[0],0)/n, arr.reduce((s,p)=>s+p[1],0)/n, arr.reduce((s,p)=>s+p[2],0)/n]; }



function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vec; // evitar división por cero
  return vec.map(val => val / norm);
}

function averagePoints(points) {
  const n = points.length;
  const dim = points[0].length; // 3 si son [x, y, z]

  const sum = new Array(dim).fill(0);

  for (const p of points) {
    for (let i = 0; i < dim; i++) {
      sum[i] += p[i];
    }
  }

  return sum.map(val => val / n);
}

function vectorNorm(vec) {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}


// Devuelve [{Hora (decimal), DNI, DHI, GHI}, ...] entre 6–20h del día pedido
async function leerDatosPVGISmasCercano(lat, lon, fechaISO) {
  const API_BASE = 'https://aterraserver.onrender.com'; // Servidor ejecutandose en Render
  const resp = await fetch(`${API_BASE}/pvgis/dia?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&fecha=${fechaISO}`);
  if (!resp.ok) throw new Error('PVGIS día error');
  return (await resp.json()).datos || [];
  /*const url = `http://localhost:3000/pvgis/dia?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&fecha=${encodeURIComponent(fechaISO)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Backend PVGIS respondió ${resp.status}`);
  const json = await resp.json();
  return json.datos || [];*/
}

function mostrarGraficoPaneles(E_por_panel_total) {
  const ctx = document.getElementById("graficoPorPanel").getContext("2d");
  ctx.innerHTML = ""; // Limpiar si ya existe
  
  const labels = E_por_panel_total.map((_, i) => `Panel ${i + 1}`);
  console.log("E_por_panel",E_por_panel_total);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Energía total por panel (kWh)',
        data: E_por_panel_total,
        backgroundColor: 'rgba(30, 144, 255, 0.6)',
        borderColor: 'rgba(30, 144, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Energía total por panel'
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Panel' }
        },
        y: {
          title: { display: true, text: 'Energía (kWh)' },
          beginAtZero: true
        }
      }
    }
  });
}

function mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles){
  console.log("--------E_terreno_total---",E_terreno_total)
  const canvas = document.createElement("canvas");
    
  const padding = 50; // espacio para etiquetas
  const scale = 4;
  const width = xgv.length * scale + padding*2;
  const height = ygv.length * scale + padding;
  const width_legend = 30;

  canvas.width = width+(width_legend*2);
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const nRows = ygv.length;
  const nCols = xgv.length;

  const minVal = Math.ceil(Math.min(...E_terreno_total.flat()));
  const maxVal = Math.ceil(Math.max(...E_terreno_total.flat()));
  console.log("E_terreno_total", E_terreno_total,"minVal",minVal,"maxVal",maxVal)
  const getColor = (v) => {
    const ratio = (v - minVal) / (maxVal - minVal);
    const r = Math.floor(255 * ratio);
    const g = Math.floor(255 * ratio);
    const b = Math.floor(255 * (1 - ratio)); //Valor más bajo
    return `rgb(${r},${g},${b})`;
  };


  // Dibujar heatmap
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nRows; j++) {
      const val = E_terreno_total[j][i];
      ctx.fillStyle = getColor(val);
      const y = (nRows - j - 1) * scale;
      ctx.fillRect(padding + i * scale, y, scale, scale);
    }
  }

  // Dibujar paneles
  ctx.fillStyle = "rgba(180,180,255,0.6)";
  ctx.strokeStyle = "black";
  for (const p of paneles) {
    const xs = [p.PL[0], p.PR[0], p.TL[0], p.TR[0]];
    const ys = [p.PL[1], p.PR[1], p.TL[1], p.TR[1]];

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const xIdx = xgv.findIndex(val => val >= xMin);
    const yIdx = ygv.findIndex(val => val >= yMin);
    const w = Math.round((xMax - xMin) / (xgv[1] - xgv[0]));
    const h = Math.round((yMax - yMin) / (ygv[1] - ygv[0]));

    ctx.fillRect(padding + xIdx * scale, (nRows - yIdx - h) * scale, w * scale, h * scale);
    ctx.strokeRect(padding + xIdx * scale, (nRows - yIdx - h) * scale, w * scale, h * scale);
  }

  // Etiquetas del eje Y
  ctx.save();
  ctx.fillStyle = "black";
  ctx.translate(15, (ygv.length * scale) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Y (m)", 0, 0);
  ctx.restore();

  ctx.fillStyle = "black";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let j = nRows-1; j > 0; j -= 5) {
    const y = (nRows - j) * scale + scale / 2;
    ctx.fillText(ygv[j].toFixed(1), padding-5 , y);
  }

  // Etiquetas del eje X
  ctx.textAlign = "center";
  ctx.fillStyle = "black";

  ctx.fillText("X (m)", padding + (xgv.length * scale) / 2, height - 10);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = nCols-1; i>0; i-=5){//0; i < nCols; i += 5) {
    ctx.fillText(xgv[i].toFixed(1), padding + i * scale + scale / 2, height - padding + 5);
  }

  // Ejes
  ctx.beginPath();
  ctx.moveTo(padding, 0);
  ctx.lineTo(padding, nRows * scale);
  ctx.moveTo(padding, nRows * scale);
  ctx.lineTo(width, nRows * scale);
  ctx.stroke();

  // Leyenda vertical
  const legendHeight = height - padding-15;
  const legendX = width - width_legend;
  const legendY = 5;//Primer punto de la leyenda
  const gradient = ctx.createLinearGradient(0, legendY, 0, legendHeight);
  gradient.addColorStop(0, getColor(maxVal));
  gradient.addColorStop(1, getColor(minVal));

  ctx.fillStyle = gradient;
  ctx.fillRect(legendX, legendY, 20, legendHeight);

  ctx.strokeStyle = "black";
  ctx.strokeRect(legendX, legendY,20, legendHeight);

  ctx.fillStyle = "black";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  
  const nTicks = 5; // Número total de marcas (incluye min y max)
  for (let i = 0; i < nTicks; i++) {
    const t = i / (nTicks - 1);
    const y = legendY + t * legendHeight;
    const val = maxVal - t * (maxVal - minVal);

    ctx.fillText(val.toFixed(1), legendX + width_legend, y);
  }

  // Añadir a la página
  const container = document.getElementById("visualRadiacion");
  container.innerHTML = "";

  const titulo = document.createElement("h3");
  titulo.textContent = "Energía acumulada en el terreno (kWh/m²)";
  titulo.style.textAlign = "center";
  titulo.style.marginBottom = "10px";
  container.appendChild(titulo);

  container.appendChild(canvas);
}