const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  encryptedData: {
    type: String, // Encrypted message ciphertext (base64)
    default: ''
  },
  iv: {
    type: String, // Initialization vector for AES-GCM (base64)
    default: ''
  },
  authTag: {
    type: String, // Authentication tag for AES-GCM (base64)
    default: ''
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  read: {
    type: Boolean,
    default: false
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
});

// Create a compound index on conversationId and timestamp
messageSchema.index({ conversationId: 1, timestamp: 1 });

module.exports = mongoose.models.Message || mongoose.model("Message", messageSchema);

