const socketIo = require("socket.io");
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

    // Handle file upload notifications
    socket.on("fileUploaded", (data) => {
      const { conversationId, fileMetadata, receiverId } = data;
      console.log(`File uploaded notification for conversation ${conversationId}`);
      
      // Notify the receiver about the new file
      socket.broadcast.to(conversationId).emit("fileReceived", {
        fileMetadata,
        senderId: socketUser,
        timestamp: new Date()
      });
    });

    // File sharing events
    socket.on("file:uploaded", (data) => {
      const { conversationId, receiverId, fileMetadata } = data;
      
      // Normalize conversation ID
      let normalizedConversationId = conversationId;
      if (conversationId && conversationId.startsWith('sample-')) {
        normalizedConversationId = conversationId.replace('sample-', '');
      }
      
      console.log(`File uploaded notification from ${socket.id} to room ${normalizedConversationId}`);
      
      // Broadcast file notification to other participants in the conversation
      socket.broadcast.to(normalizedConversationId).emit("file:received", {
        senderId: socketUser,
        fileMetadata,
        conversationId: normalizedConversationId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on("file:download:start", (data) => {
      const { fileId, senderId } = data;
      
      console.log(`File download started: ${fileId} by ${socketUser}`);
      
      // Optionally notify the sender that their file is being downloaded
      if (senderId && senderId !== socketUser) {
        io.emit("file:download:notification", {
          fileId,
          downloaderId: socketUser,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle file sharing status updates
    socket.on("file:status:update", (data) => {
      const { fileId, status, conversationId } = data;
      
      let normalizedConversationId = conversationId;
      if (conversationId && conversationId.startsWith('sample-')) {
        normalizedConversationId = conversationId.replace('sample-', '');
      }
      
      // Broadcast status update to conversation participants
      socket.broadcast.to(normalizedConversationId).emit("file:status:changed", {
        fileId,
        status,
        userId: socketUser,
        timestamp: new Date().toISOString()
      });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // Clean up our tracking
      joinedRooms.clear();
      socketUser = null;
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