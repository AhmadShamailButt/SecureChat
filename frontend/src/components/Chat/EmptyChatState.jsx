import React from 'react';
import { MessageSquare } from 'lucide-react';

export default function EmptyChatState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background p-8 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2 text-foreground">No conversation selected</h3>
      <p className="text-muted-foreground max-w-sm">
        Choose a contact from the sidebar to start messaging or search for someone new.
      </p>
    </div>
  );
}