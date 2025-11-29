const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  isEncrypted: {
    type: Boolean,
    default: true
  },
  lastMessage: {
    type: String,
    default: ""
  },
  lastMessageTimestamp: {
    type: Date,
    default: null
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

// Index for faster queries
groupSchema.index({ members: 1 });
groupSchema.index({ createdBy: 1 });

// Update the updatedAt field before saving
groupSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);


