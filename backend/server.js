const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const http = require("http");
const connectDB = require("./src/config/database");
const { init: initSocket } = require("./src/config/socket");

// Routes
const authRoutes = require("./src/routes/authRoutes");
const messageRoutes = require("./src/routes/messageRoutes");

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

// Allow multiple localhost ports for development
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',')
  : ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"];

const io = initSocket(server, {
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for development
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

// Attach io to requests so controllers can emit
app.use((req, _, next) => {
  req.io = io;
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", messageRoutes);

app.get("/", (req, res) => {
  res.send("SecureChat API is running");
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

