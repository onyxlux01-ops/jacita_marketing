import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Serve the supplied marketing design at the site root, with its own styles.
  // The former homepage now provides the visual shell for /login.
  rewrites() {
    return [{ source: "/", destination: "/landing-concept/index.html" }];
  },
  // Safety net for any remaining FormData server actions.
  // Media uploads go direct to Supabase Storage (see upload-media-client).
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
