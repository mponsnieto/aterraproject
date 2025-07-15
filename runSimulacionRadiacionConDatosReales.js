function runSimulacionRadiacionConDatosReales (datos, paneles){
 //Realiza toda la simulación de radiación solar y devuelve resultados estructurados
 // === Parámetros de entrada ===
	const {
    fecha_inicio, fecha_fin,latitud, longitud, nFilas, nCols, margen,
    inclinacion, orientacion: gamma, albedo, resolucion_malla, G0, tau_dir, f_gap,k_t, fd
  	} = datos;
	
	beta=90-inclinacion;

  // === Malla del terreno ===
  const allX = paneles.flatMap(p => [p.PL[0], p.PR[0], p.TL[0], p.TR[0]]);
  const allY = paneles.flatMap(p => [p.PL[1], p.PR[1], p.TL[1], p.TR[1]]);
  const xmin = Math.min(...allX) - margen;
  const xmax = Math.max(...allX) + margen;
  const ymin = Math.min(...allY) - margen;
  const ymax = Math.max(...allY) + margen;

  const xgv = linspace(xmin, xmax, resolucion_malla);
  const ygv = linspace(ymin, ymax, resolucion_malla);
  const { XX, YY } = meshgrid(xgv, ygv);
  const nRows = XX.length;
  const nColsGrid = XX[0].length;
  const area_terreno = (xmax - xmin) * (ymax - ymin);
  const area_malla = area_terreno / (resolucion_malla * resolucion_malla);

  const E_terreno_dias = [];
  const E_paneles_dias = [];
  const E_por_panel_dias = [];

  console.log(`Área estimada del terreno = ${area_terreno.toFixed(2)} m²`);

  // === Bucle por días ===
  let dia = new Date(fecha_inicio);
  const end = new Date(fecha_fin);

  while (dia <= end) {
    const dt = 900; // segundos (15 min)
    const times = generateTimeSeries(dia, 7, 19, dt);
    const n = getDayOfYear(dia);
    const G_on = G0 * (1 + 0.033 * Math.cos((2 * Math.PI / 365) * (n - 1)));

    let E_accum = zeros(nRows, nColsGrid);
    let E_por_panel = new Array(nFilas * nCols).fill(0);

 for (let t = 0; t < times.length; t++) {
  const [sunAz, sunAlt] = sunPosition(times[t], latitud, longitud);

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
    const DNI = k_t * G_on * Math.cos(deg2rad(theta_z));
    const DHI = fd * DNI;
    const GHI = DNI + DHI;

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
      }
	}

    // Guardar resultados diarios
    E_terreno_dias.push(E_accum);
    E_paneles_dias.push(E_por_panel.reduce((a, b) => a + b, 0));
    E_por_panel_dias.push(E_por_panel);

    dia.setDate(dia.getDate() + day_interval);
  }

  // === Resultado total acumulado ===
  const dias_calculados = generateDayIntervals(new Date(fecha_inicio), new Date(fecha_fin), day_interval);
  const dias_por_intervalo = dias_calculados.map((_, i) =>
    i < dias_calculados.length - 1 ? day_interval : getDayOfYear(end) - getDayOfYear(dias_calculados[i]) + 1
  );

  const E_por_panel_total = sumPaneles(E_por_panel_dias, dias_por_intervalo);
  const E_paneles_total = E_por_panel_total.reduce((a, b) => a + b, 0);
  const E_terreno_total = accumulateTerreno(E_terreno_dias, dias_por_intervalo);

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
  const sinAlt = Math.sin(deg2rad(lat)) * Math.sin(deg2rad(delta)) +
                 Math.cos(deg2rad(lat)) * Math.cos(deg2rad(delta)) * Math.cos(deg2rad(HRA));
  const sunAlt = rad2deg(Math.asin(clamp(sinAlt, -1, 1)));

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

function mostrarMapaEnergia(xgv, ygv, E_terreno_total, paneles) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 1, 1000);
  camera.position.set(0, -50, 50);
  camera.lookAt(scene.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("visualResults").innerHTML = ""; // Limpiar anterior
  document.getElementById("visualResults").appendChild(renderer.domElement);

  const maxEnergy = Math.max(...E_terreno_total.flat());
  const minEnergy = Math.min(...E_terreno_total.flat());

  const nRows = xgv.length;
  const nCols = ygv.length;

  // Crear malla de calor
  for (let i = 0; i < nRows - 1; i++) {
    for (let j = 0; j < nCols - 1; j++) {
      const x = xgv[i];
      const y = ygv[j];
      const value = E_terreno_total[j][i];  // [y][x] por orientación de MATLAB
      const color = new THREE.Color().setHSL(0.7 - (value - minEnergy)/(maxEnergy - minEnergy)*0.7, 1, 0.5);

      const geometry = new THREE.PlaneGeometry(xgv[1] - xgv[0], ygv[1] - ygv[0]);
      const material = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
      const cell = new THREE.Mesh(geometry, material);
      cell.position.set(x, y, 0);
      scene.add(cell);
    }
  }

  // Paneles
  for (const p of paneles) {
    const shape = new THREE.Shape();
    shape.moveTo(p.PL[0], p.PL[1]);
    shape.lineTo(p.PR[0], p.PR[1]);
    shape.lineTo(p.TR[0], p.TR[1]);
    shape.lineTo(p.TL[0], p.TL[1]);
    shape.lineTo(p.PL[0], p.PL[1]);

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({ color: 0xB0C4FF, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, p.PL[2]);  // Altura según PL.z
    scene.add(mesh);
  }

  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(100, 100, 100).normalize();
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);

  const controls = new THREE.TrackballControls(camera, renderer.domElement);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}
}
}
