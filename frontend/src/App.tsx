import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";

import Landing from "./pages/public/Landing";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import ChangePassword from "./pages/public/ChangePassword";
import ForgotPassword from "./pages/public/ForgotPassword";

import ClientDashboard from "./pages/client/ClientDashboard";
import Accounts from "./pages/client/Accounts";
import Transfer from "./pages/client/Transfer";
import Transactions from "./pages/client/Transactions";
import Beneficiaries from "./pages/client/Beneficiaries";
import Dps from "./pages/client/Dps";
import Profile from "./pages/client/Profile";

import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import Customers from "./pages/employee/Customers";
import CustomerDetail from "./pages/employee/CustomerDetail";
import CashIn from "./pages/employee/CashIn";
import CashWithdrawal from "./pages/employee/CashWithdrawal";
import FundTransfer from "./pages/employee/FundTransfer";

import ComplianceDashboard from "./pages/compliance/ComplianceDashboard";
import TransactionMonitoring from "./pages/compliance/TransactionMonitoring";
import TransactionDetail from "./pages/compliance/TransactionDetail";
import AlertsQueue from "./pages/compliance/AlertsQueue";
import AlertDetail from "./pages/compliance/AlertDetail";
import CustomerRiskProfile from "./pages/compliance/CustomerRiskProfile";
import Evidence from "./pages/compliance/Evidence";
import Controls from "./pages/compliance/Controls";
import ComplianceFrameworks from "./pages/compliance/Frameworks";
import FrameworkDetail from "./pages/compliance/FrameworkDetail";
import ControlDetail from "./pages/compliance/ControlDetail";
import Matrix from "./pages/compliance/Matrix";
import Reports from "./pages/compliance/Reports";

import AdminDashboard from "./pages/admin/AdminDashboard";
import Users from "./pages/admin/Users";
import Rules from "./pages/admin/Rules";
import TransactionRules from "./pages/admin/TransactionRules";
import Applications from "./pages/admin/Applications";
import ApplicationDetail from "./pages/admin/ApplicationDetail";
import AdminFrameworks from "./pages/admin/Frameworks";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import BankAudit from "./pages/admin/BankAudit";
import AdminAlerts from "./pages/admin/Alerts";
import AdminAlertDetail from "./pages/admin/AlertDetail";
import StaffProfile from "./pages/shared/StaffProfile";

const CLIENT_NAV = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Accounts", to: "/accounts" },
  { label: "Transfer", to: "/transfer" },
  { label: "Transactions", to: "/transactions" },
  { label: "Beneficiaries", to: "/beneficiaries" },
  { label: "DPS", to: "/dps" },
];

const EMPLOYEE_NAV = [
  { label: "Dashboard", to: "/employee/dashboard" },
  { label: "Customers", to: "/employee/customers" },
  { label: "Cash In", to: "/employee/cash-in" },
  { label: "Cash Withdrawal", to: "/employee/cash-withdrawal" },
  { label: "Fund Transfer", to: "/employee/fund-transfer" },
];

const COMPLIANCE_NAV = [
  { label: "Dashboard", to: "/compliance/dashboard" },
  { label: "Transactions", to: "/compliance/transactions" },
  { label: "Alerts", to: "/compliance/alerts" },
  { label: "Evidence", to: "/compliance/evidence" },
  { label: "Frameworks", to: "/compliance/frameworks" },
  { label: "Compliance Matrix", to: "/compliance/matrix" },
  { label: "Compliance Controls", to: "/compliance/controls" },
  { label: "Reports", to: "/compliance/reports" },
];

const ADMIN_NAV = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Customer Applications", to: "/admin/applications" },
  { label: "Users", to: "/admin/users" },
  { label: "Transaction Rules", to: "/admin/transaction-rules" },
  { label: "Frameworks", to: "/admin/frameworks" },
  { label: "Compliance Rules", to: "/admin/rules" },
  { label: "System Log", to: "/admin/audit-logs" },
  { label: "Alerts", to: "/admin/alerts" },
  { label: "Bank Audit", to: "/admin/bank-audit" },
];

function ChangePasswordRoute() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  return <ChangePassword />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/change-password" element={<ChangePasswordRoute />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route
            element={
              <ProtectedRoute roles={["client"]}>
                <AppShell navItems={CLIENT_NAV} roleLabel="Customer" badgeColor="bg-slate-700 text-slate-100" profilePath="/profile" />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<ClientDashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/beneficiaries" element={<Beneficiaries />} />
            <Route path="/dps" element={<Dps />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route
            element={
              <ProtectedRoute roles={["employee"]}>
                <AppShell navItems={EMPLOYEE_NAV} roleLabel="Banking Executive" badgeColor="bg-navy-800 text-navy-100" profilePath="/employee/profile" />
              </ProtectedRoute>
            }
          >
            <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
            <Route path="/employee/customers" element={<Customers />} />
            <Route path="/employee/customers/:id" element={<CustomerDetail />} />
            <Route path="/employee/cash-in" element={<CashIn />} />
            <Route path="/employee/cash-withdrawal" element={<CashWithdrawal />} />
            <Route path="/employee/fund-transfer" element={<FundTransfer />} />
            <Route path="/employee/profile" element={<StaffProfile />} />
          </Route>

          <Route
            element={
              <ProtectedRoute roles={["compliance_officer"]}>
                <AppShell navItems={COMPLIANCE_NAV} roleLabel="Compliance Officer" badgeColor="bg-teal-600 text-teal-50" profilePath="/compliance/profile" />
              </ProtectedRoute>
            }
          >
            <Route path="/compliance/dashboard" element={<ComplianceDashboard />} />
            <Route path="/compliance/transactions" element={<TransactionMonitoring />} />
            <Route path="/compliance/transactions/:id" element={<TransactionDetail />} />
            <Route path="/compliance/alerts" element={<AlertsQueue />} />
            <Route path="/compliance/alerts/:id" element={<AlertDetail />} />
            <Route path="/compliance/customers/:id" element={<CustomerRiskProfile />} />
            <Route path="/compliance/evidence" element={<Evidence />} />
            <Route path="/compliance/controls" element={<Controls />} />
            <Route path="/compliance/controls/:id" element={<ControlDetail />} />
            <Route path="/compliance/frameworks" element={<ComplianceFrameworks />} />
            <Route path="/compliance/frameworks/:id" element={<FrameworkDetail />} />
            <Route path="/compliance/matrix" element={<Matrix />} />
            <Route path="/compliance/reports" element={<Reports />} />
            <Route path="/compliance/profile" element={<StaffProfile />} />
          </Route>

          <Route
            element={
              <ProtectedRoute roles={["admin"]}>
                <AppShell navItems={ADMIN_NAV} roleLabel="System Administrator" badgeColor="bg-[#6a4c93] text-purple-50" profilePath="/admin/profile" />
              </ProtectedRoute>
            }
          >
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/applications" element={<Applications />} />
            <Route path="/admin/applications/:id" element={<ApplicationDetail />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/rules" element={<Rules />} />
            <Route path="/admin/transaction-rules" element={<TransactionRules />} />
            <Route path="/admin/frameworks" element={<AdminFrameworks />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="/admin/bank-audit" element={<BankAudit />} />
            <Route path="/admin/alerts" element={<AdminAlerts />} />
            <Route path="/admin/alerts/:id" element={<AdminAlertDetail />} />
            <Route path="/admin/profile" element={<StaffProfile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
