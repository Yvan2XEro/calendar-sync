"use client";
import React from "react";
import { Button } from "./ui/button";
import { authClient } from "@/lib/auth-client";
import { Separator } from "./ui/separator";
import { usePathname } from "next/navigation";

export const SSOAuth = () => {
  const pathname = usePathname();
  const showSso = pathname === "/auth/sign-in" || pathname === "/auth/sign-up";
  if (!showSso) {
    return null;
  }
  return (
    <div className="space-y-4">
      <Button
        onClick={async () => {
          const { data, error } = await authClient.signIn.oauth2({
            providerId: process.env.NEXT_PUBLIC_OIDC_PROVIDER_ID!,
            callbackURL: "/",
          });
        }}
        variant="outline"
        className="w-full mt-3"
      >
        Continue with TUKI SSO
      </Button>
      <Separator />
    </div>
  );
};
