import {
  AIRWALLEX_CLIENT_ID,
  AIRWALLEX_API_KEY,
  AIRWALLEX_ENVIRONMENT
} from "lib/constants";

const AIRWALLEX_BASE_URL = AIRWALLEX_ENVIRONMENT === 'prod'
  ? 'https://api.airwallex.com/api/v1'
  : 'https://api-demo.airwallex.com/api/v1';

// Cache for access token
let cachedToken: { token: string; expiresAt: number } | null = null;

export function isAirwallexConfigured(): boolean {
  return !!(AIRWALLEX_CLIENT_ID && AIRWALLEX_API_KEY);
}

export function getAirwallexEnvironment(): string {
  return AIRWALLEX_ENVIRONMENT || 'demo';
}

export async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token (with 1 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  if (!AIRWALLEX_CLIENT_ID || !AIRWALLEX_API_KEY) {
    throw new Error('Airwallex is not configured');
  }

  const response = await fetch(`${AIRWALLEX_BASE_URL}/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': AIRWALLEX_CLIENT_ID,
      'x-api-key': AIRWALLEX_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airwallex authentication failed: ${error}`);
  }

  const data = await response.json();

  // Cache the token
  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

export async function airwallexRequest<T = unknown>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${AIRWALLEX_BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airwallex API error: ${error}`);
  }

  return response.json();
}

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
  merchant_order_id?: string;
  next_action?: {
    type: string;
    url?: string;
    data?: Record<string, unknown>;
  };
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  merchant_order_id?: string;
  return_url?: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<PaymentIntent> {
  const payload = {
    amount: params.amount,
    currency: params.currency.toUpperCase(),
    merchant_order_id: params.merchant_order_id || `order_${Date.now()}`,
    request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    metadata: params.metadata || {},
    return_url: params.return_url,
  };

  return airwallexRequest<PaymentIntent>('/pa/payment_intents/create', {
    method: 'POST',
    body: payload,
  });
}

export async function getPaymentIntent(id: string): Promise<PaymentIntent> {
  return airwallexRequest<PaymentIntent>(`/pa/payment_intents/${id}`);
}

export async function confirmPaymentIntent(
  id: string,
  options: {
    payment_method?: {
      type: string;
      card?: {
        number: string;
        expiry_month: string;
        expiry_year: string;
        cvc: string;
        name?: string;
      };
    };
    payment_method_id?: string;
    return_url?: string;
  } = {}
): Promise<PaymentIntent> {
  const payload: Record<string, unknown> = {
    request_id: `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  if (options.payment_method) {
    payload.payment_method = options.payment_method;
  }

  if (options.payment_method_id) {
    payload.payment_method_id = options.payment_method_id;
  }

  if (options.return_url) {
    payload.return_url = options.return_url;
  }

  return airwallexRequest<PaymentIntent>(`/pa/payment_intents/${id}/confirm`, {
    method: 'POST',
    body: payload,
  });
}
