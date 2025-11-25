const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { isConnected } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf";

// @route   POST /login
// @desc    Authenticate user and return JWT + user data (except password)
router.post("/", async (req, res) => {
  console.log("Incoming sign in body:", req.body);
  const { email, password } = req.body;

  // Check if MongoDB is connected
  if (!isConnected() && mongoose.connection.readyState !== 1) {
    console.error("MongoDB not connected. ReadyState:", mongoose.connection.readyState);
    return res.status(503).json({ 
      error: "Database connection unavailable. Please ensure MongoDB is running." 
    });
  }

  try {
    // 1. Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found for email:", email);
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // Debug: Check if password exists
    if (!user.password) {
      console.error("User password is missing for email:", email);
      return res.status(500).json({ error: "User account error. Please contact support." });
    }

    // Debug: Log password hash format
    console.log("Stored password hash format:", user.password.substring(0, 10));

    // 2. Validate password
    if (!password) {
      console.log("Password is missing in request");
      return res.status(400).json({ error: "Password is required." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password comparison result:", isMatch);
    
    if (!isMatch) {
      console.log("Password incorrect for email:", email);
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // 3. Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 4. Send user info (excluding password)
    res.status(200).json({
      message: "Sign in successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        department: user.department,
        gender: user.gender,
        rating: user.rating || 0,
        rides_taken: user.rides_taken || 0,
        rides_offered: user.rides_offered || 0,
      },
    });
  } catch (err) {
    console.error("SignIn Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

