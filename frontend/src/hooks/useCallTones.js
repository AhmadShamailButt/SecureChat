import { useEffect, useRef } from 'react';

// Generate a tone using Web Audio API
const generateTone = (frequency, duration, type = 'sine') => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = type;

  // Fade in and out for smoother sound
  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gainNode.gain.linearRampToValueAtTime(0.3, now + duration - 0.01);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration);

  return audioContext;
};

// Ringing tone pattern (two tones alternating)
const playRingingTone = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let currentTime = audioContext.currentTime;

  // First tone (440Hz for 0.4s)
  const tone1 = audioContext.createOscillator();
  const gain1 = audioContext.createGain();
  tone1.connect(gain1);
  gain1.connect(audioContext.destination);
  tone1.frequency.value = 440;
  tone1.type = 'sine';
  gain1.gain.setValueAtTime(0, currentTime);
  gain1.gain.linearRampToValueAtTime(0.3, currentTime + 0.01);
  gain1.gain.linearRampToValueAtTime(0.3, currentTime + 0.4);
  gain1.gain.linearRampToValueAtTime(0, currentTime + 0.41);
  tone1.start(currentTime);
  tone1.stop(currentTime + 0.4);

  // Second tone (480Hz for 0.4s, after 0.2s pause)
  currentTime += 0.6;
  const tone2 = audioContext.createOscillator();
  const gain2 = audioContext.createGain();
  tone2.connect(gain2);
  gain2.connect(audioContext.destination);
  tone2.frequency.value = 480;
  tone2.type = 'sine';
  gain2.gain.setValueAtTime(0, currentTime);
  gain2.gain.linearRampToValueAtTime(0.3, currentTime + 0.01);
  gain2.gain.linearRampToValueAtTime(0.3, currentTime + 0.4);
  gain2.gain.linearRampToValueAtTime(0, currentTime + 0.41);
  tone2.start(currentTime);
  tone2.stop(currentTime + 0.4);

  return audioContext;
};

// Calling tone pattern (single repeating tone)
const playCallingTone = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let currentTime = audioContext.currentTime;

  // Single tone (425Hz for 0.5s, repeats every 3s)
  const tone = audioContext.createOscillator();
  const gain = audioContext.createGain();
  tone.connect(gain);
  gain.connect(audioContext.destination);
  tone.frequency.value = 425;
  tone.type = 'sine';
  gain.gain.setValueAtTime(0, currentTime);
  gain.gain.linearRampToValueAtTime(0.3, currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0.3, currentTime + 0.5);
  gain.gain.linearRampToValueAtTime(0, currentTime + 0.51);
  tone.start(currentTime);
  tone.stop(currentTime + 0.5);

  return audioContext;
};

/**
 * Hook to play ringing tone for incoming calls (receiver end)
 */
export const useRingingTone = (isPlaying) => {
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      // Play immediately
      const playTone = () => {
        // Close previous audio context if exists
        if (audioContextRef.current) {
          try {
            audioContextRef.current.close();
          } catch (e) {
            // Ignore errors
          }
        }
        audioContextRef.current = playRingingTone();
      };

      playTone();
      // Repeat every 2 seconds (0.4s tone + 0.2s pause + 0.4s tone + 1s pause = 2s total)
      intervalRef.current = setInterval(playTone, 2000);
    } else {
      // Stop playing
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore errors
        }
        audioContextRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore errors
        }
      }
    };
  }, [isPlaying]);
};

/**
 * Hook to play calling tone for outgoing calls (caller end)
 */
export const useCallingTone = (isPlaying) => {
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      // Play immediately
      const playTone = () => {
        // Close previous audio context if exists
        if (audioContextRef.current) {
          try {
            audioContextRef.current.close();
          } catch (e) {
            // Ignore errors
          }
        }
        audioContextRef.current = playCallingTone();
      };

      playTone();
      // Repeat every 3 seconds (0.5s tone + 2.5s pause)
      intervalRef.current = setInterval(playTone, 3000);
    } else {
      // Stop playing
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore errors
        }
        audioContextRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore errors
        }
      }
    };
  }, [isPlaying]);
};

