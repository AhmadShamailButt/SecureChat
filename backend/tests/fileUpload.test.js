const request = require('supertest');
const app = require('../server'); // Adjust path as needed
const FileMetadata = require('../models/FileMetadata');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

describe('File Upload API Tests', () => {
  let authToken;
  let userId;
  let receiverId;

  beforeEach(async () => {
    // Create test users
    const testUser1 = new User({
      username: 'testuser1',
      email: 'test1@example.com',
      password: 'hashedpassword'
    });
    
    const testUser2 = new User({
      username: 'testuser2', 
      email: 'test2@example.com',
      password: 'hashedpassword'
    });

    await testUser1.save();
    await testUser2.save();
    
    userId = testUser1._id;
    receiverId = testUser2._id;

    // Generate auth token
    authToken = jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');
  });

  afterEach(async () => {
    // Clean up test data
    await FileMetadata.deleteMany({});
    await User.deleteMany({});
  });

  describe('POST /api/files/upload/request', () => {
    test('should successfully request upload URL with valid data', async () => {
      const uploadData = {
        fileName: 'test-image.jpg',
        fileSize: 1024000, // 1MB
        mimeType: 'image/jpeg',
        receiverId: receiverId.toString(),
        conversationId: 'test-conversation-123',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'a'.repeat(64) // Mock SHA-256 hash
      };

      const response = await request(app)
        .post('/api/files/upload/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send(uploadData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.uploadUrl).toBeDefined();
      expect(response.body.fileId).toBeDefined();
      expect(response.body.expiresIn).toBe(300);
    });

    test('should reject upload with invalid file size', async () => {
      const uploadData = {
        fileName: 'large-file.jpg',
        fileSize: 200 * 1024 * 1024, // 200MB (exceeds 100MB limit)
        mimeType: 'image/jpeg',
        receiverId: receiverId.toString(),
        conversationId: 'test-conversation-123',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'a'.repeat(64)
      };

      await request(app)
        .post('/api/files/upload/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send(uploadData)
        .expect(400);
    });

    test('should reject upload with invalid file type', async () => {
      const uploadData = {
        fileName: 'malicious.exe',
        fileSize: 1024,
        mimeType: 'application/x-executable',
        receiverId: receiverId.toString(),
        conversationId: 'test-conversation-123',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'a'.repeat(64)
      };

      await request(app)
        .post('/api/files/upload/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send(uploadData)
        .expect(400);
    });

    test('should reject upload with missing required fields', async () => {
      const uploadData = {
        fileName: 'test.jpg',
        // Missing required fields
        mimeType: 'image/jpeg'
      };

      const response = await request(app)
        .post('/api/files/upload/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send(uploadData)
        .expect(400);

      expect(response.body.missingFields).toBeDefined();
    });

    test('should reject upload without authentication', async () => {
      const uploadData = {
        fileName: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        receiverId: receiverId.toString(),
        conversationId: 'test-conversation-123',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'a'.repeat(64)
      };

      await request(app)
        .post('/api/files/upload/request')
        .send(uploadData)
        .expect(401);
    });
  });

  describe('POST /api/files/upload/complete', () => {
    test('should complete upload successfully', async () => {
      // First create a pending file metadata
      const fileMetadata = new FileMetadata({
        fileId: 'test-file-id-123',
        senderId: userId,
        receiverId: receiverId,
        conversationId: 'test-conversation-123',
        fileName: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        s3Key: 'test/key/path',
        encryptedFileKey: 'encrypted-key-data',
        iv: 'iv-data',
        fileHash: 'file-hash',
        uploadStatus: 'pending'
      });

      await fileMetadata.save();

      const response = await request(app)
        .post('/api/files/upload/complete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ fileId: 'test-file-id-123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify status was updated
      const updatedMetadata = await FileMetadata.findOne({ fileId: 'test-file-id-123' });
      expect(updatedMetadata.uploadStatus).toBe('completed');
      expect(updatedMetadata.uploadedAt).toBeDefined();
    });
  });

  describe('GET /api/files/download/:fileId', () => {
    test('should generate download URL for authorized user', async () => {
      // Create completed file metadata
      const fileMetadata = new FileMetadata({
        fileId: 'test-download-file-123',
        senderId: userId,
        receiverId: receiverId,
        conversationId: 'test-conversation-123',
        fileName: 'test-download.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        s3Key: 'test/download/path',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'download-file-hash',
        uploadStatus: 'completed',
        uploadedAt: new Date()
      });

      await fileMetadata.save();

      const response = await request(app)
        .get('/api/files/download/test-download-file-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.downloadUrl).toBeDefined();
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.fileName).toBe('test-download.jpg');
    });

    test('should deny download for unauthorized user', async () => {
      // Create file metadata for different users
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com', 
        password: 'hashedpassword'
      });
      await otherUser.save();

      const fileMetadata = new FileMetadata({
        fileId: 'unauthorized-file-123',
        senderId: otherUser._id,
        receiverId: otherUser._id,
        conversationId: 'other-conversation',
        fileName: 'private-file.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        s3Key: 'private/file/path',
        encryptedFileKey: 'encrypted-key-data',
        iv: 'iv-data',
        fileHash: 'private-file-hash',
        uploadStatus: 'completed'
      });

      await fileMetadata.save();

      await request(app)
        .get('/api/files/download/unauthorized-file-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should enforce upload rate limiting', async () => {
      const uploadData = {
        fileName: 'rate-limit-test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        receiverId: receiverId.toString(),
        conversationId: 'test-conversation-123',
        encryptedFileKey: JSON.stringify({ key: [1,2,3], iv: [4,5,6] }),
        iv: JSON.stringify([7,8,9]),
        fileHash: 'a'.repeat(64)
      };

      // Make multiple requests rapidly
      const requests = Array(12).fill().map(() => 
        request(app)
          .post('/api/files/upload/request')
          .set('Authorization', `Bearer ${authToken}`)
          .send(uploadData)
      );

      const responses = await Promise.all(requests);
      
      // Some should succeed, others should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 30000); // Increase timeout for rate limiting tests
  });
});

module.exports = {
  // Export test utilities for integration testing
  createTestUser: async (userData) => {
    const user = new User(userData);
    return await user.save();
  },
  
  createTestFileMetadata: async (fileData) => {
    const metadata = new FileMetadata(fileData);
    return await metadata.save();
  },
  
  generateAuthToken: (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');
  }
};