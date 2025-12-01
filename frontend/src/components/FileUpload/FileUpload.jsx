import React, { useState, useRef } from 'react';
import fileEncryption from '../../utils/fileEncryption';
import { useSocket } from '../../contexts/SocketContext';

const FileUpload = ({ recipientId, conversationId, onUploadComplete, onCancel, className = "" }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  
  const token = sessionStorage.getItem('token');
  const { socket } = useSocket();

  const handleFileSelect = async (file) => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Step 1: Validate file
      setProgress(10);
      const validation = await fileEncryption.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Step 2: Generate file encryption key
      setProgress(20);
      const fileKey = await fileEncryption.generateFileKey();

      // Step 3: Encrypt the file
      setProgress(40);
      const { encryptedData, iv } = await fileEncryption.encryptFile(file, fileKey);

      // Step 4: Calculate hash for integrity
      setProgress(60);
      const fileHash = await fileEncryption.calculateFileHash(encryptedData);

      // Step 5: Export key for secure transmission
      setProgress(70);
      const exportedKey = await fileEncryption.exportKey(fileKey);

      // Step 6: Validate required fields before request
      setProgress(80);
      console.log('Upload request data:', {
        fileName: file.name,
        fileSize: encryptedData.byteLength,
        mimeType: file.type,
        recipientId,
        conversationId,
        token: token ? 'present' : 'missing'
      });

      if (!recipientId || !conversationId) {
        throw new Error(`Missing recipient or conversation ID: recipientId=${recipientId}, conversationId=${conversationId}`);
      }

      // Request upload URL from backend
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const uploadRequest = await fetch(`${apiUrl}/api/files/upload/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: encryptedData.byteLength,
          mimeType: file.type,
          receiverId: recipientId,
          conversationId,
          encryptedFileKey: JSON.stringify(exportedKey),
          iv: JSON.stringify(Array.from(iv)),
          fileHash
        })
      });

      if (!uploadRequest.ok) {
        const errorData = await uploadRequest.json();
        throw new Error(errorData.error || 'Failed to request upload URL');
      }

      const { fileId, uploadUrl } = await uploadRequest.json();

      // Step 7: Upload encrypted file to S3
      setProgress(90);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: encryptedData,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 8: Notify backend that upload is complete
      setProgress(95);
      const completeResponse = await fetch(`${apiUrl}/api/files/upload/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId })
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to complete upload');
      }

      const { file: uploadedFile } = await completeResponse.json();

      setProgress(100);

      // Step 9: Return file data for message creation
      const fileData = {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: uploadedFile.downloadUrl,
        fileHash,
        encryptionKey: exportedKey,
        encryptionIv: Array.from(iv),
        timestamp: new Date().toISOString()
      };

      // Notify parent component with file data
      if (onUploadComplete) {
        onUploadComplete(fileData);
      }

      // Reset state
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('File upload error:', error);
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (event) => {
    const file = event.target.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setDragOver(false);
  };

  if (uploading) {
    return (
      <div className={`file-upload-progress ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Uploading File</h4>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
        <div className="progress-bar w-full bg-muted rounded-full h-2">
          <div 
            className="progress-fill bg-primary h-2 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {progress < 20 ? 'Encrypting file...' :
           progress < 80 ? 'Uploading to secure storage...' :
           progress < 95 ? 'Finalizing upload...' :
           'Almost done!'}
        </p>
      </div>
    );
  }

  return (
    <div className={`file-upload-container ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Attach File</h4>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>
      
      <div 
        className={`file-upload-zone ${dragOver ? 'drag-over' : ''} border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary transition-colors`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-icon text-2xl mb-2">📎</div>
        <span className="upload-text text-sm text-muted-foreground">Click or drag to attach file</span>
        <p className="text-xs text-muted-foreground mt-1">Max 100MB • Images, videos, documents</p>
        
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleInputChange}
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div className="upload-error mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
          <span>❌ {error}</span>
        </div>
      )}
    </div>
  );
};

export default FileUpload;