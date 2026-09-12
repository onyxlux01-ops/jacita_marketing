import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Safety net for any remaining FormData server actions.
  // Media uploads go direct to Supabase Storage (see upload-media-client).
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
