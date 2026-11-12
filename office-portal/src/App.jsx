import { lazy, Suspense, useEffect, useState } from "react";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

// OFFICE COMPONENTS
import OfficeLayout from "./components/OfficeLayout";

// OFFICE PAGES
import Dashboard from "./pages/Dashboard";
const AccountingIntegrations = lazy(() => import('./pages/AccountingIntegrations'));
const AssetImports = lazy(() => import('./pages/AssetImports'));
const EngineerScheduling = lazy(() => import('./pages/EngineerScheduling'));

import "./App.css";

// Existing development company workspace.
// Later this will be selected dynamically.
const COMPANY_ID = import.meta.env.VITE_COMPANY_ID || "2MpEurCrIQDU4Sp9Qwh1";

const OFFICE_ROLES = ["owner", "office_admin"];

const PAGE_NAMES = {
  dashboard: "Dashboard",
  approvals: "Asset Approvals",
  buildings: "Customers & Buildings",
  engineers: "Engineers",
  scheduling: "Jobs & Scheduling",
  inspections: "Inspections",
  reports: "Reports",
  imports: "Asset Imports",
  settings: "Settings",
};

export default function App() {
  // ==========================================
  // AUTHENTICATION STATE
  // ==========================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ==========================================
  // OFFICE ACCESS
  // ==========================================

  const [officeAccess, setOfficeAccess] = useState(false);
  const [officeRole, setOfficeRole] = useState("");
  const [accountingAccess, setAccountingAccess] = useState(false);

  // ==========================================
  // OFFICE WORKSPACE
  // ==========================================

  const [companyName] = useState("Company Workspace");

  const [activePage, setActivePage] = useState(() => new URLSearchParams(window.location.search).get('accounting') === 'connected' ? 'settings' : 'dashboard');

  // ==========================================
  // FIREBASE AUTHENTICATION & ROLE CHECK
  // ==========================================

  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const thisRequest = ++requestVersion;

      if (cancelled) return;

      setLoading(true);
      setUser(currentUser);

      // Never retain previous office permissions.
      setOfficeAccess(false);
      setAccountingAccess(false);
      setOfficeRole("");

      if (!currentUser) {
        setActivePage("dashboard");
        setLoading(false);
        return;
      }

      try {
        const membershipRef = doc(
          db,
          "companies",
          COMPANY_ID,
          "members",
          currentUser.uid,
        );

        const membershipSnapshot = await getDoc(membershipRef);

        if (cancelled || thisRequest !== requestVersion) {
          return;
        }

        if (membershipSnapshot.exists()) {
          const membership = membershipSnapshot.data();

          const authorised =
            membership.status === "active" &&
            OFFICE_ROLES.includes(membership.role);

          setOfficeAccess(authorised);
          setAccountingAccess(authorised && (membership.role === 'owner' || membership.permissions?.accounting === true));

          if (authorised) {
            setOfficeRole(membership.role);
          }
        }
      } catch (err) {
        console.error("Office permission check failed:", err);

        if (!cancelled && thisRequest === requestVersion) {
          setOfficeAccess(false);
          setOfficeRole("");
        }
      } finally {
        if (!cancelled && thisRequest === requestVersion) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      requestVersion++;
      unsubscribe();
    };
  }, []);

  // ==========================================
  // LOGIN
  // ==========================================

  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setNotice("");
    setSigningIn(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.error("Office login error:", err.code);

      setError("Unable to sign in. Check your email address and password.");
    } finally {
      setSigningIn(false);
    }
  }

  // ==========================================
  // PASSWORD RESET
  // ==========================================

  async function handleForgotPassword() {
    setError("");
    setNotice("");

    if (!email.trim()) {
      setError("Enter your email address first, then click FORGOT PASSWORD.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());

      setNotice(
        "If an account exists for this email address, a password reset link will be sent. Check your inbox and spam folder.",
      );
    } catch (err) {
      console.error("Password reset error:", err.code);

      setError(
        "Unable to process the password reset request. Please try again.",
      );
    }
  }

  // ==========================================
  // SIGN OUT
  // ==========================================

  async function handleLogout() {
    try {
      await signOut(auth);

      setPassword("");
      setError("");
      setNotice("");

      setOfficeAccess(false);
      setOfficeRole("");
      setActivePage("dashboard");
    } catch (err) {
      console.error("Sign-out error:", err);

      setError("Unable to sign out. Please try again.");
    }
  }

  // ==========================================
  // OFFICE NAVIGATION
  // ==========================================

  function handleNavigate(page) {
    if (!officeAccess) return;

    if (!Object.prototype.hasOwnProperty.call(PAGE_NAMES, page)) {
      return;
    }

    setActivePage(page);
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>CONNECTING TO INSTAFIRE...</p>
      </div>
    );
  }

  // ==========================================
  // AUTHORISED OFFICE DASHBOARD
  // ==========================================

  if (user && officeAccess) {
    return (
      <OfficeLayout
          activePage={activePage}
          onNavigate={handleNavigate}
          companyName={companyName}
          userEmail={user.email || ""}
          officeRole={officeRole}
          onSignOut={handleLogout}
      >
            {activePage === "dashboard" ? (
              <Dashboard
                companyName={companyName}
                onNavigate={handleNavigate}
              />
            ) : activePage === 'imports' ? (
              <Suspense fallback={<p>Loading import preview…</p>}><AssetImports /></Suspense>
            ) : activePage === 'scheduling' ? (
              <Suspense fallback={<p>Loading weekly schedule…</p>}><EngineerScheduling /></Suspense>
            ) : activePage === 'settings' ? (
              <Suspense fallback={<p>Loading accounting integrations…</p>}><AccountingIntegrations key={COMPANY_ID} companyId={COMPANY_ID} canManage={accountingAccess} /></Suspense>
            ) : (
              <div className="office-placeholder">
                <div className="office-placeholder-icon">IF</div>

                <div className="office-placeholder-label">INSTAFIRE OFFICE</div>

                <h2>{PAGE_NAMES[activePage]}</h2>

                <p>
                  This section is under development. Its functions will be
                  connected to your company workspace as we build them.
                </p>

                <button
                  type="button"
                  className="office-placeholder-button"
                  onClick={() => handleNavigate("dashboard")}
                >
                  ← BACK TO DASHBOARD
                </button>
              </div>
            )}
      </OfficeLayout>
    );
  }

  // ==========================================
  // SIGNED IN WITHOUT OFFICE PERMISSIONS
  // ==========================================

  if (user) {
    return (
      <main className="portal-container">
        <div className="login-card signed-in-card">
          <div className="portal-brand">
            <img
              src="/instafire-banner.webp"
              alt="InstaFirePilot"
              className="portal-logo"
            />
          </div>

          <div className="error-message">OFFICE ACCESS RESTRICTED</div>

          <p className="signed-in-email">{user.email}</p>

          <div className="access-notice">
            <strong>Office permission required</strong>

            <p>
              Your account is authenticated, but does not currently have
              permission to access this company's office administration.
            </p>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            SIGN OUT
          </button>
        </div>
      </main>
    );
  }

  // ==========================================
  // LOGIN SCREEN
  // ==========================================

  return (
    <main className="portal-container">
      <div className="login-card">
        <div className="portal-brand">
          <img
            src="/instafire-banner.webp"
            alt="InstaFirePilot"
            className="portal-logo"
          />
        </div>

        <div className="login-divider" />

        <h2>WORKSPACE LOGIN</h2>

        <p className="login-description">Sign in to your company workspace.</p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">EMAIL ADDRESS</label>

          <input
            id="email"
            type="email"
            placeholder="office@company.co.uk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">PASSWORD</label>

          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          <button
            type="button"
            className="forgot-password"
            onClick={handleForgotPassword}
          >
            Forgot password?
          </button>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="success-message" role="status">
              {notice}
            </div>
          )}

          <button type="submit" className="login-button" disabled={signingIn}>
            {signingIn ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <p className="login-footer">AUTHORISED COMPANY PERSONNEL ONLY</p>
      </div>

      <p className="page-footer">INSTAFIREPILOT © {new Date().getFullYear()}</p>
    </main>
  );
}
