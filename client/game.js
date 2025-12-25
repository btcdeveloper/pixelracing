const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

console.log("Pixel Racing Engine v1.2 Initializing...");

const socket = io();

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log("Canvas resized to:", canvas.width, "x", canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// Повторный ресайз через короткое время, чтобы учесть скрытие панелей браузера
setTimeout(resizeCanvas, 500);

const ui = document.getElementById('ui');
const nicknameInput = document.getElementById('nickname');
const startBtn = document.getElementById('startBtn');
const carOptions = document.querySelectorAll('.car-option');
const mainMenu = document.getElementById('main-menu');
const createMenu = document.getElementById('create-menu');
const joinMenu = document.getElementById('join-menu');
const roomListEl = document.getElementById('room-list');
const nicknameInputJoin = document.getElementById('nickname-join');
const showCreateBtn = document.getElementById('showCreateBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const backBtns = document.querySelectorAll('.back-btn');

// Загрузка сохраненного никнейма
const savedNickname = localStorage.getItem('pixelRacingNickname');
if (savedNickname) {
    if (nicknameInput) nicknameInput.value = savedNickname;
    if (nicknameInputJoin) nicknameInputJoin.value = savedNickname;
}

// Переключение экранов
if (showCreateBtn) {
    showCreateBtn.addEventListener('click', () => {
        mainMenu.classList.remove('active');
        createMenu.classList.add('active');
    });
}

if (showJoinBtn) {
    showJoinBtn.addEventListener('click', () => {
        mainMenu.classList.remove('active');
        joinMenu.classList.add('active');
        socket.emit('getRooms');
    });
}

backBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        createMenu.classList.remove('active');
        joinMenu.classList.remove('active');
        mainMenu.classList.add('active');
    });
});

function createRoom() {
    initAudio();
    const nick = nicknameInput.value.trim() || 'Guest' + Math.floor(Math.random() * 1000);
    localStorage.setItem('pixelRacingNickname', nick);
    
    const laps = lapCountSelect.value;
    const trackType = trackSelect.value;
    const selectedPreset = trackPresets[trackType] || trackPresets.preset1;
    const selectedPoints = selectedPreset.points;
    const generatedHazards = generateHazardsForTrack(selectedPoints);

    localPlayer.nickname = nick;
    localPlayer.ready = true; // ГАРАНТИРУЕМ ОТРИСОВКУ
    localPlayer.roomId = socket.id; // ПРИ СОЗДАНИИ ROOM ID = НАШ ID
    ui.style.display = 'none';
    
    // Показываем игровой интерфейс
    document.getElementById('speedometer').style.display = 'flex';
    document.getElementById('lap-counter').style.display = 'flex';
    document.getElementById('lap-timer').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    
    gameStarted = true;

    socket.emit('createRoom', {
        nickname: nick,
        color: localPlayer.color,
        laps: laps,
        trackType: trackType,
        trackData: { points: selectedPoints, hazards: generatedHazards }
    });
    
    trackPoints = selectedPoints;
    trackHazards = generatedHazards;
    generateScenery();
    playMusic(true);
}

function joinRoom(roomId) {
    initAudio();
    const nick = nicknameInputJoin.value.trim() || 'Guest' + Math.floor(Math.random() * 1000);
    localStorage.setItem('pixelRacingNickname', nick);

    localPlayer.nickname = nick;
    localPlayer.ready = true; // ГАРАНТИРУЕМ ОТРИСОВКУ
    localPlayer.roomId = roomId; // ЗАПОМИНАЕМ ID КОМНАТЫ
    ui.style.display = 'none';
    
    // Показываем игровой интерфейс
    document.getElementById('speedometer').style.display = 'flex';
    document.getElementById('lap-counter').style.display = 'flex';
    document.getElementById('lap-timer').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    
    gameStarted = true;

    socket.emit('joinRoom', {
        roomId: roomId,
        nickname: nick,
        color: localPlayer.color
    });
    playMusic(true);
}

if (startBtn) {
    startBtn.addEventListener('click', createRoom);
}

socket.on('roomList', (rooms) => {
    if (!roomListEl) return;
    roomListEl.innerHTML = '';
    if (rooms.length === 0) {
        roomListEl.innerHTML = '<div style="padding: 20px; color: #aaa;">No active races found...</div>';
        return;
    }
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <div class="room-info">
                <strong>${room.creator}'s Race</strong><br>
                <small>${room.trackName}</small>
            </div>
            <div class="room-players">${room.playerCount} Players</div>
        `;
        item.onclick = () => joinRoom(room.id);
        roomListEl.appendChild(item);
    });
});

socket.on('roomJoined', (data) => {
    trackPoints = data.trackData.points || data.trackData;
    trackHazards = data.trackData.hazards || { nitro: [] };
    targetLaps = data.targetLaps;
    localPlayer.roomId = data.roomId; // Обновляем ID комнаты
    generateScenery();
    updateLobbyUI();
});

carOptions.forEach(opt => { 
    opt.addEventListener('click', () => { 
        carOptions.forEach(o => {
            o.style.borderColor = '#555';
            o.style.boxShadow = 'none';
        });
        const sameColorOpts = document.querySelectorAll(`.car-option[data-color="${opt.dataset.color}"]`);
        sameColorOpts.forEach(o => {
            o.style.borderColor = '#55ff55';
            o.style.boxShadow = '0 0 10px #55ff55';
        });
        localPlayer.color = opt.dataset.color; 
        socket.emit('selectColor', localPlayer.color);
    }); 
});

const toggleMusicBtn = document.getElementById('toggleMusic');
const toggleEngineBtn = document.getElementById('toggleEngine');
const speedValueEl = document.getElementById('speed-value');
const currentLapEl = document.getElementById('current-lap');
const bestLapEl = document.getElementById('best-lap');
const lapValueEl = document.getElementById('lap-value');
const lapCountSelect = document.getElementById('lapCount');
const trackSelect = document.getElementById('trackSelect');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resumeBtn');
const endRaceBtn = document.getElementById('endRaceBtn');
const lobbyUi = document.getElementById('lobby-ui');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const forceStartBtn = document.getElementById('forceStartBtn');
const notHostMsg = document.getElementById('not-host-msg');

// Контролы аудио
const musicVolumeSlider = document.getElementById('musicVolume');
const musicTrackSelect = document.getElementById('musicTrack');
const engineVolumeSlider = document.getElementById('engineVolume');
const bgMusic = document.getElementById('bgMusicElement');

// --- ЗВУКОВАЯ СИСТЕМА ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let motorNode = null, motorSubNode = null, motorGain = null, noiseNode = null, noiseGain = null;
let musicEnabled = true, engineEnabled = true, musicVolume = 0.5, engineVolume = 0.5, currentTrackIdx = 0;

const tracks = [
    { name: "Nine Thou", url: "audio/01_-nine-thou-superstars-remix.mp3" },
    { name: "Do Ya Thang", url: "audio/02_-do-ya-thang.mp3" },
    { name: "I Am Rock", url: "audio/03_-i-am-rock.mp3" },
    { name: "In a Hood Near You", url: "audio/04_-in-a-hood-near-you.mp3" },
    { name: "Lets Move", url: "audio/05_-lets-move.mp3" },
    { name: "Fired Up", url: "audio/07_-fired-up.mp3" }
];

function initAudio() {
    if (motorNode) return;
    motorNode = audioCtx.createOscillator();
    motorSubNode = audioCtx.createOscillator();
    motorGain = audioCtx.createGain();
    const lowPass = audioCtx.createBiquadFilter();
    motorNode.type = 'sawtooth'; motorSubNode.type = 'triangle';
    lowPass.type = 'lowpass'; lowPass.frequency.value = 600; lowPass.Q.value = 5;
    motorNode.connect(lowPass); motorSubNode.connect(lowPass);
    lowPass.connect(motorGain); motorGain.connect(audioCtx.destination);
    motorGain.gain.value = 0; motorNode.start(); motorSubNode.start();
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer; noiseNode.loop = true;
    noiseGain = audioCtx.createGain(); noiseGain.gain.value = 0;
    noiseNode.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noiseNode.start();
}

function playMusic(isRandom = false) {
    if (!musicEnabled || !gameStarted) { bgMusic.pause(); return; }
    
    if (isRandom) {
        currentTrackIdx = Math.floor(Math.random() * tracks.length);
        if (musicTrackSelect) musicTrackSelect.value = currentTrackIdx;
    }

    const track = tracks[currentTrackIdx];
    if (track && bgMusic.src !== (window.location.origin + "/" + track.url)) { 
        bgMusic.src = track.url; 
        bgMusic.load(); 
    }
    bgMusic.volume = musicVolume;
    bgMusic.play().catch(e => console.log("Interaction required"));
}

bgMusic.onended = () => {
    if (musicEnabled) playMusic(true);
};

function updateEngineSound(speed) {
    if (!motorNode || !motorSubNode || !motorGain) return;
    const s = Math.abs(speed);
    if (!engineEnabled || s < 0.1 || gameState !== 'RACING') {
        motorGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        noiseGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }
    const freq = 40 + s * 20;
    motorNode.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
    motorSubNode.frequency.setTargetAtTime(freq / 2, audioCtx.currentTime, 0.1);
    const targetGain = (0.15 + (s / 15.0) * 0.2) * engineVolume;
    motorGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.1);
    noiseGain.gain.setTargetAtTime((0.05 + (s / 15.0) * 0.08) * engineVolume, audioCtx.currentTime, 0.1);
}

// --- МИР И КАМЕРА ---
let zoomLevel = 1.0;
let targetZoom = 1.0; // Целевой зум для плавности
const minZoom = 0.02; // Еще больше отдаления для масштаба
const maxZoom = 4.0;  // Еще больше приближения для деталей

// Плавная камера
let cameraX = 3000;
let cameraY = 1000;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let cameraOffsetX = 0;
let cameraOffsetY = 0;

window.addEventListener('mousedown', (e) => {
    if (e.target === canvas) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = (e.clientX - lastMouseX) / zoomLevel;
        const dy = (e.clientY - lastMouseY) / zoomLevel;
        cameraOffsetX -= dx;
        cameraOffsetY -= dy;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

window.addEventListener('wheel', (e) => {
    // Плавный экспоненциальный зум (изменяем на % от текущего)
    const zoomFactor = 1.15;
    if (e.deltaY > 0) targetZoom /= zoomFactor;
    else targetZoom *= zoomFactor;
    targetZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
}, { passive: true });

document.getElementById('zoomIn').addEventListener('click', () => {
    targetZoom = Math.min(maxZoom, targetZoom * 1.5);
});

document.getElementById('zoomOut').addEventListener('click', () => {
    targetZoom = Math.max(minZoom, targetZoom / 1.5);
});

let myId = null, players = {}, gameState = 'LOBBY', gameStarted = false, winnersList = [], fireworks = [], targetLaps = 5;

// ЭФФЕКТЫ И ГЕЙМПЛЕЙ
let wheelParticles = [];
let activeEmojis = [];
const emojiMap = { '1': '👍', '2': '😂', '3': '🏎️', '4': '💩' };
let nitroBoost = 0; // Дополнительная скорость от нитро

// МАТЕМАТИЧЕСКИ ТОЧНАЯ ФИЗИКА
const ACCEL = 0.055, FRICTION = 0.9975, TURN_SPEED = 0.05, MAX_SPEED = 22.0, OFF_ROAD_SPEED = 5.0;

let localPlayer = {
    id: null, x: 2800, y: 1000, angle: 0, speed: 0,
    nickname: '', color: '#ff0000', laps: 0,
    lastPassedFinish: false, ready: false, checkpointHit: false,
    steering: 0, currentLapTime: 0, bestLapTime: Infinity
};

function formatTime(ms) {
    if (ms === null || ms === undefined || ms === Infinity) return "--:--.--";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

const trackPresets = {
    preset1: { 
        points: [{x: 3000, y: 1000}, {x: 7000, y: 1000}, {x: 8500, y: 2500}, {x: 10000, y: 1000}, {x: 12000, y: 3000}, {x: 10500, y: 4500}, {x: 13000, y: 6000}, {x: 11000, y: 8000}, {x: 8000, y: 6500}, {x: 7000, y: 9000}, {x: 5000, y: 7000}, {x: 3000, y: 9500}, {x: 1500, y: 7500}, {x: 2500, y: 5000}, {x: 800, y: 4500}, {x: 800, y: 1000}, {x: 3000, y: 1000}]
    },
    preset2: { 
        points: [{x: 3000, y: 1000}, {x: 10000, y: 1000}, {x: 13000, y: 2000}, {x: 14000, y: 5000}, {x: 12000, y: 8500}, {x: 9000, y: 9500}, {x: 6000, y: 8000}, {x: 4000, y: 9500}, {x: 1000, y: 8500}, {x: 500, y: 5000}, {x: 800, y: 1000}, {x: 3000, y: 1000}]
    },
    preset3: { 
        points: [{x: 3000, y: 1000}, {x: 9000, y: 1000}, {x: 9000, y: 2500}, {x: 2000, y: 2500}, {x: 2000, y: 4000}, {x: 11000, y: 4000}, {x: 11000, y: 5500}, {x: 1500, y: 5500}, {x: 1500, y: 7000}, {x: 12000, y: 7000}, {x: 12000, y: 8500}, {x: 1000, y: 8500}, {x: 1000, y: 1000}, {x: 3000, y: 1000}]
    },
    preset4: { 
        points: [{x: 3000, y: 1000}, {x: 6000, y: 1000}, {x: 4000, y: 2500}, {x: 8000, y: 2500}, {x: 6000, y: 4500}, {x: 10000, y: 4500}, {x: 8000, y: 6500}, {x: 12000, y: 6500}, {x: 1000, y: 8000}, {x: 1000, y: 1000}, {x: 3000, y: 1000}]
    },
    preset5: { 
        points: [{x: 3000, y: 1000}, {x: 10000, y: 1000}, {x: 12000, y: 5000}, {x: 10000, y: 9000}, {x: 4000, y: 9000}, {x: 2000, y: 5000}, {x: 4000, y: 2500}, {x: 8000, y: 2500}, {x: 9000, y: 5000}, {x: 8000, y: 7500}, {x: 4000, y: 7500}, {x: 800, y: 1000}, {x: 3000, y: 1000}]
    }
};

// 1. ИНИЦИАЛИЗАЦИЯ БАЗОВОЙ ТРАССЫ (до всех функций)
let trackData = trackPresets.preset1;
let trackPoints = trackPresets.preset1.points;
let trackHazards = { nitro: [] };

function generateHazardsForTrack(points) {
    if (!points || points.length < 4) return { nitro: [] };
    const hazards = { nitro: [] };
    
    // Проходим по сегментам
    for (let i = 1; i < points.length - 2; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const p3 = points[i+2];
        if (!p1 || !p2 || !p3) continue;
        
        // Угол текущего сегмента
        const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        // Угол следующего сегмента
        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        
        // Разница углов (насколько резкий поворот впереди)
        let diff = Math.abs(angle1 - angle2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        
        // Ставим нитро только если впереди нет резкого поворота (разница < 0.3 радиан ~ 17 градусов)
        // И только на достаточно длинных участках
        const segmentLen = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        
        if (diff < 0.3 && segmentLen > 1000) {
            const t = 0.5; // Ставим ровно посередине прямого участка
            const hx = p1.x + (p2.x - p1.x) * t;
            const hy = p1.y + (p2.y - p1.y) * t;
            
            hazards.nitro.push({ x: hx, y: hy, angle: angle1 });
        }
    }
    return hazards;
}

// Теперь инициализируем опасности
trackHazards = generateHazardsForTrack(trackPoints);

const roadWidth = 400; 

function distToSegment(p, v, w) {
    if (!v || !w) return 10000;
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

function checkOffRoad(x, y) {
    if (!trackPoints || trackPoints.length < 2) return true;
    let minDistance = 50000;
    for (let i = 0; i < trackPoints.length - 1; i++) {
        const dist = distToSegment({x, y}, trackPoints[i], trackPoints[i+1]);
        if (dist < minDistance) minDistance = dist;
    }
    return minDistance > roadWidth / 2;
}

const scenery = [];
const tribunes = [];
let lastCheerTime = 0;

function generateScenery() {
    scenery.length = 0; // Очищаем старые деревья
    tribunes.length = 0;

    // Генерируем трибуны вдоль трассы
    for (let i = 0; i < trackPoints.length - 1; i++) {
        const p1 = trackPoints[i];
        const p2 = trackPoints[i+1];
        const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        
        // Ставим трибуну на каждом 3-м сегменте для разнообразия
        if (i % 3 === 0 && dist > 1500) {
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            // Смещение от центра дороги (на обочину)
            const offX = Math.cos(angle + Math.PI/2) * (roadWidth/2 + 100);
            const offY = Math.sin(angle + Math.PI/2) * (roadWidth/2 + 100);
            
            tribunes.push({ 
                x: midX + offX, 
                y: midY + offY, 
                angle: angle,
                fans: Array.from({length: 30}, () => ({
                    offset: Math.random() * 200,
                    color: `hsl(${Math.random()*360}, 70%, 50%)`,
                    jumpOffset: Math.random() * Math.PI
                }))
            });
        }
    }

    for (let i = 0; i < 1200; i++) {
        let x = Math.random() * 18000 - 3000;
        let y = Math.random() * 14000 - 3000;
        if (checkOffRoad(x, y)) {
            // Проверка, чтобы деревья не попадали на трибуны
            const nearTribune = tribunes.some(t => Math.sqrt(Math.pow(x - t.x, 2) + Math.pow(y - t.y, 2)) < 300);
            if (!nearTribune) {
                scenery.push({ 
                    x, y, size: 40 + Math.random() * 80, 
                    type: Math.random() > 0.4 ? 'tree' : 'bush',
                    color: `hsl(${100 + Math.random() * 40}, ${40 + Math.random() * 30}%, ${20 + Math.random() * 20}%)`
                });
            }
        }
    }
}

function playCheer() {
    if (!engineEnabled || audioCtx.state === 'suspended') return;
    const now = Date.now();
    if (now - lastCheerTime < 3000) return; // Не частим
    lastCheerTime = now;

    const duration = 2.0;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i/bufferSize);
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1.5;
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1 * engineVolume, audioCtx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
}
generateScenery();

// --- ИГРОВОЙ ЦИКЛ ---
const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, 
    w: false, W: false, s: false, S: false, a: false, A: false, d: false, D: false, 
    Enter: false, ' ': false, // Добавляем пробел и регистры
    'ц': false, 'Ц': false, 'ы': false, 'Ы': false, 'ф': false, 'Ф': false, 'в': false, 'В': false // Русская раскладка
};

window.addEventListener('keydown', (e) => { 
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true; 
    
    // Переключение меню ESC
    if (e.key === 'Escape' && gameStarted) {
        const isVisible = pauseMenu.style.display === 'block';
        pauseMenu.style.display = isVisible ? 'none' : 'block';
    }

    // Энтер или Пробел для создания гонки
    if ((e.key === 'Enter' || e.key === ' ') && !gameStarted) {
        if (createMenu && createMenu.classList.contains('active')) createRoom();
    }

    if (emojiMap[e.key] && gameStarted) {
        socket.emit('sendEmoji', emojiMap[e.key]);
    }
});

resumeBtn.addEventListener('click', () => {
    pauseMenu.style.display = 'none';
});

endRaceBtn.addEventListener('click', () => {
    socket.emit('forceReset');
    pauseMenu.style.display = 'none';
});
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

const forceStartAudio = () => {
    initAudio(); if (musicEnabled) playMusic(); audioCtx.resume();
    window.removeEventListener('mousedown', forceStartAudio);
};
window.addEventListener('mousedown', forceStartAudio);

function updateLobbyUI() {
    if (!gameStarted || gameState !== 'LOBBY') {
        if (lobbyUi) lobbyUi.style.display = 'none';
        return;
    }

    if (lobbyUi) {
        lobbyUi.style.display = 'block';
        lobbyPlayerList.innerHTML = '';
        
        const playerArray = Object.values(players);
        playerArray.forEach(p => {
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.background = 'rgba(255,255,255,0.1)';
            div.style.borderLeft = `5px solid ${p.color}`;
            // Добавляем значок короны для хоста
            const hostIcon = p.isHost ? ' 👑' : '';
            div.innerHTML = `<strong>${p.nickname}</strong> ${hostIcon} ${p.id === socket.id ? '(You)' : ''}`;
            lobbyPlayerList.appendChild(div);
        });

        // Проверяем статус хоста в локальном объекте (приходит с сервера)
        const isHost = localPlayer.isHost;
        
        if (isHost) {
            forceStartBtn.style.display = 'block';
            notHostMsg.style.display = 'none';
        } else {
            forceStartBtn.style.display = 'none';
            notHostMsg.style.display = 'block';
        }
    }
}

forceStartBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('connect', () => { myId = socket.id; localPlayer.id = myId; });
socket.on('currentPlayers', (serverPlayers) => { players = serverPlayers; updateColorUI(); updateLobbyUI(); });
socket.on('playerUpdated', (playerInfo) => { 
    players[playerInfo.id] = playerInfo; 
    if (playerInfo.id === socket.id) { 
        // Если мы только зашли (x=2800) или стоим, обновляем позицию с сервера
        if (localPlayer.x === 2800 || localPlayer.speed === 0 || gameState === 'LOBBY') {
            localPlayer.x = playerInfo.x; 
            localPlayer.y = playerInfo.y; 
            localPlayer.angle = playerInfo.angle; 
        }
        localPlayer.laps = playerInfo.laps; 
        localPlayer.ready = true; 
        localPlayer.color = playerInfo.color; 
        localPlayer.roomId = playerInfo.roomId; 
        localPlayer.isHost = playerInfo.isHost; // СОХРАНЯЕМ СТАТУС ХОСТА
        if (playerInfo.bestLapTime !== undefined) localPlayer.bestLapTime = playerInfo.bestLapTime;
    } 
    updateColorUI(); 
    updateLobbyUI();
});
socket.on('playerMoved', (playerInfo) => { if (players[playerInfo.id]) { players[playerInfo.id].x = playerInfo.x; players[playerInfo.id].y = playerInfo.y; players[playerInfo.id].angle = playerInfo.angle; } });
socket.on('updateTargetLaps', (laps) => { targetLaps = laps; if (lapCountSelect) lapCountSelect.value = laps; });
socket.on('updateTrack', (data) => { 
    if (!data) return;
    console.log("Receiving track data from server...");
    
    // Обновляем только если трасса действительно изменилась
    if (JSON.stringify(trackData) !== JSON.stringify(data)) {
        trackData = data;
        trackPoints = data.points || (Array.isArray(data) ? data : trackPresets.preset1.points); 
        trackHazards = data.hazards || { nitro: [] };
        console.log("Track updated! Points:", trackPoints.length);
        generateScenery(); 
    }
});
socket.on('emojiReceived', ({ id, emoji }) => {
    activeEmojis.push({ id, emoji, life: 2.0, yOffset: 0 });
});
socket.on('gameStateUpdate', (state, winners) => { 
    gameState = state; 
    if (winners) winnersList = winners; 
    if (gameStarted && musicEnabled) playMusic(); 
    
    if (state === 'RACING') {
        localPlayer.currentLapTime = 0; 
    }

    if (state === 'LOBBY') { 
        // В лобби комнаты мы НЕ показываем основное меню и НЕ сбрасываем gameStarted
        if (pauseMenu) pauseMenu.style.display = 'none';
        localPlayer.laps = 0; localPlayer.speed = 0; fireworks = []; wheelParticles = [];
        localPlayer.currentLapTime = 0; localPlayer.bestLapTime = Infinity;
        if (currentLapEl) currentLapEl.textContent = `LAP: 00:00.00`;
        if (bestLapEl) bestLapEl.textContent = `BEST: --:--.--`;
        const rBtn = document.getElementById('resetBtn'); if (rBtn) rBtn.remove(); 
    } 
    updateLobbyUI();
});

socket.on('backToMainMenu', () => {
    gameStarted = false;
    gameState = 'LOBBY';
    ui.style.display = 'block';
    mainMenu.classList.add('active');
    createMenu.classList.remove('active');
    joinMenu.classList.remove('active');
    
    // Скрываем игровой интерфейс
    document.getElementById('speedometer').style.display = 'none';
    document.getElementById('lap-counter').style.display = 'none';
    document.getElementById('lap-timer').style.display = 'none';
    document.getElementById('zoom-controls').style.display = 'none';
    
    // Сбрасываем игрока
    localPlayer.ready = false;
    players = {};
    updateLobbyUI();
});
socket.on('playerDisconnected', (id) => { 
    delete players[id]; 
    updateColorUI(); 
    updateLobbyUI(); // ОБНОВЛЯЕМ СПИСОК В ЛОББИ ПРИ ВЫХОДЕ ИГРОКА
});

function updateColorUI() { 
    carOptions.forEach(opt => { 
        // Цвет занят, если его выбрал любой ДРУГОЙ игрок в лобби (даже если он еще не нажал Start)
        const isTakenByOther = Object.values(players).some(p => p.id !== myId && p.color === opt.dataset.color); 
        opt.style.opacity = isTakenByOther ? '0.3' : '1'; 
        opt.style.pointerEvents = isTakenByOther ? 'none' : 'auto'; 
        opt.style.filter = isTakenByOther ? 'grayscale(1)' : 'none'; 
        
        // Подсвечиваем НАШ выбранный цвет
        if (opt.dataset.color === localPlayer.color) {
            opt.style.borderColor = '#55ff55';
            opt.style.boxShadow = '0 0 15px #55ff55';
        } else {
            opt.style.borderColor = '#555';
            opt.style.boxShadow = 'none';
        }
    }); 
}

function update() {
    if (!gameStarted) return;
    
    if (gameState === 'LOBBY') {
        const moveUp = keys.w || keys.W || keys.ArrowUp || keys.ц || keys.Ц || keys.Enter || keys[' '];
        const isHost = (localPlayer.roomId === socket.id);
        
        if (moveUp && isHost) {
            console.log("Host is starting the race...");
            socket.emit('startGame');
        }
        updateEngineSound(0); return;
    }
    if (gameState === 'FINISHED') { updateEngineSound(0); updateFireworks(); return; }

    let currentMaxSpeed = MAX_SPEED;
    const isOffRoad = checkOffRoad(localPlayer.x, localPlayer.y);
    if (isOffRoad) currentMaxSpeed = OFF_ROAD_SPEED;

    // 1. УСКОРЕНИЕ И ТОРМОЖЕНИЕ
    const moveUp = keys.w || keys.W || keys.ArrowUp || keys.ц || keys.Ц;
    const moveDown = keys.s || keys.S || keys.ArrowDown || keys.ы || keys.Ы;
    
    if (moveUp) localPlayer.speed += ACCEL;
    else if (moveDown) localPlayer.speed -= ACCEL;
    localPlayer.speed *= FRICTION;

    // ... (остальное без изменений)

    // 4. РУЛЕВОЕ УПРАВЛЕНИЕ
    const leftPressed = keys.a || keys.A || keys.ArrowLeft || keys.ф || keys.Ф;
    const rightPressed = keys.d || keys.D || keys.ArrowRight || keys.в || keys.В;
    const steerTarget = leftPressed ? -1 : (rightPressed ? 1 : 0);
    localPlayer.steering = (localPlayer.steering || 0) + (steerTarget - (localPlayer.steering || 0)) * 0.4;

    if (Math.abs(totalSpeed) > 0.1) {
        const turnDir = totalSpeed > 0 ? 1 : -1;
        const speedFactor = Math.max(0.7, 1.0 - (Math.abs(totalSpeed) / (MAX_SPEED + 15)) * 0.3);
        localPlayer.angle += (localPlayer.steering * TURN_SPEED * turnDir * speedFactor);
    }

    if (localPlayer.speed > currentMaxSpeed) localPlayer.speed = currentMaxSpeed;
    if (localPlayer.speed < -currentMaxSpeed/2) localPlayer.speed = -currentMaxSpeed/2;

    localPlayer.x += Math.cos(localPlayer.angle) * totalSpeed;
    localPlayer.y += Math.sin(localPlayer.angle) * totalSpeed;
    
    // 5. ЧАСТИЦЫ (Дым/Пыль)
    if (Math.abs(totalSpeed) > 5) {
        const pColor = isOffRoad ? '#8b4513' : '#ddd'; // Коричневый на траве, серый на асфальте
        if (Math.random() < 0.3) {
            wheelParticles.push({
                x: localPlayer.x - Math.cos(localPlayer.angle) * 40,
                y: localPlayer.y - Math.sin(localPlayer.angle) * 40,
                vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
                life: 1.0, color: pColor, size: 5 + Math.random() * 10
            });
        }
    }
    wheelParticles.forEach((p, idx) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.03; p.size += 0.5;
        if (p.life <= 0) wheelParticles.splice(idx, 1);
    });

    // 6. ОБНОВЛЕНИЕ ЭМОДЗИ
    activeEmojis.forEach((e, idx) => {
        e.life -= 0.01; e.yOffset -= 1;
        if (e.life <= 0) activeEmojis.splice(idx, 1);
    });

    updateEngineSound(totalSpeed);
    
    // Проверка близости к трибунам для звука
    tribunes.forEach(t => {
        const d = Math.sqrt(Math.pow(localPlayer.x - t.x, 2) + Math.pow(localPlayer.y - t.y, 2));
        if (d < 600) playCheer();
    });
    
    if (speedValueEl) {
        const displaySpeed = Math.floor(Math.abs(totalSpeed) * 10.0);
        speedValueEl.textContent = displaySpeed;
        speedValueEl.style.color = displaySpeed > 250 ? '#f55' : (displaySpeed > 150 ? '#ff5' : '#5f5');
    }

    if (lapValueEl) {
        lapValueEl.textContent = `LAP ${localPlayer.laps}/${targetLaps}`;
    }

    // Чекпоинт
    const midPointIdx = Math.floor(trackPoints.length / 2);
    const checkpoint = trackPoints[midPointIdx];
    const distToCheckpoint = Math.sqrt(Math.pow(localPlayer.x - checkpoint.x, 2) + Math.pow(localPlayer.y - checkpoint.y, 2));
    if (distToCheckpoint < 1500) localPlayer.checkpointHit = true;

    // Таймер круга
    if (gameState === 'RACING') {
        localPlayer.currentLapTime += 1000/60; // Примерно 16.6ms на кадр (60fps)
        if (currentLapEl) currentLapEl.textContent = `LAP: ${formatTime(localPlayer.currentLapTime)}`;
    }

    const fx = trackPoints[0].x;
    const fy = trackPoints[0].y;
    const onFinishLine = Math.abs(localPlayer.x - fx) < 100 && Math.abs(localPlayer.y - fy) < roadWidth/2;
    if (onFinishLine && !localPlayer.lastPassedFinish && totalSpeed > 0 && localPlayer.checkpointHit) {
        // Обработка времени круга
        if (localPlayer.bestLapTime === null || localPlayer.bestLapTime === Infinity || localPlayer.currentLapTime < localPlayer.bestLapTime) {
            localPlayer.bestLapTime = localPlayer.currentLapTime;
            if (bestLapEl) bestLapEl.textContent = `BEST: ${formatTime(localPlayer.bestLapTime)}`;
        }
        localPlayer.currentLapTime = 0;
        
        socket.emit('lapCompleted', { bestLapTime: localPlayer.bestLapTime });
        localPlayer.lastPassedFinish = true; localPlayer.checkpointHit = false;
    } else if (!onFinishLine) {
        localPlayer.lastPassedFinish = false;
    }

    if (gameState === 'RACING') {
        socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, angle: localPlayer.angle });
    }
}

function updateFireworks() {
    if (Math.random() < 0.1) {
        fireworks.push({ x: Math.random() * canvas.width, y: canvas.height, targetY: Math.random() * (canvas.height / 2), color: `hsl(${Math.random() * 360}, 100%, 50%)`, particles: [] });
    }
    fireworks.forEach((f, idx) => {
        if (f.y > f.targetY) f.y -= 5;
        else if (f.particles.length === 0) {
            for (let i = 0; i < 30; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 4 + 2;
                f.particles.push({ x: f.x, y: f.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0 });
            }
        } else {
            f.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; });
            f.particles = f.particles.filter(p => p.life > 0);
            if (f.particles.length === 0) fireworks.splice(idx, 1);
        }
    });
}

function drawTrack() {
    if (!trackPoints || trackPoints.length < 2) return;
    
    // 1. Трава
    ctx.fillStyle = '#1a5e1a';
    ctx.fillRect(-10000, -10000, 30000, 30000);
    
    scenery.forEach(s => {
        ctx.fillStyle = s.color;
        if (s.type === 'tree') {
            ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.ellipse(s.x, s.y, s.size, s.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        }
    });

    ctx.lineCap = 'butt'; // Строгие прямоугольные края линий
    ctx.lineJoin = 'round';
    
    const path = new Path2D();
    path.moveTo(trackPoints[0].x, trackPoints[0].y);
    trackPoints.forEach(p => path.lineTo(p.x, p.y));
    path.closePath();

    // 2. Внешняя зона (темный гравий/бетон)
    ctx.lineWidth = roadWidth + 60;
    ctx.strokeStyle = '#222';
    ctx.stroke(path);

    // 3. БЕЛЫЕ ПОРЕБРИКИ (прерывистые, по краям асфальта)
    ctx.setLineDash([100, 100]);
    ctx.lineWidth = roadWidth + 30;
    ctx.strokeStyle = '#ffffff'; 
    ctx.stroke(path);
    ctx.setLineDash([]);

// 4. ОСНОВНОЙ АСФАЛЬТ (Светло-серый гранит для лучшей видимости масла)
    ctx.lineWidth = roadWidth;
    ctx.strokeStyle = '#444'; 
    ctx.stroke(path);

    // 5. Осевая разметка (пунктир)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 4;
    ctx.setLineDash([40, 120]);
    ctx.stroke(path);
    ctx.setLineDash([]);

    // ФИНИШ (ИДЕАЛЬНЫЙ ПОПЕРЕЧНЫЙ)
    ctx.save();
    ctx.translate(trackPoints[0].x, trackPoints[0].y);
    
    // Автоматический разворот финишной линии перпендикулярно дороге
    const pNext = trackPoints[1];
    const angle = Math.atan2(pNext.y - trackPoints[0].y, pNext.x - trackPoints[0].x);
    ctx.rotate(angle); // Теперь линия стоит строго поперек дороги
    
    const checkerSize = 50;
    const rows = 2;
    const totalLineWidth = rows * checkerSize;
    const roadHalfWidth = roadWidth / 2 + 100; // Широкий охват всей трассы

    for (let y = -roadHalfWidth; y < roadHalfWidth; y += checkerSize) {
        for (let x = 0; x < rows; x++) {
            ctx.fillStyle = (Math.floor(y / checkerSize) + x) % 2 === 0 ? '#fff' : '#000';
            ctx.fillRect(x * checkerSize - totalLineWidth/2, y, checkerSize, checkerSize);
        }
    }
    ctx.restore();
    drawCrowd();
}

function drawCrowd() {
    tribunes.forEach(t => {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        
        // Сама конструкция трибуны
        ctx.fillStyle = '#444';
        ctx.fillRect(-300, -25, 600, 50);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-300, -25, 600, 50);
        
        // Зрители
        t.fans.forEach((fan, idx) => {
            ctx.fillStyle = fan.color;
            ctx.beginPath();
            // Зрители прыгают от радости
            const jump = Math.sin(Date.now()*0.01 + fan.jumpOffset) * 5;
            ctx.arc(-280 + (idx * 20), jump, 8, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    });
}

function drawHazards() {
    if (!trackHazards || !trackHazards.nitro) return;
    
    // Нитро (желтые стрелки)
    trackHazards.nitro.forEach(n => {
        ctx.save();
        ctx.translate(n.x, n.y);
        // Поворачиваем стрелку по направлению дороги
        // Изначально стрелка рисуется "вверх", поэтому добавляем PI/2
        if (n.angle !== undefined) ctx.rotate(n.angle + Math.PI / 2);
        
        ctx.shadowBlur = 20; ctx.shadowColor = '#ffff00';
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.moveTo(-40, 40); ctx.lineTo(0, -40); ctx.lineTo(40, 40); ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });
}

function drawParticles() {
    wheelParticles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawEmojis() {
    activeEmojis.forEach(e => {
        const p = (e.id === myId) ? localPlayer : players[e.id];
        if (!p || !p.ready) return;
        ctx.save();
        ctx.font = '50px serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, e.life * 2);
        ctx.fillText(e.emoji, p.x, p.y - 100 + e.yOffset);
        ctx.restore();
    });
}

function drawCar(player) {
    if (!player.ready) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    // Большая машина 100x60
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-45, -25, 100, 60); 
    ctx.fillStyle = player.color || '#f00'; ctx.fillRect(-50, -30, 100, 60); 
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-10, -25, 40, 50); 
    ctx.fillStyle = '#000'; 
    ctx.fillRect(-45, -38, 25, 12); ctx.fillRect(20, -38, 25, 12);
    ctx.fillRect(-45, 26, 25, 12); ctx.fillRect(20, 26, 25, 12);
    
    ctx.restore();
    
    // Адаптивный размер текста в зависимости от зума
    const fontSize = Math.max(20, 28 / zoomLevel);
    const textOffset = Math.max(50, 70 / zoomLevel);
    
    ctx.fillStyle = '#fff'; ctx.font = `bold ${fontSize}px Courier New`; ctx.textAlign = 'center';
    ctx.shadowBlur = 8; ctx.shadowColor = 'black';
    ctx.fillText(`${player.nickname}`, player.x, player.y - textOffset);
    ctx.shadowBlur = 0;
}

function drawPodium() {
    const cx = canvas.width / 2, cy = canvas.height / 2 + 100;
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 150, cy, 100, 100); ctx.fillRect(cx - 50, cy - 50, 100, 150); ctx.fillRect(cx + 50, cy + 50, 100, 50); 
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Courier New'; ctx.textAlign = 'center';
    ctx.fillText('2', cx - 100, cy + 40); ctx.fillText('1', cx, cy - 10); ctx.fillText('3', cx + 100, cy + 85);
    winnersList.forEach((winner, i) => {
        if (i > 2) return;
        let px = cx, py = cy;
        if (i === 0) { px = cx; py = cy - 80; } else if (i === 1) { px = cx - 100; py = cy - 30; } else if (i === 2) { px = cx + 100; py = cy + 20; }
        ctx.fillStyle = winner.color; ctx.fillRect(px - 15, py, 30, 40); 
        ctx.fillStyle = '#ffdbac'; ctx.beginPath(); ctx.arc(px, py - 10, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '14px Courier New'; ctx.fillText(winner.nickname, px, py - 35);
    });
    if (!document.getElementById('resetBtn')) {
        const btn = document.createElement('button');
        btn.id = 'resetBtn'; btn.textContent = 'RESTART TO LOBBY';
        btn.style.position = 'absolute'; btn.style.top = '80%'; btn.style.left = '50%'; btn.style.transform = 'translate(-50%, -50%)';
        btn.classList.add('audio-btn'); btn.style.padding = '20px 40px'; btn.style.fontSize = '20px';
        btn.addEventListener('click', () => { socket.emit('resetGame'); btn.remove(); });
        document.getElementById('game-container').appendChild(btn);
    }
}

function render() {
    try {
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (!trackPoints || trackPoints.length < 2 || !localPlayer) {
            ctx.fillStyle = '#1a5e1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '20px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('LOADING TRACK DATA...', canvas.width/2, canvas.height/2);
            requestAnimationFrame(render);
            return;
        }

        // Плавная интерполяция зума (0.1 - коэффициент мягкости)
        zoomLevel += (targetZoom - zoomLevel) * 0.1;

        ctx.save();
        
        // Центрируем камеру
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoomLevel, zoomLevel);
        
        // Плавное следование камеры за игроком (интерполяция позиции)
        const targetCamX = localPlayer.x + cameraOffsetX;
        const targetCamY = localPlayer.y + cameraOffsetY;
        
        // Коэффициент 0.25 убирает дерганья, успевая за быстрым болидом
        cameraX += (targetCamX - cameraX) * 0.25;
        cameraY += (targetCamY - cameraY) * 0.25;
        
        ctx.translate(-cameraX, -cameraY);
        
        drawTrack();
        drawHazards();
        drawParticles();
        
        Object.keys(players).forEach(id => { if (id !== myId) drawCar(players[id]); });
        if (gameStarted && localPlayer.ready) drawCar(localPlayer);
        
        drawEmojis(); 
        
        if (gameState === 'FINISHED') drawFireworks();
        ctx.restore();

        if (gameState === 'LOBBY') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 40px Courier New'; ctx.textAlign = 'center';
            ctx.fillText('GRAND PRIX LOBBY', canvas.width/2, canvas.height/2 - 50);
            
            const isHost = (localPlayer.roomId === socket.id);
            ctx.font = '24px Courier New';
            if (isHost) {
                 ctx.fillStyle = '#55ff55';
                 ctx.fillText('YOU ARE THE HOST', canvas.width/2, canvas.height/2);
                 ctx.fillStyle = '#fff';
                 ctx.fillText('PRESS "W" OR START BUTTON', canvas.width/2, canvas.height/2 + 50);
            } else {
                 ctx.fillStyle = '#aaa';
                 ctx.fillText('WAITING FOR HOST TO START...', canvas.width/2, canvas.height/2);
            }
            
            ctx.font = '16px Courier New'; ctx.fillStyle = '#888';
            ctx.fillText('USE MOUSE WHEEL TO ZOOM', canvas.width/2, canvas.height/2 + 100);
        } else if (gameState === 'FINISHED') {
            ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawPodium();
        }

        if (gameStarted && gameState !== 'FINISHED') {
            drawMinimap();
            drawLeaderboard();
        }

        requestAnimationFrame(() => { update(); render(); });
    } catch (err) {
        console.error("Render error:", err);
        requestAnimationFrame(render);
    }
}

function drawMinimap() {
    const mapSize = 220;
    const padding = 20;
    const x = padding;
    const y = canvas.height - mapSize - padding;

    // Фон миникарты
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x, y, mapSize, mapSize);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, mapSize, mapSize);

    // ВЫЧИСЛЯЕМ ГРАНИЦЫ ТРАССЫ ДЛЯ ИДЕАЛЬНОГО ЦЕНТРИРОВАНИЯ
    const xs = trackPoints.map(p => p.x);
    const ys = trackPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const trackWidth = maxX - minX || 1;
    const trackHeight = maxY - minY || 1;

    // Масштабирование (с запасом 30px на отступы)
    const innerPadding = 20;
    const availableSize = mapSize - innerPadding * 2;
    const scale = availableSize / Math.max(trackWidth, trackHeight);

    // Смещения для центрирования
    const centerOffsetX = (availableSize - trackWidth * scale) / 2;
    const centerOffsetY = (availableSize - trackHeight * scale) / 2;

    const toMapX = (worldX) => x + innerPadding + centerOffsetX + (worldX - minX) * scale;
    const toMapY = (worldY) => y + innerPadding + centerOffsetY + (worldY - minY) * scale;

    // Трасса
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.moveTo(toMapX(trackPoints[0].x), toMapY(trackPoints[0].y));
    trackPoints.forEach(p => ctx.lineTo(toMapX(p.x), toMapY(p.y)));
    ctx.stroke();

    // Линия финиша на миникарте
    const fx = toMapX(trackPoints[0].x);
    const fy = toMapY(trackPoints[0].y);
    const fSize = (roadWidth / 2) * scale;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy - fSize);
    ctx.lineTo(fx, fy + fSize);
    ctx.stroke();

    // Соперники
    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.ready || id === myId) return;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(toMapX(p.x), toMapY(p.y), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Ты
    if (localPlayer.ready) {
        ctx.fillStyle = localPlayer.color;
        ctx.beginPath();
        ctx.arc(toMapX(localPlayer.x), toMapY(localPlayer.y), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawLeaderboard() {
    const playerArray = Object.values(players).filter(p => p.ready);
    if (playerArray.length === 0) return;

    // Сортировка: сначала финишировавшие, затем по кругам
    playerArray.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (b.laps !== a.laps) return b.laps - a.laps;
        // Если круги одинаковые, сортируем по лучшему времени (если оно есть)
        if (a.bestLapTime !== b.bestLapTime) return a.bestLapTime - b.bestLapTime;
        return 0;
    });

    const x = 20;
    const y = 100;
    const itemHeight = 35;
    const width = 280; // Увеличили ширину для времени
    const height = playerArray.length * itemHeight + 50;

    // Фон таблицы
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // Заголовок
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('STANDINGS', x + 10, y + 25);
    ctx.textAlign = 'right';
    ctx.fillText('BEST', x + width - 10, y + 25);
    ctx.textAlign = 'left';
    
    // Линия под заголовком
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 35);
    ctx.lineTo(x + width - 10, y + 35);
    ctx.stroke();

    playerArray.forEach((p, i) => {
        const py = y + 65 + i * itemHeight;
        
        // Подсветка локального игрока
        if (p.id === myId) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(x + 2, py - 22, width - 4, itemHeight - 4);
        }

        // Позиция
        ctx.fillStyle = i === 0 ? '#ffd700' : '#fff'; // Золотой для первого места
        ctx.font = '14px Courier New';
        ctx.fillText(`${i + 1}`, x + 10, py);

        // Цветная точка (машина)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x + 35, py - 5, 6, 0, Math.PI * 2);
        ctx.fill();

        // Никнейм + Круги
        ctx.fillStyle = '#fff';
        const nickname = p.nickname || 'Guest';
        const lapInfo = ` (L${p.laps})`;
        const displayName = nickname.length > 8 ? nickname.substring(0, 8) + '..' : nickname;
        ctx.fillText(displayName + lapInfo, x + 50, py);

        // Лучшее время
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffff55';
        ctx.fillText(formatTime(p.bestLapTime), x + width - 10, py);
        ctx.textAlign = 'left';
    });
}

musicVolumeSlider.addEventListener('input', (e) => { musicVolume = parseFloat(e.target.value); bgMusic.volume = musicVolume; });
musicTrackSelect.addEventListener('change', (e) => { currentTrackIdx = parseInt(e.target.value); playMusic(); });
engineVolumeSlider.addEventListener('input', (e) => { engineVolume = parseFloat(e.target.value); });
toggleMusicBtn.addEventListener('click', () => { musicEnabled = !musicEnabled; toggleMusicBtn.textContent = `Music: ${musicEnabled ? 'ON' : 'OFF'} ▾`; if (musicEnabled) playMusic(); else bgMusic.pause(); });
toggleEngineBtn.addEventListener('click', () => { engineEnabled = !engineEnabled; toggleEngineBtn.textContent = `Engine: ${engineEnabled ? 'ON' : 'OFF'} ▾`; });

render();
