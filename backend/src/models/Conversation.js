// backend/models/Conversation.js

const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }],
  lastMessage: {
    type: String,
    default: ""
  },
  lastMessageTimestamp: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save: sort IDs lexicographically → deterministic [A,B] vs [B,A]
conversationSchema.pre("save", function(next) {
  const sorted = this.participants
    .map(id => id.toString())
    .sort();
  this.participants = sorted.map(id => new mongoose.Types.ObjectId(id));
  next();
});

// Unique compound index on the ordered pair
conversationSchema.index(
  { "participants.0": 1, "participants.1": 1 },
  { unique: true }
);

module.exports = mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);

