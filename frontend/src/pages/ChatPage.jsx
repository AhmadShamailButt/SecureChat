import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSocket } from '../contexts/SocketContext';
import { useCrypto } from '../contexts/CryptoContext';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import ContactsSidebar from "../components/Chat/ContactsSidebar";
import ChatArea from "../components/Chat/ChatArea";
import EmptyChatState from "../components/Chat/EmptyChatState";
import { fetchContacts, fetchMessages, sendMessage, setSelectedContact, setSelectedGroup, addMessage, getFriendRequests, fetchGroups, getGroupRequests } from '../store/slices/chatSlice';
import { Button } from '../components/ui/Button';
import axiosInstance from '../store/axiosInstance';

export default function ChatPage() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { socket, isConnected, connectError, reconnect } = useSocket();
  const { encryptMessage, decryptMessage, isInitialized: isCryptoInitialized } = useCrypto();
  const { contacts, messages, selectedContact, selectedGroup, groups, isContactsLoading, isMessagesLoading, friendRequests } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const [activeId, setActiveId] = useState(null);
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());
  const [decryptedMessages, setDecryptedMessages] = useState({});

  // Calculate active contact and group early
  const activeContact = selectedContact || contacts.find(c => c.id === activeId);
  const activeGroup = selectedGroup || groups.find(g => g.id === activeId);

  // Check URL params for group or contact ID
  useEffect(() => {
    if (params.id) {
      if (location.pathname.includes('/group/')) {
        const group = groups.find(g => g.id === params.id);
        if (group) {
          setActiveId(params.id);
          dispatch(setSelectedGroup(group));
          dispatch(setSelectedContact(null));
        }
      } else {
        const contact = contacts.find(c => c.id === params.id);
        if (contact) {
          setActiveId(params.id);
          dispatch(setSelectedContact(contact));
          dispatch(setSelectedGroup(null));
        }
      }
    } else if (location.state?.activeConversation) {
      const conversationId = location.state.activeConversation;
      const contact = contacts.find(c => c.id === conversationId);
      if (contact) {
        setActiveId(conversationId);
        dispatch(setSelectedContact(contact));
        dispatch(setSelectedGroup(null));
      }
    }
  }, [params.id, location.pathname, location.state, contacts, groups, activeId, dispatch, navigate]);

  // Load contacts, friend requests, groups
  useEffect(() => {
    if (!user) return;
    dispatch(fetchContacts());
    dispatch(getFriendRequests());
    dispatch(fetchGroups());
    dispatch(getGroupRequests());
  }, [user, dispatch]);

  // Decrypt messages when they're loaded
  useEffect(() => {
    const decryptMessagesAsync = async () => {
      if (!messages || messages.length === 0 || !isCryptoInitialized || !user || !activeContact) {
        return;
      }

      const newDecrypted = {};
      
      for (const msg of messages) {
        // Skip if already decrypted or not encrypted
        if (decryptedMessages[msg.id] || !msg.isEncrypted) {
          newDecrypted[msg.id] = decryptedMessages[msg.id] || msg.text;
          continue;
        }

        try {
          // Determine other user's ID for decryption
          let otherUserId;
          
          if (msg.senderId === 'me') {
            // I sent this message
            // Use receiverId if available, otherwise use activeContact.userId as fallback
            otherUserId = msg.receiverId || activeContact.userId;
          } else {
            // They sent this message
            otherUserId = msg.senderId;
          }

          // Skip if we can't determine the other user
          if (!otherUserId) {
            console.warn(`Cannot decrypt message ${msg.id}: missing user ID`);
            newDecrypted[msg.id] = '[Cannot decrypt: Old message format]';
            continue;
          }

          console.log(`🔓 Decrypting message ${msg.id}:`, {
            iSentIt: msg.senderId === 'me',
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            decryptWithUserId: otherUserId
          });

          const decrypted = await decryptMessage(
            {
              ciphertext: msg.encryptedData,
              iv: msg.iv,
              authTag: msg.authTag
            },
            otherUserId
          );

          newDecrypted[msg.id] = decrypted;
          console.log(`✅ Decrypted message ${msg.id}`);
        } catch (error) {
          console.error(`❌ Failed to decrypt message ${msg.id}:`, error);
          newDecrypted[msg.id] = '[Decryption failed]';
        }
      }

      setDecryptedMessages(prev => ({ ...prev, ...newDecrypted }));
    };

    decryptMessagesAsync();
  }, [messages, isCryptoInitialized, user, activeContact, decryptMessage]);

  // Join room effect
  useEffect(() => {
    if (!activeId || !isConnected || !socket || activeGroup) return;
    console.log('Joining room for conversation:', activeId);
    
    socket.emit('join', {
      conversationId: activeId,
      userId: user?.id
    });

    return () => {};
  }, [activeId, isConnected, socket, activeGroup, user]);

  // Fetch messages when active contact or group changes
  useEffect(() => {
    if (activeId && !activeGroup) {
      dispatch(fetchMessages(activeId));
    }
  }, [activeId, activeGroup, dispatch]);

  // Listen for new messages via socket
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleNewMessage = async (msg) => {
      console.log('📨 New message received:', msg);
      if (msg.conversationId !== activeId) {
        return;
      }
      if (msg.id && processedMessageIds.has(msg.id)) {
        console.log('⏭️  Skipping duplicate message:', msg.id);
        return;
      }
      if (msg.id) {
        setProcessedMessageIds(prev => new Set(prev).add(msg.id));
      }
      if (msg.senderId !== user?.id) {
        // Add message to state
        dispatch(addMessage(msg));
        
        // Decrypt if encrypted
        if (msg.isEncrypted && isCryptoInitialized) {
          try {
            // For incoming messages, decrypt with sender's ID
            console.log(`🔓 Decrypting incoming message from:`, msg.senderId);
            
            const decrypted = await decryptMessage(
              {
                ciphertext: msg.encryptedData,
                iv: msg.iv,
                authTag: msg.authTag
              },
              msg.senderId
            );
            
            setDecryptedMessages(prev => ({ ...prev, [msg.id]: decrypted }));
            console.log(`✅ Decrypted incoming message`);
          } catch (error) {
            console.error('❌ Failed to decrypt incoming message:', error);
            setDecryptedMessages(prev => ({ ...prev, [msg.id]: '[Decryption failed]' }));
          }
        }
      }
    };
    
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [isConnected, activeId, socket, processedMessageIds, user, dispatch, activeGroup, isCryptoInitialized, decryptMessage]);

  const handleSend = async (e, messageText) => {
    e.preventDefault();
    if (!messageText.trim() || !activeId || !isConnected || activeGroup) return;
    
    const canEncrypt = isCryptoInitialized && activeContact && activeContact.userId;
    
    console.log('🔐 Encryption check:', { 
      isCryptoInitialized, 
      hasActiveContact: !!activeContact,
      hasUserId: !!activeContact?.userId,
      canEncrypt
    });
    
    try {
      let messagePayload;
      
      if (canEncrypt) {
        try {
          console.log('🔒 Encrypting message for user:', activeContact.userId);
          const encrypted = await encryptMessage(messageText.trim(), activeContact.userId);
          
          messagePayload = {
            conversationId: activeId,
            text: '[Encrypted]',
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            isEncrypted: true,
            senderId: user?.id
          };
          
          console.log('✅ Message encrypted successfully');
          
        } catch (encryptError) {
          console.error('❌ Encryption failed:', encryptError);
          messagePayload = {
            conversationId: activeId,
            text: messageText.trim(),
            isEncrypted: false,
            senderId: user?.id
          };
        }
      } else {
        console.log('⚠️  Crypto not ready, sending unencrypted');
        messagePayload = {
          conversationId: activeId,
          text: messageText.trim(),
          isEncrypted: false,
          senderId: user?.id
        };
      }
      
      // Send to backend
      const response = await dispatch(sendMessage({
        conversationId: activeId,
        messageData: messagePayload
      }));
      
      if (response.meta.requestStatus === "fulfilled" && response.payload?.id) {
        setProcessedMessageIds(prev => new Set(prev).add(response.payload.id));
        
        // If encrypted, cache the decrypted version
        if (messagePayload.isEncrypted) {
          setDecryptedMessages(prev => ({
            ...prev,
            [response.payload.id]: messageText.trim()
          }));
        }
        
        // Emit via socket for real-time delivery
        socket.emit('sendMessage', {
          ...response.payload,
          conversationId: activeId
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleContactClick = (contactId) => {
    const group = groups.find(g => g.id === contactId);
    const contact = contacts.find(c => c.id === contactId);
    
    if (group) {
      setActiveId(contactId);
      dispatch(setSelectedGroup(group));
      dispatch(setSelectedContact(null));
      navigate(`/chat/group/${contactId}`, { replace: true });
    } else if (contact) {
      setActiveId(contactId);
      dispatch(setSelectedContact(contact));
      dispatch(setSelectedGroup(null));
      setDecryptedMessages({});
      navigate(`/chat/${contactId}`, { replace: true });
    }
  };

  // Prepare messages with decrypted content
  const displayMessages = messages.map(msg => ({
    ...msg,
    text: msg.isEncrypted ? (decryptedMessages[msg.id] || 'Decrypting...') : msg.text
  }));

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
      
      {isCryptoInitialized && activeContact && (
        <div className="bg-green-500/10 border-b border-green-500/20 p-1 text-xs text-green-600 dark:text-green-400 text-center">
          🔒 End-to-end encrypted
        </div>
      )}
      
      <div className="flex-1 flex w-full overflow-hidden" style={{ margin: 0, padding: 0 }}>
        <ContactsSidebar
          contacts={contacts}
          activeId={activeId}
          setActiveId={handleContactClick}
        />

        {activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-8">
            <div className="text-center max-w-md">
              <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">{activeGroup.name}</h2>
              {activeGroup.description && (
                <p className="text-muted-foreground mb-4">{activeGroup.description}</p>
              )}
              <p className="text-sm text-muted-foreground mb-6">
                {activeGroup.memberCount} {activeGroup.memberCount === 1 ? 'member' : 'members'}
              </p>
              <p className="text-sm text-muted-foreground">
                Group messaging functionality coming soon...
              </p>
            </div>
          </div>
        ) : activeContact ? (
          <ChatArea
            activeContact={activeContact}
            messages={displayMessages}
            loading={isMessagesLoading}
            isConnected={isConnected}
            connectError={connectError}
            handleSend={handleSend}
            currentUserId={user?.id}
            isFriend={true}
          />
        ) : (
          <EmptyChatState currentUserId={user?.id} />
        )}
      </div>
    </div>
  );
}
