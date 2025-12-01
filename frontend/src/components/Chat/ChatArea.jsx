import React, { useState, useRef, useEffect } from "react";
import { Send, X, Paperclip } from "lucide-react";
import { cn } from "../../lib/utils";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import FileUpload from "../FileUpload/FileUpload";

export default function ChatArea({
  activeContact,
  messages,
  loading,
  isConnected,
  connectError,
  handleSend,
  currentUserId,
  isFriend = true, // Assume contact is a friend (since contacts list only shows friends)
  onForwardMessage,
  currentUserName,
  isGroupChat = false,
  conversationId,
}) {
  const [messageText, setMessageText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const inputRef = useRef(null);

  const onSubmit = (e) => {
    e.preventDefault();
    if (messageText.trim() && isFriend) {
      // Pass reply info separately instead of concatenating
      handleSend(e, messageText.trim(), replyingTo);
      setMessageText("");
      setReplyingTo(null);
    }
  };

  const handleReply = (message) => {
    setReplyingTo(message);
    // Don't auto-focus to prevent cursor blinking when dropdown is still visible
    // User can manually click the input if needed
  };

  const handleFileUpload = async (fileData) => {
    try {
      // Create file message directly via API instead of using handleSend
      const token = sessionStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      
      const messageData = {
        conversationId: conversationId,
        type: 'file',
        text: `📎 ${fileData.fileName}`,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileType: fileData.fileType,
        fileUrl: fileData.fileUrl,
        fileId: fileData.fileId,
        fileHash: fileData.fileHash,
        encryptionKey: fileData.encryptionKey,
        encryptionIv: fileData.encryptionIv
      };

      // Send file message directly to the API
      console.log('Sending file message:', messageData);
      const response = await fetch(`${apiUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to send file message:', errorData);
        throw new Error('Failed to send file message');
      }

      const responseData = await response.json();
      console.log('File message sent successfully:', responseData);

      setReplyingTo(null);
      setShowFileUpload(false);
    } catch (error) {
      console.error('Error sending file message:', error);
      // You might want to show an error toast here
    }
  };

  const canSendMessage = isConnected && isFriend;

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat header */}
      <ChatHeader activeContact={activeContact} isGroupChat={isGroupChat} />

      {/* Message list */}
      <div className="flex-1 p-4 overflow-y-auto bg-background" style={{ overflowX: 'visible' }}>
        <MessageList
          messages={messages}
          loading={loading}
          currentUserId={currentUserId}
          activeContact={activeContact}
          currentUserName={currentUserName}
          isGroupChat={isGroupChat}
          onForwardMessage={onForwardMessage}
          onReply={handleReply}
        />
      </div>

      {/* Input box */}
      <div className="p-4 border-t border-border bg-card">
        {!isFriend ? (
          <div className="flex items-center justify-center p-4 bg-muted/50 rounded-md">
            <p className="text-sm text-muted-foreground text-center">
              You must be friends to send messages. Please accept the friend request first.
            </p>
          </div>
        ) : (
          <>
            {/* Reply preview */}
            {replyingTo && (
              <div className="mb-2 p-2 bg-muted/50 rounded-md border border-border flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {(() => {
                      // Check if the message being replied to was sent by the current user
                      const repliedToSenderId = replyingTo.senderId;
                      const isReplyingToCurrentUser = repliedToSenderId === currentUserId || 
                                                       repliedToSenderId === 'me' ||
                                                       repliedToSenderId?.toString() === currentUserId?.toString();
                      
                      // Show "You" if replying to current user's message, otherwise show the sender's name
                      return isReplyingToCurrentUser 
                        ? 'You' 
                        : (replyingTo.senderName || 'Unknown');
                    })()}
                  </p>
                  <p className="text-sm text-foreground truncate">{replyingTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="p-1 rounded-full hover:bg-muted transition-colors flex-shrink-0"
                  title="Cancel reply"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}
            <form onSubmit={onSubmit} className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowFileUpload(!showFileUpload)}
                className={cn(
                  "p-2 rounded-md transition-colors flex-shrink-0",
                  canSendMessage
                    ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                disabled={!canSendMessage}
                title="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                ref={inputRef}
                type="text"
                placeholder={canSendMessage ? (replyingTo ? "Type your reply…" : "Type a message…") : "Reconnecting…"}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 p-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!canSendMessage}
                autoComplete="off"
              />
              <button
                type="submit"
                className={cn(
                  "p-2 rounded-md transition-colors flex-shrink-0",
                  canSendMessage
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                disabled={!canSendMessage || !messageText.trim()}
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
            {!isConnected && (
              <p className="mt-2 text-xs text-warning">
                Disconnected. Reconnecting…
              </p>
            )}
            {connectError && (
              <p className="mt-1 text-xs text-destructive">Error: {connectError}</p>
            )}
            
            {/* File Upload Component */}
            {showFileUpload && (
              <div className="mt-4 p-4 border border-border rounded-md bg-card">
                <FileUpload
                  recipientId={activeContact?.userId || activeContact?._id || activeContact?.id}
                  onUploadComplete={handleFileUpload}
                  onCancel={() => setShowFileUpload(false)}
                  conversationId={conversationId}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

