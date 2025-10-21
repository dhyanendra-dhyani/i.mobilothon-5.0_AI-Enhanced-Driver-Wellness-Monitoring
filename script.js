// MediaPipe Face Mesh configuration
const videoElement = document.getElementById('videoInput');
const canvasElement = document.getElementById('canvasOutput');
const canvasCtx = canvasElement.getContext('2d');

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusLight = document.getElementById('statusLight');
const statusText = document.getElementById('statusText');
const earValueEl = document.getElementById('earValue');
const marValueEl = document.getElementById('marValue');
const drowsyTimeEl = document.getElementById('drowsyTime');
const headPoseEl = document.getElementById('headPose');
const alertMessagesEl = document.getElementById('alertMessages');
const earProgressEl = document.getElementById('earProgress');
const marProgressEl = document.getElementById('marProgress');

// Settings
const earThresholdInput = document.getElementById('earThreshold');
const marThresholdInput = document.getElementById('marThreshold');
const waitTimeInput = document.getElementById('waitTime');
const soundAlertInput = document.getElementById('soundAlert');

// Display threshold values
earThresholdInput.addEventListener('input', (e) => {
    document.getElementById('earThresholdValue').textContent = e.target.value;
});
marThresholdInput.addEventListener('input', (e) => {
    document.getElementById('marThresholdValue').textContent = e.target.value;
});
waitTimeInput.addEventListener('input', (e) => {
    document.getElementById('waitTimeValue').textContent = e.target.value;
});

// Eye landmark indices for MediaPipe Face Mesh (468 landmarks)
const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144];

// CORRECTED: Inner mouth landmarks for accurate yawn detection
// Using inner lip points to avoid interference from lip thickness
const INNER_MOUTH_INDICES = [
    78,  // Top inner lip center
    191, // Bottom inner lip center  
    80,  // Top inner lip left
    88,  // Bottom inner lip left
    81,  // Top inner lip right
    95   // Bottom inner lip right
];

// Alternative mapping: [61, 291, 62, 292, 78, 95] for better accuracy
const MOUTH_VERTICAL_1 = [13, 14];   // Upper to lower lip (center)
const MOUTH_VERTICAL_2 = [312, 311]; // Upper to lower lip (left side)
const MOUTH_VERTICAL_3 = [82, 87];   // Upper to lower lip (right side)
const MOUTH_HORIZONTAL = [61, 291];  // Left corner to right corner

// State tracking
let camera = null;
let faceMesh = null;
let isMonitoring = false;
let startTime = null;
let drowsyStartTime = null;
let yawnStartTime = null;
let totalDrowsyTime = 0;
let alertQueue = [];
let audioContext = null;

// Audio setup for alerts
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Play alert sound
function playAlertSound(frequency = 800, duration = 200) {
    if (!soundAlertInput.checked) return;
    
    initAudio();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
}

// Calculate Euclidean distance
function distance(point1, point2) {
    return Math.sqrt(
        Math.pow(point1.x - point2.x, 2) +
        Math.pow(point1.y - point2.y, 2) +
        Math.pow(point1.z - point2.z, 2)
    );
}

// Calculate Eye Aspect Ratio (EAR)
function calculateEAR(landmarks, eyeIndices) {
    const points = eyeIndices.map(i => landmarks[i]);
    
    // Vertical distances
    const v1 = distance(points[1], points[5]);
    const v2 = distance(points[2], points[4]);
    
    // Horizontal distance
    const h = distance(points[0], points[3]);
    
    // EAR formula
    const ear = (v1 + v2) / (2.0 * h);
    return ear;
}

// CORRECTED: Calculate Mouth Aspect Ratio (MAR) for accurate yawn detection
// Using the formula: MAR = (d1 + d2 + d3) / (3 * h)
// where d1, d2, d3 are vertical distances and h is horizontal distance
function calculateMAR(landmarks) {
    // Using inner lip landmarks to eliminate lip thickness interference
    // Points: 13-14 (center vertical), 312-311 (left vertical), 82-87 (right vertical)
    // Horizontal: 61-291 (left corner to right corner)
    
    const topLip = landmarks[13];
    const bottomLip = landmarks[14];
    const leftCorner = landmarks[61];
    const rightCorner = landmarks[291];
    
    // Additional vertical measurements for accuracy
    const topLip2 = landmarks[312];
    const bottomLip2 = landmarks[311];
    const topLip3 = landmarks[82];
    const bottomLip3 = landmarks[87];
    
    // Calculate vertical distances (3 measurements)
    const v1 = distance(topLip, bottomLip);        // Center vertical
    const v2 = distance(topLip2, bottomLip2);      // Left vertical
    const v3 = distance(topLip3, bottomLip3);      // Right vertical
    
    // Calculate horizontal distance
    const h = distance(leftCorner, rightCorner);
    
    // MAR formula: average of 3 vertical distances divided by horizontal distance
    const mar = (v1 + v2 + v3) / (3.0 * h);
    
    return mar;
}

// Calculate head pose (simplified)
function calculateHeadPose(landmarks) {
    // Using nose tip (1) and chin (152) to estimate head tilt
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    // Calculate center between eyes
    const eyeCenter = {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2
    };
    
    // Horizontal deviation from center
    const horizontalDeviation = Math.abs(noseTip.x - 0.5);
    
    if (horizontalDeviation > 0.15) {
        return horizontalDeviation > 0.2 ? "Looking Away" : "Head Turned";
    }
    
    // Vertical check
    if (noseTip.y < eyeCenter.y - 0.05) {
        return "Looking Up";
    } else if (noseTip.y > chin.y - 0.1) {
        return "Looking Down";
    }
    
    return "Centered";
}

// Add alert message
function addAlert(message, type = 'warning') {
    const now = new Date().toLocaleTimeString();
    const alertItem = document.createElement('div');
    alertItem.className = `alert-item ${type}`;
    alertItem.innerHTML = `<strong>${now}:</strong> ${message}`;
    
    // Remove "no alerts" message
    const noAlerts = alertMessagesEl.querySelector('.no-alerts');
    if (noAlerts) {
        noAlerts.remove();
    }
    
    alertMessagesEl.insertBefore(alertItem, alertMessagesEl.firstChild);
    
    // Keep only last 10 alerts
    while (alertMessagesEl.children.length > 10) {
        alertMessagesEl.removeChild(alertMessagesEl.lastChild);
    }
    
    // Play alert sound
    playAlertSound(type === 'danger' ? 1000 : 600, type === 'danger' ? 300 : 200);
}

// Update status
function updateStatus(status, alertLevel = 'safe') {
    statusText.textContent = status;
    statusLight.className = 'status-light';
    
    if (alertLevel === 'warning') {
        statusLight.classList.add('warning');
    } else if (alertLevel === 'danger') {
        statusLight.classList.add('danger');
    }
}

// Process detection results
function onResults(results) {
    if (!isMonitoring) return;
    
    // Clear canvas
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Calculate metrics
        const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
        const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
        const avgEAR = (leftEAR + rightEAR) / 2.0;
        
        const mar = calculateMAR(landmarks);
        const headPose = calculateHeadPose(landmarks);
        
        // Get thresholds
        const earThreshold = parseFloat(earThresholdInput.value);
        const marThreshold = parseFloat(marThresholdInput.value);
        const waitTime = parseFloat(waitTimeInput.value);
        
        // Update UI
        earValueEl.textContent = avgEAR.toFixed(3);
        marValueEl.textContent = mar.toFixed(3);
        headPoseEl.textContent = headPose;
        
        // Update progress bars
        const earPercent = Math.min((avgEAR / 0.4) * 100, 100);
        earProgressEl.style.width = `${earPercent}%`;
        earProgressEl.className = 'progress-fill';
        
        if (avgEAR < earThreshold) {
            earProgressEl.classList.add('low');
        } else if (avgEAR < earThreshold * 1.2) {
            earProgressEl.classList.add('warning');
        }
        
        const marPercent = Math.min((mar / 1.0) * 100, 100);
        marProgressEl.style.width = `${marPercent}%`;
        marProgressEl.className = 'progress-fill';
        
        if (mar > marThreshold) {
            marProgressEl.classList.add('warning');
        }
        
        // Drowsiness detection
        if (avgEAR < earThreshold) {
            if (!drowsyStartTime) {
                drowsyStartTime = Date.now();
            }
            
            const drowsyDuration = (Date.now() - drowsyStartTime) / 1000;
            totalDrowsyTime = drowsyDuration;
            drowsyTimeEl.textContent = `${drowsyDuration.toFixed(1)}s`;
            
            if (drowsyDuration >= waitTime) {
                updateStatus('⚠️ DROWSINESS DETECTED - WAKE UP!', 'danger');
                
                // Add alert every 2 seconds
                if (Math.floor(drowsyDuration) % 2 === 0 && drowsyDuration > 0) {
                    addAlert('Driver appears drowsy! Eyes closed for too long.', 'danger');
                }
            } else {
                updateStatus('Eyes closing... Stay alert!', 'warning');
            }
        } else {
            if (drowsyStartTime) {
                drowsyStartTime = null;
                totalDrowsyTime = 0;
                drowsyTimeEl.textContent = '0.0s';
            }
        }
        
        // CORRECTED: Yawn detection with proper timing
        if (mar > marThreshold) {
            if (!yawnStartTime) {
                yawnStartTime = Date.now();
            }
            
            const yawnDuration = (Date.now() - yawnStartTime) / 1000;
            
            // Yawn confirmed if mouth open for more than 1 second
            if (yawnDuration >= 1.0) {
                updateStatus('Yawning detected - Take a break!', 'warning');
                if (!alertQueue.includes('yawn')) {
                    addAlert('Yawning detected! Consider taking a break.', 'warning');
                    alertQueue.push('yawn');
                    setTimeout(() => {
                        alertQueue = alertQueue.filter(a => a !== 'yawn');
                    }, 5000);
                }
            }
        } else {
            yawnStartTime = null;
        }
        
        // Set status to alert if no other alerts
        if (avgEAR >= earThreshold && mar <= marThreshold && headPose === "Centered") {
            updateStatus('Driver Alert', 'safe');
        }
        
        // Head pose alert
        if (headPose !== "Centered" && !alertQueue.includes('headpose')) {
            addAlert(`Distraction detected: ${headPose}`, 'warning');
            alertQueue.push('headpose');
            setTimeout(() => {
                alertQueue = alertQueue.filter(a => a !== 'headpose');
            }, 2000);
        }
        
        // Draw eye landmarks
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
        
        // Draw mouth landmarks for visualization
        const drawMouthLandmarks = () => {
            const mouthPoints = [13, 14, 61, 291, 312, 311, 82, 87];
            mouthPoints.forEach(index => {
                const point = landmarks[index];
                canvasCtx.beginPath();
                canvasCtx.arc(
                    point.x * canvasElement.width,
                    point.y * canvasElement.height,
                    3, 0, 2 * Math.PI
                );
                canvasCtx.fillStyle = mar > marThreshold ? '#f59e0b' : '#3b82f6';
                canvasCtx.fill();
            });
        };
        
        drawLandmarks(LEFT_EYE_INDICES, avgEAR < earThreshold ? '#ef4444' : '#10b981');
        drawLandmarks(RIGHT_EYE_INDICES, avgEAR < earThreshold ? '#ef4444' : '#10b981');
        drawMouthLandmarks();
        
        // Draw face mesh
        window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_TESSELATION, {
            color: '#C0C0C070',
            lineWidth: 1
        });
        
        // Draw lips outline
        window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_LIPS, {
            color: mar > marThreshold ? '#f59e0b' : '#3b82f6',
            lineWidth: 2
        });
        
    } else {
        updateStatus('No face detected', 'warning');
        if (drowsyStartTime) {
            drowsyStartTime = null;
            totalDrowsyTime = 0;
            drowsyTimeEl.textContent = '0.0s';
        }
        if (yawnStartTime) {
            yawnStartTime = null;
        }
    }
    
    canvasCtx.restore();
}

// Start monitoring
async function startMonitoring() {
    try {
        // Initialize MediaPipe Face Mesh
        faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });
        
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        faceMesh.onResults(onResults);
        
        // Initialize camera
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await faceMesh.send({image: videoElement});
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        
        isMonitoring = true;
        startTime = Date.now();
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        updateStatus('Monitoring Active', 'safe');
        addAlert('Monitoring started successfully', 'warning');
        
    } catch (error) {
        console.error('Error starting monitoring:', error);
        alert('Error accessing camera. Please ensure camera permissions are granted.');
    }
}

// Stop monitoring
function stopMonitoring() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    if (faceMesh) {
        faceMesh.close();
        faceMesh = null;
    }
    
    isMonitoring = false;
    drowsyStartTime = null;
    yawnStartTime = null;
    totalDrowsyTime = 0;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    updateStatus('System Stopped', 'safe');
    addAlert('Monitoring stopped', 'warning');
}

// Event listeners
startBtn.addEventListener('click', startMonitoring);
stopBtn.addEventListener('click', stopMonitoring);

// Initial setup
updateStatus('System Ready', 'safe');
