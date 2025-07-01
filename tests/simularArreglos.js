function simularArreglos(datos) {
  const {
    latitud,
    fecha_inicio,
    nFilas,
    nCols,
    sepX,
    sepY: sepYOriginal,
    panelW,
    panelL,
    h_pv,
    inclinacion,
    orientacion: gamma
  } = datos;

  const beta = 90 - inclinacion;
  let sepY = sepYOriginal;

  // Calculamos separación minima entre paneles
  const sepYmin = calcularSeparacionMinima(panelL, inclinacion, latitud, fecha_inicio);

  if (sepY < sepYmin) {
    console.warn(`⚠️  Aviso: separación entre filas (${sepY} m) insuficiente. Se ajusta a mínimo: ${sepYmin} m.`);
    sepY = sepYmin;
  }

  const paneles = [];

  for (let i = 0; i < nFilas; i++) {
    for (let j = 0; j < nCols; j++) {
      const x_c = j * (panelW + sepX) + panelW / 2;
      const y_proj = panelL * Math.sin(deg2rad(beta));
      const y_c = i * (y_proj + sepY) + y_proj / 2;
      const z_c = h_pv + (panelL / 2) * Math.sin(deg2rad(beta));

      const nx = Math.sin(deg2rad(gamma)) * Math.cos(deg2rad(beta));
      const ny = Math.cos(deg2rad(gamma)) * Math.cos(deg2rad(beta));
      const nz = Math.sin(deg2rad(beta));
      const normal = [nx, ny, nz];

      const vx = -Math.sin(deg2rad(beta)) * Math.sin(deg2rad(gamma));
      const vy = -Math.sin(deg2rad(beta)) * Math.cos(deg2rad(gamma));
      const vz = Math.cos(deg2rad(beta));
      const v_long = [vx, vy, vz];

      const v_short = crossProduct(normal, v_long);

      const center = [x_c, y_c, z_c];

      const TL = vectorAdd(center, vectorSubtract(scalarMultiply(v_long, 0.5 * panelL), scalarMultiply(v_short, 0.5 * panelW)));
      const TR = vectorAdd(center, vectorAdd(scalarMultiply(v_long, 0.5 * panelL), scalarMultiply(v_short, 0.5 * panelW)));
      const BL = vectorSubtract(center, vectorAdd(scalarMultiply(v_long, 0.5 * panelL), scalarMultiply(v_short, 0.5 * panelW)));
      const BR = vectorSubtract(center, vectorSubtract(scalarMultiply(v_long, 0.5 * panelL), scalarMultiply(v_short, 0.5 * panelW)));

      paneles.push({ TL, TR, PL: BL, PR: BR });
    }
  }

  return paneles;
}

// Helpers
function deg2rad(deg) {
  return deg * Math.PI / 180;
}

function rad2deg(rad) {
  return rad * 180 / Math.PI;
}

function scalarMultiply(v, s) {
  return v.map(x => x * s);
}

function vectorAdd(a, b) {
  return a.map((val, i) => val + b[i]);
}

function vectorSubtract(a, b) {
  return a.map((val, i) => val - b[i]);
}

function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function calcularSeparacionMinima(panelL, inclinacion, latitud, fecha) {
  // Día del año (1-365)
  const n = Math.floor((fecha - new Date(fecha.getFullYear(), 0, 0)) / 86400000);

  // Declinación solar (delta) en grados
  const delta = 23.45 * Math.sin(deg2rad(360 * (284 + n) / 365));

  // Hora solar crítica (por defecto: 10:00 solar)
  const h = 10;
  const omega = 15 * (h - 12); // ángulo horario

  // Altura solar (alpha) en grados
  const alpha = rad2deg(Math.asin(
    Math.sin(deg2rad(latitud)) * Math.sin(deg2rad(delta)) +
    Math.cos(deg2rad(latitud)) * Math.cos(deg2rad(delta)) * Math.cos(deg2rad(omega))
  ));

  // Separación mínima
  const sepYmin = panelL * Math.sin(deg2rad(inclinacion)) / Math.tan(deg2rad(alpha));
  return sepYmin;
}
