"use client";

import { authClient } from "@/lib/auth-client";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { upload } from "@vercel/blob/client";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
    },
  },
});
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthUIProvider
          authClient={authClient}
          social={{ providers: ["google"] }}
          organization={{
            pathMode: "slug",
            basePath: "/admin/orgs",
            logo: {
              upload: async (file) => {
                const blob = await upload(file.name, file, {
                  access: "public",
                  handleUploadUrl: "/api/upload",
                });
                return blob.url;
              },
              delete: async (_url) => {},
              size: 256,
              extension: "png",
            },
          }}
          account={{ basePath: "/account" }}
          // localization={{
          //   YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
          //     "You are not allowed to create a new calendar",
          //   YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
          //     "You have reached the maximum number of calendars",
          //   ORGANIZATION_ALREADY_EXISTS: "Calendar already exists",
          //   ORGANIZATION_NOT_FOUND: "Calendar not found",
          //   USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
          //     "User is not a member of the calendar",
          //   YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
          //     "You are not allowed to update this calendar",
          //   YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
          //     "You are not allowed to delete this calendar",
          //   NO_ACTIVE_ORGANIZATION: "No active calendar",
          //   USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
          //     "User is already a member of this calendar",
          //   YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
          //     "You cannot leave the calendar as the only owner",
          //   YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
          //     "You are not allowed to invite users to this calendar",
          //   USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
          //     "User is already invited to this calendar",
          //   INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
          //     "Inviter is no longer a member of the calendar",
          //   ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
          //     "Calendar membership limit reached",
          //   YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
          //     "You are not allowed to create teams in this calendar",
          //   YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
          //     "You are not allowed to delete teams in this calendar",

          //   CREATE_ORGANIZATION: "Create Calendar",
          //   ORGANIZATION: "Calendar",
          //   ORGANIZATION_NAME: "Name",
          //   ORGANIZATION_NAME_PLACEHOLDER: "Acme Inc.",
          //   ORGANIZATION_NAME_DESCRIPTION:
          //     "This is your calendar's visible name.",
          //   ORGANIZATION_NAME_INSTRUCTIONS:
          //     "Please use 32 characters at maximum.",
          //   ORGANIZATION_SLUG: "Slug URL",
          //   ORGANIZATION_SLUG_DESCRIPTION:
          //     "This is your calendar's URL namespace.",
          //   ORGANIZATION_SLUG_INSTRUCTIONS:
          //     "Please use 48 characters at maximum.",
          //   ORGANIZATION_SLUG_PLACEHOLDER: "acme-inc",
          //   CREATE_ORGANIZATION_SUCCESS: "Calendar created successfully",
          //   ORGANIZATIONS: "Calendars",
          //   ORGANIZATIONS_DESCRIPTION: "Manage your calendars and memberships.",
          //   ORGANIZATIONS_INSTRUCTIONS:
          //     "Create a calendar to collaborate with other users.",
          //   LEAVE_ORGANIZATION: "Leave Calendar",
          //   LEAVE_ORGANIZATION_CONFIRM:
          //     "Are you sure you want to leave this calendar?",
          //   LEAVE_ORGANIZATION_SUCCESS:
          //     "You have successfully left the calendar.",
          //   MANAGE_ORGANIZATION: "Manage Calendar",
          //   MEMBERS_INSTRUCTIONS: "Invite new members to your calendar.",
          //   PENDING_INVITATIONS_DESCRIPTION:
          //     "Manage pending invitations to your calendar.",
          //   PENDING_USER_INVITATIONS_DESCRIPTION:
          //     "Invitations you've received from calendars.",
          //   ACCEPT_INVITATION_DESCRIPTION:
          //     "You have been invited to join a calendar.",
          //   DELETE_ORGANIZATION: "Delete Calendar",
          //   DELETE_ORGANIZATION_DESCRIPTION:
          //     "Permanently remove your calendar and all of its contents. This action is not reversible — please continue with caution.",
          //   DELETE_ORGANIZATION_SUCCESS: "Calendar deleted successfully",
          //   DELETE_ORGANIZATION_INSTRUCTIONS:
          //     "Enter the calendar slug to continue:",
          //   SLUG_REQUIRED: "Calendar slug is required",
          // }}
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
    </QueryClientProvider>
  );
}
