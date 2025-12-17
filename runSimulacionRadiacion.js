async function runSimulacionRadiacion(datos, paneles){
  if (typeof window.disableHelp === "function") window.disableHelp();
  const btns = Array.from(document.querySelectorAll('button'));
  try {
    showLoader("Calculando simulación…");
    btns.forEach(b => b.disabled = true);
    await yieldToUI();

     const container = document.getElementById("visualRadiacion");
      container.innerHTML = ""; // Limpiar si ya existe

   //Realiza toda la simulación de radiación solar y devuelve resultados estructurados
   // === Parámetros de entrada ===
  	const {
      fecha_inicio, fecha_fin,latitud, longitud, nFilas, nCols, margen, day_interval,efficiency,
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
    //console.log("ymin:", ymin);
    //console.log("xmin:", xmin);
    //console.log("res:", malla);
    const xgv = linspace(xmin, xmax, malla);
    const ygv = linspace(ymin, ymax, malla);
    //console.log("xgv:", xgv);
    const { XX, YY } = meshgrid(xgv, ygv);
    //console.log("XX:", XX);
    const nRows = XX.length;
    const nColsGrid = XX[0].length;
    const area_terreno = (xmax - xmin) * (ymax - ymin);
    const area_malla = area_terreno / (malla * malla);

    const E_terreno_dias = [];
    const E_paneles_dias = [];
    const E_por_panel_dias = [];

    console.log(`Estimación de ocupación del terreno = ${area_terreno.toFixed(2)} m²`);

    // === Bucle por días ===
    let dia = new Date(fecha_inicio);
    const end = new Date(fecha_fin);

    if (dia > end){
      console.error("❌ la fecha de inicio no puede ser posterior a la final", paneles);
      return;
    }
    let iterDia = 0;

    while (dia <= end) {
      if (iterDia % 1 === 0) {
        showLoader(`Calculando… (día ${iterDia + 1})`);
        await yieldToUI();
      }

      const dt = 900; // segundos (15 min)
      const times = generateTimeSeries(dia, 4, 22, dt);
      const n = getDayOfYear(dia);
      const G_on = G0 * (1 + 0.033 * Math.cos((2 * Math.PI / 365) * (n - 1)));
      console.log("G0", G0, "n:", n);

      let E_accum = zeros(nRows, nColsGrid); 
      let E_por_panel = new Array(nFilas * nCols).fill(0);
      //console.log("E_por_panel 0:", E_por_panel);
      //console.log("times.length:", times.length);

      for (let t = 0; t < times.length; t++) {
        const [sunAz, sunAlt] = sunPosition(times[t], latitud, longitud);
        //console.log("longitud", longitud, "sunAlt:", sunAlt);
        if (sunAlt > 0) {
          const sv = normalize([
            Math.cos(deg2rad(sunAlt)) * Math.sin(deg2rad(sunAz)),
            Math.cos(deg2rad(sunAlt)) * Math.cos(deg2rad(sunAz)),
            Math.sin(deg2rad(sunAlt))
          ]);

          const nn = normalize([
            Math.sin(deg2rad(beta)) * Math.cos(deg2rad(gamma)),
            Math.sin(deg2rad(beta)) * Math.sin(deg2rad(gamma)),
            Math.cos(deg2rad(beta))
          ]);

      const theta_z = 90 - sunAlt;
      const cos_theta_i = Math.max(0, dotProduct(nn, sv));
      const DNI = k_t * G_on * Math.cos(deg2rad(theta_z)); //al multiplicar por cos(theta_z) se proyecta la radiación directa sobre el terreno
      //console.log("k_t", k_t, "G0",G0,"theta_z:", theta_z);
      //Estimar DHI como fracción de DNI
      const DHI = fd * DNI;
      const GHI = DNI + DHI;


      //SOBRE LOS PANELES INCLINADOS
      const DNI_pv = Math.max(0, k_t * G_on * cos_theta_i);
      const DHI_pv = DHI * (1 + Math.cos(deg2rad(beta))) / 2;

      // === Irradiancia sobre terreno ===
      for (let ii = 0; ii < nRows; ii++) {
        for (let jj = 0; jj < nColsGrid; jj++) {
          const P = [XX[ii][jj], YY[ii][jj], 0];
          let inShadow = false;
          for (let k = 0; k < paneles.length; k++) {
            if (rayIntersectsPanel(P, sv, paneles[k])) {
              inShadow = true;
              break;
            }
          }

          const I_dir = DNI * (inShadow ? tau_dir : 1);
          const f_vis = inShadow ? f_gap : 1;
          const I_dif = DHI * f_vis;
          const I_ref = albedo * (I_dir + I_dif);
          const I_total = I_dir + I_dif + I_ref;
          //console.log("inShadow:", inShadow, "I_dir", I_dir);

          E_accum[ii][jj] = E_accum[ii][jj] + I_total * dt / 3600 / 1000;  // kWh/m²
        }
      }

      // === Irradiancia sobre paneles ===
      for (let p = 0; p < paneles.length; p++) {
        const V = paneles[p];
        const pts = [
          averagePoints([V.PL, V.PR, V.TL, V.TR]),
          V.PL,
          V.PR
        ];
        let sombra = false;

        for (let q = 0; q < paneles.length; q++) {
          if (q === p) continue;
          for (const pt of pts) {
            if (rayIntersectsPanel(pt, sv, paneles[q])) {
              sombra = true;
              break;
            }
          }
          if (sombra) break;
        }

        if (!sombra) {
          const normal = normalize(crossProduct(subtract(V.PR, V.PL), subtract(V.TL, V.PL)));
          const A_panel = vectorNorm(crossProduct(subtract(V.PR, V.PL), subtract(V.TL, V.PL)));
          const I_dir_pv = DNI_pv;
          const I_dif_pv = DHI_pv;
          const I_ref_pv = albedo * GHI * (1 + Math.cos(deg2rad(beta))) / 2;
          const I_total_pv = I_dir_pv + I_dif_pv + I_ref_pv;
          E_por_panel[p] += efficiency*I_total_pv * A_panel * dt / 3600 / 1000;  // kWh
          //console.log("I_dir_pv",I_dir_pv,"E panel 1:", E_por_panel);
        }
      }
    
  	   }
    }

    // Guardar resultados diarios
    E_terreno_dias.push(E_accum);
    //console.log("E accum:", E_accum);
    E_paneles_dias.push(E_por_panel.reduce((a, b) => a + b, 0));
    E_por_panel_dias.push(E_por_panel);

    dia.setDate(dia.getDate() + day_interval);
    iterDia++;
   
    }

    // === Resultado total acumulado ===
    const dias_calculados = generateDayIntervals(new Date(fecha_inicio), new Date(fecha_fin), day_interval);
    const dias_por_intervalo = dias_calculados.map((_, i) =>
      i < dias_calculados.length - 1 ? day_interval : getDayOfYear(end) - getDayOfYear(dias_calculados[i]) + 1);

    //console.log("E panel dia:", E_por_panel_dias);
    const E_por_panel_total = sumPaneles(E_por_panel_dias, dias_por_intervalo);
    const E_paneles_total = E_por_panel_total.reduce((a, b) => a + b, 0);
    const E_terreno_total = accumulateTerreno(E_terreno_dias, dias_por_intervalo);
    const allVals=E_terreno_total.flat(Infinity)  // aplana todos los niveles
                                 .filter(v => Number.isFinite(v));
    console.log("dias_por_intervalo",dias_por_intervalo,"E_paneles_total", E_paneles_total,"E_por_panel_dias", E_por_panel_dias,"E_por_panel_total", E_por_panel_total, "E_terreno_total", allVals)
    mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles)
    mostrarGraficoPaneles(E_por_panel_total)
    const { byMonth, labels, values } = agruparEnergiaPorMes(fecha_inicio, fecha_fin, day_interval, E_paneles_dias);
    renderEnergiaPorMes(labels, values);

    // === 6. Empaquetar resultados ===
    return {
      E_paneles_dias, // estructura cell con tantos valores como numDias
      E_por_panel_dias, // estructura cell con tantos vectores horizontales de nDias
      E_paneles_total, // núm. entero
      E_por_panel_total,
      xgv,
      ygv,
      Area_terreno: area_terreno,
      Area_malla: area_malla,
      E_terreno_dias,
      E_terreno_total,
      allVals,
      fecha_inicio,
      fecha_fin,
      latitud,
      longitud
    };
  } catch (err) {
    console.error(err);
    alert("Ha ocurrido un error en la simulación. Revisa la consola.");
  } finally {
    hideLoader();
    btns.forEach(b => b.disabled = false);
  }
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

let graficoPorPanel2;

function mostrarGraficoPaneles(E_por_panel_total) {
  const ctx = document.getElementById("graficoPorPanel").getContext("2d");
  ctx.innerHTML = ""; // Limpiar si ya existe

  if(graficoPorPanel2){graficoPorPanel2.destroy();}
  
  const labels = E_por_panel_total.map((_, i) => `Panel ${i + 1}`);
  console.log("E_por_panel",E_por_panel_total);
  graficoPorPanel2 = new Chart(ctx, {
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

let graficoEnergiaMes; // variable global para evitar el error de canvas en uso
function renderEnergiaPorMes(labels, values){
  const ctx = document.getElementById('graficoMensual').getContext('2d');
  if (graficoEnergiaMes) graficoEnergiaMes.destroy();
  graficoEnergiaMes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Energía total (kWh) por mes',
        data: values,
        backgroundColor: 'rgba(46,139,87,0.6)'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Energía total mensual (kWh)' },
        tooltip: { callbacks: {
          label: (ctx) => `${ctx.parsed.y.toFixed(0)} kWh`
        }}
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'kWh' }
        },
        x: {
          title: { display: true, text: 'Mes (YYYY-MM)' }
        }
      }
    }
  });
}


function mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles) {
   console.log(">>> NUEVA mostrarMapaEnergia ejecutándose (v2)");
  const container = document.getElementById("visualRadiacion");
  container.innerHTML = "";

  // --- Título ---
  const titulo = document.createElement("h3");
  titulo.textContent = "Energía acumulada en el terreno (kWh/m²)";
  titulo.style.textAlign = "center";
  titulo.style.marginBottom = "10px";
  container.appendChild(titulo);

  // --- Validaciones ---
  if (!Array.isArray(xgv) || !Array.isArray(ygv) || !Array.isArray(E_terreno_total)) {
    container.appendChild(document.createTextNode("Datos inválidos para el mapa de calor."));
    return;
  }
  const nCols = xgv.length;
  const nRows = ygv.length;
  if (nCols < 2 || nRows < 2) {
    container.appendChild(document.createTextNode("xgv/ygv deben tener al menos 2 valores."));
    return;
  }

  // --- Dominio físico (m) ---
  const xMin = xgv[0], xMax = xgv[nCols - 1];
  const yMin = ygv[0], yMax = ygv[nRows - 1];
  const Lx = xMax - xMin;
  const Ly = yMax - yMin;

  // --- Resolución física por celda (m) ---
  const dx_m = xgv[1] - xgv[0];
  const dy_m = ygv[1] - ygv[0];

  // --- Min/Max robustos (ignorar NaN) ---
  const flatVals = E_terreno_total.flat().filter(Number.isFinite);
  if (flatVals.length === 0) {
    container.appendChild(document.createTextNode("E_terreno_total no contiene valores numéricos válidos."));
    return;
  }
  const minVal = Math.min(...flatVals);
  const maxVal = Math.max(...flatVals);

  // --- Layout del canvas ---
  const paddingLeft = 60;   // eje Y + ticks
  const paddingBottom = 55; // eje X + ticks
  const paddingTop = 10;

  // Escala métrica: px por metro (ajustable)
  const pxPerMeter = 20; 

  const mapW = Math.max(1, Lx * pxPerMeter);
  const mapH = Math.max(1, Ly * pxPerMeter);

  const legendW = 20;
  const legendGap = 16;
  const legendTextW = 60;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(paddingLeft + mapW + legendGap + legendW + legendTextW + 10);
  canvas.height = Math.ceil(paddingTop + mapH + paddingBottom);

  const ctx = canvas.getContext("2d");

  // Fondo blanco (por si el contenedor tiene color)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- Colormap: azul oscuro -> verde (medio) -> amarillo (alto) ---
  function getColor(v) {
    if (!Number.isFinite(v)) return "rgb(220,220,220)";
    const denom = (maxVal - minVal);
    const ratio = denom === 0 ? 0.5 : (v - minVal) / denom;

    // 0 => azul, 0.5 => verde, 1 => amarillo
    const t = Math.max(0, Math.min(1, ratio));
    let r, g, b;

    if (t < 0.5) {
      const u = t / 0.5;       // 0..1
      r = 0;
      g = Math.round(200 * u); // sube hacia verde
      b = Math.round(160 + 95 * (1 - u)); // azul -> algo menos azul
    } else {
      const u = (t - 0.5) / 0.5;
      r = Math.round(255 * u); // verde -> amarillo (sube rojo)
      g = 255;
      b = Math.round(160 * (1 - u)); // baja azul
    }
    return `rgb(${r},${g},${b})`;
  }

  // --- Helpers coordenadas físicas -> píxel ---
  // Mapeo: x aumenta a la derecha; y aumenta hacia arriba
  const Xpix = (x_m) => paddingLeft + (x_m - xMin) * pxPerMeter;
  const Ypix = (y_m) => paddingTop + (yMax - y_m) * pxPerMeter; // invertido

  // Tamaño de cada celda en píxeles (según dx_m/dy_m reales)
  const cellW = Math.max(1, dx_m * pxPerMeter);
  const cellH = Math.max(1, dy_m * pxPerMeter);

  // --- Dibujar heatmap (por coordenadas físicas reales) ---
  for (let j = 0; j < nRows; j++) {
    const row = E_terreno_total[j];
    const y0 = ygv[j];
    for (let i = 0; i < nCols; i++) {
      const val = row?.[i];
      ctx.fillStyle = getColor(val);
      const x0 = xgv[i];

      // rectángulo de celda, anclado en (x0, y0)
      // Ojo: queremos que ocupe hacia +x y hacia +y
      // En píxel, +y es hacia abajo, así que usamos Ypix(y0 + dy_m)
      const x = Xpix(x0);
      const y = Ypix(y0 + dy_m);

      ctx.fillRect(x, y, cellW, cellH);
    }
  }

  // --- Dibujar paneles (proyección en X-Y) ---
  if (Array.isArray(paneles)) {
    ctx.fillStyle = "rgba(180,180,255,0.6)";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;

    for (const p of paneles) {
      if (!p?.PL || !p?.PR || !p?.TL || !p?.TR) continue;

      const xs = [p.PL[0], p.PR[0], p.TL[0], p.TR[0]];
      const ys = [p.PL[1], p.PR[1], p.TL[1], p.TR[1]];

      const px0 = Math.min(...xs), px1 = Math.max(...xs);
      const py0 = Math.min(...ys), py1 = Math.max(...ys);

      const x = Xpix(px0);
      const y = Ypix(py1); // top (y mayor)
      const w = Math.max(1, (px1 - px0) * pxPerMeter);
      const h = Math.max(1, (py1 - py0) * pxPerMeter);

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }

  // --- Ejes ---
  const xAxisY = paddingTop + mapH;
  const yAxisX = paddingLeft;

  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(yAxisX, paddingTop);
  ctx.lineTo(yAxisX, xAxisY);
  ctx.lineTo(paddingLeft + mapW, xAxisY);
  ctx.stroke();

  // --- Títulos de ejes ---
  ctx.fillStyle = "black";
  ctx.font = "12px Arial";

  // X title
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("X (m)", paddingLeft + mapW / 2, xAxisY + 28);

  // Y title
  ctx.save();
  ctx.translate(18, paddingTop + mapH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Y (m)", 0, 0);
  ctx.restore();

  // --- Ticks X/Y (10 aprox) ---
  const tickCount = 10;

  // X ticks
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let k = 0; k <= tickCount; k++) {
    //--- X ticks: solo enteros (m) y no demasiados ---
    const xStart = Math.ceil(xMin);
    const xEnd = Math.floor(xMax);

    // decide cada cuántos metros dibujar (para que no se amontonen)
    const maxXTicks = 10; // objetivo: no más de ~10 etiquetas
    const span = Math.max(1, xEnd - xStart);
    const step = Math.max(1, Math.ceil(span / maxXTicks));

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let xInt = xStart; xInt <= xEnd; xInt += step) {
      const x = Xpix(xInt);

      // marca
      ctx.beginPath();
      ctx.moveTo(x, xAxisY);
      ctx.lineTo(x, xAxisY + 4);
      ctx.stroke();

      // etiqueta (entero)
      ctx.fillText(String(xInt), x, xAxisY + 8);
    }
  }

  // Y ticks
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= tickCount; k++) {
    const y_m = yMin + (Ly * k) / tickCount;
    const y = Ypix(y_m);
    ctx.beginPath();
    ctx.moveTo(yAxisX - 4, y);
    ctx.lineTo(yAxisX, y);
    ctx.stroke();
    ctx.fillText(y_m.toFixed(1), yAxisX - 6, y);
  }

  // --- Leyenda vertical (muestreando getColor) ---
  const legendX = paddingLeft + mapW + legendGap;
  const legendY = paddingTop;
  const legendH = mapH;

  // pinta la barra en N pasos
  const steps = 200;
  for (let s = 0; s < steps; s++) {
    const t = s / (steps - 1);              // 0..1 (arriba->abajo)
    const val = maxVal - t * (maxVal - minVal);
    ctx.fillStyle = getColor(val);
    const y = legendY + (t * legendH);
    ctx.fillRect(legendX, y, legendW, legendH / steps + 1);
  }

  ctx.strokeStyle = "black";
  ctx.strokeRect(legendX, legendY, legendW, legendH);

  // ticks leyenda
  ctx.fillStyle = "black";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const nTicksLegend = 9;
  for (let i = 0; i < nTicksLegend; i++) {
    const t = i / (nTicksLegend - 1);
    const y = legendY + t * legendH;
    const val = maxVal - t * (maxVal - minVal);
    ctx.fillText(val.toFixed(1), legendX + legendW + 8, y);
  }

  // Añadir canvas (se centrará con tu CSS flex en #visualRadiacion)
  container.appendChild(canvas);
}


function sumPaneles(E_por_panel_dias, dias_por_intervalo) {
  const n = E_por_panel_dias[0].length;
  const total = new Array(n).fill(0);
  console.log("n",n,"total", total,"E_por_panel_dias.length", E_por_panel_dias.length)
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

// Utilidades de fecha en UTC para evitar desfases por huso
function toUTCDate(y, m, d){ return new Date(Date.UTC(y, m - 1, d)); }
function addDaysUTC(d, n){ const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }
function ymdUTC(d){ return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
function ymKey(d){ const { y, m } = ymdUTC(d); return `${y}-${String(m).padStart(2,'0')}`; }

function generarDiasYpesos(fecha_inicio, fecha_fin, day_interval){
  const start = new Date(fecha_inicio);
  const end   = new Date(fecha_fin);
  // Pasar a UTC "puro"
  const s = toUTCDate(start.getFullYear(), start.getMonth()+1, start.getDate());
  const e = toUTCDate(end.getFullYear(),   end.getMonth()+1,   end.getDate());

  const dias = [];
  for (let d = new Date(s); d <= e; d = addDaysUTC(d, day_interval)) dias.push(new Date(d));

  // Pesos: nº de días que representa cada muestra; el último puede ser menor
  const dayOfYear = d => {
    const jan0 = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((d.getTime() - jan0) / 86400000);
  };
  const n1 = dayOfYear(s), n2 = dayOfYear(e);
  const pesos = Array(dias.length).fill(day_interval);
  if (pesos.length) {
    const lastRep = dias[dias.length - 1];
    pesos[pesos.length - 1] = (n2 - dayOfYear(lastRep)) + 1; // días restantes hasta fin
  }
  return { dias, pesos }; // ambas arrays de igual longitud
}

function agruparEnergiaPorMes(fecha_inicio, fecha_fin, day_interval, E_paneles_dias){
  const { dias, pesos } = generarDiasYpesos(fecha_inicio, fecha_fin, day_interval);
  if (E_paneles_dias.length !== dias.length) {
    console.warn("Longitudes no coinciden: E_paneles_dias vs dias simulados.",
                 E_paneles_dias.length, dias.length);
  }else{
    console.log("agrupardiaMEs",dias, pesos);
  }
  const byMonth = {}; // { 'YYYY-MM': kWh }

  for (let i = 0; i < dias.length; i++){
    const repDate = dias[i];
    const w = Math.max(1, pesos[i] || 1);         // nº de días reales que representa
    const eRep = Number(E_paneles_dias[i]) || 0;  // kWh/día “representativo”

    // Repartimos ese valor por cada día real del bloque
    const ePerDay = eRep; // si E_paneles_dias ya es kWh/día, cada día del bloque recibe eRep
    for (let d = 0; d < w; d++){
      const theDay = addDaysUTC(repDate, d);
      const key = ymKey(theDay);
      byMonth[key] = (byMonth[key] || 0) + ePerDay;
    }
  }

  // Orden cronológico de claves
  const keys = Object.keys(byMonth).sort((a,b) => a.localeCompare(b));
  const vals = keys.map(k => byMonth[k]);

  return { byMonth, labels: keys, values: vals };
}

function showLoader(msg = "Calculando…") {
  const ov = document.getElementById("loaderOverlay");
  if (!ov) return;
  const t = ov.querySelector(".loader-text");
  if (t) t.textContent = msg;
  ov.style.display = "flex";
  // opcional: bloquear scroll
  document.body.style.overflow = "hidden";
}

function hideLoader() {
  const ov = document.getElementById("loaderOverlay");
  if (!ov) return;
  ov.style.display = "none";
  document.body.style.overflow = "";
}

function yieldToUI() {
  return new Promise(requestAnimationFrame);
}