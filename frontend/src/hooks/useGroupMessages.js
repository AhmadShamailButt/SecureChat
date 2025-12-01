import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { fetchGroupMessages, addGroupMessage, sendGroupMessage as sendGroupMessageAction } from '../store/slices/chatSlice';
import { encryptMessageForGroup, decryptGroupMessage } from '../utils/groupEncryption';

/**
 * Custom hook for handling group messaging with encryption
 * @param {object} socket - Socket.io client instance
 * @param {object} activeGroup - Currently active group
 * @param {object} user - Current user
 * @param {boolean} isCryptoInitialized - Whether crypto is initialized
 * @returns {object} - Group messaging methods and state
 */
export default function useGroupMessages(socket, activeGroup, user, isCryptoInitialized) {
  const dispatch = useDispatch();
  const { groupMessages, isGroupMessagesLoading } = useSelector(state => state.chat);
  const [decryptedGroupMessages, setDecryptedGroupMessages] = useState({});
  const [isJoinedGroup, setIsJoinedGroup] = useState(false);

  // Get current group's messages
  const currentGroupMessages = activeGroup ? groupMessages[activeGroup.id] || [] : [];

  // Join group room when active group changes
  useEffect(() => {
    if (!socket || !activeGroup) {
      setIsJoinedGroup(false);
      return;
    }

    const userId = user?.id || user?._id;
    if (!userId) {
      console.error('[GROUP] Cannot join group: user ID not available');
      return;
    }

    console.log(`[GROUP] Joining group room: ${activeGroup.id}`);
    socket.emit('joinGroup', {
      groupId: activeGroup.id,
      userId: userId
    });

    setIsJoinedGroup(true);

    // Load group messages
    dispatch(fetchGroupMessages({ groupId: activeGroup.id }));

    return () => {
      if (socket && activeGroup) {
        console.log(`[GROUP] Leaving group room: ${activeGroup.id}`);
        socket.emit('leaveGroup', { groupId: activeGroup.id });
        setIsJoinedGroup(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, activeGroup?.id]); // user and dispatch are stable, excluded to prevent re-render loop

  // Decrypt group messages
  useEffect(() => {
    const decryptMessagesAsync = async () => {
      if (!currentGroupMessages.length || !isCryptoInitialized || !activeGroup) {
        return;
      }

      const newDecrypted = {};
      let hasNewMessages = false;

      for (const msg of currentGroupMessages) {
        // Skip if already decrypted or not encrypted
        if (decryptedGroupMessages[msg.id] || !msg.isEncrypted) {
          continue;
        }

        hasNewMessages = true;

        try {
          console.log(`🔓 Decrypting group message ${msg.id}`);

          const decrypted = await decryptGroupMessage(
            {
              encryptedData: msg.encryptedData,
              iv: msg.iv,
              authTag: msg.authTag
            },
            activeGroup.id,
            user.id || user._id,
            activeGroup.createdBy.id,
            activeGroup.members // Pass members for potential encryption repair
          );

          newDecrypted[msg.id] = decrypted;
          console.log(`✅ Decrypted group message ${msg.id}`);
        } catch (error) {
          // Check if this is a "creator only" error for non-creators
          const isCreatorOnlyError = error.message?.includes('Only group creator can initialize encryption');
          const isKeyMismatch = error.message?.includes('key mismatch') || 
                               error.message?.includes('Failed to decrypt');
          const isCurrentUserCreator = (user.id || user._id) === activeGroup.createdBy.id;

          if (isCreatorOnlyError && !isCurrentUserCreator) {
            // Non-creator trying to decrypt - show helpful message
            newDecrypted[msg.id] = '[Waiting for group creator to set up encryption]';
            // Only log once to avoid console spam
            if (!sessionStorage.getItem(`group-${activeGroup.id}-creator-notice-shown`)) {
              console.warn(`⚠️ Group encryption not initialized. Ask the group creator to send a message first.`);
              sessionStorage.setItem(`group-${activeGroup.id}-creator-notice-shown`, 'true');
            }
          } else if (isKeyMismatch && !isCurrentUserCreator) {
            // Key mismatch - member's keys changed, need creator to re-encrypt
            newDecrypted[msg.id] = '[Encryption key mismatch - waiting for creator to update]';
            // Only log once to avoid console spam
            if (!sessionStorage.getItem(`group-${activeGroup.id}-key-mismatch-shown`)) {
              console.warn(`⚠️ Your encryption keys have changed. The group creator needs to open this group to update your encryption key.`);
              sessionStorage.setItem(`group-${activeGroup.id}-key-mismatch-shown`, 'true');
            }
          } else {
            // Other decryption errors
            console.error(`❌ Failed to decrypt group message ${msg.id}:`, error);
            newDecrypted[msg.id] = '[Decryption failed]';
          }
        }
      }

      // Only update state if we have new decrypted messages
      if (hasNewMessages && Object.keys(newDecrypted).length > 0) {
        setDecryptedGroupMessages(prev => ({ ...prev, ...newDecrypted }));
      }
    };

    decryptMessagesAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroupMessages, isCryptoInitialized, activeGroup?.id, user?.id]); // Use IDs only to prevent reference changes causing re-renders

  // Listen for incoming group messages
  useEffect(() => {
    if (!socket || !activeGroup) return;

    const handleNewGroupMessage = async (message) => {
      console.log('[GROUP] Received new group message:', message);

      // Add to Redux store
      dispatch(addGroupMessage({ groupId: message.groupId, message }));

      // Decrypt if encrypted
      if (message.isEncrypted) {
        try {
          const plaintext = await decryptGroupMessage(
            {
              encryptedData: message.encryptedData,
              iv: message.iv,
              authTag: message.authTag
            },
            message.groupId,
            user.id || user._id,
            activeGroup.createdBy.id
          );

          setDecryptedGroupMessages(prev => ({
            ...prev,
            [message.id]: plaintext
          }));
        } catch (error) {
          // Check if this is a "creator only" error for non-creators
          const isCreatorOnlyError = error.message?.includes('Only group creator can initialize encryption');
          const isCurrentUserCreator = (user.id || user._id) === activeGroup.createdBy.id;

          if (isCreatorOnlyError && !isCurrentUserCreator) {
            setDecryptedGroupMessages(prev => ({
              ...prev,
              [message.id]: '[Waiting for group creator to set up encryption]'
            }));
          } else {
            console.error('Failed to decrypt incoming group message:', error);
            setDecryptedGroupMessages(prev => ({
              ...prev,
              [message.id]: '[Decryption failed]'
            }));
          }
        }
      }
    };

    socket.on('newGroupMessage', handleNewGroupMessage);

    return () => {
      socket.off('newGroupMessage', handleNewGroupMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, activeGroup?.id]); // user and dispatch are stable, excluded to prevent re-render loop

  // Send group message
  const sendMessage = useCallback(async (text) => {
    if (!activeGroup || !text.trim() || !isJoinedGroup) {
      console.warn('[GROUP] Cannot send message: group not active or not joined');
      return;
    }

    try {
      // Encrypt the message (pass members for auto-repair if needed)
      const encrypted = await encryptMessageForGroup(
        text,
        activeGroup.id,
        user.id || user._id,
        activeGroup.createdBy.id,
        activeGroup.members // Pass members for potential encryption repair
      );

      const messageData = {
        text: '[Encrypted]',
        ...encrypted,
        isEncrypted: true
      };

      // Send to server
      const result = await dispatch(sendGroupMessageAction({
        groupId: activeGroup.id,
        messageData
      })).unwrap();

      const sentMessage = result.message;

      // Emit via socket to notify other members
      socket.emit('sendGroupMessage', {
        ...sentMessage,
        groupId: activeGroup.id,
        senderId: user.id || user._id
      });

      // Store decrypted version locally
      setDecryptedGroupMessages(prev => ({
        ...prev,
        [sentMessage.id]: text
      }));

      console.log('[GROUP] Message sent successfully');
      return sentMessage;
    } catch (error) {
      console.error('[GROUP] Failed to send message:', error);

      // Check if this is a creator-only error
      const isCreatorOnlyError = error.message?.includes('Only group creator can initialize encryption');

      if (isCreatorOnlyError) {
        toast.error('Please ask the group creator to send a message first to set up encryption', {
          duration: 5000
        });
      } else {
        toast.error('Failed to send message');
      }

      throw error;
    }
  }, [activeGroup, user, dispatch, socket, isJoinedGroup]);

  return {
    messages: currentGroupMessages,
    decryptedMessages: decryptedGroupMessages,
    isLoading: isGroupMessagesLoading,
    sendMessage,
    isJoinedGroup
  };
}
