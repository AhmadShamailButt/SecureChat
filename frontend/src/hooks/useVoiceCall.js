import { useRef, useEffect, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const useVoiceCall = (socket, callId, isInitiator, receiverId, callerId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);

  // WebRTC state machine
  const [webrtcState, setWebrtcState] = useState('idle');
  // States: 'idle', 'getting_media', 'media_ready', 'offer_sent', 'offer_received',
  //         'answer_sent', 'answer_received', 'connected', 'failed', 'ended'

  // Retry logic state (Fix 7)
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // Network quality monitoring (Fix 8)
  const [connectionStats, setConnectionStats] = useState(null);

  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);
  const shouldAnswerRef = useRef(false);

  // Timeout refs (Fix 4)
  const offerTimeoutRef = useRef(null);
  const answerTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);

  // Create audio element for remote stream
  useEffect(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = document.createElement('audio');
      remoteAudioRef.current.autoplay = true;
      document.body.appendChild(remoteAudioRef.current);
    }

    return () => {
      if (remoteAudioRef.current && document.body.contains(remoteAudioRef.current)) {
        document.body.removeChild(remoteAudioRef.current);
        remoteAudioRef.current = null;
      }
    };
  }, []);

  // Update audio source when remote stream changes
  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && callId) {
        // Always send to the other person (receiverId is always the other person's ID)
        socket.emit('voice-call:ice-candidate', {
          candidate: event.candidate,
          callId,
          from: callerId, // Always use callerId (current user's ID) as 'from'
          to: receiverId  // Always send to receiverId (the other person's ID)
        });
      }
    };

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('[WEBRTC] Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      setWebrtcState('connected');
      // Clear connection timeout on successful track reception
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };

    // Enhanced ICE connection state monitoring (Fix 3)
    pc.oniceconnectionstatechange = () => {
      console.log('[WEBRTC] ICE connection state:', pc.iceConnectionState);

      switch (pc.iceConnectionState) {
        case 'checking':
          console.log('[WEBRTC] Checking ICE connection...');
          break;
        case 'connected':
        case 'completed':
          console.log('[WEBRTC] ICE connection established');
          setError(null);
          break;
        case 'disconnected':
          console.warn('[WEBRTC] ICE connection disconnected, may reconnect...');
          setError('Connection interrupted, attempting to reconnect...');
          break;
        case 'failed':
          console.error('[WEBRTC] ICE connection failed permanently');
          setWebrtcState('failed');
          setError('Connection failed. Please check your internet connection and try again.');
          break;
        case 'closed':
          console.log('[WEBRTC] ICE connection closed');
          setWebrtcState('ended');
          break;
      }
    };

    // Monitor connection state (newer API)
    pc.onconnectionstatechange = () => {
      console.log('[WEBRTC] Connection state:', pc.connectionState);

      switch (pc.connectionState) {
        case 'connecting':
          console.log('[WEBRTC] Connecting...');
          break;
        case 'connected':
          console.log('[WEBRTC] Connection established');
          setWebrtcState('connected');
          setError(null);
          break;
        case 'disconnected':
          console.warn('[WEBRTC] Connection disconnected');
          break;
        case 'failed':
          console.error('[WEBRTC] Connection failed');
          setWebrtcState('failed');
          setError('Connection failed. Please try calling again.');
          break;
        case 'closed':
          console.log('[WEBRTC] Connection closed');
          setWebrtcState('ended');
          break;
      }
    };

    // Monitor signaling state
    pc.onsignalingstatechange = () => {
      console.log('[WEBRTC] Signaling state:', pc.signalingState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, callId, isInitiator, receiverId, callerId]);

  // Get local media stream
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access required. Please allow microphone access in browser settings.');
      } else {
        setError('Failed to access microphone: ' + err.message);
      }
      throw err;
    }
  }, []);

  // Start call (as initiator)
  const startCall = useCallback(async () => {
    try {
      console.log('[WEBRTC-CALLER] Starting call as initiator...');
      console.log('[WEBRTC-CALLER] Call params:', { callId, callerId, receiverId });

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      const stream = await getLocalStream();
      console.log('[WEBRTC-CALLER] Got local stream:', stream);

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-CALLER] Peer connection initialized');

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WEBRTC-CALLER] Added track:', track.kind);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WEBRTC-CALLER] Created and set local description (offer)');

      socket.emit('voice-call:offer', {
        offer,
        callId,
        from: callerId,
        to: receiverId
      });

      // Fix 2: Set state to offer_sent
      setWebrtcState('offer_sent');
      console.log('[WEBRTC-CALLER] Offer sent to:', receiverId);

      // Fix 4: Set timeout for receiving answer (30 seconds)
      answerTimeoutRef.current = setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
          console.error('[WEBRTC-CALLER] Answer timeout - no response from receiver');
          setWebrtcState('failed');
          setError('Call failed: No response from receiver');
        }
      }, 30000);

    } catch (err) {
      console.error('[WEBRTC-CALLER] Error starting call:', err);
      setWebrtcState('failed');
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId]);

  // Answer call (as receiver)
  const answerCall = useCallback(async (offer = null) => {
    try {
      // Use provided offer or pending offer
      const offerToUse = offer || pendingOfferRef.current;
      if (!offerToUse) {
        console.log('[WEBRTC-RECEIVER] No offer available yet, will answer when offer arrives');
        // Mark that we should answer when offer arrives
        shouldAnswerRef.current = true;
        return;
      }

      console.log('[WEBRTC-RECEIVER] Answering call...');
      console.log('[WEBRTC-RECEIVER] Call params:', { callId, callerId, receiverId });
      console.log('[WEBRTC-RECEIVER] Current WebRTC state:', webrtcState);

      // Fix 2: State validation - defer if still getting media
      if (webrtcState === 'getting_media') {
        console.log('[WEBRTC-RECEIVER] Still getting media, will retry when ready');
        pendingOfferRef.current = offerToUse;
        shouldAnswerRef.current = true;
        return;
      }

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      const stream = await getLocalStream();
      console.log('[WEBRTC-RECEIVER] Got local stream:', stream);

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-RECEIVER] Peer connection initialized');

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WEBRTC-RECEIVER] Added track:', track.kind);
      });

      // Fix 2: Set state to offer_received
      setWebrtcState('offer_received');

      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(offerToUse));
      console.log('[WEBRTC-RECEIVER] Set remote description (offer)');

      // Process pending ICE candidates
      if (pendingCandidatesRef.current.length > 0) {
        console.log('[WEBRTC-RECEIVER] Processing pending ICE candidates:', pendingCandidatesRef.current.length);
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
      }

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WEBRTC-RECEIVER] Created and set local description (answer)');

      socket.emit('voice-call:answer', {
        answer,
        callId,
        from: callerId, // Use callerId (current user's ID) as 'from', not receiverId
        to: receiverId  // Send to the caller (receiverId is the other person's ID)
      });

      // Fix 2: Set state to answer_sent
      setWebrtcState('answer_sent');
      console.log('[WEBRTC-RECEIVER] Answer sent to:', callerId);

      // Clear pending refs
      pendingOfferRef.current = null;
      shouldAnswerRef.current = false;
    } catch (err) {
      console.error('[WEBRTC-RECEIVER] Error answering call:', err);
      setWebrtcState('failed');
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId, webrtcState]);

  // Handle received answer
  const handleAnswer = useCallback(async (answer) => {
    try {
      console.log('[WEBRTC-CALLER] Received answer');

      // Fix 4: Clear answer timeout
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }

      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setWebrtcState('answer_received');
        setRetryCount(0); // Fix 7: Reset retry count on success

        // Process pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          console.log('[WEBRTC-CALLER] Processing pending ICE candidates:', pendingCandidatesRef.current.length);
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
        }

        // Fix 4: Set connection timeout (15 seconds to establish connection)
        // Fix 7: With retry logic
        connectionTimeoutRef.current = setTimeout(() => {
          if (webrtcState !== 'connected') {
            if (retryCount < MAX_RETRIES) {
              console.log(`[WEBRTC-CALLER] Connection timeout, retrying (${retryCount + 1}/${MAX_RETRIES})`);
              setRetryCount(prev => prev + 1);
              // Trigger ICE restart
              pc.restartIce();
            } else {
              console.error('[WEBRTC-CALLER] Connection failed after retries');
              setWebrtcState('failed');
              setError('Connection failed after multiple attempts. Please try again.');
            }
          }
        }, 15000);
      }
    } catch (err) {
      console.error('[WEBRTC-CALLER] Error handling answer:', err);

      // Fix 7: Retry logic on error
      if (retryCount < MAX_RETRIES) {
        console.log(`[WEBRTC-CALLER] Error, will retry (${retryCount + 1}/${MAX_RETRIES})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => handleAnswer(answer), 2000);
      } else {
        setWebrtcState('failed');
        setError(err.message);
      }
    }
  }, [retryCount, webrtcState]);

  // Handle received ICE candidate
  const handleIceCandidate = useCallback(async (candidate) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue candidate if remote description is not set yet
        pendingCandidatesRef.current.push(candidate);
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  // End call cleanup
  const endCall = useCallback(() => {
    console.log('[WEBRTC] Ending call and cleaning up...');

    // Fix 4: Clear all timeouts
    if (offerTimeoutRef.current) {
      clearTimeout(offerTimeoutRef.current);
      offerTimeoutRef.current = null;
    }
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Stop all local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote stream and state
    setRemoteStream(null);
    setIsMuted(false);
    setError(null);
    setWebrtcState('ended');
    setRetryCount(0);
    pendingCandidatesRef.current = [];
    pendingOfferRef.current = null;
    shouldAnswerRef.current = false;
  }, [localStream]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleOffer = (data) => {
      console.log('[WEBRTC-RECEIVER] Received offer event:', data);
      console.log('[WEBRTC-RECEIVER] Current callId:', callId);
      console.log('[WEBRTC-RECEIVER] Offer callId:', data.callId);
      console.log('[WEBRTC-RECEIVER] Is initiator:', isInitiator);

      if (data.callId === callId) {
        console.log('[WEBRTC-RECEIVER] CallId matches, storing offer');
        // Store the offer
        pendingOfferRef.current = data.offer;
        
        // Automatically answer if we're the receiver (not initiator) and have an active call
        // This handles the case where user accepts call before offer arrives
        if (!isInitiator && callId) {
          console.log('[WEBRTC-RECEIVER] Receiver mode with active call, answering automatically');
          answerCall(data.offer);
          shouldAnswerRef.current = false;
        } else if (shouldAnswerRef.current) {
          // Fallback: if shouldAnswerRef was set, answer immediately
          console.log('[WEBRTC-RECEIVER] User already accepted, answering now');
          answerCall(data.offer);
          shouldAnswerRef.current = false;
        }
      } else {
        console.log('[WEBRTC-RECEIVER] CallId mismatch, ignoring offer');
      }
    };

    const handleAnswerEvent = (data) => {
      console.log('[WEBRTC-CALLER] Received answer event:', data);
      console.log('[WEBRTC-CALLER] Current callId:', callId);

      if (data.callId === callId) {
        console.log('[WEBRTC-CALLER] CallId matches, processing answer');
        handleAnswer(data.answer);
      } else {
        console.log('[WEBRTC-CALLER] CallId mismatch, ignoring answer');
      }
    };

    const handleIceCandidateEvent = (data) => {
      if (data.callId === callId) {
        handleIceCandidate(data.candidate);
      }
    };

    socket.on('voice-call:offer', handleOffer);
    socket.on('voice-call:answer', handleAnswerEvent);
    socket.on('voice-call:ice-candidate', handleIceCandidateEvent);

    return () => {
      socket.off('voice-call:offer', handleOffer);
      socket.off('voice-call:answer', handleAnswerEvent);
      socket.off('voice-call:ice-candidate', handleIceCandidateEvent);
    };
  }, [socket, callId, answerCall, handleAnswer, handleIceCandidate, isInitiator]);

  // Cleanup on unmount only (not on re-render)
  useEffect(() => {
    return () => {
      // Only end call if we have an active connection
      // This cleanup only runs when component unmounts, not on re-render
      if (peerConnectionRef.current || localStream) {
        console.log('[WEBRTC] Component unmounting, cleaning up call resources');
        endCall();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Fix 8: Network quality monitoring
  useEffect(() => {
    if (webrtcState !== 'connected') return;

    const pc = peerConnectionRef.current;
    if (!pc) return;

    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let packetLoss = 0;
        let jitter = 0;
        let rtt = 0;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetLoss = report.packetsLost || 0;
            jitter = report.jitter || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime || 0;
          }
        });

        setConnectionStats({ packetLoss, jitter, rtt });

        // Warn if quality is poor
        if (packetLoss > 50 || rtt > 0.5) {
          console.warn('[WEBRTC] Poor connection quality:', { packetLoss, rtt });
        }
      } catch (err) {
        console.error('[WEBRTC] Error getting stats:', err);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [webrtcState]);

  return {
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    isMuted,
    error,
    webrtcState,       // Fix 2: Expose state for UI
    connectionStats,   // Fix 8: Expose connection quality stats
  };
};

export default useVoiceCall;
