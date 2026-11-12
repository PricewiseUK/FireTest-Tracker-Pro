import {
  ClipboardCheck,
  Building2,
  HardHat,
  ClipboardList,
  FileText,
  FileUp,
} from "lucide-react";

import "./Dashboard.css";
const dashboardCards = [
  {
    id: "approvals",
    icon: ClipboardCheck,
    title: "Asset Approvals",
    description:
      "Review equipment submitted by engineers before adding it to the official asset register.",
    action: "REVIEW PROPOSALS",
  },
  {
    id: "buildings",
    icon: Building2,
    title: "Customers & Buildings",
    description:
      "Manage customer locations, building information and equipment registers.",
    action: "VIEW BUILDINGS",
  },
  {
    id: "engineers",
    icon: HardHat,
    title: "Engineers",
    description:
      "Manage company engineers, account permissions and building assignments.",
    action: "MANAGE ENGINEERS",
  },
  {
    id: "inspections",
    icon: ClipboardList,
    title: "Inspections",
    description:
      "Review submitted inspections, outstanding work and service history.",
    action: "VIEW INSPECTIONS",
  },
  {
    id: "reports",
    icon: FileText,
    title: "Reports",
    description:
      "Access inspection reports, service documentation and historical records.",
    action: "VIEW REPORTS",
  },
  {
    id: "imports",
    icon: FileUp,
    title: "Asset Imports",
    description:
      "Import existing equipment registers from spreadsheets and supported systems.",
    action: "IMPORT ASSETS",
  },
];

export default function Dashboard({
  companyName = "Company Workspace",
  onNavigate,
}) {
  return (
    <div className="dashboard-page">
      <section className="dashboard-welcome">
        <div>
          <div className="dashboard-eyebrow">
            INSTAFIRE MANAGEMENT WORKSPACE
          </div>

          <h2>Welcome to your office dashboard</h2>

          <p>
            Manage fire protection equipment, engineer activity
            and company records from one central workspace.
          </p>
        </div>

        <div className="dashboard-workspace-badge">
          <span>ACTIVE WORKSPACE</span>
          <strong>{companyName}</strong>
        </div>
      </section>

      <div className="dashboard-section-heading">
        <div>
          <h3>Workspace Overview</h3>
          <p>Select an area to manage your company operations.</p>
        </div>
      </div>

      <section className="dashboard-grid">
        {dashboardCards.map((card) => (
          <article className="dashboard-card" key={card.id}>
           <div className="dashboard-card-icon">
            <card.icon size={25} strokeWidth={1.8} aria-hidden="true" />
            </div>

            <div className="dashboard-card-body">
              <h4>{card.title}</h4>
              <p>{card.description}</p>
            </div>

            <button
              type="button"
              className="dashboard-card-action"
              onClick={() => onNavigate(card.id)}
            >
              {card.action}
              <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </section>

      <div className="dashboard-development-notice">
        <strong>DEVELOPMENT WORKSPACE</strong>
        <p>
          Dashboard navigation is being connected in stages.
          Live asset totals, inspection statistics and pending
          approval counts will come from Firestore rather than
          hardcoded demonstration figures.
        </p>
      </div>
    </div>
  );
}