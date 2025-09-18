"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { authClient } from "@/lib/auth-client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthUIProvider
        authClient={authClient}
        organization={{ pathMode: "slug", basePath: "/admin/cals" }}
        account={{ basePath: "/account" }}
        localization={{
          CREATE_ORGANIZATION: "Create A Calendar",
          ACCEPT_INVITATION_DESCRIPTION:
            "You have been invited to join a calendar",
          ORGANIZATION: "Calendar",
          ORGANIZATION_ALREADY_EXISTS: "Calendar already exists",
          ORGANIZATION_NAME_DESCRIPTION: "Is your calendar's visible name",
          ORGANIZATION_NAME: "Calendar Name",
          ORGANIZATION_SLUG_DESCRIPTION:
            "This is your calendar's URL namespace",
          ORGANIZATIONS_DESCRIPTION: "Manage your calendars and memberships.",
          ORGANIZATIONS: "Calendars",
          ORGANIZATIONS_INSTRUCTIONS:
            "Create a calendar to and share it with others.",
          CREATE_ORGANIZATION_SUCCESS: "Calendar created!",
          MANAGE_ORGANIZATION: "Manage Calendar",
          DELETE_ORGANIZATION_SUCCESS: "Calendar deleted!",
          DELETE_ORGANIZATION: "Delete Calendar",
          DELETE_ORGANIZATION_DESCRIPTION:
            "Permanently delete a calendar and all of its data. This action cannot be undone.",
          DELETE_ORGANIZATION_INSTRUCTIONS:
            "Enter the organization slug to continue",
          LEAVE_ORGANIZATION: "Unsubscribe from Calendar",
          LEAVE_ORGANIZATION_CONFIRM:
            "Are you want to unsubscribe from this calendar?",
          LEAVE_ORGANIZATION_SUCCESS: "You have left the calendar",
        }}
        navigate={router.push as any}
        replace={router.replace as any}
        onSessionChange={() => {
          router.refresh();
        }}
        Link={Link as any}
      >
        {children}

        <Toaster />
      </AuthUIProvider>
    </ThemeProvider>
  );
}
