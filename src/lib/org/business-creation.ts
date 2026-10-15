/**
 * Only the platform admin (users.is_platform_admin) may create a business.
 * The database enforces it in create_organisation(); the app checks first so
 * people get a clear message, and hides "Add business" from everyone else.
 *
 * Plain constants (no server imports) so client components can use them.
 */
export const CREATE_BUSINESS_ADMIN_ONLY = "ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS" as const;

export const CREATE_BUSINESS_ADMIN_ONLY_MESSAGE =
  "Only the workspace administrator can add businesses.";

/** What createOrganisationOnboarding returns when it does not redirect. */
export type CreateBusinessError = {
  error: string;
  code?: typeof CREATE_BUSINESS_ADMIN_ONLY;
};
