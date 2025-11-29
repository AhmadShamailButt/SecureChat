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
  }

  /**
   * Check if crypto is initialized
   */
  isInitialized() {
    return this.keyPair !== null && this.keyPair.publicKey !== null;
  }

  /**
   * Initialize crypto service and generate ECDH key pair
   * This should be called when user logs in
   */
  async initialize() {
    try {
      // Generate ECDH key pair using P-256 curve
      this.keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256', // Also known as prime256v1 or secp256r1
        },
        true, // extractable
        ['deriveKey', 'deriveBits']
      );

      console.log('🔐 Crypto initialized: Key pair generated');
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
        console.log(`✅ Using cached shared key for user: ${userId}`);
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

      // Convert from base64 to ArrayBuffer
      const ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);
      const ivBuffer = this.base64ToArrayBuffer(iv);
      const authTagBuffer = this.base64ToArrayBuffer(authTag);

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
    } catch (error) {
      console.error(' Decryption failed:', error);
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
      console.warn(`⚠️ Initial decryption failed for user ${userId}. Clearing cache and retrying.`);
      this.sharedKeys.delete(userId);
      
      try {
        const retryKey = await this.deriveSharedKey(otherUserPublicKey, userId);
        return await this.decryptMessage(encryptedData, retryKey);
      } catch (retryError) {
        console.error(`❌ Retry decryption failed for user ${userId}:`, retryError);
        throw retryError;
      }
    }
  }

  /**
   * Clear in-memory cached keys (call on logout)
   * IMPORTANT: This does NOT clear localStorage - keys persist for next login!
   */
  clearKeys() {
    this.sharedKeys.clear();
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
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
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
      
      // Verify they were saved
      const savedPrivate = localStorage.getItem(`privateKey_${userId}`);
      const savedPublic = localStorage.getItem(`publicKey_${userId}`);
      
      if (savedPrivate && savedPublic) {
        console.log('✅ Keys saved to localStorage successfully');
        console.log(`   - Private key length: ${savedPrivate.length} chars`);
        console.log(`   - Public key length: ${savedPublic.length} chars`);
        return true;
      } else {
        console.error('❌ Keys were not saved to localStorage!');
        return false;
      }
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
      console.log(`🔍 Attempting to load keys for user: ${userId}`);
      
      const privateKeyBase64 = localStorage.getItem(`privateKey_${userId}`);
      const publicKeyBase64 = localStorage.getItem(`publicKey_${userId}`);

      if (!privateKeyBase64 || !publicKeyBase64) {
        console.log('📭 No saved keys found in localStorage');
        console.log(`   - Checked for: privateKey_${userId}`);
        console.log(`   - Checked for: publicKey_${userId}`);
        return false;
      }

      console.log('📦 Found saved keys in localStorage');
      console.log(`   - Private key length: ${privateKeyBase64.length} chars`);
      console.log(`   - Public key length: ${publicKeyBase64.length} chars`);

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
      console.error('   Error details:', error.message);
      return false;
    }
  }
}

// Export singleton instance
const cryptoService = new CryptoService();
export default cryptoService;
