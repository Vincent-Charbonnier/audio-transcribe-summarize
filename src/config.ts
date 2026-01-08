// Runtime configuration - these can be overridden at build time or runtime
export const config = {
  // Backend API base URL - uses relative URL for production (nginx proxies to backend)
  // Override with VITE_API_URL for local development
  apiUrl: import.meta.env.VITE_API_URL || '',
};
