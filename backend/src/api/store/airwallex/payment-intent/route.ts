import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
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

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const response = await fetch(`${AIRWALLEX_BASE_URL}/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': AIRWALLEX_CLIENT_ID!,
      'x-api-key': AIRWALLEX_API_KEY!,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airwallex authentication failed: ${error}`);
  }

  const data = await response.json();

  // Cache the token (expires in 30 minutes, but we refresh 1 minute early)
  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

interface CreatePaymentIntentBody {
  amount: number;
  currency: string;
  order_id?: string;
  customer_id?: string;
  merchant_order_id?: string;
  metadata?: Record<string, string>;
  return_url?: string;
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    if (!AIRWALLEX_CLIENT_ID || !AIRWALLEX_API_KEY) {
      return res.status(500).json({
        error: 'Airwallex is not configured. Please set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.'
      });
    }

    const body = req.body as CreatePaymentIntentBody;

    if (!body.amount || !body.currency) {
      return res.status(400).json({
        error: 'Missing required fields: amount and currency are required'
      });
    }

    const accessToken = await getAccessToken();

    // Create payment intent
    const paymentIntentPayload = {
      amount: body.amount,
      currency: body.currency.toUpperCase(),
      merchant_order_id: body.merchant_order_id || `order_${Date.now()}`,
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: body.metadata || {},
      return_url: body.return_url,
    };

    const response = await fetch(`${AIRWALLEX_BASE_URL}/pa/payment_intents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(paymentIntentPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Airwallex create payment intent error:', error);
      return res.status(response.status).json({
        error: `Failed to create payment intent: ${error}`
      });
    }

    const paymentIntent = await response.json();

    // Return the payment intent details needed for frontend
    res.json({
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      merchant_order_id: paymentIntent.merchant_order_id,
    });

  } catch (error) {
    console.error('Airwallex payment intent error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create payment intent'
    });
  }
};

// Get payment intent status
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.query as { id: string };

    if (!id) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    if (!AIRWALLEX_CLIENT_ID || !AIRWALLEX_API_KEY) {
      return res.status(500).json({
        error: 'Airwallex is not configured'
      });
    }

    const accessToken = await getAccessToken();

    const response = await fetch(`${AIRWALLEX_BASE_URL}/pa/payment_intents/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const paymentIntent = await response.json();
    res.json(paymentIntent);

  } catch (error) {
    console.error('Airwallex get payment intent error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get payment intent'
    });
  }
};
