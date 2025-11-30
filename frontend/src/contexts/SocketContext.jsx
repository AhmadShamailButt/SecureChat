import { io } from 'socket.io-client';
import { createContext, useContext, useEffect, useState, useRef } from 'react';

// Use environment variable with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://apisecurechat.duckdns.org';

// Create a context for socket state
const SocketContext = createContext({
  socket: null,
  isConnected: false,
  connectError: null,
  reconnect: () => {},
  onReconnect: null,
  setOnReconnect: () => {}
});

// Provider component
export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const onReconnectCallbackRef = useRef(null);

  useEffect(() => {
    console.log('[SOCKET] Initializing connection to:', API_URL);
    
    // Create socket connection with better error handling
    const socket = io(API_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['polling', 'websocket'], // Try polling first (more reliable), then websocket
      autoConnect: true,
      timeout: 20000,
      withCredentials: true,
      // Force polling if websocket fails
      upgrade: true,
      rememberUpgrade: false,
      // Add path if needed (Socket.io default is /socket.io/)
      path: '/socket.io/'
    });

    socketRef.current = socket;

    // Connection event handlers
    const onConnect = () => {
      console.log('✅ Socket connected with ID:', socket.id);
      setIsConnected(true);
      setConnectError(null);
      
      // Trigger reconnection callback if set (also for initial connection)
      if (onReconnectCallbackRef.current) {
        console.log('[SOCKET] Triggering reconnection callback on connect');
        try {
          onReconnectCallbackRef.current(socket);
        } catch (error) {
          console.error('[SOCKET] Error in reconnection callback:', error);
        }
      }
    };

    const onDisconnect = (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      
      // Auto-reconnect for certain disconnect reasons
      if (reason === 'io server disconnect') {
        console.log('🔄 Server disconnected, attempting to reconnect...');
        socket.connect();
      } else if (reason === 'transport close') {
        console.log('🔄 Transport closed, will attempt to reconnect...');
      } else if (reason === 'transport error') {
        console.log('🔄 Transport error, will attempt to reconnect...');
      }
    };

    const onConnectError = (error) => {
      console.error('❌ Socket connection error:', {
        message: error.message,
        type: error.type,
        description: error.description,
        context: error.context,
        transport: error.transport,
        API_URL: API_URL
      });
      setConnectError(error.message || 'Failed to connect to server');
      setIsConnected(false);
      
      // If websocket fails, try to force polling
      if (error.type === 'TransportError' || error.message?.includes('websocket')) {
        console.log('🔄 WebSocket failed, will retry with polling fallback');
      }
    };

    const onReconnect = (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectError(null);
      
      // Trigger reconnection callback if set
      if (onReconnectCallbackRef.current) {
        console.log('[SOCKET] Triggering reconnection callback');
        try {
          onReconnectCallbackRef.current(socket);
        } catch (error) {
          console.error('[SOCKET] Error in reconnection callback:', error);
        }
      }
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

  // Set reconnection callback
  const setOnReconnect = (callback) => {
    onReconnectCallbackRef.current = callback;
  };

  return (
    <SocketContext.Provider value={{ 
      socket: socketRef.current, 
      isConnected, 
      connectError, 
      reconnect,
      onReconnect: onReconnectCallbackRef.current,
      setOnReconnect
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
