import ChatHub from "../chat/ChatHub";
import ActiveRideButton from "./ActiveRideButton";

export default function RiderMessagesPage() {
  return <ChatHub title="Messages" backPath="/rider" basePath="/rider/messages" />;
}

