import React, { useState } from 'react';
import fileEncryption from '../utils/fileEncryption';
import './FileDownload.css';

const FileDownload = ({ 
  fileMetadata, 
  sharedSecret, 
  onDownloadStart,
  onDownloadComplete,
  onError,
  compact = false 
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const getAuthToken = () => {
    return localStorage.getItem('token') || localStorage.getItem('authToken');
  };

  const handleDownload = async () => {
    if (!fileMetadata || !sharedSecret) {
      const errorMsg = 'File metadata or encryption key not available';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    try {
      setDownloading(true);
      setProgress(5);
      setError(null);

      if (onDownloadStart) {
        onDownloadStart(fileMetadata);
      }

      // Step 1: Get download URL from backend
      const token = getAuthToken();
      const response = await fetch(`/api/files/download/${fileMetadata.fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get download URL');
      }

      const { downloadUrl, metadata } = await response.json();
      setProgress(20);

      // Step 2: Download encrypted file from S3
      const fileResponse = await fetch(downloadUrl);
      
      if (!fileResponse.ok) {
        throw new Error('Failed to download file from storage');
      }

      const encryptedData = await fileResponse.arrayBuffer();
      setProgress(50);

      // Step 3: Parse encryption metadata
      let encryptedKeyData, keyIv, iv;
      try {
        const parsedKeyData = JSON.parse(metadata.encryptedFileKey);
        encryptedKeyData = parsedKeyData.key;
        keyIv = parsedKeyData.iv;
        iv = JSON.parse(metadata.iv);
      } catch (parseError) {
        throw new Error('Invalid encryption metadata format');
      }
      setProgress(60);

      // Step 4: Decrypt file key using shared secret
      const fileKey = await fileEncryption.decryptFileKey(
        encryptedKeyData, 
        keyIv, 
        sharedSecret
      );
      setProgress(70);

      // Step 5: Decrypt file content
      const decryptedData = await fileEncryption.decryptFile(
        encryptedData, 
        fileKey, 
        iv
      );
      setProgress(85);

      // Step 6: Verify file integrity
      const calculatedHash = await fileEncryption.calculateFileHash(encryptedData);
      if (calculatedHash !== metadata.fileHash) {
        throw new Error('File integrity verification failed');
      }
      setProgress(95);

      // Step 7: Create download link and trigger download
      const blob = new Blob([decryptedData], { type: metadata.mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.fileName;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up the URL object
      URL.revokeObjectURL(url);
      
      setProgress(100);
      
      if (onDownloadComplete) {
        onDownloadComplete(fileMetadata);
      }

      // Reset progress after a short delay
      setTimeout(() => setProgress(0), 1500);
      
    } catch (error) {
      console.error('Download error:', error);
      setError(error.message);
      if (onError) onError(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const getFileIcon = (mimeType) => {
    const category = fileEncryption.getFileCategory(mimeType);
    const icons = {
      image: '🖼️',
      video: '🎥',
      pdf: '📄',
      document: '📝',
      spreadsheet: '📊',
      archive: '🗜️',
      text: '📄',
      unknown: '📎'
    };
    return icons[category] || icons.unknown;
  };

  const formatFileSize = (bytes) => {
    return fileEncryption.formatFileSize(bytes);
  };

  const getFileName = () => {
    return fileMetadata.fileName || 'Unknown File';
  };

  const getFileSize = () => {
    return fileMetadata.fileSize ? formatFileSize(fileMetadata.fileSize) : 'Unknown Size';
  };

  if (compact) {
    return (
      <div className="file-download compact">
        <div className="file-info">
          <span className="file-icon">{getFileIcon(fileMetadata.mimeType)}</span>
          <div className="file-details">
            <span className="file-name" title={getFileName()}>
              {getFileName()}
            </span>
            <span className="file-size">{getFileSize()}</span>
          </div>
        </div>
        
        <button 
          onClick={handleDownload} 
          disabled={downloading}
          className="download-btn compact"
          title="Download file"
        >
          {downloading ? '⏳' : '⬇️'}
        </button>

        {downloading && progress > 0 && (
          <div className="download-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="download-error">
            <span title={error}>⚠️</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="file-download">
      <div className="file-preview">
        <div className="file-icon-large">{getFileIcon(fileMetadata.mimeType)}</div>
        
        <div className="file-info">
          <div className="file-name" title={getFileName()}>
            {getFileName()}
          </div>
          <div className="file-size">{getFileSize()}</div>
          
          {fileMetadata.uploadedAt && (
            <div className="file-date">
              {new Date(fileMetadata.uploadedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      
      <div className="download-section">
        <button 
          onClick={handleDownload} 
          disabled={downloading}
          className="download-btn"
        >
          {downloading ? `Downloading... ${progress}%` : 'Download File'}
        </button>

        {downloading && (
          <div className="download-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="progress-text">{progress}%</div>
          </div>
        )}

        {error && (
          <div className="download-error">
            <span className="error-icon">⚠️</span>
            <span className="error-message">{error}</span>
            <button 
              onClick={() => setError(null)} 
              className="error-close"
              aria-label="Close error"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileDownload;