import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ContactsSidebar({ contacts, activeId, setActiveId }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter contacts based on search term
  const filteredContacts = searchTerm
    ? contacts.filter(contact => 
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : contacts;

  return (
    <div className="w-full max-w-xs border-r border-border bg-card hidden md:flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Messages</h2>
        <div className="mt-2 relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search contacts"
            className="input-base w-full pl-9 py-1.5 h-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.map(contact => (
          <ContactItem 
            key={contact.id}
            contact={contact}
            isActive={activeId === contact.id}
            onClick={() => setActiveId(contact.id)}
          />
        ))}
        
        {filteredContacts.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            No contacts found
          </div>
        )}
      </div>
    </div>
  );
}

function ContactItem({ contact, isActive, onClick }) {
  return (
    <button
      className={cn(
        "w-full text-left p-4 border-b border-border hover:bg-muted/50",
        isActive && "bg-muted"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center overflow-hidden">
            <span className="text-lg font-semibold text-primary-600 dark:text-primary-300">
              {contact.name.charAt(0)}
            </span>
          </div>
          {contact.isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <p className="font-medium truncate">{contact.name}</p>
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
              {contact.lastSeen === 'Online' ? (
                <span className="text-green-500">●</span>
              ) : contact.lastSeen}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-1">
            {contact.lastMessage}
          </p>
        </div>
        {contact.unreadCount > 0 && (
          <div className="ml-2 flex-shrink-0 bg-primary text-white rounded-full h-5 min-w-5 flex items-center justify-center text-xs font-medium">
            {contact.unreadCount}
          </div>
        )}
      </div>
    </button>
  );
}