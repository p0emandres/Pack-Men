import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BuildingTracker } from './buildingTracker.js';
import type { PlayerIdentity } from './types/identity';
import { identityStore } from './game/identityStore';
import { CityScene } from './scenes/city/CityScene.js';
import { growSlotIndicatorManagerA, growSlotIndicatorManagerB } from './game/growSlotIndicators';
// WebRTC message format types available in ./types/webrtc.ts
// All WebRTC messages MUST include peerToken and privyUserId for security

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a); // Dark night sky background

// Main map group - contains all outdoor map objects
const mainMapGroup = new THREE.Group();
mainMapGroup.name = 'MainMap';
mainMapGroup.visible = true;
scene.add(mainMapGroup);

// Camera follow settings
const fixedCameraDistance = 20; // Fixed distance from character

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
// Initial camera position - at fixed distance, user can rotate freely
camera.position.set(0, 10, fixedCameraDistance);
camera.lookAt(0, 0, 0);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    logarithmicDepthBuffer: true // Helps with rendering at distance
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Canvas container will be set in initScene function
let canvasContainer: HTMLElement | null = null;

// CSS2DRenderer for text labels
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
// Label renderer will be appended in initScene function

// Update label renderer on window resize
window.addEventListener('resize', () => {
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// Camera follow settings
const cameraFollowSpeed = 3; // How fast camera target follows character (lower = smoother, less disruptive)

// Camera mode state
let cameraFreeMode = false; // false = following character, true = free camera

// Lock camera distance to prevent zooming (when following character)
controls.minDistance = fixedCameraDistance;
controls.maxDistance = fixedCameraDistance;
controls.enableZoom = false; // Disable zoom to maintain fixed distance

// Lighting - Night setting
const ambientLight = new THREE.AmbientLight(0x404080, 0.2); // Dim blue ambient light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xb0c0ff, 0.4); // Moonlight color and intensity
directionalLight.position.set(150, 150, 75);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 300;
directionalLight.shadow.camera.left = -160;
directionalLight.shadow.camera.right = 160;
directionalLight.shadow.camera.top = 160;
directionalLight.shadow.camera.bottom = -160;
scene.add(directionalLight);

// Create ground tiles using base.gltf
const groundSize = 300;
const tileSpacing = 2; // Space between tile centers
const tilesPerSide = Math.ceil(groundSize / tileSpacing);
const halfMapSize = (tilesPerSide * tileSpacing) / 2;

// Store base tile model for cloning
let baseTileModel: THREE.Group | null = null;
const groundTiles: THREE.Group[] = [];

// Store loaded plant models
const plantModels: THREE.Group[] = [];
const plantModelPaths = [
    '/plants/plant_bush.glb',
    '/plants/plant_bushDetailed.glb',
    '/plants/rock_smallC.glb',
    '/plants/tree_cone_dark.glb',
    '/plants/tree_detailed_dark.glb',
    '/plants/tree_fat_darkh.glb',
    '/plants/tree_thin.glb'
];

// Set to store road tile positions (for pathfinding between buildings)
const roadTiles = new Set<string>();

// Function to get building center from footprint corners
function getBuildingCenter(corners: { x: number; z: number }[]): { x: number; z: number } {
    let sumX = 0, sumZ = 0;
    for (const corner of corners) {
        sumX += corner.x;
        sumZ += corner.z;
    }
    return {
        x: sumX / corners.length,
        z: sumZ / corners.length
    };
}

// Road width configuration (number of tiles on each side of center)
const roadWidth = 1; // 1 = 3 tiles wide (1 center + 1 each side), 2 = 5 tiles wide, etc.

// Function to add a road tile (using same calculation as actual tiles)
// isHorizontal: true for horizontal roads (adds tiles in Z direction), false for vertical (adds in X direction)
function addRoadTile(x: number, z: number, tileSpacing: number, halfMapSize: number, isHorizontal: boolean = true): void {
    // Use the same calculation as actual tiles to ensure matching
    // Round to nearest tile grid position that matches the tile creation formula
    const roundToTile = (val: number, spacing: number, halfSize: number) => {
        // Reverse the tile position formula: x = (i * tileSpacing) - halfMapSize + (tileSpacing / 2)
        // So: i = (x + halfMapSize - tileSpacing/2) / tileSpacing
        const i = Math.round((val + halfSize - spacing / 2) / spacing);
        return (i * spacing) - halfSize + (spacing / 2);
    };
    
    const tileX = roundToTile(x, tileSpacing, halfMapSize);
    const tileZ = roundToTile(z, tileSpacing, halfMapSize);
    
    // Add center tile
    roadTiles.add(`${tileX.toFixed(6)},${tileZ.toFixed(6)}`);
    
    // Add tiles on both sides for wider roads
    for (let offset = 1; offset <= roadWidth; offset++) {
        if (isHorizontal) {
            // Horizontal road: add tiles above and below (in Z direction)
            const zAbove = roundToTile(z + offset * tileSpacing, tileSpacing, halfMapSize);
            const zBelow = roundToTile(z - offset * tileSpacing, tileSpacing, halfMapSize);
            roadTiles.add(`${tileX.toFixed(6)},${zAbove.toFixed(6)}`);
            roadTiles.add(`${tileX.toFixed(6)},${zBelow.toFixed(6)}`);
        } else {
            // Vertical road: add tiles left and right (in X direction)
            const xRight = roundToTile(x + offset * tileSpacing, tileSpacing, halfMapSize);
            const xLeft = roundToTile(x - offset * tileSpacing, tileSpacing, halfMapSize);
            roadTiles.add(`${xRight.toFixed(6)},${tileZ.toFixed(6)}`);
            roadTiles.add(`${xLeft.toFixed(6)},${tileZ.toFixed(6)}`);
        }
    }
}

// Function to create a path between two points using only horizontal/vertical lines (90-degree turns)
function createPath(start: { x: number; z: number }, end: { x: number; z: number }, tileSpacing: number, halfMapSize: number): void {
    // Round to nearest tile grid position that matches actual tile positions
    const roundToTile = (val: number, spacing: number, halfSize: number) => {
        const i = Math.round((val + halfSize - spacing / 2) / spacing);
        return (i * spacing) - halfSize + (spacing / 2);
    };
    
    const startX = roundToTile(start.x, tileSpacing, halfMapSize);
    const startZ = roundToTile(start.z, tileSpacing, halfMapSize);
    const endX = roundToTile(end.x, tileSpacing, halfMapSize);
    const endZ = roundToTile(end.z, tileSpacing, halfMapSize);
    
    // Choose path style: horizontal-first or vertical-first (use shorter total distance)
    const horizontalFirst = Math.abs(endX - startX) <= Math.abs(endZ - startZ);
    
    if (horizontalFirst) {
        // Create L-shaped path: first horizontal, then vertical
        const stepX = startX < endX ? tileSpacing : -tileSpacing;
        for (let x = startX; Math.abs(x - endX) >= tileSpacing / 2; x += stepX) {
            addRoadTile(x, startZ, tileSpacing, halfMapSize, true); // true = horizontal
        }
        addRoadTile(endX, startZ, tileSpacing, halfMapSize, true);
        
        // Add vertical segment
        const stepZ = startZ < endZ ? tileSpacing : -tileSpacing;
        for (let z = startZ; Math.abs(z - endZ) >= tileSpacing / 2; z += stepZ) {
            addRoadTile(endX, z, tileSpacing, halfMapSize, false); // false = vertical
        }
        addRoadTile(endX, endZ, tileSpacing, halfMapSize, false);
    } else {
        // Create L-shaped path: first vertical, then horizontal
        const stepZ = startZ < endZ ? tileSpacing : -tileSpacing;
        for (let z = startZ; Math.abs(z - endZ) >= tileSpacing / 2; z += stepZ) {
            addRoadTile(startX, z, tileSpacing, halfMapSize, false); // false = vertical
        }
        addRoadTile(startX, endZ, tileSpacing, halfMapSize, false);
        
        // Add horizontal segment
        const stepX = startX < endX ? tileSpacing : -tileSpacing;
        for (let x = startX; Math.abs(x - endX) >= tileSpacing / 2; x += stepX) {
            addRoadTile(x, endZ, tileSpacing, halfMapSize, true); // true = horizontal
        }
        addRoadTile(endX, endZ, tileSpacing, halfMapSize, true);
    }
}

// Function to build road network connecting buildings
function buildRoadNetwork(tileSpacing: number, halfMapSize: number): void {
    // Get building centers, excluding 1-story corner buildings
    const buildingCenters: { x: number; z: number; name: string }[] = [];
    for (const footprint of buildingFootprints) {
        // Skip 1-story buildings in far corners
        if (footprint.name === '1Story_GableRoof_Mat' || footprint.name === '1Story_Sign_Mat') {
            continue;
        }
        const center = getBuildingCenter(footprint.corners);
        buildingCenters.push({ ...center, name: footprint.name });
    }
    
    // Connecting buildings (log removed for cleaner output)
    
    // Create a fully connected road network using minimum spanning tree approach
    // First, calculate distances between all buildings
    const connections: Array<{ from: number; to: number; distance: number }> = [];
    for (let i = 0; i < buildingCenters.length; i++) {
        for (let j = i + 1; j < buildingCenters.length; j++) {
            const b1 = buildingCenters[i];
            const b2 = buildingCenters[j];
            const dx = b2.x - b1.x;
            const dz = b2.z - b1.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            connections.push({ from: i, to: j, distance });
        }
    }
    
    // Sort connections by distance (shortest first)
    connections.sort((a, b) => a.distance - b.distance);
    
    // Use Union-Find (Disjoint Set) to create minimum spanning tree
    const parent: number[] = [];
    const rank: number[] = [];
    for (let i = 0; i < buildingCenters.length; i++) {
        parent[i] = i;
        rank[i] = 0;
    }
    
    function find(x: number): number {
        if (parent[x] !== x) {
            parent[x] = find(parent[x]); // Path compression
        }
        return parent[x];
    }
    
    function union(x: number, y: number): boolean {
        const rootX = find(x);
        const rootY = find(y);
        if (rootX === rootY) return false;
        
        // Union by rank
        if (rank[rootX] < rank[rootY]) {
            parent[rootX] = rootY;
        } else if (rank[rootX] > rank[rootY]) {
            parent[rootY] = rootX;
        } else {
            parent[rootY] = rootX;
            rank[rootX]++;
        }
        return true;
    }
    
    // Build minimum spanning tree
    const mstConnections: Array<{ from: number; to: number }> = [];
    for (const conn of connections) {
        if (union(conn.from, conn.to)) {
            mstConnections.push({ from: conn.from, to: conn.to });
        }
    }
    
    // Create roads for all MST connections
    for (const conn of mstConnections) {
        const b1 = buildingCenters[conn.from];
        const b2 = buildingCenters[conn.to];
        createPath(b1, b2, tileSpacing, halfMapSize);
    }
    
    // Also add some additional connections for better connectivity
    // Connect buildings that are very close together (within 60 units)
    for (let i = 0; i < buildingCenters.length; i++) {
        for (let j = i + 1; j < buildingCenters.length; j++) {
            const b1 = buildingCenters[i];
            const b2 = buildingCenters[j];
            const dx = b2.x - b1.x;
            const dz = b2.z - b1.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Add direct connections for very close buildings
            if (distance < 60) {
                // Check if already connected in MST
                const alreadyConnected = mstConnections.some(c => 
                    (c.from === i && c.to === j) || (c.from === j && c.to === i)
                );
                
                if (!alreadyConnected) {
                    createPath(b1, b2, tileSpacing, halfMapSize);
                }
            }
        }
    }
    
    console.log(`Created road network with ${roadTiles.size} road tiles`);
    // Log first few road tiles for debugging
    const roadArray = Array.from(roadTiles);
    if (roadArray.length > 0) {
        console.log('Sample road tiles:', roadArray.slice(0, 5));
    }
}

// Building footprints data
const buildingFootprints = [
  {
    "name": "4Story_Center_Mat",
    "corners": [
      { "x": 17.31540012359619, "z": -35.2850824991862 },
      { "x": 36.68459987640381, "z": -35.2850824991862 },
      { "x": 36.68459987640381, "z": -15.027682940165203 },
      { "x": 17.31540012359619, "z": -15.027682940165203 }
    ]
  },
  {
    "name": "4Story_Wide_2Doors_Mat",
    "corners": [
      { "x": -40.31130409240723, "z": -35.2850824991862 },
      { "x": 14.311304092407227, "z": -35.2850824991862 },
      { "x": 14.311304092407227, "z": -13.714498202006023 },
      { "x": -40.31130409240723, "z": -13.714498202006023 }
    ]
  },
  {
    "name": "4Story_Wide_2Doors_Roof_Mat",
    "corners": [
      { "x": -27.311304092407227, "z": 13.714506785074867 },
      { "x": 27.311304092407227, "z": 13.714506785074867 },
      { "x": 27.311304092407227, "z": 35.28509108225505 },
      { "x": -27.311304092407227, "z": 35.28509108225505 }
    ]
  },
  {
    "name": "3Story_Balcony_Mat",
    "corners": [
      { "x": -8.634584426879885, "z": -71.44341564178467 },
      { "x": 8.634584426879885, "z": -71.44341564178467 },
      { "x": 8.634584426879885, "z": -51.38158416748047 },
      { "x": -8.634584426879885, "z": -51.38158416748047 }
    ]
  },
  {
    "name": "3Story_Balcony_Mat",
    "corners": [
      { "x": -8.634584426879883, "z": 51.38158416748047 },
      { "x": 8.634584426879883, "z": 51.38158416748047 },
      { "x": 8.634584426879883, "z": 71.44341564178467 },
      { "x": -8.634584426879883, "z": 71.44341564178467 }
    ]
  },
  {
    "name": "3Story_Slim_Mat",
    "corners": [
      { "x": -68.61841583251953, "z": -4.37785577774048 },
      { "x": -51.38158416748047, "z": -4.37785577774048 },
      { "x": -51.38158416748047, "z": 4.5467758178710955 },
      { "x": -68.61841583251953, "z": 4.5467758178710955 }
    ]
  },
  {
    "name": "3Story_Slim_Mat",
    "corners": [
      { "x": 51.38158416748047, "z": -4.5467758178710955 },
      { "x": 68.61841583251953, "z": -4.5467758178710955 },
      { "x": 68.61841583251953, "z": 4.37785577774048 },
      { "x": 51.38158416748047, "z": 4.37785577774048 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": 71.6797656913993, "z": -97.96971347923458 },
      { "x": 97.96971347923458, "z": -97.96971347923458 },
      { "x": 97.96971347923458, "z": -71.6797656913993 },
      { "x": 71.6797656913993, "z": -71.6797656913993 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": 71.6797656913993, "z": 71.6797656913993 },
      { "x": 97.96971347923458, "z": 71.6797656913993 },
      { "x": 97.96971347923458, "z": 97.96971347923458 },
      { "x": 71.6797656913993, "z": 97.96971347923458 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": -97.96971347923458, "z": 71.6797656913993 },
      { "x": -71.6797656913993, "z": 71.6797656913993 },
      { "x": -71.6797656913993, "z": 97.96971347923458 },
      { "x": -97.96971347923458, "z": 97.96971347923458 }
    ]
  },
  {
    "name": "2Story_Columns_Mat",
    "corners": [
      { "x": -97.96971347923458, "z": -97.96971347923458 },
      { "x": -71.6797656913993, "z": -97.96971347923458 },
      { "x": -71.6797656913993, "z": -71.6797656913993 },
      { "x": -97.96971347923458, "z": -71.6797656913993 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": -65.30168057635903, "z": -65.3878061440045 },
      { "x": -43.33206495313928, "z": -65.3878061440045 },
      { "x": -43.33206495313928, "z": -43.41819052078475 },
      { "x": -65.30168057635903, "z": -43.41819052078475 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": 43.41819052078475, "z": -65.30168057635903 },
      { "x": 65.3878061440045, "z": -65.30168057635903 },
      { "x": 65.3878061440045, "z": -43.33206495313928 },
      { "x": 43.41819052078475, "z": -43.33206495313928 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": 43.33206495313928, "z": 43.41819052078475 },
      { "x": 65.30168057635903, "z": 43.41819052078475 },
      { "x": 65.30168057635903, "z": 65.3878061440045 },
      { "x": 43.33206495313928, "z": 65.3878061440045 }
    ]
  },
  {
    "name": "3Story_Small_Mat",
    "corners": [
      { "x": -65.3878061440045, "z": 43.33206495313928 },
      { "x": -43.41819052078475, "z": 43.33206495313928 },
      { "x": -43.41819052078475, "z": 65.30168057635903 },
      { "x": -65.3878061440045, "z": 65.30168057635903 }
    ]
  },
  {
    "name": "2Story_Sidehouse_Mat",
    "corners": [
      { "x": -37.18692001342774, "z": 90.69517566680908 },
      { "x": -9.441160049438476, "z": 90.69517566680908 },
      { "x": -9.441160049438476, "z": 110.95257617950439 },
      { "x": -37.18692001342774, "z": 110.95257617950439 }
    ]
  },
  {
    "name": "2Story_Sidehouse_Mat",
    "corners": [
      { "x": -47.73883995056153, "z": -110.95257617950439 },
      { "x": -19.993079986572265, "z": -110.95257617950439 },
      { "x": -19.993079986572265, "z": -90.69517566680908 },
      { "x": -47.73883995056153, "z": -90.69517566680908 }
    ]
  },
  {
    "name": "2Story_2_Mat",
    "corners": [
      { "x": 19.955415573120113, "z": 91.9895520401001 },
      { "x": 37.224584426879886, "z": 91.9895520401001 },
      { "x": 37.224584426879886, "z": 109.38841583251953 },
      { "x": 19.955415573120113, "z": 109.38841583251953 }
    ]
  },
  {
    "name": "2Story_2_Mat",
    "corners": [
      { "x": 19.955415573120117, "z": -109.38841583251953 },
      { "x": 37.224584426879886, "z": -109.38841583251953 },
      { "x": 37.224584426879886, "z": -91.9895520401001 },
      { "x": 19.955415573120117, "z": -91.9895520401001 }
    ]
  },
  {
    "name": "2Story_Wide_2Doors_Mat",
    "corners": [
      { "x": 91.34604026794433, "z": 1.2786959075927697 },
      { "x": 109.38841583251953, "z": 1.2786959075927697 },
      { "x": 109.38841583251953, "z": 55.90130409240723 },
      { "x": 91.34604026794433, "z": 55.90130409240723 }
    ]
  },
  {
    "name": "2Story_Wide_2Doors_Mat",
    "corners": [
      { "x": -109.38841583251953, "z": -55.90130409240723 },
      { "x": -91.34604026794433, "z": -55.90130409240723 },
      { "x": -91.34604026794433, "z": -1.2786959075927697 },
      { "x": -109.38841583251953, "z": -1.2786959075927697 }
    ]
  },
  {
    "name": "2Story_Stairs_Mat",
    "corners": [
      { "x": 89.13101627349853, "z": -37.224584426879886 },
      { "x": 109.38841583251953, "z": -37.224584426879886 },
      { "x": 109.38841583251953, "z": -19.955415573120113 },
      { "x": 89.13101627349853, "z": -19.955415573120113 }
    ]
  },
  {
    "name": "2Story_Stairs_Mat",
    "corners": [
      { "x": -109.38841583251953, "z": 19.955415573120113 },
      { "x": -89.13101627349853, "z": 19.955415573120113 },
      { "x": -89.13101627349853, "z": 37.224584426879886 },
      { "x": -109.38841583251953, "z": 37.224584426879886 }
    ]
  },
  {
    "name": "1Story_GableRoof_Mat",
    "corners": [
      { "x": 125.08342972900275, "z": -150.45657027099728 },
      { "x": 150.45657027099728, "z": -150.45657027099728 },
      { "x": 150.45657027099728, "z": -125.08342972900275 },
      { "x": 125.08342972900275, "z": -125.08342972900275 }
    ]
  },
  {
    "name": "1Story_GableRoof_Mat",
    "corners": [
      { "x": -150.45657027099728, "z": 125.08342972900275 },
      { "x": -125.08342972900275, "z": 125.08342972900275 },
      { "x": -125.08342972900275, "z": 150.45657027099728 },
      { "x": -150.45657027099728, "z": 150.45657027099728 }
    ]
  },
  {
    "name": "1Story_Sign_Mat",
    "corners": [
      { "x": -149.95576927869845, "z": -149.95577467349509 },
      { "x": -125.58422532650495, "z": -149.95577467349509 },
      { "x": -125.58422532650495, "z": -125.58423072130155 },
      { "x": -149.95576927869845, "z": -125.58423072130155 }
    ]
  },
  {
    "name": "1Story_Sign_Mat",
    "corners": [
      { "x": 125.58422532650495, "z": 125.58423072130155 },
      { "x": 149.95576927869845, "z": 125.58423072130155 },
      { "x": 149.95576927869845, "z": 149.95577467349509 },
      { "x": 125.58422532650495, "z": 149.95577467349509 }
    ]
  }
];

// Function to check if a point is inside a polygon (using ray casting algorithm)
function pointInPolygon(x: number, z: number, corners: { x: number; z: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const xi = corners[i].x, zi = corners[i].z;
        const xj = corners[j].x, zj = corners[j].z;
        
        const intersect = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Function to calculate distance from point to polygon edge
function distanceToPolygon(x: number, z: number, corners: { x: number; z: number }[]): number {
    let minDist = Infinity;
    
    // Check distance to each edge
    for (let i = 0; i < corners.length; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % corners.length];
        
        // Calculate distance from point to line segment
        const A = x - p1.x;
        const B = z - p1.z;
        const C = p2.x - p1.x;
        const D = p2.z - p1.z;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, zz;
        
        if (param < 0) {
            xx = p1.x;
            zz = p1.z;
        } else if (param > 1) {
            xx = p2.x;
            zz = p2.z;
        } else {
            xx = p1.x + param * C;
            zz = p1.z + param * D;
        }
        
        const dx = x - xx;
        const dz = z - zz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}

// Function to place plants on green tiles
function placePlantsOnGreenTiles(): void {
    if (plantModels.length === 0) {
        console.log('No plant models loaded yet, skipping plant placement');
        return;
    }
    
    const greenTilePositions: { x: number; z: number }[] = [];
    const eastEdgeThreshold = halfMapSize - tileSpacing * 0.5; // At the east edge
    
    // Collect all green tile positions and east edge tiles
    for (let i = 0; i < tilesPerSide; i++) {
        for (let j = 0; j < tilesPerSide; j++) {
            const x = (i * tileSpacing) - halfMapSize + (tileSpacing / 2);
            const z = (j * tileSpacing) - halfMapSize + (tileSpacing / 2);
            
            // Include green tiles or tiles on the east edge (but not roads or buildings)
            const isGreenTile = shouldBeGreenTile(x, z);
            const isEastEdge = x >= eastEdgeThreshold;
            
            // Check if tile is on a road
            const tileKey = `${x.toFixed(6)},${z.toFixed(6)}`;
            const isRoad = roadTiles.has(tileKey);
            
            // Check if tile is inside a building footprint
            let isInsideBuilding = false;
            for (const footprint of buildingFootprints) {
                if (pointInPolygon(x, z, footprint.corners)) {
                    isInsideBuilding = true;
                    break;
                }
            }
            
            // Include if it's a green tile, or if it's on east edge and not a road/building
            if (isGreenTile || (isEastEdge && !isRoad && !isInsideBuilding)) {
                greenTilePositions.push({ x, z });
            }
        }
    }
    
    console.log(`Found ${greenTilePositions.length} green tiles for plant placement`);
    
    // Place plants on a percentage of green tiles (7.5% coverage for natural look)
    const plantDensity = 0.075;
    const tilesToPlacePlants = Math.floor(greenTilePositions.length * plantDensity);
    
    // Shuffle array to randomize placement
    const shuffled = [...greenTilePositions].sort(() => Math.random() - 0.5);
    
    let plantsPlaced = 0;
    for (let i = 0; i < Math.min(tilesToPlacePlants, shuffled.length); i++) {
        const tilePos = shuffled[i];
        
        // Randomly select a plant model
        const plantModel = plantModels[Math.floor(Math.random() * plantModels.length)];
        
        // Clone the plant model
        const plant = plantModel.clone();
        
        // Position plant on the tile with slight random offset
        const offsetX = (Math.random() - 0.5) * tileSpacing * 0.6; // 60% of tile spacing
        const offsetZ = (Math.random() - 0.5) * tileSpacing * 0.6;
        plant.position.set(tilePos.x + offsetX, 0, tilePos.z + offsetZ);
        
        // Random rotation around Y axis
        plant.rotation.y = Math.random() * Math.PI * 2;
        
        // Random scale variation (6.4 to 9.6) - 8x base scale
        const scale = (0.8 + Math.random() * 0.4) * 8;
        plant.scale.set(scale, scale, scale);
        
        // Get bounding box to position plant on ground
        const box = new THREE.Box3().setFromObject(plant);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Position plant so its bottom sits on the ground
        plant.position.y -= center.y - size.y / 2;
        
        // Enable shadows
        plant.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        mainMapGroup.add(plant);
        plantsPlaced++;
    }
    
    console.log(`Placed ${plantsPlaced} plants on green tiles`);
}

// Function to check if a tile should be green (park area) or grey (building/street area)
function shouldBeGreenTile(x: number, z: number): boolean {
    const buildingBuffer = 3; // Buffer zone around buildings (in units) - keeps streets grey
    
    // Check if tile is on a road (use same precision as road tiles)
    const tileKey = `${x.toFixed(6)},${z.toFixed(6)}`;
    if (roadTiles.has(tileKey)) {
        return false; // On road - grey
    }
    
    // Check each building footprint
    for (const footprint of buildingFootprints) {
        // Skip 1Story_GableRoof_Mat and 1Story_Sign_Mat - tiles under them should be green
        if (footprint.name === '1Story_GableRoof_Mat' || footprint.name === '1Story_Sign_Mat') {
            continue; // Skip these buildings - allow green tiles beneath them
        }
        
        // Check if tile is inside building footprint
        if (pointInPolygon(x, z, footprint.corners)) {
            return false; // Inside building - grey
        }
        
        // Check if tile is within buffer zone of building
        const distToBuilding = distanceToPolygon(x, z, footprint.corners);
        if (distToBuilding <= buildingBuffer) {
            return false; // Near building - grey (street/sidewalk)
        }
    }
    
    // Far from all buildings and not on a road - green park area
    return true;
}

// Grid helper removed to prevent z-fighting with tiles
// If needed for debugging, uncomment and move it higher:
// const gridHelper = new THREE.GridHelper(groundSize, groundSize, 0x888888, 0xcccccc);
// gridHelper.position.y = 0.5; // Higher to avoid z-fighting
// scene.add(gridHelper);

// Building tracker to track positions and areas
const buildingTracker = new BuildingTracker();

// Helper function to register and track a building
function registerBuilding(
    building: THREE.Group,
    name: string,
    rotation: number,
    scale: number = 8
): void {
    // Get bounding box to position building on ground
    const box = new THREE.Box3().setFromObject(building);
    
    // Register building with final position (after all adjustments)
    buildingTracker.registerBuilding(name, building.position.clone(), rotation, scale, box);
    
    // Calculate footprint after registration
    const buildingInfo = buildingTracker.getBuildingsByName(name).find(b => 
        Math.abs(b.position.x - building.position.x) < 0.01 &&
        Math.abs(b.position.z - building.position.z) < 0.01 &&
        Math.abs(b.rotation - rotation) < 0.01
    );
    if (buildingInfo) {
        buildingTracker.calculateFootprint(building, buildingInfo);
    }
}

// Load Casual Hoodie character
const loader = new GLTFLoader();

// Load all plant models
let plantsLoaded = 0;
const totalPlants = plantModelPaths.length;

plantModelPaths.forEach((path) => {
    loader.load(
        path,
        (gltf) => {
            const plantModel = gltf.scene;
            plantModels.push(plantModel);
            plantsLoaded++;
            
            if (plantsLoaded === totalPlants) {
                console.log(`Loaded ${totalPlants} plant models`);
                // If tiles are already created, place plants
                if (groundTiles.length > 0) {
                    placePlantsOnGreenTiles();
                }
            }
        },
        (progress) => {
            if (progress.total > 0) {
                console.log(`Loading ${path}: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
            }
        },
        (error) => {
            console.error(`Error loading ${path}:`, error);
            plantsLoaded++;
            // Continue even if some plants fail to load
            if (plantsLoaded === totalPlants && groundTiles.length > 0) {
                placePlantsOnGreenTiles();
            }
        }
    );
});

// Load base.gltf and create tile grid
loader.load(
    '/buildings/base.gltf',
    (gltf) => {
        baseTileModel = gltf.scene;
        
        // Create default grey material with proper rendering settings
        const defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080, // Grey
            roughness: 0.8,
            metalness: 0.2,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide // Render both sides to prevent gaps
        });
        
        // Create green grass material for diagonal spaces
        const grassMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0ffc0, // Lighter green
            roughness: 0.8,
            metalness: 0.2,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide // Render both sides to prevent gaps
        });
        
        // Check the bounding box to understand model orientation
        const box = new THREE.Box3().setFromObject(baseTileModel);
        const size = box.getSize(new THREE.Vector3());
        console.log('Base tile bounding box size:', size);
        console.log('Base tile bounding box min:', box.min);
        console.log('Base tile bounding box max:', box.max);
        
        // Build road network connecting buildings before creating tiles
        buildRoadNetwork(tileSpacing, halfMapSize);
        
        // Create grid of tiles
        for (let i = 0; i < tilesPerSide; i++) {
            for (let j = 0; j < tilesPerSide; j++) {
                // Calculate tile position
                const x = (i * tileSpacing) - halfMapSize + (tileSpacing / 2);
                const z = (j * tileSpacing) - halfMapSize + (tileSpacing / 2);
                
                // Clone the base tile
                const tile = baseTileModel.clone();
                // Position tile with slight Y offset to prevent z-fighting
                tile.position.set(x, 0.001, z);
                
                // Try different rotation - if model is vertical along Z, rotate around Y
                // Or if vertical along X, rotate around Z
                // Let's try rotating around Y axis by 90 degrees
                tile.rotation.set(0, Math.PI / 2, 0);
                
                // Determine material based on position - green for parks, grey for buildings/streets
                const useGrass = shouldBeGreenTile(x, z);
                const material = useGrass ? grassMaterial : defaultMaterial;
                
                // Debug: log first few road tiles to verify
                if (roadTiles.size > 0 && groundTiles.length < 5) {
                    const tileKey = `${x.toFixed(6)},${z.toFixed(6)}`;
                    if (roadTiles.has(tileKey)) {
                        console.log(`Road tile found at (${x.toFixed(2)}, ${z.toFixed(2)})`);
                    }
                }
                
                // Apply material and settings to all meshes in the tile
                tile.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = material;
                        child.receiveShadow = true;
                        // Add polygon offset to prevent z-fighting
                        child.renderOrder = 0;
                        // Ensure geometry is properly positioned
                        if (child.geometry) {
                            child.geometry.computeBoundingBox();
                        }
                    }
                });
                
                groundTiles.push(tile);
                mainMapGroup.add(tile);
            }
        }
        
        console.log(`Created ${groundTiles.length} ground tiles using base.gltf`);
        
        // After tiles are created, place plants on green tiles
        placePlantsOnGreenTiles();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading base.gltf progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading base.gltf:', error);
    }
);

let farmer: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let walkAction: THREE.AnimationAction | null = null;
let runAction: THREE.AnimationAction | null = null;
let idleAction: THREE.AnimationAction | null = null;

// Character movement state
const keys: { [key: string]: boolean } = {};
const walkSpeed = 5; // units per second (normal walking speed)
const runSpeed = 10; // units per second (running speed when shift is held)
const rotationSpeed = 5; // radians per second

/**
 * Determine which character model to load based on player index in match.
 * Player 1 (index 0) uses Casual_Hoodie, Player 2 (index 1) uses Casual_2.
 * Falls back to Casual_Hoodie for demo mode or if unable to determine.
 */
async function getCharacterModelPath(): Promise<string> {
    const identity = identityStore.getIdentity();
    
    console.log(`[Character] Determining character model path. Identity available: ${!!identity}, matchId: ${identity?.matchId || 'none'}, privyUserId: ${identity?.privyUserId || 'none'}`);
    
    // Demo mode always uses Casual_Hoodie
    if (identity && identity.privyUserId.startsWith('demo-user')) {
        // Demo mode detected (log removed)
        return '/buildings/character/Casual_Hoodie.gltf';
    }
    
    // If no match ID, default to Casual_Hoodie
    if (!identity || !identity.matchId) {
        console.log('[Character] No match ID, defaulting to Casual_Hoodie');
        return '/buildings/character/Casual_Hoodie.gltf';
    }
    
    try {
        // Fetch match data to get participants array
        const apiBaseUrl = import.meta.env.VITE_API_URL || '';
        const matchUrl = apiBaseUrl ? `${apiBaseUrl}/api/match/${identity.matchId}` : `/api/match/${identity.matchId}`;
        
        console.log(`[Character] Fetching match data from: ${matchUrl}`);
        const headers: HeadersInit = {};
        if (identity.sessionJwt) {
            headers['Authorization'] = `Bearer ${identity.sessionJwt}`;
        }
        
        const response = await fetch(matchUrl, {
            headers
        });
        if (!response.ok) {
            console.warn(`[Character] Failed to fetch match data (${response.status}), defaulting to Casual_Hoodie`);
            return '/buildings/character/Casual_Hoodie.gltf';
        }
        
        const data = await response.json();
        const participants: string[] = data.participants || [];
        
        console.log(`[Character] Match participants: [${participants.map((p, i) => `Index ${i}: ${p}`).join(', ')}]`);
        console.log(`[Character] Looking for player: ${identity.privyUserId}`);
        
        // Find player index in participants array
        const playerIndex = participants.indexOf(identity.privyUserId);
        
        if (playerIndex === -1) {
            console.warn(`[Character] Player ${identity.privyUserId} not found in participants [${participants.join(', ')}], defaulting to Casual_Hoodie`);
            return '/buildings/character/Casual_Hoodie.gltf';
        }
        
        // Player 1 (index 0) = Casual_Hoodie, Player 2 (index 1) = Casual_2
        const characterPath = playerIndex === 0 
            ? '/buildings/character/Casual_Hoodie.gltf'
            : '/buildings/character/Casual_2.gltf';
        
        console.log(`[Character] Player index: ${playerIndex} (${playerIndex === 0 ? 'Player 1 - Casual_Hoodie' : 'Player 2 - Casual_2'}), loading: ${characterPath}`);
        return characterPath;
    } catch (error) {
        console.error('[Character] Error determining character model:', error);
        return '/buildings/character/Casual_Hoodie.gltf';
    }
}

// Flag to track if character has been loaded
let characterLoadAttempted = false;

/**
 * Load the character model. This should be called after identity is set.
 */
function loadCharacterModel(): void {
    // Prevent multiple load attempts
    if (characterLoadAttempted || farmer !== null) {
        return;
    }
    characterLoadAttempted = true;
    
    getCharacterModelPath().then((characterPath) => {
    loader.load(
        characterPath,
    (gltf) => {
        farmer = gltf.scene;
        
        // Position at origin
        farmer.position.set(0, 0, 0);
        
        // Enable shadows
        farmer.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Scale if needed (adjust based on model size)
        const box = new THREE.Box3().setFromObject(farmer);
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);
        
        // If the model is too large or small, scale it appropriately
        // Assuming we want the character to be roughly 1-2 units tall
        if (maxDimension > 5) {
            const scale = 2 / maxDimension;
            farmer.scale.set(scale, scale, scale);
        } else if (maxDimension < 0.5) {
            const scale = 1.5 / maxDimension;
            farmer.scale.set(scale, scale, scale);
        }
        
        // Center the model at origin
        const center = box.getCenter(new THREE.Vector3());
        farmer.position.sub(center.multiply(farmer.scale));
        
        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(farmer);
            
            // Try to find walking, running, and idle animations
            // Common animation names: 'Walk', 'walk', 'Walking', 'Run', 'run', 'Running', 'Idle', 'idle', etc.
            const animations = gltf.animations;
            
            // Find walk animation (specifically walk, not run)
            let walkAnim = animations.find(anim => {
                const name = anim.name.toLowerCase();
                return name.includes('walk') && !name.includes('run');
            });
            
            // Find run animation (specifically run)
            let runAnim = animations.find(anim => 
                anim.name.toLowerCase().includes('run')
            );
            
            // Find idle animation
            let idleAnim = animations.find(anim => {
                const name = anim.name.toLowerCase();
                return name.includes('idle') || name.includes('stand');
            });
            
            // Fallback logic: if no specific animations found, try to assign from available animations
            if (!walkAnim && !runAnim && animations.length > 0) {
                // If we have multiple animations, use first for walk, second for run
                if (animations.length > 1) {
                    walkAnim = animations[0];
                    runAnim = animations[1];
                } else {
                    walkAnim = animations[0];
                }
            } else if (!walkAnim && runAnim) {
                // If we have run but no walk, use run as walk (current behavior)
                walkAnim = runAnim;
            } else if (walkAnim && !runAnim) {
                // If we have walk but no run, use walk as run (fallback)
                runAnim = walkAnim;
            }
            
            if (!idleAnim) {
                if (animations.length > 2) {
                    idleAnim = animations[2];
                } else if (animations.length > 1 && animations[1] !== walkAnim && animations[1] !== runAnim) {
                    idleAnim = animations[1];
                } else if (animations.length > 0 && animations[0] !== walkAnim && animations[0] !== runAnim) {
                    idleAnim = animations[0];
                } else {
                    idleAnim = walkAnim || runAnim || animations[0]; // Final fallback
                }
            }
            
            if (walkAnim) {
                walkAction = mixer.clipAction(walkAnim);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
            }
            
            if (runAnim) {
                runAction = mixer.clipAction(runAnim);
                runAction.setLoop(THREE.LoopRepeat, Infinity);
            }
            
            if (idleAnim) {
                idleAction = mixer.clipAction(idleAnim);
                idleAction.setLoop(THREE.LoopRepeat, Infinity);
                idleAction.play(); // Start with idle animation
            }
            
            console.log('Animations loaded:', animations.map(a => a.name));
            console.log('Walk animation:', walkAnim?.name || 'Not found');
            console.log('Run animation:', runAnim?.name || 'Not found');
            console.log('Idle animation:', idleAnim?.name || 'Not found');
        }
        
        // Hide character initially to prevent it from appearing at origin
        farmer.visible = false;
        scene.add(farmer);
        const characterName = characterPath.includes('Casual_2') ? 'Casual_2' : 'Casual_Hoodie';
        console.log(`${characterName} character loaded successfully`);
        
        // Ensure rooms are created before trying to spawn
        createRoomsIfReady();
        
        // Try to spawn character in room if it's ready
        spawnCharacterInRoom(1);
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error(`Error loading ${characterPath}:`, error);
    }
    );
    }).catch((error) => {
        console.error('[Character] Error getting character model path:', error);
        // Fallback to Casual_Hoodie on error
        const fallbackPath = '/buildings/character/Casual_Hoodie.gltf';
        loader.load(fallbackPath, (gltf) => {
            farmer = gltf.scene;
            farmer.position.set(0, 0, 0);
            farmer.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const box = new THREE.Box3().setFromObject(farmer);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 5) {
                const scale = 2 / maxDimension;
                farmer.scale.set(scale, scale, scale);
            } else if (maxDimension < 0.5) {
                const scale = 1.5 / maxDimension;
                farmer.scale.set(scale, scale, scale);
            }
            const center = box.getCenter(new THREE.Vector3());
            farmer.position.sub(center.multiply(farmer.scale));
            farmer.visible = false;
            scene.add(farmer);
            console.log('Casual_Hoodie character loaded as fallback');
            createRoomsIfReady();
            spawnCharacterInRoom(1);
        });
    });
}

// Load 4Story_Center_Mat building
loader.load(
    '/buildings/4Story_Center_Mat/4Story_Center_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Position building - aligned with origin on x-axis
        // X: 27 (east of origin), Z: -80/3
        building.position.set(27, 0, -80/3);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by 8 units
        building.position.y -= center.y;
        building.position.y += 20.25;
        
        // Register building for tracking
        registerBuilding(building, '4Story_Center_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        // Building loaded (log removed)
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 4Story_Center_Mat.gltf:', error);
    }
);

// Load 4Story_Wide_2Doors_Mat building (to the west of 4Story_Center_Mat)
loader.load(
    '/buildings/4Story_Wide_2Doors_Mat/4Story_Wide_2Doors_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Position building to the west (negative X) of the first building
        // X: -13 (west of origin), Z: -80/3
        // Buildings are 40 units apart
        building.position.set(-13, 0, -80/3);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by 20.25 units
        building.position.y -= center.y;
        building.position.y += 20.25;
        
        // Register building for tracking
        registerBuilding(building, '4Story_Wide_2Doors_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('4Story_Wide_2Doors_Mat building loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 4Story_Wide_2Doors_Mat.gltf:', error);
    }
);

// Load 4Story_Wide_2Doors_Roof_Mat building (to the south of the other buildings)
loader.load(
    '/buildings/4Story_Wide_2Doors_Roof_Mat/4Story_Wide_2Doors_Roof_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 180 degrees around Y axis
        building.rotation.y = Math.PI;
        
        // Position building to the south (negative Z) of the other buildings
        // X: 0, Z: 50 - 50/3 = 100/3 (to center the group around origin)
        building.position.set(0, 0, 80/3);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by 20.25 units
        building.position.y -= center.y;
        building.position.y += 22.25;
        
        // Register building for tracking
        registerBuilding(building, '4Story_Wide_2Doors_Roof_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('4Story_Wide_2Doors_Roof_Mat building loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 4Story_Wide_2Doors_Roof_Mat.gltf:', error);
    }
);

// Load 3Story_Balcony_Mat building (at origin, facing south)
loader.load(
    '/buildings/3Story_Balcony_Mat/3Story_Balcony_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 180 degrees around Y axis to face south
        building.rotation.y = Math.PI;
        
        // Position building at origin
        building.position.set(0, 0, -60);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by 18.25 units
        building.position.y -= center.y;
        building.position.y += 16.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Balcony_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Balcony_Mat building loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Balcony_Mat.gltf:', error);
    }
);

// Load another 3Story_Balcony_Mat building (to the south of 4Story_Wide_2Doors_Roof_Mat)
loader.load(
    '/buildings/3Story_Balcony_Mat/3Story_Balcony_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 180 degrees around Y axis to face north
        building.rotation.y = 0;
        
        // Position building to the south of 4Story_Wide_2Doors_Roof_Mat
        // X: 0 (aligned with origin), Z: 60
        building.position.set(0, 0, 60);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by 16.25 units
        building.position.y -= center.y;
        building.position.y += 16.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Balcony_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Balcony_Mat building (south) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Balcony_Mat.gltf:', error);
    }
);

// Load 3Story_Slim_Mat building (to the west, aligned with origin on z-axis)
loader.load(
    '/buildings/3Story_Slim_Mat/3Story_Slim_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 270 degrees around Y axis (90 + 180)
        building.rotation.y = 3 * Math.PI / 2;
        
        // Position building to the west, aligned with origin on z-axis
        // X: -60 (west of origin), Z: 0 (aligned with origin)
        building.position.set(-60, 0, 0);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 16.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Slim_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Slim_Mat building loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Slim_Mat.gltf:', error);
    }
);

// Load another 3Story_Slim_Mat building (to the east, aligned with origin on z-axis)
loader.load(
    '/buildings/3Story_Slim_Mat/3Story_Slim_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 90 degrees around Y axis (270 + 180 = 450 = 90)
        building.rotation.y = Math.PI / 2;
        
        // Position building to the east, aligned with origin on z-axis
        // X: 60 (east of origin), Z: 0 (aligned with origin)
        building.position.set(60, 0, 0);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 16.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Slim_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Slim_Mat building (east) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Slim_Mat.gltf:', error);
    }
);

// Load 3Story_Small_Mat building (parallel to both Slim_Mat and Balcony_Mat buildings)
loader.load(
    '/buildings/3Story_Small_Mat/3Story_Small_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building -135 degrees around Y axis (-90 - 45)
        building.rotation.y = -3 * Math.PI / 4;
        
        // Position building at corner, parallel to both building sets
        // X: -55.17 (moved 4 units closer to origin diagonally), Z: -55.17 (moved 4 units closer to origin diagonally)
        building.position.set(-55.17, 0, -55.17);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 15.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Small_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Small_Mat building loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Small_Mat.gltf:', error);
    }
);

// Load another 3Story_Small_Mat building (at northeast corner, -45 degree offset)
loader.load(
    '/buildings/3Story_Small_Mat/3Story_Small_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 135 degrees around Y axis (-45 + 180)
        building.rotation.y = 3 * Math.PI / 4;
        
        // Position building at northeast corner, aligned with both building sets
        // X: 55.17 (moved 4 units closer to origin diagonally), Z: -55.17 (moved 4 units closer to origin diagonally)
        building.position.set(55.17, 0, -55.17);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 15.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Small_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Small_Mat building (northeast, -45 degree offset) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Small_Mat.gltf:', error);
    }
);

// Load another 3Story_Small_Mat building (at southeast corner, 45 degree offset)
loader.load(
    '/buildings/3Story_Small_Mat/3Story_Small_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 45 degrees around Y axis
        building.rotation.y = Math.PI / 4;
        
        // Position building at southeast corner, aligned with both building sets
        // X: 55.17 (moved 4 units closer to origin diagonally), Z: 55.17 (moved 4 units closer to origin diagonally)
        building.position.set(55.17, 0, 55.17);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 15.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Small_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Small_Mat building (southeast, 45 degree offset) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Small_Mat.gltf:', error);
    }
);

// Load another 3Story_Small_Mat building (at southwest corner, 135 degree offset)
loader.load(
    '/buildings/3Story_Small_Mat/3Story_Small_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 315 degrees around Y axis (135 + 180)
        building.rotation.y = 7 * Math.PI / 4;
        
        // Position building at southwest corner, aligned with both building sets
        // X: -55.17 (moved 4 units closer to origin diagonally), Z: 55.17 (moved 4 units closer to origin diagonally)
        building.position.set(-55.17, 0, 55.17);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 15.25;
        
        // Register building for tracking
        registerBuilding(building, '3Story_Small_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('3Story_Small_Mat building (southwest, 135 degree offset) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 3Story_Small_Mat.gltf:', error);
    }
);

// Load 2Story_Columns_Mat building (diagonally aligned with northeast 3Story_Small_Mat)
loader.load(
    '/buildings/2Story_Columns_Mat/2Story_Columns_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 315 degrees around Y axis (135 + 180)
        building.rotation.y = 7 * Math.PI / 4;
        
        // Position building diagonally aligned with northeast 3Story_Small_Mat
        // X: 85.77 (moved back diagonally by 11 units total), Z: -85.77 (moved back diagonally by 11 units total)
        building.position.set(85.77, 0, -85.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Columns_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Columns_Mat building (diagonally aligned with northeast) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Columns_Mat.gltf:', error);
    }
);

// Load another 2Story_Columns_Mat building (diagonally aligned with southeast 3Story_Small_Mat)
loader.load(
    '/buildings/2Story_Columns_Mat/2Story_Columns_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 225 degrees around Y axis (45 + 180)
        building.rotation.y = 5 * Math.PI / 4;
        
        // Position building diagonally aligned with southeast 3Story_Small_Mat
        // X: 85.77 (further southeast), Z: 85.77 (further southeast)
        building.position.set(85.77, 0, 85.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Columns_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Columns_Mat building (diagonally aligned with southeast) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Columns_Mat.gltf:', error);
    }
);

// Load another 2Story_Columns_Mat building (diagonally aligned with southwest 3Story_Small_Mat)
loader.load(
    '/buildings/2Story_Columns_Mat/2Story_Columns_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building 135 degrees around Y axis
        building.rotation.y = 3 * Math.PI / 4;
        
        // Position building diagonally aligned with southwest 3Story_Small_Mat
        // X: -85.77 (further southwest), Z: 85.77 (further southwest)
        building.position.set(-85.77, 0, 85.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Columns_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Columns_Mat building (diagonally aligned with southwest) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Columns_Mat.gltf:', error);
    }
);

// Load another 2Story_Columns_Mat building (diagonally aligned with northwest 3Story_Small_Mat)
loader.load(
    '/buildings/2Story_Columns_Mat/2Story_Columns_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to align with the northwest diagonal (45 degrees)
        building.rotation.y = Math.PI / 4;
        
        // Position building diagonally aligned with northwest 3Story_Small_Mat
        // X: -85.77 (further northwest), Z: -85.77 (further northwest)
        building.position.set(-85.77, 0, -85.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Columns_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Columns_Mat building (diagonally aligned with northwest) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Columns_Mat.gltf:', error);
    }
);

// Load 2Story_2_Mat building (on south side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_2_Mat/2Story_2_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face south (180 degrees)
        building.rotation.y = Math.PI;
        
        // Position building on south side, equally spaced between southwest and southeast 2Story_Columns_Mat
        // X: 28.59 (1/3 of the way from -85.77 to 85.77), Z: 100.77 (moved 15 units south from 85.77)
        building.position.set(28.59, 0, 100.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_2_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_2_Mat building (south side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_2_Mat.gltf:', error);
    }
);

// Load 2Story_Sidehouse_Mat building (on south side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Sidehouse_Mat/2Story_Sidehouse_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face south (180 degrees)
        building.rotation.y = Math.PI;
        
        // Position building on south side, equally spaced between southwest and southeast 2Story_Columns_Mat
        // X: -28.59 (1/3 of the way from 85.77 to -85.77), Z: 100.77 (moved 15 units south from 85.77)
        building.position.set(-28.59, 0, 100.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Sidehouse_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Sidehouse_Mat building (south side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Sidehouse_Mat.gltf:', error);
    }
);

// Load 2Story_2_Mat building (on north side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_2_Mat/2Story_2_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face north (0 degrees)
        building.rotation.y = 0;
        
        // Position building on north side, equally spaced between northwest and northeast 2Story_Columns_Mat
        // X: 28.59 (1/3 of the way from -85.77 to 85.77), Z: -100.77 (same distance from origin as south-side buildings)
        building.position.set(28.59, 0, -100.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_2_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_2_Mat building (north side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_2_Mat.gltf:', error);
    }
);

// Load 2Story_Sidehouse_Mat building (on north side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Sidehouse_Mat/2Story_Sidehouse_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face north (0 degrees)
        building.rotation.y = 0;
        
        // Position building on north side, equally spaced between northwest and northeast 2Story_Columns_Mat
        // X: -28.59 (1/3 of the way from 85.77 to -85.77), Z: -100.77 (same distance from origin as south-side buildings)
        building.position.set(-28.59, 0, -100.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Sidehouse_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Sidehouse_Mat building (north side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Sidehouse_Mat.gltf:', error);
    }
);

// Load 2Story_Wide_2Doors_Mat building (on east side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Wide_2Doors_Mat/2Story_Wide_2Doors_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face east (-90 degrees)
        building.rotation.y = -Math.PI / 2;
        
        // Position building on east side, equally spaced between northeast and southeast 2Story_Columns_Mat
        // X: 100.77 (moved 15 units east from 85.77), Z: 28.59 (1/3 of the way from -85.77 to 85.77)
        building.position.set(100.77, 0, 28.59);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Wide_2Doors_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Wide_2Doors_Mat building (east side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Wide_2Doors_Mat.gltf:', error);
    }
);

// Load 2Story_Stairs_Mat building (on east side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Stairs_Mat/2Story_Stairs_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face east (-90 degrees)
        building.rotation.y = -Math.PI / 2;
        
        // Position building on east side, equally spaced between northeast and southeast 2Story_Columns_Mat
        // X: 100.77 (moved 15 units east from 85.77), Z: -28.59 (1/3 of the way from 85.77 to -85.77)
        building.position.set(100.77, 0, -28.59);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Stairs_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Stairs_Mat building (east side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Stairs_Mat.gltf:', error);
    }
);

// Load 2Story_Wide_2Doors_Mat building (on west side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Wide_2Doors_Mat/2Story_Wide_2Doors_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face west (90 degrees)
        building.rotation.y = Math.PI / 2;
        
        // Position building on west side, equally spaced between northwest and southwest 2Story_Columns_Mat
        // X: -100.77 (same distance from origin as east-side buildings), Z: -28.59 (1/3 of the way from 85.77 to -85.77)
        building.position.set(-100.77, 0, -28.59);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Wide_2Doors_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Wide_2Doors_Mat building (west side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Wide_2Doors_Mat.gltf:', error);
    }
);

// Load 2Story_Stairs_Mat building (on west side, parallel to 2Story_Columns_Mat buildings)
loader.load(
    '/buildings/2Story_Stairs_Mat/2Story_Stairs_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to face west (90 degrees)
        building.rotation.y = Math.PI / 2;
        
        // Position building on west side, equally spaced between northwest and southwest 2Story_Columns_Mat
        // X: -100.77 (same distance from origin as east-side buildings), Z: 28.59 (1/3 of the way from -85.77 to 85.77)
        building.position.set(-100.77, 0, 28.59);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 10.25;
        
        // Register building for tracking
        registerBuilding(building, '2Story_Stairs_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('2Story_Stairs_Mat building (west side) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 2Story_Stairs_Mat.gltf:', error);
    }
);

// Load 1Story_GableRoof_Mat building (at northeast corner)
loader.load(
    '/buildings/1Story_GableRoof_Mat/1Story_GableRoof_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to match northeast corner alignment (315 degrees)
        building.rotation.y = 7 * Math.PI / 4;
        
        // Position building at northeast corner, moved further into corner
        // X: 137.77, Z: -137.77 (moved 37 units further northeast from 100.77, -100.77)
        building.position.set(137.77, 0, -137.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 8.25; // 1-story building, raised by 3 units (5.25 + 3)
        
        // Register building for tracking
        registerBuilding(building, '1Story_GableRoof_Mat', building.rotation.y, 8);
        
        // Get bounding box for room entry detection (after positioning)
        const finalBox = new THREE.Box3().setFromObject(building);
        // Expand bounding box slightly for easier entry detection
        finalBox.expandByScalar(2);
        
        // Store bounding box in room data for Room 1 (northeast)
        const room1Data = rooms.get(1);
        if (room1Data) {
            room1Data.buildingBoundingBox = finalBox;
        }
        
        // Create entrance indicator in front of building
        const indicator1 = createEntranceIndicator(building.position, building.rotation.y, 1);
        mainMapGroup.add(indicator1);
        
        mainMapGroup.add(building);
        console.log('1Story_GableRoof_Mat building (northeast corner) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 1Story_GableRoof_Mat.gltf:', error);
    }
);

// Load 1Story_GableRoof_Mat building (at southwest corner)
loader.load(
    '/buildings/1Story_GableRoof_Mat/1Story_GableRoof_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to match southwest corner alignment (135 degrees)
        building.rotation.y = 3 * Math.PI / 4;
        
        // Position building at southwest corner, moved further into corner
        // X: -137.77, Z: 137.77 (moved 37 units further southwest from -100.77, 100.77)
        building.position.set(-137.77, 0, 137.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 8.25; // 1-story building, raised by 3 units (5.25 + 3)
        
        // Register building for tracking
        registerBuilding(building, '1Story_GableRoof_Mat', building.rotation.y, 8);
        
        // Get bounding box for room entry detection (after positioning)
        const finalBox = new THREE.Box3().setFromObject(building);
        // Expand bounding box slightly for easier entry detection
        finalBox.expandByScalar(2);
        
        // Store bounding box in room data for Room 2 (southwest)
        const room2Data = rooms.get(2);
        if (room2Data) {
            room2Data.buildingBoundingBox = finalBox;
        }
        
        // Create entrance indicator in front of building
        const indicator2 = createEntranceIndicator(building.position, building.rotation.y, 2);
        mainMapGroup.add(indicator2);
        
        mainMapGroup.add(building);
        console.log('1Story_GableRoof_Mat building (southwest corner) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 1Story_GableRoof_Mat.gltf:', error);
    }
);

// Load 1Story_Sign_Mat building (at northwest corner)
loader.load(
    '/buildings/1Story_Sign_Mat/1Story_Sign_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to match northwest corner alignment (45 degrees)
        building.rotation.y = Math.PI / 4;
        
        // Position building at northwest corner, moved further into corner
        // X: -137.77, Z: -137.77 (moved 37 units further northwest from -100.77, -100.77)
        building.position.set(-137.77, 0, -137.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 7.25; // 1-story building, lowered by 1 unit (8.25 - 1)
        
        // Register building for tracking
        registerBuilding(building, '1Story_Sign_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('1Story_Sign_Mat building (northwest corner) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 1Story_Sign_Mat.gltf:', error);
    }
);

// Load 1Story_Sign_Mat building (at southeast corner)
loader.load(
    '/buildings/1Story_Sign_Mat/1Story_Sign_Mat.gltf',
    (gltf) => {
        const building = gltf.scene;
        
        // Scale building by 8x
        building.scale.set(8, 8, 8);
        
        // Rotate building to match southeast corner alignment (225 degrees)
        building.rotation.y = 5 * Math.PI / 4;
        
        // Position building at southeast corner, moved further into corner
        // X: 137.77, Z: 137.77 (moved 37 units further southeast from 100.77, 100.77)
        building.position.set(137.77, 0, 137.77);
        
        // Enable shadows
        building.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Get bounding box to position building on ground
        const box = new THREE.Box3().setFromObject(building);
        const center = box.getCenter(new THREE.Vector3());
        
        // Adjust position so building sits on ground, then move up by appropriate height
        building.position.y -= center.y;
        building.position.y += 7.25; // 1-story building, lowered by 1 unit (8.25 - 1)
        
        // Register building for tracking
        registerBuilding(building, '1Story_Sign_Mat', building.rotation.y, 8);
        
        mainMapGroup.add(building);
        console.log('1Story_Sign_Mat building (southeast corner) loaded successfully');
    },
    (progress) => {
        if (progress.total > 0) {
            // Building loading progress (log removed)
        }
    },
    (error) => {
        console.error('Error loading 1Story_Sign_Mat.gltf:', error);
    }
);

// Room system - separate entities from main map
interface RoomData {
    id: number;
    roomGroup: THREE.Group;
    entryPoint: THREE.Vector3; // Where player enters from main map
    exitPoint: THREE.Vector3; // Where player spawns in room
    buildingPosition: THREE.Vector3; // Position of associated building
    buildingBoundingBox?: THREE.Box3; // Bounding box for collision detection
    indicatorPosition?: THREE.Vector3; // Position of the 2D entrance indicator
    indicatorRadius?: number; // Radius of the indicator circle
    doorExitIndicatorPosition?: THREE.Vector3; // Position of the 2D door exit indicator
    doorExitIndicatorRadius?: number; // Radius of the door exit indicator circle
}

// Store room models
let wallModel: THREE.Group | null = null;
let floorModel: THREE.Group | null = null;
let growLightModel: THREE.Group | null = null;
let potModel: THREE.Group | null = null;
let cannabisModel: THREE.Group | null = null;
let doorModel: THREE.Group | null = null;
let shelfModel: THREE.Group | null = null;
let fanModel: THREE.Group | null = null;
let ventModel: THREE.Group | null = null;
const rooms: Map<number, RoomData> = new Map();
let currentRoomId: number | null = null; // null = main map, number = room ID
let hasInitialSpawned = false; // Track if player has been initially spawned in room

// Scene type tracking: 'city' | 'growRoomA' | 'growRoomB' | null
let currentSceneType: 'city' | 'growRoomA' | 'growRoomB' | null = null;

// City scene instance (initialized when entering city for the first time)
let cityScene: CityScene | null = null;

// Function to create a 20x20 room (positioned at origin, will be moved to separate space)
function createRoom(roomId: number): THREE.Group {
    const roomGroup = new THREE.Group();
    roomGroup.name = `Room_${roomId}`;
    roomGroup.position.set(0, 0, 0); // Ensure room is positioned at origin
    
    if (!wallModel || !floorModel) {
        console.error('Room models not loaded yet');
        return roomGroup;
    }
    
    const roomSize = 40; // 40x40 units
    
    // Get bounding boxes to understand model dimensions
    const floorBox = new THREE.Box3().setFromObject(floorModel);
    const floorSize = floorBox.getSize(new THREE.Vector3());
    const floorActualSize = Math.max(floorSize.x, floorSize.z); // Use the larger dimension
    
    const wallBox = new THREE.Box3().setFromObject(wallModel);
    const wallSize = wallBox.getSize(new THREE.Vector3());
    
    // Scale walls to be much taller than character
    // Check character height if available, otherwise use default
    let targetWallHeight = 12; // Default: 12 units tall (very tall walls)
    if (farmer) {
        const farmerBox = new THREE.Box3().setFromObject(farmer);
        const farmerSize = farmerBox.getSize(new THREE.Vector3());
        const farmerHeight = farmerSize.y;
        // Make walls at least 4x taller than character
        targetWallHeight = Math.max(12, farmerHeight * 4);
    }
    const wallScale = targetWallHeight / wallSize.y;
    const wallActualHeight = wallSize.y * wallScale; // Scaled wall height
    const wallActualWidth = Math.max(wallSize.x, wallSize.z) * wallScale; // Scaled wall width (along the wall)
    const wallActualThickness = Math.min(wallSize.x, wallSize.z) * wallScale; // Scaled wall thickness (depth into room)
    
    // Calculate how many floor tiles we need
    const tilesPerSide = Math.ceil(roomSize / floorActualSize);
    const actualRoomSize = tilesPerSide * floorActualSize;
    
    // Calculate how many walls we need per side based on wall width
    const wallsPerSide = Math.ceil(actualRoomSize / wallActualWidth);
    
    // Position walls so their inner face aligns with floor edge (not extending outside)
    // We need to offset by half the wall thickness inward
    const wallOffset = wallActualThickness / 2;
    
    // Create floor tiles (15x15 grid) - positioned at origin
    for (let i = 0; i < tilesPerSide; i++) {
        for (let j = 0; j < tilesPerSide; j++) {
            const floorTile = floorModel.clone();
            
            // Position floor tile centered around origin
            // Calculate offset so tiles are centered: from -halfRoomSize to +halfRoomSize
            const offsetX = (i - (tilesPerSide - 1) / 2) * floorActualSize;
            const offsetZ = (j - (tilesPerSide - 1) / 2) * floorActualSize;
            
            floorTile.position.set(offsetX, 0, offsetZ);
            
            // Get bounding box to position on ground
            const tileBox = new THREE.Box3().setFromObject(floorTile);
            const tileCenter = tileBox.getCenter(new THREE.Vector3());
            floorTile.position.y -= tileCenter.y;
            
            // Enable shadows
            floorTile.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            roomGroup.add(floorTile);
        }
    }
    
    // Create walls around the perimeter
    const halfRoomSize = actualRoomSize / 2;
    
    // North wall (positive Z) - position inner face at floor edge
    for (let i = 0; i < wallsPerSide; i++) {
        const wall = wallModel.clone();
        wall.scale.set(wallScale, wallScale, wallScale); // Scale the wall
        const offsetX = (i - wallsPerSide / 2) * wallActualWidth + wallActualWidth / 2;
        
        // Position wall so inner face is at floor edge (offset inward by half thickness)
        wall.position.set(offsetX, 0, halfRoomSize - wallOffset);
        wall.rotation.y = 0; // Face south (into room)
        
        // Get bounding box to position on ground (after scaling)
        const wallBox = new THREE.Box3().setFromObject(wall);
        const wallCenter = wallBox.getCenter(new THREE.Vector3());
        wall.position.y -= wallCenter.y;
        wall.position.y += wallActualHeight / 2; // Position wall on floor
        
        // Enable shadows
        wall.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        roomGroup.add(wall);
    }
    
    // South wall (negative Z) - position inner face at floor edge
    for (let i = 0; i < wallsPerSide; i++) {
        const wall = wallModel.clone();
        wall.scale.set(wallScale, wallScale, wallScale); // Scale the wall
        const offsetX = (i - wallsPerSide / 2) * wallActualWidth + wallActualWidth / 2;
        
        // Position wall so inner face is at floor edge (offset inward by half thickness)
        wall.position.set(offsetX, 0, -halfRoomSize + wallOffset);
        wall.rotation.y = Math.PI; // Face north (into room)
        
        // Get bounding box to position on ground (after scaling)
        const wallBox = new THREE.Box3().setFromObject(wall);
        const wallCenter = wallBox.getCenter(new THREE.Vector3());
        wall.position.y -= wallCenter.y;
        wall.position.y += wallActualHeight / 2;
        
        // Enable shadows
        wall.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        roomGroup.add(wall);
    }
    
    // East wall (positive X) - position inner face at floor edge
    for (let j = 0; j < wallsPerSide; j++) {
        const wall = wallModel.clone();
        wall.scale.set(wallScale, wallScale, wallScale); // Scale the wall
        const offsetZ = (j - wallsPerSide / 2) * wallActualWidth + wallActualWidth / 2;
        
        // Position wall so inner face is at floor edge (offset inward by half thickness)
        wall.position.set(halfRoomSize - wallOffset, 0, offsetZ);
        wall.rotation.y = -Math.PI / 2; // Face west (into room)
        
        // Get bounding box to position on ground (after scaling)
        const wallBox = new THREE.Box3().setFromObject(wall);
        const wallCenter = wallBox.getCenter(new THREE.Vector3());
        wall.position.y -= wallCenter.y;
        wall.position.y += wallActualHeight / 2;
        
        // Enable shadows
        wall.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        roomGroup.add(wall);
    }
    
    // West wall (negative X) - position inner face at floor edge
    for (let j = 0; j < wallsPerSide; j++) {
        const wall = wallModel.clone();
        wall.scale.set(wallScale, wallScale, wallScale); // Scale the wall
        const offsetZ = (j - wallsPerSide / 2) * wallActualWidth + wallActualWidth / 2;
        
        // Position wall so inner face is at floor edge (offset inward by half thickness)
        wall.position.set(-halfRoomSize + wallOffset, 0, offsetZ);
        wall.rotation.y = Math.PI / 2; // Face east (into room)
        
        // Get bounding box to position on ground (after scaling)
        const wallBox = new THREE.Box3().setFromObject(wall);
        const wallCenter = wallBox.getCenter(new THREE.Vector3());
        wall.position.y -= wallCenter.y;
        wall.position.y += wallActualHeight / 2;
        
        // Enable shadows
        wall.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        roomGroup.add(wall);
    }
    
    // Add door on south wall, centered at origin (X=0)
    if (doorModel) {
        const door = doorModel.clone();
        
        // Scale door to be appropriately sized relative to character
        const doorBox = new THREE.Box3().setFromObject(door);
        const doorSize = doorBox.getSize(new THREE.Vector3());
        
        // Calculate door height based on character height
        // Standard door is about 2-2.5x character height
        let targetDoorHeight = 2.5; // Default if character not loaded yet
        if (farmer) {
            const farmerBox = new THREE.Box3().setFromObject(farmer);
            const farmerSize = farmerBox.getSize(new THREE.Vector3());
            const farmerHeight = farmerSize.y;
            // Door should be 2.2x character height (standard door proportions)
            targetDoorHeight = farmerHeight * 2.2;
        }
        
        const doorScale = (targetDoorHeight / doorSize.y) * 2.5; // Scale 3x
        door.scale.set(doorScale, doorScale, doorScale);
        
        // Recalculate size after scaling
        const scaledDoorBox = new THREE.Box3().setFromObject(door);
        const scaledDoorSize = scaledDoorBox.getSize(new THREE.Vector3());
        const scaledDoorCenter = scaledDoorBox.getCenter(new THREE.Vector3());
        
        // Position door at the center of the room, moved 5 units north
        door.position.set(-1.5, 0, 19.55);
        
        // Rotate door to face north (positive Z direction)
        door.rotation.y = Math.PI;
        
        // Position door on the floor (bottom of door at floor level)
        door.position.y -= scaledDoorCenter.y;
        door.position.y += scaledDoorSize.y / 2;
        
        // Make door visible - ensure it's not culled
        door.visible = true;
        
        // Enable shadows and make sure materials are visible
        door.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.visible = true;
                // Ensure material is visible
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat instanceof THREE.Material) {
                                mat.visible = true;
                            }
                        });
                    } else if (child.material instanceof THREE.Material) {
                        child.material.visible = true;
                    }
                }
            }
        });
        
        door.name = `Room_${roomId}_Door`;
        roomGroup.add(door);
        
        // Update door's world matrix to get accurate world position
        door.updateMatrixWorld(true);
        
        // Get door's world position (for logging)
        const doorWorldPosition = new THREE.Vector3();
        door.getWorldPosition(doorWorldPosition);
        
        // Door added (log removed)
        
        // Create door exit indicator circle in front of the door using local position
        // (since indicator is added to roomGroup which is at origin)
        const doorExitIndicator = createDoorExitIndicator(roomId, door.position, door.rotation.y);
        if (doorExitIndicator) {
            roomGroup.add(doorExitIndicator);
            // Door exit indicator added (log removed)
        }
    } else {
        console.warn(`[DOOR] Door model not loaded when creating Room ${roomId}`);
    }
    
    // Add shelves at both corners of south wall
    if (shelfModel) {
        const shelfScale = 4; // Adjust scale as needed
        
        // Create temporary shelves with rotation to get accurate bounding boxes
        const tempEastShelf = shelfModel.clone();
        tempEastShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempEastShelf.rotation.y = Math.PI / 2; // Face west (into room)
        const eastShelfBox = new THREE.Box3().setFromObject(tempEastShelf);
        const eastShelfSize = eastShelfBox.getSize(new THREE.Vector3());
        const eastShelfCenter = eastShelfBox.getCenter(new THREE.Vector3());
        
        const tempWestShelf = shelfModel.clone();
        tempWestShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempWestShelf.rotation.y = -Math.PI / 2; // Face east (into room)
        const westShelfBox = new THREE.Box3().setFromObject(tempWestShelf);
        const westShelfSize = westShelfBox.getSize(new THREE.Vector3());
        const westShelfCenter = westShelfBox.getCenter(new THREE.Vector3());
        
        // Position shelves to touch the east and west walls
        // East wall inner face is at x = halfRoomSize - wallOffset
        // West wall inner face is at x = -halfRoomSize + wallOffset
        // South wall inner face is at z = -halfRoomSize + wallOffset
        
        // Calculate shelf depth (dimension perpendicular to wall after rotation)
        // After rotation, the depth along X axis is the shelf's X size
        const eastShelfDepth = eastShelfSize.x; // Depth along X axis after rotation
        const westShelfDepth = westShelfSize.x; // Depth along X axis after rotation
        const margin = 1; // Small margin from south wall
        const wallOffsetDistance = 0.5; // Distance to move shelves further inside from walls
        
        // East shelf: position further inside the room from east wall
        // Position so the shelf's westernmost edge is at wallOffsetDistance from the wall
        const eastShelfX = halfRoomSize - wallOffset - eastShelfDepth / 2 - wallOffsetDistance;
        const eastShelfZ = -halfRoomSize + wallOffset + margin + 5; // Moved 1 unit north
        
        // West shelf: position further inside the room from west wall
        // Position so the shelf's easternmost edge is at wallOffsetDistance from the wall
        const westShelfX = -halfRoomSize + wallOffset + westShelfDepth / 2 + wallOffsetDistance;
        const westShelfZ = -halfRoomSize + wallOffset + margin + 5; // Moved 1 unit north
        
        // Create east shelf
        const eastShelf = shelfModel.clone();
        eastShelf.scale.set(shelfScale, shelfScale, shelfScale);
        eastShelf.rotation.y = Math.PI / 2; // Face west (into room)
        eastShelf.position.set(eastShelfX, 0, eastShelfZ);
        
        // Position shelf on the floor (using rotated shelf's Y size)
        eastShelf.position.y -= eastShelfCenter.y;
        eastShelf.position.y += eastShelfSize.y / 2;
        
        // Enable shadows
        eastShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        eastShelf.name = `Room_${roomId}_Shelf_East`;
        roomGroup.add(eastShelf);
        
        // Create west shelf
        const westShelf = shelfModel.clone();
        westShelf.scale.set(shelfScale, shelfScale, shelfScale);
        westShelf.rotation.y = -Math.PI / 2; // Face east (into room)
        westShelf.position.set(westShelfX, 0, westShelfZ);
        
        // Position shelf on the floor (using rotated shelf's Y size)
        westShelf.position.y -= westShelfCenter.y;
        westShelf.position.y += westShelfSize.y / 2;
        
        // Enable shadows
        westShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        westShelf.name = `Room_${roomId}_Shelf_West`;
        roomGroup.add(westShelf);
        
        // Add two shelves on south wall, perpendicular to existing shelves
        // These shelves run north-south and face north (into room)
        const tempSouthShelf = shelfModel.clone();
        tempSouthShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempSouthShelf.rotation.y = 0; // Face north (into room)
        const southShelfBox = new THREE.Box3().setFromObject(tempSouthShelf);
        const southShelfSize = southShelfBox.getSize(new THREE.Vector3());
        const southShelfCenter = southShelfBox.getCenter(new THREE.Vector3());
        const shelfWidth = southShelfSize.z; // Depth (perpendicular to main axis after rotation)
        
        // Position shelves along south wall, spaced evenly
        // Calculate positions: one on left side, one on right side of south wall
        const southWallZ = -halfRoomSize + wallOffset + margin + 1; // Moved 1 unit north
        const spacingFromWalls = 5; // Distance from east/west walls
        const leftShelfX = -halfRoomSize + wallOffset + spacingFromWalls + shelfWidth / 2;
        const rightShelfX = halfRoomSize - wallOffset - spacingFromWalls - shelfWidth / 2;
        
        // Create left shelf (on south wall, left side)
        const leftShelf = shelfModel.clone();
        leftShelf.scale.set(shelfScale, shelfScale, shelfScale);
        leftShelf.rotation.y = 0; // Face north (into room)
        leftShelf.position.set(leftShelfX, 0, southWallZ);
        
        // Position shelf on the floor
        leftShelf.position.y -= southShelfCenter.y;
        leftShelf.position.y += southShelfSize.y / 2;
        
        // Enable shadows
        leftShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        leftShelf.name = `Room_${roomId}_Shelf_South_Left`;
        roomGroup.add(leftShelf);
        
        // Create right shelf (on south wall, right side)
        const rightShelf = shelfModel.clone();
        rightShelf.scale.set(shelfScale, shelfScale, shelfScale);
        rightShelf.rotation.y = 0; // Face north (into room)
        rightShelf.position.set(rightShelfX, 0, southWallZ);
        
        // Position shelf on the floor
        rightShelf.position.y -= southShelfCenter.y;
        rightShelf.position.y += southShelfSize.y / 2;
        
        // Enable shadows
        rightShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        rightShelf.name = `Room_${roomId}_Shelf_South_Right`;
        roomGroup.add(rightShelf);
        
        // Shelves added (log removed)
        console.log(`  East shelf: (${eastShelfX.toFixed(2)}, ${eastShelf.position.y.toFixed(2)}, ${eastShelfZ.toFixed(2)})`);
        console.log(`  West shelf: (${westShelfX.toFixed(2)}, ${westShelf.position.y.toFixed(2)}, ${westShelfZ.toFixed(2)})`);
        console.log(`[SHELF] Added two perpendicular shelves on south wall:`);
        console.log(`  Left shelf: (${leftShelfX.toFixed(2)}, ${leftShelf.position.y.toFixed(2)}, ${southWallZ.toFixed(2)})`);
        console.log(`  Right shelf: (${rightShelfX.toFixed(2)}, ${rightShelf.position.y.toFixed(2)}, ${southWallZ.toFixed(2)})`);
    } else {
        console.warn(`[SHELF] Shelf model not loaded when creating Room ${roomId}`);
    }
    
    // Add room lighting - bright lights for interior
    const roomAmbientLight = new THREE.AmbientLight(0x9D00FF, 0.8); // Purplish ultraviolet grow light ambient
    roomAmbientLight.name = `Room_${roomId}_AmbientLight`;
    roomGroup.add(roomAmbientLight);
    
    const roomDirectionalLight = new THREE.DirectionalLight(0x9D00FF, 1.0); // Purplish ultraviolet grow light directional
    roomDirectionalLight.position.set(0, 10, 0); // Above the room
    roomDirectionalLight.castShadow = true;
    roomDirectionalLight.shadow.mapSize.width = 1024;
    roomDirectionalLight.shadow.mapSize.height = 1024;
    roomDirectionalLight.shadow.camera.near = 0.5;
    roomDirectionalLight.shadow.camera.far = 50;
    roomDirectionalLight.shadow.camera.left = -15;
    roomDirectionalLight.shadow.camera.right = 15;
    roomDirectionalLight.shadow.camera.top = 15;
    roomDirectionalLight.shadow.camera.bottom = -15;
    roomDirectionalLight.name = `Room_${roomId}_DirectionalLight`;
    roomGroup.add(roomDirectionalLight);
    
    // Add five grow lights evenly spaced on west side, hanging from ceiling
    if (growLightModel) {
        const numLights = 5;
        const halfRoomSize = actualRoomSize / 2;
        const ceilingHeight = wallActualHeight * 0.8;
        
        // Calculate position inside the walls
        // Walls have their inner face at halfRoomSize - wallOffset
        // Position lights inside from the wall's inner face
        const innerWallEdge = -halfRoomSize + wallOffset; // Inner edge of west wall
        
        // First clone to get size for spacing calculations
        const tempLight = growLightModel.clone();
        tempLight.scale.set(0.2, 0.2, 0.2);
        const tempLightBox = new THREE.Box3().setFromObject(tempLight);
        const lightSize = tempLightBox.getSize(new THREE.Vector3());
        const lightRadius = Math.max(lightSize.x, lightSize.z) / 2; // Half of largest horizontal dimension
        
        // Room center is at origin (0, 0, 0)
        const roomCenterX = 0;
        
        // Center west side lights in the west half of the room (between west wall and room center)
        const westPosition = (innerWallEdge + roomCenterX) / 2; // Center between west wall and room center
        
        // Calculate spacing to ensure equal margins from north and south walls
        // Account for wall thickness - walls have inner face at halfRoomSize - wallOffset
        const northInnerEdge = halfRoomSize - wallOffset; // Inner edge of north wall
        const southInnerEdge = -halfRoomSize + wallOffset; // Inner edge of south wall
        const margin = lightRadius + 3; // Margin from north and south inner wall edges (account for light size + buffer)
        const availableSpace = (northInnerEdge - southInnerEdge) - (2 * margin);
        const spacing = availableSpace / (numLights - 1); // Space between lights
        
        for (let i = 0; i < numLights; i++) {
            const growLight = growLightModel.clone();
            
            // Scale down by 5x (1/5 of original size)
            growLight.scale.set(0.2, 0.2, 0.2);
            
            // Get bounding box to position the grow light (after scaling)
            const growLightBox = new THREE.Box3().setFromObject(growLight);
            const growLightSize = growLightBox.getSize(new THREE.Vector3());
            const growLightCenter = growLightBox.getCenter(new THREE.Vector3());
            
            // Calculate Z position for even spacing with equal margins from north and south inner walls
            // Start from south inner wall edge + margin, then space evenly
            const zPosition = southInnerEdge + margin + (spacing * i);
            
            // Position on west side of room, hanging from ceiling
            growLight.position.set(westPosition, ceilingHeight, zPosition);
            
            // Adjust X position to account for bounding box center offset to keep light centered
            // The actual center X should be at westPosition, so adjust for bounding box center
            growLight.position.x = westPosition - growLightCenter.x;
            
            // Adjust position so the top of the grow light is at ceiling height
            // Subtract the center offset and add half the height
            growLight.position.y -= growLightCenter.y;
            growLight.position.y += growLightSize.y / 2;
            
            // Enable shadows
            growLight.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            growLight.name = `Room_${roomId}_GrowLight_${i + 1}`;
            roomGroup.add(growLight);
            
            // Add actual light emission from the grow light
            // Position light at the center of the grow light fixture (horizontally) and at the bottom (vertically)
            // The bounding box center is in local space relative to the object's origin
            // To get world position: object position + local center (already accounts for scale since bbox is calculated after scaling)
            const actualCenterX = growLight.position.x + growLightCenter.x;
            const actualCenterZ = growLight.position.z + growLightCenter.z;
            
            // Position light at the horizontal center (X and Z) and at the bottom (Y) of the grow light
            const lightPosition = new THREE.Vector3(
                actualCenterX, // Center horizontally (X)
                growLight.position.y - growLightSize.y / 2, // Bottom of the grow light (Y)
                actualCenterZ  // Center horizontally (Z)
            );
            
            // Create a bright point light like actual grow lights (full spectrum LED)
            const growLightPoint = new THREE.PointLight(0x9D00FF, 35.0, 30); // Purplish ultraviolet grow light, intensity 35.0 (7x brighter), range 30
            growLightPoint.position.copy(lightPosition);
            growLightPoint.castShadow = true;
            growLightPoint.shadow.mapSize.width = 1024;
            growLightPoint.shadow.mapSize.height = 1024;
            growLightPoint.shadow.camera.near = 0.1;
            growLightPoint.shadow.camera.far = 30;
            growLightPoint.name = `Room_${roomId}_GrowLightPoint_${i + 1}`;
            roomGroup.add(growLightPoint);
            
            // Pots will be added by addPotsToExistingRooms() when pot model loads
        }
        
        // Add five grow lights evenly spaced on east side, hanging from ceiling (mirror of west side)
        const eastInnerEdge = halfRoomSize - wallOffset; // Inner edge of east wall
        // Center east side lights in the east half of the room (between room center and east wall)
        const eastPosition = (roomCenterX + eastInnerEdge) / 2; // Center between room center and east wall
        
        for (let i = 0; i < numLights; i++) {
            const growLight = growLightModel.clone();
            
            // Scale down by 5x (1/5 of original size)
            growLight.scale.set(0.2, 0.2, 0.2);
            
            // Get bounding box to position the grow light (after scaling)
            const growLightBox = new THREE.Box3().setFromObject(growLight);
            const growLightSize = growLightBox.getSize(new THREE.Vector3());
            const growLightCenter = growLightBox.getCenter(new THREE.Vector3());
            
            // Use same Z position as west side lights
            const zPosition = southInnerEdge + margin + (spacing * i);
            
            // Position on east side of room, hanging from ceiling
            growLight.position.set(eastPosition, ceilingHeight, zPosition);
            
            // Adjust X position to account for bounding box center offset to keep light centered
            // The actual center X should be at eastPosition, so adjust for bounding box center
            growLight.position.x = eastPosition - growLightCenter.x;
            
            // Ensure light stays inside room (easternmost edge shouldn't exceed east wall)
            const buffer = 0.5; // Additional buffer from wall
            const easternmostEdge = growLight.position.x + growLightCenter.x + growLightSize.x / 2;
            if (easternmostEdge > eastInnerEdge - buffer) {
                // Adjust X position to keep light inside while maintaining centering as much as possible
                growLight.position.x = eastInnerEdge - buffer - growLightCenter.x - growLightSize.x / 2;
            }
            
            // Adjust position so the top of the grow light is at ceiling height
            growLight.position.y -= growLightCenter.y;
            growLight.position.y += growLightSize.y / 2;
            
            // Enable shadows
            growLight.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            growLight.name = `Room_${roomId}_GrowLight_East_${i + 1}`;
            roomGroup.add(growLight);
            
            // Add actual light emission from the grow light
            const actualCenterX = growLight.position.x + growLightCenter.x;
            const actualCenterZ = growLight.position.z + growLightCenter.z;
            
            const lightPosition = new THREE.Vector3(
                actualCenterX,
                growLight.position.y - growLightSize.y / 2,
                actualCenterZ
            );
            
            const growLightPoint = new THREE.PointLight(0x9D00FF, 35.0, 30); // Purplish ultraviolet grow light
            growLightPoint.position.copy(lightPosition);
            growLightPoint.castShadow = true;
            growLightPoint.shadow.mapSize.width = 1024;
            growLightPoint.shadow.mapSize.height = 1024;
            growLightPoint.shadow.camera.near = 0.1;
            growLightPoint.shadow.camera.far = 30;
            growLightPoint.name = `Room_${roomId}_GrowLightPoint_East_${i + 1}`;
            roomGroup.add(growLightPoint);
            
            // Pots will be added by addPotsToExistingRooms() when pot model loads
        }
    }
    
    // Hide room initially (rooms are separate from main map)
    roomGroup.visible = false;
    
    return roomGroup;
}

// Function to add grow lights to existing rooms (called when grow light model loads)
function addGrowLightsToExistingRooms(): void {
    if (!growLightModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if grow lights already exist for this room
        let hasGrowLights = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_GrowLight_`)) {
                hasGrowLights = true;
            }
        });
        
        // If grow lights already exist, skip
        if (hasGrowLights) continue;
        
        // Get room boundaries to calculate positions
        const roomBox = new THREE.Box3().setFromObject(roomGroup);
        const actualRoomSize = Math.max(roomBox.getSize(new THREE.Vector3()).x, roomBox.getSize(new THREE.Vector3()).z);
        const halfRoomSize = actualRoomSize / 2;
        
        // Get wall model to calculate wall offset and ceiling height
        if (!wallModel) continue;
        const wallBox = new THREE.Box3().setFromObject(wallModel);
        const wallSize = wallBox.getSize(new THREE.Vector3());
        let targetWallHeight = 12;
        if (farmer) {
            const farmerBox = new THREE.Box3().setFromObject(farmer);
            const farmerSize = farmerBox.getSize(new THREE.Vector3());
            const farmerHeight = farmerSize.y;
            targetWallHeight = Math.max(12, farmerHeight * 4);
        }
        const wallScale = targetWallHeight / wallSize.y;
        const wallActualHeight = wallSize.y * wallScale;
        const wallActualThickness = Math.min(wallSize.x, wallSize.z) * wallScale;
        const wallOffset = wallActualThickness / 2;
        const ceilingHeight = wallActualHeight * 0.8;
        
        const numLights = 5;
        const innerWallEdge = -halfRoomSize + wallOffset;
        const roomCenterX = 0;
        const westPosition = (innerWallEdge + roomCenterX) / 2;
        const northInnerEdge = halfRoomSize - wallOffset;
        const southInnerEdge = -halfRoomSize + wallOffset;
        
        // First clone to get size for spacing calculations
        const tempLight = growLightModel.clone();
        tempLight.scale.set(0.2, 0.2, 0.2);
        const tempLightBox = new THREE.Box3().setFromObject(tempLight);
        const lightSize = tempLightBox.getSize(new THREE.Vector3());
        const lightRadius = Math.max(lightSize.x, lightSize.z) / 2;
        const margin = lightRadius + 3;
        const availableSpace = (northInnerEdge - southInnerEdge) - (2 * margin);
        const spacing = availableSpace / (numLights - 1);
        
        // Add five grow lights evenly spaced on west side
        for (let i = 0; i < numLights; i++) {
            const growLight = growLightModel.clone();
            growLight.scale.set(0.2, 0.2, 0.2);
            
            const growLightBox = new THREE.Box3().setFromObject(growLight);
            const growLightSize = growLightBox.getSize(new THREE.Vector3());
            const growLightCenter = growLightBox.getCenter(new THREE.Vector3());
            
            const zPosition = southInnerEdge + margin + (spacing * i);
            growLight.position.set(westPosition, ceilingHeight, zPosition);
            growLight.position.x = westPosition - growLightCenter.x;
            growLight.position.y -= growLightCenter.y;
            growLight.position.y += growLightSize.y / 2;
            
            growLight.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            growLight.name = `Room_${roomId}_GrowLight_${i + 1}`;
            roomGroup.add(growLight);
            
            const actualCenterX = growLight.position.x + growLightCenter.x;
            const actualCenterZ = growLight.position.z + growLightCenter.z;
            const lightPosition = new THREE.Vector3(
                actualCenterX,
                growLight.position.y - growLightSize.y / 2,
                actualCenterZ
            );
            
            const growLightPoint = new THREE.PointLight(0x9D00FF, 35.0, 30);
            growLightPoint.position.copy(lightPosition);
            growLightPoint.castShadow = true;
            growLightPoint.shadow.mapSize.width = 1024;
            growLightPoint.shadow.mapSize.height = 1024;
            growLightPoint.shadow.camera.near = 0.1;
            growLightPoint.shadow.camera.far = 30;
            growLightPoint.name = `Room_${roomId}_GrowLightPoint_${i + 1}`;
            roomGroup.add(growLightPoint);
        }
        
        // Add five grow lights evenly spaced on east side
        const eastInnerEdge = halfRoomSize - wallOffset;
        const eastPosition = (roomCenterX + eastInnerEdge) / 2;
        
        for (let i = 0; i < numLights; i++) {
            const growLight = growLightModel.clone();
            growLight.scale.set(0.2, 0.2, 0.2);
            
            const growLightBox = new THREE.Box3().setFromObject(growLight);
            const growLightSize = growLightBox.getSize(new THREE.Vector3());
            const growLightCenter = growLightBox.getCenter(new THREE.Vector3());
            
            const zPosition = southInnerEdge + margin + (spacing * i);
            growLight.position.set(eastPosition, ceilingHeight, zPosition);
            growLight.position.x = eastPosition - growLightCenter.x;
            
            const buffer = 0.5;
            const easternmostEdge = growLight.position.x + growLightCenter.x + growLightSize.x / 2;
            if (easternmostEdge > eastInnerEdge - buffer) {
                growLight.position.x = eastInnerEdge - buffer - growLightCenter.x - growLightSize.x / 2;
            }
            
            growLight.position.y -= growLightCenter.y;
            growLight.position.y += growLightSize.y / 2;
            
            growLight.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            growLight.name = `Room_${roomId}_GrowLight_East_${i + 1}`;
            roomGroup.add(growLight);
            
            const actualCenterX = growLight.position.x + growLightCenter.x;
            const actualCenterZ = growLight.position.z + growLightCenter.z;
            const lightPosition = new THREE.Vector3(
                actualCenterX,
                growLight.position.y - growLightSize.y / 2,
                actualCenterZ
            );
            
            const growLightPoint = new THREE.PointLight(0x9D00FF, 35.0, 30);
            growLightPoint.position.copy(lightPosition);
            growLightPoint.castShadow = true;
            growLightPoint.shadow.mapSize.width = 1024;
            growLightPoint.shadow.mapSize.height = 1024;
            growLightPoint.shadow.camera.near = 0.1;
            growLightPoint.shadow.camera.far = 30;
            growLightPoint.name = `Room_${roomId}_GrowLightPoint_East_${i + 1}`;
            roomGroup.add(growLightPoint);
        }
        
        // Grow lights added (log removed)
    }
}

// Function to add doors to existing rooms (called when door model loads)
function addDoorsToExistingRooms(): void {
    if (!doorModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if door already exists for this room
        let hasDoor = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Door`)) {
                hasDoor = true;
            }
        });
        
        // If door already exists, skip
        if (hasDoor) continue;
        
        // Door will be positioned at room center (origin)
        
        // Create door
        const door = doorModel.clone();
        
        // Scale door to be appropriately sized relative to character
        const doorBox = new THREE.Box3().setFromObject(door);
        const doorSize = doorBox.getSize(new THREE.Vector3());
        
        // Calculate door height based on character height
        // Standard door is about 2-2.5x character height
        let targetDoorHeight = 2.5; // Default if character not loaded yet
        if (farmer) {
            const farmerBox = new THREE.Box3().setFromObject(farmer);
            const farmerSize = farmerBox.getSize(new THREE.Vector3());
            const farmerHeight = farmerSize.y;
            // Door should be 2.2x character height (standard door proportions)
            targetDoorHeight = farmerHeight * 2.2;
        }
        
        const doorScale = (targetDoorHeight / doorSize.y) * 3; // Scale 3x
        door.scale.set(doorScale, doorScale, doorScale);
        
        // Recalculate size after scaling
        const scaledDoorBox = new THREE.Box3().setFromObject(door);
        const scaledDoorSize = scaledDoorBox.getSize(new THREE.Vector3());
        const scaledDoorCenter = scaledDoorBox.getCenter(new THREE.Vector3());
        
        // Position door at the center of the room, moved 5 units north
        door.position.set(0, 0, 5);
        
        // Rotate door to face north (positive Z direction)
        door.rotation.y = Math.PI;
        
        // Position door on the floor (bottom of door at floor level)
        door.position.y -= scaledDoorCenter.y;
        door.position.y += scaledDoorSize.y / 2;
        
        // Make door visible - ensure it's not culled
        door.visible = true;
        
        // Enable shadows and make sure materials are visible
        door.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.visible = true;
                // Ensure material is visible
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            if (mat instanceof THREE.Material) {
                                mat.visible = true;
                            }
                        });
                    } else if (child.material instanceof THREE.Material) {
                        child.material.visible = true;
                    }
                }
            }
        });
        
        door.name = `Room_${roomId}_Door`;
        roomGroup.add(door);
        
        // Update door's world matrix to get accurate world position
        door.updateMatrixWorld(true);
        
        // Get door's world position (for logging)
        const doorWorldPosition = new THREE.Vector3();
        door.getWorldPosition(doorWorldPosition);
        
        // Door added to existing room (log removed)
        
        // Create door exit indicator circle in front of the door if it doesn't exist
        let hasExitIndicator = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`DoorExitIndicator_${roomId}`)) {
                hasExitIndicator = true;
            }
        });
        
        if (!hasExitIndicator) {
            // Pass door local position directly (since indicator is added to roomGroup)
            const doorExitIndicator = createDoorExitIndicator(roomId, door.position, door.rotation.y);
            if (doorExitIndicator) {
                roomGroup.add(doorExitIndicator);
                // Door exit indicator added to existing room (log removed)
            }
        }
    }
}

// Function to add pots to existing rooms (called when pot model loads)
function addPotsToExistingRooms(): void {
    if (!potModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if pots already exist for this room
        let hasPots = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Pot_`)) {
                hasPots = true;
            }
        });
        
        // If pots already exist, skip
        if (hasPots) continue;
        
        // Get room boundaries (room is 40x40, centered at origin)
        const roomBox = new THREE.Box3().setFromObject(roomGroup);
        const actualRoomSize = Math.max(roomBox.getSize(new THREE.Vector3()).x, roomBox.getSize(new THREE.Vector3()).z);
        const actualHalfRoomSize = actualRoomSize / 2;
        const wallMargin = 3; // Margin from walls for walking space
        const usableMinX = -actualHalfRoomSize + wallMargin;
        const usableMaxX = actualHalfRoomSize - wallMargin;
        const usableMinZ = -actualHalfRoomSize + wallMargin;
        const usableMaxZ = actualHalfRoomSize - wallMargin;
        
        // Get pot size for positioning (account for scale)
        const tempPot = potModel!.clone();
        const potScale = 3;
        tempPot.scale.set(potScale, potScale, potScale);
        const potBox = new THREE.Box3().setFromObject(tempPot);
        const potSize = potBox.getSize(new THREE.Vector3());
        const potCenter = potBox.getCenter(new THREE.Vector3());
        const potRadius = Math.max(potSize.x, potSize.z) / 2;
        
        // Configuration for each section
        const numSections = 7;
        const potsPerRow = 2; // Pots in each row (east-west)
        const potsPerCol = 2; // Pots in each column (north-south)
        const potSpacingX = 2.5; // Spacing between pots in a row (east-west)
        const potSpacingZ = 2.5; // Spacing between pots in a column (north-south)
        
        // Section dimensions
        const sectionWidth = (potsPerRow - 1) * potSpacingX + potRadius * 2;
        const sectionDepth = (potsPerCol - 1) * potSpacingZ + potRadius * 2;
        
        // Path through origin: Z = -2 to +2 (4 units wide)
        const pathWidth = 4;
        const pathMinZ = -pathWidth / 2; // -2
        const pathMaxZ = pathWidth / 2;  // 2
        
        // Calculate section positions ensuring ALL pots in each section are outside the path
        // Each section has pots spaced 2.5 units, so we need sections centered at least 3+ units from path edges
        const westX = usableMinX + sectionWidth / 2 + 2;
        const centerX = 0;
        const eastX = usableMaxX - sectionWidth / 2 - 2;
        
        // Position sections so their pots don't overlap with path (Z=-2 to Z=2)
        // With 2x2 grid and 2.5 spacing, pots extend ±1.25 from center, so center must be >3.25 from path edge
        const topZ = usableMaxZ - sectionDepth / 2 - 2; // Top section
        const upperMiddleZ = pathMaxZ + 5; // Above path (Z=7) - ensures all pots are above Z=2
        const lowerMiddleZ = pathMinZ - 5; // Below path (Z=-7) - ensures all pots are below Z=-2
        const bottomZ = usableMinZ + sectionDepth / 2 + 2; // Bottom section
        
        // Arrange 7 sections: 3 on west side, 1 in center, 3 on east side
        const sections: Array<{centerX: number, centerZ: number}> = [];
        
        // Add 3 sections on west side (top, upper middle, lower middle)
        sections.push({centerX: westX, centerZ: topZ});
        sections.push({centerX: westX, centerZ: upperMiddleZ});
        sections.push({centerX: westX, centerZ: lowerMiddleZ});
        
        // Add 1 section in center (at bottom to avoid path)
        sections.push({centerX: centerX, centerZ: bottomZ});
        
        // Add 3 sections on east side (top, upper middle, lower middle)
        sections.push({centerX: eastX, centerZ: topZ});
        sections.push({centerX: eastX, centerZ: upperMiddleZ});
        sections.push({centerX: eastX, centerZ: lowerMiddleZ});
        
        let totalPotsAdded = 0;
        
        // Create pots in each section
        sections.forEach((section, sectionIndex) => {
            // Calculate starting position for this section (top-left corner of grid)
            const startX = section.centerX - (potsPerRow - 1) * potSpacingX / 2;
            const startZ = section.centerZ + (potsPerCol - 1) * potSpacingZ / 2; // Start from north (positive Z)
            
            // Create pots in a grid within this section
            for (let row = 0; row < potsPerRow; row++) {
                for (let col = 0; col < potsPerCol; col++) {
                    const potX = startX + row * potSpacingX;
                    const potZ = startZ - col * potSpacingZ; // Move south (negative Z)
                    
                    // Skip if pot would block the path through origin (Z=0 ± 2 units)
                    const pathWidth = 4;
                    if (potZ >= -pathWidth / 2 && potZ <= pathWidth / 2) {
                        continue;
                    }
                    
                    // Check if pot is within room boundaries
                    if (potX - potRadius < usableMinX || potX + potRadius > usableMaxX ||
                        potZ - potRadius < usableMinZ || potZ + potRadius > usableMaxZ) {
                        continue;
                    }
                    
                    // Create and position the pot
                    const pot = potModel!.clone();
                    pot.scale.set(potScale, potScale, potScale);
                    pot.rotation.y = Math.PI;
                    
                    // Set pot position on the floor
                    pot.position.set(potX, 0, potZ);
                    
                    // Adjust position so pot sits on floor (account for scale)
                    pot.position.y -= potCenter.y;
                    pot.position.y += potSize.y / 2;
                    
                    // Enable shadows
                    pot.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    pot.name = `Room_${roomId}_Pot_Section${sectionIndex + 1}_Row${row + 1}_Col${col + 1}`;
                    roomGroup.add(pot);
                    
                    // Add cannabis plant centered in the pot
                    if (cannabisModel) {
                        // Get pot's bounding box after positioning to find center and top
                        const positionedPotBox = new THREE.Box3().setFromObject(pot);
                        const potWorldCenter = positionedPotBox.getCenter(new THREE.Vector3());
                        const potTopY = positionedPotBox.max.y; // Top of the pot
                        
                        // Create and position cannabis plant
                        const cannabis = cannabisModel.clone();
                        
                        // Get cannabis size to scale appropriately
                        const tempCannabisBox = new THREE.Box3().setFromObject(cannabis);
                        const cannabisSize = tempCannabisBox.getSize(new THREE.Vector3());
                        const cannabisCenter = tempCannabisBox.getCenter(new THREE.Vector3());
                        
                        // Scale cannabis to fit nicely in pot (adjust scale as needed)
                        const cannabisScale = Math.min(potSize.x, potSize.z) / Math.max(cannabisSize.x, cannabisSize.z) * 0.8 * 2.5;
                        cannabis.scale.set(cannabisScale, cannabisScale, cannabisScale);
                        
                        // Position cannabis at pot center (horizontally) and at top of pot (vertically)
                        // Account for cannabis's local center offset so it sits on top of pot
                        cannabis.position.set(
                            potWorldCenter.x, // Center X
                            potTopY - (cannabisCenter.y * cannabisScale) + 2.3, // Top of pot, accounting for scaled center offset, raised by 2.3
                            potWorldCenter.z  // Center Z
                        );
                        
                        // Enable shadows and make plants brighter green
                        cannabis.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                                
                                // Make cannabis plants bright vibrant green, less affected by shadows
                                if (child.material) {
                                    const material = Array.isArray(child.material) ? child.material[0] : child.material;
                                    // Create a darker natural green material with subtle emissive glow to reduce shadow impact
                                    const brightGreen = new THREE.MeshStandardMaterial({
                                        color: 0x5a9a5a, // Darker natural plant green
                                        metalness: 0,
                                        roughness: 0.4, // Slightly more roughness for natural look
                                        map: (material as any).map || null,
                                        normalMap: (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) ? ((material as any).normalMap || null) : null,
                                        emissive: new THREE.Color(0x2a7a2a), // Darker green emissive glow
                                        emissiveIntensity: 0.15, // Subtle glow to reduce shadow impact
                                        flatShading: false
                                    });
                                    child.material = brightGreen;
                                }
                            }
                        });
                        
                        cannabis.name = `Room_${roomId}_Cannabis_Section${sectionIndex + 1}_Row${row + 1}_Col${col + 1}`;
                        roomGroup.add(cannabis);
                    }
                    
                    totalPotsAdded++;
                }
            }
        });
        
        // Pots added (log removed)
        
        // Add fans between pot sections
        addFansBetweenPotSections(roomId, roomGroup, sections);
        
        // Initialize grow slot indicators for this room
        initializeGrowSlotIndicators(roomId, roomGroup);
    }
}

// Function to initialize grow slot indicators for a room
async function initializeGrowSlotIndicators(roomId: number, roomGroup: THREE.Group): Promise<void> {
    if (roomId === 1) {
        // Room 1 uses manager A
        if (!growSlotIndicatorManagerA.isInitialized) {
            await growSlotIndicatorManagerA.initialize(roomGroup, roomId);
        }
    } else if (roomId === 2) {
        // Room 2 uses manager B
        if (!growSlotIndicatorManagerB.isInitialized) {
            await growSlotIndicatorManagerB.initialize(roomGroup, roomId);
        }
    }
}

// Function to add strain name labels above each section
function addStrainLabels(roomId: number, roomGroup: THREE.Group, sections: Array<{centerX: number, centerZ: number}>): void {
    const strainNames = [
        'Blackberry Kush',
        'White Widow',
        'Green Crack',
        'Blackberry Widow',
        'White Crack',
        'Green Kush',
        'Green Widow Kush'
    ];
    
    // Position labels above cannabis plants
    const labelHeight = 8; // Height above floor for labels
    
    // Helper function to color words in strain names
    const createColoredLabel = (strainName: string): HTMLElement => {
        const words = strainName.split(' ');
        const labelDiv = document.createElement('div');
        labelDiv.className = 'strain-label';
        labelDiv.style.fontSize = '16px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.fontFamily = 'Arial, sans-serif';
        labelDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        labelDiv.style.pointerEvents = 'none';
        labelDiv.style.userSelect = 'none';
        labelDiv.style.whiteSpace = 'nowrap';
        
        words.forEach((word, index) => {
            const span = document.createElement('span');
            const lowerWord = word.toLowerCase();
            
            // Apply colors based on word
            if (lowerWord === 'blackberry' || lowerWord === 'kush') {
                span.style.color = '#6B2C91'; // Dark purple
            } else if (lowerWord === 'white' || lowerWord === 'widow') {
                span.style.color = '#ffffff'; // White
            } else if (lowerWord === 'green' || lowerWord === 'crack') {
                span.style.color = '#00ff00'; // Green
            } else {
                span.style.color = '#ffffff'; // Default white
            }
            
            span.textContent = word;
            labelDiv.appendChild(span);
            
            // Add space between words (except after last word)
            if (index < words.length - 1) {
                labelDiv.appendChild(document.createTextNode(' '));
            }
        });
        
        return labelDiv;
    };
    
    sections.forEach((section, sectionIndex) => {
        if (sectionIndex >= strainNames.length) return;
        
        // Create label element with colored text
        const labelDiv = createColoredLabel(strainNames[sectionIndex]);
        
        // Swap positions for Blackberry Widow (section 3) and Green Widow Kush (section 6)
        let labelX = section.centerX;
        let labelZ = section.centerZ;
        
        if (sectionIndex === 3) {
            // Blackberry Widow - use Green Widow Kush's position (section 6)
            labelX = sections[6].centerX;
            labelZ = sections[6].centerZ;
        } else if (sectionIndex === 6) {
            // Green Widow Kush - use Blackberry Widow's position (section 3)
            labelX = sections[3].centerX;
            labelZ = sections[3].centerZ;
        }
        
        // Create CSS2DObject
        const label = new CSS2DObject(labelDiv);
        label.position.set(labelX, labelHeight, labelZ);
        label.name = `Room_${roomId}_StrainLabel_Section${sectionIndex + 1}`;
        // Labels should match room visibility (rooms start hidden)
        label.visible = roomGroup.visible;
        labelDiv.style.display = roomGroup.visible ? 'block' : 'none';
        roomGroup.add(label);
    });
}

// Function to update label visibility based on room visibility
function updateLabelVisibility(roomId: number, visible: boolean): void {
    const roomData = rooms.get(roomId);
    if (!roomData) return;
    
    // Traverse room group to find all strain labels
    roomData.roomGroup.traverse((child) => {
        if (child.name && child.name.includes(`Room_${roomId}_StrainLabel_`)) {
            child.visible = visible;
            // Also update the CSS element visibility
            if (child instanceof CSS2DObject) {
                const element = child.element;
                if (element) {
                    element.style.display = visible ? 'block' : 'none';
                }
            }
        }
    });
}

// Function to add cannabis to existing pots (called when cannabis model loads)
function addCannabisToExistingPots(): void {
    if (!cannabisModel || !potModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Get pot scale (same as used in addPotsToExistingRooms)
        const potScale = 3;
        const tempPot = potModel.clone();
        tempPot.scale.set(potScale, potScale, potScale);
        const potBox = new THREE.Box3().setFromObject(tempPot);
        const potSize = potBox.getSize(new THREE.Vector3());
        
        // Find all pots in this room and add cannabis to them
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Pot_`) && child instanceof THREE.Group) {
                const pot = child as THREE.Group;
                
                // Check if cannabis already exists for this pot
                let hasCannabis = false;
                roomGroup.traverse((cannabisChild) => {
                    if (cannabisChild.name && cannabisChild.name.includes(`Room_${roomId}_Cannabis_`) && 
                        cannabisChild.name.includes(pot.name.split('_Pot_')[1])) {
                        hasCannabis = true;
                    }
                });
                
                if (hasCannabis) return; // Skip if cannabis already exists
                
                // Get pot's bounding box after positioning to find center and top
                const positionedPotBox = new THREE.Box3().setFromObject(pot);
                const potWorldCenter = positionedPotBox.getCenter(new THREE.Vector3());
                const potTopY = positionedPotBox.max.y; // Top of the pot
                
                // Create and position cannabis plant
                const cannabis = cannabisModel!.clone();
                
                // Get cannabis size to scale appropriately
                const tempCannabisBox = new THREE.Box3().setFromObject(cannabis);
                const cannabisSize = tempCannabisBox.getSize(new THREE.Vector3());
                const cannabisCenter = tempCannabisBox.getCenter(new THREE.Vector3());
                
                // Scale cannabis to fit nicely in pot (adjust scale as needed)
                const cannabisScale = Math.min(potSize.x, potSize.z) / Math.max(cannabisSize.x, cannabisSize.z) * 0.8 * 2.5;
                cannabis.scale.set(cannabisScale, cannabisScale, cannabisScale);
                
                // Position cannabis at pot center (horizontally) and at top of pot (vertically)
                // Account for cannabis's local center offset so it sits on top of pot
                cannabis.position.set(
                    potWorldCenter.x, // Center X
                    potTopY - (cannabisCenter.y * cannabisScale) + 2.3, // Top of pot, accounting for scaled center offset, raised by 2.3
                    potWorldCenter.z  // Center Z
                );
                
                // Enable shadows and make plants brighter green
                cannabis.traverse((cannabisChild) => {
                    if (cannabisChild instanceof THREE.Mesh) {
                        cannabisChild.castShadow = true;
                        cannabisChild.receiveShadow = true;
                        
                        // Make cannabis plants bright vibrant green, less affected by shadows
                        if (cannabisChild.material) {
                            const material = Array.isArray(cannabisChild.material) ? cannabisChild.material[0] : cannabisChild.material;
                            // Create a darker natural green material with subtle emissive glow to reduce shadow impact
                            const brightGreen = new THREE.MeshStandardMaterial({
                                color: 0x5a9a5a, // Darker natural plant green
                                metalness: 0,
                                roughness: 0.4, // Slightly more roughness for natural look
                                map: (material as any).map || null,
                                normalMap: (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) ? ((material as any).normalMap || null) : null,
                                emissive: new THREE.Color(0x2a7a2a), // Darker green emissive glow
                                emissiveIntensity: 0.15, // Subtle glow to reduce shadow impact
                                flatShading: false
                            });
                            cannabisChild.material = brightGreen;
                        }
                    }
                });
                
                // Extract pot identifier from pot name to create matching cannabis name
                const potIdentifier = pot.name.split('_Pot_')[1];
                cannabis.name = `Room_${roomId}_Cannabis_${potIdentifier}`;
                roomGroup.add(cannabis);
            }
        });
    }
    
    console.log('Added cannabis plants to existing pots');
}

// Function to add fans between pot sections
function addFansBetweenPotSections(roomId: number, roomGroup: THREE.Group, sections: Array<{centerX: number, centerZ: number}>): void {
    if (!fanModel) return;
    
    // Check if fans already exist for this room
    let hasFans = false;
    roomGroup.traverse((child) => {
        if (child.name && child.name.includes(`Room_${roomId}_Fan_`)) {
            hasFans = true;
        }
    });
    
    // If fans already exist, skip
    if (hasFans) return;
    
    // Get fan size for positioning
    const tempFan = fanModel.clone();
    const fanScale = 3; // Adjust scale as needed
    tempFan.scale.set(fanScale, fanScale, fanScale);
    const fanBox = new THREE.Box3().setFromObject(tempFan);
    const fanSize = fanBox.getSize(new THREE.Vector3());
    const fanCenter = fanBox.getCenter(new THREE.Vector3());
    
    let totalFansAdded = 0;
    
    // Add fans between consecutive sections (only on west and east sides, skip center)
    for (let i = 0; i < sections.length - 1; i++) {
        // Skip fans between west side and center (i == 2) and between center and east side (i == 3)
        if (i === 2 || i === 3) continue;
        
        const section1 = sections[i];
        const section2 = sections[i + 1];
        
        // Calculate midpoint between sections
        const midX = (section1.centerX + section2.centerX) / 2;
        const midZ = (section1.centerZ + section2.centerZ) / 2;
        
        // Create and position the fan
        const fan = fanModel.clone();
        fan.scale.set(fanScale, fanScale, fanScale);
        
        // Rotate fans on west side by 180 degrees
        if (i < 2) { // West side fans (i == 0 or i == 1)
            fan.rotation.y = Math.PI; // 180 degrees
        }
        
        // Set fan position on the floor
        fan.position.set(midX, 0, midZ);
        
        // Adjust position so fan sits on floor (account for scale)
        fan.position.y -= fanCenter.y;
        fan.position.y += fanSize.y / 2;
        fan.position.y += 0.3; // Raise fan by 0.3 units
        
        // Enable shadows
        fan.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        fan.name = `Room_${roomId}_Fan_BetweenSection${i + 1}_${i + 2}`;
        roomGroup.add(fan);
        totalFansAdded++;
    }
    
    // Fans added (log removed)
}

// Function to add fans to existing rooms (called when fan model loads)
function addFansToExistingRooms(): void {
    if (!fanModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if fans already exist for this room
        let hasFans = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Fan_`)) {
                hasFans = true;
            }
        });
        
        // If fans already exist, skip
        if (hasFans) continue;
        
        // Get room boundaries (room is 40x40, centered at origin)
        const roomBox = new THREE.Box3().setFromObject(roomGroup);
        const actualRoomSize = Math.max(roomBox.getSize(new THREE.Vector3()).x, roomBox.getSize(new THREE.Vector3()).z);
        const actualHalfRoomSize = actualRoomSize / 2;
        const wallMargin = 3; // Margin from walls for walking space
        const usableMinX = -actualHalfRoomSize + wallMargin;
        const usableMaxX = actualHalfRoomSize - wallMargin;
        const usableMinZ = -actualHalfRoomSize + wallMargin;
        const usableMaxZ = actualHalfRoomSize - wallMargin;
        
        // Get pot size for positioning (to calculate section positions)
        if (!potModel) continue;
        const tempPot = potModel.clone();
        const potScale = 3;
        tempPot.scale.set(potScale, potScale, potScale);
        const potBox = new THREE.Box3().setFromObject(tempPot);
        const potSize = potBox.getSize(new THREE.Vector3());
        const potRadius = Math.max(potSize.x, potSize.z) / 2;
        
        // Configuration for each section (same as in addPotsToExistingRooms)
        const potsPerRow = 2;
        const potsPerCol = 2;
        const potSpacingX = 2.5;
        const potSpacingZ = 2.5;
        const sectionWidth = (potsPerRow - 1) * potSpacingX + potRadius * 2;
        const sectionDepth = (potsPerCol - 1) * potSpacingZ + potRadius * 2;
        
        // Path through origin: Z = -2 to +2 (4 units wide)
        const pathWidth = 4;
        const pathMinZ = -pathWidth / 2;
        const pathMaxZ = pathWidth / 2;
        
        // Calculate section positions (same as in addPotsToExistingRooms)
        const westX = usableMinX + sectionWidth / 2 + 2;
        const centerX = 0;
        const eastX = usableMaxX - sectionWidth / 2 - 2;
        const topZ = usableMaxZ - sectionDepth / 2 - 2;
        const upperMiddleZ = pathMaxZ + 5;
        const lowerMiddleZ = pathMinZ - 5;
        const bottomZ = usableMinZ + sectionDepth / 2 + 2;
        
        // Arrange 7 sections: 3 on west side, 1 in center, 3 on east side
        const sections: Array<{centerX: number, centerZ: number}> = [];
        sections.push({centerX: westX, centerZ: topZ});
        sections.push({centerX: westX, centerZ: upperMiddleZ});
        sections.push({centerX: westX, centerZ: lowerMiddleZ});
        sections.push({centerX: centerX, centerZ: bottomZ});
        sections.push({centerX: eastX, centerZ: topZ});
        sections.push({centerX: eastX, centerZ: upperMiddleZ});
        sections.push({centerX: eastX, centerZ: lowerMiddleZ});
        
        // Add fans between sections
        addFansBetweenPotSections(roomId, roomGroup, sections);
    }
}

// Function to add vents to existing rooms (called when vent model loads)
function addVentsToExistingRooms(): void {
    if (!ventModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if vents already exist for this room
        let hasVents = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Vent_`)) {
                hasVents = true;
            }
        });
        
        // If vents already exist, skip
        if (hasVents) continue;
        
        // Get room boundaries (room is 40x40, centered at origin)
        const roomBox = new THREE.Box3().setFromObject(roomGroup);
        const actualRoomSize = Math.max(roomBox.getSize(new THREE.Vector3()).x, roomBox.getSize(new THREE.Vector3()).z);
        const actualHalfRoomSize = actualRoomSize / 2;
        
        // Get wall model to calculate wall offset
        if (!wallModel) continue;
        const wallBox = new THREE.Box3().setFromObject(wallModel);
        const wallSize = wallBox.getSize(new THREE.Vector3());
        let targetWallHeight = 12;
        if (farmer) {
            const farmerBox = new THREE.Box3().setFromObject(farmer);
            const farmerSize = farmerBox.getSize(new THREE.Vector3());
            const farmerHeight = farmerSize.y;
            targetWallHeight = Math.max(12, farmerHeight * 4);
        }
        const wallScale = targetWallHeight / wallSize.y;
        const wallActualThickness = Math.min(wallSize.x, wallSize.z) * wallScale;
        const wallOffset = wallActualThickness / 2;
        
        // North wall inner face is at z = actualHalfRoomSize - wallOffset
        const northWallZ = actualHalfRoomSize - wallOffset;
        
        // Get vent size for positioning
        const tempVent = ventModel.clone();
        const ventScale = 3; // Adjust scale as needed
        tempVent.scale.set(ventScale, ventScale, ventScale);
        const ventBox = new THREE.Box3().setFromObject(tempVent);
        const ventSize = ventBox.getSize(new THREE.Vector3());
        const ventCenter = ventBox.getCenter(new THREE.Vector3());
        
        // Position two vents on the north wall, spaced apart
        // Place them at approximately 1/3 and 2/3 of the wall width
        const spacing = actualRoomSize / 3;
        const leftVentX = -spacing;
        const rightVentX = spacing;
        
        // Position vents on the wall (slightly offset from wall surface)
        const ventOffsetFromWall = 0.1; // Small offset to place vent on wall surface
        
        // Create left vent
        const leftVent = ventModel.clone();
        leftVent.scale.set(ventScale, ventScale, ventScale);
        leftVent.rotation.y = Math.PI; // Face south (into room)
        leftVent.position.set(leftVentX, 0, northWallZ - ventOffsetFromWall - 3.75);
        
        // Position vent on the wall (center vertically on wall)
        leftVent.position.y -= ventCenter.y;
        leftVent.position.y += ventSize.y / 2;
        // Position vent at appropriate height on wall (middle of wall height)
        const wallActualHeight = wallSize.y * wallScale;
        leftVent.position.y += wallActualHeight / 2;
        
        // Enable shadows
        leftVent.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        leftVent.name = `Room_${roomId}_Vent_North_Left`;
        roomGroup.add(leftVent);
        
        // Create right vent
        const rightVent = ventModel.clone();
        rightVent.scale.set(ventScale, ventScale, ventScale);
        rightVent.rotation.y = Math.PI; // Face south (into room)
        rightVent.position.set(rightVentX, 0, northWallZ - ventOffsetFromWall - 3.75);
        
        // Position vent on the wall (center vertically on wall)
        rightVent.position.y -= ventCenter.y;
        rightVent.position.y += ventSize.y / 2;
        // Position vent at appropriate height on wall (middle of wall height)
        rightVent.position.y += wallActualHeight / 2;
        
        // Enable shadows
        rightVent.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        rightVent.name = `Room_${roomId}_Vent_North_Right`;
        roomGroup.add(rightVent);
        
        // Vents added (log removed)
        console.log(`  Left vent: (${leftVentX.toFixed(2)}, ${leftVent.position.y.toFixed(2)}, ${northWallZ.toFixed(2)})`);
        console.log(`  Right vent: (${rightVentX.toFixed(2)}, ${rightVent.position.y.toFixed(2)}, ${northWallZ.toFixed(2)})`);
    }
}

// Function to add shelves to existing rooms (called when shelf model loads)
function addShelvesToExistingRooms(): void {
    if (!shelfModel) return;
    
    // Iterate through all rooms
    for (const [roomId, roomData] of rooms.entries()) {
        const roomGroup = roomData.roomGroup;
        
        // Check if shelves already exist for this room
        let hasShelves = false;
        roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Shelf_`)) {
                hasShelves = true;
            }
        });
        
        // If shelves already exist, skip
        if (hasShelves) continue;
        
        // Calculate room size the same way as createRoom() - from floor tiles, not bounding box
        // This ensures shelves are positioned correctly for both host and joining players
        if (!wallModel || !floorModel) continue;
        
        const roomSize = 40; // Match createRoom() value
        
        // Get floor model dimensions (same calculation as createRoom())
        const floorBox = new THREE.Box3().setFromObject(floorModel);
        const floorSize = floorBox.getSize(new THREE.Vector3());
        const floorActualSize = Math.max(floorSize.x, floorSize.z); // Use the larger dimension
        
        // Calculate how many floor tiles we need (same as createRoom())
        const tilesPerSide = Math.ceil(roomSize / floorActualSize);
        const actualRoomSize = tilesPerSide * floorActualSize;
        const actualHalfRoomSize = actualRoomSize / 2;
        
        // Get wall model to calculate wall offset (same calculation as createRoom())
        const wallBox = new THREE.Box3().setFromObject(wallModel);
        const wallSize = wallBox.getSize(new THREE.Vector3());
        let targetWallHeight = 12;
        if (farmer) {
            const farmerBox = new THREE.Box3().setFromObject(farmer);
            const farmerSize = farmerBox.getSize(new THREE.Vector3());
            const farmerHeight = farmerSize.y;
            targetWallHeight = Math.max(12, farmerHeight * 4);
        }
        const wallScale = targetWallHeight / wallSize.y;
        const wallActualThickness = Math.min(wallSize.x, wallSize.z) * wallScale;
        const wallOffset = wallActualThickness / 2;
        
        // Get shelf size for positioning (match createRoom() values)
        const shelfScale = 4; // Match createRoom() scale
        
        // Create temporary shelves with rotation to get accurate bounding boxes
        const tempEastShelf = shelfModel.clone();
        tempEastShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempEastShelf.rotation.y = Math.PI / 2; // Face west (into room)
        const eastShelfBox = new THREE.Box3().setFromObject(tempEastShelf);
        const eastShelfSize = eastShelfBox.getSize(new THREE.Vector3());
        const eastShelfCenter = eastShelfBox.getCenter(new THREE.Vector3());
        
        const tempWestShelf = shelfModel.clone();
        tempWestShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempWestShelf.rotation.y = -Math.PI / 2; // Face east (into room)
        const westShelfBox = new THREE.Box3().setFromObject(tempWestShelf);
        const westShelfSize = westShelfBox.getSize(new THREE.Vector3());
        const westShelfCenter = westShelfBox.getCenter(new THREE.Vector3());
        
        // Position shelves to touch the east and west walls
        // East wall inner face is at x = actualHalfRoomSize - wallOffset
        // West wall inner face is at x = -actualHalfRoomSize + wallOffset
        // South wall inner face is at z = -actualHalfRoomSize + wallOffset
        
        // Calculate shelf depth (dimension perpendicular to wall after rotation)
        // After rotation, the depth along X axis is the shelf's X size
        const eastShelfDepth = eastShelfSize.x; // Depth along X axis after rotation
        const westShelfDepth = westShelfSize.x; // Depth along X axis after rotation
        const margin = 1; // Small margin from south wall
        const wallOffsetDistance = 0.5; // Match createRoom() value
        
        // East shelf: position further inside the room from east wall
        // Position so the shelf's westernmost edge is at wallOffsetDistance from the wall
        const eastShelfX = actualHalfRoomSize - wallOffset - eastShelfDepth / 2 - wallOffsetDistance;
        const eastShelfZ = -actualHalfRoomSize + wallOffset + margin + 5; // Match createRoom() value
        
        // West shelf: position further inside the room from west wall
        // Position so the shelf's easternmost edge is at wallOffsetDistance from the wall
        const westShelfX = -actualHalfRoomSize + wallOffset + westShelfDepth / 2 + wallOffsetDistance;
        const westShelfZ = -actualHalfRoomSize + wallOffset + margin + 5; // Match createRoom() value
        
        // Create east shelf
        const eastShelf = shelfModel.clone();
        eastShelf.scale.set(shelfScale, shelfScale, shelfScale);
        eastShelf.rotation.y = Math.PI / 2; // Face west (into room)
        eastShelf.position.set(eastShelfX, 0, eastShelfZ);
        
        // Position shelf on the floor (using rotated shelf's Y size)
        eastShelf.position.y -= eastShelfCenter.y;
        eastShelf.position.y += eastShelfSize.y / 2;
        
        // Enable shadows
        eastShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        eastShelf.name = `Room_${roomId}_Shelf_East`;
        roomGroup.add(eastShelf);
        
        // Create west shelf
        const westShelf = shelfModel.clone();
        westShelf.scale.set(shelfScale, shelfScale, shelfScale);
        westShelf.rotation.y = -Math.PI / 2; // Face east (into room)
        westShelf.position.set(westShelfX, 0, westShelfZ);
        
        // Position shelf on the floor (using rotated shelf's Y size)
        westShelf.position.y -= westShelfCenter.y;
        westShelf.position.y += westShelfSize.y / 2;
        
        // Enable shadows
        westShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        westShelf.name = `Room_${roomId}_Shelf_West`;
        roomGroup.add(westShelf);
        
        // Add two shelves on south wall, perpendicular to existing shelves
        // These shelves run north-south and face north (into room)
        const tempSouthShelf = shelfModel.clone();
        tempSouthShelf.scale.set(shelfScale, shelfScale, shelfScale);
        tempSouthShelf.rotation.y = 0; // Face north (into room)
        const southShelfBox = new THREE.Box3().setFromObject(tempSouthShelf);
        const southShelfSize = southShelfBox.getSize(new THREE.Vector3());
        const southShelfCenter = southShelfBox.getCenter(new THREE.Vector3());
        const shelfWidth = southShelfSize.z; // Depth (perpendicular to main axis after rotation)
        
        // Position shelves along south wall, spaced evenly
        // Calculate positions: one on left side, one on right side of south wall
        const southWallZ = -actualHalfRoomSize + wallOffset + margin + 1; // Match createRoom() value
        const spacingFromWalls = 5; // Match createRoom() value
        const leftShelfX = -actualHalfRoomSize + wallOffset + spacingFromWalls + shelfWidth / 2;
        const rightShelfX = actualHalfRoomSize - wallOffset - spacingFromWalls - shelfWidth / 2;
        
        // Create left shelf (on south wall, left side)
        const leftShelf = shelfModel.clone();
        leftShelf.scale.set(shelfScale, shelfScale, shelfScale);
        leftShelf.rotation.y = 0; // Face north (into room)
        leftShelf.position.set(leftShelfX, 0, southWallZ);
        
        // Position shelf on the floor
        leftShelf.position.y -= southShelfCenter.y;
        leftShelf.position.y += southShelfSize.y / 2;
        
        // Enable shadows
        leftShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        leftShelf.name = `Room_${roomId}_Shelf_South_Left`;
        roomGroup.add(leftShelf);
        
        // Create right shelf (on south wall, right side)
        const rightShelf = shelfModel.clone();
        rightShelf.scale.set(shelfScale, shelfScale, shelfScale);
        rightShelf.rotation.y = 0; // Face north (into room)
        rightShelf.position.set(rightShelfX, 0, southWallZ);
        
        // Position shelf on the floor
        rightShelf.position.y -= southShelfCenter.y;
        rightShelf.position.y += southShelfSize.y / 2;
        
        // Enable shadows
        rightShelf.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        rightShelf.name = `Room_${roomId}_Shelf_South_Right`;
        roomGroup.add(rightShelf);
        
        // Shelves added (log removed)
        console.log(`  East shelf: (${eastShelfX.toFixed(2)}, ${eastShelf.position.y.toFixed(2)}, ${eastShelfZ.toFixed(2)})`);
        console.log(`  West shelf: (${westShelfX.toFixed(2)}, ${westShelf.position.y.toFixed(2)}, ${westShelfZ.toFixed(2)})`);
        console.log(`Added two perpendicular shelves on south wall:`);
        console.log(`  Left shelf: (${leftShelfX.toFixed(2)}, ${leftShelf.position.y.toFixed(2)}, ${southWallZ.toFixed(2)})`);
        console.log(`  Right shelf: (${rightShelfX.toFixed(2)}, ${rightShelf.position.y.toFixed(2)}, ${southWallZ.toFixed(2)})`);
    }
}

// Function to create rooms once models are loaded
function createRoomsIfReady(): void {
    if (!wallModel || !floorModel) return;
    
    // Check if rooms need to be created (check if room groups are placeholders or don't exist)
    const room1 = rooms.get(1);
    const room2 = rooms.get(2);
    const needsRoom1 = !room1 || room1.roomGroup.name.includes('Placeholder');
    const needsRoom2 = !room2 || room2.roomGroup.name.includes('Placeholder');
    
    if (needsRoom1) {
        // Create Room 1 - associated with northeast corner building (137.77, 0, -137.77)
        const existingRoom1 = rooms.get(1);
        const room1Group = createRoom(1);
        const room1Data: RoomData = {
            id: 1,
            roomGroup: room1Group,
            entryPoint: new THREE.Vector3(137.77, 0, -137.77), // Building position
            exitPoint: new THREE.Vector3(0, 0, -6), // Spawn point in room (near south wall)
            buildingPosition: new THREE.Vector3(137.77, 0, -137.77),
            // Preserve existing indicator data if it was set earlier
            indicatorPosition: existingRoom1?.indicatorPosition,
            indicatorRadius: existingRoom1?.indicatorRadius
        };
        rooms.set(1, room1Data);
        // Don't add to scene yet - will be added when player enters the room for performance
        // Only add if player is already in this room
        if (currentRoomId === 1) {
            scene.add(room1Group);
            room1Group.visible = true;
        }
        // Room 1 created (log removed)
    }
    
    if (needsRoom2) {
        // Create Room 2 - associated with southwest corner building (-137.77, 0, 137.77)
        const existingRoom2 = rooms.get(2);
        const room2Group = createRoom(2);
        const room2Data: RoomData = {
            id: 2,
            roomGroup: room2Group,
            entryPoint: new THREE.Vector3(-137.77, 0, 137.77), // Building position
            exitPoint: new THREE.Vector3(0, 0, -6), // Spawn point in room (near south wall)
            buildingPosition: new THREE.Vector3(-137.77, 0, 137.77),
            // Preserve existing indicator data if it was set earlier
            indicatorPosition: existingRoom2?.indicatorPosition,
            indicatorRadius: existingRoom2?.indicatorRadius
        };
        rooms.set(2, room2Data);
        // Don't add to scene yet - will be added when player enters the room for performance
        // Only add if player is already in this room
        if (currentRoomId === 2) {
            scene.add(room2Group);
            room2Group.visible = true;
        }
        // Room 2 created (log removed)
    }
    
    // Add vents to rooms if vent model is already loaded
    if (ventModel) {
        addVentsToExistingRooms();
    }
    
    // Try to spawn character in room if it's ready (only on initial spawn, not after exit)
    // For demo mode, always spawn in grow room (room 1)
    if (!hasInitialSpawned) {
        const identity = identityStore.getIdentity();
        const isDemoMode = identity && identity.privyUserId.startsWith('demo-user');
        
        if (isDemoMode) {
            // Demo mode: ensure spawn in grow room (room 1)
            // Demo mode: spawning in room (log removed)
            spawnCharacterInRoom(1);
            hasInitialSpawned = true;
        } else {
            // Normal mode: try to spawn in room 1 (default behavior)
            spawnCharacterInRoom(1);
            if (currentRoomId !== null) {
                hasInitialSpawned = true; // Mark as spawned if successfully entered room
            }
        }
    }
}

// Function to enter a room
function enterRoom(roomId: number): void {
    const roomData = rooms.get(roomId);
    if (!roomData || currentRoomId === roomId) return;
    
    // Exit city scene before entering room
    exitCityScene();
    
    // Determine scene type based on room ID
    if (roomId === 1) {
        currentSceneType = 'growRoomA';
    } else if (roomId === 2) {
        currentSceneType = 'growRoomB';
    } else {
        currentSceneType = null;
    }
    
    // Remove main map from scene for performance (don't render world when in room)
    // Also ensure CityRenderer has paused (which hides main map)
    if (cityScene) {
        cityScene.exit(); // This will pause and hide main map
    }
    if (scene.children.includes(mainMapGroup)) {
        scene.remove(mainMapGroup);
    }
    mainMapGroup.visible = false; // Double-check it's hidden
    
    // Ensure room group is in scene and visible
    if (!scene.children.includes(roomData.roomGroup)) {
        scene.add(roomData.roomGroup);
    }
    roomData.roomGroup.visible = true;
    
    // Ensure exit indicator exists for this room (important for joining players)
    let hasExitIndicator = false;
    roomData.roomGroup.traverse((child) => {
        if (child.name && child.name.includes(`DoorExitIndicator_${roomId}`)) {
            hasExitIndicator = true;
        }
    });
    
    if (!hasExitIndicator && doorModel) {
        // Try to find door to create exit indicator
        let doorFound = false;
        let doorPosition = new THREE.Vector3();
        let doorRotation = 0;
        
        roomData.roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Door`)) {
                doorPosition.copy(child.position);
                doorRotation = child.rotation.y;
                doorFound = true;
            }
        });
        
        if (doorFound) {
            const doorExitIndicator = createDoorExitIndicator(roomId, doorPosition, doorRotation);
            if (doorExitIndicator) {
                roomData.roomGroup.add(doorExitIndicator);
                // Door exit indicator created (log removed)
            }
        } else {
            // Door not found, try adding doors to existing rooms
            addDoorsToExistingRooms();
        }
    }
    
    // Ensure grow slot indicators are initialized (in case pots were added before)
    if (potModel) {
        initializeGrowSlotIndicators(roomId, roomData.roomGroup);
    }
    
    // Teleport player to room spawn point (exitPoint is where player spawns in room)
    if (farmer) {
        farmer.position.copy(roomData.exitPoint);
        farmer.position.y = 0;
        // Make character visible when entering room
        farmer.visible = true;
        // Ensure character is within room boundaries
        constrainCharacterInRoom();
    }
    
    currentRoomId = roomId;
    // Entered room (log removed)
}

// Function to get current player state for presence updates
// Only returns valid state when player is in city scene (not in a room)
function getPlayerState(): { position: { x: number; y: number; z: number }; rotation: number; animationState: 'idle' | 'walk' | 'run' } {
    if (!farmer) {
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            animationState: 'idle',
        };
    }

    // Only send position updates when in city scene (not in a room)
    // When in a room, the position is in room coordinates, not city coordinates
    if (currentRoomId !== null) {
        // Return a default position when in room (presence updates should be paused anyway)
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            animationState: 'idle',
        };
    }

    // Determine animation state based on current actions
    let animationState: 'idle' | 'walk' | 'run' = 'idle';
    const isMoving = keys['w'] || keys['s'] || keys['a'] || keys['d'];
    const isRunning = keys['shift'];
    
    if (isMoving) {
        animationState = isRunning ? 'run' : 'walk';
    }

    return {
        position: {
            x: farmer.position.x,
            y: farmer.position.y,
            z: farmer.position.z,
        },
        rotation: farmer.rotation.y,
        animationState,
    };
}

// Function to enter city scene
function enterCityScene(): void {
    const identity = identityStore.getIdentity();
    if (!identity) {
        console.log('[CityScene] No identity, skipping city scene initialization');
        currentSceneType = 'city';
        return;
    }

    const isDemoMode = identity.privyUserId.startsWith('demo-user');

    // Initialize city scene if not already initialized
    // For demo mode: initialize without matchId (no presence updates, but delivery indicators will show)
    // For multiplayer: initialize with matchId (presence updates + availability-based indicators)
    if (!cityScene) {
        if (isDemoMode) {
            console.log('[CityScene] Initializing city scene for demo mode');
        } else if (identity.matchId) {
            console.log('[CityScene] Initializing city scene for presence updates');
        } else {
            console.log('[CityScene] No match ID, skipping city scene initialization');
            currentSceneType = 'city';
            return;
        }
        cityScene = new CityScene(scene, camera, renderer, mainMapGroup, identity);
        cityScene.initialize(getPlayerState);
    }
    
    // Always call enter() to ensure scene is resumed and updates are sent
    // This is important when exiting a room - the scene might be paused
    cityScene.enter();

    currentSceneType = 'city';
    console.log('[CityScene] Entered city scene');
}

// Function to exit city scene (when entering grow room)
function exitCityScene(): void {
    // If cityScene exists, pause it to hide main map (even if currentSceneType isn't 'city' yet)
    // This handles the case where CityScene was pre-initialized but player spawned in room
    if (cityScene) {
        cityScene.exit();
    }
    
    if (currentSceneType === 'city') {
        currentSceneType = null;
        console.log('[CityScene] Exited city scene');
    }
}

// Function to exit room and return to main map (then enter city scene)
function exitRoom(): void {
    if (currentRoomId === null) return;
    
    const roomData = rooms.get(currentRoomId);
    if (!roomData) return;
    
    // Remove room from scene for performance (don't render room when in world)
    if (scene.children.includes(roomData.roomGroup)) {
        scene.remove(roomData.roomGroup);
    }
    roomData.roomGroup.visible = false;
    
    // Ensure main map is in scene and visible
    if (!scene.children.includes(mainMapGroup)) {
        scene.add(mainMapGroup);
    }
    mainMapGroup.visible = true;
    
    // Find the corresponding 1Story_GableRoof building and teleport player to front of it
    if (farmer) {
        const buildings = buildingTracker.getBuildingsByName('1Story_GableRoof_Mat');
        
        // Find the building closest to the room's building position
        let closestBuilding = null;
        let minDistance = Infinity;
        
        for (const building of buildings) {
            const distance = roomData.buildingPosition.distanceTo(building.position);
            if (distance < minDistance) {
                minDistance = distance;
                closestBuilding = building;
            }
        }
        
        if (closestBuilding) {
            // Calculate position in front of the building
            // Building rotation determines which direction is "front"
            const offsetDistance = 8; // Distance in front of building
            const offsetX = Math.sin(closestBuilding.rotation) * offsetDistance;
            const offsetZ = Math.cos(closestBuilding.rotation) * offsetDistance;
            
            const exitPosition = new THREE.Vector3(
                closestBuilding.position.x + offsetX,
                0,
                closestBuilding.position.z + offsetZ
            );
            
            farmer.position.copy(exitPosition);
            // Ensure character is visible when exiting room
            farmer.visible = true;
            farmer.position.y = 0;
            // Exited room to building front (log removed)
        } else {
            // Fallback to entry point if building not found
            farmer.position.copy(roomData.entryPoint);
            farmer.position.y = 0;
            // Ensure character is visible when exiting room
            farmer.visible = true;
            // Exited room to entry point (log removed)
        }
    }
    
    const previousRoomId = currentRoomId;
    currentRoomId = null;
    
    // Enter city scene after exiting room
    enterCityScene();
    
    // Exited room (log removed)
}

// Function to constrain character within room boundaries
function constrainCharacterInRoom(): void {
    // Only constrain if in a room
    if (currentRoomId === null || !farmer) {
        return;
    }
    
    const roomData = rooms.get(currentRoomId);
    if (!roomData) return;
    
    // Get the room's actual size from the room group (room is centered at origin)
    const roomBox = new THREE.Box3().setFromObject(roomData.roomGroup);
    const roomSize = roomBox.getSize(new THREE.Vector3());
    
    // Get character's bounding box to account for character size
    const characterBox = new THREE.Box3().setFromObject(farmer);
    const characterSize = characterBox.getSize(new THREE.Vector3());
    
    // Calculate room boundaries (with margin to account for character size)
    // Use character's radius (half of largest horizontal dimension) as margin
    const characterRadius = Math.max(characterSize.x, characterSize.z) / 2;
    const margin = characterRadius + 1.5; // Increased buffer to prevent going through walls
    const halfSizeX = roomSize.x / 2;
    const halfSizeZ = roomSize.z / 2;
    const minX = -halfSizeX + margin;
    const maxX = halfSizeX - margin;
    const minZ = -halfSizeZ + margin;
    const maxZ = halfSizeZ - margin;
    
    // Constrain character position
    farmer.position.x = Math.max(minX, Math.min(maxX, farmer.position.x));
    farmer.position.z = Math.max(minZ, Math.min(maxZ, farmer.position.z));
}

// Function to constrain camera within room boundaries
function constrainCameraInRoom(): void {
    // Only constrain if in a room and not in free camera mode
    if (currentRoomId === null || cameraFreeMode) {
        return;
    }
    
    const roomData = rooms.get(currentRoomId);
    if (!roomData) return;
    
    // Get the room's actual size from the room group (room is centered at origin)
    const roomBox = new THREE.Box3().setFromObject(roomData.roomGroup);
    const roomSize = roomBox.getSize(new THREE.Vector3());
    
    // Calculate room boundaries (with a margin to prevent camera from clipping through walls)
    // Rooms are centered at origin, so boundaries are symmetric
    const margin = 3; // Margin to keep camera away from walls
    const halfSizeX = roomSize.x / 2;
    const halfSizeZ = roomSize.z / 2;
    const minX = -halfSizeX + margin;
    const maxX = halfSizeX - margin;
    const minZ = -halfSizeZ + margin;
    const maxZ = halfSizeZ - margin;
    
    // Constrain camera target (what the camera is looking at)
    controls.target.x = Math.max(minX, Math.min(maxX, controls.target.x));
    controls.target.z = Math.max(minZ, Math.min(maxZ, controls.target.z));
    
    // Constrain camera position
    camera.position.x = Math.max(minX, Math.min(maxX, camera.position.x));
    camera.position.z = Math.max(minZ, Math.min(maxZ, camera.position.z));
}

// Function to spawn character in room when both are ready
function spawnCharacterInRoom(roomId: number = 1): void {
    // Check if character is loaded
    if (!farmer) {
        return;
    }
    
    // Check if room exists and is ready
    const roomData = rooms.get(roomId);
    if (!roomData || roomData.roomGroup.name.includes('Placeholder')) {
        return;
    }
    
    // Only spawn if not already in a room
    if (currentRoomId === null) {
        enterRoom(roomId);
        // Character spawned in room (log removed)
    }
}

// Function to create a 2D door exit indicator (flat circle on the ground in front of door)
function createDoorExitIndicator(roomId: number, doorLocalPosition?: THREE.Vector3, doorRotation?: number): THREE.Group | null {
    const roomData = rooms.get(roomId);
    if (!roomData) {
        console.error(`[DOOR EXIT INDICATOR] Room ${roomId} data not found`);
        return null;
    }
    
    // Use provided door position/rotation, or find the door in the room group
    let finalDoorPosition = new THREE.Vector3();
    let finalDoorRotation = 0;
    
    if (doorLocalPosition && doorRotation !== undefined) {
        // Use provided local position (relative to room group)
        finalDoorPosition.copy(doorLocalPosition);
        finalDoorRotation = doorRotation;
        // Door exit indicator using provided position (log removed)
    } else {
        // Find the door in the room group to get its actual local position
        let doorFound = false;
        roomData.roomGroup.traverse((child) => {
            if (child.name && child.name.includes(`Room_${roomId}_Door`)) {
                // Get local position (relative to room group)
                finalDoorPosition.copy(child.position);
                finalDoorRotation = child.rotation.y;
                doorFound = true;
                // Door found in room group (log removed)
            }
        });
        
        // If door not found, use default position based on room creation
        if (!doorFound) {
            // Try to find door by checking both possible positions
            // In createRoom: door is at (-1.5, 0, 19.55)
            // In addDoorsToExistingRooms: door is at (0, 0, 5)
            finalDoorPosition.set(0, 0, 5); // Default to the addDoorsToExistingRooms position
            finalDoorRotation = Math.PI; // Door faces north
            console.warn(`[DOOR EXIT INDICATOR] Door not found in room group, using default position (0, 0, 5)`);
        }
    }
    
    const indicatorGroup = new THREE.Group();
    indicatorGroup.name = `DoorExitIndicator_${roomId}`;
    
    // Create a 2D circle using a plane geometry
    const radius = 3; // Radius of the indicator circle
    const segments = 32;
    const geometry = new THREE.CircleGeometry(radius, segments);
    
    // Create material with blue color and transparency (different from entrance indicator)
    const material = new THREE.MeshStandardMaterial({
        color: 0x0088ff, // Blue color
        emissive: 0x0088ff,
        emissiveIntensity: 0.5, // Increased for better visibility
        transparent: true,
        opacity: 0.8, // Increased opacity for better visibility
        side: THREE.DoubleSide,
        depthWrite: false // Prevent z-fighting issues
    });
    
    const circle = new THREE.Mesh(geometry, material);
    circle.rotation.x = -Math.PI / 2; // Rotate to lie flat on the ground
    circle.position.y = 0.1; // Slightly above ground to avoid z-fighting
    circle.castShadow = false;
    circle.receiveShadow = false;
    indicatorGroup.add(circle);
    
    // Add an outer ring for better visibility
    const ringGeometry = new THREE.RingGeometry(radius * 0.8, radius, segments);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x0088ff,
        emissive: 0x0088ff,
        emissiveIntensity: 0.7, // Increased for better visibility
        transparent: true,
        opacity: 0.9, // Increased opacity for better visibility
        side: THREE.DoubleSide,
        depthWrite: false // Prevent z-fighting issues
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.11;
    ring.castShadow = false;
    ring.receiveShadow = false;
    indicatorGroup.add(ring);
    
    // Position indicator in front of door (where player exits)
    // Door is on north wall, rotation.y = Math.PI means door faces south (into room)
    // When exiting, player goes north (positive Z direction) through the door
    // So we need to place indicator on the north side (positive Z) of the door
    const offsetDistance = 2; // Distance in front of door
    // Negate the rotation to get the exit direction (opposite of door's facing direction)
    const exitDirection = finalDoorRotation + Math.PI; // Add 180 degrees to get exit direction
    const offsetX = Math.sin(exitDirection) * offsetDistance;
    const offsetZ = Math.cos(exitDirection) * offsetDistance;
    
    // Calculate indicator position based on door position and exit direction
    // Use only the calculated offset (no hardcoded adjustments) to work for both door positions
    // Move indicator 1.5 units south (negative Z direction)
    // Move indicator 0.7 units east (positive X direction)
    const indicatorPosition = new THREE.Vector3(
        finalDoorPosition.x + offsetX + 1.3, // Moved 1.3 units east
        0.3, // Raised slightly above ground
        finalDoorPosition.z + offsetZ - 1.5 // Moved 1.5 units south
    );
    
    // Door exit indicator offset calculated (log removed)
    
    indicatorGroup.position.copy(indicatorPosition);
    
    // Store indicator position and radius in room data
    roomData.doorExitIndicatorPosition = indicatorPosition;
    roomData.doorExitIndicatorRadius = radius;
    // Door exit indicator created (log removed)
    console.log(`  Door position: (${finalDoorPosition.x.toFixed(2)}, ${finalDoorPosition.y.toFixed(2)}, ${finalDoorPosition.z.toFixed(2)}), Door rotation: ${finalDoorRotation.toFixed(2)}`);
    
    // Store reference for animation
    (indicatorGroup as any).pulseSpeed = 0.002;
    (indicatorGroup as any).baseOpacity = 0.6;
    
    return indicatorGroup;
}

// Function to create a 2D entrance indicator (flat circle on the ground)
function createEntranceIndicator(position: THREE.Vector3, rotation: number, roomId: number): THREE.Group {
    const indicatorGroup = new THREE.Group();
    indicatorGroup.name = `EntranceIndicator_${roomId}`;
    
    // Create a 2D circle using a plane geometry
    const radius = 3; // Radius of the indicator circle
    const segments = 32;
    const geometry = new THREE.CircleGeometry(radius, segments);
    
    // Create material with green color and transparency
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00, // Green color
        emissive: 0x00ff00,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    
    const circle = new THREE.Mesh(geometry, material);
    circle.rotation.x = -Math.PI / 2; // Rotate to lie flat on the ground
    circle.position.y = 0.1; // Slightly above ground to avoid z-fighting
    circle.castShadow = false;
    circle.receiveShadow = false;
    indicatorGroup.add(circle);
    
    // Add an outer ring for better visibility
    const ringGeometry = new THREE.RingGeometry(radius * 0.8, radius, segments);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.11;
    ring.castShadow = false;
    ring.receiveShadow = false;
    indicatorGroup.add(ring);
    
    // Add text label (optional - using a simple plane with emissive material)
    const textGeometry = new THREE.PlaneGeometry(radius * 1.5, radius * 0.5);
    const textMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    const textPlane = new THREE.Mesh(textGeometry, textMaterial);
    textPlane.rotation.x = -Math.PI / 2;
    textPlane.position.y = 0.12;
    textPlane.castShadow = false;
    textPlane.receiveShadow = false;
    indicatorGroup.add(textPlane);
    
    // Position indicator in front of building
    // Calculate position based on building rotation (front of building)
    // Use ground level (Y=0) for indicator position
    const offsetDistance = 8; // Distance in front of building
    const offsetX = Math.sin(rotation) * offsetDistance;
    const offsetZ = Math.cos(rotation) * offsetDistance;
    
    const indicatorPosition = new THREE.Vector3(
        position.x + offsetX,
        0, // Ground level
        position.z + offsetZ
    );
    
    indicatorGroup.position.copy(indicatorPosition);
    
    // Store indicator position and radius in room data
    // Ensure room data exists (create placeholder if it doesn't - room group will be created later)
    let roomData = rooms.get(roomId);
    if (!roomData) {
        // Room data doesn't exist yet, create placeholder (room group will be created when models load)
        console.log(`Room ${roomId} data not found, creating placeholder...`);
        const placeholderGroup = new THREE.Group();
        placeholderGroup.name = `Room_${roomId}_Placeholder`;
        placeholderGroup.visible = false;
        
        roomData = {
            id: roomId,
            roomGroup: placeholderGroup, // Will be replaced when actual room is created
            entryPoint: new THREE.Vector3(),
            exitPoint: new THREE.Vector3(0, 0, -6),
            buildingPosition: new THREE.Vector3()
        };
        rooms.set(roomId, roomData);
    }
    
    // Store indicator position and radius
    roomData.indicatorPosition = indicatorPosition;
    roomData.indicatorRadius = radius;
    console.log(`Entrance indicator created for Room ${roomId} at position (${indicatorPosition.x.toFixed(2)}, ${indicatorPosition.y.toFixed(2)}, ${indicatorPosition.z.toFixed(2)}) with radius ${radius}`);
    
    // Store reference for animation
    (indicatorGroup as any).pulseSpeed = 0.002;
    (indicatorGroup as any).baseOpacity = 0.6;
    
    return indicatorGroup;
}

// Function to animate entrance indicators
function animateEntranceIndicators(): void {
    mainMapGroup.children.forEach((child) => {
        if (child.name.startsWith('EntranceIndicator_')) {
            const indicator = child as any;
            if (indicator.pulseSpeed !== undefined) {
                // Pulse opacity animation
                const pulse = Math.sin(Date.now() * indicator.pulseSpeed) * 0.2 + 1;
                const opacity = indicator.baseOpacity * pulse;
                
                indicator.children.forEach((subChild: THREE.Mesh) => {
                    if (subChild.material && (subChild.material as THREE.MeshStandardMaterial).opacity !== undefined) {
                        (subChild.material as THREE.MeshStandardMaterial).opacity = opacity;
                    }
                });
            }
        }
    });
}

// Function to animate door exit indicators
function animateDoorExitIndicators(): void {
    // Only animate indicators for rooms that are currently in the scene (for performance)
    rooms.forEach((roomData) => {
        if (scene.children.includes(roomData.roomGroup) && roomData.roomGroup.visible) {
            roomData.roomGroup.children.forEach((child) => {
                if (child.name.startsWith('DoorExitIndicator_')) {
                    const indicator = child as any;
                    if (indicator.pulseSpeed !== undefined) {
                        // Pulse opacity animation
                        const pulse = Math.sin(Date.now() * indicator.pulseSpeed) * 0.2 + 1;
                        const opacity = indicator.baseOpacity * pulse;
                        
                        indicator.children.forEach((subChild: THREE.Mesh) => {
                            if (subChild.material && (subChild.material as THREE.MeshStandardMaterial).opacity !== undefined) {
                                (subChild.material as THREE.MeshStandardMaterial).opacity = opacity;
                            }
                        });
                    }
                }
            });
        }
    });
}

// Track if E key was just pressed (to prevent continuous triggering)
let eKeyJustPressed = false;

// Function to check if player is on entrance indicator and wants to enter
function checkBuildingEntrance(): void {
    if (!farmer || currentRoomId !== null) return; // Only check when in main map
    
    // Check if E key is pressed (only trigger once per key press)
    if (keys['e'] && !eKeyJustPressed) {
        eKeyJustPressed = true;
        
        console.log(`Checking entrance - Total rooms: ${rooms.size}`);
        for (const [roomId, roomData] of rooms.entries()) {
            console.log(`Room ${roomId} data:`, {
                hasIndicatorPosition: !!roomData.indicatorPosition,
                hasIndicatorRadius: !!roomData.indicatorRadius,
                indicatorPosition: roomData.indicatorPosition,
                indicatorRadius: roomData.indicatorRadius
            });
            
            if (!roomData.indicatorPosition || !roomData.indicatorRadius) {
                console.log(`Room ${roomId}: Missing indicator data - Position: ${!!roomData.indicatorPosition}, Radius: ${!!roomData.indicatorRadius}`);
                continue;
            }
            
            // Check if player is within the indicator circle (2D check on XZ plane)
            const playerX = farmer.position.x;
            const playerZ = farmer.position.z;
            const indicatorX = roomData.indicatorPosition.x;
            const indicatorZ = roomData.indicatorPosition.z;
            
            const distance = Math.sqrt(
                Math.pow(playerX - indicatorX, 2) + Math.pow(playerZ - indicatorZ, 2)
            );
            
            console.log(`Checking Room ${roomId}: Player at (${playerX.toFixed(2)}, ${playerZ.toFixed(2)}), Indicator at (${indicatorX.toFixed(2)}, ${indicatorZ.toFixed(2)}), Distance: ${distance.toFixed(2)}, Radius: ${roomData.indicatorRadius}`);
            
            // Check if player is within the indicator radius
            if (distance <= roomData.indicatorRadius) {
                console.log(`Entering Room ${roomId}`);
                enterRoom(roomId);
                keys['e'] = false;
                return;
            }
        }
    } else if (!keys['e']) {
        // Reset flag when E key is released
        eKeyJustPressed = false;
    }
}

// Function to check if player wants to exit room (press E key when in door exit circle)
function checkRoomExit(): void {
    if (!farmer || currentRoomId === null) return;
    
    const roomData = rooms.get(currentRoomId);
    if (!roomData) return;
    
    // Find the door exit indicator in the room group and get its current world position
    let indicatorPosition = new THREE.Vector3();
    let indicatorRadius = 3; // Default radius
    let indicatorFound = false;
    
    roomData.roomGroup.traverse((child) => {
        if (child.name && child.name.includes(`DoorExitIndicator_${currentRoomId}`)) {
            // Update world matrix to get accurate position
            child.updateMatrixWorld(true);
            child.getWorldPosition(indicatorPosition);
            indicatorFound = true;
            // Get radius from room data if available, otherwise use default
            if (roomData.doorExitIndicatorRadius) {
                indicatorRadius = roomData.doorExitIndicatorRadius;
            }
        }
    });
    
    if (!indicatorFound) {
        // Fallback to stored position if indicator not found in scene
        // Convert local position to world position since room group may be positioned
        if (roomData.doorExitIndicatorPosition) {
            // Get world position by transforming local position through room group's world matrix
            roomData.roomGroup.updateMatrixWorld(true);
            indicatorPosition.copy(roomData.doorExitIndicatorPosition);
            indicatorPosition.applyMatrix4(roomData.roomGroup.matrixWorld);
            indicatorRadius = roomData.doorExitIndicatorRadius || 3;
        } else {
            if (keys['e']) {
                // Exit indicator not found (log removed)
            }
            return;
        }
    }
    
    // Check if player is within the door exit indicator circle (2D check on XZ plane)
    const playerX = farmer.position.x;
    const playerZ = farmer.position.z;
    const indicatorX = indicatorPosition.x;
    const indicatorZ = indicatorPosition.z;
    
    const distance = Math.sqrt(
        Math.pow(playerX - indicatorX, 2) + Math.pow(playerZ - indicatorZ, 2)
    );
    
    // Debug logging when E key is pressed
    if (keys['e']) {
        // Exit check (log removed)
    }
    
    // Check if player is within the indicator radius and E key is pressed (only trigger once per key press)
    if (distance <= indicatorRadius && keys['e'] && !eKeyJustPressed) {
        // Exiting room (log removed)
        eKeyJustPressed = true;
        exitRoom();
        // Prevent E key from triggering export
        keys['e'] = false;
    } else if (!keys['e']) {
        // Reset flag when E key is released
        eKeyJustPressed = false;
    }
}

// Function to check if player wants to interact with a grow slot (press E key when near indicator)
function checkGrowSlotInteraction(): void {
    if (!farmer || currentRoomId === null) return;
    
    // Get the appropriate indicator manager
    const manager = currentRoomId === 1 ? growSlotIndicatorManagerA : growSlotIndicatorManagerB;
    
    if (!manager.isInitialized) {
        return;
    }
    
    // Check proximity to any indicator
    const playerPosition = farmer.position.clone();
    const slotIndex = manager.checkProximity(playerPosition);
    
    // Check if player is near an indicator and E key is pressed (only trigger once per key press)
    if (slotIndex !== null && keys['e'] && !eKeyJustPressed) {
        eKeyJustPressed = true;
        // Dispatch event to open the planting modal
        const event = new CustomEvent('growSlotPlantingModalOpen', {
            detail: { slotIndex }
        });
        window.dispatchEvent(event);
        // Prevent E key from triggering other actions
        keys['e'] = false;
    } else if (!keys['e']) {
        // Reset flag when E key is released
        eKeyJustPressed = false;
    }
}

// Load Wall.glb
loader.load(
    '/hq/Wall.glb',
    (gltf) => {
        wallModel = gltf.scene;
        console.log('Wall.glb loaded successfully');
        createRoomsIfReady();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading Wall.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading Wall.glb:', error);
    }
);

// Load Wood_floor.glb
loader.load(
    '/hq/Wood_floor.glb',
    (gltf) => {
        floorModel = gltf.scene;
        console.log('Wood_floor.glb loaded successfully');
        createRoomsIfReady();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading Wood_floor.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading Wood_floor.glb:', error);
    }
);

// Load grow_light.glb
loader.load(
    '/hq/grow_light.glb',
    (gltf) => {
        growLightModel = gltf.scene;
        console.log('grow_light.glb loaded successfully');
        createRoomsIfReady();
        // Add grow lights to existing rooms if they were created before grow light model loaded
        addGrowLightsToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading grow_light.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading grow_light.glb:', error);
    }
);

// Load pot.glb
loader.load(
    '/hq/pot.glb',
    (gltf) => {
        potModel = gltf.scene;
        console.log('pot.glb loaded successfully');
        createRoomsIfReady();
        // Add pots to existing rooms if they were created before pot model loaded
        addPotsToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading pot.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading pot.glb:', error);
    }
);

// Load cannabis.glb
loader.load(
    '/hq/cannabis.glb',
    (gltf) => {
        cannabisModel = gltf.scene;
        console.log('cannabis.glb loaded successfully');
        // Add cannabis to existing pots if they were created before cannabis model loaded
        addCannabisToExistingPots();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading cannabis.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading cannabis.glb:', error);
    }
);

// Load door.glb
loader.load(
    '/hq/Door.glb',
    (gltf) => {
        doorModel = gltf.scene;
        console.log('Door.glb loaded successfully');
        createRoomsIfReady();
        // Add doors to existing rooms if they were created before door model loaded
        addDoorsToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading Door.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading Door.glb:', error);
    }
);

// Load shelf.glb
loader.load(
    '/hq/shelf.glb',
    (gltf) => {
        shelfModel = gltf.scene;
        console.log('shelf.glb loaded successfully');
        createRoomsIfReady();
        // Add shelves to existing rooms if they were created before shelf model loaded
        addShelvesToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading shelf.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading shelf.glb:', error);
    }
);

// Load Fan.glb
loader.load(
    '/hq/Fan.glb',
    (gltf) => {
        fanModel = gltf.scene;
        console.log('Fan.glb loaded successfully');
        createRoomsIfReady();
        // Add fans to existing rooms if they were created before fan model loaded
        addFansToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading Fan.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading Fan.glb:', error);
    }
);

// Load Vent.glb
loader.load(
    '/hq/Vent.glb',
    (gltf) => {
        ventModel = gltf.scene;
        console.log('Vent.glb loaded successfully');
        createRoomsIfReady();
        // Add vents to existing rooms if they were created before vent model loaded
        addVentsToExistingRooms();
    },
    (progress) => {
        if (progress.total > 0) {
            console.log('Loading Vent.glb progress:', (progress.loaded / progress.total * 100) + '%');
        }
    },
    (error) => {
        console.error('Error loading Vent.glb:', error);
    }
);

// Add axes helper for reference
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Log keyboard shortcuts
console.log('\n=== KEYBOARD SHORTCUTS ===');
console.log('B - Print building positions and areas');
console.log('J - Export building data as JSON (main map only)');
console.log('E - Enter room (stand on indicator and press E) / Exit room (when in room)');
console.log('C - Toggle camera mode (follow/free)');
console.log('Stand on green circle indicators and press E to enter rooms\n');

// Keyboard input handling
window.addEventListener('keydown', (event) => {
    keys[event.key.toLowerCase()] = true;
    // Also track shift key using shiftKey property for reliability
    if (event.shiftKey) {
        keys['shift'] = true;
    }
    
    // Print building info with 'b' key
    if (event.key.toLowerCase() === 'b') {
        buildingTracker.printBuildingInfo();
    }
    
    // Export building data with 'j' key (only when in main map)
    if (event.key.toLowerCase() === 'j' && currentRoomId === null) {
        const jsonData = buildingTracker.exportToJSON();
        console.log('\n=== EXPORTED BUILDING DATA (JSON) ===\n');
        console.log(jsonData);
        // Also copy to clipboard if possible
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonData).then(() => {
                console.log('\n✓ Data copied to clipboard!');
            }).catch(() => {
                console.log('\n⚠ Could not copy to clipboard');
            });
        }
    }
    
    // Toggle camera mode with 'c' key
    if (event.key.toLowerCase() === 'c') {
        cameraFreeMode = !cameraFreeMode;
        
        if (cameraFreeMode) {
            // Enter free camera mode - enable zoom and free movement
            controls.enableZoom = true;
            controls.minDistance = 1;
            controls.maxDistance = 500;
            console.log('Camera mode: FREE (zoom and drag enabled)');
        } else {
            // Return to character follow mode - disable zoom and lock distance
            controls.enableZoom = false;
            controls.minDistance = fixedCameraDistance;
            controls.maxDistance = fixedCameraDistance;
            
            // Smoothly return camera to character position
            if (farmer) {
                const targetPosition = farmer.position.clone();
                targetPosition.y += 2;
                
                // Calculate desired camera position relative to character
                const currentOffset = camera.position.clone().sub(controls.target);
                const desiredOffset = currentOffset.normalize().multiplyScalar(fixedCameraDistance);
                
                // Set target to character position
                controls.target.copy(targetPosition);
                
                // Position camera at fixed distance from character
                camera.position.copy(targetPosition).add(desiredOffset);
                camera.position.y = Math.max(camera.position.y, 5); // Keep camera at reasonable height
                
                controls.update();
            }
            console.log('Camera mode: FOLLOWING CHARACTER');
        }
    }
});

window.addEventListener('keyup', (event) => {
    keys[event.key.toLowerCase()] = false;
    // Also track shift key release - check both the key and shiftKey property
    if (event.key === 'Shift' || event.key === 'ShiftLeft' || event.key === 'ShiftRight') {
        keys['shift'] = false;
    }
    // If shiftKey is false, make sure shift is cleared
    if (!event.shiftKey) {
        keys['shift'] = false;
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();

function animate(): void {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Update animation mixer
    if (mixer) {
        mixer.update(delta);
    }
    
    // Update city scene entities always (even when in room) so remote players are visible
    // The city scene handles pausing internally, but still updates entities for interpolation
    if (cityScene) {
        cityScene.update(delta);
    }
    
    // Animate entrance indicators
    animateEntranceIndicators();
    
    // Animate door exit indicators
    animateDoorExitIndicators();
    
    // Update grow slot indicators (only when in a room)
    if (currentRoomId === 1 && growSlotIndicatorManagerA.isInitialized) {
        growSlotIndicatorManagerA.update(delta);
    } else if (currentRoomId === 2 && growSlotIndicatorManagerB.isInitialized) {
        growSlotIndicatorManagerB.update(delta);
    }
    
    // Handle character movement
    if (farmer) {
        // Camera-relative movement: use camera's forward/right vectors (yaw only, ignore pitch)
        // This ensures W always moves toward the center of the screen, matching player's mental model
        const cameraForward = new THREE.Vector3();
        camera.getWorldDirection(cameraForward);
        
        // Zero out Y component to ignore pitch (looking up/down shouldn't affect movement)
        cameraForward.y = 0;
        cameraForward.normalize();
        
        // Calculate right vector (perpendicular to forward, pointing right)
        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
        
        // Build movement direction from camera-relative input
        const moveDirection = new THREE.Vector3();
        
        // W = forward (toward camera's look direction)
        if (keys['w']) {
            moveDirection.add(cameraForward);
        }
        // S = backward (away from camera's look direction)
        if (keys['s']) {
            moveDirection.sub(cameraForward);
        }
        // A = left (negative right vector)
        if (keys['a']) {
            moveDirection.sub(cameraRight);
        }
        // D = right (positive right vector)
        if (keys['d']) {
            moveDirection.add(cameraRight);
        }
        
        // Normalize movement direction for consistent speed in all directions
        if (moveDirection.length() > 0) {
            moveDirection.normalize();
            
            // Rotate character to face movement direction
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            const currentRotation = farmer.rotation.y;
            
            // Smooth rotation interpolation
            let rotationDiff = targetRotation - currentRotation;
            
            // Handle rotation wrapping (shortest path)
            if (rotationDiff > Math.PI) {
                rotationDiff -= 2 * Math.PI;
            } else if (rotationDiff < -Math.PI) {
                rotationDiff += 2 * Math.PI;
            }
            
            farmer.rotation.y += rotationDiff * rotationSpeed * delta;
            
            // Check if shift is held for running
            const isRunning = keys['shift'];
            const currentSpeed = isRunning ? runSpeed : walkSpeed;
            
            // Move character
            const moveDistance = currentSpeed * delta;
            farmer.position.x += moveDirection.x * moveDistance;
            farmer.position.z += moveDirection.z * moveDistance;
            
            // Keep character on ground
            farmer.position.y = 0;
            
            // Constrain character within room boundaries if in a room
            constrainCharacterInRoom();
            
            // Play appropriate animation based on shift key
            if (isRunning && runAction) {
                // Running - use run animation
                if (!runAction.isRunning()) {
                    if (walkAction && walkAction.isRunning()) {
                        walkAction.fadeOut(0.2);
                    }
                    if (idleAction && idleAction.isRunning()) {
                        idleAction.fadeOut(0.2);
                    }
                    runAction.reset().fadeIn(0.2).play();
                }
            } else if (walkAction) {
                // Walking - use walk animation
                if (!walkAction.isRunning()) {
                    if (runAction && runAction.isRunning()) {
                        runAction.fadeOut(0.2);
                    }
                    if (idleAction && idleAction.isRunning()) {
                        idleAction.fadeOut(0.2);
                    }
                    walkAction.reset().fadeIn(0.2).play();
                }
            }
        } else {
            // No movement - play idle animation
            if (idleAction) {
                if (!idleAction.isRunning()) {
                    if (walkAction && walkAction.isRunning()) {
                        walkAction.fadeOut(0.2);
                    }
                    if (runAction && runAction.isRunning()) {
                        runAction.fadeOut(0.2);
                    }
                    idleAction.reset().fadeIn(0.2).play();
                }
            }
        }
        
        // Update camera target to follow character (only when not in free mode)
        // OrbitControls maintains the camera's relative position (angle and distance) to the target
        // So updating the target makes the camera follow while preserving user's viewing angle and distance
        if (farmer && !cameraFreeMode) {
            const desiredTarget = farmer.position.clone();
            desiredTarget.y += 2; // Look slightly above character's feet (at character's center)
            
            // Smoothly interpolate controls target to follow character
            // The lerp factor is clamped to ensure smooth, frame-rate independent following
            // OrbitControls will automatically maintain the camera's spherical coordinates relative to target
            const lerpFactor = Math.min(cameraFollowSpeed * delta, 1);
            controls.target.lerp(desiredTarget, lerpFactor);
        }
        
        // Check for room entry/exit
        if (currentRoomId === null) {
            // Check if player is entering a building
            checkBuildingEntrance();
        } else {
            // Check if player wants to exit room (check this first, has priority)
            const wasExiting = eKeyJustPressed;
            checkRoomExit();
            // Check if player wants to interact with grow slot (only if exit didn't trigger)
            // Exit check sets eKeyJustPressed to true, so we only check if it's still false
            if (!wasExiting) {
                checkGrowSlotInteraction();
            }
        }
        
        // Constrain camera within room boundaries (only when not in free camera mode)
        constrainCameraInRoom();
    }
    
    controls.update();
    
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

/**
 * Initialize the Three.js scene with authenticated player identity.
 * 
 * Security: This function enforces that identity is set before scene initialization.
 * Identity becomes immutable after this call via identityStore.
 * 
 * @param identity - Authenticated player identity from Privy
 * @param container - HTML element to mount the Three.js canvas
 */
export function initScene(identity: PlayerIdentity, container: HTMLElement): void {
    // Security: Store identity immutably before any game logic
    identityStore.setIdentity(identity);
    
    // Load character model now that identity is available
    // This ensures we have matchId and can determine the correct character
    if (!farmer && !characterLoadAttempted) {
        console.log('[Character] Loading character model with identity available');
        loadCharacterModel();
    }
    
    // Set canvas container
    canvasContainer = container;
    
    // Only append if not already appended (prevent duplicate appends)
    if (!container.contains(renderer.domElement)) {
        container.appendChild(renderer.domElement);
    }
    if (!container.contains(labelRenderer.domElement)) {
        container.appendChild(labelRenderer.domElement);
    }
    
    // Validate identity cannot be modified at runtime
    Object.freeze(identity);
    
    // Check if this is demo mode (demo identities have privyUserId starting with "demo-user")
    const isDemoMode = identity.privyUserId.startsWith('demo-user');
    
    // Initialize city scene early for multiplayer mode to receive presence updates
    // This allows players to see each other even when one is in a room
    if (!isDemoMode && identity.matchId && !cityScene) {
        console.log('[CityScene] Pre-initializing city scene for multiplayer presence');
        cityScene = new CityScene(scene, camera, renderer, mainMapGroup, identity);
        cityScene.initialize(getPlayerState);
        // Don't enter city scene yet - player will spawn in room first
        // But presence client will be connected and receiving updates
    }
    
    // Ensure rooms are created if models are already loaded (important for players joining after models load)
    createRoomsIfReady();
    
    // Set up spawning logic for both demo and multiplayer modes
    const checkAndSpawnInRoom = (roomId: number = 1) => {
        // Only spawn initially, not after player has exited a room
        if (hasInitialSpawned) {
            return true; // Already spawned initially, return true to stop retry loop
        }
        
        // Check if spawn already happened via the direct call in character load callback
        // If player is already in a room, that means spawnCharacterInRoom succeeded earlier
        if (currentRoomId !== null) {
            hasInitialSpawned = true; // Mark that initial spawn has happened
            console.log(`[SPAWN] Player already in room ${currentRoomId} (spawned via direct call)`);
            return true; // Successfully spawned via direct call
        }
        
        // Ensure rooms are created before checking
        createRoomsIfReady();
        
        const hasFarmer = !!farmer;
        const hasRoom = rooms.has(roomId);
        const room = rooms.get(roomId);
        const roomReady = room && !room.roomGroup.name.includes('Placeholder');
        const notInRoom = currentRoomId === null;
        
        console.log(`[SPAWN CHECK] farmer: ${hasFarmer}, room exists: ${hasRoom}, room ready: ${roomReady}, not in room: ${notInRoom}, hasInitialSpawned: ${hasInitialSpawned}`);
        
        if (hasFarmer && hasRoom && roomReady && notInRoom) {
            console.log(`[SPAWN] All conditions met, spawning in room ${roomId}`);
            spawnCharacterInRoom(roomId);
            hasInitialSpawned = true; // Mark that initial spawn has happened
            return true; // Successfully spawned
        }
        return false; // Not ready yet
    };
    
    // For both demo and multiplayer modes, ensure character spawns in room once ready
    if (isDemoMode) {
        // Demo mode detected (log removed)
    } else {
        console.log('Multiplayer mode detected - will spawn in room 1 when ready');
    }
    
    // Try immediately
    if (!checkAndSpawnInRoom(1)) {
        // If not ready, set up a retry mechanism with longer timeout for multiplayer
        let retryCount = 0;
        const maxRetries = 200; // 20 seconds (200 * 100ms) for multiplayer scenarios
        const retryInterval = setInterval(() => {
            retryCount++;
            if (checkAndSpawnInRoom(1)) {
                console.log(`Successfully spawned in room after ${retryCount} retries`);
                clearInterval(retryInterval);
            } else if (retryCount >= maxRetries) {
                console.warn(`Failed to spawn in room after ${maxRetries} retries. Character may spawn on main map.`);
                clearInterval(retryInterval);
            }
        }, 100); // Check every 100ms
    }
    
    // Start animation loop
    animate();
}

// Grow slot planting modal state management
// These functions are used by GrowSlotPlantingModalManager component

/**
 * Get the current state of the grow slot planting modal.
 * Returns null if modal is not open, or an object with slotIndex if open.
 */
export function getGrowSlotPlantingModalState(): { slotIndex: number } | null {
    // This function is kept for compatibility but the modal manager uses events
    // The actual state is managed by the React component via events
    return null;
}

/**
 * Close the grow slot planting modal by dispatching a close event.
 */
export function closeGrowSlotPlantingModal(): void {
    const event = new CustomEvent('growSlotPlantingModalClose');
    window.dispatchEvent(event);
}

/**
 * Get the current room ID.
 * @returns Room ID (1 for growRoomA, 2 for growRoomB) or null if not in a room
 */
export function getCurrentRoomId(): number | null {
    return currentRoomId;
}

/**
 * Get the current scene type.
 * @returns Scene type ('city', 'growRoomA', 'growRoomB') or null
 */
export function getCurrentSceneType(): 'city' | 'growRoomA' | 'growRoomB' | null {
    return currentSceneType;
}
