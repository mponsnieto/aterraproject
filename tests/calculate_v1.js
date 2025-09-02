let chart = null;
async function calculate() {
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
  const tau_dir = parseFloat(document.getElementById('tau_dir').value)/100; // % Coeficiente de transmitancia directa del panel (entre 0 y 1)

  //Datos cultivo
  const crop = document.getElementById('crop').value;
  const yieldBase = parseFloat(document.getElementById('yieldBase').value);

  //Datos turismo
  const hotel = document.getElementById('hotel').value;

  const coverage = nFilas * nCols * panelW * panelH;
  console.log("coverage",coverage);
  const efficiency = parseFloat(document.getElementById('efficiency').value) / 100;
  const price = parseFloat(document.getElementById('price').value);

  if (isNaN(area) || isNaN(nFilas) || isNaN(efficiency) || isNaN(latitud) || isNaN(longitud)) {
    alert("Por favor, completa todos los campos con valores válidos.");
    return;
  }


  // Mostrar datos introducidos
  const inputSummary = document.getElementById('inputSummary');
  const inputList = document.getElementById('inputSummaryList');
  inputList.innerHTML = `
    <li><strong>Superficie total:</strong> ${area} m²</li>
    <li><strong>Superficie FV:</strong> ${coverage} m²</li>
    <li><strong>Coordenadas:</strong> ${latitud}, ${longitud}</li>
    <li><strong>Albedo:</strong> ${albedo}</li>
    <li><strong>Constante solar:</strong> ${G0} W/m²</li>
    <li><strong>Tipo de cultivo:</strong> ${crop}</li>
    <li><strong>Rendimiento base:</strong> ${yieldBase} kg/ha</li>
    <li><strong>Precio venta energía:</strong> ${price} €/kWh</li>
    <li><strong>Modelo de clima:</strong> ${weather}</li>
    <li><strong>Fecha simulación:</strong> ${fecha_inicio.toISOString().split('T')[0]} → ${fecha_fin.toISOString().split('T')[0]}</li>
    <li><strong>Transparencia paneles FV:</strong> ${tau_dir*100}%</li>
    <li><strong>Eficiencia FV:</strong> ${efficiency*100}%</li>
  `;
  inputSummary.style.display = 'block';

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
  cultivo: (document.getElementById("crop").value),
  margen,
  tau_dir : parseFloat(document.getElementById('tau_dir').value)/100,
  yieldBase : parseFloat(document.getElementById('yieldBase').value),
  f_gap,
  k_t,
  fd,
  malla,
  area: parseFloat(document.getElementById('area').value),
  orientacion: parseFloat(document.getElementById("gamma").value)
  };

  const paneles = mostrarVisualizacion3D(datosVisual);
  console.log("Paneles generados:", paneles);

  let energia;
  if (weather === "teorico") {
    energia = runSimulacionRadiacion(datosVisual,paneles);  // Función de runSimulacionRadiacion.js
    console.log("----Resultados----", energia);
    console.log("----E_terreno_total----", energia.E_terreno_total);
  } else if (weather === "pvgis") {
    energia = await runSimulacionRadiacionConDatosReales(datosVisual,paneles);  // Función de runSimulacionRadiacionConDatosReales.js
  }

  const resultados = calculate_SRS(datosVisual, energia, paneles);

  const powerInstalled = area * coverage * efficiency;
  const productionAnnual = energia.E_paneles_total;
  const revenue = productionAnnual * price;

  document.getElementById('power').textContent = powerInstalled.toFixed(2);
  document.getElementById('production').textContent = energia.E_paneles_total.toFixed(2);
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


// Mostrar resultado
let cropName = crop.charAt(0).toUpperCase() + crop.slice(1);
document.getElementById('cropProductionResult').textContent = `${resultados.cropProduction.toFixed(0)} kg de ${cropName} en ${resultados.area_Agri.toFixed(2)} m²`;

document.getElementById('cropProductionFree').textContent = `${resultados.cropProduction_free.toFixed(0)} kg de ${cropName} en ${resultados.area_noAgri.toFixed(2)} m²`;
}
