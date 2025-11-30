import { useRef, useEffect, useState, useCallback } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { toast } from 'react-hot-toast';

// Enhanced ICE servers with TURN support for better NAT traversal
const ICE_SERVERS = {
  iceServers: [
    // STUN servers for NAT discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN servers for NAT traversal when STUN fails
    // Using free public TURN servers (metered.ca provides free TURN service)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    // Additional TURN server for redundancy
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443',
        'turn:relay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  // ICE transport policy: prefer relay for better connectivity
  iceTransportPolicy: 'all', // Try both relay and direct connections
  // ICE candidate pool size for faster connection
  iceCandidatePoolSize: 10
};

const useVoiceCall = (socket, callId, isInitiator, receiverId, callerId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  
  // Crypto context for encryption
  const { encryptMessage, decryptMessage, isInitialized: isCryptoInitialized, getUserPublicKey } = useCrypto();

  // WebRTC state machine
  const [webrtcState, setWebrtcState] = useState('idle');
  // States: 'idle', 'getting_media', 'media_ready', 'offer_sent', 'offer_received',
  //         'answer_sent', 'answer_received', 'connected', 'failed', 'ended'

  // Retry logic state (Fix 7)
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // Network quality monitoring (Fix 8) - Enhanced with adaptive quality management
  const [connectionStats, setConnectionStats] = useState(null);
  const [connectionQuality, setConnectionQuality] = useState('good'); // 'good', 'fair', 'poor'
  const audioContextRef = useRef(null);
  const audioLevelRef = useRef(0);

  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);
  const shouldAnswerRef = useRef(false);
  const recipientPublicKeyRef = useRef(null);
  const encryptionEnabledRef = useRef(false);
  const decryptionFailureCountRef = useRef(0);
  const MAX_DECRYPTION_FAILURES = 3; // Disable encryption after 3 failures
  const currentBitrateRef = useRef(64000); // Current Opus bitrate in bps
  const rtpSenderRef = useRef(null); // RTCRtpSender for adaptive parameter adjustment

  // Timeout refs (Fix 4)
  const offerTimeoutRef = useRef(null);
  const answerTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const disconnectGraceTimeoutRef = useRef(null); // Grace period timeout for disconnected state

  // Signaling queue for reconnection (Fix: prevent unauthorized signaling on reconnection)
  const signalingQueueRef = useRef([]);
  const isReconnectingRef = useRef(false);

  // RTT smoothing and quality stability (Fix: prevent frequent bitrate switching)
  const rttHistoryRef = useRef([]); // Track RTT measurements for EMA
  const smoothedRttRef = useRef(0); // Smoothed RTT value
  const qualityHistoryRef = useRef([]); // Track quality levels for stability window

  // Create audio element for remote stream with enhanced audio processing
  useEffect(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = document.createElement('audio');
      // Don't use autoplay - browsers require user gesture
      // Audio will be played explicitly after user accepts/starts call
      remoteAudioRef.current.playsInline = true; // Important for mobile
      remoteAudioRef.current.setAttribute('playsinline', 'true'); // iOS compatibility
      // Don't set muted - we want to hear the audio
      
      // Optimize audio buffer settings for low latency
      // Note: These are hints to the browser, actual implementation varies
      remoteAudioRef.current.preload = 'auto';
      
      document.body.appendChild(remoteAudioRef.current);
    }

    // Initialize AudioContext for advanced audio processing
    // Note: AudioContext will be in 'suspended' state until user interaction
    if (!audioContextRef.current && typeof AudioContext !== 'undefined') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000, // Match our audio constraints
          latencyHint: 'interactive' // Low latency for real-time communication
        });
        console.log('[AUDIO] AudioContext initialized with sample rate:', audioContextRef.current.sampleRate);
        
        // Resume AudioContext if suspended (will work after user gesture)
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(err => {
            console.warn('[AUDIO] Could not resume AudioContext:', err);
          });
        }
      } catch (err) {
        console.warn('[AUDIO] Could not create AudioContext:', err);
      }
    }

    return () => {
      if (remoteAudioRef.current && document.body.contains(remoteAudioRef.current)) {
        document.body.removeChild(remoteAudioRef.current);
        remoteAudioRef.current = null;
      }
      // Clean up AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(err => {
          console.warn('[AUDIO] Error closing AudioContext:', err);
        });
        audioContextRef.current = null;
      }
    };
  }, []);

  // Helper function to play audio (must be called after user gesture)
  const playRemoteAudio = useCallback(async () => {
    if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
      try {
        await remoteAudioRef.current.play();
        console.log('[AUDIO] Remote audio playing successfully');
      } catch (error) {
        console.warn('[AUDIO] Failed to play audio:', error.name);
        // This is expected if called before user gesture - will be called again after user accepts
      }
    }
  }, []);

  // Update audio source when remote stream changes
  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      
      // Attempt to play audio (will work if user has already interacted)
      playRemoteAudio();
    }
  }, [remoteStream, playRemoteAudio]);

  // Audio level monitoring and normalization for local stream
  useEffect(() => {
    if (!localStream || !audioContextRef.current) return;

    let analyser = null;
    let dataArray = null;
    let animationFrameId = null;

    try {
      // Create analyser node for audio level monitoring
      analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256; // Small FFT for low latency
      analyser.smoothingTimeConstant = 0.8; // Smooth audio level changes
      
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      // Get audio track and create media stream source
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const source = audioContextRef.current.createMediaStreamSource(localStream);
        
        // Add gain node for audio normalization (prevent clipping)
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 0.8; // Reduce gain slightly to prevent clipping
        
        // Connect: source -> gain -> analyser -> destination
        source.connect(gainNode);
        gainNode.connect(analyser);
        // Note: We don't connect to destination to avoid feedback
        
        // Monitor audio levels
        const monitorAudioLevel = () => {
          if (!analyser) return;
          
          analyser.getByteFrequencyData(dataArray);
          
          // Calculate average audio level
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          audioLevelRef.current = average;
          
          // Normalize gain based on audio level to prevent clipping
          if (gainNode && average > 200) {
            // Reduce gain if audio is too loud
            gainNode.gain.value = Math.max(0.5, 0.8 - (average - 200) / 500);
          } else if (gainNode && average < 50) {
            // Slightly increase gain if audio is too quiet
            gainNode.gain.value = Math.min(1.0, 0.8 + (50 - average) / 200);
          } else if (gainNode) {
            // Reset to default
            gainNode.gain.value = 0.8;
          }
          
          animationFrameId = requestAnimationFrame(monitorAudioLevel);
        };
        
        monitorAudioLevel();
      }
    } catch (err) {
      console.warn('[AUDIO] Could not set up audio level monitoring:', err);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (analyser) {
        analyser.disconnect();
      }
    };
  }, [localStream]);

  // Helper function to queue signaling messages during disconnection
  const queueSignalingMessage = useCallback((eventType, payload) => {
    if (!socket || !socket.connected) {
      console.log(`[SIGNALING] Queueing ${eventType} message (socket disconnected)`);
      signalingQueueRef.current.push({ eventType, payload, timestamp: Date.now() });
      isReconnectingRef.current = true;
      return true; // Message queued
    }
    return false; // Socket connected, don't queue
  }, [socket]);

  // Helper function to flush signaling queue after reconnection
  const flushSignalingQueue = useCallback(async () => {
    if (signalingQueueRef.current.length === 0) {
      return;
    }

    if (!socket || !socket.connected) {
      console.log('[SIGNALING] Cannot flush queue - socket not connected');
      return;
    }

    // Wait a bit for userOnline to be processed on server
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[SIGNALING] Flushing ${signalingQueueRef.current.length} queued messages`);
    const queue = [...signalingQueueRef.current];
    signalingQueueRef.current = [];
    isReconnectingRef.current = false;

    // Send all queued messages
    for (const { eventType, payload } of queue) {
      try {
        socket.emit(eventType, payload);
        console.log(`[SIGNALING] Sent queued ${eventType} message`);
      } catch (err) {
        console.error(`[SIGNALING] Failed to send queued ${eventType} message:`, err);
      }
    }
  }, [socket]);

  // Helper function to encrypt signaling data
  const encryptSignalingData = useCallback(async (data, recipientId) => {
    try {
      // If crypto is not initialized but we have a recipient, try to enable encryption
      if (!isCryptoInitialized && recipientId) {
        console.log('[ENCRYPTION] Crypto not initialized, attempting to enable encryption...');
        // Try to get recipient key to enable encryption
        try {
          const recipientKey = await getUserPublicKey(recipientId);
          recipientPublicKeyRef.current = recipientKey;
          encryptionEnabledRef.current = true;
          setIsEncrypted(true);
          console.log('[ENCRYPTION] Encryption enabled during encryption attempt');
        } catch (keyErr) {
          console.warn('[ENCRYPTION] Could not get recipient key:', keyErr.message);
          // Still try encryption if crypto service is ready
        }
      }

      // Only skip encryption if explicitly disabled AND crypto is not initialized
      if (!encryptionEnabledRef.current && !isCryptoInitialized) {
        console.warn('[ENCRYPTION] Crypto not initialized and encryption disabled, sending unencrypted');
        return { encrypted: false, data };
      }

      // If encryption is enabled or crypto is initialized, try to encrypt
      if (encryptionEnabledRef.current || isCryptoInitialized) {
        // Serialize the data to JSON string
        const jsonString = JSON.stringify(data);
        
        // Encrypt using the crypto service
        const encrypted = await encryptMessage(jsonString, recipientId);
        
        // Successfully encrypted - ensure encryption is marked as enabled
        encryptionEnabledRef.current = true;
        setIsEncrypted(true);
        
        return {
          encrypted: true,
          encryptedData: encrypted,
          isEncrypted: true
        };
      }

      // Fallback to unencrypted only if we really can't encrypt
      console.warn('[ENCRYPTION] Encryption not available, sending unencrypted');
      return { encrypted: false, data };
    } catch (err) {
      console.error('[ENCRYPTION] Failed to encrypt signaling data:', err);
      // Only fallback to unencrypted if it's a critical error
      // If it's just a key issue, we might want to retry
      if (err.message && err.message.includes('not set up encryption')) {
        // Recipient doesn't have encryption set up - must send unencrypted
        encryptionEnabledRef.current = false;
        setIsEncrypted(false);
        return { encrypted: false, data, encryptionError: err.message };
      }
      // For other errors, still try to send unencrypted but log the error
      return { encrypted: false, data, encryptionError: err.message };
    }
  }, [encryptMessage, isCryptoInitialized, getUserPublicKey]);

  // Helper function to decrypt signaling data
  const decryptSignalingData = useCallback(async (encryptedPayload, senderId) => {
    try {
      // Check if payload is encrypted (check both isEncrypted and encrypted properties)
      const isEncrypted = encryptedPayload.isEncrypted || (encryptedPayload.encrypted === true);
      
      if (!isEncrypted || !encryptedPayload.encryptedData) {
        // Unencrypted format - handle multiple formats:
        // 1. Legacy format: { offer: {...} } or { answer: {...} } or { candidate: {...} }
        // 2. encryptSignalingData fallback: { encrypted: false, data: {...} }
        // 3. Direct format: the payload itself if it has type/sdp or candidate properties
        const unencryptedData = encryptedPayload.offer || 
                                encryptedPayload.answer || 
                                encryptedPayload.candidate || 
                                (encryptedPayload.data && (encryptedPayload.encrypted === false || !encryptedPayload.encrypted) ? encryptedPayload.data : null) ||
                                encryptedPayload;
        return unencryptedData;
      }

      if (!isCryptoInitialized) {
        console.warn('[ENCRYPTION] Crypto not initialized, cannot decrypt');
        // Return null to trigger fallback
        return null;
      }

      // Normalize encryptedData structure - handle cases where it might be corrupted or nested
      let encryptedDataToUse = encryptedPayload.encryptedData;
      
      // If encryptedData is a string, try to parse it as JSON
      if (typeof encryptedDataToUse === 'string') {
        try {
          encryptedDataToUse = JSON.parse(encryptedDataToUse);
          console.log('[ENCRYPTION] Parsed encryptedData from string');
        } catch (parseErr) {
          console.error('[ENCRYPTION] Failed to parse encryptedData string:', parseErr);
          // If parsing fails, the string might be the actual encrypted data structure
          // Try to use it directly (though this is unlikely)
          throw new Error('Invalid encryptedData format: cannot parse as JSON');
        }
      }

      // Validate encryptedData structure
      if (!encryptedDataToUse || typeof encryptedDataToUse !== 'object') {
        console.error('[ENCRYPTION] Invalid encryptedData structure:', {
          type: typeof encryptedDataToUse,
          isNull: encryptedDataToUse === null,
          isUndefined: encryptedDataToUse === undefined,
          keys: encryptedDataToUse ? Object.keys(encryptedDataToUse) : []
        });
        throw new Error('Invalid encryptedData structure: must be an object');
      }

      // Log structure for debugging
      console.log('[ENCRYPTION] Attempting to decrypt:', {
        hasCiphertext: !!encryptedDataToUse.ciphertext,
        hasIv: !!encryptedDataToUse.iv,
        hasAuthTag: !!encryptedDataToUse.authTag,
        ciphertextLength: encryptedDataToUse.ciphertext?.length,
        ivLength: encryptedDataToUse.iv?.length,
        authTagLength: encryptedDataToUse.authTag?.length
      });

      // Decrypt using the crypto service
      const decryptedJson = await decryptMessage(encryptedDataToUse, senderId);
      
      // Parse JSON back to object
      const decrypted = JSON.parse(decryptedJson);
      console.log('[ENCRYPTION] Successfully decrypted signaling data');
      // Reset failure count on successful decryption
      decryptionFailureCountRef.current = 0;
      return decrypted;
    } catch (err) {
      console.error('[ENCRYPTION] Failed to decrypt signaling data:', {
        error: err.message,
        errorName: err.name,
        payloadKeys: Object.keys(encryptedPayload),
        hasEncryptedData: !!encryptedPayload.encryptedData,
        encryptedDataType: typeof encryptedPayload.encryptedData
      });
      // Don't throw - return null to trigger fallback to unencrypted
      return null;
    }
  }, [decryptMessage, isCryptoInitialized]);

  // Helper function to configure Opus codec in SDP for optimal voice quality with adaptive bitrate
  const configureOpusCodec = useCallback((sdp, targetBitrate = 64000) => {
    if (!sdp) return sdp;
    
    try {
      // Modify SDP to prioritize Opus codec and set optimal parameters for packet loss resilience
      let modifiedSdp = sdp;
      
      // Set Opus codec parameters for voice with enhanced FEC and adaptive bitrate
      // Format: a=fmtp:111 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;maxaveragebitrate=64000
      // Enhanced settings for better packet loss handling
      const opusRegex = /a=fmtp:(\d+) (.*)/g;
      modifiedSdp = modifiedSdp.replace(opusRegex, (match, payloadType, params) => {
        // Check if this is Opus (usually payload type 111 or 109)
        // Add/update Opus parameters for optimal voice quality with packet loss resilience
        const newParams = [
          'minptime=10', // Minimum packet time (10ms for low latency)
          'maxptime=60', // Maximum packet time (60ms to prevent buffering issues)
          'useinbandfec=1', // Enable in-band FEC for error recovery (critical for packet loss)
          'stereo=0', // Mono (sufficient for voice, reduces bandwidth)
          'sprop-stereo=0', // No stereo property
          `maxaveragebitrate=${targetBitrate}`, // Adaptive bitrate (default 64kbps, can be reduced for poor networks)
          'maxplaybackrate=48000', // 48kHz sample rate
          'ptime=20', // Packet time 20ms (low latency)
          'cbr=0', // Use variable bitrate (VBR) for better quality at same bitrate
          'usedtx=0' // Disable DTX (discontinuous transmission) for consistent quality
        ].join(';');
        return `a=fmtp:${payloadType} ${newParams}`;
      });
      
      console.log(`[WEBRTC] Configured Opus codec parameters with bitrate: ${targetBitrate} bps for packet loss resilience`);
      return modifiedSdp;
    } catch (err) {
      console.warn('[WEBRTC] Error configuring Opus codec:', err);
      return sdp; // Return original SDP on error
    }
  }, []);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Configure Opus codec preferences for optimal voice quality
    // This must be done before adding tracks
    try {
      // Get transceivers and configure codec preferences
      // Note: setCodecPreferences is called after tracks are added, but we'll configure it in the offer/answer
      // For now, we'll configure it when creating the offer/answer
      console.log('[WEBRTC] Peer connection created with optimized ICE servers');
    } catch (err) {
      console.warn('[WEBRTC] Could not configure codec preferences:', err);
    }

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      // Skip null candidates (end-of-candidates marker)
      if (!event.candidate || !socket || !callId) {
        return;
      }

      try {
        // Serialize ICE candidate manually (it doesn't have toJSON)
        const candidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };
        
        // Prepare payload
        let payload;
        if (encryptionEnabledRef.current) {
          const encryptedPayload = await encryptSignalingData(candidateData, receiverId);
          payload = {
            ...encryptedPayload,
            callId,
            from: callerId,
            to: receiverId
          };
        } else {
          payload = {
            candidate: candidateData,
            callId,
            from: callerId,
            to: receiverId,
            encrypted: false
          };
        }

        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:ice-candidate', payload)) {
          socket.emit('voice-call:ice-candidate', payload);
        }
      } catch (err) {
        console.error('[WEBRTC] Failed to encrypt ICE candidate:', err);
        // Fallback to unencrypted
        const candidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };
        const payload = {
          candidate: candidateData,
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        };
        
        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:ice-candidate', payload)) {
          socket.emit('voice-call:ice-candidate', payload);
        }
      }
    };

    // Handle remote track
    pc.ontrack = async (event) => {
      console.log('[WEBRTC] Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      setWebrtcState('connected');
      // Clear connection timeout on successful track reception
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Attempt to play audio after receiving remote track
      // This will work if user has already interacted (accepted call)
      if (remoteAudioRef.current) {
        try {
          await remoteAudioRef.current.play();
          console.log('[AUDIO] Remote audio started playing');
        } catch (error) {
          // Audio play prevented - this is normal if called before user gesture
          // Will be called again when user accepts call (user gesture)
          console.log('[AUDIO] Audio play prevented (will play after user gesture):', error.name);
        }
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
          // Clear connection timeout on successful connection
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          // Clear disconnect grace period timeout if connection recovered
          if (disconnectGraceTimeoutRef.current) {
            clearTimeout(disconnectGraceTimeoutRef.current);
            disconnectGraceTimeoutRef.current = null;
            console.log('[WEBRTC] Connection recovered, cleared disconnect grace period');
          }
          break;
        case 'disconnected':
          console.warn('[WEBRTC] ICE connection disconnected, may reconnect...');
          // Clear any existing grace period timeout
          if (disconnectGraceTimeoutRef.current) {
            clearTimeout(disconnectGraceTimeoutRef.current);
            disconnectGraceTimeoutRef.current = null;
          }
          // Add grace period before showing error (3 seconds)
          // Only show error if still disconnected after grace period
          disconnectGraceTimeoutRef.current = setTimeout(() => {
            // Check actual connection state before showing error
            if (pc.iceConnectionState === 'disconnected' && 
                pc.connectionState !== 'connected' && 
                pc.connectionState !== 'connecting') {
              setError('Connection interrupted, attempting to reconnect...');
              // Attempt ICE restart to recover connection
              try {
                pc.restartIce();
                console.log('[WEBRTC] Attempting ICE restart after disconnect');
              } catch (restartErr) {
                console.warn('[WEBRTC] Failed to restart ICE:', restartErr);
              }
            }
            disconnectGraceTimeoutRef.current = null;
          }, 3000);
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
  }, [socket, callId, isInitiator, receiverId, callerId, queueSignalingMessage, encryptSignalingData]);

  // Get local media stream with optimized audio constraints
  const getLocalStream = useCallback(async () => {
    try {
      // Optimized audio constraints for high-quality voice calls
      const audioConstraints = {
        // High sample rate for CD-quality audio (48kHz)
        sampleRate: 48000,
        // Mono channel (sufficient for voice, reduces bandwidth)
        channelCount: 1,
        // Echo cancellation for better call quality
        echoCancellation: true,
        // Noise suppression to filter background noise
        noiseSuppression: true,
        // Auto gain control for consistent volume
        autoGainControl: true,
        // Low latency target (10ms) for real-time communication
        latency: 0.01,
        // Chrome-specific audio processing enhancements
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
        googHighpassFilter: true, // Filter low-frequency noise
        googTypingNoiseDetection: true, // Detect and suppress typing noise
        googNoiseReduction: true, // Additional noise reduction
        // Audio processing constraints
        googAudioMirroring: false, // Disable mirroring for better performance
        // Sample size for better quality
        sampleSize: 16
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      
      // Apply additional audio processing optimizations
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && audioTrack.getSettings) {
        const settings = audioTrack.getSettings();
        console.log('[AUDIO] Audio track settings:', {
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl
        });
      }
      
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

      // Check if encryption is available - be more aggressive about enabling it
      let encryptionAvailable = false;
      
      // First, ensure crypto is initialized
      if (!isCryptoInitialized && receiverId) {
        console.log('[ENCRYPTION] Crypto not initialized, attempting to initialize...');
        // Note: initializeCrypto is not directly available, but it should auto-initialize
        // We'll proceed and let encryptSignalingData handle it
      }
      
      // Try to enable encryption if we have a receiver ID
      if (receiverId) {
        try {
          // Try to get recipient's public key (with retry logic)
          let recipientKey = null;
          let retries = 2;
          let lastError = null;
          
          while (retries > 0 && !recipientKey) {
            try {
              recipientKey = await getUserPublicKey(receiverId);
              recipientPublicKeyRef.current = recipientKey;
              encryptionEnabledRef.current = true;
              encryptionAvailable = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Encryption enabled for call');
              break;
            } catch (err) {
              lastError = err;
              retries--;
              if (retries > 0) {
                console.log(`[ENCRYPTION] Retrying to get public key (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
              }
            }
          }
          
          if (!recipientKey) {
            console.warn('[ENCRYPTION] Could not get recipient public key after retries:', lastError?.message);
            // Don't disable encryption yet - let encryptSignalingData try to handle it
            // It might be a transient network issue, and we want encryption if possible
            encryptionEnabledRef.current = isCryptoInitialized; // Enable if crypto is ready
            if (isCryptoInitialized) {
              console.log('[ENCRYPTION] Crypto initialized but public key unavailable, will attempt encryption anyway');
            }
          }
        } catch (err) {
          console.warn('[ENCRYPTION] Error setting up encryption:', err.message);
          // Only disable if crypto is definitely not available
          if (!isCryptoInitialized) {
            encryptionEnabledRef.current = false;
            setIsEncrypted(false);
          }
        }
      } else {
        console.warn('[ENCRYPTION] No receiverId provided, encryption disabled');
        encryptionEnabledRef.current = false;
        setIsEncrypted(false);
      }

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      // Resume AudioContext if suspended (user gesture allows this)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('[AUDIO] AudioContext resumed');
        } catch (err) {
          console.warn('[AUDIO] Could not resume AudioContext:', err);
        }
      }

      // Get local stream (this requires user permission, which is a user gesture)
      const stream = await getLocalStream();
      console.log('[WEBRTC-CALLER] Got local stream:', stream);
      
      // After user gesture (starting call), ensure audio can play
      // This helps with AudioContext restrictions
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        try {
          await remoteAudioRef.current.play();
          console.log('[AUDIO] Audio started after user started call');
        } catch (error) {
          console.log('[AUDIO] Audio play error (will retry when stream arrives):', error.name);
        }
      }

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-CALLER] Peer connection initialized');

      // Add local tracks to peer connection and store RTCRtpSender for adaptive bitrate
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'audio' && sender) {
          rtpSenderRef.current = sender;
          console.log('[WEBRTC-CALLER] Added track:', track.kind, 'and stored RTCRtpSender');
        } else {
          console.log('[WEBRTC-CALLER] Added track:', track.kind);
        }
      });

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      // Configure Opus codec in SDP for optimal voice quality with adaptive bitrate
      if (offer.sdp) {
        offer.sdp = configureOpusCodec(offer.sdp, currentBitrateRef.current);
      }
      
      await pc.setLocalDescription(offer);
      console.log('[WEBRTC-CALLER] Created and set local description (offer) with Opus codec');

      // Encrypt offer before sending
      try {
        // Serialize RTCSessionDescription manually (it doesn't have toJSON)
        const offerData = {
          type: offer.type,
          sdp: offer.sdp
        };
        const encryptedPayload = await encryptSignalingData(offerData, receiverId);
        
        const payload = {
          ...encryptedPayload,
          callId,
          from: callerId,
          to: receiverId
        };
        
        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:offer', payload)) {
          socket.emit('voice-call:offer', payload);
        }
        
        console.log('[WEBRTC-CALLER] Encrypted offer sent/queued to:', receiverId);
      } catch (encryptErr) {
        console.error('[ENCRYPTION] Failed to encrypt offer, sending unencrypted:', encryptErr);
        // Fallback to unencrypted - serialize offer
        const payload = {
          offer: {
            type: offer.type,
            sdp: offer.sdp
          },
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        };
        
        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:offer', payload)) {
          socket.emit('voice-call:offer', payload);
        }
        setIsEncrypted(false);
        toast.error('Encryption failed. Call proceeding without encryption.');
      }

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
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId, isCryptoInitialized, getUserPublicKey, encryptSignalingData, configureOpusCodec, queueSignalingMessage]);

  // Answer call (as receiver)
  const answerCall = useCallback(async (encryptedOfferPayload = null) => {
    try {
      // Use provided offer or pending offer
      const offerPayloadToUse = encryptedOfferPayload || pendingOfferRef.current;
      if (!offerPayloadToUse) {
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
        pendingOfferRef.current = offerPayloadToUse;
        shouldAnswerRef.current = true;
        return;
      }

      // Decrypt offer if encrypted
      let offerToUse;
      try {
        // Determine sender ID from the payload (the caller)
        const senderId = offerPayloadToUse.from || receiverId;
        
        // Check if encryption was used (check both isEncrypted and encrypted properties)
        const isEncrypted = offerPayloadToUse.isEncrypted || (offerPayloadToUse.encrypted === true);
        
        // If marked as encrypted but encryptedData is missing, treat as unencrypted
        if (isEncrypted && !offerPayloadToUse.encryptedData) {
          console.warn('[ENCRYPTION] Payload marked as encrypted but encryptedData is missing, treating as unencrypted');
        }
        
        if (isEncrypted && offerPayloadToUse.encryptedData) {
          // Try to enable encryption for the answer too - be more aggressive
          try {
            // Try to get caller's public key (with retry)
            let callerKey = null;
            let retries = 2;
            
            while (retries > 0 && !callerKey && senderId) {
              try {
                callerKey = await getUserPublicKey(senderId);
                recipientPublicKeyRef.current = callerKey;
                encryptionEnabledRef.current = true;
                setIsEncrypted(true);
                console.log('[ENCRYPTION] Encryption enabled for answer');
                break;
              } catch (keyErr) {
                retries--;
                if (retries > 0) {
                  console.log(`[ENCRYPTION] Retrying to get caller public key (${retries} retries left)...`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                  console.warn('[ENCRYPTION] Could not get caller public key after retries:', keyErr.message);
                  // If crypto is initialized, still try to enable encryption
                  if (isCryptoInitialized) {
                    encryptionEnabledRef.current = true;
                    console.log('[ENCRYPTION] Crypto initialized, enabling encryption anyway');
                  }
                }
              }
            }
            
            // If we still don't have the key but crypto is initialized, enable encryption
            if (!callerKey && isCryptoInitialized) {
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Encryption enabled (crypto ready, will fetch key when needed)');
            }
          } catch (keyErr) {
            console.warn('[ENCRYPTION] Error enabling encryption for answer:', keyErr);
            // Only disable if crypto is definitely not available
            if (!isCryptoInitialized) {
              encryptionEnabledRef.current = false;
              setIsEncrypted(false);
            } else {
              // Crypto is initialized, so enable encryption
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
            }
          }
          
          // Attempt to decrypt - if it fails, fall back to unencrypted
          offerToUse = await decryptSignalingData(offerPayloadToUse, senderId);
          
          // If decryption returned null (failed), try unencrypted fallback
          if (!offerToUse) {
            decryptionFailureCountRef.current += 1;
            console.warn(`[ENCRYPTION] Decryption failed (${decryptionFailureCountRef.current}/${MAX_DECRYPTION_FAILURES}), falling back to unencrypted mode`);
            
            // If we've had too many failures, disable encryption for the rest of the call
            if (decryptionFailureCountRef.current >= MAX_DECRYPTION_FAILURES) {
              console.error('[ENCRYPTION] Too many decryption failures, disabling encryption for this call');
              encryptionEnabledRef.current = false;
              setIsEncrypted(false);
              // Emit event to sender to resend unencrypted (if socket is available)
              if (socket && callId && senderId) {
                socket.emit('voice-call:encryption-failed', {
                  callId,
                  from: receiverId,
                  to: senderId,
                  message: 'Decryption failed, please resend unencrypted'
                });
              }
            }
            
            // Try to extract offer from payload structure as fallback
            const fallbackOffer = offerPayloadToUse.offer || offerPayloadToUse.data || 
                                 (offerPayloadToUse.type && offerPayloadToUse.sdp ? offerPayloadToUse : null);
            if (fallbackOffer && fallbackOffer.type && fallbackOffer.sdp) {
              offerToUse = new RTCSessionDescription(fallbackOffer);
              setIsEncrypted(false);
              encryptionEnabledRef.current = false;
              console.log('[ENCRYPTION] Using unencrypted fallback for offer');
              toast('Received unencrypted call. Encryption may not be available.', {
                icon: '⚠️',
                duration: 3000
              });
            } else {
              // Last resort: try to use the encryptedData structure directly if it looks like an offer
              console.error('[ENCRYPTION] No fallback available, encrypted data structure:', {
                hasOffer: !!offerPayloadToUse.offer,
                hasData: !!offerPayloadToUse.data,
                hasEncryptedData: !!offerPayloadToUse.encryptedData,
                payloadKeys: Object.keys(offerPayloadToUse),
                failureCount: decryptionFailureCountRef.current
              });
              // Don't throw - continue with null and let the error handling below catch it
              offerToUse = null;
            }
          } else if (offerToUse && offerToUse.type && offerToUse.sdp) {
            // Successfully decrypted - reset failure count
            decryptionFailureCountRef.current = 0;
            offerToUse = new RTCSessionDescription(offerToUse);
            console.log('[ENCRYPTION] Decrypted offer successfully');
          } else {
            // Decryption returned something unexpected, try fallback
            decryptionFailureCountRef.current += 1;
            console.warn(`[ENCRYPTION] Decryption returned unexpected format (${decryptionFailureCountRef.current}/${MAX_DECRYPTION_FAILURES}), trying fallback`);
            const fallbackOffer = offerPayloadToUse.offer || offerPayloadToUse.data || 
                                 (offerPayloadToUse.type && offerPayloadToUse.sdp ? offerPayloadToUse : null);
            if (fallbackOffer && fallbackOffer.type && fallbackOffer.sdp) {
              offerToUse = new RTCSessionDescription(fallbackOffer);
              setIsEncrypted(false);
              encryptionEnabledRef.current = false;
              console.log('[ENCRYPTION] Using unencrypted fallback after unexpected decryption result');
            } else {
              offerToUse = null;
            }
          }
          
          // If we still don't have an offer, try one more time with unencrypted format
          if (!offerToUse) {
            console.warn('[ENCRYPTION] Final attempt: trying unencrypted format');
            const finalFallback = offerPayloadToUse.offer || offerPayloadToUse.data || offerPayloadToUse;
            if (finalFallback && finalFallback.type && finalFallback.sdp) {
              offerToUse = new RTCSessionDescription(finalFallback);
              setIsEncrypted(false);
              encryptionEnabledRef.current = false;
              console.log('[ENCRYPTION] Using final unencrypted fallback');
            }
          }
        } else {
          // Unencrypted offer - handle multiple formats:
          // 1. Legacy format: { offer: {...} }
          // 2. encryptSignalingData fallback: { encrypted: false, data: {...} }
          // 3. Direct format: { type: 'offer', sdp: '...' }
          let offerObj = null;
          
          if (offerPayloadToUse.offer) {
            // Legacy format with 'offer' property
            offerObj = offerPayloadToUse.offer;
          } else if (offerPayloadToUse.data && (offerPayloadToUse.encrypted === false || !offerPayloadToUse.encrypted)) {
            // Format from encryptSignalingData when encryption is disabled
            offerObj = offerPayloadToUse.data;
          } else if (offerPayloadToUse.type && offerPayloadToUse.sdp) {
            // Direct format
            offerObj = offerPayloadToUse;
          }
          
          if (offerObj && offerObj.type && offerObj.sdp) {
            offerToUse = new RTCSessionDescription(offerObj);
            console.log('[WEBRTC-RECEIVER] Using unencrypted offer format');
          } else {
            console.error('[WEBRTC-RECEIVER] Invalid unencrypted offer format. Payload structure:', {
              hasOffer: !!offerPayloadToUse.offer,
              hasData: !!offerPayloadToUse.data,
              hasType: !!offerPayloadToUse.type,
              hasSdp: !!offerPayloadToUse.sdp,
              isEncrypted: offerPayloadToUse.isEncrypted,
              encrypted: offerPayloadToUse.encrypted,
              hasEncryptedData: !!offerPayloadToUse.encryptedData,
              payloadKeys: Object.keys(offerPayloadToUse),
              offerObj: offerObj
            });
            // Don't throw - set offerToUse to null and let error handling below catch it
            offerToUse = null;
          }
          // Even if offer is unencrypted, try to enable encryption for the answer if possible
          if (isCryptoInitialized && senderId) {
            try {
              const callerKey = await getUserPublicKey(senderId);
              recipientPublicKeyRef.current = callerKey;
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Received unencrypted offer but enabled encryption for answer');
            } catch (keyErr) {
              console.warn('[ENCRYPTION] Could not enable encryption for answer:', keyErr.message);
              encryptionEnabledRef.current = false;
              setIsEncrypted(false);
            }
          } else {
            setIsEncrypted(false);
            encryptionEnabledRef.current = false;
          }
        }
      } catch (decryptErr) {
        console.error('[ENCRYPTION] Failed to decrypt offer:', decryptErr);
        // Try to use unencrypted format as fallback
        let fallbackOffer = null;
        
        if (offerPayloadToUse.offer) {
          fallbackOffer = offerPayloadToUse.offer;
        } else if (offerPayloadToUse.data) {
          fallbackOffer = offerPayloadToUse.data;
        } else if (offerPayloadToUse.type && offerPayloadToUse.sdp) {
          fallbackOffer = offerPayloadToUse;
        }
        
        if (fallbackOffer && fallbackOffer.type && fallbackOffer.sdp) {
          offerToUse = new RTCSessionDescription(fallbackOffer);
          setIsEncrypted(false);
          encryptionEnabledRef.current = false;
          console.log('[ENCRYPTION] Using unencrypted fallback in catch block');
          toast('Received unencrypted call. Encryption may not be available.', {
            icon: '⚠️',
            duration: 3000
          });
        } else {
          // Last resort: log error but don't throw - let the code below handle null offerToUse
          console.error('[ENCRYPTION] All decryption and fallback attempts failed');
          offerToUse = null;
        }
      }
      
      // Final check: if we still don't have an offer, log error but don't throw
      if (!offerToUse) {
        console.error('[WEBRTC-RECEIVER] Could not extract offer from payload:', {
          payloadKeys: Object.keys(offerPayloadToUse),
          hasEncryptedData: !!offerPayloadToUse.encryptedData,
          isEncrypted: offerPayloadToUse.isEncrypted || offerPayloadToUse.encrypted
        });
        setError('Failed to process call offer. Please try again.');
        setWebrtcState('failed');
        return; // Exit early instead of throwing
      }

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      // Resume AudioContext if suspended (user gesture allows this)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('[AUDIO] AudioContext resumed');
        } catch (err) {
          console.warn('[AUDIO] Could not resume AudioContext:', err);
        }
      }

      // Get local stream (this requires user permission, which is a user gesture)
      const stream = await getLocalStream();
      console.log('[WEBRTC-RECEIVER] Got local stream:', stream);
      
      // After user gesture (accepting call), ensure audio can play
      // This helps with AudioContext restrictions
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        try {
          await remoteAudioRef.current.play();
          console.log('[AUDIO] Audio started after user accepted call');
        } catch (error) {
          console.log('[AUDIO] Audio play error (will retry when stream arrives):', error.name);
        }
      }

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-RECEIVER] Peer connection initialized');

      // Add local tracks to peer connection and store RTCRtpSender for adaptive bitrate
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'audio' && sender) {
          rtpSenderRef.current = sender;
          console.log('[WEBRTC-RECEIVER] Added track:', track.kind, 'and stored RTCRtpSender');
        } else {
          console.log('[WEBRTC-RECEIVER] Added track:', track.kind);
        }
      });

      // Fix 2: Set state to offer_received
      setWebrtcState('offer_received');

      // Set remote description
      await pc.setRemoteDescription(offerToUse);
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
      
      // Configure Opus codec in SDP for optimal voice quality with adaptive bitrate
      if (answer.sdp) {
        answer.sdp = configureOpusCodec(answer.sdp, currentBitrateRef.current);
      }
      
      await pc.setLocalDescription(answer);
      console.log('[WEBRTC-RECEIVER] Created and set local description (answer) with Opus codec');

      // Encrypt answer before sending
      try {
        // Serialize RTCSessionDescription manually (it doesn't have toJSON)
        const answerData = {
          type: answer.type,
          sdp: answer.sdp
        };
        const encryptedPayload = await encryptSignalingData(answerData, receiverId);
        
        const payload = {
          ...encryptedPayload,
          callId,
          from: callerId,
          to: receiverId
        };
        
        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:answer', payload)) {
          socket.emit('voice-call:answer', payload);
        }
        
        console.log('[WEBRTC-RECEIVER] Encrypted answer sent/queued to:', callerId);
      } catch (encryptErr) {
        console.error('[ENCRYPTION] Failed to encrypt answer, sending unencrypted:', encryptErr);
        // Fallback to unencrypted - serialize answer
        const payload = {
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        };
        
        // Queue if socket is disconnected, otherwise send immediately
        if (!queueSignalingMessage('voice-call:answer', payload)) {
          socket.emit('voice-call:answer', payload);
        }
        toast.error('Failed to encrypt answer. Call proceeding without encryption.');
      }

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
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId, webrtcState, decryptSignalingData, encryptSignalingData, isCryptoInitialized, getUserPublicKey, configureOpusCodec, queueSignalingMessage]);

  // Handle received answer
  const handleAnswer = useCallback(async (encryptedAnswerPayload) => {
    try {
      console.log('[WEBRTC-CALLER] Received answer');

      // Fix 4: Clear answer timeout
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }

      // Decrypt answer if encrypted
      let answer;
      // Determine sender ID from the payload (the receiver who sent the answer)
      const senderId = encryptedAnswerPayload.from || receiverId;
      const decryptedAnswer = await decryptSignalingData(encryptedAnswerPayload, senderId);
      
      // If decryption succeeded and returned valid data
      if (decryptedAnswer && decryptedAnswer.type && decryptedAnswer.sdp) {
        answer = new RTCSessionDescription(decryptedAnswer);
        // Reset failure count on successful decryption
        decryptionFailureCountRef.current = 0;
        // Check if encryption was used (check both isEncrypted and encrypted properties)
        const isEncrypted = encryptedAnswerPayload.isEncrypted || (encryptedAnswerPayload.encrypted === true);
        if (isEncrypted) {
          setIsEncrypted(true);
          console.log('[ENCRYPTION] Decrypted answer successfully');
        } else {
          setIsEncrypted(false);
        }
      } else {
        // Decryption failed or returned null - increment counter
        decryptionFailureCountRef.current += 1;
        console.warn(`[ENCRYPTION] Answer decryption failed (${decryptionFailureCountRef.current}/${MAX_DECRYPTION_FAILURES}), trying unencrypted fallback`);
        
        // If we've had too many failures, disable encryption
        if (decryptionFailureCountRef.current >= MAX_DECRYPTION_FAILURES) {
          console.error('[ENCRYPTION] Too many decryption failures, disabling encryption for this call');
          encryptionEnabledRef.current = false;
          setIsEncrypted(false);
        }
        let answerObj = null;
        
        if (encryptedAnswerPayload.answer) {
          answerObj = encryptedAnswerPayload.answer;
        } else if (encryptedAnswerPayload.data && (encryptedAnswerPayload.encrypted === false || !encryptedAnswerPayload.encrypted)) {
          answerObj = encryptedAnswerPayload.data;
        } else if (encryptedAnswerPayload.type && encryptedAnswerPayload.sdp) {
          answerObj = encryptedAnswerPayload;
        }
        
        if (answerObj && answerObj.type && answerObj.sdp) {
          answer = new RTCSessionDescription(answerObj);
          setIsEncrypted(false);
          console.log('[ENCRYPTION] Using unencrypted fallback for answer');
          toast('Received unencrypted answer. Encryption may not be available.', {
            icon: '⚠️',
            duration: 3000
          });
        } else {
          // Last resort: log error but don't throw
          console.error('[ENCRYPTION] All decryption and fallback attempts failed for answer:', {
            hasAnswer: !!encryptedAnswerPayload.answer,
            hasData: !!encryptedAnswerPayload.data,
            hasType: !!encryptedAnswerPayload.type,
            payloadKeys: Object.keys(encryptedAnswerPayload)
          });
          answer = null;
        }
      }
      
      // Final check: if we still don't have an answer, log error but don't throw
      if (!answer) {
        console.error('[WEBRTC-CALLER] Could not extract answer from payload');
        setError('Failed to process call answer. Please try again.');
        setWebrtcState('failed');
        return; // Exit early instead of throwing
      }

      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(answer);
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

        // Fix 4: Set connection timeout (30 seconds to establish connection)
        // FIX: Increase timeout and only set if not already connected
        connectionTimeoutRef.current = setTimeout(() => {
          // Check both webrtcState and actual connection state
          const isActuallyConnected = pc.connectionState === 'connected' || 
                                     pc.iceConnectionState === 'connected' || 
                                     pc.iceConnectionState === 'completed';
          
          if (!isActuallyConnected && webrtcState !== 'connected') {
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
        }, 30000);
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
  }, [retryCount, webrtcState, receiverId, decryptSignalingData]);

  // Handle received ICE candidate
  const handleIceCandidate = useCallback(async (encryptedCandidatePayload) => {
    try {
      // Decrypt candidate if encrypted
      let candidateData = null;
      
      // Check if encryption was used (check both isEncrypted and encrypted properties)
      const isEncrypted = encryptedCandidatePayload.isEncrypted || (encryptedCandidatePayload.encrypted === true);
      
      if (isEncrypted && encryptedCandidatePayload.encryptedData) {
        // Try to decrypt
        try {
          // Determine sender ID from the payload
          const senderId = encryptedCandidatePayload.from || receiverId;
          // decryptSignalingData returns parsed object or null on failure
          candidateData = await decryptSignalingData(encryptedCandidatePayload, senderId);
          
          // If decryption returned null, fall back to unencrypted
          if (!candidateData) {
            console.warn('[ENCRYPTION] Decryption returned null for ICE candidate, trying unencrypted fallback');
            candidateData = encryptedCandidatePayload.candidate || 
                           (encryptedCandidatePayload.data ? encryptedCandidatePayload.data : null) ||
                           encryptedCandidatePayload;
          }
        } catch (decryptErr) {
          console.error('[ENCRYPTION] Failed to decrypt ICE candidate:', decryptErr);
          // Fall back to unencrypted format
          candidateData = encryptedCandidatePayload.candidate || 
                         (encryptedCandidatePayload.data ? encryptedCandidatePayload.data : null) ||
                         encryptedCandidatePayload;
        }
      } else {
        // Unencrypted format - handle multiple formats
        candidateData = encryptedCandidatePayload.candidate || 
                       (encryptedCandidatePayload.data && (encryptedCandidatePayload.encrypted === false || !encryptedCandidatePayload.encrypted) ? encryptedCandidatePayload.data : null) ||
                       encryptedCandidatePayload;
      }

      // Validate candidate data before creating RTCIceCandidate
      if (!candidateData || (!candidateData.candidate && candidateData.sdpMid === null && candidateData.sdpMLineIndex === null)) {
        // Skip null/empty candidates (end-of-candidates marker)
        return;
      }

      // Create RTCIceCandidate - handle cases where sdpMid/sdpMLineIndex might be null
      try {
        const candidate = new RTCIceCandidate(candidateData);
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        } else {
          // Queue candidate if remote description is not set yet
          pendingCandidatesRef.current.push(candidate);
        }
      } catch (candidateErr) {
        // Skip invalid candidates (e.g., end-of-candidates markers)
        if (candidateErr.message && candidateErr.message.includes('sdpMid and sdpMLineIndex are both null')) {
          // This is the end-of-candidates marker - ignore it
          return;
        }
        console.warn('[WEBRTC] Skipping invalid ICE candidate:', candidateErr.message);
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  }, [receiverId, decryptSignalingData]);

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
    if (disconnectGraceTimeoutRef.current) {
      clearTimeout(disconnectGraceTimeoutRef.current);
      disconnectGraceTimeoutRef.current = null;
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
    decryptionFailureCountRef.current = 0; // Reset decryption failure count
    pendingCandidatesRef.current = [];
    pendingOfferRef.current = null;
    shouldAnswerRef.current = false;
    rtpSenderRef.current = null; // Clear RTCRtpSender ref
    currentBitrateRef.current = 64000; // Reset to default bitrate
    signalingQueueRef.current = []; // Clear signaling queue
    isReconnectingRef.current = false;
    rttHistoryRef.current = []; // Clear RTT history
    smoothedRttRef.current = 0; // Reset smoothed RTT
    qualityHistoryRef.current = []; // Clear quality history
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
        // Store the encrypted offer payload (will be decrypted in answerCall)
        pendingOfferRef.current = data;
        
        // Automatically answer if we're the receiver (not initiator) and have an active call
        // This handles the case where user accepts call before offer arrives
        if (!isInitiator && callId) {
          console.log('[WEBRTC-RECEIVER] Receiver mode with active call, answering automatically');
          answerCall(data);
          shouldAnswerRef.current = false;
        } else if (shouldAnswerRef.current) {
          // Fallback: if shouldAnswerRef was set, answer immediately
          console.log('[WEBRTC-RECEIVER] User already accepted, answering now');
          answerCall(data);
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
        // Pass the entire payload (encrypted or unencrypted) to handleAnswer
        handleAnswer(data);
      } else {
        console.log('[WEBRTC-CALLER] CallId mismatch, ignoring answer');
      }
    };

    const handleIceCandidateEvent = (data) => {
      if (data.callId === callId) {
        // Pass the entire payload (encrypted or unencrypted) to handleIceCandidate
        handleIceCandidate(data);
      }
    };

    const handleReconnect = async () => {
      console.log('[WEBRTC] Socket reconnected during voice call');
      
      // If there's an active call during reconnection, log the state but DON'T clear keys
      // Keys are still valid - reconnection is just a network event, not a cryptographic event
      if (callId && (webrtcState !== 'idle' && webrtcState !== 'ended')) {
        console.log('[WEBRTC] Active call detected during reconnection:', {
          callId,
          state: webrtcState,
          isInitiator,
          receiverId,
          callerId,
          message: 'Keys remain valid - no cache clearing needed'
        });
        
        // Note: Keys should NOT be cleared on reconnection because:
        // 1. Keys are derived from public keys which don't change
        // 2. Clearing cache causes key mismatch between caller/receiver
        // 3. The retry logic in cryptoService.js already handles actual key mismatches
        // 4. Reconnection is a network event, not a cryptographic event
        
        // Room rejoining is handled by ChatPage's reconnection handler
        // Encryption keys remain cached and will be reused automatically
        
        // Flush queued signaling messages after reconnection
        await flushSignalingQueue();
      } else {
        console.log('[WEBRTC] Reconnection detected but no active call - state:', webrtcState);
        // Still flush queue in case there are any pending messages
        await flushSignalingQueue();
      }
    };

    socket.on('voice-call:offer', handleOffer);
    socket.on('voice-call:answer', handleAnswerEvent);
    socket.on('voice-call:ice-candidate', handleIceCandidateEvent);
    socket.on('connect', handleReconnect);
    socket.on('reconnect', handleReconnect);

    return () => {
      socket.off('voice-call:offer', handleOffer);
      socket.off('voice-call:answer', handleAnswerEvent);
      socket.off('voice-call:ice-candidate', handleIceCandidateEvent);
      socket.off('connect', handleReconnect);
      socket.off('reconnect', handleReconnect);
    };
  }, [socket, callId, answerCall, handleAnswer, handleIceCandidate, isInitiator, webrtcState, receiverId, callerId, flushSignalingQueue]);

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

  // Enhanced Network quality monitoring with adaptive quality management
  useEffect(() => {
    if (webrtcState !== 'connected') return;

    const pc = peerConnectionRef.current;
    if (!pc) return;

    // Adaptive bitrate adjustment function
    const adjustAudioBitrate = async (targetBitrate) => {
      if (!rtpSenderRef.current) return;
      
      try {
        const params = rtpSenderRef.current.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          // Create encodings array if it doesn't exist
          params.encodings = [{}];
        }
        
        // Set bitrate for all encodings
        params.encodings.forEach(encoding => {
          encoding.maxBitrate = targetBitrate;
        });
        
        await rtpSenderRef.current.setParameters(params);
        currentBitrateRef.current = targetBitrate;
        console.log(`[WEBRTC] Adjusted audio bitrate to ${targetBitrate} bps (${targetBitrate / 1000} kbps)`);
      } catch (err) {
        console.warn('[WEBRTC] Failed to adjust audio bitrate:', err);
      }
    };

    // Adaptive quality adjustment function with bitrate control
    const adjustQualityBasedOnStats = async (stats) => {
      const { packetLossPercent, jitter, rtt, availableBitrate } = stats;
      
      // Convert packetLossPercent to number if it's a string
      const packetLoss = typeof packetLossPercent === 'string' 
        ? parseFloat(packetLossPercent) 
        : packetLossPercent;
      
      // RTT Smoothing: Use Exponential Moving Average (EMA) to reduce fluctuations
      // Formula: smoothedRTT = α * currentRTT + (1-α) * previousSmoothedRTT where α = 0.3
      const alpha = 0.3;
      if (rtt > 0) {
        if (smoothedRttRef.current === 0) {
          // Initialize with first RTT value
          smoothedRttRef.current = rtt;
        } else {
          // Apply EMA
          smoothedRttRef.current = alpha * rtt + (1 - alpha) * smoothedRttRef.current;
        }
        
        // Keep history for reference (max 5 values)
        rttHistoryRef.current.push(rtt);
        if (rttHistoryRef.current.length > 5) {
          rttHistoryRef.current.shift();
        }
      }
      
      // Use smoothed RTT for quality assessment
      const smoothedRtt = smoothedRttRef.current || rtt;
      
      // Determine quality level and target bitrate
      // Only check bitrate if it's available (greater than 0)
      let quality = 'good';
      let targetBitrate = 64000; // Default: 64 kbps (high quality)
      const hasBitrateInfo = availableBitrate && availableBitrate > 0;
      
      // Poor quality thresholds - reduce bitrate significantly
      // Updated thresholds: packet loss > 5%, jitter > 20ms, smoothed RTT > 300ms
      if (packetLoss > 5 || jitter > 0.02 || smoothedRtt > 0.3 || (hasBitrateInfo && availableBitrate < 32000)) {
        quality = 'poor';
        // Reduce bitrate to 32 kbps for poor connections (better packet loss resilience)
        targetBitrate = 32000;
      } 
      // Fair quality thresholds - reduce bitrate moderately
      // Updated thresholds: packet loss > 2%, jitter > 10ms, smoothed RTT > 180ms (increased from 150ms)
      else if (packetLoss > 2 || jitter > 0.01 || smoothedRtt > 0.18 || (hasBitrateInfo && availableBitrate < 48000)) {
        quality = 'fair';
        // Reduce bitrate to 48 kbps for fair connections
        targetBitrate = 48000;
      }
      // Good quality - use high bitrate
      else {
        quality = 'good';
        targetBitrate = 64000; // 64 kbps for good connections
      }
      
      // Stability Window: Track quality history and only change if quality persists for 2 consecutive checks
      qualityHistoryRef.current.push(quality);
      if (qualityHistoryRef.current.length > 2) {
        qualityHistoryRef.current.shift();
      }
      
      // Only adjust bitrate if:
      // 1. Quality has been consistent for 2 checks (stability window)
      // 2. Bitrate difference is >= 24kbps (increased hysteresis from 16kbps)
      const qualityStable = qualityHistoryRef.current.length === 2 && 
                            qualityHistoryRef.current[0] === qualityHistoryRef.current[1];
      const bitrateDifference = Math.abs(currentBitrateRef.current - targetBitrate);
      
      if (qualityStable && bitrateDifference >= 24000) {
        await adjustAudioBitrate(targetBitrate);
        console.log(`[WEBRTC] Bitrate adjusted: ${currentBitrateRef.current/1000}kbps -> ${targetBitrate/1000}kbps (quality: ${quality}, smoothed RTT: ${(smoothedRtt*1000).toFixed(0)}ms)`);
      }
      
      setConnectionQuality(quality);
      
      // Adaptive adjustments based on quality
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack && audioTrack.getSettings) {
          // Adjust audio constraints based on network quality
          if (quality === 'poor') {
            console.log('[WEBRTC] Poor connection detected, optimizing for stability - reduced bitrate');
          } else if (quality === 'fair') {
            console.log('[WEBRTC] Fair connection, maintaining balanced quality - moderate bitrate');
          } else {
            console.log('[WEBRTC] Good connection, maintaining high quality - full bitrate');
          }
        }
      }
      
      return quality;
    };

    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let packetLoss = 0;
        let jitter = 0;
        let rtt = 0;
        let availableBitrate = 0;
        let bytesReceived = 0;
        let bytesSent = 0;
        let packetsReceived = 0;
        let packetsSent = 0;
        let totalPacketsLost = 0;
        let totalPackets = 0;

        stats.forEach(report => {
          // Inbound audio stats
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetLoss = report.packetsLost || 0;
            jitter = report.jitter || 0;
            bytesReceived = report.bytesReceived || 0;
            packetsReceived = report.packetsReceived || 0;
            totalPacketsLost += packetLoss;
            totalPackets += packetsReceived + packetLoss;
          }
          // Outbound audio stats
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            bytesSent = report.bytesSent || 0;
            packetsSent = report.packetsSent || 0;
          }
          // Candidate pair stats for RTT and bandwidth
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime || 0;
            availableBitrate = report.availableOutgoingBitrate || report.availableIncomingBitrate || 0;
          }
          // Remote inbound stats for additional metrics
          if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            if (report.packetsLost !== undefined) {
              totalPacketsLost += report.packetsLost;
            }
            if (report.jitter !== undefined && jitter === 0) {
              jitter = report.jitter;
            }
          }
        });

        // Calculate packet loss percentage
        const packetLossPercent = totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0;
        
        // Enhanced stats object - FIX: Define quality variable properly
        const enhancedStats = {
          packetLoss: totalPacketsLost,
          packetLossPercent: packetLossPercent,
          packetLossPercentFormatted: packetLossPercent.toFixed(2),
          jitter: jitter,
          jitterMs: jitter * 1000,
          rtt: rtt,
          rttMs: rtt * 1000,
          availableBitrate: availableBitrate,
          bytesReceived,
          bytesSent,
          packetsReceived,
          packetsSent,
          quality: 'good' // Default quality
        };

        // FIX: Calculate quality first before using it (using smoothed RTT if available)
        const rttForQuality = smoothedRttRef.current > 0 ? smoothedRttRef.current : enhancedStats.rtt;
        const calculatedQuality = enhancedStats.packetLossPercent > 5 || rttForQuality > 0.3 ? 'poor' 
          : enhancedStats.packetLossPercent > 2 || rttForQuality > 0.18 ? 'fair' : 'good';
        
        enhancedStats.quality = calculatedQuality;
        // Add smoothed RTT to stats for display
        enhancedStats.smoothedRtt = smoothedRttRef.current;
        enhancedStats.smoothedRttMs = smoothedRttRef.current * 1000;

        // Adjust quality based on stats (async - adjusts bitrate dynamically)
        adjustQualityBasedOnStats(enhancedStats).then(adjustedQuality => {
          enhancedStats.quality = adjustedQuality;
          setConnectionStats({ ...enhancedStats, quality: adjustedQuality });
        }).catch(err => {
          console.error('[WEBRTC] Error adjusting quality:', err);
          setConnectionStats(enhancedStats);
        });

        // Log warnings for poor quality using the calculated quality
        if (calculatedQuality === 'poor') {
          console.warn('[WEBRTC] Poor connection quality detected:', {
            packetLoss: enhancedStats.packetLossPercentFormatted + '%',
            jitter: enhancedStats.jitterMs.toFixed(2) + 'ms',
            rtt: enhancedStats.rttMs.toFixed(2) + 'ms',
            bitrate: enhancedStats.availableBitrate ? (enhancedStats.availableBitrate / 1000).toFixed(0) + 'kbps' : 'unknown'
          });
        } else if (calculatedQuality === 'fair') {
          console.log('[WEBRTC] Fair connection quality:', {
            packetLoss: enhancedStats.packetLossPercentFormatted + '%',
            rtt: enhancedStats.rttMs.toFixed(2) + 'ms'
          });
        }
      } catch (err) {
        console.error('[WEBRTC] Error getting stats:', err);
      }
    }, 3000); // FIX: Reduce frequency to 3 seconds to avoid excessive adjustments

    return () => clearInterval(interval);
  }, [webrtcState, localStream]);

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
    connectionQuality, // Enhanced: Expose connection quality level (good/fair/poor)
    isEncrypted,       // Expose encryption status
  };
};

export default useVoiceCall;
