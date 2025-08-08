function calculate_SRS(sistema, energia, paneles){
	console.log('Voy a calcular SRS',sistema)
	
	// 1. Leer la tabla desde el archivo CSV
	const tablaCultivos = parseCSV(read_clasificacion_clutivos());
	console.log(tablaCultivos);
  // tabla es un array de objetos: [{Cultivo: "Patata", Grupo: "Alta"}, ...]
	
	// LEER TABLA DE PARÁMETROS YIELD=f(RSR) PARA LOS DIFERENTES GRUPOS
	const Ecuaciones_CrecimVeg = parseCSV(read_Ecuaciones_CrecimVeg());
	console.log(Ecuaciones_CrecimVeg);
	
	// 2. Buscar el grupo correspondiente al nombre del cultivo
	const idx = tablaCultivos.findIndex(row => row.Cultivo.toLowerCase() === sistema.cultivo);

	// 3. Comprobar si se ha encontrado y mostrar el grupo
	if (idx !== -1) {
	  const grupo = tablaCultivos[idx].Grupo;
	  console.log(`El cultivo "${sistema.cultivo}" presenta una tolerancia a la sombra "${grupo}".`);
	} else {
	  console.log(`El cultivo "${sistema.cultivo}" no se encuentra en la tabla.`);
	}

	//[m, n] = size(energia.E_terreno_dias);
	const m = energia.E_terreno_dias.length;
	const n = energia.E_terreno_dias[0].length;

	// equivalente a cell(m, n) en MATLAB
	const Terreno_sombra = Array.from({ length: m }, () => Array(n).fill(null));

	// Inicializar variables para los resultados
	const fila = []; // índice fila de la celda
	const col  = []; // índice columna de la celda
	const maximos = [];
	const medias  = [];
	let valormax = 0;

	// Recorrer cada celda del cell array
	for (let i = 1;i<m;i++){
    for (let j = 1;j<n;j++){
      matriz = energia.E_terreno_dias[i,j];
      console.log(matriz,energia.E_terreno_dias);
      valormax = Math.max(matriz);
      porcentaje_sombra = (valormax - matriz) / valormax * 100;

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
 /*	
	// Crear tabla de resultados
	const T_resultados = table(fila.', col.', maximos.', medias.', ...
	    'VariableNames', {'Fila', 'Columna', 'MaximoSombra', 'MediaSombra'});

	// Cálculo de los percentiles con la radiación acumulada todos los dias
	// calculados
	matriz1 = data.E_terreno_total;
	valormax1 = max(matriz1(:));
	porcentaje_sombra1 = (valormax1 - matriz1) / valormax1 * 100;

	valores = porcentaje_sombra1(:);
	max_lim = ceil(max(valores));  // Calcular límite superior redondeando hacia arriba

	// Crear 10 intervalos de igual anchura desde 0 hasta max_lim
	edges = linspace(0, max_lim, 11);  // 11 bordes para 10 intervalos

	// Asignar cada valor a su intervalo
	idx = discretize(valores, edges);

	// Inicializar vectores
	RSR_media = zeros(10,1);
	RSR_mediana = zeros(10,1);

	// 5. Calcular media y mediana para cada intervalo
	for i = 1:10{
	    valores_en_intervalo = valores(idx == i);
	    if ~isempty(valores_en_intervalo){
	        RSR_media(i) = mean(valores_en_intervalo);
	        RSR_mediana(i) = median(valores_en_intervalo);
	    }else{
	        RSR_media(i) = NaN;
	        RSR_mediana(i) = NaN;
	    }
	}
	RSR_media=round(RSR_media,1);
	RSR_mediana=round(RSR_mediana,1);
	// Calcular frecuencias y porcentajes
	[counts, ~] = histcounts(valores, edges);
	porcentaje = round(counts / numel(valores) * 100, 1); // Redondear a 1 decimal
	// Mostrar resultados como tabla
	const a = edges(1:end-1);//';
	const b = edges(2:end);//';
	const intervalos = string(compose('[//.1f,//.1f)', a, b)); 

	// Cálculo del rendimiento (YIELD) para cada // RSR
	// Verifica si el grupo está disponible
	if ~ismember(grupo, Ecuaciones_CrecimVeg.Properties.VariableNames){
	    error('Grupo "//s" no encontrado en la tabla de coeficientes.', grupo);
	}

	// Extraer los coeficientes para el grupo
	coef = Ecuaciones_CrecimVeg.(grupo);  // [x0; x1; x2; x3]

	// Calcular YIELD para cada valor de RSR
	const YIELD = RSR_media.map(rsr =>
    rsr < 1 ? 100.0 :
    Math.round((coef[0] + coef[1]*rsr + coef[2]*rsr**2 + coef[3]*rsr**3) * 10) / 10
  	);

	// Añadir columna a la tabla
	YIELD = round(YIELD, 1);  // redondear si se desea


	// Paso 4: crear tabla
	const intervalos = [];
	for (let i = 0; i < nIntervals; i++) {
		intervalos.push(`[${edges[i].toFixed(1)}, ${edges[i+1].toFixed(1)})`);
	}

  const tabla1 = intervalos.map((label, i) => ({
    intervalo: label,
    RSR_media: RSR_media[i],
    RSR_mediana: RSR_mediana[i],
    porcentaje: porcentaje[i],
    rendimiento: YIELD[i]
  }));

	// Mostrar tabla
	disp(tabla1)
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
  	if (points[0].length>0){
  		const dim = points[0].length; // 3 si son [x, y, z]
	  }else{
	  	const dim=1;
	  }

	  const sum = new Array(dim).fill(0);

	  for (const p of points) {
	    for (let i = 0; i < dim; i++) {
	      sum[i] += p[i];
	    }
	  }

	  return sum.map(val => val / n);
	}else{
		return 0;
	}

}