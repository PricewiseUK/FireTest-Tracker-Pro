import "./App.css";
import { Link } from "react-router-dom";
function App() {
  return (
    <div className="website">
      <main>
        <section className="hero">
          <div className="hero-content">
            <span className="hero-label">
              FIRE PROTECTION MANAGEMENT SOFTWARE
            </span>

            <h1>
              Smarter fire protection.
              <br />
              <span>Built for engineers.</span>
            </h1>

            <p>
              Manage fire safety inspections, equipment, engineers and
              compliance records from one powerful platform.
            </p>

            <div className="hero-actions">
              <a className="hero-primary" href="#features">
                Explore Features →
              </a>

              <a className="hero-secondary" href="#contact">
                Request a Demo
              </a>
            </div>
          </div>
        </section>
        {/* FIRE PROTECTION FEATURES */}

        <section className="features-section" id="features">
          <div className="features-heading">
            <span className="section-label">
              ONE PLATFORM. MULTIPLE DISCIPLINES.
            </span>

            <h2>
              Everything your fire protection
              <br />
              business needs.
            </h2>

            <p>
              From fire alarm inspections to emergency lighting, InstaFirePilot
              brings your engineers, equipment and inspection records together.
            </p>
          </div>

          <div className="features-grid" id="solutions">
            <Link
              to="/products/fire-alarms"
              className="feature-card"
              aria-label="Explore Fire Alarms software"
            >
              <div className="feature-number">01</div>

              <h3>Fire Alarms</h3>

              <p>
                Manage fire alarm assets, inspections, device testing and
                maintenance records.
              </p>
            </Link>

            <Link
              to="/products/fire-extinguishers"
              className="feature-card"
              aria-label="Explore Fire Extinguishers software"
            >
              <div className="feature-number">02</div>

              <h3>Fire Extinguishers</h3>

              <p>
                Track extinguisher assets, inspections, service history and
                equipment condition.
              </p>
            </Link>

            <Link
              to="/products/emergency-lighting"
              className="feature-card"
              aria-label="Explore Emergency Lighting software"
            >
              <div className="feature-number">03</div>

              <h3>Emergency Lighting</h3>

              <p>
                Record monthly and annual emergency lighting tests with detailed
                asset histories.
              </p>
            </Link>

            <div className="feature-card">
              <div className="feature-number">04</div>
              <h3>Fire Doors</h3>
              <p>
                Organise fire door inspections, defects and maintenance records.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">05</div>
              <h3>Fire Stopping</h3>
              <p>
                Document fire stopping inspections, locations, defects and
                supporting evidence.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-number">06</div>
              <h3>Fire Blankets</h3>
              <p>
                Maintain fire blanket inspection records and equipment
                histories.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
