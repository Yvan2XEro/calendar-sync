import Link from "next/link";
import React from "react";
import { UserAvatar as UIUserAvatar } from "@daveyplate/better-auth-ui";

export const UserAvatar = () => {
  return (
    <Link href="/account/settings">
      <UIUserAvatar />
    </Link>
  );
};
