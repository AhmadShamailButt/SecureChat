const crypto = require('crypto');

/**
 * Backend Crypto Service for managing ECDH key pairs
 * Handles server-side key generation and storage coordination
 */
class CryptoService {
  /**
   * Generate ECDH key pair on the server (for initial setup/testing)
   * Note: In production E2EE, keys should be generated client-side only
   * This is kept for backward compatibility and testing purposes
   */
  static generateECDHKeyPair() {
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      
      return {
        publicKey: ecdh.getPublicKey('base64'),
        privateKey: ecdh.getPrivateKey('base64')
      };
    } catch (error) {
      console.error('Error generating ECDH key pair:', error);
      throw new Error('Failed to generate ECDH key pair');
    }
  }

  /**
   * Validate that a string is a valid base64-encoded public key
   */
  static isValidPublicKey(publicKeyBase64) {
    try {
      if (!publicKeyBase64 || typeof publicKeyBase64 !== 'string') {
        return false;
      }
      
      // Try to decode the base64 string
      const buffer = Buffer.from(publicKeyBase64, 'base64');
      
      // ECDH public key for prime256v1 should be 65 bytes (uncompressed)
      // or 33 bytes (compressed)
      return buffer.length === 65 || buffer.length === 33;
    } catch (error) {
      return false;
    }
  }

  /**
   * Compute shared secret (for testing purposes only)
   * In production E2EE, this should ONLY happen client-side
   */
  static computeSharedSecret(privateKeyBase64, publicKeyBase64) {
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(privateKeyBase64, 'base64'));
      
      const sharedSecret = ecdh.computeSecret(
        Buffer.from(publicKeyBase64, 'base64')
      );
      
      return sharedSecret.toString('base64');
    } catch (error) {
      console.error('Error computing shared secret:', error);
      throw new Error('Failed to compute shared secret');
    }
  }

  /**
   * Generate a random salt for key derivation
   */
  static generateSalt() {
    return crypto.randomBytes(16).toString('base64');
  }
}

module.exports = CryptoService;
