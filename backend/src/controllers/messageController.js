const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Friend = require('../models/Friend');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

/**
 * Get messages for a specific conversation
 */
exports.getMessages = async (req, res) => {
  try {
    let { conversationId } = req.params;
    
    // Handle conversation IDs with "sample-" prefix
    if (conversationId.startsWith('sample-')) {
      const actualId = conversationId.replace('sample-', '');
      if (mongoose.Types.ObjectId.isValid(actualId)) {
        conversationId = actualId;
      } else {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
    }

    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Validate conversation exists and user is part of it
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === currentUserId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to access this conversation' });
    }

    // Check if users are friends (status: "accepted") before allowing message access
    const otherParticipant = conversation.participants.find(
      p => p.toString() !== currentUserId.toString()
    );
    
    if (otherParticipant) {
      const friendship = await Friend.findOne({
        $or: [
          { userId: currentUserId, friendId: otherParticipant.toString(), status: "accepted" },
          { userId: otherParticipant.toString(), friendId: currentUserId, status: "accepted" }
        ]
      });
      
      if (!friendship) {
        return res.status(403).json({ 
          error: 'You must be friends to view messages. Please accept the friend request first.' 
        });
      }
    }

    // Get messages
    const messages = await Message.find({ 
      conversationId: conversation._id.toString() 
    })
      .sort({ timestamp: 1 })
      .limit(100);
    
    // Mark messages as read
    await Message.updateMany(
      { 
        conversationId: conversation._id.toString(),
        receiverId: currentUserId,
        read: false
      },
      { $set: { read: true } }
    );

    // Format messages for the front end - INCLUDE receiverId!
    const formattedMessages = messages.map(msg => ({
      id: msg._id.toString(),
      conversationId: msg.conversationId,
      senderId: msg.senderId.toString() === currentUserId.toString() ? 'me' : msg.senderId.toString(),
      receiverId: msg.receiverId.toString(), // ← CRITICAL: Include receiverId!
      text: msg.text,
      encryptedData: msg.encryptedData || '',
      iv: msg.iv || '',
      authTag: msg.authTag || '',
      isEncrypted: msg.isEncrypted || false,
      timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: msg.read
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Create a new message
 */
exports.postMessage = async (req, res) => {
  try {
    // Extract ALL fields including encryption fields
    let { conversationId, text, encryptedData, iv, authTag, isEncrypted } = req.body;

    // Handle conversation IDs with "sample-" prefix
    if (conversationId.startsWith('sample-')) {
      conversationId = conversationId.replace('sample-', '');
      
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
    }

    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Find conversation
    let conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Ensure user is part of the conversation
    const isParticipant = conversation.participants.some(
      p => p.toString() === currentUserId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to message in this conversation' });
    }

    // Get the other participant
    const receiverId = conversation.participants.find(
      p => p.toString() !== currentUserId.toString()
    );

    // Check if users are friends
    if (receiverId) {
      const friendship = await Friend.findOne({
        $or: [
          { userId: currentUserId, friendId: receiverId.toString(), status: "accepted" },
          { userId: receiverId.toString(), friendId: currentUserId, status: "accepted" }
        ]
      });
      
      if (!friendship) {
        return res.status(403).json({ 
          error: 'You must be friends to send messages. Please accept the friend request first.' 
        });
      }
    }

    // Create new message WITH encryption fields
    const messageData = {
      conversationId: conversation._id.toString(),
      senderId: currentUserId,
      receiverId,
      text,
      timestamp: new Date()
    };

    // Add encryption fields if message is encrypted
    if (isEncrypted) {
      messageData.encryptedData = encryptedData || '';
      messageData.iv = iv || '';
      messageData.authTag = authTag || '';
      messageData.isEncrypted = true;
    } else {
      messageData.isEncrypted = false;
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    // Update conversation's last message
    conversation.lastMessage = text;
    conversation.lastMessageTimestamp = new Date();
    await conversation.save();

    // Format message for response - INCLUDE receiverId!
    const formattedMessage = {
      id: newMessage._id.toString(),
      conversationId: conversation._id.toString(),
      senderId: 'me',
      receiverId: newMessage.receiverId.toString(), // ← CRITICAL: Include receiverId!
      text: newMessage.text,
      encryptedData: newMessage.encryptedData || '',
      iv: newMessage.iv || '',
      authTag: newMessage.authTag || '',
      isEncrypted: newMessage.isEncrypted || false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read: false
    };

    // Emit message via socket.io
    if (req.io) {
      // For other users, senderId should be the actual ID
      const socketMessage = {
        ...formattedMessage,
        senderId: currentUserId.toString()
      };
      
      // Emit to conversation room
      req.io.to(conversation._id.toString()).emit('newMessage', socketMessage);
    }

    res.status(201).json(formattedMessage);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
};

/**
 * Create or get a conversation between two users
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Check if users exist
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Find existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, userId] }
    });

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [currentUserId, userId],
        lastMessage: '',
        lastMessageTimestamp: new Date()
      });
      await conversation.save();
    }

    res.json({
      id: conversation._id.toString(),
      participants: conversation.participants,
      lastMessage: conversation.lastMessage,
      lastMessageTimestamp: conversation.lastMessageTimestamp
    });
  } catch (error) {
    console.error('Error creating/fetching conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};
