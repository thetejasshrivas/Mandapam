import Link from "next/link";
import { authConfig } from "@/server/auth/config";
import { safeReturnTo } from "@/server/auth/policy";
export const dynamic="force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query=await searchParams;
  const ready=Boolean(authConfig());
  const notices:Record<string,string>={credentials:"Sign-in failed. Check your details and email confirmation, then try again.",confirmation:"This sign-in link could not be verified. Request a new confirmation email.",check_email:"Check your email for a confirmation link. Delivery depends on the configured email provider.",signed_out:"You have signed out. Your private workspace requires sign-in again.",invalid:"Enter a valid email address and password.",unavailable:"Sign-in is temporarily unavailable. Please try again.",oauth_unavailable:"Google sign-in is temporarily unavailable. Try again or use email and password.",oauth_cancelled:"Google sign-in was cancelled. Try again or use email and password.",oauth_error:"Google sign-in could not be completed. Try again or use email and password."};
  return <main className="account-shell"><Link prefetch={false} className="wordmark" href="/">Wedding preparations</Link><p className="eyebrow">Your private planning space</p><h1>Welcome back</h1><p>Sign in to your own wedding workspace.</p>
    {!ready&&<p role="status">Account access is not configured on this environment yet.</p>}
    {query.message&&notices[query.message]&&<p role="status" className="account-notice">{notices[query.message]}</p>}
    <form action="/auth/google" method="post" className="account-form">
      <input type="hidden" name="next" value={safeReturnTo(query.next??null)}/>
      <button type="submit" disabled={!ready}>Continue with Google</button>
    </form><p className="account-caption">Returning to a saved wedding? Use the same Google email as your existing account. If your wedding is missing, use email sign-in before creating another wedding.</p><p className="account-caption">Or sign in with email and password</p>
    <form action="/auth/login" method="post" className="account-form">
      <input type="hidden" name="next" value={safeReturnTo(query.next??null)}/>
      <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={!ready}/>
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={!ready}/>
      <button type="submit" disabled={!ready}>Sign in</button>
    </form><details className="account-registration"><summary>Create an account</summary><p>Use your own email. Confirm it before signing in.</p>
      <form action="/auth/signup" method="post" className="account-form"><input type="hidden" name="next" value={safeReturnTo(query.next??null)}/><label htmlFor="new-email">Email address</label><input id="new-email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={!ready}/><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={!ready}/><button disabled={!ready}>Create account</button></form>
    </details><p className="account-caption">No public demo account. Email delivery or recovery issues need the account operator; security checks stay enabled.</p></main>;
}
