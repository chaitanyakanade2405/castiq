require('dotenv').config();
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const crypto = require('crypto');
const multer = require('multer');
const supabase = require('./supabaseClient');
const cors = require('cors');

const app = express();
app.use(cors());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const server = app.listen(8080, () => {
    console.log(`Server is listening on port 8080`);
});

app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded.');
        const file = req.file;
        const fileName = `recording-${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from('recordings').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) throw error;
        console.log('File uploaded successfully:', data.path);
        res.status(200).json({ message: 'File uploaded successfully', path: data.path });
    } catch (error) {
        console.error('Error uploading file:', error.message);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    const userID = crypto.randomUUID();
    clients.set(userID, ws);
    console.log(`User registered with ID: ${userID}`);
    ws.send(JSON.stringify({ type: 'id-assigned', userID }));

    ws.on('message', (message) => {
        console.log('\n--- Backend received a message ---');
        try {
            const data = JSON.parse(message.toString());
            console.log('Parsed data:', data);

            const targetUserID = data.to;
            console.log('Attempting to find target user ID:', targetUserID);

            console.log('Currently registered clients:', Array.from(clients.keys()));

            const targetClient = clients.get(targetUserID);

            if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                console.log('SUCCESS: Target client found. Forwarding message.');
                data.from = userID;
                targetClient.send(JSON.stringify(data));
            } else {
                console.log('ERROR: Target client not found or not open.');
            }
        } catch (e) {
            console.error('ERROR: Could not parse incoming message as JSON.', e);
        }
    });

    ws.on('close', () => {
        console.log(`User ${userID} disconnected.`);
        clients.delete(userID);
    });
});