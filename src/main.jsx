import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './home/home.css';

createRoot(document.getElementById('root')).render(<App />);

import './platform/platform.css';
import './theme.css'; // light mode layer
import './theme-dark.css'; // dark mode (original colours)
import './nour.css'; // Nour chat design, token-only colours, must load last
import './typography.css'; // shared type sizes, loads after both theme layers
