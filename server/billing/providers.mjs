// Payment providers behind one interface. No card data ever reaches this server: a real provider hosts the
// payment page and reports back through a signed webhook.
//
//   id                 provider name stored on subscriptions
//   checkout           true if users can start a checkout from the pricing page
//   createCheckout(c)  returns { url } where the user completes payment
//   verifyWebhook(raw, headers) returns the parsed event or throws
//
// Enabled now: `manual` (admin grants, activation codes, invoices) and `mock` (test checkout, used by tests and demos).
// Stubs below document how a local gateway (Paymob) or a merchant-of-record would plug in; they are disabled.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const mockSecret = () => process.env.MOCK_WEBHOOK_SECRET || (globalThis.__s2sMockSecret ||= randomBytes(32).toString('hex'));

export function signMock(raw) {
  return 'sha256=' + createHmac('sha256', mockSecret()).update(raw).digest('hex');
}

export const PROVIDERS = {
  manual: { id: 'manual', checkout: false },
  mock: {
    id: 'mock',
    checkout: true,
    createCheckout: c => ({ url: '#checkout/' + c.id }),
    verifyWebhook(raw, headers) {
      const given = Buffer.from(String(headers['x-mock-signature'] || ''));
      const expected = Buffer.from(signMock(raw));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw Object.assign(Error('Invalid signature.'), { status: 400 });
      return JSON.parse(raw);
    }
  },
  // Disabled stub. To enable: create a Paymob merchant account, add PAYMOB_* keys, implement createCheckout with
  // Paymob's hosted checkout (intention API) and verifyWebhook with its HMAC over the documented field order.
  paymob: { id: 'paymob', checkout: false, disabled: true },
  // Disabled stub for a merchant of record (handles VAT and invoices). Same contract.
  merchantOfRecord: { id: 'merchantOfRecord', checkout: false, disabled: true }
};

export function activeProvider() {
  const p = PROVIDERS[process.env.PAYMENT_PROVIDER || 'manual'];
  return p && !p.disabled ? p : PROVIDERS.manual;
}
