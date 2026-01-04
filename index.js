const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store room state
// rooms[roomCode] = { players: [], gameState: {} }
const rooms = {};

// Utils
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_lobby', ({ email, playerName }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{
                id: socket.id,
                email,
                name: playerName || 'Player 1',
                number: 1, // P1
                ready: false
            }],
            gameState: null,
            started: false
        };
        socket.join(roomCode);
        socket.emit('lobby_created', { roomCode, yourPlayerNum: 1 });
        io.to(roomCode).emit('player_list', rooms[roomCode].players);
        console.log(`Lobby Created: ${roomCode} by ${email}`);
    });

    socket.on('join_lobby', ({ roomCode, email, playerName }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        if (room.started) {
            socket.emit('error', 'Game already started');
            return;
        }
        if (room.players.length >= 4) {
            socket.emit('error', 'Room is full');
            return;
        }

        // Check if email already exists in room to reconnect? 
        // For simplicity, just add as new player
        const playerNum = room.players.length + 1;
        const newPlayer = {
            id: socket.id,
            email,
            name: playerName || `Player ${room.players.length + 1}`,
            number: playerNum,
            ready: false
        };

        room.players.push(newPlayer);
        socket.join(roomCode);

        socket.emit('joined_lobby', { roomCode, yourPlayerNum: playerNum });
        io.to(roomCode).emit('player_list', room.players);
        console.log(`Player joined ${roomCode}: ${email}`);
    });

    socket.on('start_game', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        // Verify host (first player) sent start?
        // For now assume logic is handled on client to only show start btn to host

        room.started = true;
        // Initialize basic game state if needed, or just let clients sync
        io.to(roomCode).emit('game_started', {
            players: room.players
        });
        console.log(`Game started in room ${roomCode}`);
    });

    // Game Events Relay
    socket.on('game_action', ({ roomCode, type, data }) => {
        // Broadcast action to everyone ELSE in the room
        socket.to(roomCode).emit('game_action', { type, data, from: socket.id });
    });

    // Sync entire state periodically or on specific milestones if needed
    // socket.on('sync_state', ...)

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find room and remove player?
        // handling dropouts in simple implementation: just mark offline or ignore
        for (const code in rooms) {
            const room = rooms[code];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                // If game hasn't started, remove them
                if (!room.started) {
                    room.players.splice(pIdx, 1);
                    io.to(code).emit('player_list', room.players);
                    // If host left and room empty, delete room
                    if (room.players.length === 0) delete rooms[code];
                } else {
                    // Game started, maybe mark disconnected?
                    // io.to(code).emit('player_left', { playerNum: room.players[pIdx].number });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n=== TACTICAL ARSENAL SERVER ===`);
    console.log(`Local:   http://localhost:${PORT}`);

    // Show Network IP for Android Device
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`Network: http://${net.address}:${PORT} (Use this in Android App)`);
            }
        }
    }
    console.log(`===============================\n`);
});
