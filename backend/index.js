require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const multer = require('multer');
const supabase = require('./supabaseClient'); // keep your existing client file
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static'); // path to ffmpeg binary
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const server = app.listen(process.env.PORT ? Number(process.env.PORT) : 8080, () => {
  console.log(`Main Node.js server is listening on port ${process.env.PORT || 8080}`);
});

// Ensure tmp directory exists
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log('Created tmp directory at', tmpDir);
}

// ----------------------- Helper: run ffmpeg and await completion -----------------------
function runFFmpegWithArgs(ffmpegPath, args, onData) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      const txt = chunk.toString();
      stderr += txt;
      if (typeof onData === 'function') onData(txt);
      process.stdout.write(txt);
    });
    proc.on('error', (err) => {
      err.stderr = stderr;
      reject(err);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stderr });
      } else {
        const err = new Error(`FFmpeg exited with code ${code}`);
        err.code = code;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

// ----------------------- Upload endpoint -----------------------
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const file = req.file;
    const fileName = `recording-${Date.now()}.webm`;
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });
    if (error) throw error;
    console.log('File uploaded successfully:', data.path);
    return res.status(200).json({ message: 'File uploaded successfully', path: data.path, fileName });
  } catch (err) {
    console.error('Error uploading file:', err?.message || err);
    return res.status(500).json({ error: 'Failed to upload file', detail: err?.message || String(err) });
  }
});

// ----------------------- Render endpoint -----------------------
app.post('/render', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).send('File name is required.');

  const tempRecordingPath = path.join(__dirname, 'tmp', fileName);
  const outputPath = path.join(__dirname, 'tmp', `final-${Date.now()}.mp4`);

  try {
    console.log(`Starting render process for ${fileName}...`);

    // Download file from supabase
    const { data: recordingData, error: downloadError } = await supabase.storage.from('recordings').download(fileName);
    if (downloadError) throw downloadError;

    // write file to disk
    const arrayBuffer = await recordingData.arrayBuffer();
    fs.writeFileSync(tempRecordingPath, Buffer.from(arrayBuffer));
    console.log('Recording downloaded to', tempRecordingPath);

    if (!fs.existsSync(tempRecordingPath)) {
      throw new Error(`Downloaded file not found at ${tempRecordingPath}`);
    }

    const introPath = path.join(__dirname, 'assets', 'intro.webm');
    const outroPath = path.join(__dirname, 'assets', 'outro.webm');

    if (!fs.existsSync(introPath)) throw new Error(`Intro not found at ${introPath}`);
    if (!fs.existsSync(outroPath)) throw new Error(`Outro not found at ${outroPath}`);

    // Build robust ffmpeg filter_complex to normalize SAR, fps and audio channels
    const filterComplex = [
      // Normalize intro
      '[0:v]scale=1920:1080,setsar=1,fps=30[v0];',
      '[0:a]aresample=48000,channelmap=channel_layout=stereo,asetpts=PTS-STARTPTS[a0];',
      // Normalize recording
      '[1:v]scale=1920:1080,setsar=1,fps=30[v1];',
      // Convert mono->stereo safely (pan) and set pts
      '[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,asetpts=PTS-STARTPTS[a1];',
      // Normalize outro
      '[2:v]scale=1920:1080,setsar=1,fps=30[v2];',
      '[2:a]aresample=48000,channelmap=channel_layout=stereo,asetpts=PTS-STARTPTS[a2];',
      // concat: v,a pairs
      '[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]'
    ].join('');

    const ffmpegArgs = [
      '-fflags', '+genpts',
      '-i', introPath,
      '-i', tempRecordingPath,
      '-i', outroPath,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-r', '30',
      '-y',
      outputPath
    ];

    console.log('Spawning ffmpeg with args:', ffmpegArgs.join(' '));

    await runFFmpegWithArgs(ffmpeg, ffmpegArgs);

    console.log(`Render complete! Final video at: ${outputPath}`);
    return res.status(200).json({ message: 'Render successful!', finalPath: outputPath });

  } catch (error) {
    console.error('Error during render process:', error?.message || error);
    if (error?.stderr) console.error('ffmpeg stderr:', error.stderr);
    return res.status(500).json({ error: error?.message || 'Video rendering failed', detail: error?.stderr || null });
  } finally {
    try {
      if (fs.existsSync(tempRecordingPath)) {
        fs.unlinkSync(tempRecordingPath);
        console.log('Deleted temp recording:', tempRecordingPath);
      }
    } catch (e) {
      console.warn('Failed to delete temp recording:', e.message);
    }
  }
});

// ----------------------- Transcribe endpoint -----------------------
app.post('/transcribe', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).send('File name is required.');

  const tempVideoPath = path.join(__dirname, 'tmp', fileName);
  const audioOutputPath = path.join(__dirname, 'tmp', `audio-${Date.now()}.wav`);
  try {
    console.log(`Starting transcription process for ${fileName}...`);

    const { data, error } = await supabase.storage.from('recordings').download(fileName);
    if (error) throw error;

    const arrayBuffer = await data.arrayBuffer();
    fs.writeFileSync(tempVideoPath, Buffer.from(arrayBuffer));
    console.log('Saved temp video to', tempVideoPath);

    if (!fs.existsSync(tempVideoPath)) throw new Error('Temp video file missing after save');

    // convert to 16k mono WAV for whisper / local python transcriber
    const ffmpegArgs = ['-fflags', '+genpts', '-i', tempVideoPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', audioOutputPath, '-y'];
    await runFFmpegWithArgs(ffmpeg, ffmpegArgs);

    console.log('Audio extracted. Sending audio data to Python server...');

    const form = new FormData();
    form.append('audio', fs.createReadStream(audioOutputPath));

    // use 127.0.0.1 to avoid IPv6 issues
    const response = await axios.post('http://127.0.0.1:5001/transcribe', form, {
      headers: { ...form.getHeaders() },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    });

    console.log('Transcription complete.');
    return res.status(200).json({ transcript: response.data.transcript });
  } catch (error) {
    console.error('Error during transcription process:', error?.message || error);
    if (error?.stderr) console.error('ffmpeg stderr:', error.stderr);
    if (error?.code === 'ECONNREFUSED') {
      return res.status(502).json({ error: 'Transcription server unreachable. Start the Python transcriber on port 5001.' });
    }
    return res.status(500).json({ error: error?.message || 'An error occurred during transcription.', detail: error?.stderr || null });
  } finally {
    try { if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath); } catch (e) { console.warn('failed to delete temp video', e.message); }
    try { if (fs.existsSync(audioOutputPath)) fs.unlinkSync(audioOutputPath); } catch (e) { console.warn('failed to delete audio output', e.message); }
  }
});

// ----------------------- Summarize endpoint (Hugging Face robust router) -----------------------
app.post('/summarize', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'Transcript is required.' });

  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) return res.status(500).json({ error: 'HUGGINGFACE_API_KEY missing in .env' });

  // Tunables
  const CHUNK_CHAR_SIZE = 1200;             // chunk size for input text
  const CHUNK_MODEL = 'sshleifer/distilbart-cnn-12-6'; // fast chunk summarizer
  const MERGE_MODEL = 'facebook/bart-large-cnn';       // optional merge model
  const HF_BASE = 'https://router.huggingface.co/hf-inference/models';
  const PER_CALL_TIMEOUT = 180000; // 3 minutes per call
  const MAX_ATTEMPTS = 3;

  // helpers
  function splitIntoChunks(text, maxChars) {
    const words = text.split(/\s+/);
    const chunks = [];
    let curr = [];
    let currLen = 0;
    for (const w of words) {
      const addLen = (currLen === 0 ? w.length : 1 + w.length);
      if (currLen + addLen > maxChars) {
        if (curr.length) {
          chunks.push(curr.join(' '));
          curr = [];
          currLen = 0;
        }
      }
      curr.push(w);
      currLen += addLen;
    }
    if (curr.length) chunks.push(curr.join(' '));
    return chunks;
  }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function callRouterSummarize(modelId, inputText, params = {}) {
    const endpoint = `${HF_BASE}/${encodeURIComponent(modelId)}/pipeline/summarization?wait_for_model=true`;
    const payload = {
      inputs: inputText,
      parameters: {
        max_length: params.max_length ?? 150,
        min_length: params.min_length ?? 30,
        do_sample: params.do_sample ?? false
      }
    };

    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const resp = await axios.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${hfKey}`,
            'Content-Type': 'application/json'
          },
          timeout: PER_CALL_TIMEOUT
        });
        const data = resp.data;
        if (Array.isArray(data) && data[0]?.summary_text) return data[0].summary_text;
        if (data?.summary_text) return data.summary_text;
        if (typeof data === 'string') return data;
        if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
        throw new Error('Unexpected HF response shape: ' + JSON.stringify(data).slice(0, 1000));
      } catch (err) {
        lastErr = err;
        if (err.response) {
          console.warn('Hugging Face response status:', err.response.status);
          const snippet = (typeof err.response.data === 'string') ? err.response.data.slice(0, 4000) : JSON.stringify(err.response.data).slice(0, 4000);
          console.warn('Hugging Face response body (snippet):', snippet);
          if (err.response.status >= 400 && err.response.status < 500) {
            const e = new Error(`Hugging Face returned ${err.response.status}`);
            e.hfBody = err.response.data;
            throw e;
          }
        }
        console.warn(`HF summarize attempt ${attempt} failed: ${err.message || err}`);
        const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 20000) + Math.floor(Math.random() * 300);
        await sleep(backoff);
      }
    }
    const e = new Error('Hugging Face summarization failed after retries: ' + (lastErr?.message || lastErr));
    e.cause = lastErr;
    throw e;
  }

  try {
    // sanitize and trim
    const cleaned = transcript.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
    if (!cleaned) return res.status(400).json({ error: 'Transcript empty after cleaning' });

    // small transcripts: single call
    if (cleaned.length <= CHUNK_CHAR_SIZE) {
      console.log('Single-call summarization (small transcript).');
      const single = await callRouterSummarize(CHUNK_MODEL, cleaned, { max_length: 200, min_length: 40 });
      return res.status(200).json({ summary: single });
    }

    // split large transcript
    const chunks = splitIntoChunks(cleaned, CHUNK_CHAR_SIZE);
    console.log(`Transcript length ${cleaned.length} split into ${chunks.length} chunk(s)`);

    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      const piece = chunks[i];
      console.log(`Summarizing chunk ${i + 1}/${chunks.length} with model ${CHUNK_MODEL}`);
      try {
        const s = await callRouterSummarize(CHUNK_MODEL, piece, { max_length: 120, min_length: 20 });
        chunkSummaries.push(s);
      } catch (chunkErr) {
        console.error(`Chunk ${i + 1} summarization failed:`, chunkErr.message || chunkErr);
        // fallback: keep a trimmed version of chunk to avoid data loss
        const fallback = piece.length > 300 ? piece.slice(0, 300) + '...' : piece;
        chunkSummaries.push(fallback);
      }
    }

    // if only one chunk summary return it directly
    if (chunkSummaries.length === 1) {
      return res.status(200).json({ summary: chunkSummaries[0] });
    }

    // attempt to merge chunk summaries with stronger model
    const mergeInput = chunkSummaries.map((s, idx) => `PART ${idx + 1}:\n${s}`).join('\n\n');
    const mergePrompt = `You are an assistant. The following are short summaries of parts of a meeting transcript. Produce:
1) A 1-2 sentence TL;DR.
2) 3–6 concise bullet point key takeaways.
3) Any action items as bullets in the format "Who — Action" when possible.

Summaries:
${mergeInput}
`;
    try {
      console.log(`Attempting merge with ${MERGE_MODEL}`);
      const merged = await callRouterSummarize(MERGE_MODEL, mergePrompt, { max_length: 400, min_length: 80 });
      return res.status(200).json({ summary: merged, chunks: chunkSummaries });
    } catch (mergeErr) {
      console.warn('Merge step failed; returning chunk summaries as fallback:', mergeErr.message || mergeErr);
      const fallbackCombined = chunkSummaries.join('\n\n');
      return res.status(200).json({
        summary: fallbackCombined,
        note: 'Merged summary failed; returned per-chunk summaries as fallback.',
        mergeError: mergeErr.message || String(mergeErr)
      });
    }
  } catch (err) {
    console.error('Error during HF chunked summarization:', err?.message || err);
    if (err?.hfBody) {
      return res.status(502).json({ error: 'Hugging Face returned 4xx', detail: err.hfBody });
    }
    if (err?.response?.data) {
      return res.status(502).json({ error: 'HuggingFace summarization failed', detail: err.response.data });
    }
    return res.status(500).json({ error: err?.message || 'Unknown summarization error' });
  }
});

// ----------------------- WebSocket Server -----------------------
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
  const userID = crypto.randomUUID();
  clients.set(userID, ws);
  console.log(` User registered with ID: ${userID}`);
  
  // Send ID to client
  try { 
    ws.send(JSON.stringify({ type: 'id-assigned', userID })); 
  } catch (e) {
    console.error('Error sending ID:', e.message);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(` Message from ${userID}:`, data.offer ? 'OFFER' : data.answer ? 'ANSWER' : 'OTHER');
      
      const targetUserID = data.to;
      
      if (!targetUserID) {
        console.warn(' No target ID specified');
        return;
      }
      
      const targetClient = clients.get(targetUserID);
      
      if (!targetClient) {
        console.warn(` Target client ${targetUserID} not found`);
        ws.send(JSON.stringify({ 
          error: 'Target peer not found',
          targetId: targetUserID 
        }));
        return;
      }
      
      // Check if target connection is open (fixed - use ws.OPEN constant)
      if (targetClient.readyState === ws.OPEN) {
        data.from = userID;
        targetClient.send(JSON.stringify(data));
        console.log(` Routed message from ${userID} to ${targetUserID}`);
      } else {
        console.warn(` Target client ${targetUserID} connection not open (state: ${targetClient.readyState})`);
        ws.send(JSON.stringify({ 
          error: 'Target peer connection not ready',
          targetId: targetUserID 
        }));
      }
    } catch (e) {
      console.error(' WS message parse/send error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(` User ${userID} disconnected.`);
    clients.delete(userID);
  });

  ws.on('error', (error) => {
    console.error(` WebSocket error for ${userID}:`, error.message);
  });
});

console.log(' WebSocket server ready for peer connections');