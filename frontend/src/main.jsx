import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import "./styles.css";

const API = "http://localhost:4000/api";
const getToken = () => localStorage.getItem("token");
async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) };
  const response = await fetch(API + path, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth-expired"));
  }
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount || 0);
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: "employee@example.com", password: "password123" }); const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); try { const result = await api("/auth/login", { method: "POST", body: JSON.stringify(form) }); localStorage.setItem("token", result.token); onLogin(result.user); } catch (e) { setError(e.message); } }
  return <main className="login"><section className="login-visual"><div className="visual-brand"><span>EV</span><strong>ExpenseFlow</strong></div><div className="visual-copy"><p className="eyebrow">ABC COMPANY · FINANCE OPERATIONS</p><h1>Every expense,<br /><em>accountable.</em></h1><p>One calm, clear workspace for submitting, reviewing, and reimbursing employee expenses.</p></div><div className="visual-footer"><span>01</span><div><strong>Built for confident decisions</strong><small>Keep every voucher moving with complete visibility.</small></div></div></section><section className="login-card"><div className="brand-mark">EV</div><p className="eyebrow">WELCOME BACK</p><h2>Sign in to ExpenseFlow</h2><p className="muted">Access your expense workspace securely.</p><form onSubmit={submit}><label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>{error && <div className="error">{error}</div>}<button>Sign in</button></form><small>Demo accounts use password123. Employee, Director, and Accounts roles are available.</small></section></main>;
}

function Layout({ user, onLogout, children }) {
  return <div className="app-shell"><aside><div className="logo"><span>EV</span><strong>ExpenseFlow</strong></div><p className="role">{user.role} PORTAL</p><nav><NavLink to="/" end>Dashboard</NavLink>{user.role === "DIRECTOR" && <NavLink to="/vouchers?status=PENDING_APPROVAL">Pending approvals</NavLink>}<NavLink to="/vouchers">{user.role === "EMPLOYEE" ? "My vouchers" : "All vouchers"}</NavLink>{user.role === "EMPLOYEE" && <NavLink to="/vouchers/new">New voucher</NavLink>}</nav><button className="logout" onClick={onLogout}>Sign out</button></aside><main className="content"><header><div><p className="eyebrow">WORKSPACE</p><h2>{user.role === "EMPLOYEE" ? "My expense workspace" : `${user.role === "DIRECTOR" ? "Director" : "Accounts"} workspace`}</h2></div><div className="profile"><span>{user.name.slice(0, 1)}</span>{user.name}</div></header>{children}</main></div>;
}
function Protected({ user, children, roles }) { return !user ? <Navigate to="/login" /> : roles && !roles.includes(user.role) ? <Navigate to="/" /> : children; }

function Dashboard({ user }) {
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData).catch(console.error); }, []);
  if (!data) return <div className="loading">Loading dashboard…</div>;
  const cards = user.role === "DIRECTOR" ? [["Pending approval", data.pending, "pending"], ["Approved today", data.approvedToday, "approved"], ["Rejected today", data.rejectedToday, "rejected"], ["Pending amount", money(data.pendingAmount), "amount"]] : user.role === "ACCOUNTS" ? [["Total vouchers", data.total], ["Pending approval", data.pending, "pending"], ["Approved vouchers", data.approved, "approved"], ["Rejected vouchers", data.rejected, "rejected"], ["Approved amount", money(data.approvedAmount), "amount"]] : [["Total vouchers", data.total], ["Drafts", data.draft, "draft"], ["Pending approval", data.pending, "pending"], ["Approved", data.approved, "approved"], ["Rejected", data.rejected, "rejected"], ["Total claimed", money(data.totalAmount), "amount"]];
  const recent = user.role === "ACCOUNTS" ? data.recentApproved : data.recent;
  return <><div className="welcome"><div><p className="eyebrow">OVERVIEW</p><h1>Good morning, {user.name.split(" ")[0]}.</h1><p className="muted">Here is what is happening with your vouchers today.</p></div>{user.role === "EMPLOYEE" && <Link className="button" to="/vouchers/new">+ Create voucher</Link>}{user.role === "DIRECTOR" && <Link className="button" to="/vouchers?status=PENDING_APPROVAL">Review pending approvals</Link>}</div><div className="stats">{cards.map(([label, value, tone]) => <div className={`stat ${tone || ""}`} key={label}>{user.role === "DIRECTOR" && label === "Pending approval" ? <Link to="/vouchers?status=PENDING_APPROVAL"><p>{label}</p><strong>{value}</strong></Link> : <><p>{label}</p><strong>{value}</strong></>}</div>)}</div><section className="panel"><div className="panel-heading"><h3>{user.role === "ACCOUNTS" ? "Recent approved vouchers" : user.role === "DIRECTOR" ? "Recent voucher activity" : "Recent activity"}</h3><div className="panel-heading-actions"><Link to="/vouchers">View all</Link>{user.role === "DIRECTOR" && <Link to="/vouchers?status=PENDING_APPROVAL">Pending approvals</Link>}</div></div><VoucherTable vouchers={recent} /></section></>;
}
function VoucherTable({ vouchers }) {
  return <div className="table-wrap"><table><thead><tr><th>Voucher</th><th>Title</th><th>Employee</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{vouchers?.length ? vouchers.map(v => <tr key={v.id}><td><Link to={`/vouchers/${v.id}`} className="strong">{v.voucherNumber}</Link></td><td>{v.title}</td><td>{v.employee?.name || "-"}</td><td>{date(v.expenseDate)}</td><td>{money(v.amount)}</td><td><span className={`badge ${v.status.toLowerCase()}`}>{v.status.replace("_", " ")}</span></td></tr>) : <tr><td colSpan="6" className="empty">No vouchers yet.</td></tr>}</tbody></table></div>;
}
function Vouchers({ user }) {
  const [vouchers, setVouchers] = useState([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState(() => new URLSearchParams(location.search).get("status") || ""); const [category, setCategory] = useState(""); const [department, setDepartment] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  useEffect(() => { const params = new URLSearchParams({ search: query, status, category, department, from, to }); api(`/vouchers?${params}`).then(setVouchers).catch(console.error); }, [query, status, category, department, from, to]);
  return <><div className="page-heading"><div><p className="eyebrow">{user.role === "DIRECTOR" && status === "PENDING_APPROVAL" ? "DIRECTOR" : "VOUCHERS"}</p><h1>{user.role === "DIRECTOR" && status === "PENDING_APPROVAL" ? "Pending approvals" : user.role === "EMPLOYEE" ? "My vouchers" : "All vouchers"}</h1></div>{user.role === "EMPLOYEE" && <Link className="button" to="/vouchers/new">+ New voucher</Link>}{user.role === "ACCOUNTS" && <button className="button" onClick={() => window.print()}>Print vouchers</button>}</div><div className="filters"><input placeholder="Search voucher, title or employee…" value={query} onChange={e => setQuery(e.target.value)} /><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><input placeholder="Category" value={category} onChange={e => setCategory(e.target.value)} /><input placeholder="Department" value={department} onChange={e => setDepartment(e.target.value)} /><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div><section className="panel"><VoucherTable vouchers={vouchers} /></section></>;
}
function SignatureImage({ url, label }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let objectUrl; if (url) fetch(`${API}${url.replace("/api", "")}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(response => { if (!response.ok) throw new Error("Signature could not be loaded"); return response.blob(); }).then(blob => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }).catch(() => setSrc("")); return () => objectUrl && URL.revokeObjectURL(objectUrl); }, [url]);
  return url && src ? <p className="signature"><span>{label}</span><img src={src} alt={label} /></p> : null;
}
function VoucherForm() {
  const navigate = useNavigate(); const { id } = useParams(); const [error, setError] = useState(""); const [signatureFile, setSignatureFile] = useState(null); const [form, setForm] = useState({ department: "", title: "", category: "Travel", description: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), employeeSignature: "" });
  useEffect(() => { if (id) api(`/vouchers/${id}`).then(v => setForm({ ...v, expenseDate: v.expenseDate.slice(0, 10), employeeSignature: v.employeeSignature || "" })); }, [id]);
  const update = e => setForm({ ...form, [e.target.name]: e.target.value });
  async function save(event) { event.preventDefault(); try { let signature = form.employeeSignature; if (signatureFile) { const body = new FormData(); body.append("signature", signatureFile); signature = (await api("/signatures/upload", { method: "POST", body })).url; } const v = await api(id ? `/vouchers/${id}` : "/vouchers", { method: id ? "PATCH" : "POST", body: JSON.stringify({ ...form, employeeSignature: signature }) }); navigate(`/vouchers/${v.id}`); } catch (e) { setError(e.message); } }
  return <><div className="page-heading"><div><p className="eyebrow">EMPLOYEE</p><h1>{id ? "Edit draft" : "Create voucher"}</h1></div></div><form className="panel form" onSubmit={save}><div className="form-grid"><label>Department<input name="department" value={form.department} onChange={update} required /></label><label>Expense title<input name="title" value={form.title} onChange={update} required /></label><label>Expense date<input type="date" name="expenseDate" value={form.expenseDate} onChange={update} required /></label><label>Category<select name="category" value={form.category} onChange={update}><option>Travel</option><option>Meals</option><option>Office supplies</option><option>Training</option><option>Other</option></select></label><label>Amount (INR)<input type="number" min="0.01" step="0.01" name="amount" value={form.amount} onChange={update} required /></label><label className="wide">Description<textarea name="description" value={form.description} onChange={update} rows="4" /></label><label className="wide">Employee signature image<input type="file" accept="image/*" onChange={e => setSignatureFile(e.target.files[0])} />{form.employeeSignature && <span className="hint">Signature uploaded</span>}</label></div>{error && <div className="error">{error}</div>}<div className="actions"><button type="button" className="secondary" onClick={() => navigate("/vouchers")}>Cancel</button><button>Save draft</button></div></form></>;
}
function VoucherDetail({ user }) {
  const { id } = useParams(); const navigate = useNavigate(); const [v, setV] = useState(null); const [error, setError] = useState(""); const [reason, setReason] = useState(""); const [file, setFile] = useState(null);
  useEffect(() => { api(`/vouchers/${id}`).then(setV).catch(e => setError(e.message)); }, [id]);
  if (error) return <div className="error">{error}</div>; if (!v) return <div className="loading">Loading voucher…</div>;
  async function submit() { try { setV(await api(`/vouchers/${id}/submit`, { method: "POST" })); } catch (e) { setError(e.message); } }
  async function remove() { if (!window.confirm("Delete this draft voucher?")) return; try { await api(`/vouchers/${id}`, { method: "DELETE" }); navigate("/vouchers"); } catch (e) { setError(e.message); } }
  async function approve() { const body = new FormData(); body.append("signature", file); try { setV(await api(`/vouchers/${id}/approve`, { method: "POST", body })); } catch (e) { setError(e.message); } }
  async function reject() { try { setV(await api(`/vouchers/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) })); } catch (e) { setError(e.message); } }
  return <>
    <div className="page-heading"><div><p className="eyebrow">VOUCHER DETAIL</p><h1>{v.voucherNumber}</h1></div><span className={`badge large ${v.status.toLowerCase()}`}>{v.status.replace("_", " ")}</span></div>
    <div className="detail-grid">
      <section className="panel">
        <h3>Basic information</h3>
        <div className="details">
          <div><span>Voucher number</span><strong>{v.voucherNumber}</strong></div>
          <div><span>Voucher date</span><strong>{date(v.voucherDate)}</strong></div>
          <div><span>Expense date</span><strong>{date(v.expenseDate)}</strong></div>
          <div><span>Department</span><strong>{v.department}</strong></div>
          <div><span>Expense title</span><strong>{v.title}</strong></div>
          <div><span>Expense category</span><strong>{v.category}</strong></div>
          <div><span>Amount</span><strong>{money(v.amount)}</strong></div>
        </div>
        <hr /><span className="label">Expense description</span><p>{v.description || "No description provided."}</p>
      </section>
      <section className="panel">
        <h3>Employee information</h3>
        <div className="details">
          <div><span>Employee name</span><strong>{v.employee?.name || "-"}</strong></div>
          <div><span>Employee ID</span><strong>{v.employee?.employeeId || "Not provided"}</strong></div>
        </div>
        <SignatureImage url={v.employeeSignature} label="Employee signature" />
        <hr /><h3>Approval information</h3>
        <div className="details">
          <div><span>Current status</span><strong>{v.status.replace("_", " ")}</strong></div>
          <div><span>Approval date</span><strong>{v.approvalDate ? date(v.approvalDate) : "Not approved"}</strong></div>
          <div><span>Approved by</span><strong>{v.approvedBy?.name || "Not approved"}</strong></div>
        </div>
        <SignatureImage url={v.directorSignature} label="Director signature" />
        {v.rejectionReason && <div className="notice">Rejection reason: {v.rejectionReason}</div>}
      </section>
      <section className="panel">
        <h3>Audit information</h3>
        <div className="details">
          <div><span>Created date</span><strong>{date(v.createdAt)}</strong></div>
          <div><span>Last updated</span><strong>{date(v.updatedAt)}</strong></div>
        </div>
        <div className="timeline">
          <div className="timeline-item done"><b>Draft created</b><span>{date(v.createdAt)}</span></div>
          <div className={`timeline-item ${v.status !== "DRAFT" ? "done" : ""}`}><b>Submitted for approval</b><span>{v.status !== "DRAFT" ? "Complete" : "Waiting"}</span></div>
          <div className={`timeline-item ${v.status === "APPROVED" || v.status === "REJECTED" ? "done" : ""}`}><b>{v.status === "REJECTED" ? "Rejected" : "Approval decision"}</b><span>{v.rejectionReason || (v.approvalDate ? date(v.approvalDate) : "Pending")}</span></div>
        </div>
        {user.role === "EMPLOYEE" && v.status === "DRAFT" && <div className="actions"><Link className="button secondary" to={`/vouchers/${v.id}/edit`}>Edit draft</Link><button onClick={submit}>Submit for approval</button><button className="danger" onClick={remove}>Delete draft</button></div>}
        {user.role === "DIRECTOR" && v.status === "PENDING_APPROVAL" && <div className="director-actions"><label>Director signature<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files[0])} /><small className="hint">Select a PNG, JPG, JPEG, or WebP image to enable approval.</small></label><button onClick={approve} disabled={!file}>Approve voucher</button><label>Rejection reason<textarea value={reason} onChange={e => setReason(e.target.value)} rows="2" placeholder="Enter the reason for rejection" /></label><button className="danger" onClick={reject}>Reject voucher</button></div>}
      </section>
    </div>
    {error && <div className="error">{error}</div>}<button className="back" onClick={() => navigate(-1)}>← Back</button>
  </>;
}
function App() {
  const [user, setUser] = useState(null); const [sessionLoading, setSessionLoading] = useState(Boolean(getToken()));
  useEffect(() => {
    const expire = () => { setUser(null); setSessionLoading(false); };
    window.addEventListener("auth-expired", expire);
    if (getToken()) api("/auth/me").then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setSessionLoading(false));
    else setSessionLoading(false);
    return () => window.removeEventListener("auth-expired", expire);
  }, []);
  if (sessionLoading) return <div className="loading">Restoring your session…</div>;
  if (!user) return <Routes><Route path="/login" element={<Login onLogin={setUser} />} /><Route path="*" element={<Navigate to="/login" />} /></Routes>;
  const logout = () => { localStorage.removeItem("token"); setUser(null); };
  return <Layout user={user} onLogout={logout}><Routes><Route path="/" element={<Dashboard user={user} />} /><Route path="/vouchers" element={<Vouchers user={user} />} /><Route path="/vouchers/new" element={<Protected user={user} roles={["EMPLOYEE"]}><VoucherForm /></Protected>} /><Route path="/vouchers/:id/edit" element={<Protected user={user} roles={["EMPLOYEE"]}><VoucherForm /></Protected>} /><Route path="/vouchers/:id" element={<VoucherDetail user={user} />} /><Route path="*" element={<Navigate to="/" />} /></Routes></Layout>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
