import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">

        {/* BRANDING */}
        <div className="footer-column footer-brand">
          <img
            src="/instafire-banner.webp"
            alt="InstaFirePilot"
            className="footer-logo"
          />

          <p>
            Fire protection management software built for engineers
            and the businesses that support them.
          </p>

          <span className="footer-location">
            Designed in the United Kingdom
          </span>
        </div>

        {/* COMPANY */}
        <div className="footer-column">
          <h3>Company</h3>
          <Link to="/about">About Us</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/contact">Contact Us</Link>
          <Link to="/demo">Book a Demo</Link>
        </div>

        {/* PRODUCTS */}
        <div className="footer-column">
          <h3>Products</h3>
          <Link to="/products/fire-alarms">Fire Alarms</Link>
          <Link to="/products/fire-extinguishers">
            Fire Extinguishers
          </Link>
          <Link to="/products/emergency-lighting">
            Emergency Lighting
          </Link>
          <Link to="/products/fire-doors">Fire Doors</Link>
          <Link to="/products/fire-stopping">Fire Stopping</Link>
          <Link to="/products/fire-blankets">Fire Blankets</Link>
        </div>

        {/* PLATFORM */}
        <div className="footer-column">
          <h3>Platform</h3>
          <Link to="/how-it-works">How It Works</Link>
          <Link to="/engineer-app">Engineer Mobile App</Link>
          <Link to="/office-management">Office Management</Link>
          <Link to="/offline-working">Offline Working</Link>
          <Link to="/asset-management">Asset Management</Link>
        </div>

        {/* SUPPORT & LEGAL */}
        <div className="footer-column">
          <h3>Support & Legal</h3>
          <Link to="/help">Help Centre</Link>
          <Link to="/faq">FAQs</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms & Conditions</Link>
          <Link to="/cookies">Cookie Policy</Link>
        </div>

      </div>

      <div className="footer-bottom">
        <p>
          © {new Date().getFullYear()} InstaFirePilot.
          All rights reserved.
        </p>

        <span>
          Professional fire protection software.
        </span>
      </div>
    </footer>
  );
}

export default Footer;