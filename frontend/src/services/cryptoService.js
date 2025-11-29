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
    this.sharedKeys = new Map(); // Map of userId -> derived encryption key
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
    if (!this.keyPair) {
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
  async importPublicKey(publicKeyBase64) {
    try {
      const keyData = this.base64ToArrayBuffer(publicKeyBase64);
      
      const importedKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        []
      );

      return importedKey;
    } catch (error) {
      console.error('Failed to import public key:', error);
      throw error;
    }
  }

  /**
   * Derive a shared AES-GCM key with another user
   * Uses ECDH to compute shared secret, then derives AES key
   */
  async deriveSharedKey(otherUserPublicKeyBase64, userId) {
    if (!this.keyPair) {
      throw new Error('Crypto not initialized');
    }

    // Check if we already have this key cached
    if (this.sharedKeys.has(userId)) {
      return this.sharedKeys.get(userId);
    }

    try {
      // Import the other user's public key
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

      // Derive AES-GCM key from shared secret
      const sharedKey = await window.crypto.subtle.importKey(
        'raw',
        sharedSecret,
        {
          name: 'AES-GCM',
        },
        false, // not extractable for security
        ['encrypt', 'decrypt']
      );

      // Cache the derived key
      this.sharedKeys.set(userId, sharedKey);
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
      throw error;
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
      console.error('Decryption failed:', error);
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
   * Decrypt message from a specific user
   * Convenience method that handles key derivation
   */
  async decryptFromUser(encryptedData, otherUserPublicKey, userId) {
    const sharedKey = await this.deriveSharedKey(otherUserPublicKey, userId);
    return await this.decryptMessage(encryptedData, sharedKey);
  }

  /**
   * Clear cached keys (call on logout)
   */
  clearKeys() {
    this.sharedKeys.clear();
    this.keyPair = null;
    console.log('🔒 Crypto keys cleared');
  }

  /**
   * Utility: ArrayBuffer to Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Utility: Base64 to ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Check if crypto is initialized
   */
  isInitialized() {
    return this.keyPair !== null;
  }

  /**
   * Save private key to localStorage (encrypted with password in production)
   * WARNING: This is simplified. In production, encrypt with user password
   */
  async savePrivateKey(userId) {
    try {
      const exported = await window.crypto.subtle.exportKey(
        'pkcs8',
        this.keyPair.privateKey
      );
      const base64 = this.arrayBufferToBase64(exported);
      localStorage.setItem(`privateKey_${userId}`, base64);
      console.log('🔐 Private key saved to localStorage');
    } catch (error) {
      console.error('Failed to save private key:', error);
    }
  }

  /**
   * Load private key from localStorage
   */
  async loadPrivateKey(userId) {
    try {
      const base64 = localStorage.getItem(`privateKey_${userId}`);
      if (!base64) {
        return false;
      }

      const keyData = this.base64ToArrayBuffer(base64);
      const privateKey = await window.crypto.subtle.importKey(
        'pkcs8',
        keyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        ['deriveKey', 'deriveBits']
      );

      // Also need to reconstruct the public key
      // In production, store this separately or derive from private key
      this.keyPair = { privateKey, publicKey: null };
      console.log('🔐 Private key loaded from localStorage');
      return true;
    } catch (error) {
      console.error('Failed to load private key:', error);
      return false;
    }
  }
}

// Export singleton instance
const cryptoService = new CryptoService();
export default cryptoService;
