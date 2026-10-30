import type { NextConfig } from "next";

const config: NextConfig = {
  // Preserve the founder's existing root instructions during local development.
  agentRules: false,
  devIndicators: false,
  // Auth callback query codes and private route IDs must not enter request logs.
  logging: { incomingRequests: false },
  async headers() {
    return ["/workspace/:path*","/family/:path*","/api/weddings/:path*","/api/invitations/:path*","/api/family/:path*","/login","/auth/:path*"].map(source=>({source,headers:[
      {key:"Vary",value:"Cookie"},
      {key:"Cache-Control",value:"private, no-store, max-age=0, must-revalidate"},
      {key:"Referrer-Policy",value:"same-origin"},
    ]}));
  },
};

export default config;
