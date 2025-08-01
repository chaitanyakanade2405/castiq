require('dotenv').config();
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const crypto = require('crypto');
const multer = require('multer');
const supabase = require('./supabaseClient');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const server = app.listen(8080, () => {
  console.log(`Server is listening on port 8080`);
});

// API Endpoint for File Uploads
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    const file = req.file;
    const fileName = `recording-${Date.now()}.webm`;
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });
    if (error) throw error;
    console.log('File uploaded successfully:', data.path);
    res.status(200).json({ message: 'File uploaded successfully', path: data.path });
  } catch (error) {
    console.error('Error uploading file:', error.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// API Endpoint for Video Rendering
app.post('/render', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).send('File name is required.');
  }
  try {
    console.log(`Starting render process for ${fileName}...`);

    // Download the main recording from Supabase
    const { data: recordingData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(fileName);
    if (downloadError) throw downloadError;

    // Save the downloaded file temporarily
    const tempRecordingPath = path.join(__dirname, 'tmp', fileName);
    fs.writeFileSync(tempRecordingPath, Buffer.from(await recordingData.arrayBuffer()));
    console.log('Recording downloaded and saved to tmp folder.');

    const introPath = path.join(__dirname, 'assets', 'intro.mp4');
    const outroPath = path.join(__dirname, 'assets', 'outro.mp4');
    const outputPath = path.join(__dirname, 'tmp', `final-${Date.now()}.mp4`);

    // --- NEW, MORE ROBUST FFMPEG COMMAND ---
    // Replace the existing ffmpegArgs array in your /render endpoint
const ffmpegArgs = [
    '-i', introPath,
    '-i', tempRecordingPath,
    '-i', outroPath,
    '-filter_complex',
    // 1. Scale all videos to the same size
    '[0:v]scale=1920:1080[v0];[1:v]scale=1920:1080[v1];[2:v]scale=1920:1080[v2];' +
    // 2. Concatenate all three video streams and all three audio streams
    '[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[outv][outa]',
    
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-r', '30',
    outputPath
];

    const ffmpegProcess = spawn(ffmpeg, ffmpegArgs);

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      // Clean up the temporary recording file
      fs.unlinkSync(tempRecordingPath);
      console.log('Temporary recording file cleaned up.');

      if (code === 0) {
        console.log(`Render complete! Final video at: ${outputPath}`);
        res.status(200).json({ message: 'Render successful!', finalPath: outputPath });
      } else {
        console.error(`FFmpeg exited with code ${code}`);
        res.status(500).send('Video rendering failed.');
      }
    });

  } catch (error) {
    console.error('Error during render process:', error.message);
    res.status(500).send('An error occurred during rendering.');
  }
});

// WebSocket Server Logic
const wss = new WebSocketServer({ server });
const clients = new Map();
wss.on('connection', (ws) => {
  const userID = crypto.randomUUID();
  clients.set(userID, ws);
  console.log(`User registered with ID: ${userID}`);
  ws.send(JSON.stringify({ type: 'id-assigned', userID }));
  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    const targetUserID = data.to;
    const targetClient = clients.get(targetUserID);
    if (targetClient && targetClient.readyState === WebSocket.OPEN) {
      data.from = userID;
      targetClient.send(JSON.stringify(data));
    }
  });
  ws.on('close', () => {
    console.log(`User ${userID} disconnected.`);
    clients.delete(userID);
  });
});