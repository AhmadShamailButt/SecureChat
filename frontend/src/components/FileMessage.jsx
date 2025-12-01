import React from 'react';
import FileDownload from './FileDownload';
import './FileMessage.css';

const FileMessage = ({ 
  message, 
  isSent, 
  sharedSecret,
  onDownloadStart,
  onDownloadComplete,
  onError,
  timestamp 
}) => {
  const { fileMetadata, senderId, senderName } = message;

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffHours < 168) { // Less than a week
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  return (
    <div className={`file-message ${isSent ? 'sent' : 'received'}`}>
      <div className="message-header">
        {!isSent && senderName && (
          <div className="sender-name">{senderName}</div>
        )}
        {timestamp && (
          <div className="message-timestamp">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </div>
      
      <div className="message-content">
        <FileDownload
          fileMetadata={fileMetadata}
          sharedSecret={sharedSecret}
          onDownloadStart={onDownloadStart}
          onDownloadComplete={onDownloadComplete}
          onError={onError}
          compact={true}
        />
      </div>
      
      <div className="message-status">
        {isSent && (
          <span className="sent-indicator">✓</span>
        )}
      </div>
    </div>
  );
};

export default FileMessage;