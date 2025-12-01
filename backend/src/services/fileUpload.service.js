const s3 = require('../config/aws.config');
const { v4: uuidv4 } = require('uuid');

class FileUploadService {
  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024; // 100MB default
  }

  /**
   * Generate pre-signed URL for file upload
   * @param {string} userId - User ID uploading the file
   * @param {string} fileName - Original file name
   * @param {number} fileSize - File size in bytes
   * @param {string} mimeType - File MIME type
   * @returns {object} Upload URL and metadata
   */
  async generatePresignedUploadUrl(userId, fileName, fileSize, mimeType) {
    if (fileSize > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    if (!this.bucketName) {
      throw new Error('S3 bucket name not configured. Please set S3_BUCKET_NAME in environment variables.');
    }

    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables.');
    }

    const fileId = uuidv4();
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const fileKey = `${userId}/${fileId}/${sanitizedFileName}`;

    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: 300, // 5 minutes
      ContentType: mimeType,
      Metadata: {
        'user-id': userId.toString(),
        'file-id': fileId,
        'original-name': fileName
      }
    };

    try {
      const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

      return {
        uploadUrl,
        fileId,
        fileKey,
        expiresIn: 300
      };
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      throw new Error('Failed to generate upload URL');
    }
  }

  /**
   * Generate pre-signed URL for file download
   * @param {string} fileKey - S3 object key
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {string} Download URL
   */
  async generatePresignedDownloadUrl(fileKey, expiresIn = 3600) {
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: expiresIn
    };

    try {
      const downloadUrl = await s3.getSignedUrlPromise('getObject', params);
      return downloadUrl;
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Delete file from S3
   * @param {string} fileKey - S3 object key
   * @returns {boolean} Success status
   */
  async deleteFile(fileKey) {
    const params = {
      Bucket: this.bucketName,
      Key: fileKey
    };

    try {
      await s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Get file metadata from S3
   * @param {string} fileKey - S3 object key
   * @returns {object} File metadata
   */
  async getFileMetadata(fileKey) {
    const params = {
      Bucket: this.bucketName,
      Key: fileKey
    };

    try {
      const metadata = await s3.headObject(params).promise();
      return metadata;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error('File not found or inaccessible');
    }
  }

  /**
   * Sanitize file name to prevent path traversal and invalid characters
   * @param {string} fileName - Original file name
   * @returns {string} Sanitized file name
   */
  sanitizeFileName(fileName) {
    // Remove path separators and dangerous characters
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .substring(0, 255);
  }

  /**
   * Validate file type against allowed MIME types
   * @param {string} mimeType - File MIME type
   * @returns {boolean} Is valid file type
   */
  isValidFileType(mimeType) {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/webm', 'video/quicktime', 'video/avi',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed'
    ];

    return allowedTypes.includes(mimeType);
  }
}

module.exports = new FileUploadService();