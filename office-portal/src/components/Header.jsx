import "./Header.css";

const pageTitles = {
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

export default function Header({
  activePage = "dashboard",
  companyName = "Company Workspace",
  userEmail = "",
  onSignOut,
}) {
  return (
    <header className="office-header">
      <div className="office-header-left">
        <div className="office-header-label">
          INSTAFIRE / OFFICE WORKSPACE
        </div>

        <h1 className="office-header-title">
          {pageTitles[activePage] || "Dashboard"}
        </h1>
      </div>

      <div className="office-header-right">
        <div className="office-header-company">
          <span className="office-header-company-label">WORKSPACE</span>
          <strong>{companyName}</strong>
        </div>

        <div className="office-header-account">
          <div className="office-header-avatar" aria-hidden="true">
            {userEmail.charAt(0).toUpperCase() || "U"}
          </div>

          <div className="office-header-user">
            <span>SIGNED IN AS</span>
            <strong>{userEmail}</strong>
          </div>
        </div>

        <button
          type="button"
          className="office-header-signout"
          onClick={onSignOut}
        >
          SIGN OUT
        </button>
      </div>
    </header>
  );
}
