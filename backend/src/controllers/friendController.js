// backend/controllers/friendController.js

const User = require("../models/User");
const Friend = require("../models/Friend");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { isConnected } = require("../config/database");
const { isUserOnline } = require("../config/socket");

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
 * GET /api/friends
 * Get all friends for the current user
 */
exports.getFriends = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    // Check DB connection
    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Find all accepted friends for the current user
    const friendships = await Friend.find({
      userId: currentUserId,
      status: "accepted"
    }).populate("friendId", "fullName email gender department isOnline lastSeen");

    // Also get reverse friendships (where current user is the friend)
    const reverseFriendships = await Friend.find({
      friendId: currentUserId,
      status: "accepted"
    }).populate("userId", "fullName email gender department isOnline lastSeen");

    // Combine both directions
    const allFriends = [];

    // Process direct friendships (userId -> friendId)
    for (const friendship of friendships) {
      if (friendship.friendId) {
        const friend = friendship.friendId;
        
        // Find or create conversation
        let conversation = await Conversation.findOne({
          participants: { $all: [currentUserId, friend._id.toString()] }
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [currentUserId, friend._id.toString()],
            lastMessage: "",
            lastMessageTimestamp: new Date()
          });
          await conversation.save();
        }

        // Get unread count
        const unreadCount = await Message.countDocuments({
          conversationId: conversation._id.toString(),
          receiverId: currentUserId,
          read: false
        });

        // Verify online status against active socket connections
        // This ensures accuracy even if database is slightly out of sync
        const hasActiveSockets = isUserOnline(friend._id.toString());
        const actualOnlineStatus = hasActiveSockets !== null ? hasActiveSockets : (friend.isOnline || false);
        
        allFriends.push({
          id: conversation._id.toString(),
          userId: friend._id.toString(),
          name: friend.fullName,
          email: friend.email,
          department: friend.department,
          isOnline: actualOnlineStatus,
          lastMessage: conversation.lastMessage || "",
          lastSeen: friend.lastSeen || null,
          unreadCount
        });
      }
    }

    // Process reverse friendships (friendId -> userId)
    for (const friendship of reverseFriendships) {
      if (friendship.userId) {
        const friend = friendship.userId;
        
        // Check if we already added this friend (avoid duplicates)
        if (allFriends.some(f => f.userId === friend._id.toString())) {
          continue;
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
          participants: { $all: [currentUserId, friend._id.toString()] }
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [currentUserId, friend._id.toString()],
            lastMessage: "",
            lastMessageTimestamp: new Date()
          });
          await conversation.save();
        }

        // Get unread count
        const unreadCount = await Message.countDocuments({
          conversationId: conversation._id.toString(),
          receiverId: currentUserId,
          read: false
        });

        // Verify online status against active socket connections
        // This ensures accuracy even if database is slightly out of sync
        const hasActiveSockets = isUserOnline(friend._id.toString());
        const actualOnlineStatus = hasActiveSockets !== null ? hasActiveSockets : (friend.isOnline || false);
        
        allFriends.push({
          id: conversation._id.toString(),
          userId: friend._id.toString(),
          name: friend.fullName,
          email: friend.email,
          department: friend.department,
          isOnline: actualOnlineStatus,
          lastMessage: conversation.lastMessage || "",
          lastSeen: friend.lastSeen || null,
          unreadCount
        });
      }
    }

    // Sort by last message timestamp (most recent first), but keep all friends visible
    // Friends with messages come first, then friends without messages (sorted alphabetically)
    allFriends.sort((a, b) => {
      const aHasMessage = a.lastMessage && a.lastMessage.trim() !== "";
      const bHasMessage = b.lastMessage && b.lastMessage.trim() !== "";
      
      // If both have messages, sort by timestamp
      if (aHasMessage && bHasMessage) {
        if (!a.lastSeen && !b.lastSeen) return 0;
        if (!a.lastSeen) return 1;
        if (!b.lastSeen) return -1;
        return new Date(b.lastSeen) - new Date(a.lastSeen);
      }
      
      // If only one has messages, prioritize it
      if (aHasMessage && !bHasMessage) return -1;
      if (!aHasMessage && bHasMessage) return 1;
      
      // If neither has messages, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });

    return res.json(allFriends);
  } catch (error) {
    console.error("Error fetching friends:", error);
    return res.status(500).json({ error: "Failed to fetch friends" });
  }
};

/**
 * POST /api/friends/request
 * Send a friend request (creates pending request)
 */
exports.sendFriendRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { userId: targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: "Cannot send friend request to yourself" });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if friendship or request already exists
    const existingFriendship = await Friend.findOne({
      $or: [
        { userId: currentUserId, friendId: targetUserId },
        { userId: targetUserId, friendId: currentUserId }
      ]
    });

    if (existingFriendship) {
      if (existingFriendship.status === "accepted") {
        return res.status(400).json({ error: "Already friends" });
      }
      if (existingFriendship.status === "pending") {
        if (existingFriendship.userId.toString() === currentUserId) {
          return res.status(400).json({ error: "Friend request already sent" });
        } else {
          return res.status(400).json({ error: "This user has already sent you a friend request" });
        }
      }
      if (existingFriendship.status === "blocked") {
        return res.status(400).json({ error: "Cannot send request to blocked user" });
      }
    }

    // Create pending friend request (only one direction - from sender to receiver)
    const friendRequest = new Friend({
      userId: currentUserId,
      friendId: targetUserId,
      status: "pending"
    });

    await friendRequest.save();

    // Return request info
    res.json({
      message: "Friend request sent",
      requestId: friendRequest._id.toString(),
      fromUserId: currentUserId,
      toUserId: targetUserId,
      status: "pending"
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).json({ error: "Failed to send friend request" });
  }
};

/**
 * POST /api/friends/accept/:requestId
 * Accept a friend request (creates bidirectional friendship)
 */
exports.acceptFriendRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ error: "Request ID is required" });
    }

    // Find the pending request (should be where current user is the receiver)
    const friendRequest = await Friend.findOne({
      _id: requestId,
      friendId: currentUserId,
      status: "pending"
    }).populate("userId", "fullName email gender department isOnline");

    if (!friendRequest) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    const senderId = friendRequest.userId._id.toString();
    const sender = friendRequest.userId;

    // Update the existing request to accepted
    friendRequest.status = "accepted";
    await friendRequest.save();

    // Create reverse friendship (bidirectional)
    const reverseFriendship = new Friend({
      userId: currentUserId,
      friendId: senderId,
      status: "accepted"
    });
    await reverseFriendship.save();

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, senderId] }
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [currentUserId, senderId],
        lastMessage: "",
        lastMessageTimestamp: new Date()
      });
      await conversation.save();
    }

    // Return contact object
    // Verify online status against active socket connections
    const hasActiveSockets = isUserOnline(sender._id.toString());
    const actualOnlineStatus = hasActiveSockets !== null ? hasActiveSockets : (sender.isOnline || false);
    
    const newContact = {
      id: conversation._id.toString(),
      userId: sender._id.toString(),
      name: sender.fullName,
      email: sender.email,
      department: sender.department,
      isOnline: actualOnlineStatus,
      lastMessage: conversation.lastMessage || "",
      lastSeen: conversation.lastMessageTimestamp 
        ? conversation.lastMessageTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
        : "",
      unreadCount: 0
    };

    res.json({
      message: "Friend request accepted",
      contact: newContact
    });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    res.status(500).json({ error: "Failed to accept friend request" });
  }
};

/**
 * POST /api/friends/reject/:requestId
 * Reject a friend request (deletes the request)
 */
exports.rejectFriendRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ error: "Request ID is required" });
    }

    // Find and delete the pending request (where current user is the receiver)
    const friendRequest = await Friend.findOneAndDelete({
      _id: requestId,
      friendId: currentUserId,
      status: "pending"
    });

    if (!friendRequest) {
      return res.status(404).json({ error: "Friend request not found" });
    }

    res.json({ message: "Friend request rejected" });
  } catch (error) {
    console.error("Error rejecting friend request:", error);
    res.status(500).json({ error: "Failed to reject friend request" });
  }
};

/**
 * GET /api/friends/requests
 * Get all pending friend requests (both sent and received)
 */
exports.getFriendRequests = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    // Get received requests (where current user is the receiver)
    const receivedRequests = await Friend.find({
      friendId: currentUserId,
      status: "pending"
    }).populate("userId", "fullName email gender department isOnline profilePicture");

    // Get sent requests (where current user is the sender)
    const sentRequests = await Friend.find({
      userId: currentUserId,
      status: "pending"
    }).populate("friendId", "fullName email gender department isOnline profilePicture");

    // Format received requests
    const received = receivedRequests.map(req => {
      // Verify online status against active socket connections
      const hasActiveSockets = isUserOnline(req.userId._id.toString());
      const actualOnlineStatus = hasActiveSockets !== null ? hasActiveSockets : (req.userId.isOnline || false);
      
      return {
        id: req._id.toString(),
        requestId: req._id.toString(),
        userId: req.userId._id.toString(),
        name: req.userId.fullName,
        email: req.userId.email,
        department: req.userId.department,
        isOnline: actualOnlineStatus,
        profilePicture: req.userId.profilePicture || "",
        createdAt: req.createdAt,
        type: "received"
      };
    });

    // Format sent requests
    const sent = sentRequests.map(req => {
      // Verify online status against active socket connections
      const hasActiveSockets = isUserOnline(req.friendId._id.toString());
      const actualOnlineStatus = hasActiveSockets !== null ? hasActiveSockets : (req.friendId.isOnline || false);
      
      return {
        id: req._id.toString(),
        requestId: req._id.toString(),
        userId: req.friendId._id.toString(),
        name: req.friendId.fullName,
        email: req.friendId.email,
        department: req.friendId.department,
        isOnline: actualOnlineStatus,
        profilePicture: req.friendId.profilePicture || "",
        createdAt: req.createdAt,
        type: "sent"
      };
    });

    res.json({
      received: received,
      sent: sent
    });
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    res.status(500).json({ error: "Failed to fetch friend requests" });
  }
};

/**
 * POST /api/friends/add
 * DEPRECATED: Directly add friend (for backward compatibility)
 * Now creates a pending request instead
 */
exports.addFriend = async (req, res) => {
  // Redirect to sendFriendRequest for consistency
  return exports.sendFriendRequest(req, res);
};

/**
 * DELETE /api/friends/:friendId
 * Remove a friend (removes bidirectional friendship)
 */
exports.removeFriend = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { friendId } = req.params;
    if (!friendId) {
      return res.status(400).json({ error: "Friend ID is required" });
    }

    // Remove both directions of the friendship
    await Friend.deleteMany({
      $or: [
        { userId: currentUserId, friendId: friendId },
        { userId: friendId, friendId: currentUserId }
      ]
    });

    res.json({ message: "Friend removed successfully" });
  } catch (error) {
    console.error("Error removing friend:", error);
    res.status(500).json({ error: "Failed to remove friend" });
  }
};

/**
 * GET /api/friends/status/:userId
 * Check friendship status with a user
 */
exports.getFriendshipStatus = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { userId } = req.params;

    const friendship = await Friend.findOne({
      $or: [
        { userId: currentUserId, friendId: userId },
        { userId: userId, friendId: currentUserId }
      ]
    });

    if (!friendship) {
      return res.json({ status: "none" });
    }

    res.json({ status: friendship.status });
  } catch (error) {
    console.error("Error checking friendship status:", error);
    res.status(500).json({ error: "Failed to check friendship status" });
  }
};

