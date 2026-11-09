export type UserRole = 'owner' | 'admin';
export type BusinessMode = 'shop' | 'booking' | 'both';
export type PlanId = 'free' | 'starter' | 'pro';
export type OtpPurpose = 'signup' | 'login' | 'reset';

export interface User {
  id: string;
  phone: string;
  email?: string;
  role: UserRole;
  phoneVerified: boolean;
  createdAt?: string;
}

export interface Business {
  _id: string;
  name: string;
  slug: string;
  mode: BusinessMode;
  plan?: PlanId;
  status?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface SignupPayload {
  phone: string;
  businessName: string;
  mode: BusinessMode;
  email?: string;
  password?: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface VerifyOtpPayload {
  phone: string;
  otp: string;
  purpose: 'signup' | 'login';
}

export interface ResetPasswordPayload {
  phone: string;
  otp: string;
  newPassword: string;
}

/** Shape of the backend's success body for login, verify-otp and /auth/me. */
export interface SessionResponse {
  status: 'success';
  data: { user: User; business: Business | null; token?: string };
}