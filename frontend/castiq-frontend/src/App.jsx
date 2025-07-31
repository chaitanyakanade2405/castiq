import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import './App.css';

const socket = new WebSocket('ws://localhost:8080');

function App() {
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [myID, setMyID] = useState('');
  const [peerID, setPeerID] = useState('');

  const connectionRef = useRef(null);
  const myVideo = useRef(null);
  const remoteVideo = useRef(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setMyStream(stream);
        if(myVideo.current) {
            myVideo.current.srcObject = stream;
        }
      });

    socket.onopen = () => {
      console.log("Successfully connected to the signaling server!");
    };

    socket.onmessage = (message) => {
      const signal = JSON.parse(message.data);

      if (signal.offer) {
        answerCall(signal);
      } 
      else if (signal.answer) {
        connectionRef.current.signal(signal.answer);
      }
      // The 'trickle: false' option makes this part unnecessary for now
      // else if (signal.candidate) {
      //   connectionRef.current.addIceCandidate(signal.candidate);
      // }
    };
  }, []);

  const callUser = () => {
    const peer = new Peer({
      initiator: true,
      trickle: false, // Using trickle: false simplifies signaling
      // *** MODIFIED *** The 'stream' option is removed from here
    });

    // *** MODIFIED *** Add the stream separately
    if (myStream) {
      peer.addStream(myStream);
    }

    peer.on('signal', (data) => {
      socket.send(JSON.stringify({ offer: data, to: peerID }));
    });

    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
      }
    });

    connectionRef.current = peer;
  };

  const answerCall = (signal) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      // *** MODIFIED *** The 'stream' option is removed from here
    });

    // *** MODIFIED *** Add the stream separately
    if (myStream) {
      peer.addStream(myStream);
    }

    peer.on('signal', (data) => {
      socket.send(JSON.stringify({ answer: data, to: signal.from }));
    });

    peer.on('stream', (stream) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = stream;
      }
    });

    peer.signal(signal.offer);
    connectionRef.current = peer;
  };

  return (
    <div className="App">
      <h1>CastIQ</h1>
      <div className="video-grid">
        <video playsInline muted ref={myVideo} autoPlay />
        <video playsInline ref={remoteVideo} autoPlay />
      </div>
      <div className="controls">
        <input type="text" value={myID} onChange={e => setMyID(e.target.value)} placeholder="Enter your ID" />
        <input 
          type="text" 
          value={peerID} 
          onChange={(e) => setPeerID(e.target.value)}
          placeholder="Enter peer's ID to call"
        />
        <button onClick={callUser}>Call</button>
      </div>
    </div>
  );
}

export default App;