const express = require('express');
// 1. Import the WebSocket and WebSocketServer classes
const { WebSocket, WebSocketServer } = require('ws');

const app = express();
const port = 8080;

// Start a regular HTTP server using Express
const server = app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

// 2. Create a WebSocket server and attach it to the HTTP server
const wss = new WebSocketServer({ server });

// 3. Set up a 'connection' event listener
wss.on('connection', (ws) => {
  console.log('A new client connected!');

  // When a message is received from a client...
  ws.on('message', (message) => {
    console.log('received: %s', message);

    // Broadcast the message to all other connected clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  // When a client disconnects...
  ws.on('close', () => {
    console.log('Client has disconnected.');
  });

  // Handle potential errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});