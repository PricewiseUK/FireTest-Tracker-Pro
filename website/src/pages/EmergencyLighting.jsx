import "./FireAlarms.css";

function EmergencyLighting() {
  return (
    <main className="product-page">

      {/* HERO */}

      <section className="product-hero">
        <div className="product-hero-content">

          <span className="section-label">
            INSTAFIREPILOT / EMERGENCY LIGHTING
          </span>

          <h1>
            Emergency lighting testing.
            <br />
            <span>Made effortless.</span>
          </h1>

          <p>
            Manage emergency lighting inspections,
            monthly functional tests, annual duration
            tests and equipment records in one place.
          </p>

        </div>
      </section>

      {/* INTRODUCTION */}

      <section className="product-intro">

        <span className="section-label">
          DESIGNED FOR FIRE SAFETY ENGINEERS
        </span>

        <h2>
          Every light.
          <br />
          Every test.
        </h2>

        <p>
          From individual emergency luminaires to
          large multi-building installations,
          InstaFirePilot is designed to make
          emergency lighting inspections faster,
          clearer and easier to manage.
        </p>

      </section>

      {/* FEATURES */}

      <section className="product-features">

        <div className="product-feature-grid">

          <article className="product-feature-card">
            <span>01</span>
            <h3>Asset Registers</h3>
            <p>
              Organise emergency lighting assets
              by building, floor, zone and location.
            </p>
          </article>

          <article className="product-feature-card">
            <span>02</span>
            <h3>Monthly Functional Tests</h3>
            <p>
              Quickly record functional test results
              with clear pass, fail and not-tested
              statuses.
            </p>
          </article>

          <article className="product-feature-card">
            <span>03</span>
            <h3>Annual Duration Tests</h3>
            <p>
              Record duration test results, observations
              and equipment requiring further attention.
            </p>
          </article>

          <article className="product-feature-card">
            <span>04</span>
            <h3>Defect Reporting</h3>
            <p>
              Record failed luminaires, damaged fittings,
              defective batteries and other issues
              with supporting notes and photographs.
            </p>
          </article>

          <article className="product-feature-card">
            <span>05</span>
            <h3>QR Code Identification</h3>
            <p>
              Identify individual emergency lighting
              assets using optional QR codes linked
              to their records.
            </p>
          </article>

          <article className="product-feature-card">
            <span>06</span>
            <h3>Inspection History</h3>
            <p>
              Maintain organised testing histories
              so engineers and office staff can
              review previous inspection results.
            </p>
          </article>

        </div>
      </section>

      {/* HIGHLIGHT */}

      <section className="product-highlight">

        <div className="product-highlight-content">

          <span className="section-label">
            PRACTICAL INSPECTION WORKFLOWS
          </span>

          <h2>
            Less time recording.
            <br />
            More time inspecting.
          </h2>

          <p>
            InstaFirePilot is designed to simplify
            emergency lighting testing by reducing
            repetitive data entry and making
            equipment records easy to access.
          </p>

          <p>
            Engineers can work through individual
            assets, record defects and maintain
            clear inspection histories.
          </p>

          <div className="product-highlight-note">
            Designed for UK emergency lighting
            inspection and maintenance workflows.
          </div>

        </div>

      </section>

    </main>
  );
}

export default EmergencyLighting;