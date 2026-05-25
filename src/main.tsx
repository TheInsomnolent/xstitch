import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/theme.css';
import './styles/components.css';
import { seedStartersIfNeeded } from './lib/bootstrap';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

seedStartersIfNeeded().catch((err) => {
  console.warn('Starter pattern bootstrap failed', err);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // ignore registration failures (e.g. dev or unsupported)
      });
  });
}
