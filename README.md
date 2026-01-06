# 🎙️ CastIQ – AI-Powered Podcasting Platform

**CastIQ** is an AI-powered podcasting and video recording platform designed to make content creation **simple, automated, and intelligent**.  
It allows users to record videos directly from the browser, automatically process them with intros/outros, transcribe speech, and generate smart AI summaries.

> ⚡ Built entirely using **free tools**, **open-source models**, and **zero paid services**.

---

## 🚀 Features

### 🎥 1. Browser-Based Video Recording
- Record video and audio directly from the browser using **WebRTC**
- Automatically assigns **unique user IDs** per session
- Supports **peer-to-peer calls** (prototype stage)

---

### 🎬 2. Automated Video Rendering (FFmpeg Pipeline)
The backend performs:
- Downloading recorded video
- Adding **intro & outro clips**
- Audio normalization
- Merging all segments into a **final MP4**
- Safe cleanup of temporary files

---

### 🗣️ 3. Speech-to-Text Transcription (Local Python Server)
- Uses a dedicated **Python microservice**
- Supports **Whisper-like open-source models**
- Converts extracted audio (`WAV`) → **text transcript**
- Powered via **HuggingFace Transformers**

---

### 🧠 4. AI Summarization (HuggingFace)
- Uses **free HuggingFace Inference API**
- Supports models like **DistilBART / Pegasus**
- Implements **retry logic & fallbacks** for reliability

---

### 🎧 5. Audio Extraction & Processing
- FFmpeg extracts **mono 16 kHz WAV audio**
- Fully compatible with Whisper-style models

---

### 🗂️ 6. Clean Frontend & Backend Architecture
Clear separation of concerns:
- Frontend → UI & recording
- Backend → video processing & orchestration
- Python service → transcription

---

## 🏗️ Project Structure

```bash
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
    ├── tmp/                 # Auto-generated temporary files
    ├── transcriber/
    │   ├── venv/
    │   └── server.py        # Python transcription server
    ├── index.js             # Main Node.js backend
    ├── supabaseClient.js
    ├── .env
    └── package.json
```
---

## ⚙️ Tech Stack

### Frontend
- **React (Vite)**
- **WebRTC**
- **Tailwind CSS / CSS**

### Backend
- **Node.js + Express**
- **FFmpeg** (video & audio processing)
- **Supabase** (optional storage)
- **HuggingFace API** (AI summarization)
- **Python microservice** (speech-to-text transcription)

---

## 🔧 Setup Instructions

### 1️⃣ Clone the Repository
```bash
git clone <repository-url>
cd CastIQ
### 2️⃣ Backend Setup
cd backend
npm install
Create a .env file:

env
Copy code
SUPABASE_URL=
SUPABASE_KEY=
HUGGINGFACE_API_KEY=
PORT=8080
Run the backend:

bash
Copy code
node index.js
3️⃣ Python Transcription Server Setup
bash
Copy code
cd backend/transcriber
python -m venv venv
venv\Scripts\activate   # For Windows
pip install -r requirements.txt
python server.py
4️⃣ Frontend Setup
bash
Copy code
cd frontend/castiq-frontend
npm install
npm run dev
🎞️ Full Processing Pipeline
1️⃣ User records video in the browser
2️⃣ Frontend uploads recorded .webm file to backend

3️⃣ Backend processing:

Downloads the video

Extracts audio using FFmpeg

Merges intro + main video + outro

Generates final MP4 output

4️⃣ Audio is sent to Python transcription service

Audio → Transcript

5️⃣ Transcript is sent to HuggingFace

Transcript → AI Summary

6️⃣ Final transcript & summary are returned to frontend
```
---

## 📌 Current Status
### Feature	Status
- Browser Recording	✅ Working
- Video Rendering	✅ Working
- Audio Validation	✅ Verified (VLC)
- Transcription	✅ Working
- AI Summarization	✅ Working (Fallback Logic Added)
- Transcript Display	✅ Working
- UI Polishing	⏳ In Progress
- Multi-User Call Support	🚧 Planned

## 🛠️ Future Roadmap
- 🎞️ Timeline-based video editing

- ✂️ AI filler-word removal

- 🔇 Background noise reduction

- ☁️ Downloadable MP4 hosting via Supabase

- 🎨 Fully designed UI/UX

- 👥 Stable multi-user call support
