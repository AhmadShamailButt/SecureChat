const socketIo = require("socket.io");
const User = require("../models/User");
const Call = require("../models/Call");
const mongoose = require("mongoose");
const { isConnected } = require("./database");
let io;

exports.init = (server, corsOptions) => {
  io = socketIo(server, { 
    cors: corsOptions || { origin: "*", methods: ["GET", "POST"], credentials: true },
    transports: ['websocket','polling'],
    pingTimeout: 30000,
    pingInterval: 10000
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Track which rooms this socket has joined
    const joinedRooms = new Set();
    // Track socket's user identifier
    let socketUser = null;

    // Handle user online status
    socket.on("userOnline", async (data) => {
      const userId = data.userId;
      if (!userId) return;

      // Wait for MongoDB connection with retry
      const updateUserStatus = async (retries = 5) => {
        if (isConnected() || mongoose.connection.readyState === 1) {
          try {
            // Update user's online status
            await User.findByIdAndUpdate(userId, {
              isOnline: true,
              lastSeen: new Date()
            });

            // Notify all other users that this user is now online
            socket.broadcast.emit("userStatusChanged", {
              userId: userId,
              isOnline: true,
              lastSeen: new Date()
            });

            console.log(`User ${userId} is now online`);
          } catch (error) {
            console.error("Error updating user online status:", error);
          }
        } else if (retries > 0) {
          // Retry after 500ms if MongoDB is not connected yet
          setTimeout(() => updateUserStatus(retries - 1), 500);
        } else {
          console.log("MongoDB not connected after retries, skipping user online status update");
        }
      };

      updateUserStatus();
    });

    socket.on("join", (data) => {
      // Handle joining with user information
      const conversationId = data.conversationId || data;
      const userId = data.userId || null;
      
      // Handle sample- prefix if still present in frontend
      const roomId = conversationId.startsWith('sample-') 
        ? conversationId.replace('sample-', '') 
        : conversationId;
        
      console.log(`Socket ${socket.id} joining room ${roomId}`);
      
      // Store user identifier if provided
      if (userId) {
        socketUser = userId;
        console.log(`Socket ${socket.id} associated with user ${userId}`);
        
        // Join user-specific room for receiving read receipts and status updates
        socket.join(userId.toString());
        console.log(`Socket ${socket.id} joined user room: ${userId}`);
        
        // Mark user as online when they join (with retry if MongoDB not ready)
        const updateStatusOnJoin = async (retries = 5) => {
          if (isConnected() || mongoose.connection.readyState === 1) {
            try {
              await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastSeen: new Date()
              });
              
              // Notify all other users
              socket.broadcast.emit("userStatusChanged", {
                userId: userId,
                isOnline: true,
                lastSeen: new Date()
              });
            } catch (err) {
              console.error("Error updating user online status on join:", err);
            }
          } else if (retries > 0) {
            // Retry after 500ms if MongoDB is not connected yet
            setTimeout(() => updateStatusOnJoin(retries - 1), 500);
          }
        };
        
        updateStatusOnJoin();
      }
      
      // Add to our tracking set
      joinedRooms.add(roomId);
      
      // Join the socket room
      socket.join(roomId);
      
      // Confirm join to client
      socket.emit('joined', { room: roomId });
    });

    // Listen for sendMessage but DON'T emit back to sender
    socket.on("sendMessage", (msg) => {
      // Ensure we're using the normalized conversation ID
      let conversationId = msg.conversationId;
      if (conversationId.startsWith('sample-')) {
        conversationId = conversationId.replace('sample-', '');
      }
      
      
      console.log(`Broadcasting message from ${socket.id} (user: ${msg.senderId || 'unknown'}) to room ${conversationId}`);
      
      // Only broadcast to OTHER clients in the room
      // Make sure we're not sending back to the original sender
      socket.broadcast.to(conversationId).emit("newMessage", msg);
    });

    socket.on("disconnect", async () => {
      console.log("Client disconnected:", socket.id);
      
      // Mark user as offline if we have their userId (only if MongoDB is connected)
      if (socketUser && (isConnected() || mongoose.connection.readyState === 1)) {
        try {
          await User.findByIdAndUpdate(socketUser, {
            isOnline: false,
            lastSeen: new Date()
          });

          // Notify all other users that this user is now offline
          socket.broadcast.emit("userStatusChanged", {
            userId: socketUser,
            isOnline: false,
            lastSeen: new Date()
          });

          console.log(`User ${socketUser} is now offline`);
        } catch (error) {
          console.error("Error updating user offline status:", error);
        }
      }
      
      // Clean up our tracking
      joinedRooms.clear();
      socketUser = null;
    });

    // Voice Call Events
    socket.on("voice-call:initiate", async (data) => {
      try {
        const { callerId, receiverId, callerName } = data;

        // Validate required fields
        if (!callerId || !receiverId) {
          console.error(`[BACKEND] Missing required fields: callerId=${callerId}, receiverId=${receiverId}`);
          socket.emit("voice-call:error", { message: "Missing caller or receiver ID" });
          return;
        }

        // Prevent self-calling
        if (callerId === receiverId || callerId.toString() === receiverId.toString()) {
          console.error(`[BACKEND] Self-calling attempt blocked: ${callerId}`);
          socket.emit("voice-call:error", { message: "Cannot call yourself" });
          return;
        }

        // Create proper conversation ID from both user IDs (sorted to ensure consistency)
        const sortedIds = [callerId.toString(), receiverId.toString()].sort();
        const conversationId = `conv_${sortedIds[0]}_${sortedIds[1]}`;

        console.log(`[BACKEND] Voice call initiation from ${callerId} to ${receiverId}`);
        console.log(`[BACKEND] Conversation ID: ${conversationId}`);

        // Create call record with 'missed' status initially
        const call = await Call.create({
          callerId,
          receiverId,
          conversationId,
          callType: 'voice',
          status: 'missed',
          initiatedBy: callerId,
          startTime: new Date()
        });

        console.log(`[BACKEND] Call record created: ${call._id}`);
        console.log(`[BACKEND] Call saved to database:`, {
          callId: call._id.toString(),
          callerId: call.callerId.toString(),
          receiverId: call.receiverId.toString(),
          status: call.status,
          timestamp: call.timestamp
        });

        // Emit incoming call to receiver's USER ROOM ONLY (not conversation room!)
        io.to(receiverId.toString()).emit("voice-call:incoming", {
          callId: call._id.toString(),
          callerId,
          callerName,
          conversationId
        });

        console.log(`[BACKEND] Incoming call event sent to receiver user room: ${receiverId}`);

        // Confirm to caller's USER ROOM ONLY
        io.to(callerId.toString()).emit("voice-call:initiated", {
          callId: call._id.toString(),
          conversationId
        });

        console.log(`[BACKEND] Call initiated confirmation sent to caller user room: ${callerId}`);

        // Set timeout to mark call as missed if not answered within 25 seconds
        setTimeout(async () => {
          try {
            const currentCall = await Call.findById(call._id);
            // Only mark as missed if still in 'missed' status (not answered or declined)
            if (currentCall && currentCall.status === 'missed') {
              await Call.findByIdAndUpdate(
                call._id,
                {
                  status: 'missed',
                  endTime: new Date()
                },
                { new: true }
              );
              console.log(`[BACKEND] Call ${call._id} automatically marked as missed after 25s timeout`);
              
              // Notify caller that call was missed (timeout)
              io.to(callerId.toString()).emit("voice-call:declined", {
                callId: call._id.toString(),
                isTimeout: true,
                status: 'missed'
              });
            }
          } catch (error) {
            console.error(`[BACKEND] Error in call timeout handler:`, error);
          }
        }, 25000); // 25 seconds
      } catch (error) {
        console.error("[BACKEND] Error initiating voice call:", error);
        socket.emit("voice-call:error", { message: "Failed to initiate call" });
      }
    });

    socket.on("voice-call:accept", async (data) => {
      try {
        const { callId, receiverId } = data;

        // Update call status to 'answered'
        const updatedCall = await Call.findByIdAndUpdate(
          callId,
          {
            status: 'answered',
            startTime: new Date()
          },
          { new: true } // Return updated document
        );

        if (!updatedCall) {
          console.error(`[BACKEND] Failed to update call ${callId} to answered`);
          socket.emit("voice-call:error", { message: "Failed to accept call" });
          return;
        }

        // Verify the call was saved
        const savedCall = await Call.findById(callId);
        if (savedCall) {
          console.log(`[BACKEND] Call ${callId} saved as answered:`, {
            status: savedCall.status,
            timestamp: savedCall.timestamp
          });
        }

        // Get call to find caller
        const call = await Call.findById(callId);

        // Notify BOTH caller and receiver that call was accepted
        io.to(call.callerId.toString()).emit("voice-call:accepted", {
          callId
        });

        // Also notify the receiver (for confirmation)
        io.to(receiverId.toString()).emit("voice-call:accepted", {
          callId
        });

        console.log(`[BACKEND] Call ${callId} accepted by ${receiverId}`);
      } catch (error) {
        console.error("[BACKEND] Error accepting call:", error);
        socket.emit("voice-call:error", { message: "Failed to accept call" });
      }
    });

    socket.on("voice-call:decline", async (data) => {
      try {
        const { callId, receiverId, isTimeout } = data;

        // If it's a timeout, mark as missed; otherwise mark as declined
        const status = isTimeout ? 'missed' : 'declined';

        // Update call status
        const updatedCall = await Call.findByIdAndUpdate(
          callId,
          {
            status: status,
            endTime: new Date()
          },
          { new: true } // Return updated document
        );

        if (!updatedCall) {
          console.error(`[BACKEND] Failed to update call ${callId} to ${status}`);
          socket.emit("voice-call:error", { message: `Failed to ${status} call` });
          return;
        }

        // Verify the call was saved
        const savedCall = await Call.findById(callId);
        if (savedCall) {
          console.log(`[BACKEND] Call ${callId} saved as ${status}:`, {
            status: savedCall.status,
            timestamp: savedCall.timestamp
          });
        }

        // Get call to find caller
        const call = await Call.findById(callId);

        // Notify caller that call was declined/missed
        io.to(call.callerId.toString()).emit("voice-call:declined", {
          callId,
          isTimeout: isTimeout || false,
          status: status
        });

        console.log(`[BACKEND] Call ${callId} ${status} by ${receiverId || 'timeout'}`);
      } catch (error) {
        console.error("[BACKEND] Error declining call:", error);
        socket.emit("voice-call:error", { message: "Failed to decline call" });
      }
    });

    socket.on("voice-call:end", async (data) => {
      try {
        const { callId, userId, duration } = data;

        // Get current call to preserve status
        const call = await Call.findById(callId);
        
        if (!call) {
          console.error(`[BACKEND] Call ${callId} not found`);
          return;
        }

        // Update call with end time and duration
        // Preserve the status (answered, declined, etc.) - don't overwrite it
        const updatedCall = await Call.findByIdAndUpdate(
          callId,
          {
            endTime: new Date(),
            duration: duration || 0
            // Status is already set (answered/declined/missed) - don't change it
          },
          { new: true } // Return updated document
        );

        if (!updatedCall) {
          console.error(`[BACKEND] Failed to update call ${callId}`);
          return;
        }

        // Verify the call was saved
        const savedCall = await Call.findById(callId);
        if (savedCall) {
          console.log(`[BACKEND] Call ${callId} saved successfully:`, {
            status: savedCall.status,
            duration: savedCall.duration,
            endTime: savedCall.endTime,
            timestamp: savedCall.timestamp
          });
        }

        // Notify both parties
        io.to(call.callerId.toString()).emit("voice-call:ended", { callId });
        io.to(call.receiverId.toString()).emit("voice-call:ended", { callId });

        console.log(`[BACKEND] Call ${callId} ended by ${userId}, duration: ${duration}s, status: ${call.status}`);
      } catch (error) {
        console.error("[BACKEND] Error ending call:", error);
        socket.emit("voice-call:error", { message: "Failed to save call to database" });
      }
    });

    // WebRTC Signaling Events
    socket.on("voice-call:offer", async (data) => {
      const { offer, callId, from, to } = data;

      // Fix 5: Validate sender is authenticated and matches 'from' field
      if (!socketUser || socketUser.toString() !== from.toString()) {
        console.error('[SIGNALING] Unauthorized offer attempt:', { socketUser, from });
        socket.emit('voice-call:error', { message: 'Unauthorized signaling attempt' });
        return;
      }

      // Fix 5: Validate call exists and sender is a participant
      try {
        const call = await Call.findById(callId);
        if (!call) {
          console.error('[SIGNALING] Call not found:', callId);
          socket.emit('voice-call:error', { message: 'Call not found' });
          return;
        }

        if (call.callerId.toString() !== from.toString() &&
            call.receiverId.toString() !== from.toString()) {
          console.error('[SIGNALING] User not participant in call:', { from, callId });
          socket.emit('voice-call:error', { message: 'Not a participant in this call' });
          return;
        }

        // Forward offer to receiver
        io.to(to.toString()).emit("voice-call:offer", {
          offer,
          callId,
          from
        });

        console.log(`[SIGNALING] WebRTC offer forwarded from ${from} to ${to}`);
      } catch (err) {
        console.error('[SIGNALING] Error validating call:', err);
        socket.emit('voice-call:error', { message: 'Failed to validate call' });
      }
    });

    socket.on("voice-call:answer", async (data) => {
      const { answer, callId, from, to } = data;

      // Fix 5: Validate sender is authenticated and matches 'from' field
      if (!socketUser || socketUser.toString() !== from.toString()) {
        console.error('[SIGNALING] Unauthorized answer attempt:', { socketUser, from });
        socket.emit('voice-call:error', { message: 'Unauthorized signaling attempt' });
        return;
      }

      // Fix 5: Validate call exists and sender is a participant
      try {
        const call = await Call.findById(callId);
        if (!call) {
          console.error('[SIGNALING] Call not found:', callId);
          socket.emit('voice-call:error', { message: 'Call not found' });
          return;
        }

        if (call.callerId.toString() !== from.toString() &&
            call.receiverId.toString() !== from.toString()) {
          console.error('[SIGNALING] User not participant in call:', { from, callId });
          socket.emit('voice-call:error', { message: 'Not a participant in this call' });
          return;
        }

        // Forward answer to caller
        io.to(to.toString()).emit("voice-call:answer", {
          answer,
          callId,
          from
        });

        console.log(`[SIGNALING] WebRTC answer forwarded from ${from} to ${to}`);
      } catch (err) {
        console.error('[SIGNALING] Error validating call:', err);
        socket.emit('voice-call:error', { message: 'Failed to validate call' });
      }
    });

    socket.on("voice-call:ice-candidate", (data) => {
      const { candidate, callId, from, to } = data;

      // Fix 5: Validate sender is authenticated and matches 'from' field
      // Note: We don't validate the call for ICE candidates as it's too expensive
      // (many candidates are sent during connection setup)
      if (!socketUser || socketUser.toString() !== from.toString()) {
        console.error('[SIGNALING] Unauthorized ICE candidate attempt:', { socketUser, from });
        return; // Silently drop - ICE candidates are not critical
      }

      // Forward ICE candidate to other party
      io.to(to.toString()).emit("voice-call:ice-candidate", {
        candidate,
        callId,
        from
      });
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });
  });

  return io;
};

exports.getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

