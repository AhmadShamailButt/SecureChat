class FileEncryption {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12; // 96 bits for AES-GCM
  }

  /**
   * Generate a random symmetric key for file encryption
   * @returns {Promise<CryptoKey>} AES-GCM key
   */
  async generateFileKey() {
    try {
      return await window.crypto.subtle.generateKey(
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('Error generating file key:', error);
      throw new Error('Failed to generate encryption key');
    }
  }

  /**
   * Encrypt file with AES-GCM
   * @param {File} file - File to encrypt
   * @param {CryptoKey} key - Encryption key
   * @returns {Promise<{encryptedData: ArrayBuffer, iv: Array}>} Encrypted data and IV
   */
  async encryptFile(file, key) {
    try {
      const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength));
      const fileBuffer = await file.arrayBuffer();

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        fileBuffer
      );

      return {
        encryptedData: encryptedBuffer,
        iv: Array.from(iv)
      };
    } catch (error) {
      console.error('Error encrypting file:', error);
      throw new Error('Failed to encrypt file');
    }
  }

  /**
   * Decrypt file with AES-GCM
   * @param {ArrayBuffer} encryptedData - Encrypted file data
   * @param {CryptoKey} key - Decryption key
   * @param {Array} iv - Initialization vector
   * @returns {Promise<ArrayBuffer>} Decrypted file data
   */
  async decryptFile(encryptedData, key, iv) {
    try {
      const ivArray = new Uint8Array(iv);
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: ivArray
        },
        key,
        encryptedData
      );

      return decryptedBuffer;
    } catch (error) {
      console.error('Error decrypting file:', error);
      throw new Error('Failed to decrypt file');
    }
  }

  /**
   * Export CryptoKey to raw byte array
   * @param {CryptoKey} key - Key to export
   * @returns {Promise<Array>} Key as byte array
   */
  async exportKey(key) {
    try {
      const exported = await window.crypto.subtle.exportKey('raw', key);
      return Array.from(new Uint8Array(exported));
    } catch (error) {
      console.error('Error exporting key:', error);
      throw new Error('Failed to export key');
    }
  }

  /**
   * Import raw byte array to CryptoKey
   * @param {Array} keyData - Key as byte array
   * @returns {Promise<CryptoKey>} Imported CryptoKey
   */
  async importKey(keyData) {
    try {
      const keyArray = new Uint8Array(keyData);
      return await window.crypto.subtle.importKey(
        'raw',
        keyArray,
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('Error importing key:', error);
      throw new Error('Failed to import key');
    }
  }

  /**
   * Calculate SHA-256 hash of file buffer
   * @param {ArrayBuffer} fileBuffer - File data
   * @returns {Promise<string>} Hex string hash
   */
  async calculateFileHash(fileBuffer) {
    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Error calculating file hash:', error);
      throw new Error('Failed to calculate file hash');
    }
  }

  /**
   * Encrypt file key with shared secret from ECDH
   * @param {CryptoKey} fileKey - File encryption key
   * @param {CryptoKey} sharedSecret - Shared secret from ECDH
   * @returns {Promise<{encryptedKey: Array, iv: Array}>} Encrypted key and IV
   */
  async encryptFileKeyForRecipient(fileKey, sharedSecret) {
    try {
      const exportedKey = await this.exportKey(fileKey);
      const keyBuffer = new Uint8Array(exportedKey);
      const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength));

      const encryptedKey = await window.crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        sharedSecret,
        keyBuffer
      );

      return {
        encryptedKey: Array.from(new Uint8Array(encryptedKey)),
        iv: Array.from(iv)
      };
    } catch (error) {
      console.error('Error encrypting file key for recipient:', error);
      throw new Error('Failed to encrypt file key for recipient');
    }
  }

  /**
   * Decrypt file key using shared secret
   * @param {Array} encryptedKeyData - Encrypted key data
   * @param {Array} iv - Initialization vector
   * @param {CryptoKey} sharedSecret - Shared secret from ECDH
   * @returns {Promise<CryptoKey>} Decrypted file key
   */
  async decryptFileKey(encryptedKeyData, iv, sharedSecret) {
    try {
      const encryptedKeyArray = new Uint8Array(encryptedKeyData);
      const ivArray = new Uint8Array(iv);

      const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: ivArray
        },
        sharedSecret,
        encryptedKeyArray
      );

      return await this.importKey(Array.from(new Uint8Array(decryptedKeyBuffer)));
    } catch (error) {
      console.error('Error decrypting file key:', error);
      throw new Error('Failed to decrypt file key');
    }
  }

  /**
   * Validate file type against allowed types
   * @param {string} mimeType - File MIME type
   * @returns {boolean} Is valid file type
   */
  isValidFileType(mimeType) {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/webm', 'video/quicktime', 'video/avi',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed'
    ];

    return allowedTypes.includes(mimeType);
  }

  /**
   * Get file type category
   * @param {string} mimeType - File MIME type
   * @returns {string} File category
   */
  getFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    if (mimeType.includes('text')) return 'text';
    return 'unknown';
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate file before upload
   * @param {File} file - File to validate
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   */
  async validateFile(file) {
    const maxSize = 100 * 1024 * 1024; // 100MB
    
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    if (file.size > maxSize) {
      return { 
        valid: false, 
        error: `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(maxSize)})` 
      };
    }

    if (!this.isValidFileType(file.type)) {
      return { 
        valid: false, 
        error: 'File type not supported. Supported types: images, videos, documents, archives' 
      };
    }

    return { valid: true };
  }
}

// Export singleton instance
export default new FileEncryption();