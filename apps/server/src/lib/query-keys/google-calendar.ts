export const googleCalendarKeys = {
        all: ["googleCalendar"] as const,
        upcoming: (calendarId: string) =>
                [...googleCalendarKeys.all, "upcoming", calendarId] as const,
};
