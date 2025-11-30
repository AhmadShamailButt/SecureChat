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

  // Audio device selection and browser detection
  const [availableAudioDevices, setAvailableAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const [availableOutputDevices, setAvailableOutputDevices] = useState([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(null);
  const browserInfoRef = useRef(null);
  
  // AGC/NS toggle states for echo cancellation troubleshooting
  const [disableAGC, setDisableAGC] = useState(false);
  const [disableNS, setDisableNS] = useState(false);
  const workingConstraintsRef = useRef(null); // Store which constraint combination worked
  
  // Echo prevention and volume control
  const [currentVolume, setCurrentVolume] = useState(0.4); // Current remote audio volume
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false); // Speaker mute state
  const [echoDetected, setEchoDetected] = useState(false); // Echo detection state
  const volumeDuckingActiveRef = useRef(false); // Track if volume ducking is active
  const localAudioLevelRef = useRef(0); // Track local audio level for ducking
  const echoDetectionRef = useRef({ lastLocalLevel: 0, lastRemoteLevel: 0, correlationCount: 0 });

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

  // Detect browser and AEC capabilities
  useEffect(() => {
    const detectBrowser = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isChrome = /chrome/.test(userAgent) && !/edge|edg|opr/.test(userAgent);
      const isFirefox = /firefox/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
      const isEdge = /edg/.test(userAgent);
      
      browserInfoRef.current = {
        isChrome,
        isFirefox,
        isSafari,
        isEdge,
        name: isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : isEdge ? 'Edge' : 'Unknown',
        hasAEC3: isChrome || isEdge, // Chrome/Edge use AEC3
        needsExplicitAEC: isFirefox || isSafari // Firefox/Safari may need explicit applyConstraints
      };
      
      console.log('[AUDIO] Browser detected:', browserInfoRef.current);
    };
    
    detectBrowser();
  }, []);

  // Enumerate available audio input devices
  const enumerateAudioDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('[AUDIO] Device enumeration not supported');
        return [];
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.substring(0, 8)}`,
          groupId: device.groupId
        }));
      
      setAvailableAudioDevices(audioInputs);
      console.log('[AUDIO] Available audio input devices:', audioInputs);
      return audioInputs;
    } catch (err) {
      console.error('[AUDIO] Error enumerating audio devices:', err);
      return [];
    }
  }, []);

  // Enumerate available audio output devices
  const enumerateOutputDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('[AUDIO] Output device enumeration not supported');
        return [];
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.substring(0, 8)}`,
          groupId: device.groupId
        }));
      
      setAvailableOutputDevices(audioOutputs);
      console.log('[AUDIO] Available audio output devices:', audioOutputs);
      return audioOutputs;
    } catch (err) {
      console.error('[AUDIO] Error enumerating output devices:', err);
      return [];
    }
  }, []);

  // Set audio output device using setSinkId
  const setAudioOutputDevice = useCallback(async (deviceId) => {
    if (!remoteAudioRef.current) {
      console.warn('[AUDIO] Remote audio element not available');
      return false;
    }

    if (!remoteAudioRef.current.setSinkId) {
      console.warn('[AUDIO] setSinkId not supported in this browser');
      toast('Audio output device selection not supported in this browser', {
        icon: '⚠️',
        duration: 3000
      });
      return false;
    }

    try {
      await remoteAudioRef.current.setSinkId(deviceId);
      setSelectedOutputDeviceId(deviceId);
      console.log('[AUDIO] Audio output device set to:', deviceId);
      toast.success('Audio output device changed');
      return true;
    } catch (err) {
      console.error('[AUDIO] Failed to set audio output device:', err);
      toast.error('Failed to change audio output device');
      return false;
    }
  }, []);

  // Toggle AGC (Auto Gain Control) - can interfere with echo cancellation
  const toggleAGC = useCallback(async () => {
    setDisableAGC(prev => {
      const newValue = !prev;
      console.log(`[AUDIO] AGC ${newValue ? 'disabled' : 'enabled'}`);
      
      // Reapply constraints if we have a local stream
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack && audioTrack.applyConstraints) {
          audioTrack.applyConstraints({
            autoGainControl: !newValue
          }).then(() => {
            toast.success(`Auto Gain Control ${newValue ? 'disabled' : 'enabled'}`);
          }).catch(err => {
            console.error('[AUDIO] Failed to toggle AGC:', err);
            toast.error('Failed to toggle Auto Gain Control');
          });
        }
      }
      
      return newValue;
    });
  }, [localStream]);

  // Toggle NS (Noise Suppression) - can interfere with echo cancellation
  const toggleNS = useCallback(async () => {
    setDisableNS(prev => {
      const newValue = !prev;
      console.log(`[AUDIO] Noise Suppression ${newValue ? 'disabled' : 'enabled'}`);
      
      // Reapply constraints if we have a local stream
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack && audioTrack.applyConstraints) {
          audioTrack.applyConstraints({
            noiseSuppression: !newValue
          }).then(() => {
            toast.success(`Noise Suppression ${newValue ? 'disabled' : 'enabled'}`);
          }).catch(err => {
            console.error('[AUDIO] Failed to toggle NS:', err);
            toast.error('Failed to toggle Noise Suppression');
          });
        }
      }
      
      return newValue;
    });
  }, [localStream]);

  // Toggle speaker mute - mutes remote audio when user is speaking to prevent feedback
  const toggleSpeakerMute = useCallback(() => {
    setIsSpeakerMuted(prev => {
      const newValue = !prev;
      console.log(`[AUDIO] Speaker mute ${newValue ? 'enabled' : 'disabled'}`);
      
      if (remoteAudioRef.current) {
        if (newValue) {
          // Mute remote audio
          remoteAudioRef.current.volume = 0;
          console.log('[AUDIO] Remote audio muted to prevent echo');
        } else {
          // Unmute and restore volume
          remoteAudioRef.current.volume = currentVolume;
          console.log('[AUDIO] Remote audio unmuted, volume restored to', currentVolume);
        }
      }
      
      toast.success(`Speaker mute ${newValue ? 'enabled' : 'disabled'}`);
      return newValue;
    });
  }, [currentVolume]);

  // Set remote audio volume (0.0 to 1.0)
  const setRemoteVolume = useCallback((volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setCurrentVolume(clampedVolume);
    
    if (remoteAudioRef.current && !isSpeakerMuted) {
      remoteAudioRef.current.volume = clampedVolume;
      console.log('[AUDIO] Remote audio volume set to', clampedVolume);
    }
    
    return clampedVolume;
  }, [isSpeakerMuted]);

  // Request permission and enumerate devices after first getUserMedia call
  useEffect(() => {
    const requestDeviceAccess = async () => {
      try {
        // Request temporary access to enumerate devices with labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(track => track.stop()); // Stop immediately
        
        // Now enumerate devices (will have labels)
        await enumerateAudioDevices();
        await enumerateOutputDevices();
      } catch (err) {
        console.warn('[AUDIO] Could not request device access for enumeration:', err);
        // Still try to enumerate (devices won't have labels)
        await enumerateAudioDevices();
        await enumerateOutputDevices();
      }
    };
    
    // Only enumerate if we have mediaDevices API
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      requestDeviceAccess();
    }
  }, [enumerateAudioDevices, enumerateOutputDevices]);

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
      
      // Set volume to reasonable level to prevent feedback loops
      // Lower volume reduces chance of echo if speakers are near microphone
      // Reduced to 0.4 for aggressive echo prevention when using speakers (was 0.65, originally 0.8)
      remoteAudioRef.current.volume = currentVolume;
      
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
      
      // Set output device if one was selected
      if (selectedOutputDeviceId && remoteAudioRef.current.setSinkId) {
        remoteAudioRef.current.setSinkId(selectedOutputDeviceId).catch(err => {
          console.warn('[AUDIO] Failed to set output device on stream change:', err);
        });
      }
      
      // Set initial volume
      if (!isSpeakerMuted) {
        remoteAudioRef.current.volume = currentVolume;
      }
      
      // Attempt to play audio (will work if user has already interacted)
      playRemoteAudio();
    }
  }, [remoteStream, playRemoteAudio, selectedOutputDeviceId, currentVolume, isSpeakerMuted]);

  // Sync volume when currentVolume changes (if not muted)
  useEffect(() => {
    if (remoteAudioRef.current && !isSpeakerMuted && !volumeDuckingActiveRef.current) {
      remoteAudioRef.current.volume = currentVolume;
    }
  }, [currentVolume, isSpeakerMuted]);

  // Audio level monitoring for local stream (read-only, no processing)
  // Note: This monitoring does NOT affect the actual WebRTC stream
  // Audio processing (echo cancellation, noise suppression) is handled by browser
  // based on constraints set in getUserMedia and applyConstraints
  useEffect(() => {
    if (!localStream || !audioContextRef.current) return;

    let analyser = null;
    let dataArray = null;
    let animationFrameId = null;

    try {
      // Create analyser node for audio level monitoring only
      analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256; // Small FFT for low latency
      analyser.smoothingTimeConstant = 0.8; // Smooth audio level changes
      
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      // Get audio track and create media stream source
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const source = audioContextRef.current.createMediaStreamSource(localStream);
        
        // Connect source directly to analyser for monitoring only
        // DO NOT connect to destination - this is read-only monitoring
        // The actual WebRTC stream uses the original track with browser's built-in
        // echo cancellation, noise suppression, and auto gain control
        source.connect(analyser);
        
        // Monitor audio levels for diagnostics only
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
          localAudioLevelRef.current = average; // Store for volume ducking
          
          // Log warnings if audio levels are problematic
          if (average > 240) {
            console.warn('[AUDIO-DIAG] High audio level detected:', average, '- may cause clipping');
          } else if (average < 20) {
            console.log('[AUDIO-DIAG] Low audio level detected:', average, '- user may be too quiet');
          }
          
          // Periodic diagnostic logging (every 10 seconds)
          const now = Date.now();
          if (!audioLevelRef.current._lastDiagnosticLog || now - audioLevelRef.current._lastDiagnosticLog > 10000) {
            audioLevelRef.current._lastDiagnosticLog = now;
            
            // Get current audio track settings for diagnostics
            const audioTrack = localStream?.getAudioTracks()[0];
            if (audioTrack && audioTrack.getSettings) {
              const settings = audioTrack.getSettings();
              console.log('[AUDIO-DIAG] Audio quality diagnostics:', {
                audioLevel: average,
                echoCancellation: settings.echoCancellation ? '✓ enabled' : '✗ disabled',
                noiseSuppression: settings.noiseSuppression ? '✓ enabled' : '✗ disabled',
                autoGainControl: settings.autoGainControl ? '✓ enabled' : '✗ disabled',
                sampleRate: settings.sampleRate,
                channelCount: settings.channelCount,
                deviceId: settings.deviceId ? settings.deviceId.substring(0, 20) + '...' : 'default'
              });
            }
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

  // Automatic volume ducking: Lower remote audio when user is speaking
  useEffect(() => {
    if (!localStream || !remoteAudioRef.current || !remoteStream) return;

    const duckingInterval = setInterval(() => {
      const localLevel = localAudioLevelRef.current;
      const SPEAKING_THRESHOLD = 30; // Audio level threshold for detecting speech
      const DUCKED_VOLUME = 0.2; // Volume when user is speaking
      const NORMAL_VOLUME = currentVolume; // Normal volume when user is quiet

      if (localLevel > SPEAKING_THRESHOLD && !isSpeakerMuted) {
        // User is speaking - duck the remote audio
        if (!volumeDuckingActiveRef.current) {
          volumeDuckingActiveRef.current = true;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.volume = DUCKED_VOLUME;
            console.log('[AUDIO] Volume ducking activated (user speaking)');
          }
        }
      } else {
        // User is quiet - restore normal volume
        if (volumeDuckingActiveRef.current) {
          volumeDuckingActiveRef.current = false;
          if (remoteAudioRef.current && !isSpeakerMuted) {
            remoteAudioRef.current.volume = NORMAL_VOLUME;
            console.log('[AUDIO] Volume ducking deactivated (user quiet)');
          }
        }
      }
    }, 100); // Check every 100ms for responsive ducking

    return () => clearInterval(duckingInterval);
  }, [localStream, remoteStream, currentVolume, isSpeakerMuted]);

  // Echo detection: Detect correlation between local and remote audio
  useEffect(() => {
    if (!localStream || !remoteAudioRef.current || !remoteStream) return;

    const echoDetectionInterval = setInterval(() => {
      const localLevel = localAudioLevelRef.current;
      const remoteLevel = remoteAudioRef.current ? 
        (remoteAudioRef.current.volume * 100) : 0; // Approximate remote level
      
      const detection = echoDetectionRef.current;
      
      // Simple echo detection: if local audio is high and remote audio is playing,
      // and they correlate in timing, likely echo
      if (localLevel > 40 && remoteLevel > 20) {
        detection.correlationCount++;
        
        // If correlation detected multiple times, likely echo
        if (detection.correlationCount > 5 && !echoDetected) {
          setEchoDetected(true);
          console.warn('[AUDIO] Echo detected! Attempting automatic fixes...');
          
          // Automatic fix attempts
          // 1. Lower volume further
          if (remoteAudioRef.current && remoteAudioRef.current.volume > 0.3) {
            const newVolume = Math.max(0.2, remoteAudioRef.current.volume - 0.1);
            remoteAudioRef.current.volume = newVolume;
            setCurrentVolume(newVolume);
            console.log('[AUDIO] Auto-fix: Lowered volume to', newVolume);
          }
          
          // 2. Show user warning with actionable guidance
          toast('Echo detected! Try: 1) Use headphones 2) Enable speaker mute 3) Lower volume', {
            icon: '⚠️',
            duration: 10000,
            // Note: UI can listen to echoDetected state and show buttons
          });
          
          // Log actionable steps
          console.warn('[AUDIO] Echo detected - Recommended actions:');
          console.warn('  1. Use headphones (best solution)');
          console.warn('  2. Enable speaker mute (toggleSpeakerMute())');
          console.warn('  3. Lower volume (setRemoteVolume(0.2))');
          console.warn('  4. Disable AGC/NS if enabled (toggleAGC/toggleNS)');
        }
      } else {
        // Reset correlation count if conditions not met
        if (detection.correlationCount > 0) {
          detection.correlationCount = Math.max(0, detection.correlationCount - 1);
        }
      }
      
      detection.lastLocalLevel = localLevel;
      detection.lastRemoteLevel = remoteLevel;
    }, 500); // Check every 500ms

    return () => clearInterval(echoDetectionInterval);
  }, [localStream, remoteStream, echoDetected]);

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
      // Modify SDP to prioritize Opus codec and set optimal parameters for voice quality
      let modifiedSdp = sdp;
      
      // Ensure minimum bitrate is 40kbps (not 32kbps) for acceptable quality
      const minBitrate = Math.max(targetBitrate, 40000);
      
      // Set Opus codec parameters for voice with optimized FEC and DTX
      // Format: a=fmtp:111 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;maxaveragebitrate=64000
      // Optimized settings for voice quality and packet loss resilience
      const opusRegex = /a=fmtp:(\d+) (.*)/g;
      modifiedSdp = modifiedSdp.replace(opusRegex, (match, payloadType, params) => {
        // Check if this is Opus (usually payload type 111 or 109)
        // Add/update Opus parameters for optimal voice quality
        
        // Parse existing params to preserve any browser-set values
        const existingParams = params.split(';').reduce((acc, param) => {
          const [key] = param.split('=');
          if (key) acc[key.trim()] = param.trim();
          return acc;
        }, {});
        
        // Build optimized parameter list
        const newParams = [
          'minptime=10', // Minimum packet time (10ms for low latency)
          'maxptime=60', // Maximum packet time (60ms to prevent buffering issues)
          'useinbandfec=1', // Enable in-band FEC for error recovery (critical for packet loss)
          'stereo=0', // Mono (sufficient for voice, reduces bandwidth)
          'sprop-stereo=0', // No stereo property
          `maxaveragebitrate=${minBitrate}`, // Adaptive bitrate with minimum floor (40kbps)
          'maxplaybackrate=48000', // 48kHz sample rate
          'ptime=20', // Packet time 20ms (low latency, good balance)
          'cbr=0', // Use variable bitrate (VBR) for better quality at same average bitrate
          'usedtx=1' // Enable DTX (discontinuous transmission) to save bandwidth during silence
          // DTX helps reduce bandwidth usage when user is not speaking, allowing
          // more bandwidth for actual speech and improving overall quality
        ];
        
        // Join parameters, removing duplicates
        const paramString = newParams.join(';');
        return `a=fmtp:${payloadType} ${paramString}`;
      });
      
      // Also ensure Opus is prioritized in codec list
      // This helps ensure Opus is selected over other codecs
      if (modifiedSdp.includes('opus/48000')) {
        // Opus is already in the SDP, which is good
        console.log(`[WEBRTC] Configured Opus codec parameters with bitrate: ${minBitrate} bps (min: 40kbps)`);
      } else {
        console.warn('[WEBRTC] Opus codec not found in SDP - browser may use different codec');
      }
      
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
      
      // Comprehensive connection diagnostics
      const remoteStream = event.streams[0];
      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      if (remoteAudioTrack) {
        console.log('[AUDIO-DIAG] Remote audio track received:', {
          id: remoteAudioTrack.id,
          enabled: remoteAudioTrack.enabled,
          muted: remoteAudioTrack.muted,
          readyState: remoteAudioTrack.readyState,
          settings: remoteAudioTrack.getSettings ? remoteAudioTrack.getSettings() : 'not available'
        });
      }
      
      // Log local audio track diagnostics for comparison
      if (localStream) {
        const localAudioTrack = localStream.getAudioTracks()[0];
        if (localAudioTrack && localAudioTrack.getSettings) {
          const localSettings = localAudioTrack.getSettings();
          console.log('[AUDIO-DIAG] Call connection established - Audio configuration:', {
            local: {
              echoCancellation: localSettings.echoCancellation ? '✓' : '✗',
              noiseSuppression: localSettings.noiseSuppression ? '✓' : '✗',
              autoGainControl: localSettings.autoGainControl ? '✓' : '✗',
              sampleRate: localSettings.sampleRate,
              channelCount: localSettings.channelCount
            },
            remote: {
              enabled: remoteAudioTrack?.enabled,
              readyState: remoteAudioTrack?.readyState
            },
            bitrate: `${currentBitrateRef.current / 1000}kbps`,
            encryption: encryptionEnabledRef.current ? '✓ enabled' : '✗ disabled'
          });
        }
      }
      
      // Attempt to play audio after receiving remote track
      // This will work if user has already interacted (accepted call)
      if (remoteAudioRef.current) {
        try {
          await remoteAudioRef.current.play();
          console.log('[AUDIO] Remote audio started playing');
          console.log('[AUDIO-DIAG] Remote audio playback:', {
            volume: remoteAudioRef.current.volume,
            muted: remoteAudioRef.current.muted,
            paused: remoteAudioRef.current.paused,
            readyState: remoteAudioRef.current.readyState
          });
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

  // Get local media stream with optimized audio constraints and browser-specific handling
  const getLocalStream = useCallback(async (deviceId = null) => {
    try {
      // Optimized audio constraints for high-quality voice calls
      // Using standard WebRTC constraints with essential settings only
      // Removed redundant Chrome-specific settings that may conflict
      const audioConstraints = {
        // High sample rate for CD-quality audio (48kHz)
        sampleRate: 48000,
        // Mono channel (sufficient for voice, reduces bandwidth)
        channelCount: 1,
        // Echo cancellation - CRITICAL for preventing echo/feedback
        echoCancellation: true,
        // Noise suppression to filter background noise
        noiseSuppression: true,
        // Auto gain control for consistent volume
        autoGainControl: true,
        // Low latency target (10ms) for real-time communication
        latency: 0.01,
        // Sample size for better quality
        sampleSize: 16
      };

      // Add device selection if specified
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }

      // Progressive constraint fallback for echo cancellation troubleshooting
      // DEFAULT: Start with AEC-only mode to prevent interference with echo cancellation
      // Only try other combinations if AEC-only fails
      // Order: AEC only (default) → AEC+NS → AEC+AGC → All three
      const constraintCombinations = [
        {
          name: 'AEC only (default - best for echo prevention)',
          constraints: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
            latency: 0.01,
            sampleSize: 16
          }
        },
        {
          name: 'AEC + NS',
          constraints: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            latency: 0.01,
            sampleSize: 16
          }
        },
        {
          name: 'AEC + AGC',
          constraints: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
            latency: 0.01,
            sampleSize: 16
          }
        },
        {
          name: 'AEC + NS + AGC (all)',
          constraints: audioConstraints
        }
      ];

      // Apply user preferences (disable AGC/NS if toggled)
      constraintCombinations.forEach(combo => {
        if (disableAGC) {
          combo.constraints.autoGainControl = false;
        }
        if (disableNS) {
          combo.constraints.noiseSuppression = false;
        }
        if (deviceId) {
          combo.constraints.deviceId = { exact: deviceId };
        }
      });

      // Try each combination until one works
      let stream;
      let workingCombo = null;
      let lastError = null;

      for (const combo of constraintCombinations) {
        try {
          console.log(`[AUDIO] Trying constraint combination: ${combo.name}`);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: combo.constraints
          });
          workingCombo = combo.name;
          workingConstraintsRef.current = combo.constraints;
          console.log(`[AUDIO] ✓ Successfully got stream with: ${combo.name}`);
          break;
        } catch (err) {
          console.warn(`[AUDIO] Constraint combination "${combo.name}" failed:`, err.message);
          lastError = err;
          continue;
        }
      }

      if (!stream) {
        throw lastError || new Error('All constraint combinations failed');
      }
      
      // Apply and verify audio track constraints
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        // Verify and log actual settings applied by browser
        if (audioTrack.getSettings) {
        const settings = audioTrack.getSettings();
          console.log('[AUDIO] Audio track settings applied:', {
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
            deviceId: settings.deviceId
          });
          
          // Browser-specific echo cancellation verification and enforcement
          const browserInfo = browserInfoRef.current || {};
          
          // Verify echo cancellation is actually enabled
          if (settings.echoCancellation === false) {
            console.warn('[AUDIO] WARNING: Echo cancellation is disabled! This may cause echo/feedback issues.');
            console.warn(`[AUDIO] Browser: ${browserInfo.name || 'Unknown'}, AEC3: ${browserInfo.hasAEC3 ? 'Yes' : 'No'}`);
            
            // Browser-specific AEC enforcement
            try {
              if (browserInfo.needsExplicitAEC) {
                // Firefox/Safari may need multiple attempts
                console.log('[AUDIO] Applying explicit AEC for Firefox/Safari...');
                await audioTrack.applyConstraints({ echoCancellation: true });
                
                // Verify again after applying
                const recheckSettings = audioTrack.getSettings();
                if (recheckSettings.echoCancellation === false) {
                  console.error('[AUDIO] AEC still disabled after explicit application - browser may not support it');
                  // Notify user about potential echo issues
                  toast('Echo cancellation may not be working. Please use headphones to prevent echo.', {
                    icon: '⚠️',
                    duration: 5000
                  });
                } else {
                  console.log('[AUDIO] ✓ Echo cancellation enabled after explicit application');
                }
              } else {
                // Chrome/Edge - should work, but try anyway
                await audioTrack.applyConstraints({ echoCancellation: true });
                console.log('[AUDIO] Attempted to enable echo cancellation explicitly (Chrome/Edge)');
              }
            } catch (enableErr) {
              console.error('[AUDIO] Failed to enable echo cancellation:', enableErr);
              // Notify user with Chrome-specific guidance
              const browserInfo = browserInfoRef.current || {};
              if (browserInfo.isChrome || browserInfo.isEdge) {
                toast('Echo cancellation not working? Go to Chrome Settings → WebRTC → Advanced Mic Settings → Enable Echo Cancellation', {
                  icon: '⚠️',
                  duration: 8000
                });
              } else {
                toast('Echo cancellation failed to enable. Using headphones is recommended.', {
                  icon: '⚠️',
                  duration: 5000
                });
              }
            }
          } else {
            console.log(`[AUDIO] ✓ Echo cancellation is enabled (Browser: ${browserInfo.name || 'Unknown'})`);
            
            // Additional browser-specific logging
            if (browserInfo.hasAEC3) {
              console.log('[AUDIO] Using AEC3 (Chrome/Edge advanced echo cancellation)');
            }
          }

          // Sample rate verification - check for mismatches
          if (audioContextRef.current && settings.sampleRate) {
            const inputSampleRate = settings.sampleRate;
            const outputSampleRate = audioContextRef.current.sampleRate;
            
            if (inputSampleRate !== outputSampleRate) {
              console.warn('[AUDIO] Sample rate mismatch detected:', {
                input: inputSampleRate,
                output: outputSampleRate,
                message: 'Mismatched sample rates can cause echo issues'
              });
              toast('Audio sample rate mismatch detected. This may cause echo. Consider using headphones.', {
                icon: '⚠️',
                duration: 5000
              });
            } else if (inputSampleRate !== 48000) {
              console.warn('[AUDIO] Non-standard sample rate:', {
                sampleRate: inputSampleRate,
                expected: 48000,
                message: 'WebRTC standard is 48kHz'
              });
            } else {
              console.log('[AUDIO] ✓ Sample rates match (48kHz)');
            }
          }
        }
        
        // Apply constraints at track level to ensure they're active
        // Use the working constraints from progressive fallback
        try {
          if (audioTrack.applyConstraints && workingConstraintsRef.current) {
            const appliedConstraints = {
              echoCancellation: workingConstraintsRef.current.echoCancellation !== false,
              noiseSuppression: workingConstraintsRef.current.noiseSuppression !== false,
              autoGainControl: workingConstraintsRef.current.autoGainControl !== false
            };
            await audioTrack.applyConstraints(appliedConstraints);
            console.log('[AUDIO] Applied constraints at track level:', appliedConstraints);
            
            // Verify constraints were actually applied
            const verifySettings = audioTrack.getSettings();
            if (verifySettings.echoCancellation === false) {
              console.error('[AUDIO] ERROR: Echo cancellation failed to apply at track level!');
            }
          }
        } catch (applyErr) {
          console.warn('[AUDIO] Could not apply constraints at track level:', applyErr);
        }
        
        // Set up periodic echo cancellation verification (every 10 seconds)
        // This helps detect if echo cancellation gets disabled during the call
        // Enhanced with browser-specific handling
        const echoCheckInterval = setInterval(() => {
          if (audioTrack && audioTrack.getSettings) {
            const currentSettings = audioTrack.getSettings();
            const browserInfo = browserInfoRef.current || {};
            
            if (currentSettings.echoCancellation === false) {
              console.warn('[AUDIO] Echo cancellation disabled during call - attempting to re-enable');
              console.warn(`[AUDIO] Browser: ${browserInfo.name || 'Unknown'}`);
              
              // Browser-specific re-enablement
              audioTrack.applyConstraints({ echoCancellation: true })
                .then(() => {
                  // Verify it worked
                  const recheck = audioTrack.getSettings();
                  if (recheck.echoCancellation === true) {
                    console.log('[AUDIO] ✓ Echo cancellation re-enabled successfully');
                  } else {
                    console.error('[AUDIO] Echo cancellation re-enablement failed - browser limitation');
                    // Notify user if this happens multiple times
                    if (!audioTrack._aecWarningShown) {
                      toast('Echo cancellation issues detected. Please use headphones.', {
                        icon: '⚠️',
                        duration: 5000
                      });
                      audioTrack._aecWarningShown = true;
                    }
                  }
                })
                .catch(err => {
                  console.error('[AUDIO] Failed to re-enable echo cancellation:', err);
                });
            }
          } else {
            // Track is gone, clear interval
            clearInterval(echoCheckInterval);
          }
        }, 10000);
        
        // Store interval ID for cleanup (we'll clean it up when stream ends)
        audioTrack._echoCheckInterval = echoCheckInterval;
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
  const startCall = useCallback(async (deviceId = null) => {
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
      // Use selected device or default
      const deviceToUse = deviceId || selectedAudioDeviceId;
      const stream = await getLocalStream(deviceToUse);
      console.log('[WEBRTC-CALLER] Got local stream:', stream);
      if (deviceToUse) {
        setSelectedAudioDeviceId(deviceToUse);
      }
      
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
      // Use selected device or default
      const deviceToUse = selectedAudioDeviceId;
      const stream = await getLocalStream(deviceToUse);
      console.log('[WEBRTC-RECEIVER] Got local stream:', stream);
      if (deviceToUse) {
        setSelectedAudioDeviceId(deviceToUse);
      }
      
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

    // Stop all local tracks and clean up echo check intervals
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        // Clear echo check interval if it exists
        if (track._echoCheckInterval) {
          clearInterval(track._echoCheckInterval);
          track._echoCheckInterval = null;
        }
        track.stop();
      });
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
    currentBitrateRef.current = 64000; // Reset to default bitrate (64kbps)
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
      
      // RTT Smoothing: Use Exponential Moving Average (EMA) with improved alpha for better stability
      // Formula: smoothedRTT = α * currentRTT + (1-α) * previousSmoothedRTT
      // Using α = 0.2 (lower = more smoothing, less reactive to spikes)
      const alpha = 0.2;
      if (rtt > 0) {
        if (smoothedRttRef.current === 0) {
          // Initialize with first RTT value
          smoothedRttRef.current = rtt;
        } else {
          // Apply EMA with improved smoothing
          smoothedRttRef.current = alpha * rtt + (1 - alpha) * smoothedRttRef.current;
        }
        
        // Keep history for reference (max 10 values for better trend analysis)
        rttHistoryRef.current.push(rtt);
        if (rttHistoryRef.current.length > 10) {
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
      
      // Poor quality thresholds - adjusted to be less sensitive
      // Thresholds: packet loss > 7% (was 5%), jitter > 30ms (was 20ms), smoothed RTT > 400ms (was 300ms)
      // Minimum bitrate floor: 40kbps (was 32kbps) for acceptable quality
      if (packetLoss > 7 || jitter > 0.03 || smoothedRtt > 0.4 || (hasBitrateInfo && availableBitrate < 40000)) {
        quality = 'poor';
        // Minimum bitrate: 40 kbps (increased from 32kbps) for acceptable quality
        targetBitrate = 40000;
      } 
      // Fair quality thresholds - adjusted to be less sensitive
      // Thresholds: packet loss > 3% (was 2%), jitter > 15ms (was 10ms), smoothed RTT > 250ms (was 180ms)
      else if (packetLoss > 3 || jitter > 0.015 || smoothedRtt > 0.25 || (hasBitrateInfo && availableBitrate < 48000)) {
        quality = 'fair';
        // Reduce bitrate to 48 kbps for fair connections
        targetBitrate = 48000;
      }
      // Good quality - use high bitrate
      else {
        quality = 'good';
        targetBitrate = 64000; // 64 kbps for good connections
      }
      
      // Stability Window: Track quality history and only change if quality persists for 3 consecutive checks
      // Increased from 2 to 3 checks to prevent frequent bitrate changes
      qualityHistoryRef.current.push(quality);
      if (qualityHistoryRef.current.length > 3) {
        qualityHistoryRef.current.shift();
      }
      
      // Only adjust bitrate if:
      // 1. Quality has been consistent for 3 checks (stability window - increased from 2)
      // 2. Bitrate difference is >= 16kbps (reduced from 24kbps but with 3-check stability)
      // 3. At least 9 seconds have passed (3 checks * 3 seconds) for stability
      const qualityStable = qualityHistoryRef.current.length === 3 && 
                            qualityHistoryRef.current[0] === qualityHistoryRef.current[1] &&
                            qualityHistoryRef.current[1] === qualityHistoryRef.current[2];
      const bitrateDifference = Math.abs(currentBitrateRef.current - targetBitrate);
      
      if (qualityStable && bitrateDifference >= 16000) {
        await adjustAudioBitrate(targetBitrate);
        console.log(`[WEBRTC] Bitrate adjusted: ${currentBitrateRef.current/1000}kbps -> ${targetBitrate/1000}kbps (quality: ${quality}, smoothed RTT: ${(smoothedRtt*1000).toFixed(0)}ms, stability: 3 checks)`);
      }
      
      setConnectionQuality(quality);
      
      // Adaptive adjustments based on quality
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack && audioTrack.getSettings) {
          // Adjust audio constraints based on network quality
          if (quality === 'poor') {
            console.log('[WEBRTC] Poor connection detected, optimizing for stability - reduced bitrate');
            // User feedback for poor quality
            if (!audioTrack._poorQualityNotified) {
              toast('Poor connection quality detected. Audio quality may be reduced.', {
                icon: '⚠️',
                duration: 4000
              });
              audioTrack._poorQualityNotified = true;
            }
          } else if (quality === 'fair') {
            console.log('[WEBRTC] Fair connection, maintaining balanced quality - moderate bitrate');
            // Reset notification flag if quality improves
            if (audioTrack._poorQualityNotified) {
              audioTrack._poorQualityNotified = false;
            }
          } else {
            console.log('[WEBRTC] Good connection, maintaining high quality - full bitrate');
            // Reset notification flag if quality improves
            if (audioTrack._poorQualityNotified) {
              audioTrack._poorQualityNotified = false;
            }
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

        // Calculate quality using updated thresholds (matching adjustQualityBasedOnStats)
        const rttForQuality = smoothedRttRef.current > 0 ? smoothedRttRef.current : enhancedStats.rtt;
        const calculatedQuality = enhancedStats.packetLossPercent > 7 || rttForQuality > 0.4 || enhancedStats.jitter > 0.03 ? 'poor' 
          : enhancedStats.packetLossPercent > 3 || rttForQuality > 0.25 || enhancedStats.jitter > 0.015 ? 'fair' : 'good';
        
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
    }, 3000); // Check every 3 seconds - balanced between responsiveness and stability

    return () => clearInterval(interval);
  }, [webrtcState, localStream]);

  // Function to change audio input device during call
  const changeAudioDevice = useCallback(async (deviceId) => {
    if (!localStream) {
      console.warn('[AUDIO] No local stream available to change device');
      return false;
    }
    
    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) {
        console.warn('[AUDIO] No audio track available');
        return false;
      }
      
      // Stop current track
      audioTrack.stop();
      
      // Get new stream with selected device
      const newStream = await getLocalStream(deviceId);
      
      // Replace track in peer connection if connected
      if (peerConnectionRef.current && rtpSenderRef.current) {
        const newTrack = newStream.getAudioTracks()[0];
        await rtpSenderRef.current.replaceTrack(newTrack);
        console.log('[AUDIO] Audio device changed successfully');
      }
      
      // Update local stream state
      setLocalStream(newStream);
      setSelectedAudioDeviceId(deviceId);
      
      toast.success('Audio device changed');
      return true;
    } catch (err) {
      console.error('[AUDIO] Failed to change audio device:', err);
      toast.error('Failed to change audio device');
      return false;
    }
  }, [localStream, getLocalStream]);

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
    // Audio device selection (NEW)
    availableAudioDevices,  // List of available audio input devices
    selectedAudioDeviceId,  // Currently selected device ID
    changeAudioDevice,      // Function to change audio device
    enumerateAudioDevices,  // Function to refresh device list
    // Audio output device selection (NEW - for echo cancellation)
    availableOutputDevices,  // List of available audio output devices
    selectedOutputDeviceId,  // Currently selected output device ID
    setAudioOutputDevice,    // Function to set audio output device (setSinkId)
    enumerateOutputDevices,  // Function to refresh output device list
    // AGC/NS toggles for echo troubleshooting (NEW)
    disableAGC,        // State: whether AGC is disabled
    disableNS,         // State: whether NS is disabled
    toggleAGC,         // Function to toggle AGC on/off
    toggleNS,          // Function to toggle NS on/off
    // Echo prevention and volume control (NEW)
    currentVolume,     // Current remote audio volume (0.0 to 1.0)
    setRemoteVolume,   // Function to set remote audio volume
    isSpeakerMuted,    // State: whether speaker mute is enabled
    toggleSpeakerMute, // Function to toggle speaker mute (mutes remote audio during speech)
    echoDetected,      // State: whether echo has been detected
  };
};

export default useVoiceCall;