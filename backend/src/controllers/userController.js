const User = require("../models/User");
const CryptoService = require("../services/cryptoService");

exports.getUserDetails = async (req, res) => {
  try {
    const { id: userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Update user's public key for E2EE
 */
exports.updatePublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
    const userId = req.user.userId; // from auth middleware - FIXED!

    if (!publicKey) {
      return res.status(400).json({ error: "Public key is required" });
    }

    // Validate public key format
    if (!CryptoService.isValidPublicKey(publicKey)) {
      return res.status(400).json({ error: "Invalid public key format" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { publicKey },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ 
      message: "Public key updated successfully",
      publicKey: user.publicKey 
    });
  } catch (error) {
    console.error("Error updating public key:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Get user's public key
 */
exports.getPublicKey = async (req, res) => {
  try {
    const { id: userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(userId).select("publicKey fullName");
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.publicKey) {
      return res.status(404).json({ error: "User has not set up encryption yet" });
    }

    res.status(200).json({ 
      publicKey: user.publicKey,
      userId: user._id,
      fullName: user.fullName
    });
  } catch (error) {
    console.error("Error fetching public key:", error);
    res.status(500).json({ error: "Server error" });
  }
};
