import { UserAvatar as UIUserAvatar } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import React from "react";

export const UserAvatar = () => {
	return (
		<Link href="/account/settings">
			<UIUserAvatar />
		</Link>
	);
};
