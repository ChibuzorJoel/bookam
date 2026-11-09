import { isDevMode } from '@angular/core';

/**
 * Base URL of the LagosPages backend (the Express API from lagos-booking-backend).
 * No trailing slash. Change the production value to your real API host.
 * The backend's CORS_ORIGINS must include the site origin, for example http://localhost:4200.
 */
export const API_URL = isDevMode() ? 'http://localhost:5000' : 'https://api.lagospages.ng';

/** Where signed-in owners land when no returnUrl is given. */
export const DASHBOARD_ROUTE = '/dashboard';