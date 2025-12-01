import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { MoreVertical, PhoneCall, Video, History, Users, Info } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { initiateCall } from '../../store/slices/voiceCallSlice';
import { cn } from '../../lib/utils';
import CallHistory from '../VoiceCall/CallHistory';
import GroupDetailsModal from './GroupDetailsModal';

export default function ChatHeader({ activeContact, isGroupChat = false }) {
  // Safety guard
  if (!activeContact) return null;

  const dispatch = useDispatch();
  const [isCallHistoryOpen, setIsCallHistoryOpen] = useState(false);
  const [isGroupDetailsOpen, setIsGroupDetailsOpen] = useState(false);

  const name = activeContact.name || activeContact.fullName || "Unknown User";
  const initial = name.charAt(0).toUpperCase();

  const handleVoiceCall = () => {
    if (activeContact) {
      // Allow calling even if user is offline
      dispatch(initiateCall({
        contactId: activeContact.userId,
        contactName: name,
        conversationId: null // Will be set by backend based on both user IDs
      }));
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0 h-16">
      {/* Left side - Avatar and Info (clickable for groups) */}
      <div
        className={cn(
          "flex items-center gap-3",
          isGroupChat && "cursor-pointer hover:bg-muted/50 -ml-2 -my-2 p-2 rounded-lg transition-colors"
        )}
        onClick={isGroupChat ? () => setIsGroupDetailsOpen(true) : undefined}
        title={isGroupChat ? "View group details" : undefined}
      >
        <div className="relative">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center overflow-hidden",
            isGroupChat ? "bg-primary/20" : "bg-primary/20"
          )}>
            {isGroupChat ? (
              <Users className="h-5 w-5 text-primary" />
            ) : (
              <span className="text-lg font-semibold text-primary">
                {initial}
              </span>
            )}
          </div>
          {!isGroupChat && activeContact.isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-background" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-foreground leading-none">{name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isGroupChat ? (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {activeContact.memberCount || activeContact.members?.length || 0} members
              </span>
            ) : activeContact.isOnline ? (
              'Online'
            ) : activeContact.lastSeen ? (
              (() => {
                try {
                  const lastSeenDate = new Date(activeContact.lastSeen);
                  const now = new Date();
                  const diffMs = now - lastSeenDate;
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) return 'Just now';
                  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                  return lastSeenDate.toLocaleDateString();
                } catch (e) {
                  return 'Offline';
                }
              })()
            ) : (
              'Offline'
            )}
          </p>
        </div>
      </div>

      {/* Right side - Action Buttons */}
      <div className="flex items-center gap-1">
        {isGroupChat ? (
          // Group chat actions
          <>
            <button
              className="p-2 rounded-full hover:bg-muted transition-colors"
              onClick={() => setIsGroupDetailsOpen(true)}
              title="Group info"
            >
              <Info className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="More Options"
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
          </>
        ) : (
          // 1-to-1 chat actions
          <>
            <button
              className="p-1 rounded-full hover:bg-muted transition-colors"
              onClick={handleVoiceCall}
              title="Start voice call"
            >
              <PhoneCall className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              className="p-1 rounded-full hover:bg-muted transition-colors"
              onClick={() => setIsCallHistoryOpen(true)}
              title="Call history"
            >
              <History className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="Video Call"
            >
              <Video className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="More Options"
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
          </>
        )}
      </div>

      {/* Call History Dialog (1-to-1 only) */}
      {!isGroupChat && (
        <CallHistory
          isOpen={isCallHistoryOpen}
          onOpenChange={setIsCallHistoryOpen}
        />
      )}

      {/* Group Details Modal (groups only) */}
      {isGroupChat && (
        <GroupDetailsModal
          open={isGroupDetailsOpen}
          onOpenChange={setIsGroupDetailsOpen}
          group={activeContact}
        />
      )}
    </div>
  );
}

ChatHeader.propTypes = {
  activeContact: PropTypes.shape({
    userId: PropTypes.string,
    name: PropTypes.string,
    fullName: PropTypes.string,
    isOnline: PropTypes.bool,
    lastSeen: PropTypes.string,
    memberCount: PropTypes.number,
    members: PropTypes.array,
  }),
  isGroupChat: PropTypes.bool,
};