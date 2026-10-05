/** The signed-in user as the server hands it to the UI. */
export interface SessionUser {
  /** Better Auth user ID. The employee record from GET /me carries the business ID. */
  id: string;
  name: string;
  email: string;
  image: string | null;
}
