const mongoose = require("mongoose");

const groupKeySchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  // The user who encrypted this key (usually the group creator)
  // This helps with debugging and understanding the encryption flow
  encryptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false // Made optional for backward compatibility
  },
  // The group's AES key encrypted with this user's ECDH public key
  encryptedGroupKey: {
    type: String,
    required: true
  },
  // IV used for encrypting the group key
  iv: {
    type: String,
    required: true
  },
  // Auth tag for AES-GCM encryption of the group key
  authTag: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure one encrypted key per user per group
groupKeySchema.index({ groupId: 1, userId: 1 }, { unique: true });

// Update the updatedAt field before saving
groupKeySchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.GroupKey || mongoose.model("GroupKey", groupKeySchema);
