const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let waitingPlayer = null;
const matches = new Map();

function leaveMatch(socket, notifyOpponent = true) {
  const match = matches.get(socket.id);
  if (!match) return;

  const opponent = match.p1 === socket ? match.p2 : match.p1;
  matches.delete(match.p1.id);
  matches.delete(match.p2.id);
  if (notifyOpponent && opponent.connected) opponent.emit('opponent_disconnected');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_matchmaking', (data) => {
    // A socket can only be in one queue/match at a time.
    if (matches.has(socket.id) || waitingPlayer === socket) return;
    socket.playerName = data?.name || 'Jugador';
    if (waitingPlayer && waitingPlayer.connected && waitingPlayer !== socket) {
      const p1 = waitingPlayer;
      const p2 = socket;
      waitingPlayer = null;

      const room = 'room_' + p1.id;
      p1.join(room);
      p2.join(room);
      const match = { room, p1, p2 };
      matches.set(p1.id, match);
      matches.set(p2.id, match);

      p1.emit('match_found', { role: 'p1', opponentName: p2.playerName });
      p2.emit('match_found', { role: 'p2', opponentName: p1.playerName });

    } else {
      waitingPlayer = socket;
    }
  });

  socket.on('game_input', (data) => {
    const match = matches.get(socket.id);
    if (!match || !data || typeof data.key !== 'string' || typeof data.state !== 'boolean') return;
    const opponent = match.p1 === socket ? match.p2 : match.p1;
    if (opponent.connected) opponent.emit('game_input', data);
  });

  // Player 1 is the match authority.  Relaying one state prevents the two
  // browsers from drifting apart because of different frame rates/latency.
  socket.on('game_state', (data) => {
    const match = matches.get(socket.id);
    if (!match || match.p1 !== socket || !data || typeof data !== 'object') return;
    if (match.p2.connected) match.p2.emit('game_state', data);
  });

  socket.on('leave_matchmaking', () => {
    if (waitingPlayer === socket) waitingPlayer = null;
    leaveMatch(socket);
  });

  socket.on('disconnect', () => {
    if (waitingPlayer === socket) {
      waitingPlayer = null;
    }
    leaveMatch(socket);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Listening on port ' + PORT));
