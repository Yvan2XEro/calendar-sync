import AppShell from "@/components/layout/AppShell";
import { CalendarProvidersCard } from "@/components/admin/CalendarProvidersCard";
import {
  OrganizationMembersCard,
  OrganizationSettingsCards,
  RedirectToSignIn,
  UserAvatar,
} from "@daveyplate/better-auth-ui";
import React from "react";

export default async function Page({
  params,
}: PageProps<"/admin/cals/[slug]/settings">) {
  const { slug } = await params;

  return (
    <AppShell
      breadcrumbs={[
        { label: "Admin", href: "/admin/overview" },
        { label: "Calendars", href: "/admin/cals" },
        { label: slug, href: `/admin/cals/${slug}/settings`, current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OrganizationSettingsCards slug={slug} />
        <div className="md:col-span-2 space-y-6">
          <CalendarProvidersCard slug={slug} />
          <OrganizationMembersCard slug={slug} />
        </div>
      </div>
    </AppShell>
  );
}
