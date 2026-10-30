import Link from "next/link";
export default function NotFound() {return <main className="account-shell"><h1>Wedding not found</h1><p>This wedding is unavailable to this account.</p><Link prefetch={false} href="/workspace">Open your workspace</Link></main>;}
