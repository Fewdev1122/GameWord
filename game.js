import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Audio System ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'win') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'wrong') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'spin') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now); 
        gain.gain.setValueAtTime(0.02, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.03, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    }
}

// --- Data ---
const continentMap = {
    "Thailand": "Asia", "Japan": "Asia", "China": "Asia", "India": "Asia", "Vietnam": "Asia", "South Korea": "Asia", "Indonesia": "Asia", "Philippines": "Asia", "Malaysia": "Asia", "Singapore": "Asia", "Russia": "Asia", "Turkey": "Asia", "Iran": "Asia", "Iraq": "Asia", "Saudi Arabia": "Asia", "Israel": "Asia", "Pakistan": "Asia",
    "United Kingdom": "Europe", "France": "Europe", "Germany": "Europe", "Italy": "Europe", "Spain": "Europe", "Portugal": "Europe", "Netherlands": "Europe", "Belgium": "Europe", "Sweden": "Europe", "Norway": "Europe", "Finland": "Europe", "Denmark": "Europe", "Poland": "Europe", "Ukraine": "Europe", "Greece": "Europe", "Switzerland": "Europe",
    "United States of America": "Americas", "Canada": "Americas", "Mexico": "Americas", "Brazil": "Americas", "Argentina": "Americas", "Chile": "Americas", "Peru": "Americas", "Colombia": "Americas", "Cuba": "Americas",
    "Egypt": "Africa", "South Africa": "Africa", "Nigeria": "Africa", "Kenya": "Africa", "Morocco": "Africa", "Ghana": "Africa", "Ethiopia": "Africa",
    "Australia": "Oceania", "New Zealand": "Oceania", "Fiji": "Oceania"
};
function guessContinent(name, lat, lon) {
    if (continentMap[name]) return continentMap[name];
    if (lat < -10 && lon > 110) return "Oceania"; if (lon < -30) return "Americas";
    if (lat > 35 && lon > -30 && lon < 45) return "Europe"; if (lat < 35 && lon > -20 && lon < 55) return "Africa";
    if (lon > 55) return "Asia"; return "World"; 
}

// --- Variables ---
let allCountriesData = [];
let filteredCountries = [];
let worldGeoJSON = null;
let targetCountry = null;

let selectedHighlighter = []; 
let wrongHighlighter = [];    
let hoverHighlighter = [];    
let resultLine = null;
let targetDot = null;

let score = 0;
let highScore = localStorage.getItem('earthGameHighScore') || 0;
let streak = 0;
let timerInterval = null;
let timeLeft = 60; const MAX_TIME = 60; 
let isGameActive = false;
let currentMode = 'none'; 
let currentContinent = 'World';
let isSpinning = false;
let lastHoveredCountry = null; 

// *** NEW VAR *** : เช็คว่าอยู่หน้า Main Menu ไหม
let isMainMenu = true; 

document.getElementById('high-score-display').textContent = highScore;

window.selectContinent = (region) => startWithContinent(region);

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.002);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const defaultCamPos = new THREE.Vector3(0, 0, 28);
camera.position.copy(defaultCamPos);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 12; controls.maxDistance = 60; controls.zoomSpeed = 0.5;
controls.addEventListener('start', () => renderer.domElement.style.cursor = 'grabbing');
controls.addEventListener('end', () => renderer.domElement.style.cursor = 'crosshair');

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sunLight = new THREE.DirectionalLight(0xffaa00, 1.5);
sunLight.position.set(50, 20, 50); scene.add(sunLight);

// Stars
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(3000 * 3);
for(let i=0; i<9000; i++) starPos[i] = (Math.random()-0.5)*600;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.7, transparent: true, opacity: 0.8})));

const earthGroup = new THREE.Group();
scene.add(earthGroup);
const texLoader = new THREE.TextureLoader();
const earth = new THREE.Mesh(
    new THREE.SphereGeometry(10, 64, 64),
    new THREE.MeshPhongMaterial({
        map: texLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
        bumpMap: texLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png'),
        bumpScale: 0.1, specular: new THREE.Color(0x222222), shininess: 5
    })
);
earthGroup.add(earth);
earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(10.3, 64, 64), new THREE.MeshPhongMaterial({ color: 0xffaa00, transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending })));

// --- Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDownPos = { x: 0, y: 0 };

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#ui-container') || e.target.closest('#zoom-controls')) return;
    mouseDownPos = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', (e) => {
    if (currentMode !== 'clicking' || !isGameActive || isSpinning) return;
    if (e.target.closest('#ui-container') || e.target.closest('#zoom-controls')) return;
    if (Math.sqrt(Math.pow(e.clientX - mouseDownPos.x, 2) + Math.pow(e.clientY - mouseDownPos.y, 2)) < 5) processClick(e.clientX, e.clientY); 
});
window.addEventListener('pointermove', (e) => {
    if (isSpinning || e.target.closest('#ui-container')) { clearHover(); return; }
    processHover(e.clientX, e.clientY); 
});

function processHover(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1; mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);
    if (intersects.length > 0) {
        const point = intersects[0].point;
        const localPoint = earthGroup.worldToLocal(point.clone());
        const latLon = vector3ToLatLon(localPoint.x, localPoint.y, localPoint.z);
        const countryName = findCountryAt(latLon.lat, latLon.lon);
        if (countryName && countryName !== lastHoveredCountry) {
            highlightHoverBorder(countryName); lastHoveredCountry = countryName;
        } else if (!countryName) clearHover();
    } else clearHover();
}

function processClick(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1; mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        const localPoint = earthGroup.worldToLocal(point.clone());
        const latLon = vector3ToLatLon(localPoint.x, localPoint.y, localPoint.z);
        const clickedCountryName = findCountryAt(latLon.lat, latLon.lon);
        
        if (clickedCountryName) {
            clearInterval(timerInterval);
            isGameActive = false;
            
            if (clickedCountryName === targetCountry.name) {
                score += 100; streak++;
                playSound('win');
                document.getElementById('result-text').innerHTML = `<span class="score-plus">CORRECT! 🎉 +100</span>`;
                highlightTargetBorder(targetCountry.name);
            } else {
                score -= 10; streak = 0;
                playSound('wrong');
                document.getElementById('result-text').innerHTML = `<span class="score-minus">WRONG! It was ${targetCountry.name}</span>`;
                drawBorder(clickedCountryName, 0xff0000, 2, 10.06, wrongHighlighter);
                highlightTargetBorder(targetCountry.name);
                const clickedCountryData = allCountriesData.find(c => c.name === clickedCountryName);
                if (clickedCountryData) {
                    const startVec = latLonToVector3(clickedCountryData.lat, clickedCountryData.lon, 10.05);
                    drawResultLine(startVec, targetCountry);
                }
            }

            document.getElementById('score-display').textContent = score;
            document.getElementById('high-score-display').textContent = Math.max(score, highScore);
            localStorage.setItem('earthGameHighScore', Math.max(score, highScore));
            document.getElementById('streak-display').textContent = `🔥 STREAK x${streak}`;
            document.getElementById('streak-display').style.opacity = 1;

            showEndRound();
        } else {
            document.getElementById('result-text').textContent = "That's the ocean! Try clicking land.";
        }
    }
}

// --- Helpers ---
function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180); const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
function vector3ToLatLon(x, y, z) {
    const r = Math.sqrt(x*x + y*y + z*z); const phi = Math.acos(y / r); const theta = Math.atan2(z, -x);
    let lon = (theta * 180 / Math.PI) - 180; if (lon < -180) lon += 360; if (lon > 180) lon -= 360;
    return { lat: 90 - (phi * 180 / Math.PI), lon };
}
function isPointInPoly(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i][1] > lat) != (polygon[j][1] > lat)) && (lon < (polygon[j][0] - polygon[i][0]) * (lat - polygon[i][1]) / (polygon[j][1] - polygon[i][1]) + polygon[i][0])) inside = !inside;
    }
    return inside;
}
function findCountryAt(lat, lon) {
    for (let feature of worldGeoJSON.features) {
        if (feature.geometry.type === "Polygon" && isPointInPoly(lon, lat, feature.geometry.coordinates[0])) return feature.properties.name;
        if (feature.geometry.type === "MultiPolygon") for (let poly of feature.geometry.coordinates) if (isPointInPoly(lon, lat, poly[0])) return feature.properties.name;
    }
    return null;
}
function getCenterOfGeoJson(geometry) {
    let coords = (geometry.type === "Polygon") ? geometry.coordinates[0] : geometry.coordinates.sort((a,b)=>b[0].length-a[0].length)[0][0];
    let minX=180, maxX=-180, minY=90, maxY=-90;
    coords.forEach(c => { if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0]; if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1]; });
    return { lat: (minY+maxY)/2, lon: (minX+maxX)/2 };
}

// --- Visuals ---
function drawAllBaseBorders(data) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 }); 
    data.features.forEach(f => {
        const draw = (c) => { const pts = c.map(p => latLonToVector3(p[1], p[0], 10.02)); earthGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat)); };
        if(f.geometry.type === "Polygon") f.geometry.coordinates.forEach(draw); else f.geometry.coordinates.forEach(m => m.forEach(draw));
    });
}
function drawBorder(countryName, color, thickness, radius, storageArray) {
    const feature = worldGeoJSON.features.find(f => f.properties.name === countryName);
    if(!feature) return;
    const mat = new THREE.LineBasicMaterial({ color: color, linewidth: thickness });
    const draw = (c) => {
        const pts = c.map(p => latLonToVector3(p[1], p[0], radius));
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
        earthGroup.add(line); storageArray.push(line);
    };
    if(feature.geometry.type === "Polygon") feature.geometry.coordinates.forEach(draw); else feature.geometry.coordinates.forEach(m => m.forEach(draw));
}
function highlightTargetBorder(countryName) { selectedHighlighter.forEach(o => earthGroup.remove(o)); selectedHighlighter = []; drawBorder(countryName, 0xffff00, 3, 10.08, selectedHighlighter); }
function highlightHoverBorder(countryName) { clearHover(); drawBorder(countryName, 0x00ffff, 1, 10.05, hoverHighlighter); }
function clearHover() { hoverHighlighter.forEach(o => earthGroup.remove(o)); hoverHighlighter = []; lastHoveredCountry = null; }
function clearVisuals() {
    selectedHighlighter.forEach(o => earthGroup.remove(o)); selectedHighlighter = [];
    wrongHighlighter.forEach(o => earthGroup.remove(o)); wrongHighlighter = [];
    hoverHighlighter.forEach(o => earthGroup.remove(o)); hoverHighlighter = [];
    if(resultLine) earthGroup.remove(resultLine);
    if(targetDot) earthGroup.remove(targetDot);
}

// --- Logic Flow ---
fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
    .then(res => res.json()).then(data => {
        worldGeoJSON = data;
        drawAllBaseBorders(data);
        data.features.forEach(f => {
            const center = getCenterOfGeoJson(f.geometry);
            if (f.properties.name && center) {
                const region = guessContinent(f.properties.name, center.lat, center.lon);
                allCountriesData.push({ name: f.properties.name, lat: center.lat, lon: center.lon, region: region });
            }
        });
        document.getElementById('status-bar').textContent = "SYSTEM READY. SELECT MODULE.";
        document.getElementById('status-bar').style.color = "#00ff88";
        document.getElementById('btn-mode-type').disabled = false;
        document.getElementById('btn-mode-click').disabled = false;
    });

function preSelectMode(mode) {
    initAudio();
    isMainMenu = false; // *** Stop Auto Rotation when mode selected
    currentMode = mode;
    document.getElementById('btn-group').style.display = 'none';
    document.getElementById('continent-selection').style.display = 'grid';
    document.getElementById('result-text').textContent = 'SELECT REGION';
}

function startWithContinent(region) {
    currentContinent = region;
    document.getElementById('continent-badge').style.display = 'block';
    document.getElementById('current-continent-text').textContent = region.toUpperCase();
    document.getElementById('continent-selection').style.display = 'none';
    
    if (region === 'World') filteredCountries = [...allCountriesData];
    else filteredCountries = allCountriesData.filter(c => c.region === region);
    if (filteredCountries.length < 3) filteredCountries = [...allCountriesData]; 
    
    const dl = document.getElementById('country-list'); dl.innerHTML = '';
    filteredCountries.forEach(c => { const opt = document.createElement('option'); opt.value = c.name; dl.appendChild(opt); });

    startGameLogic();
}

function startGameLogic() {
    clearVisuals();
    isSpinning = true; isGameActive = false;
    
    document.getElementById('end-round-controls').style.display = 'none';
    document.getElementById('country-input').style.display = 'none';
    document.getElementById('target-display').style.display = 'none';
    document.getElementById('btn-confirm').style.display = 'none';
    document.getElementById('result-text').textContent = '';
    document.getElementById('country-input').value = '';
    
    targetCountry = filteredCountries[Math.floor(Math.random() * filteredCountries.length)];

    if (currentMode === 'clicking') {
        document.getElementById('target-display').style.display = 'block';
        document.getElementById('result-text').textContent = `SCANNING ${currentContinent.toUpperCase()} REGION...`;
        
        let currentSpeed = 50;  
        const slowDownFactor = 1.15; 
        const maxSpeed = 800;   

        const rouletteLoop = () => {
            let rndName = filteredCountries[Math.floor(Math.random() * filteredCountries.length)].name;
            document.getElementById('target-display').textContent = `❓ ${rndName}`;
            playSound('spin');

            currentSpeed = currentSpeed * slowDownFactor;

            if (currentSpeed < maxSpeed) {
                setTimeout(rouletteLoop, currentSpeed);
            } else {
                isSpinning = false;
                document.getElementById('target-display').textContent = `🎯 ${targetCountry.name}`;
                playSound('click');
                readyToPlay();
            }
        };
        rouletteLoop();

    } else {
        controls.enabled = false; playSound('spin');
        const duration = 2500; const startT = Date.now();
        const startY = earthGroup.rotation.y; const startX = earthGroup.rotation.x;
        let targetY = (-((targetCountry.lon) * Math.PI/180) - Math.PI/2) - (Math.PI * 4); 
        let targetX = (targetCountry.lat * Math.PI/180);
        const startCamPos = camera.position.clone();
        
        (function animateSpin() {
            const p = Math.min((Date.now() - startT)/duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            earthGroup.rotation.y = startY + (targetY - startY) * ease;
            earthGroup.rotation.x = startX + (targetX - startX) * ease;
            camera.position.lerpVectors(startCamPos, defaultCamPos, ease);
            if(p < 1) requestAnimationFrame(animateSpin); else { isSpinning = false; controls.enabled = true; readyToPlay(); }
        })();
    }
}

function readyToPlay() {
    startTimer();
    if (currentMode === 'typing') {
        document.getElementById('result-text').innerHTML = "What country is this?";
        document.getElementById('country-input').style.display = 'inline-block';
        document.getElementById('country-input').focus();
        highlightTargetBorder(targetCountry.name);
    } else {
        document.getElementById('result-text').textContent = "Click the highlighted country!";
        document.getElementById('target-display').style.color = "#ffcc00";
    }
}

function startTimer() {
    timeLeft = MAX_TIME;
    document.getElementById('timer-bar-container').style.display = 'block';
    document.getElementById('timer-bar').style.width = '100%';
    clearInterval(timerInterval);
    isGameActive = true;
    timerInterval = setInterval(() => {
        if(!isGameActive) return;
        timeLeft--;
        document.getElementById('timer-bar').style.width = `${(timeLeft/MAX_TIME)*100}%`;
        if (timeLeft <= 10) playSound('tick');
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            score -= 5; streak = 0;
            playSound('wrong');
            document.getElementById('result-text').innerHTML = `<span class="score-minus">TIME'S UP! ⏳ ${targetCountry.name}</span>`;
            
            highlightTargetBorder(targetCountry.name);
            showEndRound();
        }
    }, 1000);
}

function drawResultLine(startVec3, targetData) {
    const targetVec3 = latLonToVector3(targetData.lat, targetData.lon, 10.05);
    const dotGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    targetDot = new THREE.Mesh(dotGeo, dotMat);
    targetDot.position.copy(targetVec3);
    earthGroup.add(targetDot);
    
    const points = [];
    for(let i=0; i<=20; i++) {
        const p = i/20;
        const v = new THREE.Vector3().lerpVectors(startVec3, targetVec3, p);
        v.normalize().multiplyScalar(10.05 + Math.sin(p*Math.PI)*2);
        points.push(v);
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
    resultLine = new THREE.Line(lineGeo, lineMat);
    earthGroup.add(resultLine);
}

function showEndRound() {
    isGameActive = false;
    document.getElementById('country-input').style.display = 'none';
    document.getElementById('end-round-controls').style.display = 'flex';
    document.getElementById('btn-next').focus();
}

function resetToMenu() {
    isMainMenu = true; // *** Start Auto Rotation again
    clearInterval(timerInterval);
    isGameActive = false;
    isSpinning = false;
    clearVisuals();
    
    document.getElementById('end-round-controls').style.display = 'none';
    document.getElementById('target-display').style.display = 'none';
    document.getElementById('country-input').style.display = 'none';
    document.getElementById('continent-badge').style.display = 'none';
    document.getElementById('timer-bar-container').style.display = 'none';
    
    document.getElementById('continent-selection').style.display = 'none';
    
    document.getElementById('result-text').textContent = '';
    document.getElementById('status-bar').textContent = "SYSTEM READY. SELECT MODULE.";
    controls.reset();
    
    document.getElementById('btn-group').style.display = 'flex';
}

document.getElementById('country-input').addEventListener('keyup', (e) => {
    if(e.key === 'Enter') {
        if(e.target.value.trim().toLowerCase() === targetCountry.name.toLowerCase()) {
            clearInterval(timerInterval); score += 100; streak++;
            document.getElementById('score-display').textContent = score;
            playSound('win');
            document.getElementById('result-text').innerHTML = `<span class="score-plus">CORRECT! 🎉 (+100)</span>`;
            showEndRound();
        } else {
            playSound('wrong');
            document.getElementById('result-text').innerHTML = `<span class="try-again">INCORRECT</span>`; e.target.value = '';
        }
    }
});

document.getElementById('btn-mode-type').addEventListener('click', () => preSelectMode('typing'));
document.getElementById('btn-mode-click').addEventListener('click', () => preSelectMode('clicking'));
document.getElementById('btn-next').addEventListener('click', startGameLogic);
document.getElementById('btn-exit').addEventListener('click', resetToMenu);

document.getElementById('zoom-in').addEventListener('click', () => manualZoom('in'));
document.getElementById('zoom-out').addEventListener('click', () => manualZoom('out'));
function manualZoom(dir) {
        const dist = camera.position.distanceTo(controls.target);
        const targetDist = THREE.MathUtils.clamp(dir === 'in' ? dist - 5 : dist + 5, 12, 60);
        const vec = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(targetDist);
        camera.position.copy(controls.target).add(vec);
}

// *** UPDATED ANIMATION LOOP ***
function animate() { 
    requestAnimationFrame(animate); 
    
    // Auto Rotate if in Main Menu
    if (isMainMenu) {
        earthGroup.rotation.y += 0.001; // Adjust speed (0.001 is slow and nice)
    }

    controls.update(); 
    renderer.render(scene, camera); 
}
animate();

window.addEventListener('resize', () => { camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });