// Development-only component harness. Not a production entry point or auth route.
// No Firebase imports, workspace membership changes or live records.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import AssetImports from '../src/pages/AssetImports.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import Header from '../src/components/Header.jsx';
import '../src/App.css';
import '../src/index.css';

export default function Preview() {
  const [visible, setVisible] = useState(true);
  return <div className="office-layout"><Sidebar activePage={visible ? 'imports' : 'dashboard'} onNavigate={page => setVisible(page === 'imports')} companyName="Fictional preview workspace" /><div className="office-main"><Header activePage={visible ? 'imports' : 'dashboard'} companyName="Local component test" userEmail="office@example.com" onSignOut={() => setVisible(false)} /><main className="office-content">{visible ? <AssetImports /> : <p>Local preview only. Choose Asset Imports to reopen the wizard.</p>}</main></div></div>;
}
createRoot(document.getElementById('root')).render(<Preview />);
