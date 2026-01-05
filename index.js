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

// --- SIMPLE FILE DATABASE ---
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, 'database.json');

// Memory Cache
let db = { users: {} };

// Load DB
function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error("DB Load Error:", e);
            db = { users: {} };
        }
    } else {
        saveDB(); // Create if missing
    }
}
loadDB();

// Save DB
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Helper: Get or Create User
function getUser(email) {
    if (!db.users[email]) {
        db.users[email] = {
            coins: 100, // Default Start
            history: []
        };
        saveDB();
    }
    return db.users[email];
}


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

    socket.on('start_game', ({ roomCode, links }) => {
        const room = rooms[roomCode];
        if (!room) return;

        room.started = true;
        // Broadcast game start with the BOARD LAYOUT (links) so everyone matches
        io.to(roomCode).emit('game_started', {
            players: room.players,
            links: links // Syncs snakes/ladders
        });
        console.log(`[GAME START] Room: ${roomCode}, Links generated`);

        // Log all players start
        room.players.forEach(p => {
            console.log(`[LOG] Room ${roomCode}: Player ${p.email} (${p.id}) started game.`);
        });
    });

    // Game Events Relay with Logging
    socket.on('game_action', ({ roomCode, type, data }) => {
        // Log the action
        const room = rooms[roomCode];
        let pName = socket.id;
        if (room) {
            const p = room.players.find(pl => pl.id === socket.id);
            if (p) pName = `${p.email} (P${p.number})`;
        }

        console.log(`[ACTIVITY] Room ${roomCode} | User: ${pName} | Action: ${type} | Data: ${JSON.stringify(data)}`);

        // Broadcast action to everyone ELSE in the room
        socket.to(roomCode).emit('game_action', { type, data, from: socket.id });
    });

    // socket.on('sync_state', ...) - Not implemented yet, relying on determinism

    // --- WALLET / DB EVENTS ---
    socket.on('get_wallet', (email) => {
        if (!email) return;
        const user = getUser(email);
        socket.emit('wallet_update', { coins: user.coins });
    });

    socket.on('update_wallet', ({ email, amount, reason }) => {
        if (!email) return;
        const user = getUser(email);

        // Calculate diff for history consistency or trust client absolute?
        // Trusting client sent "new total" is risky. Better to send "change amount" (+50, -10)
        // BUT current client logic was absolute. Let's switch to RELATIVE info if possible, 
        // OR just update absolute but log the diff.
        // For simplicity with current request: "record coins earned and spent"

        const diff = amount - user.coins;
        user.coins = amount;

        user.history.push({
            action: reason || 'unknown',
            diff: diff,
            total: user.coins,
            timestamp: new Date().toISOString()
        });

        saveDB();
        socket.emit('wallet_update', { coins: user.coins });
        console.log(`[WALLET] ${email}: ${diff > 0 ? '+' : ''}${diff} (${reason}) => Total: ${user.coins}`);
    });

    socket.on('disconnect', () => {
        console.log('[DISCONNECT] User:', socket.id);
        for (const code in rooms) {
            const room = rooms[code];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                console.log(`[LOG] Player left Room ${code}: ${room.players[pIdx].email}`);
                if (!room.started) {
                    room.players.splice(pIdx, 1);
                    io.to(code).emit('player_list', room.players);
                    if (room.players.length === 0) delete rooms[code];
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
    // Create DB file if needed check
    if (!fs.existsSync(DB_FILE)) saveDB();
});
