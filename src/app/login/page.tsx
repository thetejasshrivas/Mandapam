import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { authConfig } from "@/server/auth/config";
import { safeReturnTo } from "@/server/auth/policy";
import styles from "./login.module.css";

export const dynamic="force-dynamic";
export const metadata: Metadata = {title:"Welcome to Mandapam",description:"A thoughtful space for your wedding ceremonies, tasks, budget and family."};

function GoogleMark(){return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11c-.5 2.6-2 4.8-4.2 6.2v5.2h6.7c3.9-3.6 6.1-8.8 6.1-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.3 12.3 0 0 1 0-7.8v-5.3H5.7a20.4 20.4 0 0 0 0 18.4l6.9-5.3Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3l5.9-5.8A19.7 19.7 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.3l6.9 5.3A12.1 12.1 0 0 1 24 11.2Z"/></svg>;}

export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query=await searchParams;
  const ready=Boolean(authConfig());
  const notices:Record<string,string>={credentials:"Sign-in failed. Check your details and email confirmation, then try again.",confirmation:"This sign-in link could not be verified. Request a new confirmation email.",check_email:"Check your email for a confirmation link. Delivery depends on the configured email provider.",signed_out:"You have signed out. Your private workspace requires sign-in again.",invalid:"Enter a valid email address and password.",unavailable:"Sign-in is temporarily unavailable. Please try again.",oauth_unavailable:"Google sign-in is temporarily unavailable. Try again or use email and password.",oauth_cancelled:"Google sign-in was cancelled. Try again or use email and password.",oauth_error:"Google sign-in could not be completed. Try again or use email and password."};
  const next=safeReturnTo(query.next??null);
  const message=query.message&&notices[query.message];
  return <main className={styles.page}>
    <a className={styles.skip} href="#sign-in">Skip to sign in</a>
    <aside className={styles.welcome} aria-label="About Mandapam">
      <Link prefetch={false} className={styles.brand} href="/"><span className={styles.monogram} aria-hidden="true">M</span><span>Mandapam</span></Link>
      <div className={styles.invitation}>
        <Image className={styles.art} src="/mandapam/sidebar-arch.webp" width={440} height={540} sizes="(max-width: 760px) 72px, 230px" priority alt="" aria-hidden="true"/>
        <h2>Your wedding,<br/><em>beautifully in hand.</em></h2>
        <p>A thoughtful space for your ceremonies, tasks, budget and the people bringing it all together.</p>
      </div>
      <p className={styles.promise}>Less to juggle. More to celebrate.</p>
    </aside>
    <section className={styles.access} aria-labelledby="login-title" id="sign-in" tabIndex={-1}>
      <div className={styles.content}>
        <header className={styles.heading}><h1 id="login-title">Welcome back</h1><p>Your celebration starts with a little peace of mind.</p></header>
        {!ready&&<p role="status" className={styles.notice}>Account access is not configured on this environment yet.</p>}
        {message&&<p role="status" id="login-notice" className={styles.notice}>{message}</p>}
        <form action="/auth/google" method="post" className={styles.googleForm}>
          <input type="hidden" name="next" value={next}/>
          <button type="submit" className={styles.google} disabled={!ready}><GoogleMark/>Continue with Google</button>
        </form>
        <p className={styles.continuity}>Returning to a saved wedding? Use the same Google email as your existing account. If your wedding is missing, use email sign-in before creating another wedding.</p>
        <div className={styles.divider}><span>or continue with email</span></div>
        <form action="/auth/login" method="post" className={styles.emailForm} aria-describedby={message?"login-notice":undefined}>
          <input type="hidden" name="next" value={next}/>
          <div className={styles.field}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={!ready}/></div>
          <div className={styles.field}><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={!ready}/></div>
          <button type="submit" className={styles.primary} disabled={!ready}>Sign in <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
        </form>
        <details className={styles.registration}><summary>New to Mandapam? <span>Create an account</span></summary><p>Use your own email. Confirm it before signing in.</p>
          <form action="/auth/signup" method="post" className={styles.emailForm}>
            <input type="hidden" name="next" value={next}/>
            <div className={styles.field}><label htmlFor="new-email">Email address</label><input id="new-email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={!ready}/></div>
            <div className={styles.field}><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={!ready}/><small>At least 12 characters.</small></div>
            <button type="submit" className={styles.primary} disabled={!ready}>Create account</button>
          </form>
        </details>
        <footer className={styles.footer}><p>Your own private wedding workspace.</p><small>No public demo account. For email delivery or recovery issues, contact your account operator.</small></footer>
      </div>
    </section>
  </main>;
}
