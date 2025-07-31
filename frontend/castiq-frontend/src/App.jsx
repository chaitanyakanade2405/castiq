import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import './App.css';

const socket = new WebSocket('ws://localhost:8080');

function App() {
  // State for streams and IDs
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [myID, setMyID] = useState('');
  const [peerID, setPeerID] = useState('');
  
  // State for recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [combinedStream, setCombinedStream] = useState(null);

  // Refs for DOM elements and objects
  const myVideo = useRef(null);
  const remoteVideo = useRef(null);
  const canvasRef = useRef(null);
  const connectionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  
  // Effect for initial setup and WebSocket messages
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setMyStream(stream);
        if(myVideo.current) myVideo.current.srcObject = stream;
      });
    
    socket.onmessage = (message) => {
      const signal = JSON.parse(message.data);
      if (signal.type === 'id-assigned') {
        setMyID(signal.userID);
      } else if (signal.offer) {
        answerCall(signal);
      } else if (signal.answer) {
        connectionRef.current.signal(signal.answer);
      }
    };
  }, []);

  // Effect for combining video streams onto a canvas
  useEffect(() => {
    if (myStream && remoteStream && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 1280;
      canvas.height = 720;

      const drawVideos = () => {
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (myVideo.current) ctx.drawImage(myVideo.current, 0, 0, canvas.width / 2, canvas.height);
          if (remoteVideo.current) ctx.drawImage(remoteVideo.current, canvas.width / 2, 0, canvas.width / 2, canvas.height);
        }
        requestAnimationFrame(drawVideos);
      };
      drawVideos();
      
      const stream = canvas.captureStream(30);
      setCombinedStream(stream);
    }
  }, [myStream, remoteStream]);

  // --- Call Functions ---
  const callUser = () => {
    if (!peerID) {
        alert("Please enter the peer's ID to call.");
        return;
    }
    const peer = new Peer({ initiator: true, trickle: false });
    if (myStream) peer.addStream(myStream);
    peer.on('signal', (data) => socket.send(JSON.stringify({ offer: data, to: peerID })));
    peer.on('stream', (stream) => { if (remoteVideo.current) remoteVideo.current.srcObject = stream; });
    connectionRef.current = peer;
  };

  const answerCall = (signal) => {
    const peer = new Peer({ initiator: false, trickle: false });
    if (myStream) peer.addStream(myStream);
    peer.on('signal', (data) => socket.send(JSON.stringify({ answer: data, to: signal.from })));
    peer.on('stream', (stream) => { if (remoteVideo.current) remoteVideo.current.srcObject = stream; });
    peer.signal(signal.offer);
    connectionRef.current = peer;
  };

  // --- Recording Functions ---
  const startRecording = () => {
    const streamToRecord = combinedStream || myStream; // Record combined stream if available, otherwise just local
    if (streamToRecord) {
      mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) setRecordedChunks((prev) => [...prev, event.data]);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const downloadRecording = () => {
    if (recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `castiq-recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setRecordedChunks([]);
    }
  };
  
  return (
    <div className="App">
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      
      <h1>CastIQ</h1>
      <div className="video-grid">
        <video playsInline muted ref={myVideo} autoPlay />
        <video playsInline ref={remoteVideo} autoPlay />
      </div>

      <div className="controls">
        <p>Your ID: <strong>{myID}</strong> (Share this with your friend)</p>
        <div>
          <input 
            type="text" 
            value={peerID} 
            onChange={(e) => setPeerID(e.target.value)}
            placeholder="Enter peer's ID to call"
          />
          <button onClick={callUser}>Call</button>
        </div>
        
        {/* --- Recording UI is now back --- */}
        <div>
          {isRecording ? (
            <button onClick={stopRecording}>Stop Recording</button>
          ) : (
            <button onClick={startRecording}>Start Recording</button>
          )}
          {recordedChunks.length > 0 && !isRecording && (
            <button onClick={downloadRecording}>Download</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;