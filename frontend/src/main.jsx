import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CaixaApp from './CaixaApp.jsx';
import './index.css';

const isCaixaRoute = window.location.pathname.startsWith('/caixa');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCaixaRoute ? <CaixaApp /> : <App />}
  </React.StrictMode>,
);
