const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversationId: {
    type: String,
    required: true
  },
  callType: {
    type: String,
    enum: ['voice', 'video'],
    default: 'voice'
  },
  status: {
    type: String,
    enum: ['missed', 'answered', 'declined', 'failed'],
    default: 'missed'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for faster queries
callSchema.index({ callerId: 1, receiverId: 1 });
callSchema.index({ timestamp: -1 });

const Call = mongoose.model('Call', callSchema);

module.exports = Call;




