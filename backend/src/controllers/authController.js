const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { isConnected } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf";

router.post("/", async (req, res) => {
  const { fullName, department, email, password, gender } = req.body;

  // Check if MongoDB is connected
  if (!isConnected() && mongoose.connection.readyState !== 1) {
    console.error("MongoDB not connected. ReadyState:", mongoose.connection.readyState);
    return res.status(503).json({ 
      error: "Database connection unavailable. Please ensure MongoDB is running." 
    });
  }

  if (!email.endsWith("@lhr.nu.edu.pk")) {
    return res.status(400).json({ error: "Only FAST NUCES emails allowed." });
  }

  if (!gender || !["male", "female", "other"].includes(gender.toLowerCase())) {
    return res.status(400).json({ error: "Invalid gender." });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      department,
      email,
      password: hashedPassword,
      gender,
      rating: 0,
      rides_taken: 0,
      rides_offered: 0,
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        department: newUser.department,
        gender: newUser.gender,
        rating: newUser.rating,
        rides_taken: newUser.rides_taken,
        rides_offered: newUser.rides_offered,
      },
    });
  } catch (err) {
    console.error("Signup error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = { router };

