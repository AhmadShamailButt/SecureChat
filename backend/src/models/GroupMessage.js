const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    default: ""
  },
  // Encryption fields
  encryptedData: {
    type: String,
    default: ""
  },
  iv: {
    type: String,
    default: ""
  },
  authTag: {
    type: String,
    default: ""
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Read receipts for group messages
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
});

// Compound index for efficient querying of group messages
groupMessageSchema.index({ groupId: 1, timestamp: 1 });

module.exports = mongoose.models.GroupMessage || mongoose.model("GroupMessage", groupMessageSchema);
