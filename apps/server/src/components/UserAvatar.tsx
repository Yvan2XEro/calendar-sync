"use client"
import { authClient } from "@/lib/auth-client";
import { UserAvatar as UIUserAvatar } from "@daveyplate/better-auth-ui";
import { LogOut, User } from "lucide-react";
import Link from "next/link";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export const UserAvatar = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {/* <Link href="/account/settings"> */}
        <UIUserAvatar />
        {/* </Link> */}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem>
			<User />
            <Link href="/account/settings">Manage Account</Link>
          </DropdownMenuItem>
		  <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={()=>authClient.signOut()}>
			<LogOut />
            <span>Manage Account</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
