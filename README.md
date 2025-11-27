CastIQ – AI Powered Podcasting Platform

CastIQ is an AI-powered podcasting and video-recording platform designed to make content creation simple, automated, and intelligent. It enables users to record videos through the browser, automatically merge intro/outro clips, transcribe speech, and generate smart summaries using AI models.

This project is built fully with free tools, open-source models, and zero external paid services.

🚀 Features
🎥 1. Browser-Based Video Recording

Record video/audio directly from the browser using WebRTC

Auto-assign unique user IDs for each session

Peer-to-peer call support (initial prototype)

🎬 2. Automated Video Rendering (FFmpeg Pipeline)

The backend:

Downloads recorded video

Adds intro and outro clips

Normalizes audio

Merges everything into a final MP4 output

Cleans temporary files safely

🗣️ 3. Speech-to-Text Transcription (Local Python Server)

Uses a Python microservice to run transcription

Whisper-like open-source models supported (via HuggingFace Transformers)

Converts extracted audio (WAV) → text transcript

🧠 4. AI Summarization using HuggingFace

Uses free HuggingFace Inference API (distilbart/pegasus-like models)

Summarizes transcripts efficiently

Includes retry logic + fallbacks for reliability

🎧 5. Audio Extraction & Processing

FFmpeg automatically extracts mono 16 kHz WAV audio

Ensures compatibility with Whisper-style models

🗂️ 6. Organized Frontend & Backend Architecture

Clean code separation:

/frontend/castiq-frontend         → Vite + React application
/backend                          → Node.js server + video pipeline
/backend/transcriber              → Python transcription microservice

🏗️ Project Structure
CastIQ
│
├── frontend/
│   └── castiq-frontend/
│       ├── public/
│       ├── src/
│       │   ├── assets/
│       │   ├── App.jsx
│       │   ├── App.css
│       │   ├── index.css
│       │   ├── main.jsx
│       │   └── ...
│       ├── vite.config.js
│       └── package.json
│
└── backend/
    ├── assets/
    │   ├── intro.webm
    │   └── outro.webm
    ├── tmp/                     → Auto-generated temporary files
    ├── transcriber/
    │   ├── venv/
    │   └── server.py           → Python transcription server
    ├── index.js                 → Main Node.js backend
    ├── supabaseClient.js
    ├── .env
    └── package.json

⚙️ Tech Stack
Frontend

React (Vite)

WebRTC

Tailwind / CSS

Backend

Node.js + Express

FFmpeg for video rendering

Supabase for storage (optional)

HuggingFace API for summarization

Python microservice for transcription

🔧 Setup Instructions
1. Clone the Project
git clone <your-repo-url>
cd CastIQ

2. Setup Backend
cd backend
npm install

Create a .env file:
SUPABASE_URL=
SUPABASE_KEY=
HUGGINGFACE_API_KEY=
PORT=8080

Run the backend
node index.js

3. Setup Python Transcription Server
cd transcriber
python -m venv venv
venv\Scripts\activate     # For Windows
pip install -r requirements.txt
python server.py

4. Setup Frontend
cd frontend/castiq-frontend
npm install
npm run dev

🎞️ How the Full Pipeline Works
1️⃣ User records video in browser
2️⃣ Frontend uploads .webm to backend
3️⃣ Backend:

✔ downloads it
✔ extracts audio
✔ merges intro + output + outro
✔ saves final MP4

4️⃣ Backend sends audio to Python

✔ Python transcribes
✔ Sends text back

5️⃣ Node backend sends transcript to HuggingFace

✔ Generates summary
✔ Returns final structured response

📌 Current Status

Recording → Working

Rendering → Working (audio validated in VLC)

Transcription → Working

Summarization → Working (fallback logic added)

Frontend transcript display → Working

UI polishing → Next phase

Full multi-user call support → Future enhancement

🛠️ Future Roadmap

Add timeline-based editing

AI cleanup: filler word removal

Background noise reduction

Host downloadable MP4s via Supabase

Fully designed UI/UX
