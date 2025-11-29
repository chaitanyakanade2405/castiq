import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import './App.css';

let socket = null;

function App() {
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [myID, setMyID] = useState('');
  const [peerID, setPeerID] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [combinedStream, setCombinedStream] = useState(null);
  const [lastUploadedPath, setLastUploadedPath] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const myVideo = useRef(null);
  const remoteVideo = useRef(null);
  const canvasRef = useRef(null);
  const connectionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const pendingOfferRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket
    socket = new WebSocket('ws://localhost:8080');
    
    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = (message) => {
      const signal = JSON.parse(message.data);
      console.log('Received signal:', signal);
      
      if (signal.type === 'id-assigned') {
        setMyID(signal.userID);
      } else if (signal.offer) {
        console.log('Received offer from:', signal.from);
        // Store the offer and answer when stream is ready
        if (streamRef.current) {
          answerCall(signal, streamRef.current);
        } else {
          pendingOfferRef.current = signal;
        }
      } else if (signal.answer && connectionRef.current) {
        console.log('Received answer from:', signal.from);
        connectionRef.current.signal(signal.answer);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log('Camera ready');
        setMyStream(stream);
        streamRef.current = stream;
        setCameraReady(true);
        if (myVideo.current) {
          myVideo.current.srcObject = stream;
        }
        
        // If there's a pending offer, answer it now
        if (pendingOfferRef.current) {
          answerCall(pendingOfferRef.current, stream);
          pendingOfferRef.current = null;
        }
      })
      .catch(err => {
        console.error('Camera error:', err);
        alert('Please allow camera and microphone access');
      });

    return () => {
      if (connectionRef.current) {
        connectionRef.current.destroy();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (socket) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (myStream && remoteStream && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 1280;
      canvas.height = 720;

      const drawVideos = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (myVideo.current && myVideo.current.readyState >= 2) {
          ctx.drawImage(myVideo.current, 0, 0, canvas.width / 2, canvas.height);
        }
        if (remoteVideo.current && remoteVideo.current.readyState >= 2) {
          ctx.drawImage(remoteVideo.current, canvas.width / 2, 0, canvas.width / 2, canvas.height);
        }
        requestAnimationFrame(drawVideos);
      };

      drawVideos();

      const canvasStream = canvas.captureStream(30);
      const myAudio = myStream.getAudioTracks()[0];
      const remoteAudio = remoteStream.getAudioTracks()[0];

      if (myAudio) canvasStream.addTrack(myAudio);
      if (remoteAudio) canvasStream.addTrack(remoteAudio);

      setCombinedStream(canvasStream);
    }
  }, [myStream, remoteStream]);

  const callUser = () => {
    if (!peerID) {
      alert("Please enter the peer's ID.");
      return;
    }
    
    if (!cameraReady || !streamRef.current) {
      alert("Please wait for your camera to load.");
      return;
    }

    console.log('Initiating call to:', peerID);

    const peer = new Peer({ 
      initiator: true, 
      trickle: false, 
      stream: streamRef.current,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (data) => {
      console.log('Sending offer to:', peerID);
      socket.send(JSON.stringify({ 
        offer: data, 
        to: peerID
      }));
    });

    peer.on('stream', (stream) => {
      console.log('Received remote stream');
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
      }
      setRemoteStream(stream);
      setIsConnected(true);
    });

    peer.on('connect', () => {
      console.log('Peer connection established');
      setIsConnected(true);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      alert('Connection error: ' + err.message);
      setIsConnected(false);
    });

    peer.on('close', () => {
      console.log('Peer connection closed');
      setIsConnected(false);
      setRemoteStream(null);
    });

    connectionRef.current = peer;
  };

  const answerCall = (signal, stream) => {
    console.log('Answering call from:', signal.from);
    
    const peer = new Peer({ 
      initiator: false, 
      trickle: false, 
      stream: stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (data) => {
      console.log('Sending answer to:', signal.from);
      socket.send(JSON.stringify({ 
        answer: data, 
        to: signal.from
      }));
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream in answer');
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStream;
      }
      setRemoteStream(remoteStream);
      setIsConnected(true);
    });

    peer.on('connect', () => {
      console.log('Peer connection established (answerer)');
      setIsConnected(true);
    });

    peer.on('error', (err) => {
      console.error('Peer error (answerer):', err);
      setIsConnected(false);
    });

    peer.on('close', () => {
      console.log('Peer connection closed (answerer)');
      setIsConnected(false);
      setRemoteStream(null);
    });

    peer.signal(signal.offer);
    connectionRef.current = peer;
  };

  const endCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    setRemoteStream(null);
    setIsConnected(false);
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
  };

  const startRecording = () => {
    const streamToRecord = combinedStream || streamRef.current;

    if (!streamToRecord) {
      alert("No stream available to record");
      return;
    }

    const recorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecording = async () => {
    if (!recordedChunks.length) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    const fileName = `recording-${Date.now()}.webm`;

    formData.append('video', blob, fileName);

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8080/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        alert("Upload failed.");
        setIsLoading(false);
        return;
      }

      const result = await response.json();
      setLastUploadedPath(result.path);
      alert("Upload successful!");

      fetch('http://localhost:8080/render', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: result.path })
      });

    } catch (err) {
      console.error('Upload error:', err);
      alert("Error uploading.");
    }

    setRecordedChunks([]);
    setIsLoading(false);
  };

  const transcribeRecording = async () => {
    if (!lastUploadedPath) return;

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8080/transcribe', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: lastUploadedPath })
      });

      const result = await response.json();
      setTranscript(result.transcript);
      alert("Transcription complete!");

    } catch (err) {
      console.error('Transcription error:', err);
      alert("Transcription error.");
    }

    setIsLoading(false);
  };

  const summarizeTranscript = async () => {
    if (!transcript) return;

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8080/summarize', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript })
      });

      const result = await response.json();
      setSummary(result.summary);
      alert("Summarization complete!");

    } catch (err) {
      console.error('Summarization error:', err);
      alert("Summarization error.");
    }

    setIsLoading(false);
  };

  return (
    <div className="App">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="container">
        {/* Header */}
        <header>
          <div className="header-content">
            <div>
              <h1>CastIQ</h1>
              <p className="tagline">AI-Powered Podcasting Platform</p>
            </div>
            
            {isLoading && (
              <div className="loading-spinner">
                <div className="spinner-dot"></div>
                <span>Processing...</span>
              </div>
            )}
          </div>
        </header>

        {/* Connection Status */}
        {isConnected && (
          <div className="connection-status">
            <div className="status-indicator"></div>
            <span>Connected</span>
          </div>
        )}

        {/* Camera Status */}
        {!cameraReady && (
          <div className="camera-loading">
            <div className="spinner-dot"></div>
            <span>Loading camera...</span>
          </div>
        )}

        {/* Video Grid */}
        <div className="video-grid">
          <div className="video-wrapper">
            <video playsInline muted ref={myVideo} autoPlay className="video-element" />
            <div className="video-label">You</div>
          </div>
          
          <div className="video-wrapper">
            <video playsInline ref={remoteVideo} autoPlay className="video-element" />
            <div className="video-label guest-label">Guest</div>
            {!remoteStream && (
              <div className="waiting-overlay">
                <p>Waiting for guest...</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          {/* Your ID */}
          <div className="control-section">
            <p className="section-label">Your Connection ID</p>
            <div className="id-display">
              <code className="user-id">{myID || 'Connecting...'}</code>
            </div>
          </div>

          {/* Call Section */}
          <div className="control-section">
            <p className="section-label">Connect with Guest</p>
            <div className="call-row">
              <input 
                type="text" 
                value={peerID} 
                onChange={(e) => setPeerID(e.target.value)} 
                placeholder="Enter guest ID" 
                disabled={isConnected || !cameraReady}
              />
              {!isConnected ? (
                <button 
                  onClick={callUser} 
                  className="btn-primary"
                  disabled={!cameraReady}
                >
                  Start Call
                </button>
              ) : (
                <button onClick={endCall} className="btn-stop">
                  End Call
                </button>
              )}
            </div>
          </div>

          {/* Recording Section */}
          <div className="control-section">
            <p className="section-label">Recording Controls</p>
            <div className="record-row">
              {isRecording ? (
                <button onClick={stopRecording} className="btn-stop">
                  <div className="record-indicator"></div>
                  Stop Recording
                </button>
              ) : (
                <button 
                  onClick={startRecording} 
                  className="btn-record"
                  disabled={!cameraReady}
                >
                  <div className="record-dot"></div>
                  Start Recording
                </button>
              )}

              {recordedChunks.length > 0 && !isRecording && (
                <button onClick={uploadRecording} className="btn-upload">
                  Upload Recording
                </button>
              )}

              {lastUploadedPath && (
                <button onClick={transcribeRecording} className="btn-transcribe">
                  Transcribe
                </button>
              )}

              {transcript && (
                <button onClick={summarizeTranscript} className="btn-summarize">
                  Summarize
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {(transcript || summary) && (
          <div className="results">
            {transcript && (
              <div className="result-box">
                <div className="result-header">
                  <div className="result-icon icon-transcript">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2>Transcript</h2>
                </div>
                <div className="result-content">
                  <p>{transcript}</p>
                </div>
              </div>
            )}

            {summary && (
              <div className="result-box">
                <div className="result-header">
                  <div className="result-icon icon-summary">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h2>Summary</h2>
                </div>
                <div className="result-content">
                  <p>{summary}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;