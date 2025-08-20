# Simulador ATERRA – Simulador de Proyectos Agrivoltaicos

Este proyecto desarrolla un simulador web interactivo para evaluar proyectos agrivoltaicos  para el sector turístico de las Islas Baleares en el marco del proyecto ATERRA.
El simulador combina cálculos energéticos, agrícolas y económicos, integrando datos climáticos teóricos o reales (desde PVGIS) para estimar:

- Producción eléctrica (energía solar captada por los paneles FV).
- Impacto sobre cultivos (sombra, rendimiento, tolerancia según especie).
- Indicadores económicos (ingresos por energía, producción agrícola).
- Visualizaciones 2D y 3D de radiación y disposición de paneles.


## ⚙️ Requisitos

Frontend: Navegador moderno (Chrome, Firefox, Edge).

No necesita instalación: basta con abrir index.html.

Backend (para datos reales PVGIS):

Node.js  >= 16

npm

## Funcionalidades

- Cálculo de potencia instalada, producción anual e ingresos
- Visualización gráfica (Chart.js)
- Descarga de resultados en PDF

## Cómo usar

1. Abre `index.html` en un navegador.
2. Introduce los datos.
3. Presiona **Calcular**.
4. Opcionalmente descarga los resultados como PDF.

## 📑 Datos utilizados

Clasificación de cultivos: `parameters/clasificacion_cultivos.csv` → asigna tolerancia a la sombra.

Ecuaciones de crecimiento: `parameters/Ecuaciones_CrecimVeg.csv` → coeficientes polinómicos para calcular YIELD en función de RSR.

Clima:
- Modelo estándar (parametrizado en el simulador).
- Datos horarios reales desde PVGIS (a través del proxy server.js).
