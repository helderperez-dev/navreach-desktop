import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { Toaster } from 'sonner';
import posthog from './lib/posthog';
import { PostHogProvider } from 'posthog-js/react';
import './styles/globals.css';

// SILENCE NOISY LANGCHAIN WARNINGS
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('New LangChain packages are available')) {
    return;
  }
  originalWarn(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
