import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './home/home.css';

createRoot(document.getElementById('root')).render(<App />);

import './platform/platform.css';
import './theme.css'; // bright theme layer, must load last
