export type ClientLogo = {
  name: string;
  src: string;
};

// Add only client logos approved for public display. Store each asset in
// public/clients and use its absolute path, for example /clients/brand.svg.
export const CLIENT_LOGOS: ClientLogo[] = [];
