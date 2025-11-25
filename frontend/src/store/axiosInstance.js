import axios from 'axios';

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

export default axiosInstance;
