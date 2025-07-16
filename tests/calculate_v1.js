let chart = null;
function calculate() {
  //Datos de simulacion
  const fecha_inicio = new Date(document.getElementById('fecha_inicio').value);
  const fecha_fin = new Date(document.getElementById('fecha_fin').value);
  const day_interval = parseFloat(document.getElementById('day_interval').value);
  const weather = document.getElementById('weather').value;
  
  //Datos de ubicación
  const area = parseFloat(document.getElementById('area').value);
  const latitud =  parseFloat(document.getElementById('latitud').value);  //Latitud del lugar (positiva en el hemisferio norte) (grados decimales)
  const longitud =  parseFloat(document.getElementById('longitud').value);  //Longitud del lugar (positiva hacia el este) (grados decimales)
  const malla = parseFloat(document.getElementById('resolucion_malla').value)
  const albedo = parseFloat(document.getElementById('albedo').value)
  const G0 = parseFloat(document.getElementById('G0').value); //Constante solar
  const f_gap = 0.2; //Fracción de cielo visible bajo panel (entre 0 y 1)
  const k_t = 0.7; //Índice de claridad medio (Liu & Jordan)
  const fd = 0.2; //fracción difusa estimada

  //Datos de energía
  const nFilas = parseFloat(document.getElementById('nFilas').value); // Cantidad de filas de paneles en el arreglo
  const nCols = parseFloat(document.getElementById('nCols').value); // Cantidad de columnas de paneles en el arreglo
  const sepX = parseFloat(document.getElementById('sepX').value); //; % Distancia entre columnas de paneles (m)    
  const sepY = parseFloat(document.getElementById('sepY').value); // % Distancia entre filas de paneles (m)  
  const margen = 0.5; // % margen del terreno a los cuatro lados del arreglo de pv (m)
  const panelW = parseFloat(document.getElementById('panelW').value); // % Dimensión horizontal del panel (de lado a lado) (m)
  const panelL = parseFloat(document.getElementById('panelH').value); // % Dimensión vertical del panel (desde base a vértice superior) (m) 
  const h_pv = parseFloat(document.getElementById('h_pv').value); // Altura desde el suelo hasta el borde inferior del panel (m) 
  const inclinacion = parseFloat(document.getElementById('inclinacion').value); //% Ángulo entre el panel y la horizontal, en grados (0° = horizontal, 90° = vertical)
  const orientacion = parseFloat(document.getElementById('gamma').value); // % Ángulo de orientación del panel (180° = sur, 90° = este, 270° = oeste, 0° = norte)
  const tau_dir = 0.1; // % Coeficiente de transmitancia directa del panel (entre 0 y 1)

  //Datos cultivo
  const crop = document.getElementById('crop').value;
  const rendimiento = parseFloat(document.getElementById('yieldBase').value);

  //Datos turismo
  const hotel = document.getElementById('hotel').value;

  const coverage = parseFloat(document.getElementById('coverage').value) / 100;
  const efficiency = parseFloat(document.getElementById('efficiency').value) / 100;
  const price = parseFloat(document.getElementById('price').value);
  const sunHours = 5;

  if (isNaN(area) || isNaN(nFilas) || isNaN(efficiency) || isNaN(latitud) || isNaN(longitud)) {
    alert("Por favor, completa todos los campos con valores válidos.");
    return;
  }


  // Mostrar datos introducidos
  const inputSummary = document.getElementById('inputSummary');
  const inputList = document.getElementById('inputSummaryList');
  inputList.innerHTML = `
    <li><strong>Superficie:</strong> ${area} m²</li>
    <li><strong>Coordenadas:</strong> ${latitud}, ${longitud}</li>
    <li><strong>Albedo:</strong> ${albedo}</li>
    <li><strong>Constante solar:</strong> ${G0} W/m²</li>
    <li><strong>Tipo de cultivo:</strong> ${crop}</li>
    <li><strong>Rendimiento base:</strong> ${efficiency} kg/m²</li>
    <li><strong>Tipo de hotel:</strong> ${hotel}</li>
    <li><strong>Precio venta energía:</strong> ${price} €/kWh</li>
    <li><strong>Modelo de clima:</strong> ${weather}</li>
    <li><strong>Fecha simulación:</strong> ${fecha_inicio.toISOString().split('T')[0]} → ${fecha_fin.toISOString().split('T')[0]}</li>
    <li><strong>Cobertura FV:</strong> ${coverage}</li>
    <li><strong>Eficiencia FV:</strong> ${efficiency}%</li>
  `;
  inputSummary.style.display = 'block';

  const powerInstalled = area * coverage * efficiency;
  const productionAnnual = powerInstalled * sunHours * 365;
  const revenue = productionAnnual * price;

  //const resultadoArreglos = simularArreglos({fecha_inicio,fecha_fin,day_interval,latitud,longitud,nFilas,nCols,sepX,sepY,margen,panelW,panelL,h_pv,inclinacion,orientacion,albedo,resolucion_malla,G0,tau_dir,f_gap,k_t,fd});

  const datosVisual = {
  latitud: parseFloat(document.getElementById("latitud").value),
  longitud: parseFloat(document.getElementById("longitud").value),
  fecha_inicio: new Date(document.getElementById("fecha_inicio").value),
  fecha_fin: new Date(document.getElementById("fecha_fin").value),
  nFilas: parseInt(document.getElementById("nFilas").value),
  nCols: parseInt(document.getElementById("nCols").value),
  sepX: parseFloat(document.getElementById("sepX").value),
  sepY: parseFloat(document.getElementById("sepY").value),
  panelW: parseFloat(document.getElementById("panelW").value),
  panelL: parseFloat(document.getElementById("panelH").value), // ojo: H=longitud
  h_pv: parseFloat(document.getElementById("h_pv").value),
  inclinacion: parseFloat(document.getElementById("inclinacion").value),
  G0: parseFloat(document.getElementById("G0").value),
  day_interval: parseFloat(document.getElementById("day_interval").value),
  albedo: parseFloat(document.getElementById("albedo").value),
  margen,
  tau_dir,
  sunHours,
  f_gap,
  k_t,
  fd,
  malla,
  orientacion: parseFloat(document.getElementById("gamma").value)
  };

  const paneles = mostrarVisualizacion3D(datosVisual);
  console.log("Paneles generados:", paneles);

  if (weather === "teorico") {
    const energia = runSimulacionRadiacion(datosVisual,paneles);  // Función de runSimulacionRadiacion.js
  } else if (modeloClima === "pvgis") {
    const energia = runSimulacionRadiacion(datosVisual,paneles);  // Función de runSimulacionRadiacionConDatosReales.js
  }

  const resultados = calculate_SRS(datosVisual, energia, paneles);

  document.getElementById('power').textContent = powerInstalled.toFixed(2);
  document.getElementById('production').textContent = productionAnnual.toFixed(0);
  document.getElementById('revenue').textContent = revenue.toFixed(2);
  document.getElementById('results').style.display = 'block';

  if (chart) chart.destroy();
  const ctx = document.getElementById('resultsChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Potencia (kWp)', 'Producción (kWh)', 'Ingresos (€)'],
      datasets: [{
        label: 'Resultados',
        data: [powerInstalled, productionAnnual, revenue],
        backgroundColor: ['#66bb6a', '#29b6f6', '#ffa726']
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });

const yieldBase = parseFloat(document.getElementById('yieldBase').value);
const surfaceCultivable = area * (1 - coverage); // superficie no cubierta por paneles
const cropProduction = yieldBase * surfaceCultivable; // kg estimados

// Mostrar resultado
let cropName = crop.charAt(0).toUpperCase() + crop.slice(1);
document.getElementById('cropProductionResult').textContent = `${cropProduction.toFixed(0)} kg (${cropName})`;
}

