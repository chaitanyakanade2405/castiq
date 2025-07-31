const { WebSocket, WebSocketServer } = require('ws');
const crypto = require('crypto'); // Built-in Node.js module for unique IDs

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map();

wss.on('connection', (ws) => {
  // 1. Generate a unique ID for the new client
  const userID = crypto.randomUUID();
  clients.set(userID, ws);
  console.log(`User registered with ID: ${userID}`);

  // 2. Send the newly generated ID back to the client
  ws.send(JSON.stringify({ type: 'id-assigned', userID }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const targetUserID = data.to;
    const targetClient = clients.get(targetUserID);

    if (targetClient && targetClient.readyState === WebSocket.OPEN) {
      data.from = userID;
      console.log(`Forwarding message from ${userID} to ${targetUserID}`);
      targetClient.send(JSON.stringify(data));
    }
  });

  ws.on('close', () => {
    console.log(`User ${userID} disconnected.`);
    clients.delete(userID);
  });
});
console.log('Truly smart signaling server started on port 8080');