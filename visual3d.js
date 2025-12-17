function mostrarVisualizacion3D(datos) {
  if (typeof window.disableHelp === "function") window.disableHelp();

  const container = document.getElementById("visualizacion3D");
  container.innerHTML = ""; // Limpiar si ya existe

  const scene = new THREE.Scene();
  //scene.rotation.x = -Math.PI / 2;
  // Añadir ejes XYZ de referencia (X: rojo, Y: verde, Z: azul)
  const axesHelper = new THREE.AxesHelper(10); // 10 = longitud de los ejes
  scene.add(axesHelper);

  crearCielo(scene);
  const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Crear controles Trackball
  const controls = new THREE.TrackballControls(camera, renderer.domElement);

  // Ajustes opcionales:
  controls.rotateSpeed = 4.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;

  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;


  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(10, 10, 10);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x888888); // luz tenue ambiental
  scene.add(ambient);

  // Suelo
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x006400, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  scene.add(ground);

  const paneles = simularArreglo(datos);

  paneles.forEach(p => {
    const panelMesh = crearPanel(p.TL, p.TR, p.PL, p.PR);
    scene.add(panelMesh);
  });

  // Flecha hacia el sur (eje Y negativo)
  const arrowLength = 2;
  const arrowDir = new THREE.Vector3(0, -1, 0).normalize();  // Sur = eje Y negativo
  const arrowOrigin = new THREE.Vector3(0, 0, 0.1); // un poco sobre el suelo
  const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLength, 0xff0000, 0.3, 0.2); // rojo
  scene.add(arrowHelper);



  // Ubicación de la cámara en el espacio 3D
camera.position.set(-5, -10, 6); // (X, Y, Z) → vista en diagonal desde el noroeste
camera.up.set(0, 0, 1);         // Z como arriba
camera.lookAt(new THREE.Vector3(0, 5, 0));  // mirar hacia el centro de los paneles

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  return paneles;
}

function crearPanel(TL, TR, PL, PR, color = 0x0055ff) {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    ...PL, ...PR, ...TR,
    ...TR, ...TL, ...PL
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  //const material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

function simularArreglo(datos) {
  const {
    latitud, fecha_inicio, nFilas, nCols, sepX, sepY: sepYOriginal,
    panelW, panelL, h_pv, inclinacion, orientacion: gamma
  } = datos;

  const inclinacionRad = deg2rad(inclinacion);
  const gammaRad = deg2rad(gamma);
  let sepY = sepYOriginal;

  const sepYmin = calcularSeparacionMinima(panelL, inclinacion, latitud, fecha_inicio);
  if (sepY < sepYmin) sepY = sepYmin;
  console.log("SepY: ",sepY);
  const paneles = [];

  // Vectores base
  const normal = [
    Math.sin(inclinacionRad) * Math.sin(gammaRad),
    Math.sin(inclinacionRad) * Math.cos(gammaRad),
    Math.cos(inclinacionRad)
  ];

  const v_long = [
    -Math.cos(inclinacionRad) * Math.sin(gammaRad),
    -Math.cos(inclinacionRad) * Math.cos(gammaRad),
    Math.sin(inclinacionRad)
  ];

  const v_short = crossProduct(normal, v_long);

  for (let i = 0; i < nFilas; i++) {
    for (let j = 0; j < nCols; j++) {
      const x_c = j * (panelW + sepX) + panelW / 2;
      const y_proj = panelL * Math.cos(inclinacionRad);
      const y_c = i * (y_proj + sepY) + y_proj / 2;
      const z_c = h_pv + (panelL / 2) * Math.sin(inclinacionRad);

      const center = [x_c, y_c, z_c];

      const TL = vectorAdd(center, vectorSubtract(
        scalarMultiply(v_long, 0.5 * panelL),
        scalarMultiply(v_short, 0.5 * panelW)
      ));
      const TR = vectorAdd(center, vectorAdd(
        scalarMultiply(v_long, 0.5 * panelL),
        scalarMultiply(v_short, 0.5 * panelW)
      ));
      const BL = vectorSubtract(center, vectorAdd(
        scalarMultiply(v_long, 0.5 * panelL),
        scalarMultiply(v_short, 0.5 * panelW)
      ));
      const BR = vectorSubtract(center, vectorSubtract(
        scalarMultiply(v_long, 0.5 * panelL),
        scalarMultiply(v_short, 0.5 * panelW)
      ));

      paneles.push({ TL, TR, PL: BL, PR: BR });
    }
  }
  return paneles;
}


function calcularSeparacionMinima(panelL, inclinacion, latitud, fecha) {
  const n = Math.floor((fecha - new Date(fecha.getFullYear(), 0, 0)) / 86400000);
  const delta = 23.45 * Math.sin(deg2rad(360 * (284 + n) / 365));
  const h = 10;
  const omega = 15 * (h - 12);
  const alpha = Math.asin(
    Math.sin(deg2rad(latitud)) * Math.sin(deg2rad(delta)) +
    Math.cos(deg2rad(latitud)) * Math.cos(deg2rad(delta)) * Math.cos(deg2rad(omega))
  );
  return panelL * Math.sin(deg2rad(inclinacion)) / Math.tan(alpha);
}

function deg2rad(deg) {
  return deg * Math.PI / 180;
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

function crearCielo(scene) {
  const skyGeo = new THREE.SphereGeometry(500, 32, 15);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0xaee0ff) },     // azul cielo claro
      bottomColor: { value: new THREE.Color(0xffffff) },  // blanco en horizonte
      offset: { value: 100 },
      exponent: { value: 0.8 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}