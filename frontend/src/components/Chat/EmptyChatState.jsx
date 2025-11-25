import React from 'react';

export default function EmptyChatState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center p-4">
        <h3 className="text-lg font-medium mb-2 text-foreground">No conversation selected</h3>
        <p className="text-muted-foreground">
          Select a contact to start messaging
        </p>
      </div>
    </div>
  );
}

