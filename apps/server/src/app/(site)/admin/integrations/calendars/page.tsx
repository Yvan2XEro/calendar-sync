import { redirect } from "next/navigation";

export default function AdminCalendarConnectionsRedirect() {
	redirect("/account/integrations/calendars");
}
