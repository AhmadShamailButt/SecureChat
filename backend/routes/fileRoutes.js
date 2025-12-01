const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const fileUploadService = require('../services/fileUpload.service');
const FileMetadata = require('../models/FileMetadata');
const authMiddleware = require('../middleware/authMiddleware');
const { validateFileUpload, validateFileDownload, validateFileDelete } = require('../middleware/fileValidation.middleware');
const { 
  uploadRateLimit, 
  downloadRateLimit, 
  securityLogger, 
  enhancedValidation, 
  scanFileContent 
} = require('../middleware/security.middleware');

// Use security middleware from security.middleware.js

/**
 * @route POST /api/files/upload/request
 * @desc Request pre-signed URL for file upload
 * @access Private
 */
router.post('/upload/request', authMiddleware, uploadRateLimit, enhancedValidation, scanFileContent, validateFileUpload, async (req, res) => {
  try {
    const { fileName, fileSize, mimeType, receiverId, conversationId, encryptedFileKey, iv, fileHash } = req.body;
    const userId = req.user._id;
    const ip = req.ip || req.connection.remoteAddress;

    // Log file upload attempt
    securityLogger.logFileUpload(userId, fileName, fileSize, ip);

    // Verify receiver exists
    const User = require('../models/User');
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    // Generate pre-signed URL
    const { uploadUrl, fileId, fileKey, expiresIn } = await fileUploadService.generatePresignedUploadUrl(
      userId.toString(),
      fileName,
      fileSize,
      mimeType
    );

    // Save metadata to database
    const fileMetadata = new FileMetadata({
      fileId,
      senderId: userId,
      receiverId,
      conversationId,
      fileName,
      fileSize,
      mimeType,
      s3Key: fileKey,
      encryptedFileKey,
      iv,
      fileHash,
      uploadStatus: 'pending'
    });

    await fileMetadata.save();

    res.status(200).json({
      success: true,
      uploadUrl,
      fileId,
      expiresIn,
      metadata: {
        fileId: fileMetadata.fileId,
        fileName: fileMetadata.fileName,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        createdAt: fileMetadata.createdAt
      }
    });

  } catch (error) {
    console.error('Upload request error:', error);
    res.status(500).json({ 
      error: 'Internal server error during upload request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/files/upload/complete
 * @desc Confirm upload completion
 * @access Private
 */
router.post('/upload/complete', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.body;
    const userId = req.user._id;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const fileMetadata = await FileMetadata.findOne({ 
      fileId, 
      senderId: userId 
    });

    if (!fileMetadata) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    if (fileMetadata.uploadStatus === 'completed') {
      return res.status(400).json({ error: 'Upload already completed' });
    }

    // Verify file exists in S3
    try {
      await fileUploadService.getFileMetadata(fileMetadata.s3Key);
    } catch (error) {
      fileMetadata.uploadStatus = 'failed';
      await fileMetadata.save();
      return res.status(400).json({ error: 'File not found in storage' });
    }

    // Update status
    fileMetadata.uploadStatus = 'completed';
    fileMetadata.uploadedAt = new Date();
    await fileMetadata.save();

    res.status(200).json({ 
      success: true, 
      message: 'Upload completed successfully',
      fileMetadata: {
        fileId: fileMetadata.fileId,
        fileName: fileMetadata.fileName,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        uploadedAt: fileMetadata.uploadedAt
      }
    });

  } catch (error) {
    console.error('Upload complete error:', error);
    res.status(500).json({ 
      error: 'Internal server error during upload completion',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/files/download/:fileId
 * @desc Get download URL for file
 * @access Private
 */
router.get('/download/:fileId', authMiddleware, downloadRateLimit, enhancedValidation, validateFileDownload, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;
    const ip = req.ip || req.connection.remoteAddress;

    // Log download attempt
    securityLogger.logFileDownload(userId, fileId, ip);

    const fileMetadata = await FileMetadata.findOne({
      fileId,
      $or: [{ senderId: userId }, { receiverId: userId }]
    });

    if (!fileMetadata) {
      securityLogger.logUnauthorizedAccess(userId, fileId, ip);
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    if (fileMetadata.uploadStatus !== 'completed') {
      return res.status(400).json({ error: 'File upload not completed' });
    }

    // Check if file has expired
    if (fileMetadata.expiresAt && fileMetadata.expiresAt < new Date()) {
      return res.status(410).json({ error: 'File has expired' });
    }

    const downloadUrl = await fileUploadService.generatePresignedDownloadUrl(
      fileMetadata.s3Key, 
      3600 // 1 hour expiry
    );

    res.status(200).json({
      success: true,
      downloadUrl,
      metadata: {
        fileName: fileMetadata.fileName,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        encryptedFileKey: fileMetadata.encryptedFileKey,
        iv: fileMetadata.iv,
        fileHash: fileMetadata.fileHash,
        uploadedAt: fileMetadata.uploadedAt
      }
    });

  } catch (error) {
    console.error('Download URL error:', error);
    res.status(500).json({ 
      error: 'Internal server error during download request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route DELETE /api/files/:fileId
 * @desc Delete file
 * @access Private
 */
router.delete('/:fileId', authMiddleware, validateFileDelete, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    const fileMetadata = await FileMetadata.findOne({ fileId, senderId: userId });

    if (!fileMetadata) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Delete from S3
    try {
      await fileUploadService.deleteFile(fileMetadata.s3Key);
    } catch (error) {
      console.error('Error deleting from S3:', error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    await fileMetadata.deleteOne();

    res.status(200).json({ 
      success: true, 
      message: 'File deleted successfully' 
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ 
      error: 'Internal server error during file deletion',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/files/conversation/:conversationId
 * @desc Get files in a conversation
 * @access Private
 */
router.get('/conversation/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 files
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    // Find files in conversation where user is sender or receiver
    const files = await FileMetadata.find({
      conversationId,
      uploadStatus: 'completed',
      $or: [{ senderId: userId }, { receiverId: userId }]
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username email')
    .select('-encryptedFileKey -iv -fileHash'); // Don't expose encryption data in list

    const total = await FileMetadata.countDocuments({
      conversationId,
      uploadStatus: 'completed',
      $or: [{ senderId: userId }, { receiverId: userId }]
    });

    res.status(200).json({
      success: true,
      files,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get conversation files error:', error);
    res.status(500).json({ 
      error: 'Internal server error while fetching files',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;