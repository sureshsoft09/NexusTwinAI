/**
 * Central API & WebSocket URL Resolver for NexusTwin AI Frontend.
 *
 * - On localhost (`npm run dev`), uses relative paths (`/api/v1/...`) via Vite proxy.
 * - On Firebase Hosting (`*.web.app` / `*.firebaseapp.com`), connects to `VITE_API_BASE_URL`
 *   (defaulting to the deployed Cloud Run service `https://nexustwin-backend-311231946335.us-central1.run.app`).
 */

/// <reference types="vite/client" />

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const envApiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL: string = (
  envApiBaseUrl ||
  (isLocalhost ? '' : 'https://nexustwin-backend-311231946335.us-central1.run.app')
).replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function wsUrl(path: string): string {
  if (API_BASE_URL.startsWith('https://')) {
    return `${API_BASE_URL.replace('https://', 'wss://')}${path}`;
  }
  if (API_BASE_URL.startsWith('http://')) {
    return `${API_BASE_URL.replace('http://', 'ws://')}${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
