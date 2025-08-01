import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import './App.css';

const socket = new WebSocket('ws://localhost:8080');

function App() {
  // State for streams, IDs, and call status
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
        if(myVideo.current) {
          myVideo.current.srcObject = stream;
        }
      });
    
    socket.onmessage = (message) => {
      const signal = JSON.parse(message.data);
      if (signal.type === 'id-assigned') {
        setMyID(signal.userID);
      } else if (signal.offer) {
        answerCall(signal);
      } else if (signal.answer) {
        if (connectionRef.current) {
          connectionRef.current.signal(signal.answer);
        }
      }
    };
  }, []);

  // Effect for combining video and audio streams onto a canvas
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
      
      const canvasStream = canvas.captureStream(30);
      
      const myAudioTrack = myStream.getAudioTracks()[0];
      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      
      if (myAudioTrack) canvasStream.addTrack(myAudioTrack);
      if (remoteAudioTrack) canvasStream.addTrack(remoteAudioTrack);
      
      setCombinedStream(canvasStream);
    }
  }, [myStream, remoteStream]);

  // --- Call Functions ---
  const callUser = () => {
    if (!peerID) {
      alert("Please enter the peer's ID to call.");
      return;
    }
    const peer = new Peer({ initiator: true, trickle: false });
    if (myStream) {
      peer.addStream(myStream);
    }
    peer.on('signal', (data) => {
      socket.send(JSON.stringify({ offer: data, to: peerID }));
    });
    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
        setRemoteStream(stream);
      }
    });
    connectionRef.current = peer;
  };

  const answerCall = (signal) => {
    const peer = new Peer({ initiator: false, trickle: false });
    if (myStream) {
      peer.addStream(myStream);
    }
    peer.on('signal', (data) => {
      socket.send(JSON.stringify({ answer: data, to: signal.from }));
    });
    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
        setRemoteStream(stream);
      }
    });
    peer.signal(signal.offer);
    connectionRef.current = peer;
  };

  // --- Recording Functions ---
  const startRecording = () => {
    const streamToRecord = combinedStream || myStream;
    if (streamToRecord) {
      mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
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

 const uploadRecording = async () => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', blob, `recording-${Date.now()}.webm`);

    try {
      // --- First, upload the recording ---
      console.log("Uploading recording...");
      const uploadResponse = await fetch('http://localhost:8080/upload', {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        console.log("Upload successful:", uploadResult);
        alert("Upload successful! Starting render process...");

        // --- NEW: If upload is successful, trigger the render ---
        console.log("Triggering render for file:", uploadResult.path);
        const renderResponse = await fetch('http://localhost:8080/render', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileName: uploadResult.path }),
        });

        if (renderResponse.ok) {
          const renderResult = await renderResponse.json();
          console.log("Render successful:", renderResult);
          alert("Video rendering complete!");
        } else {
          alert("Render process failed.");
        }

      } else {
        alert("Upload failed.");
      }
    } catch (error) {
      console.error("An error occurred:", error);
      alert("An error occurred during the process.");
    } finally {
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
        <p>Your ID: <strong>{myID}</strong></p>
        <div>
          <input 
            type="text" 
            value={peerID} 
            onChange={(e) => setPeerID(e.target.value)}
            placeholder="Enter peer's ID to call"
          />
          <button onClick={callUser}>Call</button>
        </div>
        <div>
          {isRecording ? (
            <button onClick={stopRecording}>Stop Recording</button>
          ) : (
            <button onClick={startRecording}>Start Recording</button>
          )}
          {recordedChunks.length > 0 && !isRecording && (
            <button onClick={uploadRecording}>Upload Recording</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;