// Runtime configuration - these can be overridden at build time or runtime
export const config = {
  // Backend API base URL - uses relative path for production (nginx proxies /api and /health to backend)
  // For local development, set VITE_API_URL=http://localhost:8000
  apiUrl: import.meta.env.VITE_API_URL || '',
};
