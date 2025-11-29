import axios from 'axios';
import store from './store';
import { logout } from './slices/userSlice';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: `${API_URL}/api`, 
  headers: {
    "Content-Type": "application/json",
  }
});

// Add token to all requests
axiosInstance.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token");  
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle authentication errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 (Unauthorized) and 403 (Forbidden) errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Dispatch logout action to clear Redux state
      store.dispatch(logout());
      
      // Clear all authentication data
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
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
      
      // Redirect to login page
      // Use window.location to ensure a full page reload and state reset
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
