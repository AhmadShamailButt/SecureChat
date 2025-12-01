import axios from 'axios';
import store from '../store/store';
import { logout } from '../store/slices/userSlice';

const API_URL = import.meta.env.VITE_API_URL || 'https://apisecurechat.duckdns.org';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Don't logout for group-related endpoints that might legitimately return 403
      // (e.g., group key not found, not a member, etc.)
      const requestUrl = error.config?.url || '';
      const isGroupEndpoint = requestUrl.includes('/groups/');
      
      // For 403 errors on group endpoints, don't logout - these are permission issues, not auth failures
      // Only logout on 401 (actual auth failure) or 403 on non-group endpoints
      const shouldLogout = error.response?.status === 401 || 
                          (error.response?.status === 403 && !isGroupEndpoint);
      
      if (shouldLogout) {
        // Dispatch logout action to clear Redux state
        store.dispatch(logout());
        
        // Clear all authentication data
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('rememberedEmail');
        
        // Clear all cache
        if ('caches' in globalThis) {
          caches.keys().then((names) => {
            names.forEach((name) => {
              caches.delete(name);
            });
          });
        }
        
        // Redirect to login page
        if (globalThis.location.pathname !== '/login') {
          globalThis.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

