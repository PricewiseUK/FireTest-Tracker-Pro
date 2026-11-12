import { useState } from "react";

import {
  LayoutDashboard,
  ClipboardCheck,
  Building2,
  HardHat,
  CalendarDays,
  ClipboardList,
  FileText,
  FileUp,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import "./Sidebar.css";

const navigation = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "approvals",
    label: "Asset Approvals",
    icon: ClipboardCheck,
  },
  {
    id: "buildings",
    label: "Customers & Buildings",
    icon: Building2,
  },
  {
    id: "engineers",
    label: "Engineers",
    icon: HardHat,
  },
  {
    id: "scheduling",
    label: "Jobs & Scheduling",
    icon: CalendarDays,
  },
  {
    id: "inspections",
    label: "Inspections",
    icon: ClipboardList,
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
  },
  {
    id: "imports",
    label: "Asset Imports",
    icon: FileUp,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

export default function Sidebar({
  activePage,
  onNavigate,
  companyName = "Company Workspace",
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      {/* BRANDING */}
      <div className="sidebar-top">
        <div className="sidebar-brand">
          {collapsed ? (
            <img
              src="/instafire-icon.webp"
              alt="Instafire"
              className="sidebar-logo-image"
            />
          ) : (
            <img
              src="/instafire-banner.webp"
              alt="Instafire Office Portal"
              className="sidebar-banner-image"
            />
          )}
        </div>

        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((previous) => !previous)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <PanelLeftClose size={17} />
          )}
        </button>
      </div>

      {/* WORKSPACE */}
      {!collapsed && (
        <div className="sidebar-workspace">
          <span className="workspace-label">
            CURRENT WORKSPACE
          </span>

          <span className="workspace-name">
            {companyName}
          </span>
        </div>
      )}

      {/* NAVIGATION */}
      <nav
        className="sidebar-navigation"
        aria-label="Office navigation"
      >
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${
                activePage === item.id
                  ? "sidebar-nav-active"
                  : ""
              }`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={
                activePage === item.id ? "page" : undefined
              }
            >
              <Icon
                size={20}
                strokeWidth={1.9}
                className="sidebar-nav-icon"
                aria-hidden="true"
              />

              {!collapsed && (
                <span className="sidebar-nav-label">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div className="sidebar-bottom">
        {!collapsed && (
          <span className="sidebar-version">
            INSTAFIRE OFFICE • DEVELOPMENT
          </span>
        )}
      </div>
    </aside>
  );
}
