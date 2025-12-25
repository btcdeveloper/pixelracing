const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const nicknameInput = document.getElementById('nickname');
const startBtn = document.getElementById('startBtn');
const carOptions = document.querySelectorAll('.car-option');
const toggleMusicBtn = document.getElementById('toggleMusic');
const toggleEngineBtn = document.getElementById('toggleEngine');
const speedValueEl = document.getElementById('speed-value');
const lapCountSelect = document.getElementById('lapCount');

// --- РЕТРО ЗВУКОВАЯ СИСТЕМА (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let motorNode = null;
let motorGain = null;
let noiseNode = null;
let noiseGain = null;
let musicEnabled = true;
let engineEnabled = true;

function initAudio() {
    if (motorNode) return;
    
    // РЕВ МОТОРА (Осциллятор + Розовый шум для хрипоты)
    motorNode = audioCtx.createOscillator();
    motorGain = audioCtx.createGain();
    const lowPass = audioCtx.createBiquadFilter();
    
    motorNode.type = 'sawtooth';
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 800;
    
    motorNode.connect(lowPass);
    lowPass.connect(motorGain);
    motorGain.connect(audioCtx.destination);
    
    motorGain.gain.value = 0;
    motorNode.start();

    // ШУМ ДЛЯ ЭФФЕКТА ВЫХЛОПА
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0; // Изначально 0
    noiseNode.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseNode.start();

    // ФОНОВАЯ МУЗЫКА (8-бит стиль)
    playMusic();
}

function playMusic() {
    const melody = [
        261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66,
        261.63, 329.63, 392.00, 523.25, 392.00, 329.63
    ];
    let noteIdx = 0;

    setInterval(() => {
        if (gameState !== 'RACING' || !musicEnabled) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = melody[noteIdx];
        osc.connect(g);
        g.connect(audioCtx.destination);
        g.gain.value = 0.03;
        osc.start();
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        osc.stop(audioCtx.currentTime + 0.2);
        noteIdx = (noteIdx + 1) % melody.length;
    }, 200);
}

function updateEngineSound(speed) {
    if (!motorNode || !motorGain || !noiseGain) return;
    const s = Math.abs(speed);
    
    if (!engineEnabled) {
        motorGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        noiseGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }

    motorGain.gain.setTargetAtTime(0.08 + (s / MAX_SPEED) * 0.1, audioCtx.currentTime, 0.1);
    noiseGain.gain.setTargetAtTime(0.02 + (s / MAX_SPEED) * 0.03, audioCtx.currentTime, 0.1);
    motorNode.frequency.setTargetAtTime(30 + s * 25, audioCtx.currentTime, 0.1);
}

toggleMusicBtn.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    toggleMusicBtn.textContent = `Music: ${musicEnabled ? 'ON' : 'OFF'}`;
});

toggleEngineBtn.addEventListener('click', () => {
    engineEnabled = !engineEnabled;
    toggleEngineBtn.textContent = `Engine: ${engineEnabled ? 'ON' : 'OFF'}`;
});

const socket = io();

let myId = null;
let players = {};
let gameState = 'LOBBY';
let gameStarted = false;
let winnersList = [];
let fireworks = [];
let targetLaps = 5;

const ACCEL = 0.18;
const FRICTION = 0.96;
const TURN_SPEED = 0.05;
const MAX_SPEED = 6.5;
const OFF_ROAD_SPEED = 2;

let localPlayer = {
    id: null,
    x: -500, y: -500, angle: 0, speed: 0,
    nickname: '', color: '#ff0000', laps: 0,
    lastPassedFinish: false,
    ready: false,
    checkpointHit: false // НОВЫЙ ЧЕКПОИНТ
};

const trackPoints = [
    {x: 100, y: 200}, {x: 600, y: 200}, {x: 900, y: 150}, 
    {x: 1050, y: 200}, {x: 1100, y: 400}, {x: 1000, y: 600}, 
    {x: 800, y: 700}, {x: 500, y: 750}, {x: 300, y: 650}, 
    {x: 450, y: 450}, {x: 300, y: 350}, {x: 100, y: 350}, {x: 100, y: 200}
];

carOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        carOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        localPlayer.color = opt.dataset.color;
    });
});

const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    w: false, s: false, a: false, d: false, Enter: false
};

window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

startBtn.addEventListener('click', joinGame);
nicknameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
    audioCtx.resume();
    initAudio();
    const nick = nicknameInput.value.trim() || 'Guest' + Math.floor(Math.random() * 1000);
    const laps = lapCountSelect.value;
    localPlayer.nickname = nick;
    ui.style.display = 'none';
    gameStarted = true;
    socket.emit('joinGame', { nickname: nick, color: localPlayer.color, laps: laps });
}

socket.on('connect', () => { 
    myId = socket.id; 
    localPlayer.id = myId;
});

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    if (myId && players[myId] && players[myId].ready) {
        localPlayer.x = players[myId].x;
        localPlayer.y = players[myId].y;
        localPlayer.ready = true;
    }
    const takenColors = Object.values(players).filter(p => p.ready).map(p => p.color);
    updateColorUI(takenColors);
});

socket.on('newPlayer', (playerInfo) => { 
    players[playerInfo.id] = playerInfo; 
});

socket.on('playerMoved', (playerInfo) => {
    if (players[playerInfo.id]) {
        players[playerInfo.id].x = playerInfo.x;
        players[playerInfo.id].y = playerInfo.y;
        players[playerInfo.id].angle = playerInfo.angle;
    }
});

socket.on('playerUpdated', (playerInfo) => {
    players[playerInfo.id] = playerInfo;
    if (playerInfo.id === myId) {
        // УБИРАЕМ ОБНОВЛЕНИЕ X, Y, ANGLE ДЛЯ СЕБЯ (чтобы не было дерганья)
        localPlayer.laps = playerInfo.laps;
        localPlayer.ready = playerInfo.ready;
        localPlayer.color = playerInfo.color;
    }
    const takenColors = Object.values(players).filter(p => p.ready).map(p => p.color);
    updateColorUI(takenColors);
});

socket.on('updateTargetLaps', (laps) => {
    targetLaps = laps;
    if (lapCountSelect) lapCountSelect.value = laps;
});

socket.on('gameStateUpdate', (state, winners) => {
    gameState = state;
    if (winners) winnersList = winners;
    if (state === 'LOBBY') {
        localPlayer.laps = 0;
        localPlayer.speed = 0;
        fireworks = [];
        const rBtn = document.getElementById('resetBtn');
        if (rBtn) rBtn.remove();
    }
});

socket.on('playerDisconnected', (id) => { 
    delete players[id]; 
    const takenColors = Object.values(players).filter(p => p.ready).map(p => p.color);
    updateColorUI(takenColors);
});

socket.on('updateOccupiedColors', (takenColors) => {
    updateColorUI(takenColors);
});

function updateColorUI(takenColors) {
    carOptions.forEach(opt => {
        const isTakenByOther = Object.values(players).some(p => p.ready && p.id !== myId && p.color === opt.dataset.color);
        if (isTakenByOther) {
            opt.style.opacity = '0.3';
            opt.style.pointerEvents = 'none';
            opt.style.filter = 'grayscale(1)';
            if (opt.classList.contains('selected') && !gameStarted) {
                opt.classList.remove('selected');
                const firstFree = Array.from(carOptions).find(o => {
                    return !Object.values(players).some(p => p.ready && p.id !== myId && p.color === o.dataset.color);
                });
                if (firstFree) {
                    firstFree.classList.add('selected');
                    localPlayer.color = firstFree.dataset.color;
                }
            }
        } else {
            opt.style.opacity = '1';
            opt.style.pointerEvents = 'auto';
            opt.style.filter = 'none';
        }
    });
}

function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

function checkOffRoad(x, y) {
    let minDistance = 1000;
    for (let i = 0; i < trackPoints.length - 1; i++) {
        const dist = distToSegment({x, y}, trackPoints[i], trackPoints[i+1]);
        if (dist < minDistance) minDistance = dist;
    }
    return minDistance > 55;
}

function update() {
    if (!gameStarted) return;

    if (gameState === 'LOBBY') {
        if (keys.Enter || keys.w || keys.ArrowUp) socket.emit('startGame');
        updateEngineSound(0);
        return;
    }

    if (gameState === 'FINISHED') {
        updateEngineSound(0);
        if (Math.random() < 0.1) {
            fireworks.push({
                x: Math.random() * canvas.width,
                y: canvas.height,
                targetY: Math.random() * (canvas.height / 2),
                color: `hsl(${Math.random() * 360}, 100%, 50%)`,
                particles: []
            });
        }
        
        fireworks.forEach((f, idx) => {
            if (f.y > f.targetY) {
                f.y -= 5;
            } else if (f.particles.length === 0) {
                for (let i = 0; i < 30; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 4 + 2;
                    f.particles.push({
                        x: f.x, y: f.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 1.0
                    });
                }
            } else {
                f.particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.life -= 0.02;
                });
                f.particles = f.particles.filter(p => p.life > 0);
                if (f.particles.length === 0) fireworks.splice(idx, 1);
            }
        });
        return;
    }

    let currentMaxSpeed = MAX_SPEED;
    if (checkOffRoad(localPlayer.x, localPlayer.y)) currentMaxSpeed = OFF_ROAD_SPEED;

    if (keys.ArrowUp || keys.w) localPlayer.speed += ACCEL;
    else if (keys.ArrowDown || keys.s) localPlayer.speed -= ACCEL;

    localPlayer.speed *= FRICTION;

    if (Math.abs(localPlayer.speed) > 0.1) {
        const turnDir = localPlayer.speed > 0 ? 1 : -1;
        if (keys.ArrowLeft || keys.a) localPlayer.angle -= TURN_SPEED * turnDir;
        if (keys.ArrowRight || keys.d) localPlayer.angle += TURN_SPEED * turnDir;
    }

    if (localPlayer.speed > currentMaxSpeed) localPlayer.speed = currentMaxSpeed;
    if (localPlayer.speed < -currentMaxSpeed/2) localPlayer.speed = -currentMaxSpeed/2;

    localPlayer.x += Math.cos(localPlayer.angle) * localPlayer.speed;
    localPlayer.y += Math.sin(localPlayer.angle) * localPlayer.speed;

    updateEngineSound(localPlayer.speed);
    
    if (speedValueEl) {
        const displaySpeed = Math.floor(Math.abs(localPlayer.speed) * 20);
        speedValueEl.textContent = displaySpeed;
        if (displaySpeed > 100) speedValueEl.style.color = '#ff5555';
        else if (displaySpeed > 50) speedValueEl.style.color = '#ffff55';
        else speedValueEl.style.color = '#55ff55';
    }

    // ЛОГИКА ЧЕКПОИНТА (Точка на середине трассы - trackPoints[7] {x: 800, y: 700})
    const distToCheckpoint = Math.sqrt(Math.pow(localPlayer.x - 800, 2) + Math.pow(localPlayer.y - 700, 2));
    if (distToCheckpoint < 100) {
        localPlayer.checkpointHit = true;
    }

    const onFinishLine = localPlayer.x > 340 && localPlayer.x < 360 && 
                         localPlayer.y > 140 && localPlayer.y < 260;
    
    if (onFinishLine && !localPlayer.lastPassedFinish && localPlayer.speed > 0 && localPlayer.checkpointHit) {
        socket.emit('lapCompleted');
        localPlayer.lastPassedFinish = true;
        localPlayer.checkpointHit = false; // Сбрасываем для следующего круга
    } else if (!onFinishLine) {
        localPlayer.lastPassedFinish = false;
    }

    if (gameState === 'RACING') {
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, angle: localPlayer.angle });
    }
}

function drawTrack() {
    ctx.fillStyle = '#1a5e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 110;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
    trackPoints.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
    trackPoints.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(350, 200);
    for (let i = -55; i < 55; i += 11) {
        ctx.fillStyle = (i / 11) % 2 === 0 ? '#fff' : '#000';
        ctx.fillRect(-10, i, 20, 11);
    }
    ctx.restore();
}

function drawCar(player) {
    if (!player.ready) return;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = player.color || '#f00';
    ctx.fillRect(-15, -10, 30, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-5, -8, 15, 16);
    ctx.fillStyle = '#000';
    ctx.fillRect(-12, -12, 8, 4);
    ctx.fillRect(4, -12, 8, 4);
    ctx.fillRect(-12, 8, 8, 4);
    ctx.fillRect(4, 8, 8, 4);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.nickname} [${player.laps || 0}/${targetLaps}]`, player.x, player.y - 25);
}

function drawPodium() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 100;
    
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 150, cy, 100, 100); 
    ctx.fillRect(cx - 50, cy - 50, 100, 150); 
    ctx.fillRect(cx + 50, cy + 50, 100, 50); 
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('2', cx - 100, cy + 40);
    ctx.fillText('1', cx, cy - 10);
    ctx.fillText('3', cx + 100, cy + 85);

    winnersList.forEach((winner, i) => {
        if (i > 2) return;
        let px = cx, py = cy;
        if (i === 0) { px = cx; py = cy - 80; }
        if (i === 1) { px = cx - 100; py = cy - 30; }
        if (i === 2) { px = cx + 100; py = cy + 20; }
        
        ctx.fillStyle = winner.color;
        ctx.fillRect(px - 15, py, 30, 40); 
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(px, py - 10, 15, 0, Math.PI * 2); 
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '14px Courier New';
        ctx.fillText(winner.nickname, px, py - 35);
    });

    if (!document.getElementById('resetBtn')) {
        const btn = document.createElement('button');
        btn.id = 'resetBtn';
        btn.textContent = 'RESTART TO LOBBY';
        btn.style.position = 'absolute';
        btn.style.top = '80%';
        btn.style.left = '50%';
        btn.style.transform = 'translate(-50%, -50%)';
        btn.classList.add('audio-btn');
        btn.style.padding = '20px 40px';
        btn.style.fontSize = '20px';
        btn.addEventListener('click', () => {
            socket.emit('resetGame');
            btn.remove();
        });
        document.getElementById('game-container').appendChild(btn);
    }
}

function drawFireworks() {
    fireworks.forEach(f => {
        if (f.particles.length === 0) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
        } else {
            f.particles.forEach(p => {
                ctx.fillStyle = f.color;
                ctx.globalAlpha = p.life;
                ctx.fillRect(p.x, p.y, 3, 3);
            });
            ctx.globalAlpha = 1.0;
        }
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTrack();
    
    Object.keys(players).forEach(id => {
        if (id !== myId) drawCar(players[id]);
    });
    
    if (gameStarted && localPlayer.ready) {
        drawCar(localPlayer);
    }

    if (gameState === 'LOBBY') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '40px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('GRAND PRIX LOBBY', canvas.width/2, canvas.height/2 - 20);
        ctx.font = '24px Courier New';
        ctx.fillText('PRESS "W" TO START ENGINES', canvas.width/2, canvas.height/2 + 30);
    } else if (gameState === 'FINISHED') {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawFireworks();
        drawPodium();
    }
    requestAnimationFrame(() => {
        update();
        render();
    });
}
render();
