// Liveness only: no environment, account, database or provider diagnostics.
// https://nextjs.org/docs/app/api-reference/file-conventions/route
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
