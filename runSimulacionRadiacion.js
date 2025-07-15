function runSimulacionRadiacion(datos, paneles){
  const container = document.getElementById("visualRadiacion");
  container.innerHTML = ""; // Limpiar si ya existe

 //Realiza toda la simulación de radiación solar y devuelve resultados estructurados
 // === Parámetros de entrada ===
	const {
    fecha_inicio, fecha_fin,latitud, longitud, nFilas, nCols, margen, day_interval,
    inclinacion, orientacion: gamma, albedo, malla, G0, tau_dir, f_gap,k_t, fd
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

  console.log(`Área estimada del terreno = ${area_terreno.toFixed(2)} m²`);

  // === Bucle por días ===
  let dia = new Date(fecha_inicio);
  const end = new Date(fecha_fin);

  if (dia > end){
    console.error("❌ la fecha de inicio no puede ser posterior a la final", paneles);
    return;
  }

  while (dia < end) {
    console.log("dia:", dia);
    const dt = 900; // segundos (15 min)
    const times = generateTimeSeries(dia, 7, 19, dt);
    const n = getDayOfYear(dia);
    const G_on = G0 * (1 + 0.033 * Math.cos((2 * Math.PI / 365) * (n - 1)));
    console.log("G0", G0, "n:", n);

    let E_accum = zeros(nRows, nColsGrid); 
    let E_por_panel = new Array(nFilas * nCols).fill(0);
    console.log("E_por_panel 0:", E_por_panel);
    console.log("times.length:", times.length);

    for (let t = 0; t < times.length; t++) {
      const [sunAz, sunAlt] = sunPosition(times[t], latitud, longitud);
      console.log("longitud", longitud, "sunAlt:", sunAlt);
      if (sunAlt > 0) {
        const sv = normalize([
          Math.cos(deg2rad(sunAlt)) * Math.sin(deg2rad(sunAz)),
          Math.cos(deg2rad(sunAlt)) * Math.cos(deg2rad(sunAz)),
          Math.sin(deg2rad(sunAlt))
        ]);

        const nn = normalize([
          Math.sin(deg2rad(beta)) * Math.sin(deg2rad(gamma)),
          Math.sin(deg2rad(beta)) * Math.cos(deg2rad(gamma)),
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

        E_accum[ii][jj] += I_total * dt / 3600 / 1000;  // kWh/m²
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
        E_por_panel[p] += I_total_pv * A_panel * dt / 3600 / 1000;  // kWh
        //console.log("I_dir_pv",I_dir_pv,"E panel 1:", E_por_panel);
      }
    }
  
	

    // Guardar resultados diarios
    E_terreno_dias.push(E_accum);
    //console.log("E accum:", E_accum);
    E_paneles_dias.push(E_por_panel.reduce((a, b) => a + b, 0));
    E_por_panel_dias.push(E_por_panel);

    dia.setDate(dia.getDate() + day_interval);
    }
  }
  }

  // === Resultado total acumulado ===
  const dias_calculados = generateDayIntervals(new Date(fecha_inicio), new Date(fecha_fin), day_interval);
  const dias_por_intervalo = dias_calculados.map((_, i) =>
    i < dias_calculados.length - 1 ? day_interval : getDayOfYear(end) - getDayOfYear(dias_calculados[i]) + 1);

  console.log("E panel dia:", E_por_panel_dias);
  const E_por_panel_total = sumPaneles(E_por_panel_dias, dias_por_intervalo);
  const E_paneles_total = E_por_panel_total.reduce((a, b) => a + b, 0);
  const E_terreno_total = accumulateTerreno(E_terreno_dias, dias_por_intervalo);
  console.log("paneles:", paneles);
  console.log("dias_por_intervalo",dias_por_intervalo,"E_terreno_total", E_terreno_total)
  mostrarMapaEnergiav2(xgv, ygv, E_terreno_total, paneles)

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
    fecha_inicio,
    fecha_fin,
    latitud,
    longitud
  };
}

function sunPosition(time, lat, lon) {

  // Día del año
  const doy = getDayOfYear(time);
  console.log("time:", time);
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

function mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles){
var i = 0, 
  isPlaying = false; 
const ctx = document.getElementById('resultsChart').getContext('2d');
chart = new Chart(ctx, {
  type: 'chartDiv',
    data: { 
    type: 'heatmap solid', 
    margin_right: 15, 
    title_label_text: 'Heatmap Data', 
    animation_duration: 0, 
    defaultSeries: { 
      // Padding between cells 
      shape_innerPadding: -0.02, 
      // Improves performance. 
      mouseTracking_enabled: false
    }, 
    defaultPoint: { 
      outline_color: 'none', 
      outline_width: 0 
    }, 
    xAxis_label_text: 'Longitude', 
    yAxis_label_text: 'Latitude', 
    zAxis_label_text: 'Heat Delta', 
    palette: { 
      /*Using a function instead of token like '%zValue' improves performance.*/
      pointValue: function(p) { 
        return p.options('z'); 
      }, 
      colors: [ 
        '#ffffcc', 
        '#ffeda0', 
        '#fed976', 
        '#feb24c', 
        '#fd8d3c', 
        '#fc4e2a', 
        '#e31a1c', 
        '#bd0026', 
        '#b00026'
      ] 
    }, 
    series: [{ E_terreno_total }], 
    toolbar_items: { 
      Stop: { 
        type: 'option', 
        icon_name: 'system/default/pause', 
        margin: 10, 
        boxVisible: true, 
        label_text: 'Pause', 
        events: { 
          change: function() { 
            playPause(this.chart); 
          } 
        }, 
        states_select: { 
          icon_name: 'system/default/play', 
          label_text: 'Play'
        } 
      } 
    } 
  }, 

  }) 
}
function mostrarMapaEnergiav2(xgv, ygv, E_terreno_total, paneles){
  const canvas = document.createElement("canvas");
  const titulo = document.createElement("h3");
  titulo.textContent = "Energía acumulada en el terreno (kWh/m²)";
  titulo.style.textAlign = "center"; 
  titulo.style.marginBottom = "10px";
    
  const scale = 2; // Escala para aumentar resolución
  canvas.width = xgv.length * scale;
  canvas.height = ygv.length * scale;

  const ctx = canvas.getContext("2d");

  const nRows = ygv.length;
  const nCols = xgv.length;

  // Colores para el mapa (simple interpolación entre azul y amarillo)
  const getColor = (v, min, max) => {
    const ratio = (v - min) / (max - min);
    const r = Math.floor(255 * ratio);
    const g = Math.floor(255 * ratio);
    const b = Math.floor(255 * (1 - ratio));
    return `rgb(${r},${g},${b})`;
  };

  const minVal = Math.min(...E_terreno_total.flat());
  const maxVal = Math.max(...E_terreno_total.flat());

  // Dibujar celdas de energía
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nRows; j++) {
      const val = E_terreno_total[j][i]; // [fila][columna]
      ctx.fillStyle = getColor(val, minVal, maxVal);
      ctx.fillRect(i * scale, (nRows - j - 1) * scale, scale, scale); // invertir eje Y
    }
  }

  // Dibujar paneles como rectángulos translúcidos
  ctx.strokeStyle = "withe";
  ctx.fillStyle = "rgba(200,200,255,0.6)";
  for (const p of paneles) {
    const xs = [p.PL[0], p.PR[0], p.TL[0], p.TR[0]];
    const ys = [p.PL[1], p.PR[1], p.TL[1], p.TR[1]];

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const x = xgv.findIndex(val => val >= xMin);
    const w = Math.round((xMax - xMin) / (xgv[1] - xgv[0]));
    const y = ygv.findIndex(val => val >= yMin);
    const h = Math.round((yMax - yMin) / (ygv[1] - ygv[0]));

    const px = x * scale;
    const py = (nRows - y - h) * scale;

    ctx.fillRect(px, py, w * scale, h * scale);
    ctx.strokeRect(px, py, w * scale, h * scale);
  }

  const legend = document.createElement("canvas");
  legend.width = 300;
  legend.height = 40;
  const lctx = legend.getContext("2d");

  const gradient = lctx.createLinearGradient(0, 0, legend.width, 0);
  gradient.addColorStop(0, "rgb(0,0,255)");   // azul
  gradient.addColorStop(0.5, "rgb(255,255,0)"); // amarillo
  gradient.addColorStop(1, "rgb(255,0,0)");   // rojo

  lctx.fillStyle = gradient;
  lctx.fillRect(0, 0, legend.width, 20);

  // Etiquetas
  lctx.fillStyle = "black";
  lctx.font = "12px Arial";
  lctx.fillText(minVal.toFixed(1), 0, 35);
  lctx.fillText(((minVal + maxVal) / 2).toFixed(1), legend.width / 2 - 10, 35);
  lctx.fillText(maxVal.toFixed(1), legend.width - 30, 35);

  // Añadir al contenedor
  const container = document.getElementById("visualRadiacion");
  container.innerHTML = ""; // limpiar anterior
  container.appendChild(titulo);
  container.appendChild(canvas);
  container.appendChild(legend);
}


function sumPaneles(E_por_panel_dias, dias_por_intervalo) {
  const n = E_por_panel_dias[0].length;
  const total = new Array(n).fill(0);

  for (let i = 0; i < E_por_panel_dias.length; i++) {
    const pesos = dias_por_intervalo[i];
    const energiaDia = E_por_panel_dias[i];

    for (let j = 0; j < n; j++) {
      total[j] += energiaDia[j] * pesos;
    }
  }

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
  const nRows = E_terreno_dias[0].length;
  const nCols = E_terreno_dias[0][0].length;
  console.log("dias_por_intervalo",dias_por_intervalo[0])

  const total = zeros(nRows, nCols);

  for (let k = 0; k < E_terreno_dias.length; k++) {
    const matrizDia = E_terreno_dias[k];
    const peso = dias_por_intervalo[k];
    //console.log("matrizDia",matrizDia,"peso", peso)
    for (let i = 0; i < matrizDia.length; i++) {
      for (let j = 0; j < matrizDia[i].length; j++) {
        if (isFinite(matrizDia[i][j]) && isFinite(peso)) {
          total[i][j] += matrizDia[i][j] * peso;
          //console.log("total[i][j]",total[i][j],"peso", peso)
        } else {
          /*console.warn(`⚠️ NaN detectado en k=${k}, i=${i}, j=${j}`, {
            valor: matrizDia[i][j],
            peso: peso
          });*/
        }
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