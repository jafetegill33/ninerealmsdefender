const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Game state for multiplayer
const gameRooms = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle creating or joining a room
  socket.on('createRoom', (roomId, playerName) => {
    if (!gameRooms[roomId]) {
      gameRooms[roomId] = {
        players: {},
        roomId: roomId
      };
      gameRooms[roomId].players[socket.id] = {
        name: playerName,
        isHost: true,
        ready: false
      };
      socket.join(roomId);
      io.to(roomId).emit('roomInfo', gameRooms[roomId]);
      console.log(`Room ${roomId} created by ${playerName}`);
    } else {
      socket.emit('roomError', 'Room already exists');
    }
  });
  
  socket.on('joinRoom', (roomId, playerName) => {
    if (gameRooms[roomId]) {
      gameRooms[roomId].players[socket.id] = {
        name: playerName,
        isHost: false,
        ready: false
      };
      socket.join(roomId);
      io.to(roomId).emit('roomInfo', gameRooms[roomId]);
      console.log(`${playerName} joined room ${roomId}`);
    } else {
      socket.emit('roomError', 'Room does not exist');
    }
  });
  
  // Handle game state updates
  socket.on('gameStateUpdate', (roomId, gameState) => {
    socket.to(roomId).emit('gameStateUpdate', gameState);
  });
  
  // Handle player ready status
  socket.on('playerReady', (roomId) => {
    if (gameRooms[roomId] && gameRooms[roomId].players[socket.id]) {
      gameRooms[roomId].players[socket.id].ready = true;
      io.to(roomId).emit('roomInfo', gameRooms[roomId]);
      
      // Check if all players are ready
      const allReady = Object.values(gameRooms[roomId].players).every(player => player.ready);
      if (allReady) {
        io.to(roomId).emit('startGame');
      }
    }
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from any rooms they were in
    for (const roomId in gameRooms) {
      if (gameRooms[roomId].players[socket.id]) {
        delete gameRooms[roomId].players[socket.id];
        
        // If room is empty, delete it
        if (Object.keys(gameRooms[roomId].players).length === 0) {
          delete gameRooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          // Notify remaining players
          io.to(roomId).emit('playerLeft', socket.id);
          io.to(roomId).emit('roomInfo', gameRooms[roomId]);
          
          // If host left, assign a new host
          if (gameRooms[roomId].players[socket.id]?.isHost) {
            const newHostId = Object.keys(gameRooms[roomId].players)[0];
            if (newHostId) {
              gameRooms[roomId].players[newHostId].isHost = true;
              io.to(roomId).emit('newHost', newHostId);
            }
          }
        }
        break;
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});