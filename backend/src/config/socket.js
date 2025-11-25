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

