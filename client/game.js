// --- PIXEL RACING v1.9 ULTRA-STABLE ENGINE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// --- 1. БАЗОВЫЕ ПЕРЕМЕННЫЕ ---
let localPlayer = {
    id: null, x: 2800, y: 1000, angle: 0, speed: 0,
    nickname: '', color: '#ff0000', laps: 0,
    lastPassedFinish: false, ready: false,
    steering: 0, currentLapTime: 0, bestLapTime: Infinity,
    isHost: false, colorInitialized: false,
    exhaust: [], nitroCharge: 100, maxNitroCharge: 100
};

const trackPresets = {
    preset1: { points: [{x: 3000, y: 1000}, {x: 7000, y: 1000}, {x: 8500, y: 2500}, {x: 10000, y: 1000}, {x: 12000, y: 3000}, {x: 10500, y: 4500}, {x: 13000, y: 6000}, {x: 11000, y: 8000}, {x: 8000, y: 6500}, {x: 7000, y: 9000}, {x: 5000, y: 7000}, {x: 3000, y: 9500}, {x: 1500, y: 7500}, {x: 2500, y: 5000}, {x: 800, y: 4500}, {x: 800, y: 1000}, {x: 3000, y: 1000}] },
    preset2: { points: [{x: 3000, y: 1000}, {x: 10000, y: 1000}, {x: 13000, y: 2000}, {x: 14000, y: 5000}, {x: 12000, y: 8500}, {x: 9000, y: 9500}, {x: 6000, y: 8000}, {x: 4000, y: 9500}, {x: 1000, y: 8500}, {x: 500, y: 5000}, {x: 800, y: 1000}, {x: 3000, y: 1000}] },
    preset3: { points: [{x: 3000, y: 1000}, {x: 9000, y: 1000}, {x: 9000, y: 2500}, {x: 2000, y: 2500}, {x: 2000, y: 4000}, {x: 11000, y: 4000}, {x: 11000, y: 5500}, {x: 1500, y: 5500}, {x: 1500, y: 7000}, {x: 12000, y: 7000}, {x: 12000, y: 8500}, {x: 1000, y: 8500}, {x: 1000, y: 1000}, {x: 3000, y: 1000}] },
    preset4: { points: [{x: 3000, y: 1000}, {x: 6000, y: 1000}, {x: 4000, y: 2500}, {x: 8000, y: 2500}, {x: 6000, y: 4500}, {x: 10000, y: 4500}, {x: 8000, y: 6500}, {x: 12000, y: 6500}, {x: 1000, y: 8000}, {x: 1000, y: 1000}, {x: 3000, y: 1000}] },
    preset5: { points: [{x: 3000, y: 1000}, {x: 10000, y: 1000}, {x: 12000, y: 5000}, {x: 10000, y: 9000}, {x: 4000, y: 9000}, {x: 2000, y: 5000}, {x: 4000, y: 2500}, {x: 8000, y: 2500}, {x: 9000, y: 5000}, {x: 8000, y: 7500}, {x: 4000, y: 7500}, {x: 800, y: 1000}, {x: 3000, y: 1000}] }
};

let players = {}, gameState = 'LOBBY', gameStarted = false, targetLaps = 5;
let trackPoints = trackPresets.preset1.points, trackHazards = { nitro: [] }, scenery = [], tribunes = [];
const roadWidth = 450; // Чуть увеличим для солидности

let bullets = [];
let lastShotTime = 0;
const SHOT_COOLDOWN = 200; // мс между выстрелами

let zoomLevel = 0.8, targetZoom = 0.8;
const minZoom = 0.02, maxZoom = 4.0;
let cameraX = 2800, cameraY = 1000;
let isDragging = false, lastMouseX = 0, lastMouseY = 0;
let cameraManualMode = false, manualCameraTimeout = null;

let musicEnabled = true, engineEnabled = true, musicVolume = 0.5, engineVolume = 0.5, currentTrackIdx = Math.floor(Math.random() * 6);
const tracks = ["audio/01_-nine-thou-superstars-remix.mp3", "audio/02_-do-ya-thang.mp3", "audio/03_-i-am-rock.mp3", "audio/04_-in-a-hood-near-you.mp3", "audio/05_-lets-move.mp3", "audio/07_-fired-up.mp3"];

let audioCtx = null, engineOsc = null, engineGain = null;
let fireworks = [];
let podiumWinners = [];

// --- 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const isF = (n) => Number.isFinite(n);
const formatTime = (ms) => {
    if (!ms || ms === Infinity) return "--:--.--";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}.${Math.floor((ms%1000)/10).toString().padStart(2,'0')}`;
};

function checkOffRoad(x, y) {
    if (!trackPoints) return false;
    let minD = 50000;
    for (let i = 0; i < trackPoints.length - 1; i++) {
        const p1 = trackPoints[i], p2 = trackPoints[i+1];
        const l2 = Math.pow(p1.x-p2.x,2)+Math.pow(p1.y-p2.y,2);
        if (l2 < 1) continue;
        let t = Math.max(0, Math.min(1, ((x-p1.x)*(p2.x-p1.x)+(y-p1.y)*(p2.y-p1.y))/l2));
        const d = Math.sqrt(Math.pow(x-(p1.x+t*(p2.x-p1.x)),2)+Math.pow(y-(p1.y+t*(p2.y-p1.y)),2));
        if (d < minD) minD = d;
    }
    return minD > roadWidth/2;
}

function generateScenery() {
    scenery = []; tribunes = [];
    if (!trackPoints || trackPoints.length < 2) return;
    for (let i = 0; i < trackPoints.length - 1; i += 3) {
        const p1 = trackPoints[i], p2 = trackPoints[i+1];
        if (!p1 || !p2) continue;
        const angle = Math.atan2(p2.y-p1.y, p2.x-p1.x);
        tribunes.push({ x: (p1.x+p2.x)/2 + Math.cos(angle+Math.PI/2)*300, y: (p1.y+p2.y)/2 + Math.sin(angle+Math.PI/2)*300, angle, fans: Array.from({length:15}, ()=>({color:`hsl(${Math.random()*360},70%,50%)`,off:Math.random()*Math.PI})) });
    }
    for (let i = 0; i < 500; i++) scenery.push({ x: Math.random()*18000-3000, y: Math.random()*14000-3000, size: 40+Math.random()*60, color: `hsl(${100+Math.random()*40},40%,25%)` });
}

// --- 3. ОТРИСОВКА ---
function drawScenery() {
    scenery.forEach(s => {
        // Тень дерева
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(s.x + 10, s.y + 10, s.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Крона (несколько слоев для объема)
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(s.x - s.size * 0.3, s.y - s.size * 0.3, s.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    });

    tribunes.forEach(t => {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        
        // Основание трибуны
        ctx.fillStyle = '#444';
        ctx.fillRect(-150, -50, 300, 100);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 5;
        ctx.strokeRect(-150, -50, 300, 100);
        
        // Фаны
        t.fans.forEach((f, idx) => {
            const fx = -130 + (idx * 20);
            const fy = Math.sin(Date.now() * 0.005 + f.off) * 5;
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(fx, fy, 8, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    });
}

function drawFinishLine() {
    if (!trackPoints || trackPoints.length < 2) return;
    const p1 = trackPoints[0], p2 = trackPoints[1];
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    
    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle + Math.PI / 2);
    
    const size = 40;
    const rows = 2;
    const cols = Math.floor(roadWidth / size);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#000';
            ctx.fillRect(c * size - roadWidth / 2, r * size - size, size, size);
        }
    }
    ctx.restore();
}

function drawCar(p) {
    if (!p || !p.ready || !isF(p.x) || !isF(p.y)) return;

    // Отрисовка выхлопа
    if (!p.exhaust) p.exhaust = [];
    p.exhaust.forEach((part, idx) => {
        const color = part.color || '#cccccc';
        if (color.startsWith('#')) {
            // Превращаем HEX в RGBA
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${part.alpha})`;
        } else {
            ctx.fillStyle = color;
        }
        
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
        ctx.fill();
        part.x += part.vx;
        part.y += part.vy;
        part.alpha -= 0.02;
        part.size += 0.2;
    });
    p.exhaust = p.exhaust.filter(part => part.alpha > 0);

    // Добавляем новый выхлоп
    if (gameState === 'RACING' && Math.random() > 0.5) {
        const ex = p.x - Math.cos(p.angle) * 50;
        const ey = p.y - Math.sin(p.angle) * 50;
        p.exhaust.push({
            x: ex, y: ey,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            alpha: 0.6,
            size: 5 + Math.random() * 5,
            color: '#cccccc'
        });
    }

    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle || 0);
    
    // Тень
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-45, -25, 100, 60);
    
    // Колеса
    ctx.fillStyle = '#111';
    ctx.fillRect(-40, -35, 25, 15); // переднее левое
    ctx.fillRect(-40, 20, 25, 15);  // переднее правое
    ctx.fillRect(20, -35, 25, 15);  // заднее левое
    ctx.fillRect(20, 20, 25, 15);   // заднее правое
    
    // Корпус
    ctx.fillStyle = p.color || '#f00';
    ctx.fillRect(-50, -30, 100, 60);
    
    // Стекло
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-10, -25, 40, 50);
    
    // Спойлер
    ctx.fillStyle = '#222';
    ctx.fillRect(-55, -25, 10, 50);
    
    // Пулемет на крыше
    ctx.fillStyle = '#333';
    ctx.fillRect(-10, -5, 40, 10); // ствол
    ctx.fillStyle = '#111';
    ctx.fillRect(-15, -10, 20, 20); // основание
    
    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Courier';
    ctx.textAlign = 'center';
    const displayName = (p.id === socket.id) ? 'ВЫ' : (p.nickname || 'Guest');
    ctx.fillText(displayName, p.x, p.y - 50);
}

function drawTrack() {
    if (!trackPoints || trackPoints.length < 2) return;
    const path = new Path2D(); path.moveTo(trackPoints[0].x, trackPoints[0].y);
    trackPoints.forEach(p => path.lineTo(p.x, p.y)); path.closePath();
    
    // Внешняя граница (обочина)
    ctx.lineJoin = 'round';
    ctx.lineWidth = roadWidth + 80;
    ctx.strokeStyle = '#111';
    ctx.stroke(path);
    
    // Красно-белые поребрики
    ctx.setLineDash([40, 40]);
    ctx.lineWidth = roadWidth + 40;
    ctx.strokeStyle = '#fff';
    ctx.stroke(path);
    
    ctx.lineDashOffset = 40;
    ctx.strokeStyle = '#ff0000';
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    
    // Основное полотно дороги
    ctx.lineWidth = roadWidth;
    ctx.strokeStyle = '#333';
    ctx.stroke(path);
    
    // Разметка посередине
    ctx.setLineDash([60, 100]);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke(path);
    ctx.setLineDash([]);
}

// --- 4. ОСНОВНОЙ ЦИКЛ ---
const keys = {};
let nitroBoost = 0;

function drawLeaderboard() {
    const playersArr = Object.values(players).sort((a, b) => {
        if (a.laps !== b.laps) return b.laps - a.laps;
        return (a.bestLapTime || Infinity) - (b.bestLapTime || Infinity);
    });

    const w = 450, h = 50 + playersArr.length * 35, x = 20, y = 100;
    
    // Фоновая панель в стиле HUD
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#55ff55';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Заголовок
    ctx.fillStyle = '#55ff55';
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText('POS PLAYER         LAPS  BEST', x + 20, y + 30);
    
    // Разделительная линия
    ctx.strokeStyle = 'rgba(85, 255, 85, 0.3)';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 40);
    ctx.lineTo(x + w - 10, y + 40);
    ctx.stroke();
    
    playersArr.forEach((p, idx) => {
        const py = y + 65 + idx * 35;
        
        // Полоска текущего игрока
        if (p.id === socket.id) {
            ctx.fillStyle = 'rgba(85, 255, 85, 0.15)';
            ctx.fillRect(x + 2, py - 20, w - 4, 30);
        }

        // Цветовой индикатор команды/машины
        ctx.fillStyle = p.color;
        ctx.fillRect(x + 8, py - 15, 4, 20);
        
        ctx.fillStyle = p.id === socket.id ? '#55ff55' : '#fff';
        ctx.font = '9px "Press Start 2P"';
        
        const pos = (idx + 1).toString().padStart(2, '0');
        const nickname = (p.nickname || 'Guest').padEnd(12).substring(0, 12);
        const laps = (p.laps || 0).toString().padStart(2, ' ');
        const bestTime = formatTime(p.bestLapTime).replace('--:--.--', '--:--');
        
        ctx.fillText(`${pos}  ${nickname}  ${laps}   ${bestTime}`, x + 25, py);
    });
}

function drawPodium() {
    if (gameState !== 'FINISHED' || podiumWinners.length === 0) return;
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Сброс камеры
    
    // Затемнение фона
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const bottomY = canvas.height * 0.8;
    const podiumW = 120, podiumH = 60;
    
    const drawPlace = (place, x, h, color, name) => {
        // Пьедестал
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(x - podiumW/2, bottomY - h, podiumW, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(x - podiumW/2, bottomY - h, podiumW, h);
        
        // Место
        ctx.fillStyle = color;
        ctx.font = '24px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(place, x, bottomY - h / 2 + 10);
        
        // Машинка победителя
        ctx.save();
        ctx.translate(x, bottomY - h - 40);
        ctx.fillStyle = color;
        ctx.fillRect(-35, -18, 70, 36);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(5, -14, 25, 28);
        ctx.restore();
        
        // Имя
        ctx.fillStyle = '#fff';
        ctx.font = '10px "Press Start 2P"';
        ctx.fillText(name, x, bottomY - h - 80);
    };
    
    // 2-е место
    if (podiumWinners[1]) drawPlace('2', centerX - podiumW, podiumH, podiumWinners[1].color, podiumWinners[1].nickname);
    // 1-е место
    if (podiumWinners[0]) drawPlace('1', centerX, podiumH + 40, podiumWinners[0].color, podiumWinners[0].nickname);
    // 3-е место
    if (podiumWinners[2]) drawPlace('3', centerX + podiumW, podiumH - 20, podiumWinners[2].color, podiumWinners[2].nickname);
    
    // Отрисовка фейерверков
    if (Math.random() < 0.1) {
        fireworks.push({
            x: Math.random() * canvas.width,
            y: canvas.height,
            targetY: Math.random() * (canvas.height / 2),
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            particles: [],
            exploded: false
        });
    }
    
    fireworks.forEach((fw, fidx) => {
        if (!fw.exploded) {
            ctx.fillStyle = fw.color;
            ctx.beginPath();
            ctx.arc(fw.x, fw.y, 4, 0, Math.PI * 2);
            ctx.fill();
            fw.y -= 8;
            if (fw.y <= fw.targetY) {
                fw.exploded = true;
                for (let i = 0; i < 30; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 4;
                    fw.particles.push({
                        x: fw.x, y: fw.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        alpha: 1
                    });
                }
            }
        } else {
            fw.particles.forEach(p => {
                ctx.fillStyle = fw.color.replace(')', `, ${p.alpha})`).replace('hsl', 'hsla');
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                ctx.fill();
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1; // Гравитация
                p.alpha -= 0.01;
            });
            fw.particles = fw.particles.filter(p => p.alpha > 0);
        }
    });
    fireworks = fireworks.filter(fw => !fw.exploded || fw.particles.length > 0);
    
    ctx.restore();
}

function loop() {
    try {
        // Update Physics
        if (gameStarted) {
            if (gameState === 'LOBBY' && (keys.w || keys.W || keys.ArrowUp) && localPlayer.isHost) socket.emit('startGame');
            
            if (gameState === 'RACING') {
                const isOff = checkOffRoad(localPlayer.x, localPlayer.y);
                const ACCEL = 0.055, FRICTION = 0.9975, MAX_S = 22.0, OFF_S = 5.0;
                
                // Учитываем Caps Lock и разные раскладки (w/W, s/S)
                if (keys.w || keys.W || keys.ArrowUp) localPlayer.speed += ACCEL; 
                else if (keys.s || keys.S || keys.ArrowDown) localPlayer.speed -= ACCEL;
                
                localPlayer.speed *= FRICTION; 
                nitroBoost *= 0.96;

                // Логика НИТРО (Shift)
                if ((keys.Shift || keys.shift) && localPlayer.nitroCharge > 0 && Math.abs(localPlayer.speed) > 1) {
                    nitroBoost += 0.4;
                    localPlayer.nitroCharge -= 0.8;
                    if (localPlayer.nitroCharge < 0) localPlayer.nitroCharge = 0;
                    
                    // Эффект огня из выхлопной трубы при нитро
                    for (let i = 0; i < 2; i++) {
                        localPlayer.exhaust.push({
                            x: localPlayer.x - Math.cos(localPlayer.angle) * 45,
                            y: localPlayer.y - Math.sin(localPlayer.angle) * 45,
                            vx: (Math.random() - 0.5) * 2 - Math.cos(localPlayer.angle) * 5,
                            vy: (Math.random() - 0.5) * 2 - Math.sin(localPlayer.angle) * 5,
                            life: 20,
                            size: 8 + Math.random() * 8,
                            color: Math.random() > 0.5 ? '#00ffff' : '#ffffff'
                        });
                    }
                } else {
                    // Восстановление нитро (100 ед за 10 сек -> 10 ед в сек -> 10/60 за кадр ≈ 0.16)
                    if (localPlayer.nitroCharge < localPlayer.maxNitroCharge) {
                        localPlayer.nitroCharge += 0.16;
                        if (localPlayer.nitroCharge > localPlayer.maxNitroCharge) 
                            localPlayer.nitroCharge = localPlayer.maxNitroCharge;
                    }
                }

                // Обновление полоски нитро
                const nb = document.getElementById('nitro-bar');
                if (nb) {
                    nb.style.width = `${(localPlayer.nitroCharge / localPlayer.maxNitroCharge) * 100}%`;
                    // Добавляем эффект "критического уровня", если заряда меньше 25%
                    if (localPlayer.nitroCharge < 25) {
                        nb.classList.add('low');
                    } else {
                        nb.classList.remove('low');
                    }
                }

                const ts = localPlayer.speed + nitroBoost;
                
                // Учитываем a/A и d/D
                const steer = (keys.a || keys.A || keys.ArrowLeft) ? -1 : ((keys.d || keys.D || keys.ArrowRight) ? 1 : 0);
                localPlayer.steering += (steer - localPlayer.steering) * 0.2;
                if (Math.abs(ts) > 0.1) localPlayer.angle += localPlayer.steering * 0.05 * (ts>0?1:-1);
                
                const curMax = isOff ? OFF_S : MAX_S;
                if (localPlayer.speed > curMax) localPlayer.speed = curMax;
                
                // Если игрок поехал, возвращаем камеру к нему
                if (Math.abs(localPlayer.speed) > 0.5) {
                    cameraManualMode = false;
                }

                localPlayer.x += Math.cos(localPlayer.angle) * ts;
                localPlayer.y += Math.sin(localPlayer.angle) * ts;
                
                if (!isF(localPlayer.x)) localPlayer.x = 2800;
                if (!isF(localPlayer.y)) localPlayer.y = 1000;

                // Стрельба
                if ((keys[' '] || keys.Space) && Date.now() - lastShotTime > SHOT_COOLDOWN) {
                    const bx = localPlayer.x + Math.cos(localPlayer.angle) * 40;
                    const by = localPlayer.y + Math.sin(localPlayer.angle) * 40;
                    const bullet = {
                        id: Math.random().toString(36).substr(2, 9),
                        ownerId: socket.id,
                        x: bx, y: by,
                        vx: Math.cos(localPlayer.angle) * 35,
                        vy: Math.sin(localPlayer.angle) * 35,
                        life: 60
                    };
                    bullets.push(bullet);
                    socket.emit('playerShoot', bullet);
                    lastShotTime = Date.now();
                }

                socket.emit('playerMovement', { x: localPlayer.x, y: localPlayer.y, angle: localPlayer.angle });
                const sv = document.getElementById('speed-value'); if (sv) sv.textContent = Math.floor(Math.abs(ts)*10);
                localPlayer.currentLapTime += 16;
                const cl = document.getElementById('current-lap'); if (cl) cl.textContent = `LAP: ${formatTime(localPlayer.currentLapTime)}`;

                // Логика кругов
                const pStart = trackPoints[0];
                const distToStart = Math.sqrt(Math.pow(localPlayer.x - pStart.x, 2) + Math.pow(localPlayer.y - pStart.y, 2));
                
                if (distToStart < 600) {
                    if (!localPlayer.lastPassedFinish) {
                        if (localPlayer.laps > 0) {
                            if (localPlayer.currentLapTime < localPlayer.bestLapTime) {
                                localPlayer.bestLapTime = localPlayer.currentLapTime;
                                const bl = document.getElementById('best-lap'); if (bl) bl.textContent = `BEST: ${formatTime(localPlayer.bestLapTime)}`;
                            }
                            socket.emit('lapCompleted', { bestLapTime: localPlayer.bestLapTime });
                        }
                        localPlayer.laps++;
                        localPlayer.currentLapTime = 0;
                        localPlayer.lastPassedFinish = true;
                        const lv = document.getElementById('lap-value'); if (lv) lv.textContent = `LAP ${localPlayer.laps}/${targetLaps}`;
                    }
                } else {
                    localPlayer.lastPassedFinish = false;
                }

                // Звук двигателя
                if (engineEnabled && engineGain) {
                    const basePitch = 40 + Math.abs(ts) * 8;
                    const vol = 0.15 + (Math.abs(ts) / MAX_S) * 0.25;
                    engineOsc.frequency.setTargetAtTime(basePitch, audioCtx.currentTime, 0.1);
                    if (engineOsc.secondOsc) engineOsc.secondOsc.frequency.setTargetAtTime(basePitch / 2, audioCtx.currentTime, 0.1);
                    engineGain.gain.setTargetAtTime(vol * engineVolume, audioCtx.currentTime, 0.1);
                }
            } else {
                // В лобби звук двигателя на холостых
                if (engineEnabled && engineGain && audioCtx) {
                    engineOsc.frequency.setTargetAtTime(35, audioCtx.currentTime, 0.1);
                    if (engineOsc.secondOsc) engineOsc.secondOsc.frequency.setTargetAtTime(17.5, audioCtx.currentTime, 0.1);
                    engineGain.gain.setTargetAtTime(0.08 * engineVolume, audioCtx.currentTime, 0.1);
                }
            }
        }

        // Render
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        zoomLevel += (targetZoom - zoomLevel) * 0.1;
        ctx.save(); ctx.translate(canvas.width/2, canvas.height/2); ctx.scale(zoomLevel, zoomLevel);
        
        if (!cameraManualMode) {
            cameraX += (localPlayer.x - cameraX) * 0.1; 
            cameraY += (localPlayer.y - cameraY) * 0.1;
        }
        
        if (!isF(cameraX)) cameraX = 2800; if (!isF(cameraY)) cameraY = 1000;
        ctx.translate(-cameraX, -cameraY);

        ctx.fillStyle = '#1a5e1a'; ctx.fillRect(cameraX-5000, cameraY-5000, 10000, 10000);
        drawScenery();
        drawTrack();
        drawFinishLine();
        Object.values(players).forEach(p => { if (p.id !== socket.id) drawCar(p); });
        
        if (gameStarted) {
            drawCar(localPlayer);
        }

        // Обновление и отрисовка пуль
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;

            if (b.life <= 0) {
                bullets.splice(i, 1);
                continue;
            }

            // Отрисовка пули
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Проверка попадания (только для своих пуль)
            if (b.ownerId === socket.id) {
                Object.values(players).forEach(p => {
                    if (p.id !== socket.id) {
                        const dist = Math.sqrt(Math.pow(b.x - p.x, 2) + Math.pow(b.y - p.y, 2));
                        if (dist < 40) {
                            socket.emit('playerHit', { targetId: p.id, bulletId: b.id });
                            bullets.splice(i, 1);
                            createHitEffect(p.x, p.y);
                        }
                    }
                });
            }
        }

        // Обновление и отрисовка частиц попадания
        for (let i = hitParticles.length - 1; i >= 0; i--) {
            const p = hitParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                hitParticles.splice(i, 1);
                continue;
            }
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 30;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();

        // Отрисовываем затемнение и миникарту только если игра начата
        if (gameStarted) {
            if (gameState === 'LOBBY') {
                ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,canvas.width,canvas.height);
            }
            drawMinimap();
            drawLeaderboard();
            drawPodium();
        }
    } catch (e) { console.error("Loop crash:", e); }
    requestAnimationFrame(loop);
}

function drawMinimap() {
    const ms = 220, p = 20, x = p, y = canvas.height - ms - p;
    
    // Фон миникарты
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x, y, ms, ms);
    ctx.strokeStyle = '#55ff55';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, ms, ms);

    // Сетка (декоративный элемент)
    ctx.strokeStyle = 'rgba(85, 255, 85, 0.1)';
    ctx.lineWidth = 1;
    for(let i=1; i<4; i++) {
        ctx.beginPath(); ctx.moveTo(x + i*ms/4, y); ctx.lineTo(x + i*ms/4, y + ms); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + i*ms/4); ctx.lineTo(x + ms, y + i*ms/4); ctx.stroke();
    }

    const xs = trackPoints.map(pt => pt.x), ys = trackPoints.map(pt => pt.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const tw = maxX - minX, th = maxY - minY;
    const scale = (ms - 40) / Math.max(tw || 1, th || 1);
    
    // Центрирование
    const offsetX = x + (ms - tw * scale) / 2;
    const offsetY = y + (ms - th * scale) / 2;
    const tmx = (wx) => offsetX + (wx - minX) * scale;
    const tmy = (wy) => offsetY + (wy - minY) * scale;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.moveTo(tmx(trackPoints[0].x), tmy(trackPoints[0].y));
    trackPoints.forEach(pt => ctx.lineTo(tmx(pt.x), tmy(pt.y)));
    ctx.stroke();

    // Линия финиша на миникарте
    if (trackPoints.length >= 2) {
        const p1 = trackPoints[0], p2 = trackPoints[1];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.save();
        ctx.translate(tmx(p1.x), tmy(p1.y));
        ctx.rotate(angle + Math.PI / 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.restore();
    }

    Object.values(players).forEach(p => {
        if (p.id === socket.id) return; // Себя нарисуем в конце
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(tmx(p.x), tmy(p.y), 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Себя рисуем поверх всех
    ctx.fillStyle = localPlayer.color;
    ctx.beginPath();
    ctx.arc(tmx(localPlayer.x), tmy(localPlayer.y), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// --- 5. ИНИЦИАЛИЗАЦИЯ ---
function updateLobbyUI() {
    const list = document.getElementById('lobby-player-list');
    if (!list) return;
    list.innerHTML = '';
    
    const takenColors = [];
    Object.values(players).forEach(p => {
        takenColors.push(p.color);
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.marginBottom = '5px';
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.borderLeft = `5px solid ${p.color}`;
        div.style.color = '#fff';
        div.style.fontWeight = 'bold';
        div.textContent = `${p.nickname || 'Guest'} ${p.isHost ? '(HOST)' : ''} ${p.id === socket.id ? '(YOU)' : ''}`;
        list.appendChild(div);
    });

    // Обновляем доступность цветов в меню создания/входа
    const updatePickers = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.car-option').forEach(opt => {
            const color = opt.dataset.color;
            const isTaken = Object.values(players).some(p => p.color === color && p.id !== socket.id);
            
            // Если это наш текущий цвет, выделяем его
            if (color === localPlayer.color) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }

            if (isTaken) {
                opt.style.opacity = '0.2';
                opt.style.cursor = 'not-allowed';
                opt.style.pointerEvents = 'none';
                opt.classList.remove('selected');
            } else {
                opt.style.opacity = '1';
                opt.style.cursor = 'pointer';
                opt.style.pointerEvents = 'auto';
            }
        });
    };
    updatePickers('carSelection');
    updatePickers('carSelection-join');
    updatePickers('carSelection-lobby');
    
    const isHost = localPlayer.isHost;
    document.getElementById('forceStartBtn').style.display = isHost ? 'block' : 'none';
    document.getElementById('not-host-msg').style.display = isHost ? 'none' : 'block';
}

window.onload = () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    generateScenery(); 
    
    // Загрузка сохраненного никнейма
    const savedNickname = localStorage.getItem('pixelRacing_nickname');
    const nick1 = document.getElementById('nickname');
    const nick2 = document.getElementById('nickname-join');
    
    if (savedNickname) {
        if (nick1) nick1.value = savedNickname;
        if (nick2) nick2.value = savedNickname;
    }

    // Сохранение при вводе
    const saveNick = (e) => {
        localStorage.setItem('pixelRacing_nickname', e.target.value);
        if (nick1) nick1.value = e.target.value;
        if (nick2) nick2.value = e.target.value;
    };
    if (nick1) nick1.oninput = saveNick;
    if (nick2) nick2.oninput = saveNick;
    
    // --- АУДИО ЛОГИКА ---
    // ... existing audio logic ...
    const bgMusic = document.getElementById('bgMusicElement');
    const musicBtn = document.getElementById('toggleMusic');
    const musicVol = document.getElementById('musicVolume');
    const musicTrack = document.getElementById('musicTrack');
    const engineBtn = document.getElementById('toggleEngine');
    const engineVol = document.getElementById('engineVolume');

    const initEngineSound = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Основной низкочастотный осциллятор (бас)
            engineOsc = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            engineGain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            engineOsc.type = 'sawtooth';
            osc2.type = 'square';
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(200, audioCtx.currentTime);
            filter.Q.setValueAtTime(5, audioCtx.currentTime);

            engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
            osc2.frequency.setValueAtTime(20, audioCtx.currentTime);
            
            engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

            engineOsc.connect(filter);
            osc2.connect(filter);
            filter.connect(engineGain);
            engineGain.connect(audioCtx.destination);

            engineOsc.start();
            osc2.start();
            
            // Сохраняем ссылку на второй осциллятор для управления частотой
            engineOsc.secondOsc = osc2;
        }
    };

    const updateMusic = () => {
        if (musicEnabled) {
            const newSrc = tracks[currentTrackIdx];
            if (bgMusic.getAttribute('src') !== newSrc) {
                bgMusic.src = newSrc;
                bgMusic.play().catch(e => console.log("Music play blocked"));
            } else if (bgMusic.paused) {
                bgMusic.play().catch(e => console.log("Music play blocked"));
            }
            musicBtn.textContent = `Music: ON ▾`;
        } else {
            bgMusic.pause();
            musicBtn.textContent = `Music: OFF ▾`;
        }
    };

    bgMusic.onended = () => {
        currentTrackIdx = (currentTrackIdx + 1) % tracks.length;
        updateMusic();
    };

    // Запускаем музыку при любом клике по документу (решение проблемы автоплея)
    const startAudioOnInteraction = () => {
        initEngineSound();
        if (musicEnabled && bgMusic.paused) updateMusic();
        document.removeEventListener('click', startAudioOnInteraction);
    };
    document.addEventListener('click', startAudioOnInteraction);

    musicBtn.onclick = (e) => { e.stopPropagation(); musicEnabled = !musicEnabled; updateMusic(); };
    musicVol.oninput = (e) => { musicVolume = e.target.value; bgMusic.volume = musicVolume; };
    musicTrack.onchange = (e) => { currentTrackIdx = parseInt(e.target.value); if(musicEnabled) updateMusic(); };

    engineBtn.onclick = (e) => { 
        e.stopPropagation(); 
        engineEnabled = !engineEnabled; 
        engineBtn.textContent = engineEnabled ? `Engine: ON ▾` : `Engine: OFF ▾`; 
        if (!engineEnabled && engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    };
    engineVol.oninput = (e) => { engineVolume = e.target.value; };
    
    // Выбор цвета машины
    const setupColorPicker = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.car-option').forEach(opt => {
            opt.onclick = () => {
                const color = opt.dataset.color;
                // Проверяем, не занят ли цвет (кроме нас самих)
                const isTaken = Object.values(players).some(p => p.color === color && p.id !== socket.id);
                if (isTaken) return;

                container.querySelectorAll('.car-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                localPlayer.color = color;
                
                // Если мы уже в комнате, сообщаем серверу о смене цвета
                if (gameStarted) {
                    socket.emit('selectColor', color);
                }
            };
        });
    };

    setupColorPicker('carSelection');
    setupColorPicker('carSelection-join');
    setupColorPicker('carSelection-lobby');

    document.getElementById('showCreateBtn').onclick = () => { document.getElementById('main-menu').classList.remove('active'); document.getElementById('create-menu').classList.add('active'); };
    document.getElementById('showJoinBtn').onclick = () => { 
        document.getElementById('main-menu').classList.remove('active'); 
        document.getElementById('join-menu').classList.add('active');
        socket.emit('getRooms'); // Запрашиваем список комнат при открытии меню
    };
    
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.menu-screen').forEach(s => s.classList.remove('active'));
            document.getElementById('main-menu').classList.add('active');
        };
    });

    document.getElementById('startBtn').onclick = () => {
        const nick = document.getElementById('nickname').value || 'Player';
        localPlayer.nickname = nick;
        localStorage.setItem('pixelRacing_nickname', nick); // Сохраняем имя
        
        // Сбрасываем клавиши, чтобы машина не поехала сама из-за ввода ника
        for (let k in keys) keys[k] = false;
        
        localPlayer.ready = true; localPlayer.isHost = true; gameStarted = true;
        document.getElementById('ui').style.display = 'none';
        document.getElementById('lobby-ui').style.display = 'block';
        
        ['speedometer', 'lap-counter', 'lap-timer', 'zoom-controls', 'nitro-ui'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
        const tt = document.getElementById('trackSelect').value; trackPoints = trackPresets[tt].points;
        generateScenery();
        socket.emit('createRoom', { nickname: localPlayer.nickname, color: localPlayer.color, laps: document.getElementById('lapCount').value, trackType: tt, trackData: { points: trackPoints, hazards: { nitro: [] } } });
        if (musicEnabled) updateMusic();
    };

    document.getElementById('forceStartBtn').onclick = () => {
        socket.emit('startGame');
    };

    const pauseMenu = document.getElementById('pause-menu');
    const resumeBtn = document.getElementById('resumeBtn');
    const endRaceBtn = document.getElementById('endRaceBtn');

    resumeBtn.onclick = () => {
        pauseMenu.style.display = 'none';
    };

    endRaceBtn.onclick = () => {
        if (localPlayer.isHost) {
            socket.emit('forceReset'); // Хост сбрасывает всех
        } else {
            window.location.reload(); // Обычный игрок просто выходит
        }
    };

    window.onkeydown = (e) => {
        // Если фокус на поле ввода, не обрабатываем игровые клавиши
        if (document.activeElement.tagName === 'INPUT') return;
        
        if (e.key === ' ') e.preventDefault(); // Предотвращаем скролл при стрельбе
        
        keys[e.key] = true;
        if (e.key === 'Escape' && gameStarted) {
            pauseMenu.style.display = pauseMenu.style.display === 'block' ? 'none' : 'block';
            
            // Если мы хост, показываем кнопку завершения, иначе — выхода
            if (localPlayer.isHost) {
                endRaceBtn.textContent = 'END RACE (HOST)';
            } else {
                endRaceBtn.textContent = 'LEAVE TO MENU';
            }
        }
    };
    window.onkeyup = (e) => {
        keys[e.key] = false;
    };
    document.getElementById('zoomIn').onclick = () => targetZoom = Math.min(4, targetZoom * 1.5);
    document.getElementById('zoomOut').onclick = () => targetZoom = Math.max(0.1, targetZoom / 1.5);

    window.addEventListener('wheel', (e) => {
        if (!gameStarted) return;
        if (e.ctrlKey) { // Обычно тачпад передает ctrlKey при пинче
            e.preventDefault();
            const delta = -e.deltaY * 0.01;
            targetZoom = Math.min(4, Math.max(0.1, targetZoom * (1 + delta)));
        } else {
            if (e.deltaY < 0) {
                targetZoom = Math.min(4, targetZoom * 1.1);
            } else {
                targetZoom = Math.max(0.1, targetZoom / 1.1);
            }
        }
    }, { passive: false });

    window.addEventListener('mousedown', (e) => {
        if (!gameStarted) return;
        if (e.button === 0) { // Левая кнопка мыши
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            cameraManualMode = true;
            if (manualCameraTimeout) clearTimeout(manualCameraTimeout);
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = (e.clientX - lastMouseX) / zoomLevel;
            const dy = (e.clientY - lastMouseY) / zoomLevel;
            cameraX -= dx;
            cameraY -= dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        // Возвращаем камеру к игроку через 3 секунды после окончания перетаскивания
        if (manualCameraTimeout) clearTimeout(manualCameraTimeout);
        manualCameraTimeout = setTimeout(() => {
            cameraManualMode = false;
        }, 3000);
    });
    requestAnimationFrame(loop);
};

socket.on('roomList', (rooms) => {
    const list = document.getElementById('room-list');
    if (!list) return;
    list.innerHTML = '';
    if (rooms.length === 0) {
        list.innerHTML = '<div style="padding: 20px; color: #aaa;">No active races found...</div>';
        return;
    }
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <div class="room-info">
                <strong>${room.creator}'s Race</strong><br>
                <small>${room.trackName} | ${room.playerCount} Players</small>
            </div>
            <div class="room-players">JOIN</div>
        `;
        item.onclick = () => {
            const nick = document.getElementById('nickname-join').value || 'Guest';
            localStorage.setItem('pixelRacing_nickname', nick); // Сохраняем имя
            
            // Сбрасываем клавиши
            for (let k in keys) keys[k] = false;
            
            socket.emit('joinRoom', { roomId: room.id, nickname: nick, color: localPlayer.color });
        };
        list.appendChild(item);
    });
});

socket.on('currentPlayers', (s) => { 
    players = s; 
    // Если мы только что зашли, синхронизируем данные нашего игрока
    if (players[socket.id]) {
        localPlayer.x = players[socket.id].x;
        localPlayer.y = players[socket.id].y;
        localPlayer.nickname = players[socket.id].nickname;
        localPlayer.ready = true;

        // Проверка уникальности цвета: выполняется только один раз при входе
        if (!localPlayer.colorInitialized) {
            const myColor = players[socket.id].color;
            const colorCollision = Object.values(players).some(p => p.id !== socket.id && p.color === myColor);
            
            if (colorCollision) {
                const allColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
                const takenColors = Object.values(players).filter(p => p.id !== socket.id).map(p => p.color);
                const freeColor = allColors.find(c => !takenColors.includes(c));
                if (freeColor) {
                    localPlayer.color = freeColor;
                    socket.emit('selectColor', freeColor);
                } else {
                    localPlayer.color = myColor;
                }
            } else {
                localPlayer.color = myColor;
            }
            localPlayer.colorInitialized = true; // Запоминаем, что мы уже определились с цветом
        }
    }
    updateLobbyUI(); 
});
socket.on('playerUpdated', (p) => { 
    players[p.id] = p; 
    if(p.id===socket.id) { 
        localPlayer.isHost = p.isHost; 
        localPlayer.color = p.color; 
    }
    updateLobbyUI();
});
socket.on('gameStateUpdate', (s, winners) => {
    gameState = s;
    if (gameState === 'RACING') {
        document.getElementById('lobby-ui').style.display = 'none';
        localPlayer.ready = true;
    }
    if (gameState === 'FINISHED' && winners) {
        podiumWinners = winners;
        fireworks = [];
    }
    if (gameState === 'LOBBY') {
        // Если хост сбросил игру
        document.getElementById('pause-menu').style.display = 'none';
        podiumWinners = [];
        fireworks = [];
        if (gameStarted) {
            document.getElementById('lobby-ui').style.display = 'block';
        }
    }
});
socket.on('roomJoined', (d) => { 
    trackPoints = d.trackData.points || d.trackData; 
    localPlayer.isHost = d.isHost; 
    targetLaps = d.targetLaps || 5; 
    generateScenery(); 
    gameStarted = true;
    localPlayer.ready = true; // Машина должна быть видна сразу
    localPlayer.laps = 0;
    const lv = document.getElementById('lap-value'); if (lv) lv.textContent = `LAP 0/${targetLaps}`;
    document.getElementById('ui').style.display = 'none';
    document.getElementById('lobby-ui').style.display = 'block';
    
    ['speedometer', 'lap-counter', 'lap-timer', 'zoom-controls', 'nitro-ui'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.style.display = 'flex'; 
    });
    
    updateLobbyUI();
});
socket.on('playerMoved', (p) => { if(players[p.id]) { players[p.id].x = p.x; players[p.id].y = p.y; players[p.id].angle = p.angle; } });

socket.on('bulletFired', (bullet) => {
    if (bullet.ownerId !== socket.id) {
        bullets.push(bullet);
    }
});

socket.on('bulletHit', (data) => {
    const { targetId, bulletId } = data;
    // Удаляем пулю у всех клиентов
    bullets = bullets.filter(b => b.id !== bulletId);
    
    const targetPlayer = (targetId === socket.id) ? localPlayer : players[targetId];
    if (targetPlayer) {
        createHitEffect(targetPlayer.x, targetPlayer.y);
        if (targetId === socket.id) {
            localPlayer.speed *= 0.5; // Замедляем игрока при попадании
            // Визуальный эффект тряски или вспышки можно добавить тут
        }
    }
});

let hitParticles = [];
function createHitEffect(x, y) {
    for (let i = 0; i < 15; i++) {
        hitParticles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 30,
            color: '#ff4500'
        });
    }
}
