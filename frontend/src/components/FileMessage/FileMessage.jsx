import React, { useState } from 'react';
import fileEncryption from '../../utils/fileEncryption';
import './FileMessage.css';

const FileMessage = ({ message, isOwn, sharedSecret }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  
  const token = sessionStorage.getItem('token');

  // Safety check for message object
  if (!message) {
    return <div className="file-error">❌ Invalid message data - no message object</div>;
  }
  
  if (!message.fileName) {
    return <div className="file-error">❌ Invalid file data</div>;
  }

  const getFileIcon = (mimeType) => {
    const type = mimeType || '';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('sheet')) return '📊';
    if (type.includes('zip') || type.includes('rar')) return '🗜️';
    return '📎';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = async () => {
    if (!sharedSecret || !message.fileId) return;

    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // Step 1: Get download URL from backend
      setDownloadProgress(20);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/files/download/${message.fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get download URL');
      }

      const { downloadUrl, metadata } = await response.json();

      // Step 2: Download encrypted file
      setDownloadProgress(40);
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) {
        throw new Error('Failed to download file');
      }
      
      const encryptedData = await fileResponse.arrayBuffer();

      // Step 3: Use the encryption key directly from the message
      setDownloadProgress(60);
      
      // Check if we have the encryption key in the message (newer approach)
      let fileKey;
      if (message.encryptionKey) {
        // Use the encryption key stored in the message
        fileKey = await fileEncryption.importKey(message.encryptionKey);
      } else {
        // Fallback to decrypting with shared secret (for compatibility)
        const encryptedKeyData = JSON.parse(metadata.encryptedFileKey);
        const iv = JSON.parse(metadata.iv);
        
        // Convert sharedSecret to proper CryptoKey if it's a string
        let sharedKey;
        if (typeof sharedSecret === 'string') {
          // For default/temporary shared secret, create a key from the string
          const encoder = new TextEncoder();
          const keyMaterial = encoder.encode(sharedSecret.padEnd(32, '0').substring(0, 32));
          sharedKey = await window.crypto.subtle.importKey(
            'raw',
            keyMaterial,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
          );
        } else {
          sharedKey = sharedSecret;
        }
        
        fileKey = await fileEncryption.decryptFileKey(
          encryptedKeyData, 
          iv,
          sharedKey
        );
      }

      // Step 4: Decrypt file
      setDownloadProgress(80);
      
      // Use IV from message if available, otherwise from metadata
      const fileIv = message.encryptionIv || JSON.parse(metadata.iv);
      
      const decryptedData = await fileEncryption.decryptFile(
        encryptedData, 
        fileKey, 
        fileIv
      );

      // Step 5: Verify integrity
      const calculatedHash = await fileEncryption.calculateFileHash(encryptedData);
      if (calculatedHash !== metadata.fileHash) {
        throw new Error('File integrity verification failed');
      }

      setDownloadProgress(100);

      // Step 6: Trigger download
      const blob = new Blob([decryptedData], { type: metadata.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      setError(error.message);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className={`file-message ${isOwn ? 'own' : 'other'}`}>
      <div className="file-info">
        <div className="file-icon">{getFileIcon(message.mimeType || message.fileType || '')}</div>
        <div className="file-details">
          <div className="file-name" title={message.fileName || 'Unknown file'}>
            {message.fileName || 'Unknown file'}
          </div>
          <div className="file-size">
            {formatFileSize(message.fileSize || 0)}
          </div>
        </div>
        
        <button 
          className="download-btn"
          onClick={handleDownload}
          disabled={downloading || !sharedSecret}
          title={!sharedSecret ? 'Encryption not ready' : 'Download file'}
        >
          {downloading ? `${downloadProgress}%` : '⬇️'}
        </button>
      </div>

      {downloading && (
        <div className="download-progress">
          <div 
            className="progress-fill" 
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="file-error">
          ❌ {error}
        </div>
      )}
    </div>
  );
};

export default FileMessage;