let chart = null;
/* f_ gap : Fracción de cielo visible bajo panel (entre 0 y 1) 
   k_t : Índice de claridad medio (Liu & Jordan) -->
   fd : fracción difusa estimada */
function calculate() {
  const f_gap=0.2;
  const k_t = 0.7;
  const fd = 0.2;
  const area = parseFloat(document.getElementById('area').value);
  const coverage = parseFloat(document.getElementById('coverage').value) / 100;
  const efficiency = parseFloat(document.getElementById('efficiency').value) / 100;
  const sunHours = parseFloat(document.getElementById('day_interval').value);
  const price = parseFloat(document.getElementById('price').value);

  if (isNaN(area) || isNaN(coverage) || isNaN(efficiency) || isNaN(sunHours) || isNaN(price)) {
    alert("Por favor, completa todos los campos con valores válidos.");
    return;
  }

  const powerInstalled = area * coverage * efficiency;
  const productionAnnual = powerInstalled * sunHours * 365;
  const revenue = productionAnnual * price;

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
document.getElementById('results').insertAdjacentHTML('beforeend', `
  <p><strong>Producción estimada de ${cropName}:</strong> ${cropProduction.toFixed(0)} kg</p>
`);
}
