import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';
import './layout.css';
import './panels.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('WebRAD renderer root was not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
