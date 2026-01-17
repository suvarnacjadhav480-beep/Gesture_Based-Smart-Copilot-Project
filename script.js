const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d', { alpha: false });

const signTextEl = document.getElementById('signText');
const currentLetterEl = document.getElementById('currentLetter');
const bufferStatusEl = document.getElementById('bufferStatus');

let signText = '';
let gestureBuffer = [];
let lastLetter = '';
let lastSpeakTime = 0;
const BUFFER_SIZE = 4;

// ✅ FIXED: RELAXED detection settings
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,           // ✅ Higher accuracy model
    minDetectionConfidence: 0.5,  // ✅ LOWER = more detections
    minTrackingConfidence: 0.5    // ✅ LOWER = better tracking
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({image: videoElement}),
    width: 640,
    height: 480
});
camera.start();

// ✅ CORRECTED: PROVEN thresholds from working ASL projects
function getFingerStates(landmarks) {
    const wrist = landmarks[0];
    
    // THUMB - FIXED horizontal detection
    const thumb_tip = landmarks[4];
    const thumb_ip = landmarks[3];
    const thumb_up = thumb_tip.x < thumb_ip.x;  // ✅ WRIST → TIP

    // INDEX
    const index_tip = landmarks[8];
    const index_pip = landmarks[6];
    const index_up = index_tip.y < index_pip.y * 0.98;  // ✅ Slightly relaxed

    // MIDDLE  
    const middle_tip = landmarks[12];
    const middle_pip = landmarks[10];
    const middle_up = middle_tip.y < middle_pip.y * 0.98;

    // RING
    const ring_tip = landmarks[16];
    const ring_pip = landmarks[14];
    const ring_up = ring_tip.y < ring_pip.y * 0.98;

    // PINKY
    const pinky_tip = landmarks[20];
    const pinky_pip = landmarks[18];
    const pinky_up = pinky_tip.y < pinky_pip.y * 0.98;

    return {
        thumb: thumb_up,
        index: index_up,
        middle: middle_up,
        ring: ring_up,
        pinky: pinky_up
    };
}

function detectASL(fingers) {
    // ✅ PRIORITY 1: SPACE (fist) - MOST COMMON
    if (!fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return ' ';
    }

    // ✅ A: Thumb only
    if (fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'OK';
    }

    // ✅ I: Index only  
    if (!fingers.thumb && fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'I';
    }

    // ✅ L: Thumb + Index
    if (fingers.thumb && fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'L';
    }

    // ✅ U: Index + Middle
    if (!fingers.thumb && fingers.index && fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'U';
    }

    // ✅ Y: Thumb + Pinky
    if (fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && fingers.pinky) {
        return 'Y';
    }

    // ✅ B: All 4 fingers
    if (!fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && fingers.pinky) {
        return 'B';
    }

    // ✅ E: 3 fingers (index, middle, ring)
    if (!fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && !fingers.pinky) {
        return 'E';
    }
    if (fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && fingers.pinky) {
        return 'Hello';
    }

    // ✅ NUMBERS: Simple count
    const count = (fingers.thumb ? 1 : 0) + (fingers.index ? 1 : 0) + 
                  (fingers.middle ? 1 : 0) + (fingers.ring ? 1 : 0) + 
                  (fingers.pinky ? 1 : 0);
    // if (count >= 1 && count <= 5) {
    //     return count.toString();
    // }

    return null;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let letter = null;

    // ✅ Check for ANY hand detection
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // ✅ FIXED finger detection
        const fingers = getFingerStates(landmarks);
        letter = detectASL(fingers);

        // ✅ Draw ONLY finger tips (5 tiny green/red dots)
        const tips = [
            {idx: 4, name: 'thumb'},
            {idx: 8, name: 'index'}, 
            {idx: 12, name: 'middle'},
            {idx: 16, name: 'ring'},
            {idx: 20, name: 'pinky'}
        ];

        tips.forEach(({idx, name}) => {
            const lm = landmarks[idx];
            const x = lm.x * canvasElement.width;
            const y = lm.y * canvasElement.height;
            
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
            canvasCtx.fillStyle = fingers[name] ? '#00ff88' : '#ff4444';
            canvasCtx.fill();
            canvasCtx.strokeStyle = '#ffffff';
            canvasCtx.lineWidth = 1;
            canvasCtx.stroke();
        });
    }

    // Buffer logic
    if (letter) {
        gestureBuffer.push(letter);
        if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();

        currentLetterEl.textContent = letter;
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;

        if (gestureBuffer.length === BUFFER_SIZE) {
            // Simple majority vote
            const counter = {};
            gestureBuffer.forEach(l => counter[l] = (counter[l] || 0) + 1);
            const mostCommon = Object.entries(counter).reduce((a, b) => a[1] > b[1] ? a : b)[0];

            if (counter[mostCommon] >= 2 && mostCommon !== lastLetter) {
                signText += mostCommon;
                lastLetter = mostCommon;
                signTextEl.textContent = signText.slice(-20);
                
                const now = Date.now();
                if (now - lastSpeakTime > 400) {
                    speakText(signText.slice(-12));
                    lastSpeakTime = now;
                }
                
                gestureBuffer = []; // Reset
            }
        }
    } else {
        currentLetterEl.textContent = '-';
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;
    }

    canvasCtx.restore();
}

function speakText(text) {
    if (text.trim().length > 1) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.3;
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
    }
}

// Controls
document.getElementById('clearBtn').addEventListener('click', () => {
    signText = '';
    gestureBuffer = [];
    lastLetter = '';
    signTextEl.textContent = 'Cleared! 👋';
});

document.getElementById('speakBtn').addEventListener('click', () => {
    speakText(signText.slice(-20));
});
