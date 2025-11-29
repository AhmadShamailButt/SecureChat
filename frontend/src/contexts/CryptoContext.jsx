import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import cryptoService from '../services/cryptoService';
import axiosInstance from '../store/axiosInstance';
import { useSelector } from 'react-redux';

const CryptoContext = createContext();

/**
 * Crypto Context Provider
 * Manages E2EE initialization and key management across the app
 */
export const CryptoProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { userDetails: user } = useSelector((state) => state.user);
  const initializationAttempted = useRef(false); // Track if we've tried to initialize

  /**
   * Initialize crypto service when user logs in
   */
  const initializeCrypto = useCallback(async (forceReinit = false) => {
    if (isInitialized && !forceReinit) {
      return true;
    }

    if (!user?.id) {
      console.log('⏳ Waiting for user to be logged in...');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔐 Initializing E2EE...');
      
      // Try to load existing private key
      const loaded = await cryptoService.loadPrivateKey(user.id);
      
      if (!loaded) {
        // Generate new key pair
        await cryptoService.initialize();
        
        // Export and save public key
        const pubKey = await cryptoService.exportPublicKey();
        setPublicKey(pubKey);
        
        // Upload public key to server
        await axiosInstance.put('/users/public-key', { publicKey: pubKey });
        
        // Save private key locally
        await cryptoService.savePrivateKey(user.id);
        
        console.log('✅ New key pair generated and uploaded');
      } else {
        // Load public key from server
        try {
          const response = await axiosInstance.get(`/users/${user.id}/public-key`);
          setPublicKey(response.data.publicKey);
          console.log('✅ Existing keys loaded');
        } catch (err) {
          // If public key not on server, regenerate
          if (err.response?.status === 404) {
            console.log('⚠️ Public key not found on server, regenerating...');
            await cryptoService.initialize();
            const pubKey = await cryptoService.exportPublicKey();
            setPublicKey(pubKey);
            await axiosInstance.put('/users/public-key', { publicKey: pubKey });
            await cryptoService.savePrivateKey(user.id);
          } else {
            throw err;
          }
        }
      }

      setIsInitialized(true);
      return true;
    } catch (err) {
      console.error('Failed to initialize crypto:', err);
      setError(err.message || 'Encryption initialization failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isInitialized]);

  /**
   * Get another user's public key
   */
  const getUserPublicKey = useCallback(async (userId) => {
    try {
      const response = await axiosInstance.get(`/users/${userId}/public-key`);
      return response.data.publicKey;
    } catch (err) {
      console.error(`Failed to get public key for user ${userId}:`, err);
      throw new Error('User has not set up encryption yet');
    }
  }, []);

  /**
   * Encrypt a message for a specific user
   */
  const encryptMessage = useCallback(async (plaintext, recipientId) => {
    if (!isInitialized) {
      throw new Error('Crypto not initialized');
    }

    try {
      const recipientPublicKey = await getUserPublicKey(recipientId);
      const encrypted = await cryptoService.encryptForUser(
        plaintext,
        recipientPublicKey,
        recipientId
      );
      return encrypted;
    } catch (err) {
      console.error('Encryption failed:', err);
      throw err;
    }
  }, [isInitialized, getUserPublicKey]);

  /**
   * Decrypt a message from a specific user
   */
  const decryptMessage = useCallback(async (encryptedData, senderId) => {
    if (!isInitialized) {
      throw new Error('Crypto not initialized');
    }

    try {
      const senderPublicKey = await getUserPublicKey(senderId);
      const decrypted = await cryptoService.decryptFromUser(
        encryptedData,
        senderPublicKey,
        senderId
      );
      return decrypted;
    } catch (err) {
      console.error('Decryption failed:', err);
      // Return error message instead of throwing
      return '[Decryption failed: Message may be corrupted]';
    }
  }, [isInitialized, getUserPublicKey]);

  /**
   * Clear crypto keys (on logout)
   */
  const clearCrypto = useCallback(() => {
    cryptoService.clearKeys();
    setIsInitialized(false);
    setPublicKey(null);
    setError(null);
    initializationAttempted.current = false; // Reset initialization flag
    console.log('🔒 Crypto cleared');
  }, []);

  // Auto-initialize when user logs in (only once per user session)
  useEffect(() => {
    if (user?.id && !isInitialized && !isLoading && !initializationAttempted.current) {
      initializationAttempted.current = true;
      initializeCrypto();
    }
    
    // Reset initialization flag when user changes
    if (!user?.id) {
      initializationAttempted.current = false;
    }
  }, [user?.id, isInitialized, isLoading]); // Removed initializeCrypto from dependencies

  const value = {
    isInitialized,
    publicKey,
    isLoading,
    error,
    initializeCrypto,
    getUserPublicKey,
    encryptMessage,
    decryptMessage,
    clearCrypto,
  };

  return (
    <CryptoContext.Provider value={value}>
      {children}
    </CryptoContext.Provider>
  );
};

/**
 * Hook to use crypto context
 */
export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within CryptoProvider');
  }
  return context;
};

export default CryptoContext;
