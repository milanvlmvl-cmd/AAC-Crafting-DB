import React from 'react';
import { createRoot } from 'react-dom/client';
import { SQLiteValueProvider } from './context/SQLiteContext';
import { Dashboard } from './components/Dashboard';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <SQLiteValueProvider databaseUrl={import.meta.env.BASE_URL + 'crafting.db'}>
      <Dashboard />
    </SQLiteValueProvider>
  </React.StrictMode>
);
