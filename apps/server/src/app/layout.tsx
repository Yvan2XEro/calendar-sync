import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
// import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react";

import { getSiteBaseUrl } from "@/lib/site-metadata";
import { Providers } from "./providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const siteBaseUrl = getSiteBaseUrl();

export const metadata: Metadata = {
	metadataBase: new URL(siteBaseUrl),
	title: {
		default: "CalendarSync",
		template: "%s | CalendarSync",
	},
	description:
		"CalendarSync helps teams publish curated events with rich landing pages.",
};

export const viewport: Viewport = {
	initialScale: 1,
	viewportFit: "cover",
	width: "device-width",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} flex min-h-svh flex-col antialiased`}
			>
				<Providers>
					{/* <Header /> */}

					{children}
				</Providers>
			</body>
		</html>
	);
}
