/**
 * Cleanup script to remove groups and messages without encryption keys
 * Run this to start fresh with proper encryption
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Group = require('./src/models/Group');
const GroupMessage = require('./src/models/GroupMessage');
const GroupKey = require('./src/models/GroupKey');

async function cleanup() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/securechat');
    console.log('✅ Connected to database\n');

    // Count current data
    const groupCount = await Group.countDocuments();
    const messageCount = await GroupMessage.countDocuments();
    const keyCount = await GroupKey.countDocuments();

    console.log('📊 Current state:');
    console.log(`   Groups: ${groupCount}`);
    console.log(`   Group Messages: ${messageCount}`);
    console.log(`   Group Keys: ${keyCount}\n`);

    if (keyCount === 0 && (groupCount > 0 || messageCount > 0)) {
      console.log('⚠️  Groups/messages exist but no encryption keys found!');
      console.log('🧹 Cleaning up broken data...\n');

      // Delete all group messages
      const deletedMessages = await GroupMessage.deleteMany({});
      console.log(`✅ Deleted ${deletedMessages.deletedCount} group messages`);

      // Delete all groups
      const deletedGroups = await Group.deleteMany({});
      console.log(`✅ Deleted ${deletedGroups.deletedCount} groups`);

      console.log('\n✨ Cleanup complete! You can now create new groups with proper encryption.');
    } else if (keyCount > 0) {
      console.log('✅ Encryption keys exist. Data looks healthy.');
      console.log('   No cleanup needed.');
    } else {
      console.log('ℹ️  No groups or messages found. Database is clean.');
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
