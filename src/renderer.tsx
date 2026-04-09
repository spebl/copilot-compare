import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { LastRunWindowApp } from './LastRunWindowApp';

const view = new URLSearchParams(window.location.search).get('view');
const root = createRoot(document.getElementById('root')!);

root.render(view === 'last-run' ? <LastRunWindowApp /> : <App />);
