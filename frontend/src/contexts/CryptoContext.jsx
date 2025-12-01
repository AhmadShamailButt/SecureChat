import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import cryptoService from '../services/cryptoService';
import axiosInstance from '../store/axiosInstance';
import { useSelector } from 'react-redux';

const CryptoContext = createContext();

export const CryptoProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { userDetails: user } = useSelector((state) => state.user);
  
  // CRITICAL: Cache public keys to prevent version mismatches
  const publicKeyCache = useRef({});
  const initializationInProgress = useRef(false);

  const initializeCrypto = useCallback(async () => {
    // Fast exit if already initialized
    if (isInitialized) {
      console.log('✅ Crypto already initialized');
      return true;
    }
    
    // Check if service is already ready
    if (cryptoService.isInitialized()) {
       console.log('⚡ Crypto service already ready');
       setIsInitialized(true);
       try {
           const pubKey = await cryptoService.exportPublicKey();
           setPublicKey(pubKey);
       } catch (e) { 
         console.error("Could not export existing key", e); 
       }
       return true;
    }

    if (!user?.id) {
      console.log('⏸️ No user ID, skipping crypto init');
      return false;
    }

    // Prevent overlapping calls
    if (initializationInProgress.current) {
      console.log('⏸️ Initialization already in progress');
      return false;
    }
    
    initializationInProgress.current = true;
    setIsLoading(true);

    try {
      console.log('🔧 Initializing crypto for user:', user.id);
      console.log('   User ID type:', typeof user.id);
      console.log('   User ID value:', user.id);
      
      // Try to load existing keys from localStorage
      const loaded = await cryptoService.loadKeys(user.id);
      
      if (!loaded) {
        console.log('🆕 No local keys found, generating new key pair...');
        
        // Generate new keys
        await cryptoService.initialize();
        const pubKey = await cryptoService.exportPublicKey();
        
        console.log('📤 Uploading public key to server...');
        // Upload public key to server
        await axiosInstance.put('/users/public-key', { publicKey: pubKey });
        
        console.log('💾 Saving keys to localStorage...');
        // CRITICAL: Save keys to localStorage immediately after generation
        const saved = await cryptoService.saveKeys(user.id);
        
        if (!saved) {
          console.error('❌ WARNING: Keys were not saved to localStorage!');
          console.error('   Old messages will be unreadable after logout!');
        }
        
        setPublicKey(pubKey);
        console.log('✅ New key pair generated, uploaded, and saved');
      } else {
        console.log('♻️ Loaded existing keys from localStorage');
        const pubKey = await cryptoService.exportPublicKey();
        setPublicKey(pubKey);
        
        console.log('🔍 Verifying server has matching public key...');
        // Verify server has this key
        try {
          const response = await axiosInstance.get(`/users/${user.id}/public-key`);
          const serverKey = response.data.publicKey;
          
          if (serverKey !== pubKey) {
            console.warn('⚠️ Server public key mismatch! Updating server...');
            await axiosInstance.put('/users/public-key', { publicKey: pubKey });
            console.log('✅ Server public key updated');
          } else {
            console.log('✅ Server public key matches localStorage');
          }
        } catch (err) {
          if (err.response?.status === 404) {
            console.log('📤 Uploading public key to server (404)');
            await axiosInstance.put('/users/public-key', { publicKey: pubKey });
          }
        }
      }

      setIsInitialized(true);
      console.log('✅ Crypto initialized successfully');
      console.log('   Keys are saved in localStorage and will persist across logout/login');
      return true;
    } catch (error) {
      console.error('❌ Crypto initialization failed:', error);
      console.error('   Error details:', error.message);
      setIsInitialized(false);
      return false;
    } finally {
      initializationInProgress.current = false;
      setIsLoading(false);
    }
  }, [user, isInitialized]);

  // CRITICAL: Cache public keys to prevent mismatches
  const getUserPublicKey = useCallback(async (userId) => {
    // Check cache first
    if (publicKeyCache.current[userId]) {
      console.log(`📦 Using cached public key for user: ${userId}`);
      return publicKeyCache.current[userId];
    }
    
    try {
      // Fetch fresh key
      const response = await axiosInstance.get(`/users/${userId}/public-key?t=${Date.now()}`);
      const publicKey = response.data.publicKey;
      
      if (!publicKey) {
        throw new Error('Public key not found');
      }
      
      // Cache it
      publicKeyCache.current[userId] = publicKey;
      console.log(`🔑 Fetched and cached public key for user: ${userId}`);
      
      return publicKey;
    } catch (err) {
      console.error(`❌ Failed to get public key for user ${userId}:`, err);
      throw new Error('User has not set up encryption yet');
    }
  }, []);
  
  // Clear public key cache
  const clearPublicKeyCache = useCallback(() => {
    publicKeyCache.current = {};
    console.log('🗑️ Public key cache cleared');
  }, []);

  const encryptMessage = useCallback(async (plaintext, recipientId) => {
    if (!isInitialized) {
        console.log('⏸️ Crypto not initialized, initializing now...');
        const success = await initializeCrypto();
        if (!success) {
          throw new Error('Crypto initialization failed');
        }
    }
    
    try {
      const recipientKey = await getUserPublicKey(recipientId);
      const encrypted = await cryptoService.encryptForUser(plaintext, recipientKey, recipientId);
      return encrypted;
    } catch (err) {
      console.error('❌ Encryption failed:', err);
      throw err;
    }
  }, [isInitialized, getUserPublicKey, initializeCrypto]);

  const decryptMessage = useCallback(async (encryptedData, senderId) => {
    if (!isInitialized) {
      console.log('⏸️ Crypto not initialized for decryption');
      const success = await initializeCrypto();
      if (!success) {
        console.warn('⚠️ Crypto not initialized, cannot decrypt');
        throw new Error('Encryption not initialized');
      }
    }
    
    try {
      const senderKey = await getUserPublicKey(senderId);
      const decrypted = await cryptoService.decryptFromUser(encryptedData, senderKey, senderId);
      return decrypted;
    } catch (err) {
      console.error('❌ Decryption failed:', err);
      throw err;
    }
  }, [isInitialized, getUserPublicKey, initializeCrypto]);

  // MODIFIED: Only clear in-memory keys, NOT localStorage
  const clearCrypto = useCallback(() => {
    console.log('🔄 Clearing crypto context (preserving localStorage keys)...');
    cryptoService.clearKeys(); // Only clears in-memory keys
    clearPublicKeyCache();
    setIsInitialized(false);
    setPublicKey(null);
    initializationInProgress.current = false;
    console.log('✅ Crypto context cleared (keys preserved in localStorage)');
  }, [clearPublicKeyCache]);

  // NEW: Permanently delete keys (use with caution!)
  const deleteKeys = useCallback((userId) => {
    console.warn('⚠️ PERMANENTLY DELETING ENCRYPTION KEYS!');
    cryptoService.deleteKeysFromStorage(userId || user?.id);
    cryptoService.clearKeys();
    clearPublicKeyCache();
    setIsInitialized(false);
    setPublicKey(null);
    initializationInProgress.current = false;
    console.warn('⚠️ Keys deleted! Old messages are now unreadable!');
  }, [user, clearPublicKeyCache]);

  // Auto-initialize when user logs in
  useEffect(() => {
    if (user?.id && !isInitialized && !initializationInProgress.current) {
      console.log('🚀 Auto-initializing crypto...');
      initializeCrypto();
    }
  }, [user?.id, isInitialized, initializeCrypto]);

  return (
    <CryptoContext.Provider value={{
      encryptMessage,
      decryptMessage,
      isInitialized,
      publicKey,
      isLoading,
      clearCrypto,        // Clears in-memory only, preserves localStorage
      deleteKeys,         // Permanently deletes keys (dangerous!)
      initializeCrypto,
      clearPublicKeyCache
    }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within CryptoProvider');
  }
  return context;
};

export default CryptoContext;
