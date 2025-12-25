const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../client')));

// Хранилище комнат
const rooms = {};

// Базовые треки (имена для отображения в списке комнат)
const trackNames = {
    preset1: "Grand Prix",
    preset2: "Speedway (Oval)",
    preset3: "Hairpin City",
    preset4: "Zigzag Mountains",
    preset5: "The Loop"
};

function getRoomList() {
    return Object.keys(rooms).map(id => ({
        id: id,
        creator: rooms[id].creatorName,
        trackName: trackNames[rooms[id].trackType] || "Custom",
        playerCount: Object.keys(rooms[id].players).length,
        gameState: rooms[id].gameState
    })).filter(r => r.gameState === 'LOBBY'); // Показываем только те, что еще в лобби
}

function findSocketPlayer(socketId) {
    for (const roomId in rooms) {
        if (rooms[roomId].players[socketId]) {
            return { room: rooms[roomId], player: rooms[roomId].players[socketId] };
        }
    }
    return null;
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    // При подключении отправляем список комнат
    socket.emit('roomList', getRoomList());

    socket.on('createRoom', (data) => {
        const roomId = socket.id; // ID комнаты совпадает с ID создателя
        rooms[roomId] = {
            id: roomId,
            creatorName: data.nickname || 'Guest',
            trackType: data.trackType,
            targetLaps: parseInt(data.laps) || 5,
            trackData: data.trackData,
            gameState: 'LOBBY',
            winners: [],
            players: {}
        };
        
        socket.join(roomId);
        joinRoomLogic(socket, roomId, data);
        io.emit('roomList', getRoomList());
    });

    socket.on('joinRoom', (data) => {
        const roomId = data.roomId;
        if (rooms[roomId] && rooms[roomId].gameState === 'LOBBY') {
            socket.join(roomId);
            joinRoomLogic(socket, roomId, data);
            io.emit('roomList', getRoomList());
        }
    });

    function joinRoomLogic(socket, roomId, data) {
        const room = rooms[roomId];
        room.players[socket.id] = {
            id: socket.id,
            roomId: roomId,
            x: -500, y: -500,
            angle: 0,
            nickname: data.nickname || 'Guest',
            color: data.color || '#ff0000',
            laps: 0,
            bestLapTime: null,
            finished: false,
            ready: true 
        };

        const readyPlayers = Object.values(room.players);
        const myIndex = readyPlayers.findIndex(p => p.id === socket.id);
        
        const trackPoints = room.trackData.points || room.trackData;
        const startX = trackPoints ? trackPoints[0].x - 200 : 2800;
        const startY = trackPoints ? trackPoints[0].y : 1000;

        room.players[socket.id].x = startX;
        room.players[socket.id].y = startY + (myIndex * 70);
        
        socket.emit('roomJoined', {
            roomId: roomId,
            gameState: room.gameState,
            targetLaps: room.targetLaps,
            trackData: room.trackData
        });

        io.to(roomId).emit('currentPlayers', room.players);
        io.to(roomId).emit('gameStateUpdate', room.gameState);
    }

    socket.on('playerMovement', (movementData) => {
        const result = findSocketPlayer(socket.id);
        if (result) {
            const { room, player } = result;
            if (player.ready && room.gameState === 'RACING') {
                player.x = movementData.x;
                player.y = movementData.y;
                player.angle = movementData.angle;
                socket.to(room.id).emit('playerMoved', player);
            }
        }
    });

    socket.on('sendEmoji', (emoji) => {
        const result = findSocketPlayer(socket.id);
        if (result) {
            io.to(result.room.id).emit('emojiReceived', { id: socket.id, emoji: emoji });
        }
    });

    socket.on('lapCompleted', (data) => {
        const result = findSocketPlayer(socket.id);
        if (result) {
            const { room, player } = result;
            if (room.gameState === 'RACING' && !player.finished) {
                player.laps++;
                if (data && data.bestLapTime !== undefined && data.bestLapTime !== null) {
                    player.bestLapTime = data.bestLapTime;
                }
                io.to(room.id).emit('playerUpdated', player);

                if (player.laps >= room.targetLaps) {
                    player.finished = true;
                    room.winners.push({
                        nickname: player.nickname,
                        color: player.color
                    });
                    io.to(room.id).emit('playerFinished', { id: socket.id, nickname: player.nickname, rank: room.winners.length });

                    const totalPlayers = Object.values(room.players).length;
                    if (room.winners.length === totalPlayers || room.winners.length >= 3) {
                        room.gameState = 'FINISHED';
                        io.to(room.id).emit('gameStateUpdate', room.gameState, room.winners);
                    }
                }
            }
        }
    });

    socket.on('selectColor', (color) => {
        const result = findSocketPlayer(socket.id);
        if (result) {
            result.player.color = color;
            io.to(result.room.id).emit('playerUpdated', result.player);
        }
    });

    socket.on('startGame', () => {
        const result = findSocketPlayer(socket.id);
        if (result && result.room.id === socket.id) { 
            const room = result.room;
            if (room.gameState === 'LOBBY') {
                room.gameState = 'RACING';
                room.winners = [];
                io.to(room.id).emit('gameStateUpdate', room.gameState);
                io.emit('roomList', getRoomList());
            }
        }
    });

    socket.on('forceReset', () => {
        const result = findSocketPlayer(socket.id);
        if (result && result.room.id === socket.id) {
            const room = result.room;
            room.gameState = 'LOBBY';
            room.winners = [];
            const trackPoints = room.trackData.points || room.trackData;
            const startX = trackPoints ? trackPoints[0].x - 200 : 2800;
            const startY = trackPoints ? trackPoints[0].y : 1000;

            Object.values(room.players).forEach((p, idx) => {
                p.laps = 0;
                p.bestLapTime = null;
                p.finished = false;
                p.x = startX;
                p.y = startY + (idx * 70);
                p.angle = 0;
                p.ready = false; 
            });
            io.to(room.id).emit('gameStateUpdate', room.gameState);
            io.to(room.id).emit('currentPlayers', room.players);
            io.emit('roomList', getRoomList());
        }
    });

    socket.on('disconnect', () => {
        const result = findSocketPlayer(socket.id);
        if (result) {
            const { room } = result;
            delete room.players[socket.id];
            
            if (Object.keys(room.players).length === 0) {
                delete rooms[room.id];
            } else {
                io.to(room.id).emit('playerDisconnected', socket.id);
            }
            io.emit('roomList', getRoomList());
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
