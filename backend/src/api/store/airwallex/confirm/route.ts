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

  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

interface ConfirmPaymentBody {
  payment_intent_id: string;
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
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    if (!AIRWALLEX_CLIENT_ID || !AIRWALLEX_API_KEY) {
      return res.status(500).json({
        error: 'Airwallex is not configured'
      });
    }

    const body = req.body as ConfirmPaymentBody;

    if (!body.payment_intent_id) {
      return res.status(400).json({
        error: 'Missing required field: payment_intent_id'
      });
    }

    const accessToken = await getAccessToken();

    // Confirm payment intent
    const confirmPayload: Record<string, unknown> = {
      request_id: `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    if (body.payment_method) {
      confirmPayload.payment_method = body.payment_method;
    }

    if (body.payment_method_id) {
      confirmPayload.payment_method_id = body.payment_method_id;
    }

    if (body.return_url) {
      confirmPayload.return_url = body.return_url;
    }

    const response = await fetch(
      `${AIRWALLEX_BASE_URL}/pa/payment_intents/${body.payment_intent_id}/confirm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(confirmPayload),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Airwallex confirm payment error:', error);
      return res.status(response.status).json({
        error: `Failed to confirm payment: ${error}`
      });
    }

    const result = await response.json();

    res.json({
      id: result.id,
      status: result.status,
      next_action: result.next_action,
      latest_payment_attempt: result.latest_payment_attempt,
    });

  } catch (error) {
    console.error('Airwallex confirm payment error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to confirm payment'
    });
  }
};
