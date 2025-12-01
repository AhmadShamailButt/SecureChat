const mongoose = require('mongoose');

const fileMetadataSchema = new mongoose.Schema({
  fileId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true,
    maxLength: 255
  },
  fileSize: {
    type: Number,
    required: true,
    min: 1
  },
  mimeType: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: true,
    unique: true
  },
  // Encrypted symmetric key for this file (encrypted with recipient's public key)
  encryptedFileKey: {
    type: String,
    required: true
  },
  // IV used for file encryption
  iv: {
    type: String,
    required: true
  },
  // Hash of the encrypted file for integrity verification
  fileHash: {
    type: String,
    required: true
  },
  uploadStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  uploadedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 } // MongoDB TTL index
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
fileMetadataSchema.index({ senderId: 1, createdAt: -1 });
fileMetadataSchema.index({ receiverId: 1, createdAt: -1 });
fileMetadataSchema.index({ conversationId: 1, createdAt: -1 });
fileMetadataSchema.index({ uploadStatus: 1, createdAt: -1 });

// Pre-save middleware to set expiration date (optional: files expire after 90 days)
fileMetadataSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    // Set expiration to 90 days from now (configurable)
    const expirationDays = parseInt(process.env.FILE_EXPIRATION_DAYS) || 90;
    this.expiresAt = new Date(Date.now() + (expirationDays * 24 * 60 * 60 * 1000));
  }
  next();
});

// Instance methods
fileMetadataSchema.methods.isAccessibleBy = function(userId) {
  return this.senderId.equals(userId) || this.receiverId.equals(userId);
};

fileMetadataSchema.methods.canBeDeletedBy = function(userId) {
  return this.senderId.equals(userId);
};

// Static methods
fileMetadataSchema.statics.findByConversation = function(conversationId, limit = 50) {
  return this.find({ 
    conversationId, 
    uploadStatus: 'completed' 
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('senderId', 'username email')
  .populate('receiverId', 'username email');
};

fileMetadataSchema.statics.findByUser = function(userId, limit = 100) {
  return this.find({
    $or: [{ senderId: userId }, { receiverId: userId }],
    uploadStatus: 'completed'
  })
  .sort({ createdAt: -1 })
  .limit(limit);
};

fileMetadataSchema.statics.findPendingUploads = function(olderThanMinutes = 30) {
  const cutoffTime = new Date(Date.now() - (olderThanMinutes * 60 * 1000));
  return this.find({
    uploadStatus: 'pending',
    createdAt: { $lt: cutoffTime }
  });
};

module.exports = mongoose.model('FileMetadata', fileMetadataSchema);