// Runtime configuration - these can be overridden at build time or runtime
export const config = {
  // Backend API base URL - override with VITE_API_URL environment variable
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
};
