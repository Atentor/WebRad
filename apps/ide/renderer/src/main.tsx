import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applicationIconUrl } from './application-assets';
import './theme.css';
import './layout.css';
import './panels.css';

const iconLink = document.createElement('link');
iconLink.rel = 'icon';
iconLink.type = 'image/svg+xml';
iconLink.href = applicationIconUrl;
iconLink.setAttribute('sizes', 'any');
document.head.append(iconLink);

const container = document.getElementById('root');
if (!container) {
  throw new Error('WebRAD renderer root was not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
