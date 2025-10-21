// ============ GLOBAL VARIABLES ============
const videoElement = document.getElementById('videoInput');
const canvasElement = document.getElementById('canvasOutput');
const canvasCtx = canvasElement.getContext('2d');

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const selectAudioBtn = document.getElementById('selectAudioBtn');
const systemStatus = document.getElementById('systemStatus');
const fatigueValue = document.getElementById('fatigueValue');
const earValueEl = document.getElementById('earValue');
const marValueEl = document.getElementById('marValue');
const headPoseEl = document.getElementById('headPose');
const drowsyTimeEl = document.getElementById('drowsyTime');
const earProgressEl = document.getElementById('earProgress');
const marProgressEl = document.getElementById('marProgress');
const detectionBadge = document.getElementById('detectionBadge');
const alertsList = document.getElementById('alertsList');

// Motion sensors
const sensorBadgeEl = document.getElementById('sensorBadge');
const accelXEl = document.getElementById('accelX');
const accelYEl = document.getElementById('accelY');
const accelZEl = document.getElementById('accelZ');
const totalAccelEl = document.getElementById('totalAccel');
const eventsListEl = document.getElementById('eventsList');

// Interventions
const musicStatus = document.getElementById('musicStatus');
const playMusicBtn = document.getElementById('playMusicBtn');
const pauseMusicBtn = document.getElementById('pauseMusicBtn');
const currentMessage = document.getElementById('currentMessage');
const testMessageBtn = document.getElementById('testMessageBtn');
const lightColor = document.getElementById('lightColor');
const lightStatus = document.getElementById('lightStatus');
const musicAudio = document.getElementById('musicAudio');

// Trip stats
const driveTimeEl = document.getElementById('driveTime');
const safetyScoreEl = document.getElementById('safetyScore');
const interventionCountEl = document.getElementById('interventionCount');

// Settings
const earThresholdInput = document.getElementById('earThreshold');
const marThresholdInput = document.getElementById('marThreshold');
const waitTimeInput = document.getElementById('waitTime');
const soundAlertInput = document.getElementById('soundAlert');
const autoMusicInput = document.getElementById('autoMusic');
const psychMessagesInput = document.getElementById('psychMessages');
const settingsToggle = document.getElementById('settingsToggle');
const settingsCard = document.getElementById('settingsCard');

// Map
const mapElement = document.getElementById('map');
const restStopList = document.getElementById('restStopList');
const findRestStopsBtn = document.getElementById('findRestStops');

// Landmark indices
const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144];

// State
let camera = null;
let faceMesh = null;
let isMonitoring = false;
let drowsyStartTime = null;
let yawnStartTime = null;
let tripStartTime = null;
let alertQueue = [];
let audioContext = null;
let selectedAudioDeviceId = '';
let map = null;
let userLocation = null;
let safetyScore = 100;
let interventionCount = 0;
let fatigueLevel = 0;
let isMusicPlaying = false;
let currentMusicMode = 'normal';

// ============ NEW: Enhanced Alert System ============
let isCurrentlyDrowsy = false;
let isContinuousAlertActive = false;
let continuousAlertInterval = null;
let drowsyDetectionCount = 0;
let distractionAlertCooldown = false;
let lastDistractedTime = 0;
let routingControl = null;
let selectedRestStop = null;
// Time of the last counted drowsy episode (ms)
let lastDrowsyEpisodeTime = 0;

// Motion sensor state
let accelerometer = null;
let gyroscope = null;
let motionEventQueue = [];
let isSensorSimulated = false;

// Psychological messages
const messages = {
    family: [
        "Dad, we're waiting for you at home. Drive safe! 💙",
        "Your family loves you. Please drive carefully.",
        "Kids miss you! Come home safely.",
        "We're proud of you. Stay alert and focused."
    ],
    motivational: [
        "You're doing great! Just a little bit further.",
        "Stay focused - you've got this!",
        "Almost there! Keep your concentration high.",
        "Every safe mile counts. You're a pro!"
    ],
    warning: [
        "Please take a break. Your safety matters most.",
        "Rest stop ahead - consider taking a short break.",
        "Fatigue detected. Pull over when safe.",
        "Your reaction time is decreasing. Time to rest."
    ],
    safety: [
        "15 drivers achieved perfect safety scores today. You're on track!",
        "Your safety record is excellent. Keep it up!",
        "Safe driving saves lives. You're making a difference.",
        "Top drivers take breaks. Be like them."
    ]
};

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    setupEventListeners();
    updateStatus('Ready', 'safe');
});

// ============ EVENT LISTENERS ============

function setupEventListeners() {
    startBtn.addEventListener('click', startMonitoring);
    stopBtn.addEventListener('click', stopMonitoring);
    selectAudioBtn.addEventListener('click', selectAudioOutputDevice);
    
    // Music controls
    playMusicBtn.addEventListener('click', () => playMusic({ userInitiated: true }));
    pauseMusicBtn.addEventListener('click', pauseMusic);
    testMessageBtn.addEventListener('click', playTestMessage);
    
    // Settings
    earThresholdInput.addEventListener('input', (e) => {
        document.getElementById('earThresholdValue').textContent = e.target.value;
    });
    marThresholdInput.addEventListener('input', (e) => {
        document.getElementById('marThresholdValue').textContent = e.target.value;
    });
    waitTimeInput.addEventListener('input', (e) => {
        document.getElementById('waitTimeValue').textContent = e.target.value;
    });
    
    settingsToggle.addEventListener('click', () => {
        settingsCard.classList.toggle('collapsed');
    });
    
    // Map
    findRestStopsBtn.addEventListener('click', findNearbyRestStops);
}

// ============ ENHANCED ALERT SYSTEM ============

// Continuous beep for sleeping
function startContinuousAlert() {
    if (isContinuousAlertActive) return;
    
    isContinuousAlertActive = true;
    console.log('🚨 Starting continuous alert');
    // Play continuous beeping sound immediately. If later we determine
    // music should start (3 episodes), checkSleepingEpisodes() will
    // stop this alert and start music.
    continuousAlertInterval = setInterval(() => {
        if (isCurrentlyDrowsy && isMonitoring) {
            playAlertSound(1200, 300, 1); // Loud beep
        } else {
            stopContinuousAlert();
        }
    }, 800); // Beep every 800ms
}

function stopContinuousAlert() {
    if (!isContinuousAlertActive) return;
    
    isContinuousAlertActive = false;
    console.log('✅ Stopping continuous alert');
    
    if (continuousAlertInterval) {
        clearInterval(continuousAlertInterval);
        continuousAlertInterval = null;
    }
}

// Single beep for distraction
function playSingleDistractedBeep() {
    const now = Date.now();
    
    // Cooldown to prevent spam (only once per 3 seconds)
    if (now - lastDistractedTime < 3000) {
        return;
    }
    
    lastDistractedTime = now;
    playAlertSound(800, 200, 1); // Single beep
    addAlert('🎯 Attention! You are distracted - Look at the road!', 'warning');
}

// Progressive intervention after 3 sleeping episodes
function checkSleepingEpisodes() {
    console.log(`Sleeping episodes count: ${drowsyDetectionCount}`);
    
    if (drowsyDetectionCount >= 3 && !isMusicPlaying) {
        // Stop beeping first
        stopContinuousAlert();

        // After 3 sleep episodes, start the music
    addAlert('🎵 Starting energetic music - You\'ve been drowsy 3 times!', 'danger');
    playMusic({ force: true });
        speakMessage('You have shown drowsiness multiple times. Playing energetic music to help you stay alert.');

        // Keep the counter until driver resumes alertness for a while
    }
}

// ============ BLUETOOTH AUDIO ============

async function selectAudioOutputDevice() {
    try {
        if (!navigator.mediaDevices.selectAudioOutput) {
            addAlert('Audio output selection not supported. Use Chrome 110+', 'warning');
            return;
        }
        const device = await navigator.mediaDevices.selectAudioOutput();
        selectedAudioDeviceId = device.deviceId;
        addAlert(`Audio output: ${device.label}`, 'warning');
        
        if (audioContext) {
            await audioContext.setSinkId(selectedAudioDeviceId);
        }
    } catch (error) {
        console.error('Audio selection error:', error);
    }
}

async function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (selectedAudioDeviceId) {
            await audioContext.setSinkId(selectedAudioDeviceId);
        }
    }
}

async function playAlertSound(frequency = 800, duration = 200, count = 1) {
    if (!soundAlertInput.checked) return;
    await initAudio();
    
    for (let i = 0; i < count; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + (i * 0.3);
        const endTime = startTime + duration / 1000;
        
        gainNode.gain.setValueAtTime(0.5, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);
        
        oscillator.start(startTime);
        oscillator.stop(endTime);
    }
}

// ============ MUSIC CONTROL ============

function playMusic(options = {}) {
    // options: { force: boolean, userInitiated: boolean }
    const { force = false, userInitiated = false } = options;

    // Auto-start guard: only allow play when forced (system after 3 episodes) or user-initiated
    if (!force && !userInitiated && drowsyDetectionCount < 3) {
        console.log('playMusic prevented: not forced and not user initiated and drowsy count < 3');
        return;
    }

    musicAudio.play();
    isMusicPlaying = true;
    playMusicBtn.disabled = true;
    pauseMusicBtn.disabled = false;
    updateMusicStatus('Playing energetic music', true);
}

function pauseMusic() {
    musicAudio.pause();
    isMusicPlaying = false;
    playMusicBtn.disabled = false;
    pauseMusicBtn.disabled = true;
    updateMusicStatus('Paused', false);
}

function updateMusicStatus(text, playing) {
    const musicIcon = musicStatus.querySelector('.music-icon');
    const musicText = musicStatus.querySelector('.music-text');
    musicText.textContent = text;
    
    if (playing) {
        musicIcon.classList.add('playing');
    } else {
        musicIcon.classList.remove('playing');
    }
}

function adjustMusicForFatigue(level) {
    if (!autoMusicInput.checked) return;
    
    if (level < 30) {
        currentMusicMode = 'normal';
    } else if (level < 60) {
        // Do not auto-play music. If music is already playing, switch to upbeat mode.
        if (isMusicPlaying && currentMusicMode !== 'upbeat') {
            updateMusicStatus('Playing energetic music', true);
            currentMusicMode = 'upbeat';
        }
    } else if (level < 80) {
        if (isMusicPlaying && currentMusicMode !== 'energetic') {
            musicAudio.volume = 0.8;
            updateMusicStatus('Playing high-energy music', true);
            currentMusicMode = 'energetic';
        }
    } else {
        // At very high fatigue we prefer stopping music (it may be distracting)
        if (isMusicPlaying) {
            pauseMusic();
            updateMusicStatus('Music paused - High fatigue!', false);
        }
        currentMusicMode = 'critical';
    }
}

// ============ PSYCHOLOGICAL MESSAGES ============

function playTestMessage() {
    const message = messages.motivational[Math.floor(Math.random() * messages.motivational.length)];
    speakMessage(message);
}

function speakMessage(text) {
    if (!psychMessagesInput.checked) return;
    
    currentMessage.textContent = text;
    
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        speechSynthesis.speak(utterance);
    }
    
    setTimeout(() => {
        currentMessage.textContent = 'Ready to assist when needed';
    }, 5000);
}

function triggerPsychologicalIntervention(fatigueLevel) {
    if (fatigueLevel > 70 && !alertQueue.includes('psych_message')) {
        let messageType = 'warning';
        
        if (fatigueLevel > 85) {
            messageType = 'family';
        } else if (fatigueLevel > 75) {
            messageType = 'safety';
        }
        
        const messageArray = messages[messageType];
        const message = messageArray[Math.floor(Math.random() * messageArray.length)];
        speakMessage(message);
        
        alertQueue.push('psych_message');
        setTimeout(() => {
            alertQueue = alertQueue.filter(a => a !== 'psych_message');
        }, 30000);
    }
}

// ============ LIGHTING CONTROL ============

function updateLighting(status) {
    if (status === 'safe') {
        lightColor.style.background = 'var(--success)';
        lightColor.classList.remove('warning', 'danger');
        lightStatus.textContent = 'Normal - Safe Driving';
    } else if (status === 'warning') {
        lightColor.style.background = 'var(--warning)';
        lightColor.classList.add('warning');
        lightColor.classList.remove('danger');
        lightStatus.textContent = 'Caution - Stay Alert';
    } else if (status === 'danger') {
        lightColor.style.background = 'var(--danger)';
        lightColor.classList.add('danger');
        lightColor.classList.remove('warning');
        lightStatus.textContent = 'Danger - Pull Over!';
    }
}

// ============ ENHANCED MAP WITH ROUTING ============

function initializeMap() {
    map = L.map('map').setView([28.7041, 77.1025], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function findNearbyRestStops() {
    if (!navigator.geolocation) {
        addAlert('Geolocation not supported', 'warning');
        return;
    }
    
    navigator.geolocation.getCurrentPosition((position) => {
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        map.setView([userLocation.lat, userLocation.lng], 13);
        
        // Clear previous markers and routes
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });
        
        // Add user marker with custom icon
        const userIcon = L.divIcon({
            className: 'user-marker',
            html: '<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
            iconSize: [20, 20]
        });
        
        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
            .addTo(map)
            .bindPopup('<b>📍 Your Location</b>')
            .openPopup();
        
        // Generate nearby rest stops
        const simulatedStops = generateSimulatedRestStops(userLocation);
        displayRestStops(simulatedStops);
        
        addAlert('✅ Found nearby rest stops with directions', 'warning');
    }, (error) => {
        addAlert('❌ Location access denied', 'warning');
    });
}

function generateSimulatedRestStops(location) {
    const stops = [];
    const names = ['Highway Dhaba ☕', 'Comfort Inn 🏨', 'Fuel Plaza ⛽', 'Traveler\'s Rest 🛏️', 'Quick Stop 🍔'];
    const types = ['dhaba', 'hotel', 'fuel', 'hotel', 'restaurant'];
    
    for (let i = 0; i < 5; i++) {
        const latOffset = (Math.random() - 0.5) * 0.1;
        const lngOffset = (Math.random() - 0.5) * 0.1;
        const distance = (Math.random() * 10 + 1).toFixed(1);
        
        stops.push({
            name: names[i],
            type: types[i],
            lat: location.lat + latOffset,
            lng: location.lng + lngOffset,
            distance: distance
        });
    }
    
    return stops;
}

function displayRestStops(stops) {
    restStopList.innerHTML = '';
    
    stops.forEach((stop, index) => {
        // Add custom marker to map
        const markerIcon = L.divIcon({
            className: 'rest-stop-marker',
            html: `<div style="background: #667eea; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">${stop.name}</div>`,
            iconSize: [100, 30]
        });
        
        const marker = L.marker([stop.lat, stop.lng], { icon: markerIcon })
            .addTo(map)
            .bindPopup(`<b>${stop.name}</b><br>📍 ${stop.distance} km away<br><button onclick="showRoute(${stop.lat}, ${stop.lng}, '${stop.name}')" style="margin-top: 5px; padding: 5px 10px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">📍 Show Route</button>`);
        
        // Add to list
        const item = document.createElement('div');
        item.className = 'rest-stop-item';
        item.innerHTML = `
            <div class="rest-stop-name">${stop.name}</div>
            <div class="rest-stop-distance">📍 ${stop.distance} km away</div>
        `;
        
        item.addEventListener('click', () => {
            map.setView([stop.lat, stop.lng], 15);
            marker.openPopup();
            showRoute(stop.lat, stop.lng, stop.name);
        });
        
        restStopList.appendChild(item);
    });
}

// ============ ROUTING FUNCTIONALITY ============

function showRoute(destLat, destLng, name) {
    if (!userLocation) {
        addAlert('❌ User location not available', 'warning');
        return;
    }
    
    // Remove previous route
    if (routingControl) {
        map.removeLayer(routingControl);
    }
    
    // Draw route line
    const routeLine = L.polyline([
        [userLocation.lat, userLocation.lng],
        [destLat, destLng]
    ], {
        color: '#667eea',
        weight: 5,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(map);
    
    routingControl = routeLine;
    
    // Calculate distance
    const distance = calculateDistance(userLocation.lat, userLocation.lng, destLat, destLng);
    
    // Fit bounds to show entire route
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    
    // Add direction arrow at midpoint
    const midLat = (userLocation.lat + destLat) / 2;
    const midLng = (userLocation.lng + destLng) / 2;
    
    const arrow = L.marker([midLat, midLng], {
        icon: L.divIcon({
            className: 'direction-arrow',
            html: '<div style="color: #667eea; font-size: 30px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">➤</div>',
            iconSize: [30, 30]
        })
    }).addTo(map);
    
    // Show turn-by-turn instructions
    const instructions = generateTurnInstructions(distance, name);
    showTurnInstructions(instructions);
    
    addAlert(`🗺️ Route to ${name} (${distance} km)`, 'warning');
    speakMessage(`Route calculated to ${name}. Distance is ${distance} kilometers. Follow the blue path on the map.`);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
}

function generateTurnInstructions(distance, destination) {
    // Simulated turn-by-turn instructions
    return [
        `🚗 Head towards ${destination}`,
        `📍 Continue for ${(distance * 0.4).toFixed(1)} km`,
        `↗️ Turn slight right`,
        `📍 Continue for ${(distance * 0.3).toFixed(1)} km`,
        `➡️ Turn right`,
        `📍 Continue for ${(distance * 0.2).toFixed(1)} km`,
        `✅ Arrive at ${destination}`
    ];
}

function showTurnInstructions(instructions) {
    // Create popup with instructions
    let instructionHTML = '<div style="max-height: 200px; overflow-y: auto;">';
    instructionHTML += '<h4 style="margin: 0 0 10px 0;">🗺️ Directions</h4>';
    instructions.forEach((instruction, index) => {
        instructionHTML += `<p style="margin: 5px 0; font-size: 13px;">${index + 1}. ${instruction}</p>`;
    });
    instructionHTML += '</div>';
    
    L.popup()
        .setLatLng(map.getCenter())
        .setContent(instructionHTML)
        .openOn(map);
}

// Make showRoute globally accessible for popup button
window.showRoute = showRoute;

// ============ MOTION SENSORS ============

async function initMotionSensors() {
    console.log('Initializing motion sensors...');
    
    if ('Accelerometer' in window && 'Gyroscope' in window) {
        try {
            accelerometer = new Accelerometer({ frequency: 60 });
            accelerometer.addEventListener('reading', handleAccelerometerReading);
            accelerometer.addEventListener('error', () => initSimulatedSensors());
            
            gyroscope = new Gyroscope({ frequency: 60 });
            gyroscope.addEventListener('reading', handleGyroscopeReading);
            
            accelerometer.start();
            gyroscope.start();
            
            sensorBadgeEl.textContent = '✅ Real Sensors Active';
            sensorBadgeEl.className = 'sensor-badge active';
        } catch (error) {
            initDeviceMotionFallback();
        }
    } else {
        initDeviceMotionFallback();
    }
}

function initDeviceMotionFallback() {
    if (window.DeviceMotionEvent) {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion);
                        sensorBadgeEl.textContent = '✅ Sensors Active';
                        sensorBadgeEl.className = 'sensor-badge active';
                    } else {
                        initSimulatedSensors();
                    }
                })
                .catch(() => initSimulatedSensors());
        } else {
            window.addEventListener('devicemotion', handleDeviceMotion);
            sensorBadgeEl.textContent = '✅ Sensors Active';
            sensorBadgeEl.className = 'sensor-badge active';
        }
    } else {
        initSimulatedSensors();
    }
}

function initSimulatedSensors() {
    isSensorSimulated = true;
    sensorBadgeEl.textContent = '⚠️ Simulated (Demo)';
    sensorBadgeEl.className = 'sensor-badge simulated';
    
    let time = 0;
    setInterval(() => {
        if (!isMonitoring) return;
        
        time += 0.1;
        const accelX = Math.sin(time * 0.5) * 2 + (Math.random() < 0.02 ? 18 : 0);
        const accelY = Math.sin(time * 0.3) * 1.5;
        const accelZ = 9.8 + Math.sin(time * 0.2) * 0.5;
        const gyroX = Math.sin(time * 0.4) * 0.3;
        const gyroY = Math.sin(time * 0.6) * 0.2;
        const gyroZ = Math.cos(time * 0.5) * 0.4 + (Math.random() < 0.01 ? 3 : 0);
        
        updateMotionUI({ accelX, accelY, accelZ, gyroX, gyroY, gyroZ });
        detectMotionEvents({ accelX, accelY, accelZ, gyroX, gyroY, gyroZ });
    }, 100);
}

function handleAccelerometerReading() {
    const data = {
        accelX: accelerometer.x || 0,
        accelY: accelerometer.y || 0,
        accelZ: accelerometer.z || 0,
        gyroX: gyroscope ? (gyroscope.x || 0) : 0,
        gyroY: gyroscope ? (gyroscope.y || 0) : 0,
        gyroZ: gyroscope ? (gyroscope.z || 0) : 0
    };
    updateMotionUI(data);
    detectMotionEvents(data);
}

function handleGyroscopeReading() {
    // Combined with accelerometer
}

function handleDeviceMotion(event) {
    const accel = event.accelerationIncludingGravity || event.acceleration || {};
    const gyro = event.rotationRate || {};
    
    const data = {
        accelX: accel.x || 0,
        accelY: accel.y || 0,
        accelZ: accel.z || 0,
        gyroX: gyro.alpha || 0,
        gyroY: gyro.beta || 0,
        gyroZ: gyro.gamma || 0
    };
    updateMotionUI(data);
    detectMotionEvents(data);
}

function updateMotionUI(data) {
    accelXEl.textContent = data.accelX.toFixed(2);
    accelYEl.textContent = data.accelY.toFixed(2);
    accelZEl.textContent = data.accelZ.toFixed(2);
    
    const totalAccel = Math.sqrt(
        data.accelX * data.accelX +
        data.accelY * data.accelY +
        data.accelZ * data.accelZ
    );
    
    totalAccelEl.textContent = totalAccel.toFixed(2) + ' m/s²';
    
    if (totalAccel > 25) {
        totalAccelEl.style.color = 'var(--danger)';
    } else if (totalAccel > 15) {
        totalAccelEl.style.color = 'var(--warning)';
    } else {
        totalAccelEl.style.color = 'var(--success)';
    }
}

function detectMotionEvents(data) {
    const now = Date.now();
    if (motionEventQueue.length > 0 && now - motionEventQueue[motionEventQueue.length - 1].time < 2000) {
        return;
    }
    
    let eventMessage = '';
    let eventType = 'warning';
    
    if (data.accelX > 15) {
        eventMessage = `⚡ Rapid Acceleration (${data.accelX.toFixed(1)} m/s²)`;
        reduceSafetyScore(5);
    } else if (data.accelX < -15) {
        eventMessage = `🛑 Hard Braking (${Math.abs(data.accelX).toFixed(1)} m/s²)`;
        eventType = 'danger';
        reduceSafetyScore(10);
    } else if (Math.abs(data.gyroZ) > 2.5) {
        eventMessage = `↩️ Sharp Turn (${data.gyroZ.toFixed(2)} rad/s)`;
        reduceSafetyScore(5);
    }
    
    if (eventMessage) {
        addMotionEvent(eventMessage, eventType);
        addAlert(eventMessage, eventType);
        interventionCount++;
        updateTripStats();
        motionEventQueue.push({ time: now, message: eventMessage });
        
        if (motionEventQueue.length > 5) {
            motionEventQueue.shift();
        }
    }
}

function addMotionEvent(message, type) {
    const noEvents = eventsListEl.querySelector('.no-events');
    if (noEvents) noEvents.remove();
    
    const item = document.createElement('div');
    item.className = `event-item ${type}`;
    item.textContent = message;
    
    eventsListEl.insertBefore(item, eventsListEl.firstChild);
    
    while (eventsListEl.children.length > 5) {
        eventsListEl.removeChild(eventsListEl.lastChild);
    }
}

// ============ FACE DETECTION ============

function distance(point1, point2) {
    return Math.sqrt(
        Math.pow(point1.x - point2.x, 2) +
        Math.pow(point1.y - point2.y, 2) +
        Math.pow(point1.z - point2.z, 2)
    );
}

function calculateEAR(landmarks, eyeIndices) {
    const points = eyeIndices.map(i => landmarks[i]);
    const v1 = distance(points[1], points[5]);
    const v2 = distance(points[2], points[4]);
    const h = distance(points[0], points[3]);
    return (v1 + v2) / (2.0 * h);
}

function calculateMAR(landmarks) {
    const topLip = landmarks[13];
    const bottomLip = landmarks[14];
    const leftCorner = landmarks[61];
    const rightCorner = landmarks[291];
    const topLip2 = landmarks[312];
    const bottomLip2 = landmarks[311];
    const topLip3 = landmarks[82];
    const bottomLip3 = landmarks[87];
    
    const v1 = distance(topLip, bottomLip);
    const v2 = distance(topLip2, bottomLip2);
    const v3 = distance(topLip3, bottomLip3);
    const h = distance(leftCorner, rightCorner);
    
    return (v1 + v2 + v3) / (3.0 * h);
}

function calculateHeadPose(landmarks) {
    const noseTip = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    
    const eyeCenter = {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2
    };
    
    const horizontalDeviation = Math.abs(noseTip.x - 0.5);
    
    if (horizontalDeviation > 0.15) {
        return horizontalDeviation > 0.2 ? "Looking Away" : "Head Turned";
    }
    
    if (noseTip.y < eyeCenter.y - 0.05) {
        return "Looking Up";
    } else if (noseTip.y > chin.y - 0.1) {
        return "Looking Down";
    }
    
    return "Centered";
}

function onResults(results) {
    if (!isMonitoring) return;
    
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
        const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
        const avgEAR = (leftEAR + rightEAR) / 2.0;
        const mar = calculateMAR(landmarks);
        const headPose = calculateHeadPose(landmarks);
        
        const earThreshold = parseFloat(earThresholdInput.value);
        const marThreshold = parseFloat(marThresholdInput.value);
        const waitTime = parseFloat(waitTimeInput.value);
        
        // Update UI
        earValueEl.textContent = avgEAR.toFixed(3);
        marValueEl.textContent = mar.toFixed(3);
        headPoseEl.textContent = headPose;
        
        // Progress bars
        const earPercent = Math.min((avgEAR / 0.4) * 100, 100);
        earProgressEl.style.width = `${earPercent}%`;
        earProgressEl.className = 'mini-progress-fill';
        
        if (avgEAR < earThreshold) {
            earProgressEl.classList.add('low');
        } else if (avgEAR < earThreshold * 1.2) {
            earProgressEl.classList.add('warning');
        }
        
        const marPercent = Math.min((mar / 1.0) * 100, 100);
        marProgressEl.style.width = `${marPercent}%`;
        marProgressEl.className = 'mini-progress-fill';
        
        if (mar > marThreshold) {
            marProgressEl.classList.add('warning');
        }
        
        // Calculate fatigue level
        let fatigue = 0;
        
        // ============ NEW: ENHANCED DROWSINESS DETECTION ============
        if (avgEAR < earThreshold) {
            if (!drowsyStartTime) {
                drowsyStartTime = Date.now();
            }
            
            const drowsyDuration = (Date.now() - drowsyStartTime) / 1000;
            drowsyTimeEl.textContent = `${drowsyDuration.toFixed(1)}s`;
            
            fatigue += Math.min((drowsyDuration / waitTime) * 40, 40);
            
            if (drowsyDuration >= waitTime) {
                // SLEEPING DETECTED - Start continuous beeping
                if (!isCurrentlyDrowsy) {
                    isCurrentlyDrowsy = true;

                    const now = Date.now();
                    const minEpisodeGap = 4000; // ms - episodes must be at least 4s apart to count

                    if (now - lastDrowsyEpisodeTime > minEpisodeGap) {
                        drowsyDetectionCount++;
                        lastDrowsyEpisodeTime = now;
                        console.log(`🚨 Sleeping detected! Count: ${drowsyDetectionCount}`);
                    } else {
                        console.log('Detected drowsy again quickly; not counting as a new episode');
                    }

                    // Start continuous beep immediately for this detected episode
                    startContinuousAlert(); // Start continuous beep

                    addAlert(`🚨 SLEEPING DETECTED! Wake up immediately! (Episode ${drowsyDetectionCount})`, 'danger');
                    speakMessage('Wake up! You are falling asleep while driving!');

                    // Check if music should start (after 3 counted episodes)
                    checkSleepingEpisodes();
                }
                
                updateStatus('🚨 SLEEPING - WAKE UP!', 'danger');
                updateLighting('danger');
                detectionBadge.querySelector('.badge-text').textContent = 'SLEEPING!';
                detectionBadge.style.background = 'rgba(239, 68, 68, 0.95)';
                
                reduceSafetyScore(2);
                interventionCount++;
            } else {
                updateStatus('Eyes closing...', 'warning');
                updateLighting('warning');
            }
        } else {
            // Eyes are open - stop continuous alert
            if (isCurrentlyDrowsy) {
                isCurrentlyDrowsy = false;
                // Stop beeping immediately when driver looks again
                stopContinuousAlert();
                addAlert('✅ Driver awake again - Good!', 'warning');
                console.log('✅ Driver awake');

                // Start a short timer: if driver remains alert for 30s, reset the drowsy count
                // and stop music if it was playing. If the driver becomes drowsy again within
                // that window the count will continue increasing.
                const recoveryWindow = 30000; // 30 seconds
                const recoveredAt = Date.now();

                setTimeout(() => {
                    // Only reset if driver didn't become drowsy again in the recovery window
                    if (!isCurrentlyDrowsy && Date.now() - recoveredAt >= recoveryWindow) {
                        drowsyDetectionCount = 0;
                        console.log('Reset drowsy count - Driver stayed alert for recovery window');
                        if (isMusicPlaying) {
                            pauseMusic();
                            addAlert('✅ Music stopped - Driver is alert', 'warning');
                        }
                    }
                }, recoveryWindow);
            }
            
            if (drowsyStartTime) {
                drowsyStartTime = null;
                drowsyTimeEl.textContent = '0.0s';
            }
        }
        
        // ============ NEW: DISTRACTION ALERT (Single Beep) ============
        if (headPose !== "Centered") {
            fatigue += 15;
            
            // Play single beep for distraction
            playSingleDistractedBeep();
            
            if (!alertQueue.includes('headpose')) {
                reduceSafetyScore(2);
                alertQueue.push('headpose');
                setTimeout(() => {
                    alertQueue = alertQueue.filter(a => a !== 'headpose');
                }, 3000);
            }
            
            updateStatus(`Distraction: ${headPose}`, 'warning');
            updateLighting('warning');
        } else {
            // Driver looking straight
            if (!isCurrentlyDrowsy) {
                updateStatus('Driver Alert', 'safe');
                updateLighting('safe');
                detectionBadge.querySelector('.badge-text').textContent = 'Monitoring...';
                detectionBadge.style.background = 'rgba(16, 185, 129, 0.9)';
            }
        }
        
        // Yawn detection
        if (mar > marThreshold) {
            if (!yawnStartTime) {
                yawnStartTime = Date.now();
            }
            
            const yawnDuration = (Date.now() - yawnStartTime) / 1000;
            fatigue += 20;
            
            if (yawnDuration >= 1.0 && !alertQueue.includes('yawn')) {
                updateStatus('Yawning detected', 'warning');
                addAlert('😮 Yawning detected! Consider a break.', 'warning');
                playAlertSound(600, 250, 2);
                alertQueue.push('yawn');
                interventionCount++;
                setTimeout(() => {
                    alertQueue = alertQueue.filter(a => a !== 'yawn');
                }, 5000);
            }
        } else {
            yawnStartTime = null;
        }
        
        // Update fatigue level
        fatigueLevel = Math.min(fatigue, 100);
        updateFatigueDisplay(fatigueLevel);
        
        // Trigger interventions
        adjustMusicForFatigue(fatigueLevel);
        triggerPsychologicalIntervention(fatigueLevel);
        
        // Suggest rest stop if critical
        if (fatigueLevel > 80 && !alertQueue.includes('rest_stop')) {
            addAlert('🛑 Critical fatigue! Finding nearby rest stops...', 'danger');
            findNearbyRestStops();
            speakMessage('Your fatigue level is critical. Please find a safe place to rest immediately.');
            alertQueue.push('rest_stop');
            setTimeout(() => {
                alertQueue = alertQueue.filter(a => a !== 'rest_stop');
            }, 60000);
        }
        
        // Draw landmarks
        const drawLandmarks = (indices, color) => {
            indices.forEach(index => {
                const point = landmarks[index];
                canvasCtx.beginPath();
                canvasCtx.arc(
                    point.x * canvasElement.width,
                    point.y * canvasElement.height,
                    3, 0, 2 * Math.PI
                );
                canvasCtx.fillStyle = color;
                canvasCtx.fill();
            });
        };
        
        drawLandmarks(LEFT_EYE_INDICES, avgEAR < earThreshold ? '#ef4444' : '#10b981');
        drawLandmarks(RIGHT_EYE_INDICES, avgEAR < earThreshold ? '#ef4444' : '#10b981');
        
        window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_TESSELATION, {
            color: '#C0C0C070',
            lineWidth: 1
        });
        
        window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_LIPS, {
            color: mar > marThreshold ? '#f59e0b' : '#3b82f6',
            lineWidth: 2
        });
        
    } else {
        updateStatus('No face detected', 'warning');
        detectionBadge.querySelector('.badge-text').textContent = 'No face';
        detectionBadge.style.background = 'rgba(245, 158, 11, 0.9)';
        
        // Stop alerts if no face detected
        if (isCurrentlyDrowsy) {
            isCurrentlyDrowsy = false;
            stopContinuousAlert();
        }
    }
    
    canvasCtx.restore();
    updateTripStats();
}

function updateFatigueDisplay(level) {
    fatigueValue.textContent = `${Math.round(level)}%`;
    
    if (level < 30) {
        fatigueValue.className = 'score-value';
    } else if (level < 60) {
        fatigueValue.className = 'score-value warning';
    } else {
        fatigueValue.className = 'score-value danger';
    }
}

// ============ MONITORING CONTROL ============

async function startMonitoring() {
    try {
        faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        faceMesh.onResults(onResults);
        
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await faceMesh.send({image: videoElement});
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        await initMotionSensors();
        
        isMonitoring = true;
        tripStartTime = Date.now();
        drowsyDetectionCount = 0; // Reset counter
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        updateStatus('Monitoring Active', 'safe');
        updateLighting('safe');
        detectionBadge.querySelector('.badge-text').textContent = 'Monitoring...';
        detectionBadge.style.background = 'rgba(16, 185, 129, 0.9)';
        addAlert('✅ Full system monitoring started!', 'warning');
        
        updateTripTimer();
        
    } catch (error) {
        console.error('Error starting monitoring:', error);
        addAlert('❌ Error accessing camera', 'danger');
    }
}

function stopMonitoring() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    if (faceMesh) {
        faceMesh.close();
        faceMesh = null;
    }
    
    if (accelerometer) accelerometer.stop();
    if (gyroscope) gyroscope.stop();
    window.removeEventListener('devicemotion', handleDeviceMotion);
    
    // Stop continuous alert
    stopContinuousAlert();
    isCurrentlyDrowsy = false;
    
    if (isMusicPlaying) pauseMusic();
    
    isMonitoring = false;
    drowsyStartTime = null;
    yawnStartTime = null;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    updateStatus('System Stopped', 'safe');
    updateLighting('safe');
    addAlert('🛑 Monitoring stopped', 'warning');
    
    const tripDuration = ((Date.now() - tripStartTime) / 1000 / 60).toFixed(1);
    addAlert(`Trip completed: ${tripDuration} min, Safety Score: ${safetyScore}, Sleep Episodes: ${drowsyDetectionCount}`, 'warning');
}

// ============ UTILITIES ============

function updateStatus(text, level) {
    const statusSpan = systemStatus.querySelector('span');
    statusSpan.textContent = text;
    
    const dot = systemStatus.querySelector('.status-dot');
    dot.style.background = 
        level === 'safe' ? 'var(--success)' :
        level === 'warning' ? 'var(--warning)' : 'var(--danger)';
}

function addAlert(message, type) {
    const noAlerts = alertsList.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();
    
    const item = document.createElement('div');
    item.className = `alert-item ${type}`;
    const time = new Date().toLocaleTimeString();
    item.innerHTML = `<strong>${time}</strong> ${message}`;
    
    alertsList.insertBefore(item, alertsList.firstChild);
    
    while (alertsList.children.length > 8) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

function reduceSafetyScore(points) {
    safetyScore = Math.max(0, safetyScore - points);
    updateTripStats();
}

function updateTripStats() {
    safetyScoreEl.textContent = safetyScore;
    safetyScoreEl.className = safetyScore >= 80 ? 'score-highlight' : '';
    safetyScoreEl.style.color = 
        safetyScore >= 80 ? 'var(--success)' :
        safetyScore >= 50 ? 'var(--warning)' : 'var(--danger)';
    
    interventionCountEl.textContent = interventionCount;
}

function updateTripTimer() {
    if (!isMonitoring) return;
    
    const elapsed = Date.now() - tripStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    driveTimeEl.textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    setTimeout(updateTripTimer, 1000);
}

console.log('🚗 DriveSense Enhanced v2.0 - Ready!');
