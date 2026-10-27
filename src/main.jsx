import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-400-italic.css';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>Let’s find our way back.</h1>
          <p>
            This page had a little trouble. Your conversations are still in the shared database.
          </p>
          <button className="primary-button" onClick={() => location.reload()}>
            Reload Unsaid
          </button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
