import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from './axiosInstance';
import { toast } from "react-hot-toast";

// Async thunks
export const fetchUsers = createAsyncThunk(
  "chat/fetchUsers",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get("/messages/users");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      thunkAPI.rejectWithValue(message);
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (userId, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/messages/${userId}`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ userId, messageData }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(
        `/messages/send/${userId}`,
        messageData
      );
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Slice
const chatSlice = createSlice({
  name: "chat",
  initialState: {
    users: [],
    messages: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    error: null,
  },
  reducers: {
    setSelectedUser: (state, action) => {
      state.selectedUser = action.payload;
    },
    clearChatState: (state) => {
      state.users = [];
      state.messages = [];
      state.selectedUser = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchUsers
      .addCase(fetchUsers.pending, (state) => {
        state.isUsersLoading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.isUsersLoading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isUsersLoading = false;
        state.error = action.payload;
      })
      // fetchMessages
      .addCase(fetchMessages.pending, (state) => {
        state.isMessagesLoading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isMessagesLoading = false;
        state.messages = action.payload;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isMessagesLoading = false;
        state.error = action.payload;
      })
      // sendMessage
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.messages.push(action.payload);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const { setSelectedUser, clearChatState } = chatSlice.actions;
export default chatSlice.reducer;