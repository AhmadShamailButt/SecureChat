const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^[a-zA-Z0-9._%+-]+@lhr.nu\.edu\.pk$/, "Must be a valid FAST NUCES email"]
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  gender: {
    type: String,
    required: true
  },
  rating: { 
    type: Number,
    default: 0 
  },
  rides_taken: {
    type: Number, 
    default: 0 
  },
  rides_offered: {
    type: Number,
    default: 0 
  },
  resetCode: String,  
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  profilePicture: {
    type: String, // base64 image string
    default: '',
  },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);

