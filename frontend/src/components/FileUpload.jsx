import React, { useState, useRef } from 'react';
import fileEncryption from '../utils/fileEncryption';
import './FileUpload.css';

const FileUpload = ({ 
  conversationId, 
  receiverId, 
  sharedSecret, 
  onUploadComplete, 
  onError,
  disabled = false 
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const resetState = () => {
    setSelectedFile(null);
    setProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (file) => {
    setError(null);
    
    if (!file) return;

    // Validate file
    const validation = await fileEncryption.validateFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setSelectedFile(file);
  };

  const handleInputChange = (event) => {
    const file = event.target.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const getAuthToken = () => {
    return localStorage.getItem('token') || localStorage.getItem('authToken');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }

    if (!sharedSecret) {
      setError('Encryption not ready. Please ensure the chat connection is established.');
      return;
    }

    try {
      setUploading(true);
      setProgress(5);
      setError(null);

      // Step 1: Generate file encryption key
      const fileKey = await fileEncryption.generateFileKey();
      setProgress(15);

      // Step 2: Encrypt file
      const { encryptedData, iv } = await fileEncryption.encryptFile(selectedFile, fileKey);
      setProgress(35);

      // Step 3: Calculate hash of encrypted file
      const fileHash = await fileEncryption.calculateFileHash(encryptedData);
      setProgress(45);

      // Step 4: Encrypt file key with shared secret
      const { encryptedKey, iv: keyIv } = await fileEncryption.encryptFileKeyForRecipient(
        fileKey,
        sharedSecret
      );
      setProgress(55);

      // Step 5: Request pre-signed URL from backend
      const token = getAuthToken();
      const uploadRequest = await fetch('/api/files/upload/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: encryptedData.byteLength,
          mimeType: selectedFile.type,
          receiverId,
          conversationId,
          encryptedFileKey: JSON.stringify({ key: encryptedKey, iv: keyIv }),
          iv: JSON.stringify(iv),
          fileHash
        })
      });

      if (!uploadRequest.ok) {
        const errorData = await uploadRequest.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, fileId } = await uploadRequest.json();
      setProgress(65);

      // Step 6: Upload encrypted file to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: encryptedData,
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }
      setProgress(85);

      // Step 7: Confirm upload completion
      const completeRequest = await fetch('/api/files/upload/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId })
      });

      if (!completeRequest.ok) {
        const errorData = await completeRequest.json();
        throw new Error(errorData.error || 'Failed to complete upload');
      }

      setProgress(100);

      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete({
          fileId,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type,
          type: 'file'
        });
      }

      // Reset state
      resetState();
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message);
      if (onError) {
        onError(error.message);
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    resetState();
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

  return (
    <div className="file-upload">
      {!selectedFile ? (
        <div 
          className={`file-upload-zone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <div className="upload-icon">📎</div>
          <p>Click to select or drag & drop a file</p>
          <small>
            Supported: Images, Videos, Documents, Archives (Max 100MB)
          </small>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleInputChange}
            disabled={disabled}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className="file-selected">
          <div className="file-info">
            <div className="file-icon">{getFileIcon(selectedFile.type)}</div>
            <div className="file-details">
              <div className="file-name" title={selectedFile.name}>
                {selectedFile.name}
              </div>
              <div className="file-size">
                {fileEncryption.formatFileSize(selectedFile.size)}
              </div>
            </div>
          </div>
          
          <div className="file-actions">
            <button 
              onClick={handleUpload} 
              disabled={uploading || disabled}
              className="upload-btn"
            >
              {uploading ? 'Uploading...' : 'Send File'}
            </button>
            <button 
              onClick={handleCancel} 
              disabled={uploading}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="upload-progress">
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
        <div className="upload-error">
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
  );
};

export default FileUpload;