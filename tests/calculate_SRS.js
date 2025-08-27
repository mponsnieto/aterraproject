let chartRSR = null;
function calculate_SRS(sistema, energia, paneles){
	console.log('Voy a calcular SRS',sistema,energia,paneles)
	
	// 1. Leer la tabla desde el archivo CSV
	const tablaCultivos = parseCSV(read_clasificacion_clutivos());
  // tabla es un array de objetos: [{Cultivo: "Patata", Grupo: "Alta"}, ...]
	
	// LEER TABLA DE PARÁMETROS YIELD=f(RSR) PARA LOS DIFERENTES GRUPOS
	const Ecuaciones_CrecimVeg = read_Ecuaciones_CrecimVeg();
	
	// 2. Buscar el grupo correspondiente al nombre del cultivo
	const idx = tablaCultivos.findIndex(row => row.Cultivo.toLowerCase() === sistema.cultivo);

	// 3. Comprobar si se ha encontrado y mostrar el grupo
	let grupo = 0;
	let coefsGrupo = 0;
	if (idx !== -1) {
	  grupo = tablaCultivos[idx].Grupo;
	  console.log(`El cultivo "${sistema.cultivo}" presenta una tolerancia a la sombra "${grupo}".`);
  	coefsGrupo = [
	  Ecuaciones_CrecimVeg.x0[grupo],
	  Ecuaciones_CrecimVeg.x1[grupo],
	  Ecuaciones_CrecimVeg.x2[grupo],
	  Ecuaciones_CrecimVeg.x3[grupo]
		];
		console.log("Coeficientes para", grupo, ":", coefsGrupo);
	} else {
	  console.log(`El cultivo "${sistema.cultivo}" no se encuentra en la tabla.`);
	}

	//[m, n] = size(energia.E_terreno_dias);
	const m = 1;
	const n = energia.E_terreno_dias.length;
	console.log(energia.E_terreno_dias,m,n);

	// equivalente a cell(m, n) en MATLAB
	const Terreno_sombra = Array.from({ length: m }, () => Array(n).fill(null));

	// Inicializar variables para los resultados
	const fila = []; // índice fila de la celda
	const col  = []; // índice columna de la celda
	const maximos = [];
	const medias  = [];
	let valormax = 0;

	// Recorrer cada celda del cell array
	for (let i = 0;i<m;i++){
    for (let j = 0;j<n;j++){
      matriz = energia.E_terreno_dias[i,j];
      
      valormax = Math.max(...matriz.flat());
      //porcentaje_sombra = (valormax - matriz) / valormax * 100;
      porcentaje_sombra = matriz.map(fila =>  fila.map(v => ((valormax - v) / valormax) * 100));
      
      // Guardar la matriz procesada
      Terreno_sombra[i, j] = porcentaje_sombra;

      // Guardar datos para la tabla
      fila.push(i);
      col.push(j);
      maximos.push(Math.max(porcentaje_sombra));
      medias.push(mean(porcentaje_sombra));
    }
	}

	console.log(Terreno_sombra);
 	
	// Crear tabla de resultados
	//const T_resultados = table(fila.', col.', maximos.', medias.','VariableNames', {'Fila', 'Columna', 'MaximoSombra', 'MediaSombra'});

	// Cálculo de los percentiles con la radiación acumulada todos los dias calculados
	const matriz1 = energia.E_terreno_total;
	const valormax1 = Math.max(...matriz1.flat());
	const porcentaje_sombra1 = matriz1.map(fila => fila.map(v=> ((valormax1 - v) / valormax1) * 100));
	console.log("matriz1",matriz1, "valormax1",valormax1,"porcentaje_sombra1",Math.max(...porcentaje_sombra1.flat()));


	const valores = porcentaje_sombra1.flat(Infinity);
	const max_lim = Math.round(Math.max(...valores));  // Calcular límite superior redondeando hacia arriba
	console.log("max_lim",max_lim);

	// Crear 10 intervalos de igual anchura desde 0 hasta max_lim
	const edges = linspace2(0, max_lim, 11, 4);  // 11 bordes para 10 intervalos

	// Asignar cada valor a su intervalo
	let indx = discretize(valores, edges);
	console.log("indx",indx,"valores",valores,"edges",edges);

	// Inicializar vectores
	const RSR_media = new Array(10).fill(0);
	const RSR_mediana = new Array(10).fill(0);
	const counts = new Array(10).fill(0);
	let valores_en_intervalo = valores;
	console.log("RSR_media",RSR_media,"RSR_mediana",RSR_mediana);
	

	// 5. Calcular media y mediana para cada intervalo
	for (let i = 0;i<10;i++){
	    valores_en_intervalo = valores.filter((_, k) => indx[k] === i+1);
	    if (valores_en_intervalo.length!=0){
	        RSR_media[i] = mean(valores_en_intervalo.flat());
	        RSR_mediana[i] = median(valores_en_intervalo.flat());
	        counts[i] = valores_en_intervalo.length; 
	        console.log("RSR_media",RSR_media,"RSR_mediana",RSR_mediana,"counts",counts);
	    }else{
	        RSR_media[i] = 0;
	        RSR_mediana[i] = 0;
	        counts[i] = 0; 
	        console.log("RSR_media",RSR_media,"RSR_mediana",RSR_mediana);
	    }
	}

	// Calcular porcentajes
	const porcentaje = counts.map(c => Math.round((c / valores.length) * 1000) / 10);
	
	console.log("edges", edges,"counts", counts,"porcentaje", porcentaje);

	// Calcular YIELD para cada valor de RSR
	const YIELD = RSR_media.map(rsr =>
    
    Math.round((coefsGrupo[0] + coefsGrupo[1]*rsr + coefsGrupo[2]*rsr**2 + coefsGrupo[3]*rsr**3) * 10) / 10
  	); //rsr < 1 ? 100.0 :

	// Mostrar resultados como tabla
	const a = edges.slice(0, -1); // MATLAB: edges(1:end-1)
	const b = edges.slice(1);     // MATLAB: edges(2:end)

	const intervalos = a.map((ai, i) => `[${ai.toFixed(1)}, ${b[i].toFixed(1)})`); // MATLAB: string(compose('[%.1f, %.1f)', a, b))

	renderTablaResultados(intervalos, RSR_media, RSR_mediana, porcentaje, YIELD);

	mostrarbarplotSRS(RSR_media,porcentaje,YIELD);

  const sumaProductos = YIELD.reduce((acc, y, i) => acc + sistema.yieldBase/10000*y/100 *energia.Area_terreno* (porcentaje[i]/100 || 0), 0);
  const area_noAgri =sistema.area-energia.Area_terreno;
  const cropProduction_free = sistema.yieldBase/10000 *(area_noAgri);

  console.log("-------------------",sumaProductos);//energia.Area_terreno*YIELD*porcentaje);

	return {
    cropProduction:sumaProductos,
    area_Agri: energia.Area_terreno,
    area_noAgri,
    cropProduction_free
  };
/*

	// Mostrar barplot
	figure;
	bar(RSR_media, porcentaje)
	xlabel('// Sombra')
	ylabel('Porcentaje terreno (//)')
	title('Distribución porcentual de terreno con sombra')
	grid on
	hold on  // ← para superponer la línea

	// Superponer la curva de rendimiento
	yyaxis right              // ← usa eje Y derecho para no mezclar escalas
	plot(RSR_media, YIELD, '-o', 'LineWidth', 2)
	ylabel('Rendimiento (//)')

	/* Mejorar visualización
	legend('Porcentaje terreno', 'Rendimiento cultivo', 'Location', 'best')
	return {
		grupo,
		tablaRSR: tabla1,
		sombraPorCelda: Terreno_sombra,
		resumenPorCelda: { fila, col, maximos, medias }
  };*/
}

async function leerCSV(url) {
  const response = await fetch(url);
  const text = await response.text();

  // Convertir el texto CSV a un array de objetos
  const filas = text.trim().split("\n");
  const cabeceras = filas[0].split(",");

  const datos = filas.slice(1).map(fila => {
    const valores = fila.split(",");
    let obj = {};
    cabeceras.forEach((col, i) => {
      obj[col.trim()] = valores[i]?.trim();
    });
    return obj;
  });

  return datos;
}

function parseCSV(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map(line => {
    const values = line.split(",");
    return headers.reduce((obj, header, i) => {
      obj[header.trim()] = values[i].trim();
      return obj;
    }, {});
  });
}


function mean(points) {
  let n = points.length;
  if (n>0){
	  let sum = 0;
	  for (const p of points) {
	    sum = sum+p;
	  }
	  return (sum / n);
	}else{
		return 0;
	}

}

function discretize(valores, edges) {
	//console.log("valores",valores,"edges",edges);
  return valores.map(v => {
    if (isNaN(v)) return NaN; // valor no numérico
    if (v < edges[0] || v > edges[edges.length - 1]) return NaN; // fuera de rango

    for (let i = 0; i < edges.length - 1; i++) {
      // Incluye el último límite en el último intervalo
      if (i === edges.length - 2) {
        if (v >= edges[i] && v <= edges[i + 1]) return i + 1;
      } else {
        if (v >= edges[i] && v < edges[i + 1]) return i + 1;
      }
    }
    return NaN;
  });
}

function median(arr) {
  if (!arr.length) return NaN; // si está vacío
  const sorted = [...arr].sort((a, b) => a - b); // copia ordenada ascendente
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // número par de elementos → promedio de los dos del medio
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    // número impar de elementos → el del medio
    return sorted[mid];
  }
}

function histcounts(valores, edges) {
  const counts = new Array(edges.length - 1).fill(0);

  for (let v of valores) {
    for (let i = 0; i < edges.length - 1; i++) {
      const lower = edges[i];
      const upper = edges[i + 1];

      // Igual que MATLAB: incluye el límite superior solo en el último intervalo
      if ((v >= lower && v < upper) || (i === edges.length - 2 && v === upper)) {
        counts[i]++;
        break;
      }
    }
  }
  return counts;
}

function renderTablaResultados(intervalos, RSR_media, RSR_mediana, porcentaje, YIELD, containerId = "results_RSR"){ 
  const fmt = v => (Number.isFinite(v) ? v.toFixed(1) : "—");

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`No existe un contenedor con id="${containerId}"`);
    return;
  }

  // Limpia contenido previo
  container.innerHTML = "";

  // Crea tabla
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontFamily = "Arial, sans-serif";
  table.style.fontSize = "14px";

  // Cabecera
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th style="text-align:left;border-bottom:1px solid #ccc;padding:6px;">Intervalo RSR</th>
      <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">RSR_media</th>
      <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">RSR_mediana</th>
      <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">Porcentaje terreno (%)</th>
  		<th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">% rendimiento cultivo</th>
      
    </tr>`;
  table.appendChild(thead); 

  // Cuerpo
  const tbody = document.createElement("tbody");
  for (let i = 0; i < intervalos.length; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:6px;border-bottom:1px solid #eee;">${intervalos[i]}</td>
      <td style="padding:6px;text-align:right;border-bottom:1px solid #eee;">${fmt(RSR_media[i])}</td>
      <td style="padding:6px;text-align:right;border-bottom:1px solid #eee;">${fmt(RSR_mediana[i])}</td>
      <td style="padding:6px;text-align:right;border-bottom:1px solid #eee;">${fmt(porcentaje[i])}</td>
      <td style="padding:6px;text-align:right;border-bottom:1px solid #eee;">${fmt(YIELD[i])}</td>
    `;
    tbody.appendChild(tr); 
  }
  table.appendChild(tbody);

  // Título (opcional)
  const titulo = document.createElement("h3");
  titulo.textContent = "Resultados RSR y rendimiento";
  titulo.style.textAlign = "center";
  titulo.style.margin = "10px 0";

  container.appendChild(titulo);
  container.appendChild(table);
}

function linspace2(start, end, num, decimals = 4) {
  const arr = [];
  const step = (end - start) / (num - 1);
  for (let i = 0; i < num; i++) {
    arr.push(parseFloat((start + step * i).toFixed(decimals)));
  }
  return arr;
}

function mostrarbarplotSRS(RSR_media,porcentaje,YIELD) {
  const ctx = document.getElementById("graficoRSR").getContext("2d");
  ctx.innerHTML = ""; // Limpiar si ya existe
  
  if (chartRSR) chartRSR.destroy();
  const labels = RSR_media.map(v => Math.round(v).toString());
  chartRSR = new Chart(ctx, {
    type: 'bar',
    data:{
    	labels: labels,
      datasets: [{
        label: 'Porcentaje terreno',
        data: porcentaje,
        backgroundColor: 'rgba(30, 144, 255, 0.6)',
        borderColor: 'rgba(30, 144, 255, 1)',
        borderWidth: 1,
        yAxisID: 'y' // eje Y izquierdo
      	},
      	{
        label: 'Rendimiento cultivo',
        data: YIELD,
        type: 'line', // línea superpuesta
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        fill: false,
        borderWidth: 2,
        pointRadius: 5,
        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
        yAxisID: 'y1' // eje Y derecho
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Distribución porcentual de terreno con sombra'
        }
      },
      scales: {
        x: {
          title: { display: true, text: '% Sombra' }
        },
        y: {
          title: { display: true, text: 'Porcentaje terreno (%)' },
          beginAtZero: true
        },
        y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Rendimiento (%)'
            },
            min: 80, // <<< Aquí defines el valor mínimo
          }

      }
    }
  });
}