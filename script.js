const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const signTextEl = document.getElementById('signText');
const currentLetterEl = document.getElementById('currentLetter');
const bufferStatusEl = document.getElementById('bufferStatus');
const confidenceEl = document.getElementById('confidence');

let signText = '';
let gestureBuffer = [];
let lastLetter = '';
let lastSpeakTime = 0;
const BUFFER_SIZE = 5;
const SPEAK_DELAY = 500;

// MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,  // ✅ FASTER model
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({image: videoElement}),
    width: 1280,
    height: 720
});
camera.start();

// ✅ CONCISE: Finger tips ONLY (5 points)
const FINGER_TIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky
const FINGER_PIPS = [6, 10, 14, 18];     // reference points

function getFingerStates(landmarks) {
    const wrist = landmarks[0];
    const fingers = { thumb: false, index: false, middle: false, ring: false, pinky: false };

    // Thumb (horizontal)
    fingers.thumb = landmarks[4].x < wrist.x * 1.02;

    // Other fingers (vertical) - ULTRA FAST
    FINGER_TIPS.slice(1).forEach((tipIdx, i) => {
        const tip = landmarks[tipIdx];
        const pip = landmarks[FINGER_PIPS[i]];
        fingers[`finger${i+1}`] = tip.y < pip.y * 1.01;
    });

    return fingers;
}

function detectASL(fingerStates) {
    const { thumb, index, middle, ring, pinky } = fingerStates;

    // SPACE (fist) - HIGHEST priority
    if (!thumb && !index && !middle && !ring && !pinky) return ' ';
    if (thumb && index && middle && ring && pinky) return 'HELLO';

    // A (thumb only)
    if (thumb && !index && !middle && !ring && !pinky) return 'A';

    // B (4 fingers)
    if (!thumb && index && middle && ring && pinky) return 'B';

    // E (3 fingers)
    if (!thumb && index && middle && ring && !pinky) return 'E';

    // I (index only)
    if (!thumb && index && !middle && !ring && !pinky) return 'I';

    // L (thumb + index)
    if (thumb && index && !middle && !ring && !pinky) return 'L';

    // U (index + middle)
    if (!thumb && index && middle && !ring && !pinky) return 'U';

    // Y (thumb + pinky)
    if (thumb && !index && !middle && !ring && pinky) return 'Y';

    // Numbers 1-5
    const fingersUp = [thumb, index, middle, ring, pinky].filter(Boolean).length;
    if (fingersUp >= 1 && fingersUp <= 5) return fingersUp.toString();

    return null;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let letter = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
        const landmarks = results.multiHandLandmarks[0];

        // ✅ CONCISE: Draw ONLY 5 finger tips (NO connections!)
        const fingerStates = getFingerStates(landmarks);
        letter = detectASL(fingerStates);

        FINGER_TIPS.forEach((tipIdx, i) => {
            const landmark = landmarks[tipIdx];
            const x = landmark.x * canvasElement.width;
            const y = landmark.y * canvasElement.height;
            
            // Color code: GREEN=up, RED=down
            const isUp = i === 0 ? fingerStates.thumb : fingerStates[`finger${i}`];
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 12, 0, 2 * Math.PI);
            canvasCtx.fillStyle = isUp ? '#00ff88' : '#ff4444';
            canvasCtx.fill();
            canvasCtx.strokeStyle = '#ffffff';
            canvasCtx.lineWidth = 2;
            canvasCtx.stroke();
        });

        // Minimal wrist dot
        const wrist = landmarks[0];
        const wx = wrist.x * canvasElement.width;
        const wy = wrist.y * canvasElement.height;
        canvasCtx.beginPath();
        canvasCtx.arc(wx, wy, 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#50a8ff';
        canvasCtx.fill();
    }

    // Gesture buffer + stability
    if (letter) {
        gestureBuffer.push(letter);
        if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();

        currentLetterEl.textContent = letter;
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;

        // ✅ 3/5 STABILITY = CONFIRMED LETTER
        if (gestureBuffer.length === BUFFER_SIZE) {
            const counter = {};
            gestureBuffer.forEach(l => counter[l] = (counter[l] || 0) + 1);
            const mostCommon = Object.entries(counter).reduce((a, b) => a[1] > b[1] ? a : b)[0];

            if (counter[mostCommon] >= 3 && mostCommon !== lastLetter) {
                signText += mostCommon;
                lastLetter = mostCommon;
                
                // Update display
                signTextEl.textContent = signText.slice(-25) || 'Start signing...';
                
                // ✅ AUTO SPEAK (with delay)
                const now = Date.now();
                if (now - lastSpeakTime > SPEAK_DELAY) {
                    speakText(signText.slice(-15));
                    lastSpeakTime = now;
                }
                
                gestureBuffer.length = 0; // Reset
            }
        }
    } else {
        currentLetterEl.textContent = '-';
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;
    }

    canvasCtx.restore();
}

// ✅ AUTO SPEECH SYNTHESIS
function speakText(text) {
    if (text.trim().length > 1) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.3;
        utterance.pitch = 1.0;
        utterance.volume = 0.9;
        speechSynthesis.speak(utterance);
    }
}

// Controls
document.getElementById('clearBtn').addEventListener('click', () => {
    signText = '';
    gestureBuffer.length = 0;
    lastLetter = '';
    signTextEl.textContent = 'Cleared! 👋';
});

document.getElementById('speakBtn').addEventListener('click', () => {
    speakText(signText.slice(-20));
});
