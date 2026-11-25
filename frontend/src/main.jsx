import React from 'react';
import ReactDOM from 'react-dom/client';
// Global styles first, so each page's stylesheet can override them
import './styles/global.css';
import './styles/components.css';
import App from './App.jsx';
import { BudgetProvider } from './context/BudgetContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BudgetProvider>
      <App />
    </BudgetProvider>
  </React.StrictMode>
);
