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

    socket.on('joinGame', (data) => {
        if (players[socket.id]) {
            const colorToUse = data.color || players[socket.id].color;
            const isColorTaken = Object.values(players).some(p => p.ready && p.color === colorToUse && p.id !== socket.id);
            
            if (isColorTaken) {
                players[socket.id].color = '#' + Math.floor(Math.random()*16777215).toString(16);
            } else {
                players[socket.id].color = colorToUse;
            }

            players[socket.id].nickname = data.nickname || 'Guest';
            players[socket.id].ready = true;
            
            const readyPlayers = Object.values(players).filter(p => p.ready);
            const myIndex = readyPlayers.findIndex(p => p.id === socket.id);
            
            players[socket.id].x = 310; 
            players[socket.id].y = 160 + (myIndex * 35);
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

    socket.on('lapCompleted', () => {
        if (players[socket.id] && gameState === 'RACING' && !players[socket.id].finished) {
            players[socket.id].laps++;
            io.emit('playerUpdated', players[socket.id]);

            if (players[socket.id].laps >= 3) {
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
            const readyOnes = Object.values(players).filter(p => p.ready);
            readyOnes.forEach((p, idx) => {
                p.laps = 0;
                p.finished = false;
                p.x = 310;
                p.y = 160 + (idx * 35);
                p.angle = 0;
            });
            io.emit('gameStateUpdate', gameState);
            io.emit('currentPlayers', players);
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
