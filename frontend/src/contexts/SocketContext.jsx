import { io } from 'socket.io-client';
import { createContext, useContext, useEffect, useState, useRef } from 'react';

// Use environment variable with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://apisecurechat.duckdns.org';

// Create a context for socket state
const SocketContext = createContext({
  socket: null,
  isConnected: false,
  connectError: null,
  reconnect: () => {}
});

// Provider component
export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);

  useEffect(() => {
    // Create socket connection
    const socket = io(API_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      timeout: 20000,
      withCredentials: true
    });

    socketRef.current = socket;

    // Connection event handlers
    const onConnect = () => {
      console.log('✅ Socket connected with ID:', socket.id);
      setIsConnected(true);
      setConnectError(null);
    };

    const onDisconnect = (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      
      // Auto-reconnect for certain disconnect reasons
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    };

    const onConnectError = (error) => {
      console.error('❌ Socket connection error:', error);
      setConnectError(error.message);
      setIsConnected(false);
    };

    const onReconnect = (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectError(null);
    };

    const onReconnectAttempt = (attemptNumber) => {
      console.log(`🔄 Attempting to reconnect... (attempt ${attemptNumber})`);
    };

    const onReconnectFailed = () => {
      console.error('❌ Socket reconnection failed after all attempts');
      setIsConnected(false);
      setConnectError('Failed to reconnect after multiple attempts');
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('reconnect', onReconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('reconnect_failed', onReconnectFailed);

    // Set initial connection state
    setIsConnected(socket.connected);

    // Cleanup on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.disconnect();
    };
  }, []);

  // Force reconnect function
  const reconnect = () => {
    if (socketRef.current && !isConnected) {
      console.log('🔄 Manual reconnect triggered...');
      socketRef.current.connect();
    }
  };

  return (
    <SocketContext.Provider value={{ 
      socket: socketRef.current, 
      isConnected, 
      connectError, 
      reconnect 
    }}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Export for backward compatibility
export default SocketContext;
