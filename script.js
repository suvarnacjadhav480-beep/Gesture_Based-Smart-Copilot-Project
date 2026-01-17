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
let wordBuffer = [];  // ✅ NEW: Track current word
const BUFFER_SIZE = 4;
const WORD_PAUSE_THRESHOLD = 1500;  // ✅ 1.5s pause = word complete
let lastGestureTime = 0;

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => await hands.send({image: videoElement}),
    width: 640,
    height: 480
});
camera.start();

function getFingerStates(landmarks) {
    const thumb_tip = landmarks[4];
    const thumb_ip = landmarks[3];
    const thumb_up = thumb_tip.x < thumb_ip.x;

    const index_tip = landmarks[8];
    const index_pip = landmarks[6];
    const index_up = index_tip.y < index_pip.y * 0.98;

    const middle_tip = landmarks[12];
    const middle_pip = landmarks[10];
    const middle_up = middle_tip.y < middle_pip.y * 0.98;

    const ring_tip = landmarks[16];
    const ring_pip = landmarks[14];
    const ring_up = ring_tip.y < ring_pip.y * 0.98;

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
    if (!fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return ' ';
    }

    if (fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'A';
    }

    if (!fingers.thumb && fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'I';
    }

    if (fingers.thumb && fingers.index && !fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'L';
    }

    if (!fingers.thumb && fingers.index && fingers.middle && 
        !fingers.ring && !fingers.pinky) {
        return 'U';
    }

    if (fingers.thumb && !fingers.index && !fingers.middle && 
        !fingers.ring && fingers.pinky) {
        return 'Y';
    }

    if (!fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && fingers.pinky) {
        return 'B';
    }

    if (!fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && !fingers.pinky) {
        return 'E';
    }

    if (fingers.thumb && fingers.index && fingers.middle && 
        fingers.ring && fingers.pinky) {
        return 'Hello';
    }

    if (fingers.thumb && !fingers.index && fingers.middle && 
        fingers.ring && fingers.pinky) {
        return 'Yes';
    }

    return null;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // X-AXIS INVERSION: Flip horizontally
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, -canvasElement.width, 0, 
                        canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    let letter = null;
    const now = Date.now();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const fingers = getFingerStates(landmarks);
        letter = detectASL(fingers);

        // Draw flipped fingertip indicators
        const tips = [
            {idx: 4, name: 'thumb'},
            {idx: 8, name: 'index'}, 
            {idx: 12, name: 'middle'},
            {idx: 16, name: 'ring'},
            {idx: 20, name: 'pinky'}
        ];

        tips.forEach(({idx, name}) => {
            const lm = landmarks[idx];
            const x = (1 - lm.x) * canvasElement.width;
            const y = lm.y * canvasElement.height;
            
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
            canvasCtx.fillStyle = fingers[name] ? '#00ff88' : '#ff4444';
            canvasCtx.fill();
            canvasCtx.strokeStyle = '#ffffff';
            canvasCtx.lineWidth = 1;
            canvasCtx.stroke();
        });

        // ✅ UPDATE LAST GESTURE TIME (hand active)
        lastGestureTime = now;
    }

    // ✅ SMART WORD DETECTION LOGIC
    if (letter) {
        gestureBuffer.push(letter);
        if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();

        currentLetterEl.textContent = letter;
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;

        if (gestureBuffer.length === BUFFER_SIZE) {
            const counter = {};
            gestureBuffer.forEach(l => counter[l] = (counter[l] || 0) + 1);
            const mostCommon = Object.entries(counter).reduce((a, b) => a[1] > b[1] ? a : b)[0];

            if (counter[mostCommon] >= 2 && mostCommon !== lastLetter) {
                // ✅ Add to current word buffer
                wordBuffer.push(mostCommon);
                lastLetter = mostCommon;
                
                // Update display with current word in progress
                const displayText = signText + wordBuffer.join('');
                signTextEl.textContent = displayText.slice(-25);
                
                gestureBuffer = []; // Reset letter buffer
            }
        }
    } else {
        currentLetterEl.textContent = '-';
        bufferStatusEl.textContent = `${gestureBuffer.length}/${BUFFER_SIZE}`;
    }

    // ✅ WORD COMPLETION CHECK: Pause > 1.5s = word done!
    const pauseTime = now - lastGestureTime;
    if (wordBuffer.length > 0 && pauseTime > WORD_PAUSE_THRESHOLD) {
        // ✅ WORD COMPLETE! Add to final text
        if (wordBuffer.length > 0) {
            const word = wordBuffer.join('').trim();
            if (word) {
                signText += word + ' ';
                wordBuffer = []; // Clear word buffer
                
                // Update display with completed words
                signTextEl.textContent = signText.slice(-30);
                
                // Speak completed word
                const nowTime = Date.now();
                if (nowTime - lastSpeakTime > 600) {
                    speakText(word);
                    lastSpeakTime = nowTime;
                }
            }
        }
    }

    canvasCtx.restore();
}

function speakText(text) {
    if (text.trim().length > 0) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.3;
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
    }
}

document.getElementById('clearBtn').addEventListener('click', () => {
    signText = '';
    gestureBuffer = [];
    wordBuffer = [];
    lastLetter = '';
    lastGestureTime = 0;
    signTextEl.textContent = 'Cleared! 👋';
});

document.getElementById('speakBtn').addEventListener('click', () => {
    speakText(signText.trim().slice(-30));
});
