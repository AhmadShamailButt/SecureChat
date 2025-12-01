const GroupMessage = require("../models/GroupMessage");
const GroupKey = require("../models/GroupKey");
const Group = require("../models/Group");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { isConnected } = require("../config/database");

/**
 * Helper to get current User ID from token
 */
const getUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  const JWT_SECRET = process.env.JWT_SECRET || "8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf";
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (error) {
    return null;
  }
};

/**
 * POST /api/groups/:groupId/messages
 * Send a message to a group
 */
exports.sendGroupMessage = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId } = req.params;
    const { text, encryptedData, iv, authTag, isEncrypted } = req.body;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Verify user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Create the message
    const message = new GroupMessage({
      groupId,
      senderId: currentUserId,
      text: text || "",
      encryptedData: encryptedData || "",
      iv: iv || "",
      authTag: authTag || "",
      isEncrypted: isEncrypted || false,
      timestamp: new Date()
    });

    await message.save();

    // Update group's last message
    await Group.findByIdAndUpdate(groupId, {
      lastMessage: isEncrypted ? "[Encrypted]" : text,
      lastMessageTimestamp: message.timestamp,
      updatedAt: new Date()
    });

    // Populate sender info
    await message.populate("senderId", "fullName email department isOnline");

    res.status(201).json({
      message: "Message sent successfully",
      groupMessage: {
        id: message._id.toString(),
        groupId: message.groupId.toString(),
        senderId: message.senderId._id.toString(),
        senderName: message.senderId.fullName,
        senderEmail: message.senderId.email,
        text: message.text,
        encryptedData: message.encryptedData,
        iv: message.iv,
        authTag: message.authTag,
        isEncrypted: message.isEncrypted,
        timestamp: message.timestamp,
        readBy: message.readBy
      }
    });
  } catch (error) {
    console.error("Error sending group message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

/**
 * GET /api/groups/:groupId/messages
 * Get all messages for a group
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Verify user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Build query
    const query = { groupId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    // Fetch messages
    const messages = await GroupMessage.find(query)
      .populate("senderId", "fullName email department isOnline")
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    const messagesList = messages.reverse().map(msg => ({
      id: msg._id.toString(),
      groupId: msg.groupId.toString(),
      senderId: msg.senderId._id.toString(),
      senderName: msg.senderId.fullName,
      senderEmail: msg.senderId.email,
      text: msg.text,
      encryptedData: msg.encryptedData,
      iv: msg.iv,
      authTag: msg.authTag,
      isEncrypted: msg.isEncrypted,
      timestamp: msg.timestamp,
      readBy: msg.readBy || []
    }));

    res.json(messagesList);
  } catch (error) {
    console.error("Error fetching group messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

/**
 * POST /api/groups/:groupId/keys
 * Store encrypted group key for a user (called when creating group or adding member)
 */
exports.storeGroupKey = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId } = req.params;
    const { userId, encryptedGroupKey, iv, authTag, encryptedBy } = req.body;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (!encryptedGroupKey || !iv || !authTag) {
      return res.status(400).json({ error: "Missing encryption data" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Verify current user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Verify target user is a member
    if (!group.members.includes(userId)) {
      return res.status(403).json({ error: "Target user is not a member of this group" });
    }

    // Store or update the encrypted group key
    const updateData = {
      encryptedGroupKey,
      iv,
      authTag,
      updatedAt: new Date()
    };

    // Add encryptedBy if provided (defaults to currentUserId for tracking)
    if (encryptedBy && mongoose.Types.ObjectId.isValid(encryptedBy)) {
      updateData.encryptedBy = encryptedBy;
    } else {
      updateData.encryptedBy = currentUserId;
    }

    const groupKey = await GroupKey.findOneAndUpdate(
      { groupId, userId },
      updateData,
      { upsert: true, new: true }
    );

    res.status(201).json({
      message: "Group key stored successfully",
      groupKeyId: groupKey._id.toString()
    });
  } catch (error) {
    console.error("Error storing group key:", error);
    res.status(500).json({ error: "Failed to store group key" });
  }
};

/**
 * GET /api/groups/:groupId/keys/:userId
 * Get encrypted group key for a specific user
 */
exports.getGroupKey = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId, userId } = req.params;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Users can only fetch their own group key
    if (currentUserId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only fetch your own group key" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Verify user is a member of the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Fetch the encrypted group key
    const groupKey = await GroupKey.findOne({ groupId, userId });
    if (!groupKey) {
      return res.status(404).json({ error: "Group key not found. Please contact group admin." });
    }

    res.json({
      groupId: groupKey.groupId.toString(),
      userId: groupKey.userId.toString(),
      encryptedGroupKey: groupKey.encryptedGroupKey,
      iv: groupKey.iv,
      authTag: groupKey.authTag,
      encryptedBy: groupKey.encryptedBy ? groupKey.encryptedBy.toString() : null
    });
  } catch (error) {
    console.error("Error fetching group key:", error);
    res.status(500).json({ error: "Failed to fetch group key" });
  }
};

/**
 * POST /api/groups/:groupId/messages/:messageId/read
 * Mark a message as read by current user
 */
exports.markMessageAsRead = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId, messageId } = req.params;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Verify user is a member
    const group = await Group.findById(groupId);
    if (!group || !group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Update message read status
    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if already read
    const alreadyRead = message.readBy.some(r => r.userId.toString() === currentUserId.toString());
    if (!alreadyRead) {
      message.readBy.push({
        userId: currentUserId,
        readAt: new Date()
      });
      await message.save();
    }

    res.json({ message: "Message marked as read" });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ error: "Failed to mark message as read" });
  }
};
