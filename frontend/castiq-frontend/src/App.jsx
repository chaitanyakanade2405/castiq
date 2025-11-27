import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import './App.css';

const socket = new WebSocket('ws://localhost:8080');

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

  const myVideo = useRef(null);
  const remoteVideo = useRef(null);
  const canvasRef = useRef(null);
  const connectionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setMyStream(stream);
        if(myVideo.current) myVideo.current.srcObject = stream;
      });
    
    socket.onmessage = (message) => {
      const signal = JSON.parse(message.data);
      if (signal.type === 'id-assigned') setMyID(signal.userID);
      else if (signal.offer) answerCall(signal);
      else if (signal.answer) { if (connectionRef.current) connectionRef.current.signal(signal.answer); }
    };
  }, []);

  useEffect(() => {
    if (myStream && remoteStream && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 1280; canvas.height = 720;
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

  const callUser = () => {
    if (!peerID) return alert("Please enter the peer's ID to call.");
    const peer = new Peer({ initiator: true, trickle: false, stream: myStream });
    peer.on('signal', (data) => socket.send(JSON.stringify({ offer: data, to: peerID })));
    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
        setRemoteStream(stream);
      }
    });
    connectionRef.current = peer;
  };

  const answerCall = (signal) => {
    const peer = new Peer({ initiator: false, trickle: false, stream: myStream });
    peer.on('signal', (data) => socket.send(JSON.stringify({ answer: data, to: signal.from })));
    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
        setRemoteStream(stream);
      }
    });
    peer.signal(signal.offer);
    connectionRef.current = peer;
  };

  const startRecording = () => {
    const streamToRecord = combinedStream || myStream;
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

  const uploadRecording = async () => {
    if (recordedChunks.length === 0) return;
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    const fileName = `recording-${Date.now()}.webm`;
    formData.append('video', blob, fileName);
    setIsLoading(true);
    try {
      const uploadResponse = await fetch('http://localhost:8080/upload', { 
        method: 'POST', 
        body: formData 
      });

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        alert("Upload successful! The video will now be rendered in the background.");
        setLastUploadedPath(uploadResult.path);
        setTranscript('');
        setSummary('');

        // Automatically trigger the render process in the background
        console.log("Triggering render for file:", uploadResult.path);
        fetch('http://localhost:8080/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: uploadResult.path }),
        });
        // We don't "await" this, so the UI can continue while the server works.

      } else {
        alert("Upload failed.");
      }
    } catch (error) {
      alert("An error occurred during upload.");
    } finally {
      setIsLoading(false);
      setRecordedChunks([]);
    }
  };

  const transcribeRecording = async () => {
    if (!lastUploadedPath) return alert("Please upload a recording first.");
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8080/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: lastUploadedPath })
      });
      if (response.ok) {
        const result = await response.json();
        setTranscript(result.transcript);
        alert("Transcription Complete!");
      } else {
        alert("Transcription failed.");
      }
    } catch (error) {
      alert("An error occurred during transcription.");
    } finally {
      setIsLoading(false);
    }
  };

  const summarizeTranscript = async () => {
    if (!transcript) return alert("Please generate a transcript first.");
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8080/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript })
      });
      if (response.ok) {
        const result = await response.json();
        setSummary(result.summary);
        alert("Summarization Complete!");
      } else {
        alert("Summarization failed.");
      }
    } catch (error) {
      alert("An error occurred during summarization.");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="App">
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      <h1>CastIQ</h1>
      {isLoading && <div className="loading-spinner">Processing...</div>}
      <div className="video-grid">
        <video playsInline muted ref={myVideo} autoPlay />
        <video playsInline ref={remoteVideo} autoPlay />
      </div>
      <div className="controls">
        <p>Your ID: <strong>{myID}</strong></p>
        <div>
          <input type="text" value={peerID} onChange={(e) => setPeerID(e.target.value)} placeholder="Enter peer's ID"/>
          <button onClick={callUser} disabled={isLoading}>Call</button>
        </div>
        <div>
          {isRecording ? (
            <button onClick={stopRecording} disabled={isLoading}>Stop Recording</button>
          ) : (
            <button onClick={startRecording} disabled={isLoading}>Start Recording</button>
          )}
          {recordedChunks.length > 0 && !isRecording && (
            <button onClick={uploadRecording} disabled={isLoading}>Upload Recording</button>
          )}
          {lastUploadedPath && (
            <button onClick={transcribeRecording} disabled={isLoading}>Transcribe</button>
          )}
          {transcript && (
            <button onClick={summarizeTranscript} disabled={isLoading}>Summarize</button>
          )}
        </div>
      </div>
      <div className="results">
        {transcript && (
          <div className="result-box">
            <h2>Transcript</h2>
            <p>{transcript}</p>
          </div>
        )}
        {summary && (
          <div className="result-box">
            <h2>Summary</h2>
            <p>{summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;