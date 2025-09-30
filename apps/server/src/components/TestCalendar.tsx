import React from "react";

import {
  BigCalendar,
  localizer,
  Views,
  withDragAndDrop,
} from "@/components/BigCalendar";
import { SlotInfo } from "react-big-calendar";
import { BigCalendarToolbar } from "./BigCalendarToolbar";

const DnDCalendar = withDragAndDrop(BigCalendar);
const TestCalendar = () => {
  // Just for testing
  const [view, setView] = React.useState(Views.WEEK);
  const [calendarDate, setCalendarDate] = React.useState(new Date());
  const [calendarEvents, setCalendarEvents] = React.useState<
    {
      title: string;
      start: Date;
      end: Date;
    }[]
  >([]);
  const [selectedSlot, setSelectedSlot] = React.useState<SlotInfo | null>(null);
  const handleNavigate = (newDate: Date) => {
    setCalendarDate(newDate);
  };

  const handleViewChange = (newView: React.SetStateAction<any>) => {
    setView(newView);
  };

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    setSelectedSlot(slotInfo);
  };

  const handleCreateEvent = (data: {
    title: string;
    start: string;
    end: string;
  }) => {
    const newEvent = {
      title: data.title,
      start: new Date(data.start),
      end: new Date(data.end),
    };
    setCalendarEvents([...calendarEvents, newEvent]);
    setSelectedSlot(null);
  };

  const handleEventDrop = ({ event, start, end }: any) => {
    const updatedEvents = calendarEvents.map((existingEvent) =>
      existingEvent === event
        ? { ...existingEvent, start, end }
        : existingEvent,
    );
    setCalendarEvents(updatedEvents);
  };

  const handleEventResize = ({ event, start, end }: any) => {
    const updatedEvents = calendarEvents.map((existingEvent) =>
      existingEvent === event
        ? { ...existingEvent, start, end }
        : existingEvent,
    );
    setCalendarEvents(updatedEvents);
  };
  //End testing

  return (
    <div>
      <DnDCalendar
        localizer={localizer}
        style={{ height: 600, width: "100%" }}
        className="border-border border-rounded-md border-solid border-2 rounded-lg" // Optional border
        selectable
        date={calendarDate}
        onNavigate={handleNavigate}
        view={view}
        onView={handleViewChange}
        resizable
        draggableAccessor={() => true}
        resizableAccessor={() => true}
        events={calendarEvents}
        onSelectSlot={handleSelectSlot}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
      />
    </div>
  );
};

export default TestCalendar;
