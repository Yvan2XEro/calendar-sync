import type Stripe from "stripe";

import type { eventOrder } from "@/db/schema/app";
import { updateOrderStatusAfterPayment } from "@/lib/events/registration";
import {
	getStripeWebhookSecret,
	verifyStripeSignature,
} from "@/lib/payments/stripe";

export const runtime = "nodejs";

type OrderStatus = (typeof eventOrder.status.enumValues)[number];

function mapIntentStatus(
	eventType: string,
	paymentIntent: Stripe.PaymentIntent,
): OrderStatus | null {
	switch (eventType) {
		case "payment_intent.succeeded":
			return "confirmed";
		case "payment_intent.payment_failed":
		case "payment_intent.canceled":
			return "cancelled";
		case "payment_intent.requires_action":
		case "payment_intent.requires_payment_method":
			return "requires_action";
		case "payment_intent.processing":
			return "pending_payment";
		default:
			return null;
	}
}

export async function POST(req: Request) {
	const signature = req.headers.get("stripe-signature");
	if (!signature) {
		return new Response("Missing Stripe-Signature header", { status: 400 });
	}

	const webhookSecret = getStripeWebhookSecret();
	if (!webhookSecret) {
		return new Response("Stripe webhook secret is not configured", {
			status: 500,
		});
	}

	let event: Stripe.Event;
	try {
		const body = await req.text();
		event = verifyStripeSignature({ payload: body, signature });
	} catch (error) {
		console.error("stripe:webhook signature verification failed", error);
		return new Response("Invalid signature", { status: 400 });
	}

	try {
		switch (event.type) {
			case "payment_intent.succeeded":
			case "payment_intent.payment_failed":
			case "payment_intent.canceled":
			case "payment_intent.requires_action":
			case "payment_intent.requires_payment_method":
			case "payment_intent.processing": {
				const paymentIntent = event.data.object as Stripe.PaymentIntent;
				const orderId = paymentIntent.metadata?.orderId;
				if (orderId) {
					const status = mapIntentStatus(event.type, paymentIntent);
					if (status) {
						await updateOrderStatusAfterPayment({
							orderId,
							status,
							paymentIntentId: paymentIntent.id,
							externalState: paymentIntent.status,
						});
					}
				}
				break;
			}
			case "charge.refunded":
			case "charge.refund.updated": {
				const charge = event.data.object as Stripe.Charge;
				const orderId = charge.metadata?.orderId;
				if (orderId) {
					await updateOrderStatusAfterPayment({
						orderId,
						status: "refunded",
						paymentIntentId:
							charge.payment_intent && typeof charge.payment_intent === "string"
								? charge.payment_intent
								: (charge.payment_intent?.id ?? null),
						externalState: charge.status,
					});
				}
				break;
			}
			default:
				break;
		}
	} catch (error) {
		console.error("stripe:webhook handler error", error);
		return new Response("Webhook handler error", { status: 500 });
	}

	return Response.json({ received: true });
}
