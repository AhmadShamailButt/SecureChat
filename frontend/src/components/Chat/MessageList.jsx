import React from 'react';
import { cn } from '../../lib/utils';

export default function MessageList({ messages, loading, currentUserId }) {
  if (loading && messages.length === 0) {
    return <div className="flex justify-center p-4 text-muted-foreground">Loading messages...</div>;
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
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}
    </div>
  );
}

function MessageBubble({ message, currentUserId }) {
  const isMine = message.senderId === currentUserId || message.senderId === 'me';
  
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
          ? "bg-primary text-primary-foreground rounded-tr-none"
          : "bg-muted text-muted-foreground rounded-tl-none"
      )}>
        <p className={cn(isMine ? "text-primary-foreground" : "text-foreground")}>{message.text}</p>
        <div className={cn(
          "text-xs mt-1 flex justify-end",
          isMine
            ? "text-primary-foreground/70"
            : "text-muted-foreground"
        )}>
          {message.timestamp}
          {message.pending && (
            <span className="ml-2">⏳</span>
          )}
          {message.failed && (
            <span className="ml-2 text-destructive">❌</span>
          )}
        </div>
      </div>
    </div>
  );
}

