import React from 'react';
import { cn } from '../../lib/utils';
import FileMessage from '../FileMessage/FileMessage';

export default function MessageList({ messages, loading }) {
  console.log('MessageList received', messages.length, 'messages');
  
  if (loading && messages.length === 0) {
    return <div className="flex justify-center p-4">Loading messages...</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="flex justify-center p-4 text-muted-foreground">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, index) => (
        <MessageBubble key={msg?.id || index} message={msg} />
      ))}
    </div>
  );
}

function MessageBubble({ message }) {
  // Safety check
  if (!message || !message.id) {
    return null;
  }
  
  const isMine = message.senderId === 'me';
  
  // Handle file messages differently
  if (message.type === 'file') {
    return (
      <div
        className={cn(
          "flex",
          isMine ? "justify-end" : "justify-start"
        )}
      >
        <div className={cn(
          "max-w-xs sm:max-w-md rounded-2xl",
          isMine 
            ? "bg-primary text-white rounded-tr-none"
            : "bg-card border border-border rounded-tl-none"
        )}>
          <FileMessage 
            message={message} 
            isOwn={isMine}
            sharedSecret={message.sharedSecret || 'default-secret'} // You may need to pass the actual shared secret
          />
          <div className={cn(
            "text-xs mt-1 flex justify-end px-4 pb-2",
            isMine
              ? "text-primary-100"
              : "text-muted-foreground"
          )}>
            {message.timestamp}
            {message.pending && (
              <span className="ml-2">⏳</span>
            )}
            {message.failed && (
              <span className="ml-2 text-red-300">❌</span>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Handle regular text messages
  return (
    <div
      className={cn(
        "flex",
        isMine ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "max-w-xs sm:max-w-md rounded-2xl px-4 py-2",
        isMine 
          ? "bg-primary text-white rounded-tr-none"
          : "bg-card border border-border rounded-tl-none"
      )}>
        <p>{message.text}</p>
        <div className={cn(
          "text-xs mt-1 flex justify-end",
          isMine
            ? "text-primary-100"
            : "text-muted-foreground"
        )}>
          {message.timestamp}
          {message.pending && (
            <span className="ml-2">⏳</span>
          )}
          {message.failed && (
            <span className="ml-2 text-red-300">❌</span>
          )}
        </div>
      </div>
    </div>
  );
}