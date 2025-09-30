import moment from "moment";
import { Calendar, momentLocalizer, SlotInfo, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";

const BigCalendar = Calendar;
const localizer = momentLocalizer(moment);

export { BigCalendar, localizer, Views, withDragAndDrop };
