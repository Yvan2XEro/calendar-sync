import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HeaderNavWrapper } from "@/components/layout/HeaderNavWrapper";
import { auth, enforceTukiSessionRoles } from "@/lib/auth";

const featureItems = [
	{
		title: "Smart Email Event Extraction",
		description:
			"Automatically surface upcoming events from newsletters and announcements without lifting a finger.",
		icon: "/globe.svg",
	},
	{
		title: "Easy Admin Curation",
		description:
			"Approve, edit, or reject events in seconds with an intuitive review workflow tailored for busy teams.",
		icon: "/window.svg",
	},
	{
		title: "Google Calendar Sync",
		description:
			"Push approved events to your personal calendar instantly so you never miss a moment.",
		icon: "/next.svg",
	},
	{
		title: "Weekly Digest",
		description:
			"Stay informed with curated summaries delivered straight to your inbox each week.",
		icon: "/vercel.svg",
	},
];

const testimonials = [
	{
		quote: "CalendarSync saved me hours of manual event tracking.",
		name: "Jordan P.",
		role: "Community Manager",
		avatar: "/file.svg",
	},
	{
		quote:
			"Our team finally has a single source of truth for every event we host.",
		name: "Sasha L.",
		role: "Operations Lead",
		avatar: "/file.svg",
	},
	{
		quote: "The weekly digest keeps me updated without cluttering my calendar.",
		name: "Elliot R.",
		role: "Program Director",
		avatar: "/file.svg",
	},
];

const headingFont = { fontFamily: "Poppins, sans-serif" } as const;
const bodyFont = { fontFamily: "DM Sans, sans-serif" } as const;

export default async function HomePage() {
	const headerList = await headers();
	const sessionResponse = await auth.api.getSession({
		headers: headerList,
	});
	const normalized = await enforceTukiSessionRoles(sessionResponse);

	if (normalized.session) {
		redirect("/dashboard");
	}

	return (
		<div className="flex min-h-screen flex-col bg-white text-slate-900">
			<HeaderNavWrapper>
				<div className="flex flex-1 items-center justify-between py-4">
					<Link
						href="/"
						className="font-semibold text-[var(--primary)] text-xl tracking-tight"
						style={headingFont}
					>
						CalendarSync
					</Link>
					<Link
						href="/auth/sign-in"
						className="font-medium text-[var(--secondary)] text-sm transition hover:opacity-80"
						style={bodyFont}
					>
						Sign in
					</Link>
				</div>
			</HeaderNavWrapper>

			<main className="flex-1">
				<section className="hero-gradient relative overflow-hidden">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pt-20 pb-24 md:flex-row md:items-center md:gap-16 lg:px-10">
						<div className="flex-1 space-y-8 text-white">
							<span
								className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 font-medium text-sm backdrop-blur"
								style={bodyFont}
							>
								Trusted by modern teams keeping calendars in sync
							</span>
							<div className="space-y-6">
								<h1
									className="font-bold text-4xl leading-tight sm:text-5xl lg:text-6xl"
									style={headingFont}
								>
									Simplify Your Event Management
								</h1>
								<p
									className="max-w-xl text-base text-white/80 sm:text-lg"
									style={bodyFont}
								>
									CalendarSync helps you aggregate events from emails, curate
									them with ease, and sync directly to your calendar.
								</p>
							</div>
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
								<Link
									href="/auth/sign-in"
									className="inline-flex items-center justify-center rounded-full bg-[var(--secondary)] px-6 py-3 font-semibold text-sm text-white shadow-lg transition hover:opacity-90"
									style={bodyFont}
								>
									Get Started
								</Link>
								<a
									href="#features"
									className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 font-semibold text-sm text-white transition hover:border-white hover:bg-white/10"
									style={bodyFont}
								>
									Learn More
								</a>
							</div>
						</div>
						<div className="flex-1">
							<div className="relative mx-auto max-w-md rounded-3xl bg-white/10 p-6 shadow-2xl backdrop-blur-lg md:max-w-lg">
								<div
									className="absolute inset-0 rounded-3xl border border-white/20"
									aria-hidden
								/>
								<div className="relative flex flex-col items-center gap-6 text-center">
									<Image
										src="/globe.svg"
										alt="Calendar illustration"
										width={220}
										height={220}
										className="h-40 w-40 text-white"
									/>
									<div className="space-y-2">
										<h2 className="font-semibold text-2xl" style={headingFont}>
											Your events, perfectly orchestrated
										</h2>
										<p className="text-sm text-white/80" style={bodyFont}>
											Import, curate, and distribute events effortlessly with
											CalendarSync.
										</p>
									</div>
									<div className="flex w-full items-center justify-between rounded-2xl bg-white/10 p-4">
										<div className="text-left">
											<p className="text-white/60 text-xs uppercase tracking-wide">
												Next up
											</p>
											<p
												className="font-medium text-base text-white"
												style={bodyFont}
											>
												Creative Meetup
											</p>
										</div>
										<span className="rounded-full bg-[var(--accent)] px-4 py-1 font-semibold text-white text-xs">
											Live
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section id="features" className="bg-white">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-20 lg:px-10">
						<div className="space-y-4 text-center">
							<h2
								className="font-bold text-3xl text-slate-900 sm:text-4xl"
								style={headingFont}
							>
								Why CalendarSync?
							</h2>
							<p
								className="text-base text-slate-600 sm:text-lg"
								style={bodyFont}
							>
								Streamline your event intake and calendar publishing pipeline
								with a single, intuitive platform.
							</p>
						</div>
						<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
							{featureItems.map((feature) => (
								<div
									key={feature.title}
									className="space-y-4 rounded-2xl bg-white p-6 shadow-lg"
								>
									<Image
										src={feature.icon}
										alt="Feature icon"
										width={48}
										height={48}
										className="h-12 w-12"
									/>
									<div className="space-y-2 text-left">
										<h3 className="font-semibold text-lg text-slate-900">
											{feature.title}
										</h3>
										<p className="text-slate-600 text-sm">
											{feature.description}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="bg-slate-50">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-20 lg:px-10">
						<div className="space-y-4 text-center">
							<h2
								className="font-bold text-3xl text-slate-900 sm:text-4xl"
								style={headingFont}
							>
								Loved by operations teams everywhere
							</h2>
							<p
								className="text-base text-slate-600 sm:text-lg"
								style={bodyFont}
							>
								Hear how CalendarSync keeps organizations aligned week after
								week.
							</p>
						</div>
						<div className="grid gap-6 md:grid-cols-3">
							{testimonials.map((testimonial) => (
								<div
									key={testimonial.name}
									className="space-y-4 rounded-2xl bg-white p-6 shadow-lg"
								>
									<p className="text-base text-slate-700" style={bodyFont}>
										“{testimonial.quote}”
									</p>
									<div className="space-y-1 text-left">
										<p
											className="font-semibold text-slate-900"
											style={bodyFont}
										>
											{testimonial.name}
										</p>
										<p className="text-slate-500 text-sm" style={bodyFont}>
											{testimonial.role}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="relative overflow-hidden bg-[var(--primary)]">
					<div
						className="absolute inset-0 bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] opacity-90"
						aria-hidden
					/>
					<div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center text-white lg:px-10">
						<h2
							className="font-bold text-3xl leading-tight sm:text-4xl"
							style={headingFont}
						>
							Ready to orchestrate every event?
						</h2>
						<p
							className="max-w-2xl text-base text-white/90 sm:text-lg"
							style={bodyFont}
						>
							Join organizations that trust CalendarSync to streamline event
							intake, approval, and publishing with ease.
						</p>
						<div className="flex flex-wrap items-center justify-center gap-4">
							<Link
								href="/auth/sign-in"
								className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-semibold text-[var(--primary)] text-sm shadow-lg transition hover:bg-white/90"
								style={bodyFont}
							>
								Sign in with TUKI
							</Link>
							<a
								href="mailto:team@calendarsync.app"
								className="inline-flex items-center justify-center rounded-full border border-white/50 px-6 py-3 font-semibold text-sm text-white transition hover:border-white"
								style={bodyFont}
							>
								Talk to our team
							</a>
						</div>
					</div>
				</section>
			</main>
		</div>
	);
}
