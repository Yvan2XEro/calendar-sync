"use client";

import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpcClient } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

type RegistrationTicket = {
	id: string;
	name: string;
	description: string | null;
	priceCents: number;
	currency: string;
	capacity: number | null;
	maxPerOrder: number | null;
	remaining: number | null;
	used: number;
	saleOpen: boolean;
	soldOut: boolean;
	isWaitlistEnabled: boolean;
};

type RegistrationResult = Awaited<
	ReturnType<typeof trpcClient.events.register.mutate>
>;

type Props = {
	eventId: string;
	eventTitle: string;
	tickets: RegistrationTicket[];
};

type AttendeeState = {
	name: string;
	email: string;
};

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function ensureStripePromise() {
	if (!publishableKey) return null;
	if (!stripePromise) {
		stripePromise = loadStripe(publishableKey);
	}
	return stripePromise;
}

function formatPrice(priceCents: number, currency: string) {
	if (priceCents === 0) {
		return "Free";
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
	}).format(priceCents / 100);
}

function validateEmail(value: string) {
	return /.+@.+\..+/.test(value.trim());
}

type PaymentStepProps = {
	clientSecret: string;
	onComplete: (status: "succeeded" | "processing" | "requires_action") => void;
};

function PaymentStep({ clientSecret, onComplete }: PaymentStepProps) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);

	const handlePayment = async () => {
		if (!stripe || !elements) {
			toast.error("Stripe is not ready yet");
			return;
		}
		setSubmitting(true);
		const result = await stripe.confirmPayment({
			elements,
			redirect: "if_required",
		});
		if (result.error) {
			toast.error(result.error.message ?? "Payment failed");
			setSubmitting(false);
			return;
		}
		const status = result.paymentIntent?.status;
		if (status) {
			switch (status) {
				case "succeeded":
					onComplete("succeeded");
					toast.success("Payment completed");
					break;
				case "processing":
					onComplete("processing");
					toast.message("Payment is processing");
					break;
				case "requires_action":
					toast.message("Additional payment action required");
					onComplete("requires_action");
					break;
				default:
					toast.message(`Payment status: ${status}`);
					break;
			}
		}
		setSubmitting(false);
	};

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-card p-4">
				<PaymentElement options={{ layout: "tabs" }} />
			</div>
			<Button
				onClick={handlePayment}
				disabled={!stripe || submitting}
				className="w-full"
			>
				{submitting ? "Processing…" : "Complete payment"}
			</Button>
		</div>
	);
}

export function EventRegistrationSection({
	eventId,
	eventTitle,
	tickets,
}: Props) {
	const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
		() => {
			const active = tickets.find(
				(ticket) => ticket.saleOpen && !ticket.soldOut,
			);
			return (active ?? tickets[0])?.id ?? null;
		},
	);
	const [quantity, setQuantity] = useState<number>(1);
	const [purchaserName, setPurchaserName] = useState("");
	const [purchaserEmail, setPurchaserEmail] = useState("");
	const [purchaserPhone, setPurchaserPhone] = useState("");
	const [notes, setNotes] = useState("");
	const [attendees, setAttendees] = useState<AttendeeState[]>([
		{ name: "", email: "" },
	]);
	const [order, setOrder] = useState<RegistrationResult | null>(null);
	const [paymentStatus, setPaymentStatus] = useState<
		"idle" | "pending" | "succeeded"
	>("idle");

	const selectedTicket = useMemo(
		() => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
		[selectedTicketId, tickets],
	);

	const hasRegisterableTickets = useMemo(
		() => tickets.some((ticket) => ticket.saleOpen && !ticket.soldOut),
		[tickets],
	);

	useEffect(() => {
		setAttendees((previous) => {
			const next = [...previous];
			if (quantity > previous.length) {
				for (let index = previous.length; index < quantity; index += 1) {
					next.push({ name: "", email: "" });
				}
			}
			if (quantity < previous.length) {
				next.length = quantity;
			}
			return next;
		});
	}, [quantity]);

	const maxQuantity = useMemo(() => {
		if (!selectedTicket || selectedTicket.soldOut || !selectedTicket.saleOpen) {
			return 1;
		}
		const capacityLimit =
			selectedTicket.remaining === null
				? Number.POSITIVE_INFINITY
				: Math.max(selectedTicket.remaining, 0);
		const perOrder = selectedTicket.maxPerOrder ?? Number.POSITIVE_INFINITY;
		const computed = Math.min(capacityLimit, perOrder, 10);
		return Number.isFinite(computed) && computed > 0 ? computed : 1;
	}, [selectedTicket]);

	useEffect(() => {
		if (quantity > maxQuantity) {
			setQuantity(maxQuantity);
		}
	}, [maxQuantity, quantity]);

	const registerMutation = useMutation({
		mutationFn: trpcClient.events.register.mutate,
		onSuccess: (result) => {
			setOrder(result);
			if (result.paymentIntentClientSecret) {
				setPaymentStatus("pending");
				toast("Payment required", {
					description:
						"Complete your payment below to finalize the registration.",
				});
			} else {
				setPaymentStatus("succeeded");
				toast.success("Registration confirmed");
			}
		},
		onError: (error) => {
			toast.error(error.message ?? "Registration failed");
		},
	});

	const waitlistMutation = useMutation({
		mutationFn: trpcClient.events.waitlist.mutate,
		onSuccess: () => {
			toast.success("Added to waitlist");
		},
		onError: (error) => {
			toast.error(error.message ?? "Unable to join waitlist");
		},
	});

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedTicket) {
			toast.error("Select a ticket to continue");
			return;
		}
		if (!selectedTicket.saleOpen || selectedTicket.soldOut) {
			toast.error("Ticket sales are not available");
			return;
		}
		if (!validateEmail(purchaserEmail)) {
			toast.error("Enter a valid email for the purchaser");
			return;
		}

		const attendeePayload = attendees.map((attendee, index) => {
			const email = attendee.email || (index === 0 ? purchaserEmail : "");
			if (!validateEmail(email)) {
				throw new Error(`Attendee ${index + 1} requires a valid email address`);
			}
			return {
				email,
				name: attendee.name || purchaserName || null,
			};
		});

		try {
			await registerMutation.mutateAsync({
				eventId,
				ticketTypeId: selectedTicket.id,
				purchaser: {
					email: purchaserEmail,
					name: purchaserName || null,
					phone: purchaserPhone || null,
					metadata: notes ? { notes } : undefined,
				},
				attendees: attendeePayload.map((attendee) => ({
					email: attendee.email,
					name: attendee.name ?? null,
				})),
				metadata: notes ? { notes } : undefined,
			});
		} catch (error) {
			if (error instanceof Error) {
				toast.error(error.message);
			} else {
				toast.error("Unable to submit registration");
			}
		}
	};

	const handleWaitlist = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("waitlistEmail") ?? "").trim();
		const name = String(formData.get("waitlistName") ?? "").trim();
		const ticketId = String(
			formData.get("waitlistTicketId") ?? selectedTicketId ?? "",
		);
		if (!validateEmail(email)) {
			toast.error("Enter a valid email to join the waitlist");
			return;
		}
		await waitlistMutation.mutateAsync({
			eventId,
			ticketTypeId: ticketId || undefined,
			person: { email, name: name || null },
		});
		event.currentTarget.reset();
	};

	const paymentClientSecret = order?.paymentIntentClientSecret ?? null;
	const stripeClientPromise = useMemo(() => ensureStripePromise(), []);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Register for {eventTitle}</CardTitle>
					<CardDescription>
						Reserve your spot by choosing a ticket, adding attendee details, and
						confirming your registration.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{tickets.length === 0 && (
						<p className="text-muted-foreground text-sm">
							Tickets are not available for this event yet.
						</p>
					)}
					{tickets.length > 0 && (
						<form className="space-y-6" onSubmit={handleSubmit}>
							<div className="space-y-3">
								<Label>Ticket</Label>
								<div className="grid gap-3">
									{tickets.map((ticket) => {
										const isActive = ticket.id === selectedTicketId;
										const disabled = !ticket.saleOpen || ticket.soldOut;
										return (
											<button
												key={ticket.id}
												type="button"
												onClick={() =>
													!disabled && setSelectedTicketId(ticket.id)
												}
												className={cn(
													"rounded-lg border p-4 text-left transition",
													disabled
														? "cursor-not-allowed opacity-60"
														: "cursor-pointer hover:border-primary",
													isActive && "border-primary",
												)}
												disabled={disabled}
											>
												<div className="flex items-start justify-between">
													<div>
														<p className="font-medium text-sm md:text-base">
															{ticket.name}
														</p>
														<p className="text-muted-foreground text-xs md:text-sm">
															{ticket.description ?? "No description provided."}
														</p>
													</div>
													<p className="font-semibold text-sm md:text-base">
														{formatPrice(ticket.priceCents, ticket.currency)}
													</p>
												</div>
												<p className="text-muted-foreground text-xs">
													{ticket.soldOut
														? "Sold out"
														: ticket.saleOpen
															? ticket.remaining === null
																? "Limited availability"
																: `${ticket.remaining} remaining`
															: "Sales not open"}
												</p>
											</button>
										);
									})}
								</div>
							</div>
							{selectedTicket &&
								selectedTicket.saleOpen &&
								!selectedTicket.soldOut && (
									<>
										<div className="grid gap-3 md:grid-cols-2">
											<div>
												<Label htmlFor="quantity">Quantity</Label>
												<Input
													id="quantity"
													type="number"
													min={1}
													max={maxQuantity}
													value={quantity}
													onChange={(event) =>
														setQuantity(
															Math.min(
																maxQuantity,
																Math.max(1, Number(event.target.value) || 1),
															),
														)
													}
													required
												/>
												<p className="text-muted-foreground text-xs">
													Up to {maxQuantity} attendee
													{maxQuantity === 1 ? "" : "s"} at once.
												</p>
											</div>
											<div>
												<Label htmlFor="purchaserName">Purchaser name</Label>
												<Input
													id="purchaserName"
													value={purchaserName}
													onChange={(event) =>
														setPurchaserName(event.target.value)
													}
													placeholder="Full name"
													required
												/>
											</div>
											<div>
												<Label htmlFor="purchaserEmail">Purchaser email</Label>
												<Input
													id="purchaserEmail"
													type="email"
													value={purchaserEmail}
													onChange={(event) =>
														setPurchaserEmail(event.target.value)
													}
													placeholder="you@example.com"
													required
												/>
											</div>
											<div>
												<Label htmlFor="purchaserPhone">Phone (optional)</Label>
												<Input
													id="purchaserPhone"
													value={purchaserPhone}
													onChange={(event) =>
														setPurchaserPhone(event.target.value)
													}
													placeholder="(555) 000-1234"
												/>
											</div>
										</div>
										<div className="space-y-4">
											<Label>Attendees</Label>
											<div className="space-y-3">
												{attendees.map((attendee, index) => (
													<div
														key={index}
														className="grid gap-2 md:grid-cols-2"
													>
														<div>
															<Label
																className="text-xs"
																htmlFor={`attendee-name-${index}`}
															>
																Name #{index + 1}
															</Label>
															<Input
																id={`attendee-name-${index}`}
																value={attendee.name}
																onChange={(event) => {
																	setAttendees((current) => {
																		const copy = [...current];
																		copy[index] = {
																			...copy[index],
																			name: event.target.value,
																		};
																		return copy;
																	});
																}}
																placeholder="Full name"
															/>
														</div>
														<div>
															<Label
																className="text-xs"
																htmlFor={`attendee-email-${index}`}
															>
																Email #{index + 1}
															</Label>
															<Input
																id={`attendee-email-${index}`}
																type="email"
																value={attendee.email}
																onChange={(event) => {
																	setAttendees((current) => {
																		const copy = [...current];
																		copy[index] = {
																			...copy[index],
																			email: event.target.value,
																		};
																		return copy;
																	});
																}}
																placeholder="attendee@example.com"
																required={index === 0}
															/>
														</div>
													</div>
												))}
											</div>
											<div>
												<Label htmlFor="notes">Notes (optional)</Label>
												<textarea
													id="notes"
													value={notes}
													onChange={(event) => setNotes(event.target.value)}
													className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
													placeholder="Anything you'd like the host to know"
												/>
											</div>
										</div>
										<Button
											type="submit"
											disabled={registerMutation.isPending}
											className="w-full"
										>
											{registerMutation.isPending
												? "Submitting…"
												: selectedTicket.priceCents === 0
													? "Reserve seat"
													: "Continue to payment"}
										</Button>
									</>
								)}
						</form>
					)}
				</CardContent>
			</Card>
			{paymentClientSecret &&
				stripeClientPromise &&
				paymentStatus === "pending" && (
					<Card>
						<CardHeader>
							<CardTitle>Complete payment</CardTitle>
							<CardDescription>
								Securely enter your payment details to finish reserving your
								tickets.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Elements
								stripe={stripeClientPromise}
								options={{ clientSecret: paymentClientSecret }}
							>
								<PaymentStep
									clientSecret={paymentClientSecret}
									onComplete={(status) => {
										if (status === "succeeded") {
											setPaymentStatus("succeeded");
										}
									}}
								/>
							</Elements>
						</CardContent>
					</Card>
				)}
			{(!hasRegisterableTickets ||
				tickets.some((ticket) => ticket.isWaitlistEnabled)) && (
				<Card>
					<CardHeader>
						<CardTitle>Join the waitlist</CardTitle>
						<CardDescription>
							We'll email you if a seat opens up.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form className="space-y-4" onSubmit={handleWaitlist}>
							<div className="grid gap-2 md:grid-cols-2">
								<div>
									<Label htmlFor="waitlistName">Your name</Label>
									<Input
										id="waitlistName"
										name="waitlistName"
										placeholder="Full name"
									/>
								</div>
								<div>
									<Label htmlFor="waitlistEmail">Email</Label>
									<Input
										id="waitlistEmail"
										name="waitlistEmail"
										type="email"
										placeholder="you@example.com"
										required
									/>
								</div>
							</div>
							{tickets.some((ticket) => ticket.isWaitlistEnabled) && (
								<div>
									<Label htmlFor="waitlistTicketId">Ticket preference</Label>
									<select
										id="waitlistTicketId"
										name="waitlistTicketId"
										className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									>
										{tickets
											.filter((ticket) => ticket.isWaitlistEnabled)
											.map((ticket) => (
												<option key={ticket.id} value={ticket.id}>
													{ticket.name}
												</option>
											))}
									</select>
								</div>
							)}
							<Button
								type="submit"
								disabled={waitlistMutation.isPending}
								className="w-full"
							>
								{waitlistMutation.isPending ? "Joining…" : "Join waitlist"}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
			{order && paymentStatus === "succeeded" && (
				<Card className="border-primary">
					<CardHeader>
						<CardTitle>Registration confirmed</CardTitle>
					</CardHeader>
					<CardContent className="text-sm">
						<p>
							Confirmation code: <strong>{order.confirmationCode}</strong>
						</p>
						<p className="text-muted-foreground">
							We sent a receipt and confirmation details to {purchaserEmail}.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
