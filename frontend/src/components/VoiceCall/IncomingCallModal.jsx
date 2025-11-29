import React from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/Button';
import { useRingingTone } from '../../hooks/useCallTones';

export default function IncomingCallModal({ isOpen, callerName, onAccept, onDecline }) {
  // Play ringing tone when modal is open
  useRingingTone(isOpen);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center">Incoming Call</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Caller avatar with pulse animation */}
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <span className="text-3xl font-semibold text-primary">
                {callerName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-ping"></div>
          </div>

          {/* Caller name */}
          <div className="text-center">
            <p className="text-xl font-semibold text-foreground">{callerName}</p>
            <p className="text-sm text-muted-foreground mt-1">Incoming voice call...</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 mt-4">
            <Button
              onClick={onDecline}
              className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600 text-white"
              title="Decline call"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button
              onClick={onAccept}
              className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 text-white"
              title="Accept call"
            >
              <Phone className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
