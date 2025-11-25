import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSocket } from '../contexts/SocketContext';
import { useLocation } from 'react-router-dom';
import ContactsSidebar from "../components/Chat/ContactsSidebar";
import ChatArea from "../components/Chat/ChatArea";
import EmptyChatState from "../components/Chat/EmptyChatState";
import { fetchContacts, fetchMessages, sendMessage, setSelectedContact, addMessage } from '../store/slices/chatSlice';
import { Button } from '../components/ui/Button';

export default function ChatPage() {
  const location = useLocation();
  const dispatch = useDispatch();
  const { socket, isConnected, connectError, reconnect } = useSocket();
  const { contacts, messages, selectedContact, isContactsLoading, isMessagesLoading } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const [activeId, setActiveId] = useState(null);
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());

  // Check for activeConversation or userId in location state (from navigation)
  useEffect(() => {
    if (location.state?.activeConversation) {
      setActiveId(location.state.activeConversation);
    } else if (location.state?.userIdToOpenChat && contacts.length > 0) {
      const contactToOpen = contacts.find(contact => contact.id === location.state.userIdToOpenChat);
      if (contactToOpen) {
        setActiveId(contactToOpen.id);
        dispatch(setSelectedContact(contactToOpen));
      }
    } else if (!activeId && contacts.length > 0) {
      setActiveId(contacts[0].id);
      dispatch(setSelectedContact(contacts[0]));
    }
  }, [location.state, contacts, activeId, dispatch]);

  // Load contacts using Redux
  useEffect(() => {
    if (!user) return;
    dispatch(fetchContacts());
  }, [user, dispatch]);

  // Join room effect
  useEffect(() => {
    if (!activeId || !isConnected || !socket) return;
    console.log('Joining room for conversation:', activeId);
    socket.emit('join', {
      conversationId: activeId,
      userId: user?.id
    });

    const handleJoined = (data) => {
      console.log('Joined room:', data);
    };

    socket.on('joined', handleJoined);

    return () => {
      socket.off('joined', handleJoined);
    };
  }, [activeId, isConnected, socket, user]);

  // Load messages when active contact changes using Redux
  useEffect(() => {
    if (!activeId) return;
    setProcessedMessageIds(new Set());
    dispatch(fetchMessages(activeId));
  }, [activeId, dispatch]);

  // Listen for new messages
  useEffect(() => {
    if (!isConnected || !activeId || !socket) return;
    const handleNewMessage = (msg) => {
      console.log('New message received:', msg);
      if (msg.conversationId !== activeId) {
        return;
      }
      if (msg.id && processedMessageIds.has(msg.id)) {
        console.log('Skipping duplicate message:', msg.id);
        return;
      }
      if (msg.id) {
        setProcessedMessageIds(prev => new Set(prev).add(msg.id));
      }
      if (msg.senderId !== user?.id) {
        dispatch(addMessage(msg));
      }
    };
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [isConnected, activeId, socket, processedMessageIds, user, dispatch]);

  const handleSend = async (e, messageText) => {
    e.preventDefault();
    if (!messageText.trim() || !activeId || !isConnected) return;
    console.log('Sending message to conversation:', activeId);
    const tempId = `temp-${Date.now()}`;
    const newMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: user?.id || 'me',
      text: messageText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      pending: true
    };
    dispatch(addMessage(newMessage));
    
    try {
      const response = await dispatch(sendMessage({
        conversationId: activeId,
        messageData: {
          conversationId: activeId,
          text: messageText.trim(),
          senderId: user?.id
        }
      }));
      
      if (response.meta.requestStatus === "fulfilled" && response.payload?.id) {
        setProcessedMessageIds(prev => new Set(prev).add(response.payload.id));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const activeContact = selectedContact || contacts.find(c => c.id === activeId);

  const handleContactClick = (contactId) => {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setActiveId(contactId);
      dispatch(setSelectedContact(contact));
    }
  };

  if (isContactsLoading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">Loading contacts...</div>;
  }

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col" style={{ margin: 0, padding: 0 }}>
      {!isConnected && (
        <div className="bg-warning/20 border border-warning/50 p-2 text-warning flex items-center justify-between z-10">
          <span>Connection to messaging service lost.</span>
          <Button onClick={reconnect} variant="outline" size="sm" className="ml-2">
            Reconnect
          </Button>
        </div>
      )}
      <div className="flex-1 flex w-full overflow-hidden" style={{ margin: 0, padding: 0 }}>
        {/* Contacts Sidebar */}
        <ContactsSidebar
          contacts={contacts}
          activeId={activeId}
          setActiveId={handleContactClick}
        />

        {/* Chat Area or Empty State */}
        {activeContact ? (
          <ChatArea
            activeContact={activeContact}
            messages={messages}
            loading={isMessagesLoading}
            isConnected={isConnected}
            connectError={connectError}
            handleSend={handleSend}
            currentUserId={user?.id}
          />
        ) : (
          <EmptyChatState />
        )}
      </div>
    </div>
  );
}

