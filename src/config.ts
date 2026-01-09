// Runtime configuration - reads from window.__RUNTIME_CONFIG__ (injected at container startup)
// Falls back to VITE_API_URL for local dev, then empty string for relative URLs

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      API_URL?: string;
    };
  }
}

export const config = {
  apiUrl: window.__RUNTIME_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || '',
};
