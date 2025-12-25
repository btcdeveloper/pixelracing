const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../client')));

const players = {};
let gameState = 'LOBBY';
let winners = [];
let targetLaps = 5; 
let currentTrack = {
    points: [{x: 3000, y: 1000}, {x: 7000, y: 1000}, {x: 8500, y: 2500}, {x: 10000, y: 1000}, {x: 12000, y: 3000}, {x: 10500, y: 4500}, {x: 13000, y: 6000}, {x: 11000, y: 8000}, {x: 8000, y: 6500}, {x: 7000, y: 9000}, {x: 5000, y: 7000}, {x: 3000, y: 9500}, {x: 1500, y: 7500}, {x: 2500, y: 5000}, {x: 800, y: 4500}, {x: 800, y: 1000}, {x: 3000, y: 1000}],
    hazards: { nitro: [] } // Оставляем только нитро
}; 

io.on('connection', (socket) => {
    players[socket.id] = {
        id: socket.id,
        x: -500, y: -500,
        angle: 0,
        nickname: 'Guest',
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        laps: 0,
        finished: false,
        ready: false
    };

    socket.emit('currentPlayers', players);
    socket.emit('gameStateUpdate', gameState);
    socket.emit('updateTargetLaps', targetLaps);
    if (currentTrack) socket.emit('updateTrack', currentTrack);

    socket.on('joinGame', (data) => {
        if (players[socket.id]) {
            if (data.laps) {
                targetLaps = parseInt(data.laps);
                io.emit('updateTargetLaps', targetLaps);
            }
            
            // Трассу устанавливает только первый игрок или если она еще не выбрана
            const readyPlayersBefore = Object.values(players).filter(p => p.ready);
            const incomingTrackData = data.trackData;
            if (incomingTrackData && (readyPlayersBefore.length === 0 || gameState === 'LOBBY')) {
                currentTrack = incomingTrackData;
                io.emit('updateTrack', currentTrack);
            }

            const colorToUse = data.color || players[socket.id].color;
            const isTakenByOther = Object.values(players).some(p => p.ready && p.id !== socket.id && p.color === colorToUse);
            
            if (isTakenByOther) {
                players[socket.id].color = '#' + Math.floor(Math.random()*16777215).toString(16);
            } else {
                players[socket.id].color = colorToUse;
            }

            players[socket.id].nickname = data.nickname || 'Guest';
            players[socket.id].ready = true;
            
            const readyPlayers = Object.values(players).filter(p => p.ready);
            const myIndex = readyPlayers.findIndex(p => p.id === socket.id);
            
            const trackPoints = currentTrack.points || currentTrack;
            const startX = trackPoints ? trackPoints[0].x - 200 : 2800;
            const startY = trackPoints ? trackPoints[0].y : 1000;

            players[socket.id].x = startX; 
            players[socket.id].y = startY + (myIndex * 70);
            players[socket.id].angle = 0;
            
            io.emit('playerUpdated', players[socket.id]);
            const takenColors = Object.values(players).filter(p => p.ready).map(p => p.color);
            io.emit('updateOccupiedColors', takenColors);
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && players[socket.id].ready && gameState === 'RACING') {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('sendEmoji', (emoji) => {
        if (players[socket.id]) {
            io.emit('emojiReceived', { id: socket.id, emoji: emoji });
        }
    });

    socket.on('lapCompleted', () => {
        if (players[socket.id] && gameState === 'RACING' && !players[socket.id].finished) {
            players[socket.id].laps++;
            io.emit('playerUpdated', players[socket.id]);

            if (players[socket.id].laps >= targetLaps) {
                players[socket.id].finished = true;
                winners.push({
                    nickname: players[socket.id].nickname,
                    color: players[socket.id].color
                });
                io.emit('playerFinished', { id: socket.id, nickname: players[socket.id].nickname, rank: winners.length });

                const totalReady = Object.values(players).filter(p => p.ready).length;
                if (winners.length === totalReady || winners.length >= 3) {
                    gameState = 'FINISHED';
                    io.emit('gameStateUpdate', gameState, winners);
                }
            }
        }
    });

    socket.on('resetGame', () => {
        if (gameState === 'FINISHED') {
            gameState = 'LOBBY';
            winners = [];
            // При сбросе игры в лобби, трасса тоже может быть перевыбрана
            const readyOnes = Object.values(players).filter(p => p.ready);
            
            const trackPoints = currentTrack.points || currentTrack;
            const startX = trackPoints ? trackPoints[0].x - 200 : 2800;
            const startY = trackPoints ? trackPoints[0].y : 1000;

            readyOnes.forEach((p, idx) => {
                p.laps = 0;
                p.finished = false;
                p.x = startX;
                p.y = startY + (idx * 70);
                p.angle = 0;
            });
            io.emit('gameStateUpdate', gameState);
            io.emit('currentPlayers', players);
            io.emit('updateTargetLaps', targetLaps);
        }
    });

    socket.on('startGame', () => {
        if (gameState === 'LOBBY') {
            gameState = 'RACING';
            winners = [];
            io.emit('gameStateUpdate', gameState);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        const takenColors = Object.values(players).filter(p => p.ready).map(p => p.color);
        io.emit('updateOccupiedColors', takenColors);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
