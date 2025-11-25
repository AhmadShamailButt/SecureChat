import React, { useState } from "react";
import { Send } from "lucide-react";
import { cn } from "../../lib/utils";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";

export default function ChatArea({
  activeContact,
  messages,
  loading,
  isConnected,
  connectError,
  handleSend,
  currentUserId,
}) {
  const [messageText, setMessageText] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    if (messageText.trim()) {
      handleSend(e, messageText);
      setMessageText("");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat header */}
      <ChatHeader activeContact={activeContact} />

      {/* Message list */}
      <div className="flex-1 p-4 overflow-y-auto bg-background">
        <MessageList
          messages={messages}
          loading={loading}
          currentUserId={currentUserId}
        />
      </div>

      {/* Input box */}
      <div className="p-4 border-t border-border bg-card">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder={isConnected ? "Type a message…" : "Reconnecting…"}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 p-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground"
            disabled={!isConnected}
          />
          <button
            type="submit"
            className={cn(
              "p-2 rounded-md transition-colors",
              isConnected
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            disabled={!isConnected || !messageText.trim()}
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
      </div>
    </div>
  );
}

