import { Navigate, ToolbarProps } from "react-big-calendar";

import { Views } from "react-big-calendar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { format } from "date-fns";

export const BigCalendarToolbar = (props: ToolbarProps) => {
  const [viewState, setViewState] = useState<string>(Views.MONTH);

  const goToDayView = () => {
    props.onView(Views.DAY);
    setViewState(Views.DAY);
  };
  const goToWeekView = () => {
    props.onView(Views.WEEK);
    setViewState(Views.WEEK);
  };
  const goToMonthView = () => {
    props.onView(Views.MONTH);
    setViewState(Views.MONTH);
  };
  const goToAgendaView = () => {
    props.onView(Views.AGENDA);
    setViewState(Views.AGENDA);
  };

  const goToBack = () => {
    props.onNavigate(Navigate.PREVIOUS);
  };

  const goToNext = () => {
    props.onNavigate(Navigate.NEXT);
  };

  const goToToday = () => {
    // props.onView(Views.DAY);
    // setViewState(Views.DAY);
    props.onNavigate(Navigate.TODAY);
  };

  // if you decided to inject a datepicker such as MUI or React Widgets ones, use this function on datepicker onChange
  const goToSpecificDate = (newDate: Date) => {
    props.onNavigate(Navigate.DATE, newDate);
  };

  const messages = {
    today: "Today",
    month: "Month",
    week: "Week",
    day: "Day",
    agenda: "Agenda",
    next: "Next",
    back: "Back",
  };

  return (
    <div className="rbc-toolbar flex !px-0 !justify-between">
      <div className="flex space-x-1">
        <button type="button">&#8249;</button>
        <button
          type="button"
          className={cn({ "rbc-active": viewState === Views.AGENDA })}
          onClick={goToToday}
        >
          {messages.today}
        </button>
        <button type="button" onClick={goToNext}>
          &#8250;
        </button>
      </div>
      <label>{format(props.date, "MMMM yyyy")}</label>

      <div className="flex space-x-1">
        <button
          type="button"
          className={cn({ "rbc-active": viewState === Views.MONTH })}
          onClick={goToMonthView}
        >
          {messages.month}
        </button>
        <button
          type="button"
          className={cn({ "rbc-active": viewState === Views.WEEK })}
          onClick={goToWeekView}
        >
          {messages.week}
        </button>
        <button
          type="button"
          className={cn({ "rbc-active": viewState === Views.DAY })}
          onClick={goToDayView}
        >
          {messages.day}
        </button>
        <button
          type="button"
          className={cn({ "rbc-active": viewState === Views.AGENDA })}
          onClick={goToAgendaView}
        >
          {messages.agenda}
        </button>
      </div>
    </div>
  );
};
