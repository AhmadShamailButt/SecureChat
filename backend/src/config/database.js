const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/securechat';
    
    // Set buffer commands to false so operations fail immediately if not connected
    mongoose.set('bufferCommands', false);
    
    await mongoose.connect(mongoUri, {
      dbName: "SecureChatDB",
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
    });
    
    isConnected = true;
    console.log("✅ MongoDB connected");
    
    mongoose.connection.on('error', (err) => {
      console.error("❌ MongoDB connection error:", err.message);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn("⚠️  MongoDB disconnected");
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log("✅ MongoDB reconnected");
      isConnected = true;
    });
    
  } catch (error) {
    isConnected = false;
    console.error("❌ MongoDB connection failed:", error.message);
    console.error("⚠️  Make sure MongoDB is running or check your MONGODB_URI in .env file");
    console.error("💡 To start MongoDB:");
    console.error("   - Windows: Open MongoDB Compass or run 'mongod'");
    console.error("   - Or use MongoDB Atlas (cloud) and set MONGODB_URI in .env");
    // Don't exit in development - allow server to start without DB for testing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Helper function to check if MongoDB is connected
const checkConnection = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

module.exports = connectDB;
module.exports.isConnected = () => checkConnection();
