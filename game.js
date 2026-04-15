import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const dom = {
  shell: document.querySelector("#game-shell"),
  startOverlay: document.querySelector("#startOverlay"),
  startButton: document.querySelector("#startButton"),
  mapOverlay: document.querySelector("#mapOverlay"),
  mapCanvas: document.querySelector("#mapCanvas"),
  promptBox: document.querySelector("#promptBox"),
  startHint: document.querySelector("#startHint"),
  moneyValue: document.querySelector("#moneyValue"),
  clockValue: document.querySelector("#clockValue"),
  cameraValue: document.querySelector("#cameraValue"),
  healthText: document.querySelector("#healthText"),
  staminaText: document.querySelector("#staminaText"),
  healthFill: document.querySelector("#healthFill"),
  staminaFill: document.querySelector("#staminaFill"),
  ammoText: document.querySelector("#ammoText"),
  objectiveText: document.querySelector("#objectiveText"),
  inventorySlots: Array.from(document.querySelectorAll(".slot")),
};

const CONFIG = {
  BLOCK_COUNT: 5,
  BLOCK_SIZE: 68,
  ROAD_WIDTH: 24,
  PLAYER_RADIUS: 2.15,
  PLAYER_EYE_HEIGHT: 4.7,
  PLAYER_WALK_SPEED: 12.5,
  PLAYER_SPRINT_SPEED: 21,
  PLAYER_JUMP_FORCE: 18,
  DAY_LENGTH: 250,
  TRAFFIC_COUNT: 14,
  PARKED_COUNT: 10,
  PEDESTRIAN_COUNT: 28,
};

CONFIG.CITY_HALF =
  (CONFIG.BLOCK_COUNT * CONFIG.BLOCK_SIZE +
    (CONFIG.BLOCK_COUNT + 1) * CONFIG.ROAD_WIDTH) /
  2;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.domElement.id = "gameCanvas";
dom.shell.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8dbde8);
scene.fog = new THREE.Fog(0x8dbde8, 150, 620);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  1400,
);
camera.position.set(0, 12, 24);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const aimPoint = new THREE.Vector2(0, 0);
const mapContext = dom.mapCanvas.getContext("2d");

const world = {
  roadCenters: [],
  blockCenters: [],
  missionMarker: null,
  missionBeam: null,
  missionLight: null,
  missionIndex: 0,
  skyDome: null,
  ambientLight: null,
  sunLight: null,
  moonLight: null,
  playerRig: null,
  playerParts: null,
  headlightRig: [],
  headlightTargets: [],
};

const state = {
  started: false,
  pointerLocked: false,
  mapOpen: false,
  mouseDown: false,
  jumpQueued: false,
  keys: {},
  toastText: "",
  toastTimer: 0,
  timeOfDay: 0.42,
  dayFactor: 1,
  hoveredCar: null,
  hoveredPedestrian: null,
  booted: false,
  booting: false,
};

const player = {
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(),
  elevation: 0,
  verticalVelocity: 0,
  onGround: true,
  yaw: Math.PI * 0.15,
  pitch: -0.16,
  radius: CONFIG.PLAYER_RADIUS,
  health: 100,
  stamina: 100,
  money: 300,
  cameraMode: "third",
  activeSlot: 0,
  attackCooldown: 0,
  shootCooldown: 0,
  punchTimer: 0,
  invulnerability: 0,
  isRunning: false,
};

let currentVehicle = null;

const obstacles = [];
const buildingFootprints = [];
const trafficRoutes = [];
const pedestrianRoutes = [];
const missionLocations = [];
const pedestrians = [];
const vehicles = [];
const pickups = [];
const transientEffects = [];
const targetMeshes = [];
const windowGlowMaterials = [];
const lampLights = [];
const lampGlowMaterials = [];
const neonMaterials = [];

const tempVectors = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
};
const WORLD_UP = new THREE.Vector3(0, 1, 0);

bindBootUI();
animate();

function bindBootUI() {
  dom.startButton.addEventListener("click", startGame);
  window.__urbanRushStart = startGame;
  setStartHint("Clique no botao para carregar a cidade.");
}

function init() {
  createEnvironment();
  createGround();
  createRoadGrid();
  createCityBlocks();
  createStreetLights();
  buildTrafficRoutes();
  createMissionMarker();
  createPlayerRig();
  createVehicleHeadlights();
  spawnPedestrians();
  spawnVehicles();
  setSpawnPoint();
  relocateMissionMarker(true);
  updateInventoryUI();
  updateHUD();
  drawMap();
  renderer.domElement.addEventListener("click", () => {
    if (state.started && !state.mapOpen) {
      renderer.domElement.requestPointerLock();
    }
  });

  window.addEventListener("resize", handleResize);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", resetInputState);
}

function createEnvironment() {
  world.skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(920, 32, 20),
    new THREE.MeshBasicMaterial({
      color: 0x8dbde8,
      side: THREE.BackSide,
    }),
  );
  scene.add(world.skyDome);

  world.ambientLight = new THREE.HemisphereLight(0xd3ebff, 0x27374c, 1.45);
  scene.add(world.ambientLight);

  world.sunLight = new THREE.DirectionalLight(0xfff4da, 2.2);
  world.sunLight.position.set(140, 210, 110);
  world.sunLight.castShadow = true;
  world.sunLight.shadow.mapSize.set(2048, 2048);
  world.sunLight.shadow.camera.near = 10;
  world.sunLight.shadow.camera.far = 520;
  world.sunLight.shadow.camera.left = -220;
  world.sunLight.shadow.camera.right = 220;
  world.sunLight.shadow.camera.top = 220;
  world.sunLight.shadow.camera.bottom = -220;
  world.sunLight.shadow.bias = -0.00008;
  scene.add(world.sunLight);

  world.moonLight = new THREE.DirectionalLight(0x81a8ff, 0.18);
  world.moonLight.position.set(-140, 110, -120);
  scene.add(world.moonLight);
}

function createGround() {
  const terrain = new THREE.Mesh(
    new THREE.BoxGeometry(1200, 4, 1200),
    new THREE.MeshStandardMaterial({
      color: 0x1b2b20,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );
  terrain.position.y = -2.1;
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function createRoadGrid() {
  const totalSpan = CONFIG.CITY_HALF * 2;
  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2027,
    roughness: 0.95,
    metalness: 0.05,
  });
  const lotMaterial = new THREE.MeshStandardMaterial({
    color: 0x323b45,
    roughness: 0.94,
    metalness: 0.03,
  });
  const markingMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f1df,
    emissive: 0xf4f1df,
    emissiveIntensity: 0.02,
    roughness: 0.5,
    metalness: 0.1,
  });
  const yellowLineMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc44d,
    emissive: 0xffc44d,
    emissiveIntensity: 0.04,
    roughness: 0.5,
    metalness: 0.1,
  });
  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x717780,
    roughness: 0.88,
    metalness: 0.05,
  });

  for (let index = 0; index <= CONFIG.BLOCK_COUNT; index += 1) {
    world.roadCenters.push(
      -CONFIG.CITY_HALF +
        CONFIG.ROAD_WIDTH / 2 +
        index * (CONFIG.BLOCK_SIZE + CONFIG.ROAD_WIDTH),
    );
  }

  for (let index = 0; index < CONFIG.BLOCK_COUNT; index += 1) {
    world.blockCenters.push(
      -CONFIG.CITY_HALF +
        CONFIG.ROAD_WIDTH +
        CONFIG.BLOCK_SIZE / 2 +
        index * (CONFIG.BLOCK_SIZE + CONFIG.ROAD_WIDTH),
    );
  }

  for (const x of world.roadCenters) {
    const road = createBox(totalSpan, 0.18, CONFIG.ROAD_WIDTH, asphaltMaterial);
    road.rotation.y = Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);

    const centerLineA = createBox(totalSpan - 10, 0.02, 0.18, yellowLineMaterial);
    centerLineA.rotation.y = Math.PI / 2;
    centerLineA.position.set(x - 0.4, 0.13, 0);
    scene.add(centerLineA);

    const centerLineB = createBox(totalSpan - 10, 0.02, 0.18, yellowLineMaterial);
    centerLineB.rotation.y = Math.PI / 2;
    centerLineB.position.set(x + 0.4, 0.13, 0);
    scene.add(centerLineB);
  }

  for (const z of world.roadCenters) {
    const road = createBox(totalSpan, 0.18, CONFIG.ROAD_WIDTH, asphaltMaterial);
    road.position.set(0, 0.03, z);
    road.receiveShadow = true;
    scene.add(road);

    const centerLineA = createBox(totalSpan - 10, 0.02, 0.18, yellowLineMaterial);
    centerLineA.position.set(0, 0.13, z - 0.4);
    scene.add(centerLineA);

    const centerLineB = createBox(totalSpan - 10, 0.02, 0.18, yellowLineMaterial);
    centerLineB.position.set(0, 0.13, z + 0.4);
    scene.add(centerLineB);
  }

  for (const x of world.roadCenters) {
    for (let z = -CONFIG.CITY_HALF + 10; z < CONFIG.CITY_HALF - 10; z += 18) {
      if (world.roadCenters.some((roadZ) => Math.abs(roadZ - z) < CONFIG.ROAD_WIDTH * 0.7)) {
        continue;
      }
      const dash = createBox(0.5, 0.03, 7.5, markingMaterial);
      dash.position.set(x, 0.15, z);
      scene.add(dash);
    }
  }

  for (const z of world.roadCenters) {
    for (let x = -CONFIG.CITY_HALF + 10; x < CONFIG.CITY_HALF - 10; x += 18) {
      if (world.roadCenters.some((roadX) => Math.abs(roadX - x) < CONFIG.ROAD_WIDTH * 0.7)) {
        continue;
      }
      const dash = createBox(7.5, 0.03, 0.5, markingMaterial);
      dash.position.set(x, 0.15, z);
      scene.add(dash);
    }
  }

  for (const x of world.roadCenters) {
    for (const z of world.roadCenters) {
      addCrosswalk(x, z, markingMaterial);
    }
  }

  for (const centerX of world.blockCenters) {
    for (const centerZ of world.blockCenters) {
      const lot = createBox(CONFIG.BLOCK_SIZE, 0.4, CONFIG.BLOCK_SIZE, lotMaterial);
      lot.position.set(centerX, 0.22, centerZ);
      lot.receiveShadow = true;
      scene.add(lot);

      const curbNorth = createBox(CONFIG.BLOCK_SIZE, 0.28, 0.9, curbMaterial);
      curbNorth.position.set(centerX, 0.18, centerZ - CONFIG.BLOCK_SIZE / 2);
      scene.add(curbNorth);

      const curbSouth = createBox(CONFIG.BLOCK_SIZE, 0.28, 0.9, curbMaterial);
      curbSouth.position.set(centerX, 0.18, centerZ + CONFIG.BLOCK_SIZE / 2);
      scene.add(curbSouth);

      const curbWest = createBox(0.9, 0.28, CONFIG.BLOCK_SIZE, curbMaterial);
      curbWest.position.set(centerX - CONFIG.BLOCK_SIZE / 2, 0.18, centerZ);
      scene.add(curbWest);

      const curbEast = createBox(0.9, 0.28, CONFIG.BLOCK_SIZE, curbMaterial);
      curbEast.position.set(centerX + CONFIG.BLOCK_SIZE / 2, 0.18, centerZ);
      scene.add(curbEast);
    }
  }
}

function addCrosswalk(x, z, material) {
  const stripeCount = 5;
  for (let index = 0; index < stripeCount; index += 1) {
    const offset = (index - (stripeCount - 1) / 2) * 2.1;

    const horizontal = createBox(0.8, 0.025, 5.8, material);
    horizontal.position.set(x - CONFIG.ROAD_WIDTH * 0.3, 0.14, z + offset);
    scene.add(horizontal);

    const horizontalMirror = createBox(0.8, 0.025, 5.8, material);
    horizontalMirror.position.set(x + CONFIG.ROAD_WIDTH * 0.3, 0.14, z + offset);
    scene.add(horizontalMirror);

    const vertical = createBox(5.8, 0.025, 0.8, material);
    vertical.position.set(x + offset, 0.14, z - CONFIG.ROAD_WIDTH * 0.3);
    scene.add(vertical);

    const verticalMirror = createBox(5.8, 0.025, 0.8, material);
    verticalMirror.position.set(x + offset, 0.14, z + CONFIG.ROAD_WIDTH * 0.3);
    scene.add(verticalMirror);
  }
}

function createCityBlocks() {
  const middle = (CONFIG.BLOCK_COUNT - 1) / 2;

  for (let xIndex = 0; xIndex < CONFIG.BLOCK_COUNT; xIndex += 1) {
    for (let zIndex = 0; zIndex < CONFIG.BLOCK_COUNT; zIndex += 1) {
      const centerX = world.blockCenters[xIndex];
      const centerZ = world.blockCenters[zIndex];
      const distanceFromCenter =
        Math.abs(xIndex - middle) + Math.abs(zIndex - middle);
      const rng = createRandom(xIndex * 1013 + zIndex * 211 + 77);

      buildPedestrianRoute(centerX, centerZ);

      if (distanceFromCenter <= 1) {
        createDowntownBlock(centerX, centerZ, rng);
      } else if (distanceFromCenter === 2) {
        if (rng() > 0.42) {
          createMixedBlock(centerX, centerZ, rng);
        } else {
          createDowntownBlock(centerX, centerZ, rng);
        }
      } else if (rng() > 0.7) {
        createParkBlock(centerX, centerZ, rng);
      } else {
        createResidentialBlock(centerX, centerZ, rng);
      }
    }
  }
}

function buildPedestrianRoute(centerX, centerZ) {
  const offset = CONFIG.BLOCK_SIZE / 2 + CONFIG.ROAD_WIDTH * 0.18;
  pedestrianRoutes.push([
    new THREE.Vector3(centerX - offset, 0, centerZ - offset),
    new THREE.Vector3(centerX, 0, centerZ - offset),
    new THREE.Vector3(centerX + offset, 0, centerZ - offset),
    new THREE.Vector3(centerX + offset, 0, centerZ),
    new THREE.Vector3(centerX + offset, 0, centerZ + offset),
    new THREE.Vector3(centerX, 0, centerZ + offset),
    new THREE.Vector3(centerX - offset, 0, centerZ + offset),
    new THREE.Vector3(centerX - offset, 0, centerZ),
  ]);
}

function createDowntownBlock(centerX, centerZ, rng) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.BLOCK_SIZE - 4, 0.5, CONFIG.BLOCK_SIZE - 4),
    new THREE.MeshStandardMaterial({
      color: 0x2e3640,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  base.position.set(centerX, 0.25, centerZ);
  base.receiveShadow = true;
  scene.add(base);

  const plotOffset = CONFIG.BLOCK_SIZE * 0.22;
  const plots = [
    [-plotOffset, -plotOffset],
    [plotOffset, -plotOffset],
    [plotOffset, plotOffset],
    [-plotOffset, plotOffset],
  ];

  for (const [offsetX, offsetZ] of plots) {
    const width = randomRange(rng, 15, 22);
    const depth = randomRange(rng, 15, 22);
    const height = randomRange(rng, 28, 76);
    createBuilding(
      centerX + offsetX,
      centerZ + offsetZ,
      width,
      depth,
      height,
      pick(rng, [0x4b5361, 0x5f6874, 0x38414e, 0x667281]),
      rng,
      true,
    );
  }

  if (rng() > 0.45) {
    const sculpture = createCylinder(2.2, 2.2, 10, 18, 0x7c8aa0);
    sculpture.position.set(centerX, 5.2, centerZ);
    sculpture.castShadow = true;
    scene.add(sculpture);
    addObstacle(centerX, centerZ, 6, 6, "plaza");
  }
}

function createMixedBlock(centerX, centerZ, rng) {
  const pad = 10;
  const mixedGround = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.BLOCK_SIZE - 6, 0.4, CONFIG.BLOCK_SIZE - 6),
    new THREE.MeshStandardMaterial({
      color: 0x36403a,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  mixedGround.position.set(centerX, 0.24, centerZ);
  mixedGround.receiveShadow = true;
  scene.add(mixedGround);

  createBuilding(
    centerX - 13,
    centerZ - 11,
    randomRange(rng, 15, 21),
    randomRange(rng, 15, 19),
    randomRange(rng, 18, 34),
    pick(rng, [0x606b75, 0x52606d, 0x454f5c]),
    rng,
    false,
  );

  createBuilding(
    centerX + 14,
    centerZ + 9,
    randomRange(rng, 16, 20),
    randomRange(rng, 14, 20),
    randomRange(rng, 20, 36),
    pick(rng, [0x6d726d, 0x6f6860, 0x5a5f68]),
    rng,
    false,
  );

  createShop(centerX + 15, centerZ - 16, rng);
  createHouse(centerX - 16, centerZ + 16, rng, 1.1);

  const path = createBox(
    CONFIG.BLOCK_SIZE - pad * 2,
    0.04,
    CONFIG.BLOCK_SIZE - pad * 2,
    new THREE.MeshStandardMaterial({
      color: 0x5a5f61,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );
  path.position.set(centerX, 0.29, centerZ);
  scene.add(path);
}

function createResidentialBlock(centerX, centerZ, rng) {
  const lawn = createBox(
    CONFIG.BLOCK_SIZE - 8,
    0.35,
    CONFIG.BLOCK_SIZE - 8,
    new THREE.MeshStandardMaterial({
      color: 0x42654a,
      roughness: 1,
      metalness: 0,
    }),
  );
  lawn.position.set(centerX, 0.22, centerZ);
  lawn.receiveShadow = true;
  scene.add(lawn);

  createHouse(centerX - 15, centerZ - 14, rng, 1.05);
  createHouse(centerX + 16, centerZ - 12, rng, 0.95);
  createHouse(centerX, centerZ + 15, rng, 1.15);

  for (let index = 0; index < 5; index += 1) {
    createTree(
      centerX + randomRange(rng, -24, 24),
      centerZ + randomRange(rng, -24, 24),
      randomRange(rng, 0.8, 1.4),
    );
  }
}

function createParkBlock(centerX, centerZ, rng) {
  const park = createBox(
    CONFIG.BLOCK_SIZE - 8,
    0.35,
    CONFIG.BLOCK_SIZE - 8,
    new THREE.MeshStandardMaterial({
      color: 0x3a6b40,
      roughness: 0.98,
      metalness: 0,
    }),
  );
  park.position.set(centerX, 0.22, centerZ);
  park.receiveShadow = true;
  scene.add(park);

  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8bb91,
    roughness: 0.98,
    metalness: 0,
  });

  const pathA = createBox(CONFIG.BLOCK_SIZE - 16, 0.02, 4.4, pathMaterial);
  pathA.position.set(centerX, 0.3, centerZ);
  scene.add(pathA);

  const pathB = createBox(4.4, 0.02, CONFIG.BLOCK_SIZE - 16, pathMaterial);
  pathB.position.set(centerX, 0.3, centerZ);
  scene.add(pathB);

  const fountainBase = createCylinder(6.2, 6.2, 1.5, 28, 0x8a939d);
  fountainBase.position.set(centerX, 0.75, centerZ);
  fountainBase.castShadow = true;
  fountainBase.receiveShadow = true;
  scene.add(fountainBase);
  addObstacle(centerX, centerZ, 10, 10, "fountain");

  const fountainWaterMaterial = new THREE.MeshStandardMaterial({
    color: 0x79d8ff,
    emissive: 0x79d8ff,
    emissiveIntensity: 0.04,
    roughness: 0.1,
    metalness: 0.1,
  });
  const fountainWater = createCylinder(5.2, 5.2, 0.28, 28, 0x79d8ff, fountainWaterMaterial);
  fountainWater.position.set(centerX, 1.35, centerZ);
  scene.add(fountainWater);

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    createTree(
      centerX + Math.cos(angle) * randomRange(rng, 18, 24),
      centerZ + Math.sin(angle) * randomRange(rng, 18, 24),
      randomRange(rng, 0.9, 1.6),
    );
  }

  if (rng() > 0.45) {
    createShop(centerX + 17, centerZ + 16, rng, true);
  }
}

function createBuilding(x, z, width, depth, height, color, rng, rooftopSign) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.12,
  });

  const body = createBox(width, height, depth, bodyMaterial);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const topAccent = createBox(
    width * 0.88,
    1.2,
    depth * 0.88,
    new THREE.MeshStandardMaterial({
      color: 0xa5aab5,
      roughness: 0.42,
      metalness: 0.3,
    }),
  );
  topAccent.position.y = height + 0.6;
  topAccent.castShadow = true;
  group.add(topAccent);

  addWindowPlanes(group, width, depth, height, pick(rng, [0xffcc74, 0xffe1a6, 0x89f4ff]));

  if (rooftopSign && rng() > 0.5) {
    const signColor = pick(rng, [0xff8f1f, 0x4cf8d0, 0xff5470]);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0x11151a,
      emissive: signColor,
      emissiveIntensity: 0.12,
      roughness: 0.55,
      metalness: 0.22,
    });
    neonMaterials.push(signMaterial);

    const sign = createBox(width * 0.6, 4.8, 1.1, signMaterial);
    sign.position.set(0, height + 4, depth / 2 + 0.8);
    group.add(sign);
  }

  group.userData.kind = "vehicle-immune";
  scene.add(group);
  addObstacle(x, z, width + 1.6, depth + 1.6, "building");
}

function addWindowPlanes(group, width, depth, height, emissiveColor) {
  const frontMaterial = new THREE.MeshStandardMaterial({
    color: 0x26303c,
    emissive: emissiveColor,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: 0.5,
    roughness: 0.45,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  windowGlowMaterials.push(frontMaterial);

  const frontPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.76, height * 0.68),
    frontMaterial,
  );
  frontPanel.position.set(0, height * 0.57, depth / 2 + 0.04);
  group.add(frontPanel);

  const backPanel = frontPanel.clone();
  backPanel.position.z = -depth / 2 - 0.04;
  backPanel.rotation.y = Math.PI;
  group.add(backPanel);

  const sideMaterial = frontMaterial.clone();
  windowGlowMaterials.push(sideMaterial);

  const sidePanel = new THREE.Mesh(
    new THREE.PlaneGeometry(depth * 0.68, height * 0.68),
    sideMaterial,
  );
  sidePanel.position.set(width / 2 + 0.04, height * 0.57, 0);
  sidePanel.rotation.y = -Math.PI / 2;
  group.add(sidePanel);

  const otherSidePanel = sidePanel.clone();
  otherSidePanel.position.x = -width / 2 - 0.04;
  otherSidePanel.rotation.y = Math.PI / 2;
  group.add(otherSidePanel);
}

function createHouse(x, z, rng, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const width = randomRange(rng, 14, 18) * scale;
  const depth = randomRange(rng, 12, 16) * scale;
  const height = randomRange(rng, 8, 11) * scale;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: pick(rng, [0xd0c4b8, 0xb8d0c1, 0xd9d0ba, 0xccb9ad]),
    roughness: 0.95,
    metalness: 0.02,
  });

  const houseBody = createBox(width, height, depth, wallMaterial);
  houseBody.position.y = height / 2;
  houseBody.castShadow = true;
  houseBody.receiveShadow = true;
  group.add(houseBody);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.56, 4.8 * scale, 4),
    new THREE.MeshStandardMaterial({
      color: pick(rng, [0x9e4b3f, 0x67423f, 0x5a4348]),
      roughness: 0.86,
      metalness: 0.03,
    }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = height + 2.2 * scale;
  roof.castShadow = true;
  group.add(roof);

  const door = createBox(
    2.2 * scale,
    4.2 * scale,
    0.3,
    new THREE.MeshStandardMaterial({
      color: 0x5a3624,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  door.position.set(0, 2.1 * scale, depth / 2 + 0.21);
  group.add(door);

  addWindowPlanes(group, width * 0.86, depth * 0.86, height * 0.72, 0xffdba3);

  const porch = createBox(
    width * 0.55,
    0.3,
    4.8 * scale,
    new THREE.MeshStandardMaterial({
      color: 0x98908a,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  porch.position.set(0, 0.15, depth / 2 + 1.9 * scale);
  group.add(porch);

  scene.add(group);
  addObstacle(x, z, width + 1, depth + 1, "house");
}

function createShop(x, z, rng, compact = false) {
  const width = compact ? 12 : 16;
  const depth = compact ? 10 : 14;
  const height = compact ? 7 : 8.5;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = createBox(
    width,
    height,
    depth,
    new THREE.MeshStandardMaterial({
      color: 0x7e8178,
      roughness: 0.92,
      metalness: 0.05,
    }),
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const signMaterial = new THREE.MeshStandardMaterial({
    color: 0x15181d,
    emissive: pick(rng, [0xff8f1f, 0x55f6d8, 0xff5470]),
    emissiveIntensity: 0.14,
    roughness: 0.6,
    metalness: 0.15,
  });
  neonMaterials.push(signMaterial);

  const sign = createBox(width * 0.7, 2.6, 0.6, signMaterial);
  sign.position.set(0, height + 1.4, depth / 2 + 0.5);
  group.add(sign);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.78, height * 0.54),
    new THREE.MeshStandardMaterial({
      color: 0xadcce8,
      emissive: 0x8cd8ff,
      emissiveIntensity: 0.04,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.2,
    }),
  );
  glass.position.set(0, height * 0.55, depth / 2 + 0.32);
  group.add(glass);

  scene.add(group);
  addObstacle(x, z, width + 1, depth + 1, "shop");
}

function createTree(x, z, scale = 1) {
  const rng = createRandom(Math.floor((x + 300) * 17 + (z + 300) * 37));

  const trunk = createCylinder(
    0.65 * scale,
    0.82 * scale,
    4.8 * scale,
    10,
    0x6b4c2d,
  );
  trunk.position.set(x, 2.4 * scale, z);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  scene.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.SphereGeometry(3.2 * scale, 14, 12),
    new THREE.MeshStandardMaterial({
      color: pick(rng, [0x4f9b57, 0x3c8045, 0x5bb163]),
      roughness: 1,
      metalness: 0,
    }),
  );
  foliage.position.set(x, 6.5 * scale, z);
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  scene.add(foliage);
}

function createStreetLights() {
  for (let xIndex = 0; xIndex < world.roadCenters.length - 1; xIndex += 1) {
    for (let zIndex = 0; zIndex < world.roadCenters.length - 1; zIndex += 1) {
      if ((xIndex + zIndex) % 2 !== 0) {
        continue;
      }
      const x = world.roadCenters[xIndex] + CONFIG.ROAD_WIDTH * 0.34;
      const z = world.roadCenters[zIndex] + CONFIG.ROAD_WIDTH * 0.34;
      placeStreetLight(x, z);
    }
  }
}

function placeStreetLight(x, z) {
  const pole = createCylinder(0.18, 0.26, 8.8, 10, 0x58616e);
  pole.position.set(x, 4.4, z);
  pole.castShadow = true;
  scene.add(pole);

  const arm = createBox(
    2.2,
    0.22,
    0.22,
    new THREE.MeshStandardMaterial({
      color: 0x6a7280,
      roughness: 0.75,
      metalness: 0.25,
    }),
  );
  arm.position.set(x + 0.85, 8.2, z);
  arm.castShadow = true;
  scene.add(arm);

  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0c3,
    emissive: 0xffce74,
    emissiveIntensity: 0.08,
    roughness: 0.45,
    metalness: 0.05,
  });
  lampGlowMaterials.push(bulbMaterial);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    bulbMaterial,
  );
  bulb.position.set(x + 1.8, 8.1, z);
  scene.add(bulb);

  const light = new THREE.PointLight(0xffd89c, 0, 62, 2);
  light.position.set(x + 1.8, 8.05, z);
  lampLights.push(light);
  scene.add(light);
}

function buildTrafficRoutes() {
  const lane = CONFIG.ROAD_WIDTH * 0.22;

  for (let ring = 0; ring < Math.floor(world.roadCenters.length / 2); ring += 1) {
    const leftRoad = world.roadCenters[ring];
    const rightRoad = world.roadCenters[world.roadCenters.length - 1 - ring];
    const topRoad = world.roadCenters[ring];
    const bottomRoad = world.roadCenters[world.roadCenters.length - 1 - ring];

    if (rightRoad - leftRoad < CONFIG.ROAD_WIDTH * 2.4) {
      continue;
    }

    trafficRoutes.push([
      new THREE.Vector3(leftRoad + lane, 0, topRoad + lane),
      new THREE.Vector3(rightRoad - lane, 0, topRoad + lane),
      new THREE.Vector3(rightRoad - lane, 0, bottomRoad - lane),
      new THREE.Vector3(leftRoad + lane, 0, bottomRoad - lane),
    ]);

    trafficRoutes.push([
      new THREE.Vector3(rightRoad - lane, 0, topRoad - lane),
      new THREE.Vector3(leftRoad + lane, 0, topRoad - lane),
      new THREE.Vector3(leftRoad + lane, 0, bottomRoad + lane),
      new THREE.Vector3(rightRoad - lane, 0, bottomRoad + lane),
    ]);
  }

  const innerLeft = world.roadCenters[1];
  const innerRight = world.roadCenters[world.roadCenters.length - 2];
  const middleRoad = world.roadCenters[Math.floor(world.roadCenters.length / 2)];
  trafficRoutes.push([
    new THREE.Vector3(innerLeft + lane, 0, middleRoad + lane),
    new THREE.Vector3(innerRight - lane, 0, middleRoad + lane),
    new THREE.Vector3(innerRight - lane, 0, innerLeft - lane),
    new THREE.Vector3(innerLeft + lane, 0, innerLeft - lane),
  ]);

  for (const route of trafficRoutes) {
    for (let index = 0; index < route.length; index += 1) {
      const next = route[(index + 1) % route.length];
      missionLocations.push(route[index].clone().lerp(next, 0.5));
    }
  }
}

function createMissionMarker() {
  const group = new THREE.Group();

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb354,
    emissive: 0xff8f1f,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.45,
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.2, 0.34, 16, 36),
    ringMaterial,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.8;
  group.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 4.1, 20, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffbb63,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 10;
  group.add(beam);

  const glow = new THREE.PointLight(0xffb861, 1.8, 65, 2);
  glow.position.y = 6.5;
  group.add(glow);

  scene.add(group);
  world.missionMarker = group;
  world.missionBeam = beam;
  world.missionLight = glow;
}

function createPlayerRig() {
  const rig = new THREE.Group();

  const jacket = new THREE.MeshStandardMaterial({
    color: 0x1f3048,
    roughness: 0.78,
    metalness: 0.08,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: 0x191c22,
    roughness: 0.82,
    metalness: 0.05,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xd5b399,
    roughness: 0.95,
    metalness: 0,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xff8f1f,
    roughness: 0.55,
    metalness: 0.18,
  });

  const torso = createBox(2.6, 3.2, 1.6, jacket);
  torso.position.y = 3.9;
  torso.castShadow = true;
  rig.add(torso);

  const chestAccent = createBox(1.2, 1.1, 1.66, accent);
  chestAccent.position.set(0, 4.25, 0.03);
  rig.add(chestAccent);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 14), skin);
  head.position.y = 6.25;
  head.castShadow = true;
  rig.add(head);

  const legLeft = createBox(0.8, 2.3, 0.8, pants);
  legLeft.position.set(-0.6, 1.2, 0);
  legLeft.castShadow = true;
  rig.add(legLeft);

  const legRight = createBox(0.8, 2.3, 0.8, pants);
  legRight.position.set(0.6, 1.2, 0);
  legRight.castShadow = true;
  rig.add(legRight);

  const armLeft = createBox(0.7, 2.4, 0.7, jacket);
  armLeft.position.set(-1.9, 4.1, 0);
  armLeft.castShadow = true;
  rig.add(armLeft);

  const armRight = createBox(0.7, 2.4, 0.7, jacket);
  armRight.position.set(1.9, 4.1, 0);
  armRight.castShadow = true;
  rig.add(armRight);

  const pistol = createBox(
    0.22,
    0.42,
    1.18,
    new THREE.MeshStandardMaterial({
      color: 0x2c3138,
      roughness: 0.55,
      metalness: 0.32,
    }),
  );
  pistol.position.set(0.3, -0.7, 0.68);
  armRight.add(pistol);

  world.playerRig = rig;
  world.playerParts = { torso, head, legLeft, legRight, armLeft, armRight, pistol };
  scene.add(rig);
}

function createVehicleHeadlights() {
  for (let index = 0; index < 2; index += 1) {
    const light = new THREE.SpotLight(0xfff0c8, 0, 120, 0.4, 0.45, 1.6);
    light.castShadow = false;
    const target = new THREE.Object3D();
    scene.add(target);
    light.target = target;
    scene.add(light);
    world.headlightRig.push(light);
    world.headlightTargets.push(target);
  }
}

function setSpawnPoint() {
  const spawnRoad = world.roadCenters[Math.floor(world.roadCenters.length / 2)];
  player.position.set(spawnRoad + 5, 0, spawnRoad - 22);
}

function spawnPedestrians() {
  for (let index = 0; index < CONFIG.PEDESTRIAN_COUNT; index += 1) {
    const route = pedestrianRoutes[index % pedestrianRoutes.length];
    pedestrians.push(new Pedestrian(route, index));
  }
}

function spawnVehicles() {
  for (let index = 0; index < CONFIG.TRAFFIC_COUNT; index += 1) {
    const route = trafficRoutes[index % trafficRoutes.length];
    vehicles.push(new Vehicle({ route, routeOffset: index * 0.23 }));
  }

  const parkingSpots = [];
  for (const x of world.blockCenters) {
    for (const z of world.blockCenters) {
      parkingSpots.push({
        x,
        z: z - CONFIG.BLOCK_SIZE / 2 - CONFIG.ROAD_WIDTH * 0.2,
        yaw: Math.PI / 2,
      });
      parkingSpots.push({
        x: x - CONFIG.BLOCK_SIZE / 2 - CONFIG.ROAD_WIDTH * 0.2,
        z,
        yaw: 0,
      });
    }
  }

  for (let index = 0; index < CONFIG.PARKED_COUNT; index += 1) {
    const spot = parkingSpots[index * 2];
    vehicles.push(
      new Vehicle({
        parked: true,
        startPosition: new THREE.Vector3(spot.x, 0, spot.z),
        yaw: spot.yaw,
      }),
    );
  }
}

class Pedestrian {
  constructor(route, seed) {
    this.kind = "pedestrian";
    this.route = route.map((point) => point.clone());
    this.routeIndex = seed % this.route.length;
    this.group = new THREE.Group();
    this.group.position.copy(this.route[this.routeIndex]);
    this.group.rotation.y = (seed * 0.9) % (Math.PI * 2);
    this.speed = 3.5 + (seed % 7) * 0.22;
    this.baseSpeed = this.speed;
    this.radius = 1.6;
    this.health = 100;
    this.fleeTimer = 0;
    this.robberyTimer = 0;
    this.dead = false;
    this.cleanupTimer = 0;
    this.moneyValue = 35 + (seed % 6) * 12;
    this.knockback = new THREE.Vector3();
    this.walkCycle = seed * 0.61;
    this.createMesh(seed);
    scene.add(this.group);
  }

  createMesh(seed) {
    const rng = createRandom(seed * 17 + 41);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: pick(rng, [0x3963b6, 0x8b3fb0, 0xd8593b, 0x2e9178, 0xc6a23b]),
      roughness: 0.82,
      metalness: 0.05,
    });
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: pick(rng, [0x22272e, 0x4b525f, 0x22384a, 0x3f2c2e]),
      roughness: 0.88,
      metalness: 0.04,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: pick(rng, [0xcda188, 0xe1b99e, 0x9d785f, 0x7c5844]),
      roughness: 0.95,
      metalness: 0,
    });

    this.body = createBox(1.7, 2.8, 1, topMaterial);
    this.body.position.y = 3.3;
    this.body.castShadow = true;
    this.group.add(this.body);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 14, 12),
      skinMaterial,
    );
    this.head.position.y = 5.45;
    this.head.castShadow = true;
    this.group.add(this.head);

    this.legLeft = createBox(0.55, 2, 0.55, pantsMaterial);
    this.legLeft.position.set(-0.42, 1.05, 0);
    this.legLeft.castShadow = true;
    this.group.add(this.legLeft);

    this.legRight = createBox(0.55, 2, 0.55, pantsMaterial);
    this.legRight.position.set(0.42, 1.05, 0);
    this.legRight.castShadow = true;
    this.group.add(this.legRight);

    this.armLeft = createBox(0.45, 1.8, 0.45, topMaterial);
    this.armLeft.position.set(-1.12, 3.35, 0);
    this.group.add(this.armLeft);

    this.armRight = createBox(0.45, 1.8, 0.45, topMaterial);
    this.armRight.position.set(1.12, 3.35, 0);
    this.group.add(this.armRight);

    registerTargetMesh(this.body, this);
    registerTargetMesh(this.head, this);
  }

  isDamageable() {
    return !this.dead && this.group.visible;
  }

  triggerFlee(fromPosition) {
    const jitterX = Math.random() * 8 - 4;
    const jitterZ = Math.random() * 8 - 4;
    const dx = this.group.position.x - fromPosition.x + jitterX;
    const dz = this.group.position.z - fromPosition.z + jitterZ;
    this.fleeAngle = Math.atan2(dx, dz);
    this.fleeTimer = 5 + Math.random() * 3;
  }

  rob() {
    if (this.dead || this.robberyTimer > 0) {
      return 0;
    }
    const reward = this.moneyValue;
    this.robberyTimer = 15;
    this.triggerFlee(player.position);
    return reward;
  }

  takeDamage(amount, sourcePosition, impulse = 0) {
    if (this.dead) {
      return;
    }
    this.health -= amount;
    this.triggerFlee(sourcePosition);
    const knockDirection = getForwardVector(this.fleeAngle ?? 0, new THREE.Vector3());
    this.knockback.add(knockDirection.multiplyScalar(Math.max(impulse, 2)));
    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    if (this.dead) {
      return;
    }
    this.dead = true;
    this.fleeTimer = 0;
    this.cleanupTimer = 24;
    this.body.material.color.set(0x5b3136);
    this.group.rotation.z = (Math.random() > 0.5 ? 1 : -1) * 0.9;
    spawnCashPickup(this.group.position.clone(), this.moneyValue + 20);
  }

  update(delta) {
    if (this.robberyTimer > 0) {
      this.robberyTimer -= delta;
    }

    if (this.dead) {
      this.cleanupTimer -= delta;
      if (this.cleanupTimer <= 0) {
        this.group.visible = false;
      }
      return;
    }

    const movement = tempVectors.a.set(0, 0, 0);
    let speed = this.baseSpeed;

    if (this.fleeTimer > 0) {
      this.fleeTimer -= delta;
      speed *= 1.85;
      movement.copy(getForwardVector(this.fleeAngle, tempVectors.b));
    } else {
      const targetPoint = this.route[this.routeIndex];
      movement.set(
        targetPoint.x - this.group.position.x,
        0,
        targetPoint.z - this.group.position.z,
      );
      if (movement.lengthSq() < 5) {
        this.routeIndex = (this.routeIndex + 1) % this.route.length;
      }
      movement.normalize();
    }

    this.group.rotation.y = dampAngle(
      this.group.rotation.y,
      Math.atan2(movement.x, movement.z),
      9,
      delta,
    );

    this.knockback.multiplyScalar(Math.exp(-5 * delta));
    const moveX = movement.x * speed * delta + this.knockback.x * delta;
    const moveZ = movement.z * speed * delta + this.knockback.z * delta;
    tryMoveCircle(this.group.position, moveX, moveZ, this.radius);

    this.walkCycle += delta * speed * 2.1;
    const swing = Math.sin(this.walkCycle) * 0.65;
    this.legLeft.rotation.x = swing;
    this.legRight.rotation.x = -swing;
    this.armLeft.rotation.x = -swing * 0.75;
    this.armRight.rotation.x = swing * 0.75;
  }
}

class Vehicle {
  constructor({ route = null, routeOffset = 0, parked = false, startPosition = null, yaw = 0 }) {
    this.kind = "vehicle";
    this.route = route ? route.map((point) => point.clone()) : null;
    this.routeIndex = 1;
    this.routeProgress = routeOffset;
    this.parked = parked;
    this.playerControlled = false;
    this.speed = parked ? 0 : 11 + routeOffset * 4;
    this.maxSpeed = parked ? 0 : 18 + routeOffset * 2;
    this.reverseSpeed = 10;
    this.collisionRadius = 4.6;
    this.health = 180;
    this.destroyed = false;
    this.driverPresent = !parked;
    this.wreckTimer = 0;
    this.group = new THREE.Group();
    this.group.position.copy(startPosition ?? this.route[0]);
    this.group.rotation.y = yaw || (this.route ? getYawBetween(this.route[0], this.route[1]) : 0);
    this.yaw = this.group.rotation.y;

    if (this.route && !parked) {
      const segmentFloat = (routeOffset * 2.6) % this.route.length;
      const currentIndex = Math.floor(segmentFloat) % this.route.length;
      const nextIndex = (currentIndex + 1) % this.route.length;
      const blend = segmentFloat - currentIndex;
      this.group.position.copy(
        this.route[currentIndex].clone().lerp(this.route[nextIndex], blend),
      );
      this.routeIndex = nextIndex;
      this.yaw = getYawBetween(this.route[currentIndex], this.route[nextIndex]);
      this.group.rotation.y = this.yaw;
    }

    this.buildMesh();
    scene.add(this.group);
  }

  buildMesh() {
    const color = pick(Math.random, [0xc53f40, 0x3492d3, 0xe6b44b, 0x2eb276, 0xd8d8d8, 0x6f5ee8]);
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.58,
      metalness: 0.32,
    });
    this.windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ab6ca,
      roughness: 0.16,
      metalness: 0.28,
      transparent: true,
      opacity: 0.72,
    });
    this.headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2d2,
      emissive: 0xffe2a6,
      emissiveIntensity: 0.1,
      roughness: 0.2,
      metalness: 0.08,
    });
    this.brakeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x741d22,
      emissive: 0xff525d,
      emissiveIntensity: 0.06,
      roughness: 0.2,
      metalness: 0.08,
    });

    const chassis = createBox(4.2, 1.35, 8.1, this.bodyMaterial);
    chassis.position.y = 1.7;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.group.add(chassis);

    const cabin = createBox(3.1, 1.4, 3.7, this.windowMaterial);
    cabin.position.set(0, 2.85, -0.2);
    cabin.castShadow = true;
    this.group.add(cabin);

    const roof = createBox(
      3,
      0.35,
      3.3,
      new THREE.MeshStandardMaterial({
        color: 0x16191f,
        roughness: 0.45,
        metalness: 0.28,
      }),
    );
    roof.position.set(0, 3.55, -0.15);
    roof.castShadow = true;
    this.group.add(roof);

    const bumperFront = createBox(3.9, 0.45, 0.35, this.bodyMaterial);
    bumperFront.position.set(0, 1.2, 4.1);
    this.group.add(bumperFront);

    const bumperBack = createBox(3.9, 0.45, 0.35, this.bodyMaterial);
    bumperBack.position.set(0, 1.2, -4.1);
    this.group.add(bumperBack);

    this.headlights = [
      createBox(0.55, 0.4, 0.2, this.headlightMaterial),
      createBox(0.55, 0.4, 0.2, this.headlightMaterial),
    ];
    this.headlights[0].position.set(-1.1, 1.7, 4.18);
    this.headlights[1].position.set(1.1, 1.7, 4.18);
    this.group.add(this.headlights[0], this.headlights[1]);

    this.brakeLights = [
      createBox(0.55, 0.34, 0.2, this.brakeLightMaterial),
      createBox(0.55, 0.34, 0.2, this.brakeLightMaterial),
    ];
    this.brakeLights[0].position.set(-1.1, 1.55, -4.18);
    this.brakeLights[1].position.set(1.1, 1.55, -4.18);
    this.group.add(this.brakeLights[0], this.brakeLights[1]);

    this.wheels = [];
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x171a1f,
      roughness: 0.96,
      metalness: 0.02,
    });
    const wheelOffsets = [
      [-1.7, 0.95, 2.6],
      [1.7, 0.95, 2.6],
      [-1.7, 0.95, -2.6],
      [1.7, 0.95, -2.6],
    ];
    for (const [x, y, z] of wheelOffsets) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.86, 0.86, 0.7, 14),
        wheelMaterial,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      this.wheels.push(wheel);
      this.group.add(wheel);
    }

    this.driverMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xe3b899,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    this.driverMarker.position.set(-0.5, 3.05, 0);
    this.group.add(this.driverMarker);

    registerTargetMesh(chassis, this);
    registerTargetMesh(cabin, this);
  }

  isDamageable() {
    return !this.destroyed;
  }

  takeDamage(amount) {
    if (this.destroyed) {
      return;
    }
    this.health -= amount;
    if (this.health <= 0) {
      this.destroy();
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.speed = 0;
    this.playerControlled = false;
    this.driverPresent = false;
    this.bodyMaterial.color.set(0x3b2729);
    this.bodyMaterial.emissive.set(0xff4f32);
    this.bodyMaterial.emissiveIntensity = 0.18;
    this.headlightMaterial.emissiveIntensity = 0;
    this.brakeLightMaterial.emissiveIntensity = 0.22;
    this.driverMarker.visible = false;
    this.wreckTimer = 20;
    spawnCashPickup(this.group.position.clone(), 120);

    if (currentVehicle === this) {
      exitVehicle(true);
    }
  }

  hijack() {
    if (this.destroyed) {
      return false;
    }
    if (this.driverPresent) {
      const dropPoint = this.group.position
        .clone()
        .add(getRightVector(this.yaw, new THREE.Vector3()).multiplyScalar(6));
      const route = pedestrianRoutes[Math.floor(Math.random() * pedestrianRoutes.length)];
      const panicked = new Pedestrian(route, Math.floor(Math.random() * 9999));
      panicked.group.position.copy(dropPoint);
      panicked.triggerFlee(player.position);
      pedestrians.push(panicked);
    }
    this.driverPresent = false;
    this.playerControlled = true;
    this.parked = false;
    currentVehicle = this;
    this.driverMarker.visible = false;
    return true;
  }

  update(delta) {
    this.driverMarker.visible = this.driverPresent && !this.destroyed;

    if (this.destroyed) {
      this.wreckTimer -= delta;
      this.bodyMaterial.emissiveIntensity = 0.12 + Math.sin(clock.elapsedTime * 8) * 0.05;
      return;
    }

    if (this.playerControlled) {
      this.updateAsPlayerVehicle(delta);
    } else if (!this.parked && this.route) {
      this.updateTraffic(delta);
    } else {
      this.speed *= Math.exp(-4 * delta);
    }

    this.updateVisuals(delta);
    this.checkEntityHits();
  }

  updateTraffic(delta) {
    const target = this.route[this.routeIndex];
    const direction = tempVectors.a.set(
      target.x - this.group.position.x,
      0,
      target.z - this.group.position.z,
    );
    const distance = direction.length();

    if (distance < 6) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      return;
    }

    direction.normalize();
    const desiredYaw = Math.atan2(direction.x, direction.z);
    this.yaw = dampAngle(this.yaw, desiredYaw, 4, delta);
    this.group.rotation.y = this.yaw;

    const nearbyBlocked = vehicles.some((vehicle) => {
      if (vehicle === this || vehicle.destroyed) {
        return false;
      }
      const separation = distance2D(
        this.group.position.x,
        this.group.position.z,
        vehicle.group.position.x,
        vehicle.group.position.z,
      );
      if (separation > 11) {
        return false;
      }
      const forward = getForwardVector(this.yaw, tempVectors.b);
      const toOther = tempVectors.c.set(
        vehicle.group.position.x - this.group.position.x,
        0,
        vehicle.group.position.z - this.group.position.z,
      );
      return forward.dot(toOther.normalize()) > 0.55;
    });

    const desiredSpeed = nearbyBlocked ? 5 : this.maxSpeed;
    this.speed = damp(this.speed, desiredSpeed, 2.2, delta);

    const move = getForwardVector(this.yaw, tempVectors.b).multiplyScalar(this.speed * delta);
    const moved = tryMoveCircle(
      this.group.position,
      move.x,
      move.z,
      this.collisionRadius,
      this,
    );

    if (!moved) {
      this.speed *= 0.18;
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
    }
  }

  updateAsPlayerVehicle(delta) {
    const throttle = (isKeyPressed("KeyW") ? 1 : 0) - (isKeyPressed("KeyS") ? 1 : 0);
    const steering = (isKeyPressed("KeyD") ? 1 : 0) - (isKeyPressed("KeyA") ? 1 : 0);
    const handbrake = isKeyPressed("Space");

    if (throttle > 0) {
      this.speed += 26 * delta;
    } else if (throttle < 0) {
      if (this.speed > 0) {
        this.speed -= 34 * delta;
      } else {
        this.speed -= 17 * delta;
      }
    } else {
      this.speed *= Math.exp(-1.8 * delta);
    }

    if (handbrake) {
      this.speed *= Math.exp(-5 * delta);
    }

    this.speed = clamp(this.speed, -this.reverseSpeed, 34);
    const steeringForce = steering * clamp(this.speed / 14, -1.3, 1.3);
    this.yaw += steeringForce * delta * 1.8;
    this.group.rotation.y = this.yaw;

    const move = getForwardVector(this.yaw, tempVectors.a).multiplyScalar(this.speed * delta);
    const moved = tryMoveCircle(
      this.group.position,
      move.x,
      move.z,
      this.collisionRadius,
      this,
    );

    if (!moved) {
      const impact = Math.abs(this.speed);
      this.speed *= -0.18;
      this.takeDamage(impact * 1.8);
      if (impact > 8) {
        showToast("Colisao forte no carro.", 1.6);
      }
    }
  }

  updateVisuals(delta) {
    const wheelTurn = this.speed * delta * 1.4;
    for (const wheel of this.wheels) {
      wheel.rotation.x += wheelTurn;
    }

    const nightFactor = 1 - state.dayFactor;
    this.headlightMaterial.emissiveIntensity = this.playerControlled
      ? 0.45 + nightFactor * 1.1
      : 0.12 + nightFactor * 0.45;
    this.brakeLightMaterial.emissiveIntensity =
      0.06 + (Math.abs(this.speed) < 0.8 ? 0.2 : 0) + nightFactor * 0.22;
  }

  checkEntityHits() {
    const impactSpeed = Math.abs(this.speed);
    if (impactSpeed < 8) {
      return;
    }

    for (const pedestrian of pedestrians) {
      if (!pedestrian.isDamageable()) {
        continue;
      }
      const hitDistance = distance2D(
        this.group.position.x,
        this.group.position.z,
        pedestrian.group.position.x,
        pedestrian.group.position.z,
      );
      if (hitDistance < this.collisionRadius + pedestrian.radius - 0.3) {
        pedestrian.takeDamage(
          Math.min(140, impactSpeed * 8),
          this.group.position,
          impactSpeed * 0.5,
        );
        this.speed *= 0.72;
      }
    }

    if (!currentVehicle && player.health > 0) {
      const hitDistance = distance2D(
        this.group.position.x,
        this.group.position.z,
        player.position.x,
        player.position.z,
      );
      if (hitDistance < this.collisionRadius + player.radius - 0.4) {
        damagePlayer(Math.min(55, impactSpeed * 2.3), this.group.position);
        const push = getForwardVector(this.yaw, tempVectors.a).multiplyScalar(
          impactSpeed * 0.35,
        );
        player.velocity.add(push);
        this.speed *= 0.6;
      }
    }
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);

  if (!state.booted) {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
    return;
  }

  if (!state.mapOpen) {
    updateWorld(delta);
  } else {
    updateTimeOfDay(delta * 0.15);
    drawMap();
  }

  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateWorld(delta) {
  updateTimeOfDay(delta);

  if (state.started) {
    updatePlayer(delta);
    updateCombat();
  }

  for (const pedestrian of pedestrians) {
    pedestrian.update(delta);
  }

  for (const vehicle of vehicles) {
    vehicle.update(delta);
  }

  updatePickups(delta);
  updateMission(delta);
  updateTransientEffects(delta);
  updatePlayerRig();
  updatePrompt(delta);
  updateHUD();
}

function updateTimeOfDay(delta) {
  state.timeOfDay = (state.timeOfDay + delta / CONFIG.DAY_LENGTH) % 1;
  const angle = state.timeOfDay * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(angle);
  state.dayFactor = clamp((sunHeight + 0.16) / 1.08, 0, 1);
  const nightFactor = 1 - state.dayFactor;

  const daySky = new THREE.Color(0x8dbde8);
  const duskSky = new THREE.Color(0xf69c52);
  const nightSky = new THREE.Color(0x050913);
  const blendedSky = nightSky.clone().lerp(duskSky, clamp(1 - Math.abs(sunHeight), 0, 1) * 0.65);
  blendedSky.lerp(daySky, state.dayFactor);

  scene.background.copy(blendedSky);
  scene.fog.color.copy(blendedSky);
  world.skyDome.material.color.copy(blendedSky);

  world.ambientLight.intensity = lerp(0.42, 1.55, state.dayFactor);
  world.sunLight.intensity = lerp(0.08, 2.25, state.dayFactor);
  world.moonLight.intensity = lerp(0.72, 0.05, state.dayFactor);

  world.sunLight.position.set(
    Math.cos(angle) * 180,
    80 + Math.max(sunHeight, -0.2) * 180,
    Math.sin(angle) * 130,
  );
  world.moonLight.position.set(
    -world.sunLight.position.x,
    100 + Math.max(-sunHeight, 0) * 70,
    -world.sunLight.position.z,
  );

  for (const material of windowGlowMaterials) {
    material.emissiveIntensity = 0.04 + nightFactor * 0.95;
  }

  for (const material of lampGlowMaterials) {
    material.emissiveIntensity = 0.05 + nightFactor * 1.35;
  }

  for (const material of neonMaterials) {
    material.emissiveIntensity = 0.12 + nightFactor * 1.3;
  }

  for (const light of lampLights) {
    light.intensity = 0.12 + nightFactor * nightFactor * 1.9;
  }

  renderer.toneMappingExposure = lerp(0.84, 1.12, state.dayFactor);
}

function updatePlayer(delta) {
  player.attackCooldown = Math.max(0, player.attackCooldown - delta);
  player.shootCooldown = Math.max(0, player.shootCooldown - delta);
  player.punchTimer = Math.max(0, player.punchTimer - delta);
  player.invulnerability = Math.max(0, player.invulnerability - delta);

  if (currentVehicle) {
    state.jumpQueued = false;
    player.stamina = damp(player.stamina, 100, 4, delta);
    return;
  }

  const { forward, right } = getMovementBasis(tempVectors.a, tempVectors.b);
  const moveIntent = tempVectors.c.set(0, 0, 0);
  const forwardInput = (isKeyPressed("KeyW") ? 1 : 0) - (isKeyPressed("KeyS") ? 1 : 0);
  const strafeInput = (isKeyPressed("KeyD") ? 1 : 0) - (isKeyPressed("KeyA") ? 1 : 0);

  moveIntent.addScaledVector(forward, forwardInput);
  moveIntent.addScaledVector(right, strafeInput);

  player.isRunning = false;
  if (moveIntent.lengthSq() > 0) {
    moveIntent.normalize();
    const wantsSprint = (isKeyPressed("ShiftLeft") || isKeyPressed("ShiftRight")) && player.stamina > 4;
    player.isRunning = wantsSprint;
    if (wantsSprint) {
      player.stamina = Math.max(0, player.stamina - 22 * delta);
    } else {
      player.stamina = Math.min(100, player.stamina + 16 * delta);
    }
    const targetSpeed = wantsSprint ? CONFIG.PLAYER_SPRINT_SPEED : CONFIG.PLAYER_WALK_SPEED;
    player.velocity.x = damp(player.velocity.x, moveIntent.x * targetSpeed, 14, delta);
    player.velocity.z = damp(player.velocity.z, moveIntent.z * targetSpeed, 14, delta);
  } else {
    player.stamina = Math.min(100, player.stamina + 20 * delta);
    player.velocity.x = damp(player.velocity.x, 0, 10, delta);
    player.velocity.z = damp(player.velocity.z, 0, 10, delta);
  }

  if (state.jumpQueued && player.onGround) {
    player.verticalVelocity = CONFIG.PLAYER_JUMP_FORCE;
    player.onGround = false;
  }
  state.jumpQueued = false;

  player.verticalVelocity -= 36 * delta;
  player.elevation += player.verticalVelocity * delta;
  if (player.elevation <= 0) {
    player.elevation = 0;
    player.verticalVelocity = 0;
    player.onGround = true;
  }

  tryMoveCircle(
    player.position,
    player.velocity.x * delta,
    player.velocity.z * delta,
    player.radius,
  );
}

function updateCombat() {
  if (!state.mouseDown || !state.pointerLocked || !state.started) {
    return;
  }

  if (currentVehicle) {
    return;
  }

  if (player.activeSlot === 0 && player.attackCooldown <= 0) {
    performPunch();
  }

  if (player.activeSlot === 1 && player.shootCooldown <= 0) {
    performShot();
  }
}

function performPunch() {
  player.attackCooldown = 0.45;
  player.punchTimer = 0.24;
  const forward = getForwardVector(player.yaw, tempVectors.a);
  let bestTarget = null;
  let bestDistance = 999;

  for (const pedestrian of pedestrians) {
    if (!pedestrian.isDamageable()) {
      continue;
    }
    const toTarget = tempVectors.b.set(
      pedestrian.group.position.x - player.position.x,
      0,
      pedestrian.group.position.z - player.position.z,
    );
    const distance = toTarget.length();
    if (distance > 7.2) {
      continue;
    }
    toTarget.normalize();
    const dot = forward.dot(toTarget);
    if (dot > 0.45 && distance < bestDistance) {
      bestTarget = pedestrian;
      bestDistance = distance;
    }
  }

  for (const vehicle of vehicles) {
    if (!vehicle.isDamageable()) {
      continue;
    }
    const distance = distance2D(
      player.position.x,
      player.position.z,
      vehicle.group.position.x,
      vehicle.group.position.z,
    );
    if (distance > 7.8 || distance > bestDistance) {
      continue;
    }
    const toVehicle = tempVectors.c.set(
      vehicle.group.position.x - player.position.x,
      0,
      vehicle.group.position.z - player.position.z,
    ).normalize();
    if (forward.dot(toVehicle) > 0.38) {
      bestTarget = vehicle;
      bestDistance = distance;
    }
  }

  if (bestTarget) {
    if (bestTarget.kind === "pedestrian") {
      bestTarget.takeDamage(34, player.position, 5);
      showToast("Golpe conectado.", 0.8);
    } else {
      bestTarget.takeDamage(22);
      showToast("Carro atingido no soco.", 0.8);
    }
  }
}

function performShot() {
  player.shootCooldown = 0.17;
  player.attackCooldown = 0.08;
  player.punchTimer = 0.1;

  const aimData = getAimData();
  const shotOrigin = getShotOrigin();
  const shotDirection = aimData.point
    .clone()
    .sub(shotOrigin)
    .normalize();

  raycaster.set(shotOrigin, shotDirection);
  raycaster.far = 160;
  const intersections = raycaster.intersectObjects(targetMeshes, false);
  let hitEntity = null;
  let hitPoint = null;

  for (const intersection of intersections) {
    const entity = intersection.object.userData.entity;
    if (!entity || !entity.isDamageable || !entity.isDamageable()) {
      continue;
    }
    if (intersection.distance < 0.35) {
      continue;
    }
    hitEntity = entity;
    hitPoint = intersection.point.clone();
    break;
  }

  const tracerEnd = hitPoint ?? shotOrigin.clone().addScaledVector(shotDirection, 160);
  createTracer(shotOrigin, tracerEnd);

  if (hitEntity) {
    if (hitEntity.kind === "pedestrian") {
      hitEntity.takeDamage(42, player.position, 6);
    } else {
      hitEntity.takeDamage(16);
    }
  }
}

function updateMission(delta) {
  if (!world.missionMarker) {
    return;
  }

  world.missionMarker.rotation.y += delta * 0.5;
  world.missionBeam.scale.x = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.04;
  world.missionBeam.scale.z = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.04;

  const actorPosition = currentVehicle ? currentVehicle.group.position : player.position;
  const distance = distance2D(
    actorPosition.x,
    actorPosition.z,
    world.missionMarker.position.x,
    world.missionMarker.position.z,
  );

  if (currentVehicle && distance < 10) {
    player.money += 280;
    showToast("Entrega feita. +$280", 2);
    relocateMissionMarker();
  }
}

function updatePickups(delta) {
  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    const pickup = pickups[index];
    pickup.time += delta;
    pickup.mesh.position.y = 1.6 + Math.sin(pickup.time * 3.5) * 0.35;
    pickup.mesh.rotation.y += delta * 1.9;

    const actorPosition = currentVehicle ? currentVehicle.group.position : player.position;
    const distance = distance2D(
      actorPosition.x,
      actorPosition.z,
      pickup.mesh.position.x,
      pickup.mesh.position.z,
    );

    if (distance < 5.4) {
      player.money += pickup.amount;
      showToast(`Dinheiro coletado: ${formatMoney(pickup.amount)}`, 1.4);
      scene.remove(pickup.mesh);
      pickups.splice(index, 1);
    }
  }
}

function updateTransientEffects(delta) {
  for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
    const effect = transientEffects[index];
    effect.life -= delta;
    effect.material.opacity = Math.max(0, effect.life * 12);
    if (effect.life <= 0) {
      scene.remove(effect.object);
      effect.object.geometry.dispose();
      effect.material.dispose();
      transientEffects.splice(index, 1);
    }
  }
}

function updatePlayerRig() {
  const movingSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const shouldHide = player.cameraMode === "first" || currentVehicle;
  world.playerRig.visible = !shouldHide;

  world.playerRig.position.set(player.position.x, player.elevation, player.position.z);
  world.playerRig.rotation.y = player.yaw;

  const cycle =
    clock.elapsedTime *
    (player.isRunning ? 10 : 6) *
    clamp(movingSpeed / 12, 0.25, 1.5);
  const swing = Math.sin(cycle) * 0.7 * clamp(movingSpeed / 15, 0, 1);
  world.playerParts.legLeft.rotation.x = swing;
  world.playerParts.legRight.rotation.x = -swing;
  world.playerParts.armLeft.rotation.x = -swing * 0.75;
  world.playerParts.armRight.rotation.x = swing * 0.75;

  if (player.activeSlot === 1) {
    world.playerParts.pistol.visible = true;
    world.playerParts.armRight.rotation.x = -0.9 + player.punchTimer * 1.3;
    world.playerParts.armRight.rotation.z = -0.18;
  } else {
    world.playerParts.pistol.visible = false;
    world.playerParts.armRight.rotation.z = 0;
    if (player.punchTimer > 0) {
      world.playerParts.armRight.rotation.x = -1.4 + player.punchTimer * 4;
    }
  }

  if (currentVehicle) {
    player.position.copy(currentVehicle.group.position);
    player.yaw = currentVehicle.yaw;
  }
}

function updatePrompt(delta) {
  if (!state.started) {
    dom.promptBox.classList.add("hidden");
    return;
  }

  state.hoveredCar = getNearbyVehicle();
  state.hoveredPedestrian = getNearbyPedestrian();

  if (state.toastTimer > 0) {
    state.toastTimer = Math.max(0, state.toastTimer - delta);
    dom.promptBox.textContent = state.toastText;
    dom.promptBox.classList.remove("hidden");
    return;
  }

  let prompt = "";
  if (currentVehicle) {
    prompt =
      Math.abs(currentVehicle.speed) < 2.2
        ? "E para sair do carro"
        : "Reduza a velocidade para sair do carro";
  } else if (state.hoveredCar && state.hoveredPedestrian) {
    prompt = "E para roubar o carro | R para assaltar o civil";
  } else if (state.hoveredCar) {
    prompt = "E para entrar ou roubar o carro";
  } else if (state.hoveredPedestrian) {
    prompt = "R para assaltar o civil";
  }

  if (prompt) {
    dom.promptBox.textContent = prompt;
    dom.promptBox.classList.remove("hidden");
  } else {
    dom.promptBox.classList.add("hidden");
  }
}

function updateHUD() {
  dom.moneyValue.textContent = formatMoney(player.money);
  dom.clockValue.textContent = formatClock(state.timeOfDay);
  dom.cameraValue.textContent =
    player.cameraMode === "first" ? "1a pessoa" : "3a pessoa";
  dom.healthText.textContent = `${Math.round(player.health)}%`;
  dom.staminaText.textContent = `${Math.round(player.stamina)}%`;
  dom.healthFill.style.width = `${player.health}%`;
  dom.staminaFill.style.width = `${player.stamina}%`;
  dom.ammoText.textContent = "Municao infinita";

  if (currentVehicle) {
    dom.objectiveText.textContent =
      "Dirija ate o marcador laranja para entregar o carro e ganhar mais dinheiro. E so funciona quando voce estiver em um veiculo.";
  } else if (state.hoveredCar) {
    dom.objectiveText.textContent =
      "Roube o carro com E, ande pela cidade e use M para abrir o mapa da cidade.";
  } else {
    dom.objectiveText.textContent =
      "Explore a cidade, assalte civis com R, derrote alvos com soco ou pistola e pegue um carro para fazer entregas.";
  }
}

function updateInventoryUI() {
  for (const slot of dom.inventorySlots) {
    const isActive = Number(slot.dataset.slot) === player.activeSlot;
    slot.classList.toggle("active", isActive);
  }
}

function updateCamera() {
  const actorPosition = currentVehicle ? currentVehicle.group.position : player.position;
  const actorYaw = currentVehicle ? currentVehicle.yaw : player.yaw;
  const cameraTargetHeight = currentVehicle ? 3.4 : CONFIG.PLAYER_EYE_HEIGHT;

  if (player.cameraMode === "first") {
    camera.position.set(
      actorPosition.x,
      (currentVehicle ? 3.1 : CONFIG.PLAYER_EYE_HEIGHT) + player.elevation,
      actorPosition.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = actorYaw;
    camera.rotation.x = player.pitch;
  } else {
    const forward = getForwardVector(actorYaw, tempVectors.a);
    const right = getRightVector(actorYaw, tempVectors.b);
    const desiredDistance = currentVehicle ? 15.5 : 10.8;
    const adjustedDistance = getSafeCameraDistance(actorPosition, forward, desiredDistance);
    const sideOffset = currentVehicle ? 0 : 3.25;
    const lookDistance = currentVehicle ? 24 : 30;
    camera.position.copy(actorPosition);
    camera.position.y +=
      cameraTargetHeight +
      (currentVehicle ? 4.1 : 3.45) +
      Math.sin(player.pitch) * 1.5 +
      (currentVehicle ? 0 : player.elevation);
    camera.position.addScaledVector(forward, -adjustedDistance);
    camera.position.addScaledVector(right, sideOffset);
    const lookTarget = actorPosition.clone();
    lookTarget.y +=
      cameraTargetHeight +
      (currentVehicle ? 0.7 : 0.45) +
      (currentVehicle ? 0 : player.elevation);
    lookTarget.addScaledVector(forward, Math.cos(player.pitch) * lookDistance);
    lookTarget.addScaledVector(right, currentVehicle ? 0 : 1.35);
    lookTarget.y += Math.sin(player.pitch) * lookDistance * 0.68;
    camera.lookAt(lookTarget);
  }

  updateHeadlights();
}

function updateHeadlights() {
  const shouldLight = currentVehicle && state.dayFactor < 0.65 && !currentVehicle.destroyed;
  for (let index = 0; index < world.headlightRig.length; index += 1) {
    const light = world.headlightRig[index];
    const target = world.headlightTargets[index];
    if (!shouldLight) {
      light.intensity = 0;
      continue;
    }

    const right = getRightVector(currentVehicle.yaw, tempVectors.b);
    const forward = getForwardVector(currentVehicle.yaw, tempVectors.c);
    const side = index === 0 ? -1.15 : 1.15;

    light.intensity = 2.3;
    light.position.copy(currentVehicle.group.position);
    light.position.y += 1.7;
    light.position.addScaledVector(right, side);
    light.position.addScaledVector(forward, 3.8);
    target.position.copy(light.position).addScaledVector(forward, 18);
  }
}

function getSafeCameraDistance(origin, forward, desiredDistance) {
  let allowed = desiredDistance;
  for (let step = 2; step < desiredDistance; step += 1.2) {
    const sampleX = origin.x - forward.x * step;
    const sampleZ = origin.z - forward.z * step;
    if (isStaticBlocked(sampleX, sampleZ, 1.5)) {
      allowed = Math.max(4, step - 1.4);
      break;
    }
  }
  return allowed;
}

function drawMap() {
  const ctx = mapContext;
  const size = dom.mapCanvas.width;
  const padding = 56;
  const worldSpan = CONFIG.CITY_HALF * 2 + 30;
  const scale = (size - padding * 2) / worldSpan;

  ctx.clearRect(0, 0, size, size);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "#172431");
  gradient.addColorStop(1, "#091018");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(148, 173, 198, 0.12)";
  ctx.lineWidth = 1;
  for (let line = padding; line <= size - padding; line += 52) {
    ctx.beginPath();
    ctx.moveTo(padding, line);
    ctx.lineTo(size - padding, line);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(line, padding);
    ctx.lineTo(line, size - padding);
    ctx.stroke();
  }

  ctx.fillStyle = "#1d242d";
  for (const x of world.roadCenters) {
    const mapX = size / 2 + x * scale;
    ctx.fillRect(
      mapX - (CONFIG.ROAD_WIDTH * scale) / 2,
      padding,
      CONFIG.ROAD_WIDTH * scale,
      size - padding * 2,
    );
  }

  for (const z of world.roadCenters) {
    const mapY = size / 2 + z * scale;
    ctx.fillRect(
      padding,
      mapY - (CONFIG.ROAD_WIDTH * scale) / 2,
      size - padding * 2,
      CONFIG.ROAD_WIDTH * scale,
    );
  }

  ctx.fillStyle = "rgba(184, 195, 208, 0.82)";
  for (const building of buildingFootprints) {
    const width = (building.maxX - building.minX) * scale;
    const height = (building.maxZ - building.minZ) * scale;
    const x = size / 2 + building.minX * scale;
    const y = size / 2 + building.minZ * scale;
    ctx.fillRect(x, y, width, height);
  }

  if (world.missionMarker) {
    const mission = worldToMap(world.missionMarker.position.x, world.missionMarker.position.z, size, scale);
    ctx.strokeStyle = "#ffd05c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mission.x, mission.y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const vehicle of vehicles) {
    if (!vehicle.group.visible) {
      continue;
    }
    const point = worldToMap(vehicle.group.position.x, vehicle.group.position.z, size, scale);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(-vehicle.yaw);
    ctx.fillStyle = vehicle.playerControlled ? "#fff2cf" : "#ff9c31";
    ctx.fillRect(-5.5, -3, 11, 6);
    ctx.restore();
  }

  ctx.fillStyle = "#67f4d4";
  for (const pedestrian of pedestrians) {
    if (!pedestrian.isDamageable()) {
      continue;
    }
    const point = worldToMap(pedestrian.group.position.x, pedestrian.group.position.z, size, scale);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const actor = currentVehicle ? currentVehicle.group.position : player.position;
  const actorYaw = currentVehicle ? currentVehicle.yaw : player.yaw;
  const playerPoint = worldToMap(actor.x, actor.z, size, scale);
  ctx.save();
  ctx.translate(playerPoint.x, playerPoint.y);
  ctx.rotate(-actorYaw);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function worldToMap(x, z, size, scale) {
  return {
    x: size / 2 + x * scale,
    y: size / 2 + z * scale,
  };
}

function relocateMissionMarker(initial = false) {
  if (!missionLocations.length) {
    return;
  }
  world.missionIndex = (world.missionIndex + 3) % missionLocations.length;
  const next = missionLocations[world.missionIndex];
  world.missionMarker.position.set(next.x, 0, next.z);
  if (!initial) {
    drawMap();
  }
}

function getNearbyVehicle() {
  if (currentVehicle) {
    return null;
  }
  let nearest = null;
  let bestDistance = 999;

  for (const vehicle of vehicles) {
    if (vehicle.destroyed) {
      continue;
    }
    const distance = distance2D(
      player.position.x,
      player.position.z,
      vehicle.group.position.x,
      vehicle.group.position.z,
    );
    if (distance < 8 && distance < bestDistance) {
      nearest = vehicle;
      bestDistance = distance;
    }
  }

  return nearest;
}

function getNearbyPedestrian() {
  if (currentVehicle) {
    return null;
  }
  let nearest = null;
  let bestDistance = 999;
  for (const pedestrian of pedestrians) {
    if (!pedestrian.isDamageable() || pedestrian.robberyTimer > 0) {
      continue;
    }
    const distance = distance2D(
      player.position.x,
      player.position.z,
      pedestrian.group.position.x,
      pedestrian.group.position.z,
    );
    if (distance < 7 && distance < bestDistance) {
      nearest = pedestrian;
      bestDistance = distance;
    }
  }
  return nearest;
}

function enterVehicle(vehicle) {
  if (!vehicle.hijack()) {
    return;
  }
  player.velocity.set(0, 0, 0);
  player.elevation = 0;
  player.verticalVelocity = 0;
  showToast("Carro roubado. Agora e seu.", 1.8);
}

function exitVehicle(forced = false) {
  if (!currentVehicle) {
    return;
  }

  if (!forced && Math.abs(currentVehicle.speed) >= 2.2) {
    showToast("Desacelere para sair.", 1.2);
    return;
  }

  const right = getRightVector(currentVehicle.yaw, tempVectors.a);
  const forward = getForwardVector(currentVehicle.yaw, tempVectors.b);
  const candidateA = currentVehicle.group.position.clone().addScaledVector(right, 6.5);
  const candidateB = currentVehicle.group.position.clone().addScaledVector(right, -6.5);
  const candidateC = currentVehicle.group.position.clone().addScaledVector(forward, -8);
  let exitPosition = candidateA;

  if (isBlocked(candidateA.x, candidateA.z, player.radius, currentVehicle)) {
    exitPosition = candidateB;
  }
  if (isBlocked(exitPosition.x, exitPosition.z, player.radius, currentVehicle)) {
    exitPosition = candidateC;
  }

  player.position.copy(exitPosition);
  player.yaw = currentVehicle.yaw;
  currentVehicle.playerControlled = false;
  currentVehicle.parked = true;
  currentVehicle.speed *= 0.2;
  currentVehicle = null;
  showToast("Voce saiu do carro.", 1.2);
}

function damagePlayer(amount, sourcePosition) {
  if (player.invulnerability > 0) {
    return;
  }
  player.health = Math.max(0, player.health - amount);
  player.invulnerability = 1.1;
  if (sourcePosition) {
    const away = tempVectors.a
      .set(player.position.x - sourcePosition.x, 0, player.position.z - sourcePosition.z)
      .normalize()
      .multiplyScalar(7);
    player.velocity.add(away);
  }
  if (player.health <= 0) {
    respawnPlayer();
  }
}

function respawnPlayer() {
  if (currentVehicle) {
    exitVehicle(true);
  }
  player.health = 100;
  player.stamina = 100;
  player.velocity.set(0, 0, 0);
  player.elevation = 0;
  player.verticalVelocity = 0;
  player.money = Math.max(0, player.money - 150);
  setSpawnPoint();
  showToast("Voce foi derrotado e voltou ao centro da cidade. -$150", 2.4);
}

function spawnCashPickup(position, amount) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.4, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffd36c,
      emissive: 0xffb347,
      emissiveIntensity: 0.36,
      roughness: 0.35,
      metalness: 0.48,
    }),
  );
  core.rotation.x = Math.PI / 2;
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.12, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffc14a,
      transparent: true,
      opacity: 0.72,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  group.position.copy(position);
  group.position.y = 1.6;
  scene.add(group);
  pickups.push({ mesh: group, amount, time: Math.random() * 3 });
}

function createTracer(start, end) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color: 0xffd19c,
    transparent: true,
    opacity: 0.95,
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  transientEffects.push({ object: line, material, life: 0.08 });
}

function startGame() {
  if (state.booting) {
    return;
  }

  if (!state.booted) {
    state.booting = true;
    dom.startButton.disabled = true;
    dom.startButton.textContent = "Carregando...";
    setStartHint("Montando a cidade, NPCs e carros...");

    try {
      init();
      state.booted = true;
    } catch (error) {
      console.error(error);
      state.booting = false;
      dom.startButton.disabled = false;
      dom.startButton.textContent = "Tentar novamente";
      setStartHint("Falha ao iniciar o jogo. Recarregue a pagina e abra pelo Chrome ou por HTTP.");
      return;
    }

    state.booting = false;
    dom.startButton.disabled = false;
    dom.startButton.textContent = "Clique para Jogar";
  }

  state.started = true;
  dom.startOverlay.classList.add("hidden");
  try {
    renderer.domElement.requestPointerLock();
  } catch (error) {
    console.warn("Pointer lock nao disponivel:", error);
  }
  showToast("Cidade carregada. Clique esquerdo para atacar.", 2.2);
}

function setStartHint(text) {
  if (dom.startHint) {
    dom.startHint.textContent = text;
  }
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function handlePointerLockChange() {
  state.pointerLocked = document.pointerLockElement === renderer.domElement;
}

function handleMouseMove(event) {
  if (!state.pointerLocked || state.mapOpen) {
    return;
  }
  player.yaw += event.movementX * 0.0025;
  player.pitch -= event.movementY * 0.0017;
  player.pitch = clamp(player.pitch, -1.15, 0.95);
}

function handleMouseDown(event) {
  if (event.button === 0) {
    state.mouseDown = true;
  }
}

function handleMouseUp(event) {
  if (event.button === 0) {
    state.mouseDown = false;
  }
}

function handleKeyDown(event) {
  state.keys[event.code] = true;

  if (event.code === "Space") {
    event.preventDefault();
    state.jumpQueued = true;
  }

  if (event.repeat) {
    return;
  }

  if (event.code === "Digit1") {
    player.activeSlot = 0;
    updateInventoryUI();
  }

  if (event.code === "Digit2") {
    player.activeSlot = 1;
    updateInventoryUI();
  }

  if (event.code === "KeyV") {
    player.cameraMode = player.cameraMode === "first" ? "third" : "first";
  }

  if (event.code === "KeyM") {
    toggleMap();
  }

  if (event.code === "KeyE") {
    if (currentVehicle) {
      exitVehicle();
    } else if (state.hoveredCar) {
      enterVehicle(state.hoveredCar);
    }
  }

  if (event.code === "KeyR" && state.hoveredPedestrian && !currentVehicle) {
    const reward = state.hoveredPedestrian.rob();
    if (reward > 0) {
      player.money += reward;
      showToast(`Assalto rapido: +${formatMoney(reward)}`, 1.5);
    }
  }
}

function handleKeyUp(event) {
  state.keys[event.code] = false;
}

function resetInputState() {
  state.mouseDown = false;
  state.keys = {};
}

function toggleMap() {
  if (!state.started) {
    return;
  }

  state.mapOpen = !state.mapOpen;
  dom.mapOverlay.classList.toggle("hidden", !state.mapOpen);
  if (state.mapOpen && state.pointerLocked) {
    document.exitPointerLock();
  }
  drawMap();
}

function showToast(text, duration = 1.4) {
  state.toastText = text;
  state.toastTimer = duration;
}

function createBox(width, height, depth, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

function createCylinder(radiusTop, radiusBottom, height, radialSegments, color, material = null) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material ??
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.1,
      }),
  );
}

function addObstacle(x, z, width, depth, type) {
  const rect = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    type,
  };
  obstacles.push(rect);
  if (type !== "plaza") {
    buildingFootprints.push(rect);
  }
}

function registerTargetMesh(mesh, entity) {
  mesh.userData.entity = entity;
  targetMeshes.push(mesh);
}

function isKeyPressed(code) {
  return Boolean(state.keys[code]);
}

function isBlocked(x, z, radius, ignoreVehicle = null) {
  return (
    isStaticBlocked(x, z, radius) ||
    vehicles.some((vehicle) => {
      if (vehicle === ignoreVehicle || vehicle.destroyed) {
        return false;
      }
      return (
        distance2D(x, z, vehicle.group.position.x, vehicle.group.position.z) <
        radius + vehicle.collisionRadius - 0.35
      );
    })
  );
}

function isStaticBlocked(x, z, radius) {
  if (
    Math.abs(x) > CONFIG.CITY_HALF - 6 ||
    Math.abs(z) > CONFIG.CITY_HALF - 6
  ) {
    return true;
  }

  return obstacles.some((rect) => circleIntersectsRect(x, z, radius, rect));
}

function tryMoveCircle(position, deltaX, deltaZ, radius, ignoreVehicle = null) {
  let moved = false;
  const nextX = position.x + deltaX;
  if (!isBlocked(nextX, position.z, radius, ignoreVehicle)) {
    position.x = nextX;
    moved = true;
  }
  const nextZ = position.z + deltaZ;
  if (!isBlocked(position.x, nextZ, radius, ignoreVehicle)) {
    position.z = nextZ;
    moved = true;
  }
  return moved;
}

function circleIntersectsRect(x, z, radius, rect) {
  const nearestX = clamp(x, rect.minX, rect.maxX);
  const nearestZ = clamp(z, rect.minZ, rect.maxZ);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function getForwardVector(yaw, target = new THREE.Vector3()) {
  return target.set(Math.sin(yaw), 0, Math.cos(yaw));
}

function getRightVector(yaw, target = new THREE.Vector3()) {
  return target.set(Math.cos(yaw), 0, -Math.sin(yaw));
}

function getMovementBasis(forwardTarget = new THREE.Vector3(), rightTarget = new THREE.Vector3()) {
  if (player.cameraMode === "third" && !currentVehicle) {
    camera.getWorldDirection(forwardTarget);
    forwardTarget.y = 0;
    if (forwardTarget.lengthSq() < 0.0001) {
      getForwardVector(player.yaw, forwardTarget);
    } else {
      forwardTarget.normalize();
    }
  } else {
    getForwardVector(currentVehicle ? currentVehicle.yaw : player.yaw, forwardTarget);
  }

  rightTarget.crossVectors(forwardTarget, WORLD_UP).normalize();
  return { forward: forwardTarget, right: rightTarget };
}

function getAimData() {
  raycaster.setFromCamera(aimPoint, camera);
  raycaster.far = 200;
  const intersections = raycaster.intersectObjects(targetMeshes, false);
  let point = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 180);

  for (const intersection of intersections) {
    const entity = intersection.object.userData.entity;
    if (!entity || !entity.isDamageable || !entity.isDamageable()) {
      continue;
    }
    point = intersection.point.clone();
    break;
  }

  return {
    origin: raycaster.ray.origin.clone(),
    direction: raycaster.ray.direction.clone(),
    point,
  };
}

function getShotOrigin() {
  const forward = tempVectors.d;
  const right = tempVectors.c;

  if (player.cameraMode === "first") {
    camera.getWorldDirection(forward).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    return new THREE.Vector3(
      camera.position.x,
      camera.position.y - 0.18,
      camera.position.z,
    )
      .addScaledVector(forward, 0.7)
      .addScaledVector(right, 0.16);
  }

  getForwardVector(player.yaw, forward);
  getRightVector(player.yaw, right);
  return new THREE.Vector3(
    player.position.x,
    player.elevation + 4.05,
    player.position.z,
  )
    .addScaledVector(forward, 1.3)
    .addScaledVector(right, 0.9);
}

function getYawBetween(start, end) {
  return Math.atan2(end.x - start.x, end.z - start.z);
}

function damp(current, target, smoothing, delta) {
  return THREE.MathUtils.damp(current, target, smoothing, delta);
}

function dampAngle(current, target, smoothing, delta) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-smoothing * delta));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function distance2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function formatMoney(value) {
  return `$${Math.round(value).toLocaleString("pt-BR")}`;
}

function formatClock(timeOfDay) {
  const totalMinutes = Math.floor(timeOfDay * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function randomRange(rng, min, max) {
  return min + (max - min) * rng();
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function createRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
