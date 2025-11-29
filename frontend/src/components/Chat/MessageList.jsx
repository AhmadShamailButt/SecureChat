import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { ArrowRight, Check, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import ForwardMessageDialog from './ForwardMessageDialog';
import MessageDropdown from './MessageDropdown';

export default function MessageList({ messages = [], loading = false, currentUserId, onReply, activeContact, currentUserName, isGroupChat = false }) {
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null); // Store message ID for which dropdown is open

  const handleForwardClick = (message) => {
    setSelectedMessage(message);
    setForwardDialogOpen(true);
  };

  const handleReply = (message) => {
    if (onReply && typeof onReply === 'function') {
      onReply(message);
    }
  };

  // Show loading state when loading and no messages exist (HEAD logic for UI, main logic for flow)
  if (loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex justify-center items-center h-full p-4 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading messages...
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex justify-center items-center h-full p-4 text-muted-foreground opacity-70">
        No messages yet. Start the conversation!
      </div>
    );
  }

  // Helper function to get date string for a message
  const getMessageDate = (message) => {
    if (message.fullTimestamp) {
      try {
        const date = new Date(message.fullTimestamp);
        if (!isNaN(date.getTime())) {
          return date.toDateString();
        }
      } catch (error) {
        // Fallback
      }
    }
    // Fallback to current date if no timestamp
    return new Date().toDateString();
  };

  // Helper function to format date label
  const formatDateLabel = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  // Date Separator Component
  const DateSeparator = ({ date }) => (
    <div className="flex items-center justify-center my-4">
      <div className="px-3 py-1 rounded-full bg-muted/50 border border-border">
        <span className="text-xs text-muted-foreground font-medium">
          {formatDateLabel(date)}
        </span>
      </div>
    </div>
  );

  // Render messages with date separators
  const renderMessages = () => {
    const elements = [];
    let lastDate = null;

    messages.forEach((msg, index) => {
      const messageDate = getMessageDate(msg);
      
      // Add date separator if date changed
      if (lastDate !== messageDate) {
        elements.push(
          <DateSeparator key={`date-${messageDate}-${index}`} date={messageDate} />
        );
        lastDate = messageDate;
      }

      // Add message bubble
      elements.push(
        <MessageBubble 
          key={msg.id || index} 
          message={msg} 
          messages={messages}
          currentUserId={currentUserId}
          activeContact={activeContact}
          currentUserName={currentUserName}
          isGroupChat={isGroupChat}
          onForward={handleForwardClick}
          onReply={handleReply}
          dropdownOpen={dropdownOpen === msg.id}
          onDropdownToggle={(messageId) => setDropdownOpen(dropdownOpen === messageId ? null : messageId)}
        />
      );
    });

    return elements;
  };

  return (
    <>
      <div className="space-y-4">
        {renderMessages()}
      </div>
      <ForwardMessageDialog
        open={forwardDialogOpen}
        onOpenChange={setForwardDialogOpen}
        message={selectedMessage}
      />
    </>
  );
}

function MessageBubble({ message, messages, currentUserId, activeContact, currentUserName, isGroupChat, onForward, onReply, dropdownOpen, onDropdownToggle }) {
  const isMine = message.senderId === currentUserId || message.senderId === 'me';
  const messageRef = useRef(null);
  
  // Get sender name
  const senderName = message.senderName || (isMine ? (currentUserName || 'You') : (activeContact?.name || activeContact?.fullName || 'Unknown'));
  
  // Helper to find original message when parsing "Replying to:" text
  const findOriginalMessage = (replyText) => {
    if (!replyText || !messages) return null;
    
    // Extract the text being replied to
    const lines = replyText.split('\n');
    if (lines[0].startsWith('Replying to: ')) {
      const repliedText = lines[0].replace('Replying to: ', '').trim();
      // Find the message with matching text (search backwards from current message)
      const currentIndex = messages.findIndex(m => m.id === message.id);
      for (let i = currentIndex - 1; i >= 0; i--) {
        const msg = messages[i];
        // Check if message text matches (handle both full text and partial matches)
        if (msg.text && (msg.text.includes(repliedText) || repliedText.includes(msg.text))) {
          return {
            senderId: msg.senderId,
            senderName: msg.senderName,
            text: msg.text
          };
        }
      }
    }
    return null;
  };
  
  // Format timestamp - show only time
  const formatTimestamp = () => {
    // Priority: fullTimestamp (ISO string) > timestamp (formatted string from backend)
    const timestampToUse = message.fullTimestamp || null;
    
    // If we have fullTimestamp (ISO string), parse it
    if (timestampToUse) {
      try {
        const messageDate = new Date(timestampToUse);
        
        // Check if date is valid
        if (isNaN(messageDate.getTime())) {
          // Invalid date, fallback to formatted timestamp
          return message.timestamp || '';
        }
        
        // Always show only time (HH:MM format)
        return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (error) {
        console.error('Error formatting timestamp:', error);
        return message.timestamp || '';
      }
    }
    
    // Fallback to formatted timestamp from backend
    return message.timestamp || '';
  };
  
  const displayTimestamp = formatTimestamp();
  
  // Don't show forward button for pending or failed messages
  const canForward = !message.pending && !message.failed && message.id && !message.id.startsWith('temp-');
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success('Message copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy message');
    }
  };

  const handleMessageClick = (e) => {
    // Don't toggle if clicking on the dropdown itself
    if (e.target.closest('[data-dropdown]')) {
      return;
    }
    
    // Prevent default to avoid any text selection
    e.preventDefault();
    e.stopPropagation();
    
    // Toggle dropdown state
    const newState = dropdownOpen ? null : message.id;
    onDropdownToggle(newState);
  };
  
  const handleContextMenu = (e) => {
    // Prevent default context menu
    e.preventDefault();
    handleMessageClick(e);
  };
  
  return (
    <div
      className={cn(
        "flex group relative",
        isMine ? "justify-end" : "justify-start"
      )}
      style={{ position: 'relative', zIndex: dropdownOpen ? 10 : 1 }}
    >
      <div 
        ref={messageRef}
        data-message-bubble
        className={cn(
          "relative max-w-xs sm:max-w-md rounded-2xl px-4 py-2 cursor-pointer break-words shadow-sm",
          "hover:opacity-90 transition-opacity select-none",
          isMine 
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : "bg-muted text-foreground rounded-tl-none"
        )}
        onClick={handleMessageClick}
        onContextMenu={handleContextMenu}
        style={{ userSelect: 'none' }}
      >
        {/* Sender name - only show in group chats, and only for received messages (not own messages) */}
        {isGroupChat && !isMine && (
          <p className={cn(
            "text-xs font-medium mb-1",
            "text-foreground/80"
          )}>
            {senderName}
          </p>
        )}
        
        {/* Forwarded indicator - check if message starts with "Forwarded from" */}
        {message.text && message.text.startsWith('Forwarded from ') && (
          <div className={cn(
            "text-[10px] mb-1 flex items-center gap-1 opacity-70 italic",
            isMine ? "text-primary-foreground/70" : "text-foreground/70"
          )}>
            <ArrowRight className="h-3 w-3" />
            <span>Forwarded</span>
          </div>
        )}
        
        {/* Reply indicator - WhatsApp style */}
        {(message.replyingTo || (message.text && message.text.startsWith('Replying to:') && !message.text.startsWith('Forwarded from'))) && (
          <div className={cn(
            "text-[11px] mb-1.5 pl-2 border-l-[3px]",
            isMine 
              ? "border-primary-foreground/40 text-primary-foreground/90" 
              : "border-primary/60 text-foreground/90"
          )}>
            {(() => {
              let replyInfo = null;
              
              if (message.replyingTo) {
                // Use replyingTo object if available
                replyInfo = message.replyingTo;
              } else if (message.text && message.text.startsWith('Replying to:')) {
                // Parse from text format and find original message
                const originalMsg = findOriginalMessage(message.text);
                if (originalMsg) {
                  replyInfo = {
                    senderId: originalMsg.senderId,
                    senderName: originalMsg.senderName,
                    text: originalMsg.text
                  };
                } else {
                  // Fallback: just extract text
                  const lines = message.text.split('\n');
                  if (lines[0].startsWith('Replying to: ')) {
                    replyInfo = {
                      senderId: null,
                      senderName: null,
                      text: lines[0].replace('Replying to: ', '')
                    };
                  }
                }
              }
              
              if (!replyInfo) return null;
              
              // Check if the message being replied to was sent by the current user
              const repliedToSenderId = replyInfo.senderId;
              const isReplyingToCurrentUser = repliedToSenderId === currentUserId || 
                                              repliedToSenderId === 'me' ||
                                              repliedToSenderId?.toString() === currentUserId?.toString();
              
              // Show "You" if replying to current user's message, otherwise show the sender's name
              const displayName = isReplyingToCurrentUser 
                ? 'You' 
                : (replyInfo.senderName || activeContact?.name || activeContact?.fullName || 'Unknown');
              
              // Truncate long reply text
              const replyText = replyInfo.text.length > 50 
                ? replyInfo.text.substring(0, 50) + '...' 
                : replyInfo.text;
              
              return (
                <div>
                  <div className="font-medium mb-0.5">{displayName}</div>
                  <div className="opacity-90 truncate">{replyText}</div>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Actual message text */}
        <div className="flex items-end justify-between gap-2">
          <p className={cn(
            "flex-1 text-sm leading-relaxed",
            isMine ? "text-primary-foreground" : "text-foreground"
          )}>
            {(() => {
              // Handle forwarded messages - extract the actual message text
              if (message.text && message.text.startsWith('Forwarded from ')) {
                // Format: "Forwarded from {name}: {text}"
                const match = message.text.match(/^Forwarded from (.+?): (.+)$/);
                if (match) {
                  return match[2]; // Return just the actual message text
                }
              }
              
              // Handle reply messages
              if (message.replyingTo) {
                return message.text;
              }
              if (message.text && message.text.startsWith('Replying to:')) {
                const lines = message.text.split('\n');
                return lines.slice(1).join('\n') || lines[0].replace('Replying to: ', '');
              }
              
              return message.text;
            })()}
          </p>
          
          {/* Timestamp and status - positioned at bottom right */}
          <div className={cn(
            "text-[10px] flex items-center gap-1 flex-shrink-0",
            isMine
              ? "text-primary-foreground/70"
              : "text-muted-foreground"
          )}>
            <span className="opacity-70">{displayTimestamp}</span>
            {isMine && !message.pending && !message.failed && (
              <span className="ml-1 flex items-center justify-center" style={{ minWidth: '14px', height: '14px' }}>
                {(() => {
                  // Check read status - handle both boolean true and string 'true'
                  const isRead = message.read === true || message.read === 'true' || message.read === 1;
                 
                  return isRead ? (
                    <CheckCheck className="h-3.5 w-3.5" style={{ color: '#3b82f6', display: 'inline-block', flexShrink: 0 }} />
                  ) : (
                    <Check className="h-3.5 w-3.5" style={{ display: 'inline-block', flexShrink: 0 }} />
                  );
                })()}
              </span>
            )}
            {message.pending && (
              <span>⏳</span>
            )}
            {message.failed && (
              <span className="text-destructive">❌</span>
            )}
          </div>
        </div>

        {/* Dropdown menu */}
        <MessageDropdown
          isOpen={dropdownOpen}
          onClose={() => onDropdownToggle(null)}
          position={isMine ? 'right' : 'left'}
          onCopy={handleCopy}
          onForward={() => onForward(message)}
          onReply={() => onReply(message)}
          canForward={canForward}
          anchorElement={messageRef.current}
        />
      </div>
    </div>
  );
}

// Strict Prop Validation
MessageList.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      text: PropTypes.string,
      senderId: PropTypes.string,
      timestamp: PropTypes.string,
      fullTimestamp: PropTypes.string,
      pending: PropTypes.bool,
      failed: PropTypes.bool,
      read: PropTypes.oneOfType([PropTypes.bool, PropTypes.string, PropTypes.number]),
      replyingTo: PropTypes.object,
    })
  ),
  loading: PropTypes.bool,
  currentUserId: PropTypes.string,
  onReply: PropTypes.func,
  activeContact: PropTypes.object,
  currentUserName: PropTypes.string,
  isGroupChat: PropTypes.bool,
};

MessageBubble.propTypes = {
  message: PropTypes.object.isRequired,
  messages: PropTypes.array,
  currentUserId: PropTypes.string,
  activeContact: PropTypes.object,
  currentUserName: PropTypes.string,
  isGroupChat: PropTypes.bool,
  onForward: PropTypes.func,
  onReply: PropTypes.func,
  dropdownOpen: PropTypes.bool,
  onDropdownToggle: PropTypes.func,
};