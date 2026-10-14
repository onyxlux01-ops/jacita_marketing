// pg ships without types and @types/pg isn't installed; the harness only
// uses Client.connect/query/end against the guarded local DB.
declare module "pg";
