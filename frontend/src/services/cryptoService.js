/**
 * SecureChat Crypto Service
 * Implements End-to-End Encryption using:
 * - ECDH (Elliptic Curve Diffie-Hellman) for key exchange
 * - AES-GCM for message encryption
 * - Web Crypto API for all cryptographic operations
 */

class CryptoService {
  constructor() {
    this.keyPair = null;
    this.sharedKeys = new Map(); // Map of userId -> { key: CryptoKey, publicKey: string }
    this.groupKeys = new Map(); // Map of groupId -> CryptoKey (AES-GCM key for group)
  }

  /**
   * Check if crypto is initialized
   */
  isInitialized() {
    return this.keyPair !== null && this.keyPair.publicKey !== null;
  }

  /**
   * Initialize crypto service
   * MODIFIED: Supports Persistence
   * 1. Tries to load existing keys from LocalStorage using userId
   * 2. If not found, generates new keys and saves them
   */
  async initialize(userId) {
    try {
      // 1. Validations
      if (!userId) {
        console.warn('⚠️ Crypto initialized without userId. Persistence will not work.');
      }

      // 2. Try to load existing keys first
      if (userId) {
        const loaded = await this.loadKeys(userId);
        if (loaded) {
          console.log('🔐 Crypto initialized: Restored existing keys from storage');
          return true;
        }
      }

      // 3. Generate NEW keys if we couldn't load old ones
      console.log('⚠️ No existing keys found. Generating NEW identity...');
      
      this.keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256', // Also known as prime256v1 or secp256r1
        },
        true, // extractable
        ['deriveKey', 'deriveBits']
      );

      // 4. Automatically save the new keys immediately
      if (userId) {
        await this.saveKeys(userId);
      }

      console.log('🔐 Crypto initialized: New Key pair generated and saved');
      return true;
    } catch (error) {
      console.error('Failed to initialize crypto:', error);
      throw new Error('Cryptography initialization failed');
    }
  }

  /**
   * Export public key to base64 for sharing with other users
   */
  async exportPublicKey() {
    if (!this.keyPair || !this.keyPair.publicKey) {
      throw new Error('Crypto not initialized. Call initialize() first.');
    }

    try {
      const exported = await window.crypto.subtle.exportKey(
        'raw',
        this.keyPair.publicKey
      );
      return this.arrayBufferToBase64(exported);
    } catch (error) {
      console.error('Failed to export public key:', error);
      throw error;
    }
  }

  /**
   * Import another user's public key from base64
   */
  async importPublicKey(base64PublicKey) {
    try {
      const keyData = this.base64ToArrayBuffer(base64PublicKey);
      return await window.crypto.subtle.importKey(
        'raw',
        keyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        [] // public keys don't need usage permissions
      );
    } catch (error) {
      console.error('Failed to import public key:', error);
      throw error;
    }
  }

  /**
   * Derive shared secret key from other user's public key
   */
  async deriveSharedKey(otherUserPublicKeyBase64, userId) {
    if (!this.keyPair) {
      throw new Error('Crypto not initialized');
    }

    // Check if we already have this key cached WITH validation
    if (this.sharedKeys.has(userId)) {
      const cached = this.sharedKeys.get(userId);
      
      // CRITICAL: Validate cached key matches current public key
      if (cached.publicKey === otherUserPublicKeyBase64) {
        // console.log(`✅ Using cached shared key for user: ${userId}`); // Commented out to reduce spam
        return cached.key;
      } else {
        console.warn(`⚠️ Public key mismatch for user ${userId}! Clearing cache.`);
        this.sharedKeys.delete(userId);
      }
    }

    try {
      const otherPublicKey = await this.importPublicKey(otherUserPublicKeyBase64);
      
      // Derive shared secret using ECDH
      const sharedSecret = await window.crypto.subtle.deriveBits(
        {
          name: 'ECDH',
          public: otherPublicKey,
        },
        this.keyPair.privateKey,
        256 // 256 bits for AES-256
      );

      // Import the shared secret as an AES-GCM key
      const sharedKey = await window.crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM' },
        false, // not extractable
        ['encrypt', 'decrypt']
      );

      // Cache with public key for validation
      this.sharedKeys.set(userId, {
        key: sharedKey,
        publicKey: otherUserPublicKeyBase64
      });
      
      console.log(`🔑 Derived shared key for user: ${userId}`);
      return sharedKey;
    } catch (error) {
      console.error('Failed to derive shared key:', error);
      throw error;
    }
  }

  /**
   * Encrypt a message using AES-GCM
   * Returns: { ciphertext, iv, authTag } all in base64
   */
  async encryptMessage(plaintext, sharedKey) {
    try {
      // Generate a random IV (12 bytes is recommended for GCM)
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Convert plaintext to ArrayBuffer
      const encoder = new TextEncoder();
      const plaintextBuffer = encoder.encode(plaintext);

      // Encrypt using AES-GCM
      const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128, // 128-bit authentication tag
        },
        sharedKey,
        plaintextBuffer
      );

      // AES-GCM returns ciphertext + auth tag concatenated
      // Last 16 bytes are the auth tag
      const ciphertext = ciphertextBuffer.slice(0, -16);
      const authTag = ciphertextBuffer.slice(-16);

      return {
        ciphertext: this.arrayBufferToBase64(ciphertext),
        iv: this.arrayBufferToBase64(iv),
        authTag: this.arrayBufferToBase64(authTag),
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Decrypt a message using AES-GCM
   * Expects: { ciphertext, iv, authTag } all in base64
   */
  async decryptMessage(encryptedData, sharedKey) {
    try {
      const { ciphertext, iv, authTag } = encryptedData;

      // Validate required fields
      if (!ciphertext || !iv || !authTag) {
        throw new Error('Missing required encryption fields (ciphertext, iv, or authTag)');
      }

      // Validate base64 format with better error messages
      let ciphertextBuffer, ivBuffer, authTagBuffer;
      try {
        ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);
        ivBuffer = this.base64ToArrayBuffer(iv);
        authTagBuffer = this.base64ToArrayBuffer(authTag);

        // Validate IV length (should be 12 bytes for GCM)
        if (ivBuffer.byteLength !== 12) {
          throw new Error(`Invalid IV length: expected 12 bytes, got ${ivBuffer.byteLength}`);
        }

        // Validate auth tag length (should be 16 bytes for 128-bit tag)
        if (authTagBuffer.byteLength !== 16) {
          throw new Error(`Invalid auth tag length: expected 16 bytes, got ${authTagBuffer.byteLength}`);
        }

        // Concatenate ciphertext and auth tag (required by Web Crypto API)
        const combinedBuffer = new Uint8Array(
          ciphertextBuffer.byteLength + authTagBuffer.byteLength
        );
        combinedBuffer.set(new Uint8Array(ciphertextBuffer), 0);
        combinedBuffer.set(new Uint8Array(authTagBuffer), ciphertextBuffer.byteLength);

        // Decrypt using AES-GCM
        const plaintextBuffer = await window.crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: ivBuffer,
            tagLength: 128,
          },
          sharedKey,
          combinedBuffer
        );

        // Convert back to string
        const decoder = new TextDecoder();
        return decoder.decode(plaintextBuffer);
      } catch (base64Error) {
        // Provide more detailed error information
        console.error('❌ Base64 validation failed:', {
            error: base64Error.message,
            ciphertextType: typeof ciphertext,
            ciphertextPreview: typeof ciphertext === 'string' ? ciphertext.substring(0, 20) : 'NOT A STRING',
        });
        
        if (base64Error.message.includes('Invalid') || base64Error.message.includes('Missing')) {
          throw base64Error;
        }
        throw new Error(`Invalid base64 encoding in encrypted data: ${base64Error.message}`);
      }
    } catch (error) {
      // Provide more specific error messages
      if (error.name === 'OperationError' || error.message.includes('decrypt')) {
        // This is likely a key mismatch or corrupted data
        // console.error(' Decryption failed (likely key mismatch or corrupted data):', error.name);
      } else {
        console.error(' Decryption failed:', error.message || error);
      }
      throw new Error('Failed to decrypt message. Message may be corrupted or key mismatch.');
    }
  }

  /**
   * Encrypt message for a specific user
   * Convenience method that handles key derivation
   */
  async encryptForUser(plaintext, otherUserPublicKey, userId) {
    const sharedKey = await this.deriveSharedKey(otherUserPublicKey, userId);
    return await this.encryptMessage(plaintext, sharedKey);
  }

  /**
   * Decrypt message from a specific user WITH RETRY
   * Convenience method that handles key derivation
   */
  async decryptFromUser(encryptedData, otherUserPublicKey, userId) {
    try {
      const sharedKey = await this.deriveSharedKey(otherUserPublicKey, userId);
      return await this.decryptMessage(encryptedData, sharedKey);
    } catch (error) {
      // If decryption fails, clear cache and retry ONCE
      // Only retry if it's not a clear format error
      if (error.message && !error.message.includes('Invalid') && !error.message.includes('Missing')) {
        console.warn(`⚠️ Initial decryption failed for user ${userId}. Clearing cache and retrying.`);
        this.sharedKeys.delete(userId);
        
        try {
          const retryKey = await this.deriveSharedKey(otherUserPublicKey, userId);
          return await this.decryptMessage(encryptedData, retryKey);
        } catch (retryError) {
          // Suppress retry error - it's likely an old message with different keys
          throw retryError;
        }
      } else {
        // Format error - don't retry
        throw error;
      }
    }
  }

  /**
   * Generate a new random AES-GCM key for group encryption
   * This key will be shared among all group members (encrypted for each)
   */
  async generateGroupKey() {
    try {
      const groupKey = await window.crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true, // extractable - we need to export it to encrypt for each member
        ['encrypt', 'decrypt']
      );

      console.log('🔑 Generated new group encryption key');
      return groupKey;
    } catch (error) {
      console.error('Failed to generate group key:', error);
      throw error;
    }
  }

  /**
   * Encrypt a group key for a specific member using their public key
   * Returns: { encryptedGroupKey, iv, authTag } all in base64
   */
  async encryptGroupKeyForMember(groupKey, memberPublicKeyBase64, memberId) {
    try {
      // Export the group key to raw format (ArrayBuffer)
      const groupKeyRaw = await window.crypto.subtle.exportKey('raw', groupKey);
      
      // Derive shared key with the member (using ECDH)
      const sharedKey = await this.deriveSharedKey(memberPublicKeyBase64, memberId);
      
      // Convert group key ArrayBuffer to base64 string for encryption
      const groupKeyBase64 = this.arrayBufferToBase64(groupKeyRaw);
      
      // Encrypt the group key using the shared key (AES-GCM)
      const encrypted = await this.encryptMessage(groupKeyBase64, sharedKey);

      return {
        encryptedGroupKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      };
    } catch (error) {
      console.error(`Failed to encrypt group key for member ${memberId}:`, error);
      throw error;
    }
  }

  /**
   * Decrypt a group key that was encrypted for the current user
   * Expects: { encryptedGroupKey, iv, authTag } and sender's public key
   */
  async decryptGroupKey(encryptedGroupKeyData, senderPublicKeyBase64, senderId, groupId) {
    try {
      // Check if we already have this group key cached
      if (this.groupKeys.has(groupId)) {
        // console.log(`🔑 Using cached group key for group: ${groupId}`);
        return this.groupKeys.get(groupId);
      }

      // console.log(`🔐 Decrypting group key for group ${groupId}...`);

      const { encryptedGroupKey, iv, authTag } = encryptedGroupKeyData;

      if (!encryptedGroupKey || !iv || !authTag) {
        throw new Error('Missing encryption data components');
      }

      // Validate base64 format
      try {
        this.base64ToArrayBuffer(encryptedGroupKey);
        this.base64ToArrayBuffer(iv);
        this.base64ToArrayBuffer(authTag);
      } catch (base64Error) {
        console.error(`❌ Invalid base64 encoding in group key data:`, base64Error.message);
        throw new Error(`Invalid base64 encoding in encrypted group key: ${base64Error.message}`);
      }

      // Derive shared key with the sender (with retry on failure)
      let sharedKey;
      try {
        // Clear any cached shared key for this user to force fresh derivation
        if (this.sharedKeys.has(senderId)) {
          const cached = this.sharedKeys.get(senderId);
          if (cached.publicKey !== senderPublicKeyBase64) {
            console.warn(`⚠️ Public key mismatch for sender ${senderId}, clearing cache`);
            this.sharedKeys.delete(senderId);
          }
        }
        
        sharedKey = await this.deriveSharedKey(senderPublicKeyBase64, senderId);
      } catch (deriveError) {
        console.error(`❌ Failed to derive shared key with sender ${senderId}:`, deriveError);
        // Clear cache and retry once
        this.sharedKeys.delete(senderId);
        try {
          sharedKey = await this.deriveSharedKey(senderPublicKeyBase64, senderId);
        } catch (retryError) {
          throw new Error(`Failed to derive shared key: ${retryError.message}`);
        }
      }

      // Decrypt the group key (with retry on failure)
      let decryptedGroupKeyBase64;
      try {
        decryptedGroupKeyBase64 = await this.decryptMessage(
          {
            ciphertext: encryptedGroupKey,
            iv: iv,
            authTag: authTag
          },
          sharedKey
        );
      } catch (decryptError) {
        // If decryption fails, clear shared key cache and retry once
        console.warn(`⚠️ Initial group key decryption failed. Clearing cache and retrying...`);
        this.sharedKeys.delete(senderId);
        
        try {
          // Re-derive shared key
          sharedKey = await this.deriveSharedKey(senderPublicKeyBase64, senderId);
          // Retry decryption
          decryptedGroupKeyBase64 = await this.decryptMessage(
            {
              ciphertext: encryptedGroupKey,
              iv: iv,
              authTag: authTag
            },
            sharedKey
          );
        } catch (retryError) {
          console.error(`❌ Retry decryption failed:`, retryError);
          throw new Error(`Failed to decrypt group key: ${retryError.message}`);
        }
      }

      // Convert from base64 back to ArrayBuffer
      let groupKeyRaw;
      try {
        groupKeyRaw = this.base64ToArrayBuffer(decryptedGroupKeyBase64);
      } catch (error) {
        throw new Error(`Invalid group key format after decryption: ${error.message}`);
      }

      // Import the raw group key as an AES-GCM key
      const groupKey = await window.crypto.subtle.importKey(
        'raw',
        groupKeyRaw,
        {
          name: 'AES-GCM',
        },
        true, // extractable - needed for re-encrypting group key for members
        ['encrypt', 'decrypt']
      );

      // Cache the group key
      this.groupKeys.set(groupId, groupKey);
      console.log(`🔑 ✅ Decrypted and cached group key for group: ${groupId}`);

      return groupKey;
    } catch (error) {
      console.error(`❌ Failed to decrypt group key for group ${groupId}:`, error);
      throw new Error(`Failed to decrypt group key: ${error.message}`);
    }
  }

  /**
   * Encrypt a message for a group using the group's shared key
   */
  async encryptGroupMessage(plaintext, groupKey) {
    return await this.encryptMessage(plaintext, groupKey);
  }

  /**
   * Decrypt a group message using the group's shared key
   */
  async decryptGroupMessage(encryptedData, groupKey) {
    return await this.decryptMessage(encryptedData, groupKey);
  }

  /**
   * Get cached group key
   */
  getGroupKey(groupId) {
    return this.groupKeys.get(groupId);
  }

  /**
   * Cache a group key
   */
  setGroupKey(groupId, groupKey) {
    this.groupKeys.set(groupId, groupKey);
    console.log(`🔑 Cached group key for group: ${groupId}`);
  }

  /**
   * Clear in-memory cached keys (call on logout)
   * IMPORTANT: This does NOT clear localStorage - keys persist for next login!
   */
  clearKeys() {
    this.sharedKeys.clear();
    this.groupKeys.clear();
    this.keyPair = null;
    console.log('🗑️ In-memory crypto keys cleared (localStorage keys preserved)');
  }

  /**
   * DANGER: Permanently delete keys from localStorage
   * Only call this if user wants to delete their encryption keys!
   */
  deleteKeysFromStorage(userId) {
    localStorage.removeItem(`privateKey_${userId}`);
    localStorage.removeItem(`publicKey_${userId}`);
    console.warn('⚠️ KEYS DELETED FROM STORAGE! Old messages will be unreadable!');
  }

  /**
   * Helper: Convert ArrayBuffer to Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Helper: Convert Base64 to ArrayBuffer
   * Handles base64 strings with whitespace or URL encoding
   */
  base64ToArrayBuffer(base64) {
    if (!base64 || typeof base64 !== 'string') {
        // Log the actual type for debugging
        console.error('Invalid base64 input. Expected string, got:', typeof base64);
        if (typeof base64 === 'object') {
            console.error('Object value:', JSON.stringify(base64));
        }
        throw new Error(`Invalid base64 input: must be a non-empty string. Received ${typeof base64}`);
    }
    
    // Clean the base64 string: remove whitespace and handle URL-safe base64
    let cleaned = base64.trim().replace(/\s/g, '');
    
    // Handle URL-safe base64 (replace - with + and _ with /)
    cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (cleaned.length % 4) {
      cleaned += '=';
    }
    
    // Validate base64 characters before attempting to decode
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleaned)) {
      throw new Error(`Invalid base64 characters in string. First 50 chars: ${cleaned.substring(0, 50)}`);
    }
    
    try {
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      throw new Error(`Invalid base64 encoding: ${error.message}.`);
    }
  }

  /**
   * Save keys to localStorage
   * CRITICAL: This ensures keys persist across logout/login!
   */
  async saveKeys(userId) {
    if (!this.keyPair) {
      console.warn('⚠️ No keys to save');
      return false;
    }

    try {
      console.log(`💾 Saving keys for user: ${userId}`);
      
      // Export private key
      const privateKeyData = await window.crypto.subtle.exportKey(
        'pkcs8',
        this.keyPair.privateKey
      );
      
      // Export public key
      const publicKeyData = await window.crypto.subtle.exportKey(
        'raw',
        this.keyPair.publicKey
      );

      // Save both to localStorage with userId
      const privateKeyBase64 = this.arrayBufferToBase64(privateKeyData);
      const publicKeyBase64 = this.arrayBufferToBase64(publicKeyData);
      
      localStorage.setItem(`privateKey_${userId}`, privateKeyBase64);
      localStorage.setItem(`publicKey_${userId}`, publicKeyBase64);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to save keys:', error);
      return false;
    }
  }

  /**
   * Load keys from localStorage
   * CRITICAL: This restores keys on login!
   */
  async loadKeys(userId) {
    try {
      const privateKeyBase64 = localStorage.getItem(`privateKey_${userId}`);
      const publicKeyBase64 = localStorage.getItem(`publicKey_${userId}`);

      if (!privateKeyBase64 || !publicKeyBase64) {
        return false;
      }

      console.log('📦 Found saved keys in localStorage');

      // Import private key
      const privateKeyData = this.base64ToArrayBuffer(privateKeyBase64);
      const privateKey = await window.crypto.subtle.importKey(
        'pkcs8',
        privateKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        ['deriveKey', 'deriveBits']
      );

      // Import public key
      const publicKeyData = this.base64ToArrayBuffer(publicKeyBase64);
      const publicKey = await window.crypto.subtle.importKey(
        'raw',
        publicKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        []
      );

      this.keyPair = { privateKey, publicKey };
      console.log('✅ Keys loaded and imported successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to load keys:', error);
      return false;
    }
  }
}

// Export singleton instance
const cryptoService = new CryptoService();
export default cryptoService;