import { useState } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import { PlannerFullscreenContext } from '../scheduling/usePlannerFullscreen.js';
import './OfficeLayout.css';

export default function OfficeLayout({ activePage, companyName, userEmail, officeRole, onNavigate, onSignOut, children }) {
  const [isFullscreen, setFullscreen] = useState(false);
  const [year] = useState(() => new Date().getFullYear());
  const immersive = activePage === 'scheduling' && isFullscreen;

  function navigate(page) {
    setFullscreen(false);
    onNavigate(page);
  }

  return <PlannerFullscreenContext.Provider value={{ isFullscreen: immersive, setFullscreen }}>
    <div className={`office-layout ${immersive ? 'office-layout-fullscreen' : ''}`}>
      <div className="office-chrome-slot" hidden={immersive}>
        <Sidebar activePage={activePage} onNavigate={navigate} companyName={companyName} />
      </div>
      <div className="office-main">
        <div className="office-chrome-slot" hidden={immersive}>
          <Header activePage={activePage} companyName={companyName} userEmail={userEmail} onSignOut={onSignOut} />
        </div>
        <main className="office-content">{children}</main>
        <div className="office-chrome-slot" hidden={immersive}>
          <footer className="office-footer"><span>INSTAFIRE © {year}</span><span>{officeRole.toUpperCase().replaceAll('_', ' ')} • DEVELOPMENT WORKSPACE</span></footer>
        </div>
      </div>
    </div>
  </PlannerFullscreenContext.Provider>;
}
