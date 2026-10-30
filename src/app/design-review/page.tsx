import Link from "next/link";
const nextActions = [
  { title: "Confirm ceremony timings", ceremony: "Wedding", due: "Today · 27 Oct", reason: "Due today, with no unfinished prerequisite.", owner: "You" },
  { title: "Choose invitation wording", ceremony: "Wedding", due: "Tomorrow · 28 Oct", reason: "Due next. Finishing this unlocks sending the invitations.", owner: "You" },
  { title: "Shortlist return gifts", ceremony: "Reception", due: "30 Oct", reason: "The next dated task with no unfinished prerequisite.", owner: "Meera (sample)" },
];

function WeddingMotif() {
  return (
    <svg className="wedding-motif" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M80 139V81M80 111C49 116 34 99 31 78c25 0 44 11 49 33Zm0 14c30 3 46-13 50-33-25-1-43 10-50 33Z" />
        <path d="M80 92C57 83 47 66 52 44c19 6 29 21 28 48Zm0 0c24-9 34-26 28-48-19 6-29 21-28 48Z" />
        <path d="M80 83C63 66 64 46 80 25c16 21 17 41 0 58Z" />
        <path d="M80 134c-24-2-44-16-53-36M80 144c24-2 44-16 53-36M45 115l-12 3m8-9-1-12m79 30 12-3m-7-4 1-12" />
        <circle cx="80" cy="13" r="2.5" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#next-actions">Skip to next actions</a>
      <div className="preview-notice">V1 design preview · All content is synthetic</div>
      <header className="app-header">
        <a className="wordmark" href="#home">Wedding preparations<span>A little more together.</span></a>
        <nav className="primary-nav" aria-label="Main navigation">
          <a href="#home" aria-current="page">Home</a>
          <button type="button" disabled title="Tasks is not implemented in this visual preview">Tasks</button>
          <button type="button" disabled title="Budget is not implemented in this visual preview">Budget</button>
          <button type="button" disabled title="Changes is not implemented in this visual preview">Changes</button>
        </nav>
        <Link prefetch={false} href="/workspace" className="account-entry">Private workspace</Link>
      </header>
      <main className="home-grid" id="home">
        <section className="invitation" aria-label="Synthetic wedding context">
          <WeddingMotif />
          <div className="invitation-copy">
            <p className="couple-names">Aarohi <span>&amp;</span> Kabir</p>
            <p className="wedding-date">14 February 2027</p>
            <p className="wedding-place">Pune · Haldi, Wedding &amp; Reception</p>
          </div>
          <p className="invitation-footnote">A celebration, thoughtfully prepared.</p>
        </section>
        <section className="actions" id="next-actions" aria-labelledby="actions-heading">
          <div className="page-heading"><h1 id="actions-heading">Your next steps</h1><p>A little progress. More room for the celebration.</p></div>
          <div className="section-heading"><h2>Three things to focus on</h2><span className="sample-date">Sample day: 27 Oct</span></div>
          <ol className="action-list">
            {nextActions.map((task) => (
              <li className="action-item" key={task.title}>
                <div className="task-meta"><span>{task.ceremony}</span><span className={task.due.startsWith("Today") ? "due-today" : ""}>{task.due}</span></div>
                <h3>{task.title}</h3>
                <div className="task-footer"><span>For {task.owner}</span><span>To do</span></div>
                <details className="task-reason"><summary>Why this is next <span aria-hidden="true">+</span></summary><p>{task.reason}</p></details>
              </li>
            ))}
          </ol>
          <aside className="blocked-note" aria-labelledby="blocked-heading">
            <span className="status-mark" aria-hidden="true">!</span>
            <div><h2 id="blocked-heading">One thing is waiting</h2><p><strong>Send invitations</strong> is blocked until <strong>Choose invitation wording</strong> is complete.</p></div>
          </aside>
          <p className="preview-explainer">Visual sample only. Tasks are not saved and the order is illustrative.</p>
        </section>
        <aside className="finance-note" aria-labelledby="finance-heading">
          <div className="finance-heading"><h2 id="finance-heading">A clear picture of costs</h2><span className="unknown-label">Not recorded</span></div>
          <p>No costs recorded in this sample.</p>
          <p className="finance-guidance">Estimates, commitments and cash paid will stay separate. Unknown amounts will be labeled clearly.</p>
          <span className="finance-footer">No financial totals to show yet.</span>
        </aside>
      </main>
      <footer className="page-footer">Wedding Preparation Workspace · V1 for visual review</footer>
    </>
  );
}
