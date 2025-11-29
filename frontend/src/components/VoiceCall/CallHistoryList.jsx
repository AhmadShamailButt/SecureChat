import React from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

// Format timestamp to readable format
const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

// Format call duration
const formatDuration = (seconds) => {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s`;
  return `${minutes}m ${secs}s`;
};

// Get call type icon and color
const getCallIcon = (call) => {
  const { isIncoming, status } = call;

  if (status === 'missed') {
    return {
      icon: PhoneMissed,
      className: 'text-red-500',
      label: 'Missed call'
    };
  }

  if (status === 'declined') {
    return {
      icon: isIncoming ? PhoneIncoming : PhoneOutgoing,
      className: 'text-red-500',
      label: isIncoming ? 'Declined incoming call' : 'Declined outgoing call'
    };
  }

  if (isIncoming) {
    return {
      icon: PhoneIncoming,
      className: 'text-green-500',
      label: 'Incoming call'
    };
  }

  return {
    icon: PhoneOutgoing,
    className: 'text-blue-500',
    label: 'Outgoing call'
  };
};

export default function CallHistoryList({ calls, onCallClick, isLoading, onDelete, deletingCallId }) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-muted"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Phone className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No call history</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {calls.map((call) => {
        const { icon: Icon, className, label } = getCallIcon(call);

        return (
          <div
            key={call.id}
            className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors group"
          >
            {/* Contact avatar */}
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary">
                {call.contact.name.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Call info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4 flex-shrink-0", className)} />
                <p className="text-sm font-medium text-foreground truncate">
                  {call.contact.name}
                </p>
                {/* Status badge */}
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  call.status === 'answered' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  call.status === 'missed' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  call.status === 'declined' && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                )}>
                  {call.status === 'answered' ? 'Answered' : call.status === 'missed' ? 'Missed' : 'Declined'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{formatTimestamp(call.timestamp)}</span>
                {call.status === 'answered' && call.duration > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(call.duration)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                onClick={() => onCallClick(call.contact)}
                className="h-8 w-8 rounded-full p-0"
                variant="ghost"
                title="Call again"
              >
                <Phone className="h-4 w-4" />
              </Button>
              {onDelete && (
                <Button
                  onClick={(e) => onDelete(call.id, e)}
                  className="h-8 w-8 rounded-full p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  variant="ghost"
                  title="Delete call"
                  disabled={deletingCallId === call.id}
                >
                  {deletingCallId === call.id ? (
                    <div className="h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
