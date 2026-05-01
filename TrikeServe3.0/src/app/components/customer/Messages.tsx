import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import ChatHub from "../chat/ChatHub";

export default function Messages() {
  const navigate = useNavigate();

  return (
    <ChatHub
      title="Messages"
      backPath="/customer"
      basePath="/customer/messages"
    />
  );
}