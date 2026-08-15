import ReactDOM from 'react-dom/client';
import AppRoot from './AppRoot';
import './index.css';

import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppRoot />
);
