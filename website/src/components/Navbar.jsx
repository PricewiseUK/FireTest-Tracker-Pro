import { Link } from "react-router-dom";

function Navbar() {
  return (
    <header className="navbar">
      <Link className="navbar-brand" to="/">
        <img src="/instafire-banner.webp" alt="InstaFirePilot" />
      </Link>

      <nav className="navbar-links">
        <a href="/#features">Features</a>
        <a href="/#solutions">Solutions</a>
        <Link to="/pricing">Pricing</Link>
        <Link to="/contact">Contact</Link>
      </nav>

      <div className="navbar-actions">
        <a className="login-button" href="https://office.instafirepilot.co.uk">
          Workspace Login
        </a>

        <Link className="demo-button" to="/demo">
          Book a Demo →
        </Link>
      </div>
    </header>
  );
}

export default Navbar;