import { io } from 'socket.io-client';
import { createContext, useContext, useEffect, useState } from 'react';

// Use environment variable with fallback
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket connection with options
const socket = io(API_URL, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['polling', 'websocket'], // Try polling first, then websocket
  autoConnect: true,
  forceNew: true,
  timeout: 20000
});

// Create a context for socket state
const SocketContext = createContext({
  socket: null,
  isConnected: false,
  connectError: null,
  reconnect: () => {}
});

// Provider component
export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [connectError, setConnectError] = useState(null);

  useEffect(() => {
    // Connection event handlers
    const onConnect = () => {
      console.log('Socket connected with ID:', socket.id);
      setIsConnected(true);
      setConnectError(null);
    };

    const onDisconnect = (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    };

    const onConnectError = (error) => {
      console.error('Socket connection error:', error);
      setConnectError(error.message);
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('error', onConnectError);

    // If not connected already, try to connect
    if (!socket.connected) {
      socket.connect();
    }

    // Cleanup on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('error', onConnectError);
    };
  }, []);

  // Force reconnect function
  const reconnect = () => {
    if (!isConnected) {
      console.log('Attempting to reconnect socket...');
      socket.connect();
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectError, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext);

// Also export the socket directly for components that just need the instance
export default socket;

