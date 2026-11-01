import { Link } from "react-router-dom";

function NotFound() {
  return (
    <main>
      <section className="hero">
        <div className="hero-content">

          <span className="hero-label">
            PAGE NOT FOUND
          </span>

          <h1>
            404 — Page Not Found
          </h1>

          <p>
            Sorry, this page doesn't exist or
            may not be available yet.
          </p>

          <Link className="hero-primary" to="/">
            ← Back to Homepage
          </Link>

        </div>
      </section>
    </main>
  );
}

export default NotFound;