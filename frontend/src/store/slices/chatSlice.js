import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from '../axiosInstance';
import { toast } from "react-hot-toast";

// Async thunks
export const fetchContacts = createAsyncThunk(
  "chat/fetchContacts",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get("/messages/contacts");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (conversationId, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/messages/${conversationId}`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ conversationId, messageData }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(
        `/messages`,
        messageData
      );
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Slice
const chatSlice = createSlice({
  name: "chat",
  initialState: {
    contacts: [],
    messages: [],
    selectedContact: null,
    isContactsLoading: false,
    isMessagesLoading: false,
    error: null,
  },
  reducers: {
    setSelectedContact: (state, action) => {
      state.selectedContact = action.payload;
    },
    clearChatState: (state) => {
      state.contacts = [];
      state.messages = [];
      state.selectedContact = null;
      state.error = null;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchContacts
      .addCase(fetchContacts.pending, (state) => {
        state.isContactsLoading = true;
        state.error = null;
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.isContactsLoading = false;
        state.contacts = action.payload;
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.isContactsLoading = false;
        state.error = action.payload;
      })
      // fetchMessages
      .addCase(fetchMessages.pending, (state) => {
        state.isMessagesLoading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isMessagesLoading = false;
        state.messages = action.payload || [];
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

export const { setSelectedContact, clearChatState, addMessage } = chatSlice.actions;
export default chatSlice.reducer;
