"use client";

import Image from "next/image";
import Link from "next/link";

import { HeaderNavWrapper } from "@/components/layout/HeaderNavWrapper";

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
    quote: "Our team finally has a single source of truth for every event we host.",
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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <HeaderNavWrapper>
        <div className="flex flex-1 items-center justify-between py-4">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-[var(--primary)]"
            style={headingFont}
          >
            CalendarSync
          </Link>
          <Link
            href="/auth/sign-in"
            className="text-sm font-medium text-[var(--secondary)] transition hover:opacity-80"
            style={bodyFont}
          >
            Sign in
          </Link>
        </div>
      </HeaderNavWrapper>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-[var(--primary)] via-[color-mix(in_oklch,var(--primary)_65%,_white)] to-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-24 pt-20 md:flex-row md:items-center md:gap-16 lg:px-10">
            <div className="flex-1 space-y-8 text-white">
              <span
                className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-sm font-medium backdrop-blur"
                style={bodyFont}
              >
                Trusted by modern teams keeping calendars in sync
              </span>
              <div className="space-y-6">
                <h1
                  className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl"
                  style={headingFont}
                >
                  Simplify Your Event Management
                </h1>
                <p
                  className="max-w-xl text-base text-white/80 sm:text-lg"
                  style={bodyFont}
                >
                  CalendarSync helps you aggregate events from emails, curate them with ease, and sync directly to your calendar.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/auth/sign-in"
                  className="inline-flex items-center justify-center rounded-full bg-[var(--secondary)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
                  style={bodyFont}
                >
                  Get Started
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
                  style={bodyFont}
                >
                  Learn More
                </a>
              </div>
            </div>
            <div className="flex-1">
              <div className="relative mx-auto max-w-md rounded-3xl bg-white/10 p-6 shadow-2xl backdrop-blur-lg md:max-w-lg">
                <div className="absolute inset-0 rounded-3xl border border-white/20" aria-hidden />
                <div className="relative flex flex-col items-center gap-6 text-center">
                  <Image
                    src="/globe.svg"
                    alt="Calendar illustration"
                    width={220}
                    height={220}
                    className="h-40 w-40 text-white"
                  />
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold" style={headingFont}>
                      Your events, perfectly orchestrated
                    </h2>
                    <p className="text-sm text-white/80" style={bodyFont}>
                      Import, curate, and distribute events effortlessly with CalendarSync.
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between rounded-2xl bg-white/10 p-4">
                    <div className="text-left">
                      <p className="text-xs uppercase tracking-wide text-white/60">Next up</p>
                      <p className="text-base font-medium text-white" style={bodyFont}>
                        Creative Meetup
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--accent)] px-4 py-1 text-xs font-semibold text-white">Live</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-10">
          <div className="mb-14 text-center">
            <p
              className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--secondary)]"
              style={bodyFont}
            >
              Platform Highlights
            </p>
            <h2
              className="mt-4 text-3xl font-bold text-[var(--primary)] sm:text-4xl"
              style={headingFont}
            >
              Everything you need to run events without chaos
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            {featureItems.map((feature) => (
              <div
                key={feature.title}
                className="group flex h-full flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "color-mix(in oklch, var(--muted) 60%, transparent)" }}
                >
                  <Image src={feature.icon} alt="" width={28} height={28} className="h-7 w-7" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-[var(--primary)]" style={headingFont}>
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600" style={bodyFont}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-50/80 py-20">
          <div className="mx-auto w-full max-w-6xl px-6 lg:px-10">
            <div className="mb-12 text-center">
              <p
                className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--secondary)]"
                style={bodyFont}
              >
                Loved by Teams
              </p>
              <h2
                className="mt-4 text-3xl font-bold text-[var(--primary)] sm:text-4xl"
                style={headingFont}
              >
                Testimonials from our community
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.map((testimonial) => (
                <div
                  key={testimonial.name}
                  className="flex h-full flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
                >
                  <p className="text-base text-slate-700" style={bodyFont}>
                    “{testimonial.quote}”
                  </p>
                  <div className="flex items-center gap-4">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full border border-slate-200 bg-slate-100"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--primary)]" style={headingFont}>
                        {testimonial.name}
                      </p>
                      <p className="text-xs text-slate-500" style={bodyFont}>
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 py-20 text-center lg:px-10">
          <div className="rounded-3xl bg-gradient-to-r from-[var(--primary)] via-[color-mix(in_oklch,var(--secondary)_60%,_var(--muted))] to-[var(--muted)] px-10 py-16 text-white shadow-xl">
            <h2 className="text-3xl font-bold sm:text-4xl" style={headingFont}>
              Ready to Sync Smarter?
            </h2>
            <p className="mt-4 text-base text-white/80 sm:text-lg" style={bodyFont}>
              Join teams who trust CalendarSync to keep every stakeholder on the same page.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-[var(--primary)] shadow-lg transition hover:bg-slate-100"
                style={bodyFont}
              >
                Sign Up Now
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 text-sm text-slate-600 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
            <Link href="/privacy" className="hover:text-[var(--secondary)]" style={bodyFont}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[var(--secondary)]" style={bodyFont}>
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-[var(--secondary)]" style={bodyFont}>
              Contact
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="#" className="text-slate-400 transition hover:text-[var(--secondary)]" aria-label="Twitter">
              <Image src="/globe.svg" alt="" width={20} height={20} className="h-5 w-5" />
            </Link>
            <Link href="#" className="text-slate-400 transition hover:text-[var(--secondary)]" aria-label="LinkedIn">
              <Image src="/window.svg" alt="" width={20} height={20} className="h-5 w-5" />
            </Link>
            <Link href="#" className="text-slate-400 transition hover:text-[var(--secondary)]" aria-label="Instagram">
              <Image src="/next.svg" alt="" width={20} height={20} className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
