import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CaixaApp from './CaixaApp.jsx';
import NaMesaApp from './NaMesaApp.jsx';
import './index.css';

const path = window.location.pathname;
const Root = path.startsWith('/caixa') ? CaixaApp : path.startsWith('/namesa') ? NaMesaApp : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
