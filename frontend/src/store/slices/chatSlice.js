import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from '../axiosInstance';
import { toast } from "react-hot-toast";

// Async thunks
export const fetchContacts = createAsyncThunk(
  "chat/fetchContacts",
  async (_, thunkAPI) => {
    try {
      // Use the new friends endpoint
      const response = await axiosInstance.get("/friends");
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
      // Only show toast for friendship-related errors, not for all errors
      if (message.includes("friends") || message.includes("friend request")) {
        toast.error(message);
      }
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
      // Show toast for all send message errors (including friendship errors)
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Forward a message to friends
export const forwardMessage = createAsyncThunk(
  "chat/forwardMessage",
  async ({ messageId, friendIds }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(
        `/messages/forward`,
        { messageId, friendIds }
      );
      toast.success(`Message forwarded to ${response.data.forwardedCount} friend(s)`);
      if (response.data.errors && response.data.errors.length > 0) {
        toast.error(`Some forwards failed: ${response.data.errors.length} error(s)`);
      }
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Mark messages as read
export const markMessagesAsRead = createAsyncThunk(
  "chat/markMessagesAsRead",
  async ({ conversationId, messageIds }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(
        `/messages/read`,
        { conversationId, messageIds }
      );
      return response.data;
    } catch (error) {
      // Don't show error toast for read receipts
      return thunkAPI.rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

export const searchGlobalUsers = createAsyncThunk(
  "chat/searchGlobalUsers",
  async (query, thunkAPI) => {
    try {
      // Assuming you create a backend route: GET /api/users/search?query=...
      const response = await axiosInstance.get(`/users/search?query=${query}`);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || "Search failed");
    }
  }
);

// Send a friend request
export const sendFriendRequest = createAsyncThunk(
  "chat/sendFriendRequest",
  async (userId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/request`, { userId }); 
      toast.success("Friend request sent");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to send friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Get friend requests
export const getFriendRequests = createAsyncThunk(
  "chat/getFriendRequests",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/friends/requests`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to fetch friend requests";
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Accept a friend request
export const acceptFriendRequest = createAsyncThunk(
  "chat/acceptFriendRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/accept/${requestId}`);
      toast.success("Friend request accepted");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to accept friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Reject a friend request
export const rejectFriendRequest = createAsyncThunk(
  "chat/rejectFriendRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/reject/${requestId}`);
      toast.success("Friend request rejected");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to reject friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// ========== GROUP CHAT THUNKS ==========

// Create a new group
export const createGroup = createAsyncThunk(
  "chat/createGroup",
  async (groupData, thunkAPI) => {
    try {
      const response = await axiosInstance.post("/groups", groupData);
      toast.success("Group created successfully");
      return response.data.group;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to create group";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Get all groups
export const fetchGroups = createAsyncThunk(
  "chat/fetchGroups",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get("/groups");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to fetch groups";
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Add a friend to group
export const addGroupMember = createAsyncThunk(
  "chat/addGroupMember",
  async ({ groupId, userId }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/groups/${groupId}/members`, { userId });
      toast.success("Member added to group");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to add member";
      // Don't show error toast if it's about not being friends - we'll handle it by sending a group request
      if (!message.includes('only add friends') && !message.includes('group request')) {
        toast.error(message);
      }
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Send group request to non-friend
export const sendGroupRequest = createAsyncThunk(
  "chat/sendGroupRequest",
  async ({ groupId, userId }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/groups/${groupId}/request/${userId}`);
      toast.success("Group request sent");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to send group request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Get group requests
export const getGroupRequests = createAsyncThunk(
  "chat/getGroupRequests",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get("/groups/requests/all");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to fetch group requests";
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Accept group request
export const acceptGroupRequest = createAsyncThunk(
  "chat/acceptGroupRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/groups/requests/${requestId}/accept`);
      toast.success("Group request accepted");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to accept group request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Reject group request
export const rejectGroupRequest = createAsyncThunk(
  "chat/rejectGroupRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/groups/requests/${requestId}/reject`);
      toast.success("Group request rejected");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to reject group request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// ==================== Group Messaging ====================

// Fetch group messages
export const fetchGroupMessages = createAsyncThunk(
  "chat/fetchGroupMessages",
  async ({ groupId, limit = 50, before = null }, thunkAPI) => {
    try {
      const params = { limit };
      if (before) params.before = before;

      const response = await axiosInstance.get(`/groups/${groupId}/messages`, { params });
      return { groupId, messages: response.data };
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Send group message
export const sendGroupMessage = createAsyncThunk(
  "chat/sendGroupMessage",
  async ({ groupId, messageData }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/groups/${groupId}/messages`, messageData);
      return { groupId, message: response.data.groupMessage };
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Mark group message as read
export const markGroupMessageAsRead = createAsyncThunk(
  "chat/markGroupMessageAsRead",
  async ({ groupId, messageId }, thunkAPI) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/messages/${messageId}/read`);
      return { groupId, messageId };
    } catch (error) {
      // Don't show error toast for read receipts
      return thunkAPI.rejectWithValue(error.response?.data?.error || error.message);
    }
  }
);

// Add a user to your friends list (backward compatibility - now sends a request)
export const addNewContact = createAsyncThunk(
  "chat/addNewContact",
  async (userId, thunkAPI) => {
    try {
      // Use the friend request endpoint
      return thunkAPI.dispatch(sendFriendRequest(userId));
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to add friend";
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
    groupMessages: {}, // { groupId: [messages] }
    searchResults: [], // Store global search results here
    friendRequests: {
      received: [], // Friend requests received from others
      sent: [] // Friend requests sent to others
    },
    groups: [], // User's groups
    groupRequests: {
      received: [], // Group requests received from others
      sent: [] // Group requests sent to others
    },
    selectedContact: null,
    selectedGroup: null,
    isContactsLoading: false,
    isMessagesLoading: false,
    isGroupMessagesLoading: false,
    isSearching: false, // UI loading state for search
    isFriendRequestsLoading: false,
    isGroupsLoading: false,
    isGroupRequestsLoading: false,
    error: null,
  },
  reducers: {
    setSelectedContact: (state, action) => {
      state.selectedContact = action.payload;
    },
    setSelectedGroup: (state, action) => {
      state.selectedGroup = action.payload;
    },
    clearChatState: (state) => {
      state.contacts = [];
      state.messages = [];
      state.selectedContact = null;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    addGroupMessage: (state, action) => {
      const { groupId, message } = action.payload;
      if (!state.groupMessages[groupId]) {
        state.groupMessages[groupId] = [];
      }
      state.groupMessages[groupId].push(message);
    },
    clearGroupMessages: (state, action) => {
      const groupId = action.payload;
      if (groupId) {
        state.groupMessages[groupId] = [];
      } else {
        state.groupMessages = {};
      }
    },
    // Clear search results when closing the search view
    clearSearchResults: (state) => {
      state.searchResults = [];
    },
    // Clear friend requests
    clearFriendRequests: (state) => {
      state.friendRequests = { received: [], sent: [] };
    },
    // Update a message (for pending messages)
    markMessageAsRead: (state, action) => {
      const { messageId } = action.payload;
      const message = state.messages.find(msg => msg.id === messageId);
      if (message) {
        message.read = true;
      }
    },
    markMessagesAsReadBatch: (state, action) => {
      const { messageIds } = action.payload;
      messageIds.forEach(messageId => {
        const message = state.messages.find(msg => msg.id === messageId);
        if (message) {
          message.read = true;
        }
      });
    },
    updateContactStatus: (state, action) => {
      const { userId, isOnline, lastSeen } = action.payload;
      const contact = state.contacts.find(c => c.userId === userId);
      if (contact) {
        contact.isOnline = isOnline;
        if (lastSeen) {
          contact.lastSeen = lastSeen;
        }
      }
      // Also update selectedContact if it matches
      if (state.selectedContact && state.selectedContact.userId === userId) {
        state.selectedContact.isOnline = isOnline;
        if (lastSeen) {
          state.selectedContact.lastSeen = lastSeen;
        }
      }
    },
    updateMessage: (state, action) => {
      const { tempId, message } = action.payload;
      const index = state.messages.findIndex(msg => msg.id === tempId);
      if (index !== -1) {
        state.messages[index] = message;
      }
    },
    // Mark a message as failed
    markMessageFailed: (state, action) => {
      const tempId = action.payload;
      const message = state.messages.find(msg => msg.id === tempId);
      if (message) {
        message.pending = false;
        message.failed = true;
      }
    },
    // Clear messages (useful when switching chats)
    clearMessages: (state) => {
      state.messages = [];
    }
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
        // Clear messages when starting to fetch new ones
        state.messages = [];
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isMessagesLoading = false;
        // Ensure all messages have read field set (default to false if undefined)
        state.messages = (action.payload || []).map(msg => ({
          ...msg,
          read: msg.read !== undefined ? msg.read : false
        }));
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isMessagesLoading = false;
        state.error = action.payload;
      })
      // sendMessage
      .addCase(sendMessage.fulfilled, (state, action) => {
        const newMessage = action.payload;
        // Ensure read field is set (default to false for sent messages)
        if (newMessage.read === undefined) {
          newMessage.read = false;
        }
        
        // Find all pending messages from this conversation sent in last 10 seconds
        // This handles encrypted messages where text comparison fails
        const now = Date.now();
        const pendingIndices = [];
        
        state.messages.forEach((msg, index) => {
          if (msg.pending && msg.conversationId === newMessage.conversationId) {
            // Extract timestamp from temp ID (temp-1234567890)
            const msgTime = msg.id?.startsWith?.('temp-') 
              ? parseInt(msg.id.replace('temp-', '')) 
              : 0;
            
            // If message was created recently (within 10 seconds), it's our pending message
            if (now - msgTime < 10000) {
              pendingIndices.push(index);
            }
          }
        });
        
        // Remove all matching pending messages (in reverse to maintain indices)
        for (let i = pendingIndices.length - 1; i >= 0; i--) {
          state.messages.splice(pendingIndices[i], 1);
        }
        
        // Add the real message from backend
        state.messages.push(newMessage);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(searchGlobalUsers.pending, (state) => {
      state.isSearching = true;
      })
      .addCase(searchGlobalUsers.fulfilled, (state, action) => {
      state.isSearching = false;
      // Filter out users who are ALREADY in contacts
      const contactIds = new Set(state.contacts.map(c => c.id));
      state.searchResults = action.payload.filter(user => !contactIds.has(user.id));
    })
      .addCase(searchGlobalUsers.rejected, (state) => {
      state.isSearching = false;
      state.searchResults = [];
    })
    .addCase(addNewContact.fulfilled, (state, action) => {
      // Add the new contact to the list immediately
      state.contacts.unshift(action.payload);
      state.selectedContact = action.payload; // Auto-select them
      state.searchResults = []; // Clear search
    })
    // getFriendRequests
    .addCase(getFriendRequests.pending, (state) => {
      state.isFriendRequestsLoading = true;
      state.error = null;
    })
    .addCase(getFriendRequests.fulfilled, (state, action) => {
      state.isFriendRequestsLoading = false;
      state.friendRequests = action.payload || { received: [], sent: [] };
    })
    .addCase(getFriendRequests.rejected, (state, action) => {
      state.isFriendRequestsLoading = false;
      state.error = action.payload;
    })
    // acceptFriendRequest
    .addCase(acceptFriendRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.friendRequests.received = state.friendRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
      // Add to contacts if contact object is returned
      if (action.payload.contact) {
        // Check if contact already exists to avoid duplicates
        const exists = state.contacts.some(c => c.userId === action.payload.contact.userId);
        if (!exists) {
          state.contacts.unshift(action.payload.contact);
        }
        state.selectedContact = action.payload.contact;
      }
    })
    // rejectFriendRequest
    .addCase(rejectFriendRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.friendRequests.received = state.friendRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
    })
    // sendFriendRequest
    .addCase(sendFriendRequest.fulfilled, (state, action) => {
      // Refresh friend requests to show the sent request
      // This will be handled by getFriendRequests if needed
    })
    // createGroup
    .addCase(createGroup.pending, (state) => {
      state.isGroupsLoading = true;
    })
    .addCase(createGroup.fulfilled, (state, action) => {
      state.isGroupsLoading = false;
      if (action.payload) {
        // Add the new group to the groups array
        const newGroup = {
          id: action.payload.id,
          name: action.payload.name,
          description: action.payload.description,
          createdBy: action.payload.createdBy,
          members: action.payload.members,
          memberCount: action.payload.members?.length || 0,
          createdAt: action.payload.createdAt
        };
        state.groups.unshift(newGroup);
      }
    })
    .addCase(createGroup.rejected, (state) => {
      state.isGroupsLoading = false;
    })
    // fetchGroups
    .addCase(fetchGroups.pending, (state) => {
      state.isGroupsLoading = true;
    })
    .addCase(fetchGroups.fulfilled, (state, action) => {
      state.isGroupsLoading = false;
      state.groups = action.payload || [];
    })
    .addCase(fetchGroups.rejected, (state) => {
      state.isGroupsLoading = false;
    })
    // addGroupMember
    .addCase(addGroupMember.fulfilled, (state, action) => {
      if (action.payload?.group) {
        const groupIndex = state.groups.findIndex(g => g.id === action.payload.group.id);
        if (groupIndex !== -1) {
          state.groups[groupIndex] = {
            ...action.payload.group,
            memberCount: action.payload.group.members?.length || 0
          };
        }
      }
    })
    // getGroupRequests
    .addCase(getGroupRequests.pending, (state) => {
      state.isGroupRequestsLoading = true;
    })
    .addCase(getGroupRequests.fulfilled, (state, action) => {
      state.isGroupRequestsLoading = false;
      state.groupRequests = action.payload || { received: [], sent: [] };
    })
    .addCase(getGroupRequests.rejected, (state) => {
      state.isGroupRequestsLoading = false;
    })
    // acceptGroupRequest
    .addCase(acceptGroupRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.groupRequests.received = state.groupRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
      // Add group to groups list if not already there
      if (action.payload?.group) {
        const exists = state.groups.some(g => g.id === action.payload.group.id);
        if (!exists) {
          state.groups.unshift({
            ...action.payload.group,
            memberCount: action.payload.group.members?.length || 0
          });
        } else {
          // Update existing group
          const groupIndex = state.groups.findIndex(g => g.id === action.payload.group.id);
          if (groupIndex !== -1) {
            state.groups[groupIndex] = {
              ...action.payload.group,
              memberCount: action.payload.group.members?.length || 0
            };
          }
        }
      }
    })
    // rejectGroupRequest
    .addCase(rejectGroupRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.groupRequests.received = state.groupRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
    })
    // sendGroupRequest
    .addCase(sendGroupRequest.fulfilled, (state, action) => {
      // Refresh group requests to show the sent request
      // This will be handled by getGroupRequests if needed
    })
    // markMessagesAsRead
    .addCase(markMessagesAsRead.fulfilled, (state, action) => {
      const { messageIds } = action.meta.arg;
      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        messageIds.forEach(messageId => {
          const message = state.messages.find(msg => msg.id === messageId);
          if (message) {
            message.read = true;
          }
        });
      } else {
        // Mark all unread messages in the conversation as read
        const { conversationId } = action.meta.arg;
        state.messages.forEach(msg => {
          if (msg.conversationId === conversationId && msg.senderId === 'me' && !msg.read) {
            msg.read = true;
          }
        });
      }
    })
    // fetchGroupMessages
    .addCase(fetchGroupMessages.pending, (state) => {
      state.isGroupMessagesLoading = true;
      state.error = null;
    })
    .addCase(fetchGroupMessages.fulfilled, (state, action) => {
      state.isGroupMessagesLoading = false;
      const { groupId, messages } = action.payload;
      state.groupMessages[groupId] = messages || [];
    })
    .addCase(fetchGroupMessages.rejected, (state, action) => {
      state.isGroupMessagesLoading = false;
      state.error = action.payload;
    })
    // sendGroupMessage
    .addCase(sendGroupMessage.fulfilled, (state, action) => {
      const { groupId, message } = action.payload;
      if (!state.groupMessages[groupId]) {
        state.groupMessages[groupId] = [];
      }
      state.groupMessages[groupId].push(message);
    });
  },
});

export const { setSelectedContact, setSelectedGroup, clearChatState, addMessage, addGroupMessage, clearGroupMessages, clearSearchResults, updateMessage, markMessageFailed, clearMessages, markMessageAsRead, markMessagesAsReadBatch, updateContactStatus } = chatSlice.actions;
export default chatSlice.reducer;
