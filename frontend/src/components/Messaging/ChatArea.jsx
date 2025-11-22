import React, { useState } from 'react';
import { MoreVertical, PhoneCall, Video, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import ChatHeader from './ChatHeader';
import RideDetailsCard from './RideDetailsCard';
import MessageList from './MessageList';

export default function ChatArea({
  activeContact,
  messages,
  loading,
  isConnected,
  connectError,
  handleSend,
  currentUserId // Make sure to receive currentUserId prop
}) {
  const [messageText, setMessageText] = useState('');

  const onSubmit = (e) => {
    handleSend(e, messageText);
    setMessageText('');
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <ChatHeader activeContact={activeContact} />

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto bg-muted/20 dark:bg-muted/5">
        <RideDetailsCard />
        <MessageList 
          messages={messages} 
          loading={loading} 
          currentUserId={currentUserId} // Pass currentUserId down to MessageList
        />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder={isConnected ? "Type a message..." : "Reconnecting..."}
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            className="input-base flex-1"
            disabled={!isConnected}
          />
          <button 
            type="submit" 
            className="p-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isConnected || !messageText.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
        {!isConnected && (
          <p className="text-xs text-red-500 mt-2">
            Disconnected from messaging service. Reconnecting...
          </p>
        )}
        {connectError && (
          <p className="text-xs text-red-500 mt-2">
            Error: {connectError}
          </p>
        )}
      </div>
    </div>
  );
}