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
      // Validate encryptedData structure
      if (!encryptedData || typeof encryptedData !== 'object') {
        throw new Error('Invalid encryptedData: must be an object');
      }

      // Handle case where encryptedData might be a string (JSON) - parse it
      let data = encryptedData;
      if (typeof encryptedData === 'string') {
        try {
          data = JSON.parse(encryptedData);
        } catch (parseErr) {
          throw new Error('Invalid encryptedData format: cannot parse as JSON');
        }
      }

      const { ciphertext, iv, authTag } = data;

      // Validate required fields
      if (!ciphertext || !iv || !authTag) {
        console.error('[DECRYPT] Missing required fields:', {
          hasCiphertext: !!ciphertext,
          hasIv: !!iv,
          hasAuthTag: !!authTag,
          dataKeys: Object.keys(data)
        });
        throw new Error('Missing required encryption fields (ciphertext, iv, or authTag)');
      }

      // Validate that fields are strings
      if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof authTag !== 'string') {
        console.error('[DECRYPT] Invalid field types:', {
          ciphertextType: typeof ciphertext,
          ivType: typeof iv,
          authTagType: typeof authTag
        });
        throw new Error('Encryption fields must be strings (base64)');
      }

      // Early validation: Check minimum lengths before attempting base64 decode
      // This provides better error messages and avoids unnecessary processing
      const ciphertextTrimmed = ciphertext.trim();
      const ivTrimmed = iv.trim();
      const authTagTrimmed = authTag.trim();
      
      // Expected minimum lengths:
      // - IV: 12 bytes = 16 base64 characters (minimum)
      // - AuthTag: 16 bytes = 24 base64 characters (with padding)
      // - Ciphertext: variable, but should be at least 4 characters
      if (ciphertextTrimmed.length < 4) {
        throw new Error(`Ciphertext too short: ${ciphertextTrimmed.length} characters (minimum 4 required). Message may be corrupted.`);
      }
      if (ivTrimmed.length < 16) {
        throw new Error(`IV too short: ${ivTrimmed.length} characters (expected ~16 for 12 bytes). Data may be corrupted.`);
      }
      if (authTagTrimmed.length < 20) {
        throw new Error(`Auth tag too short: ${authTagTrimmed.length} characters (expected ~24 for 16 bytes). Data may be corrupted.`);
      }

      // Validate base64 format and decode with separate error handling
      let ciphertextBuffer, ivBuffer, authTagBuffer;
      
      try {
        ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);
        ivBuffer = this.base64ToArrayBuffer(iv);
        authTagBuffer = this.base64ToArrayBuffer(authTag);
      } catch (base64Error) {
        // This is a base64 decoding error
        const errorContext = {
          message: base64Error.message,
          name: base64Error.name,
          ciphertextLength: ciphertext?.length || 0,
          ivLength: iv?.length || 0,
          authTagLength: authTag?.length || 0,
          ciphertextTrimmedLength: ciphertextTrimmed?.length || 0,
          ivTrimmedLength: ivTrimmed?.length || 0,
          authTagTrimmedLength: authTagTrimmed?.length || 0,
          ciphertextPreview: ciphertext ? (ciphertext.substring(0, 30) + (ciphertext.length > 30 ? '...' : '')) : 'null',
          ivPreview: iv ? (iv.substring(0, 30) + (iv.length > 30 ? '...' : '')) : 'null',
          authTagPreview: authTag ? (authTag.substring(0, 30) + (authTag.length > 30 ? '...' : '')) : 'null',
          errorType: 'base64_decode_error'
        };
        
        console.error('[DECRYPT] Base64 decoding error:', errorContext);
        
        // Format/validation errors - provide specific message
        if (base64Error.message && (
          base64Error.message.includes('Invalid') || 
          base64Error.message.includes('Missing') ||
          base64Error.message.includes('too short') ||
          base64Error.message.includes('corrupted')
        )) {
          throw new Error(`Invalid encrypted data format: ${base64Error.message}`);
        }
        
        // Generic base64 decoding error
        throw new Error(`Invalid base64 encoding in encrypted data: ${base64Error.message || base64Error.name || 'Unknown error'}`);
      }

      // Validate decoded buffer lengths
      if (ivBuffer.byteLength !== 12) {
        throw new Error(`Invalid IV length: expected 12 bytes, got ${ivBuffer.byteLength}`);
      }

      if (authTagBuffer.byteLength !== 16) {
        throw new Error(`Invalid auth tag length: expected 16 bytes, got ${authTagBuffer.byteLength}`);
      }

      // Concatenate ciphertext and auth tag (required by Web Crypto API)
      const combinedBuffer = new Uint8Array(
        ciphertextBuffer.byteLength + authTagBuffer.byteLength
      );
      combinedBuffer.set(new Uint8Array(ciphertextBuffer), 0);
      combinedBuffer.set(new Uint8Array(authTagBuffer), ciphertextBuffer.byteLength);

      // Decrypt using AES-GCM with separate error handling
      try {
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
      } catch (decryptError) {
        // This is a decryption error from Web Crypto API
        // OperationError typically means: wrong key, corrupted data, or auth tag mismatch
        const errorContext = {
          message: decryptError.message || '',
          name: decryptError.name || 'UnknownError',
          ciphertextLength: ciphertext?.length || 0,
          ivLength: iv?.length || 0,
          authTagLength: authTag?.length || 0,
          ciphertextBufferLength: ciphertextBuffer?.byteLength || 0,
          ivBufferLength: ivBuffer?.byteLength || 0,
          authTagBufferLength: authTagBuffer?.byteLength || 0,
          errorType: decryptError.name === 'OperationError' ? 'decryption_failed' : 'unknown'
        };
        
        console.error('[DECRYPT] Decryption operation failed:', errorContext);
        
        // OperationError from Web Crypto API means decryption failed
        // This could be due to: wrong key, corrupted ciphertext, or authentication failure
        if (decryptError.name === 'OperationError') {
          throw new Error('Decryption failed: Wrong key, corrupted data, or authentication failure. Message may be encrypted with a different key.');
        }
        
        // Other decryption errors
        throw new Error(`Decryption failed: ${decryptError.message || decryptError.name || 'Unknown error'}`);
      }
    } catch (error) {
      // Provide more specific error messages based on error type
      const errorType = error.name === 'OperationError' || error.message?.includes('decrypt') 
        ? 'decryption_failed'
        : error.message?.includes('Invalid') || error.message?.includes('corrupted') || error.message?.includes('too short')
        ? 'invalid_format'
        : 'unknown';
      
      if (errorType === 'decryption_failed') {
        // This is likely a key mismatch or corrupted data
        console.error('[DECRYPT] Decryption failed (likely key mismatch or corrupted data):', {
          errorName: error.name,
          errorMessage: error.message,
          errorType: 'decryption_failed'
        });
        throw new Error('Failed to decrypt message. Message may be corrupted or encrypted with a different key.');
      } else if (errorType === 'invalid_format') {
        // Format/validation error - already has a good message
        console.error('[DECRYPT] Decryption failed (invalid format):', {
          errorMessage: error.message,
          errorType: 'invalid_format'
        });
        throw error; // Re-throw with original message
      } else {
        // Unknown error
        console.error('[DECRYPT] Decryption failed (unknown error):', {
          errorName: error.name,
          errorMessage: error.message,
          errorType: 'unknown'
        });
        throw new Error(`Failed to decrypt message: ${error.message || error.name || 'Unknown error'}`);
      }
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
   * Includes graceful degradation for invalid/corrupted data
   */
  async decryptFromUser(encryptedData, otherUserPublicKey, userId) {
    // Early validation: Check if encryptedData is clearly invalid before attempting decryption
    // This prevents unnecessary key derivation and retries for corrupted data
    if (!encryptedData || typeof encryptedData !== 'object') {
      throw new Error('Invalid encrypted data: must be an object with ciphertext, iv, and authTag');
    }
    
    // Handle string input (JSON)
    let data = encryptedData;
    if (typeof encryptedData === 'string') {
      try {
        data = JSON.parse(encryptedData);
      } catch (parseErr) {
        throw new Error('Invalid encrypted data format: cannot parse as JSON');
      }
    }
    
    // Quick validation: Check if required fields exist and are non-empty strings
    const { ciphertext, iv, authTag } = data;
    const isFormatError = !ciphertext || !iv || !authTag ||
                         typeof ciphertext !== 'string' || 
                         typeof iv !== 'string' || 
                         typeof authTag !== 'string' ||
                         ciphertext.trim().length < 4 ||
                         iv.trim().length < 16 ||
                         authTag.trim().length < 20;
    
    if (isFormatError) {
      // Clearly invalid format - don't attempt decryption
      console.warn(`⚠️ Skipping decryption for user ${userId}: Invalid data format`, {
        hasCiphertext: !!ciphertext,
        hasIv: !!iv,
        hasAuthTag: !!authTag,
        ciphertextLength: ciphertext?.length || 0,
        ivLength: iv?.length || 0,
        authTagLength: authTag?.length || 0
      });
      throw new Error('Invalid encrypted data format: missing or invalid fields. Message may be corrupted.');
    }
    
    try {
      const sharedKey = await this.deriveSharedKey(otherUserPublicKey, userId);
      return await this.decryptMessage(encryptedData, sharedKey);
    } catch (error) {
      // Determine if this is a format/validation error (don't retry) or a decryption error (retry once)
      const isFormatError = error.message && (
        error.message.includes('Invalid') || 
        error.message.includes('Missing') ||
        error.message.includes('too short') ||
        error.message.includes('corrupted') ||
        error.message.includes('format')
      );
      
      if (isFormatError) {
        // Format/validation error - don't retry, data is clearly invalid
        console.warn(`⚠️ Skipping retry for user ${userId}: Invalid data format detected`);
        throw error;
      }
      
      // If decryption fails, clear cache and retry ONCE
      // This handles cases where the key might have changed or cache is stale
      console.warn(`⚠️ Initial decryption failed for user ${userId}. Clearing cache and retrying.`);
      this.sharedKeys.delete(userId);
      
      try {
        const retryKey = await this.deriveSharedKey(otherUserPublicKey, userId);
        return await this.decryptMessage(encryptedData, retryKey);
      } catch (retryError) {
        // Check if retry also failed due to format error
        const retryIsFormatError = retryError.message && (
          retryError.message.includes('Invalid') || 
          retryError.message.includes('Missing') ||
          retryError.message.includes('too short') ||
          retryError.message.includes('corrupted') ||
          retryError.message.includes('format')
        );
        
        if (retryIsFormatError) {
          // Format error on retry - data is definitely invalid
          throw retryError;
        }
        
        // Decryption error on retry - likely an old message with different keys
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
   * Helper: Validate base64 string format
   * Enhanced validation with length checks and character validation
   */
  isValidBase64(str) {
    if (!str || typeof str !== 'string') return false;
    
    // Check for empty string
    if (str.trim().length === 0) return false;
    
    // Base64 should only contain A-Z, a-z, 0-9, +, /, =, and whitespace
    // Also allow URL-safe base64 characters (- and _)
    const base64Regex = /^[A-Za-z0-9+/=\s\-_]*$/;
    if (!base64Regex.test(str)) return false;
    
    // After removing whitespace, check minimum length
    // Even a single byte needs at least 4 base64 characters (with padding)
    const withoutWhitespace = str.replace(/\s+/g, '');
    if (withoutWhitespace.length < 4) return false;
    
    return true;
  }

  /**
   * Helper: Normalize base64 string (remove whitespace, handle URL encoding)
   * Enhanced with better edge case handling and length validation
   */
  normalizeBase64(base64) {
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid base64 input: must be a non-empty string');
    }
    
    // Check for empty or whitespace-only strings
    const trimmed = base64.trim();
    if (trimmed.length === 0) {
      throw new Error('Invalid base64 input: string is empty or contains only whitespace');
    }
    
    // Check if it's a valid base64 string first
    if (!this.isValidBase64(base64)) {
      console.error('[BASE64] Invalid base64 characters detected:', {
        length: base64.length,
        preview: base64.substring(0, 50),
        hasInvalidChars: !/^[A-Za-z0-9+/=\s\-_]*$/.test(base64),
        isEmpty: trimmed.length === 0
      });
      throw new Error('Invalid base64 characters detected');
    }
    
    // Remove whitespace (spaces, newlines, tabs)
    let normalized = base64.replace(/\s+/g, '');
    
    // Validate minimum length after whitespace removal
    // Minimum 4 characters needed for even a single byte of data
    if (normalized.length < 4) {
      throw new Error(`Invalid base64 length: ${normalized.length} characters (minimum 4 required)`);
    }
    
    // Handle URL-safe base64 encoding (replace - with + and _ with /)
    normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed (base64 strings should be multiples of 4)
    // But don't add more than 3 padding characters (max padding is ===)
    const paddingNeeded = (4 - (normalized.length % 4)) % 4;
    if (paddingNeeded > 0 && paddingNeeded <= 3) {
      normalized += '='.repeat(paddingNeeded);
    }
    
    // Final validation: check that normalized string is valid base64
    // Remove padding temporarily to check base characters
    const baseChars = normalized.replace(/=+$/, '');
    if (baseChars.length === 0) {
      throw new Error('Invalid base64: only padding characters found');
    }
    
    return normalized;
  }

  /**
   * Helper: Convert Base64 to ArrayBuffer
   * Enhanced with minimum length checks and better error detection
   */
  base64ToArrayBuffer(base64) {
    try {
      // Validate input type
      if (!base64 || typeof base64 !== 'string') {
        throw new Error('Base64 input must be a non-empty string');
      }
      
      // Early length check - base64 strings should be at least 4 characters
      // This catches obviously corrupted/truncated data before attempting decode
      const trimmed = base64.trim();
      if (trimmed.length < 4) {
        throw new Error(`Base64 string too short: ${trimmed.length} characters (minimum 4 required). Data may be corrupted or truncated.`);
      }
      
      // Normalize the base64 string first (this will also validate)
      const normalized = this.normalizeBase64(base64);
      
      // Additional validation: check normalized length
      if (normalized.length < 4) {
        throw new Error(`Normalized base64 string too short: ${normalized.length} characters`);
      }
      
      // Try to decode with better error handling
      let binary;
      try {
        binary = atob(normalized);
      } catch (atobError) {
        // atob throws DOMException with InvalidCharacterError for invalid base64
        const errorType = atobError.name === 'InvalidCharacterError' || atobError.name === 'DOMException'
          ? 'Invalid base64 characters'
          : 'Base64 decoding failed';
        throw new Error(`${errorType}: ${atobError.message || atobError.name || 'Unknown error'}`);
      }
      
      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      return bytes.buffer;
    } catch (error) {
      // Capture all error details for debugging
      const errorDetails = {
        message: error.message || 'No message',
        name: error.name || 'UnknownError',
        stack: error.stack || 'No stack',
        base64Length: base64?.length || 0,
        base64TrimmedLength: base64 ? base64.trim().length : 0,
        base64Preview: base64 ? (base64.substring(0, 50) + (base64.length > 50 ? '...' : '')) : 'null',
        base64LastChars: base64 ? base64.substring(Math.max(0, base64.length - 20)) : 'null',
        base64FirstChars: base64 ? base64.substring(0, 20) : 'null',
        isTooShort: base64 ? base64.trim().length < 4 : true
      };
      
      console.error('[BASE64] Failed to decode base64:', errorDetails);
      
      // Provide a more descriptive error message based on error type
      let errorMsg = 'Invalid base64 encoding';
      if (error.message) {
        // Use the error message if it's already descriptive
        if (error.message.includes('too short') || error.message.includes('minimum')) {
          errorMsg = error.message;
        } else if (error.message.includes('Invalid base64 characters') || error.message.includes('corrupted')) {
          errorMsg = error.message;
        } else {
          errorMsg = `Invalid base64 encoding: ${error.message}`;
        }
      } else if (error.name === 'InvalidCharacterError' || error.name === 'DOMException') {
        errorMsg = 'Invalid base64 characters detected - data may be corrupted during transmission';
      } else if (error.name) {
        errorMsg = `Base64 decoding error: ${error.name}`;
      }
      
      throw new Error(errorMsg);
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
