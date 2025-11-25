// backend/controllers/contactsController.js

const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { isConnected } = require("../config/database");

/**
 * GET /api/messages/contacts
 * Returns only real, existing conversations for the authenticated user.
 */
exports.getContacts = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const token = authHeader.split(" ")[1];
    const JWT_SECRET = process.env.JWT_SECRET || "8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf";
    const { userId: currentUserId } = jwt.verify(token, JWT_SECRET);

    // Check if MongoDB is connected
    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Validate ObjectId format for real users
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      console.error("Invalid user ID format:", currentUserId);
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const conversations = await Conversation.find({
      participants: currentUserId
    })
      .sort({ lastMessageTimestamp: -1 })
      .populate("participants", "fullName email gender department isOnline");

    const contacts = await Promise.all(
      conversations.map(async conv => {
        const other = conv.participants.find(
          p => p._id.toString() !== currentUserId
        );
        if (!other) return null;

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id.toString(),
          receiverId: currentUserId,
          read: false
        });

        return {
          id:           conv._id.toString(),
          socketRoomId: conv._id.toString(),
          userId:       other._id.toString(),
          name:         other.fullName,
          email:        other.email,
          department:   other.department,
          gender:       other.gender,
          isOnline:     other.isOnline || false,
          lastMessage:  conv.lastMessage,
          lastSeen:     conv.lastMessageTimestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        }),
          unreadCount
        };
      })
    );

    return res.json(contacts.filter(c => c));
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return res.status(500).json({ error: "Failed to fetch contacts" });
  }
};

