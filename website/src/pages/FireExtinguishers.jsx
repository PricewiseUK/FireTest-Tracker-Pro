import "./FireAlarms.css";

function FireExtinguishers() {
  return (
    <main className="product-page">

      {/* HERO */}

      <section className="product-hero">
        <div className="product-hero-content">

          <span className="section-label">
            INSTAFIREPILOT / FIRE EXTINGUISHERS
          </span>

          <h1>
            Fire extinguisher servicing.
            <br />
            <span>Made simpler.</span>
          </h1>

          <p>
            Manage extinguisher assets, inspections,
            servicing records and equipment history
            from one straightforward platform.
          </p>

        </div>
      </section>

      {/* INTRODUCTION */}

      <section className="product-intro">

        <span className="section-label">
          DESIGNED FOR SERVICE ENGINEERS
        </span>

        <h2>
          Every extinguisher.
          <br />
          Every inspection.
        </h2>

        <p>
          InstaFirePilot is being developed to help
          engineers record extinguisher servicing
          quickly while keeping accurate equipment
          records for the office.
        </p>

      </section>

      {/* FEATURES */}

      <section className="product-features">

        <div className="product-feature-grid">

          <article className="product-feature-card">
            <span>01</span>
            <h3>Asset Registers</h3>
            <p>
              Organise extinguishers by building,
              floor and location.
            </p>
          </article>

          <article className="product-feature-card">
            <span>02</span>
            <h3>Guided Inspections</h3>
            <p>
              Record inspection results using
              equipment-specific servicing questions.
            </p>
          </article>

          <article className="product-feature-card">
            <span>03</span>
            <h3>Equipment History</h3>
            <p>
              Maintain inspection and servicing
              histories for individual assets.
            </p>
          </article>

          <article className="product-feature-card">
            <span>04</span>
            <h3>Defect Recording</h3>
            <p>
              Document damaged, missing or
              defective equipment with notes
              and supporting photographs.
            </p>
          </article>

          <article className="product-feature-card">
            <span>05</span>
            <h3>QR Code Identification</h3>
            <p>
              Quickly identify equipment using
              QR codes linked to individual
              asset records.
            </p>
          </article>

          <article className="product-feature-card">
            <span>06</span>
            <h3>Office Management</h3>
            <p>
              Give authorised office staff
              access to inspection records
              and servicing information.
            </p>
          </article>

        </div>
      </section>

      {/* HIGHLIGHT */}

      <section className="product-highlight">

        <div className="product-highlight-content">

          <span className="section-label">
            BUILT AROUND REAL ENGINEERS
          </span>

          <h2>
            Less paperwork.
            <br />
            More equipment serviced.
          </h2>

          <p>
            InstaFirePilot is designed to reduce
            unnecessary typing and repetitive
            administration during inspections.
          </p>

          <div className="product-highlight-note">
            Designed for practical, everyday
            fire protection servicing.
          </div>

        </div>

      </section>

    </main>
  );
}

export default FireExtinguishers;