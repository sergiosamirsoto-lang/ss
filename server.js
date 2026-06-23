const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let waitingPlayer = null;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_matchmaking', () => {
    if (waitingPlayer && waitingPlayer !== socket) {
      const p1 = waitingPlayer;
      const p2 = socket;
      waitingPlayer = null;

      const room = 'room_' + p1.id;
      p1.join(room);
      p2.join(room);

      p1.emit('match_found', { role: 'p1' });
      p2.emit('match_found', { role: 'p2' });

      p1.on('game_input', (data) => p2.emit('game_input', data));
      p2.on('game_input', (data) => p1.emit('game_input', data));

      p1.on('disconnect', () => p2.emit('opponent_disconnected'));
      p2.on('disconnect', () => p1.emit('opponent_disconnected'));
    } else {
      waitingPlayer = socket;
    }
  });

  socket.on('disconnect', () => {
    if (waitingPlayer === socket) {
      waitingPlayer = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Listening on port ' + PORT));
