const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { tempUsers } = require("./authController");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

router.post("/verify", async (req, res) => {
  const { email, code } = req.body;

  const tempData = tempUsers.get(email);
  if (!tempData) return res.status(400).json({ error: "No signup attempt found." });

  if (tempData.code !== code) return res.status(400).json({ error: "Invalid verification code." });

  try {
    const newUser = new User({
      fullName: tempData.fullName,
      department: tempData.department,
      email: tempData.email,
      password: tempData.password,
      gender: tempData.gender,
      rating: 0,
      rides_taken: 0,
      rides_offered: 0
    });

    await newUser.save();
    tempUsers.delete(email);

    const token = jwt.sign({ userId: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: "1h" });

    res.status(201).json({
      message: "Account verified and created.",
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        department: newUser.department,
        gender: newUser.gender,
        rating: newUser.rating,
        rides_taken: newUser.rides_taken,
        rides_offered: newUser.rides_offered
      },
    });
  } catch (err) {
    res.status(500).json({ error: "User creation failed." });
  }
});

module.exports = router;

