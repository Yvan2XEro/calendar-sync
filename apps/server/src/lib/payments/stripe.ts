import Stripe from "stripe";

const apiVersion: Stripe.LatestApiVersion = "2024-06-20";

let singleton: Stripe | null = null;

export function isStripeConfigured(): boolean {
	return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient(options?: {
	optional?: boolean;
}): Stripe | null {
	const secretKey = process.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		if (options?.optional) {
			return null;
		}
		throw new Error("Stripe secret key is not configured");
	}

	if (!singleton) {
		singleton = new Stripe(secretKey, { apiVersion });
	}

	return singleton;
}

type PaymentIntentParams = {
	amount: number;
	currency: string;
	paymentIntentId?: string | null;
	description?: string | null;
	receiptEmail?: string | null;
	metadata?: Stripe.MetadataParam;
	automaticPaymentMethods?: boolean;
};

export async function upsertPaymentIntent({
	amount,
	currency,
	paymentIntentId,
	description,
	receiptEmail,
	metadata,
	automaticPaymentMethods = true,
}: PaymentIntentParams): Promise<Stripe.PaymentIntent> {
	const stripe = getStripeClient();
	if (!stripe) {
		throw new Error("Stripe client is not available");
	}

	const payload: Stripe.PaymentIntentCreateParams = {
		amount,
		currency,
		automatic_payment_methods: automaticPaymentMethods
			? { enabled: true }
			: undefined,
		description: description ?? undefined,
		receipt_email: receiptEmail ?? undefined,
		metadata,
	};

	if (paymentIntentId) {
		return await stripe.paymentIntents.update(paymentIntentId, payload);
	}

	return await stripe.paymentIntents.create(payload);
}

export function getStripeWebhookSecret(): string | null {
	return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}

export function verifyStripeSignature({
	payload,
	signature,
}: {
	payload: Buffer | string;
	signature: string;
}): Stripe.Event {
	const stripe = getStripeClient();
	const webhookSecret = getStripeWebhookSecret();
	if (!webhookSecret) {
		throw new Error("Stripe webhook secret is not configured");
	}
	return stripe!.webhooks.constructEvent(payload, signature, webhookSecret);
}

export function resetStripeClientForTesting() {
	singleton = null;
}
