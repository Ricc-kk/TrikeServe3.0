import { useState } from "react";
import ChatHub from "../chat/ChatHub";
import BusinessSidebar from "./BusinessSidebar";
import BusinessHamburgerButton from "./BusinessHamburgerButton";

export default function BusinessMessages() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  return <div className="min-h-dvh bg-[var(--muted)] flex">
    <BusinessSidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
    <div className="min-w-0 w-full flex-1 lg:ml-64">
      <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 sm:px-6">
        <BusinessHamburgerButton
          onClick={() => setIsMobileMenuOpen(true)}
          label="Open navigation"
          className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-soft lg:hidden"
          iconClassName="size-5"
        />
        <p className="text-sm font-bold text-[var(--ink)]">Business workspace <span className="font-normal text-[var(--muted-foreground)]">· Messages</span></p>
      </div>
      <ChatHub title="Messages" backPath="/business/dashboard" basePath="/business/messages" />
    </div>
  </div>;
}
