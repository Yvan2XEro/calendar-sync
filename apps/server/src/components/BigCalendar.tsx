import { Calendar } from "react-big-calendar";
import { momentLocalizer, Views, SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";

const BigCalendar = Calendar;
const localizer = momentLocalizer(moment);

export { BigCalendar, localizer, Views, withDragAndDrop };
