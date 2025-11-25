import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axiosInstance from '../axiosInstance';

// Async thunk: sign in
export const signIn = createAsyncThunk("user/signIn", async (data, thunkAPI) => {
  try {
    const response = await axiosInstance.post("/auth/login", data);
    sessionStorage.setItem("token", response.data.token);
    sessionStorage.setItem("user", JSON.stringify(response.data.user));
    thunkAPI.dispatch(setUserDetails(response.data.user));
    return {
      token: response.data.token,
      user: response.data.user
    };
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data?.error || "Sign in failed");
  }
});

// Async thunk: sign up
export const signUp = createAsyncThunk("user/signUp", async (data, thunkAPI) => {
  try {
    const response = await axiosInstance.post("/auth/signup", data);
    sessionStorage.setItem("token", response.data.token);
    sessionStorage.setItem("user", JSON.stringify(response.data.user));
    thunkAPI.dispatch(setUserDetails(response.data.user));
    return {
      token: response.data.token,
      user: response.data.user
    };
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data?.error || "Sign up failed");
  }
});

// Async thunk: fetch user details
export const fetchUserDetails = createAsyncThunk("user/fetchUserDetails", async (userId, thunkAPI) => {
  try {
    const response = await axiosInstance.get(`/user/${userId}`);
    return response.data;
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data?.error || "Failed to fetch user details");
  }
});

// Load user from sessionStorage on initialization
const loadUserFromStorage = () => {
  try {
    const token = sessionStorage.getItem("token");
    const userStr = sessionStorage.getItem("user");
    if (token && userStr) {
      const user = JSON.parse(userStr);
      return {
        email: user.email || null,
        userDetails: user,
        loading: false,
        error: null,
      };
    }
  } catch (error) {
    console.error("Error loading user from sessionStorage:", error);
    // Clear invalid data
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  }
  return {
    email: null,
    userDetails: null,
    loading: false,
    error: null,
  };
};

const initialState = loadUserFromStorage();

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUserDetails: (state, action) => {
      state.userDetails = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    logout: (state) => {
      state.email = null;
      state.userDetails = null;
      state.error = null;
      // Clear sessionStorage
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      // Clear localStorage cache
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("rememberedEmail");
      // Clear all cache
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.loading = false;
        state.userDetails = action.payload.user;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchUserDetails.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserDetails.fulfilled, (state, action) => {
        state.loading = false;
        if (state.userDetails) {
          state.userDetails.rides_taken = action.payload.rides_taken;
        } else {
          state.userDetails = action.payload;
        }
      })
      .addCase(fetchUserDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // signUp
      .addCase(signUp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.loading = false;
        state.userDetails = action.payload.user;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const {
  setUserDetails,
  setError,
  setLoading,
  logout,
} = userSlice.actions;

export default userSlice.reducer;

