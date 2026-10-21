import { useEffect, useState } from "react";
import { Users } from "lucide-react";

import { Card } from "../ui/card";
import { supabase } from "../../../utils/supabase";

type OnlineDriver = {
  id: string;
  name: string;
  email: string;
  plate: string;
};

type OnlineDriversForTerminalProps = {
  terminalId: string | null;
  terminalName?: string;
  refreshToken: number;
};

type PresenceStatus = "unassigned" | "connecting" | "live" | "error";

/** Live driver sessions, scoped to the terminal assigned to this Driver Admin. */
export default function OnlineDriversForTerminal({
  terminalId,
  terminalName,
  refreshToken,
}: OnlineDriversForTerminalProps) {
  const [drivers, setDrivers] = useState<OnlineDriver[]>([]);
  const [status, setStatus] = useState<PresenceStatus>(terminalId ? "connecting" : "unassigned");

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    if (!terminalId) {
      setDrivers([]);
      setStatus("unassigned");
      return () => { active = false; };
    }

    setStatus("connecting");
    const channel = supabase.channel("platform-online-users");

    const refreshDrivers = async () => {
      const request = ++latestRequest;
      const onlineIds = Object.keys(channel.presenceState());

      if (onlineIds.length === 0) {
        if (active && request === latestRequest) {
          setDrivers([]);
          setStatus("live");
        }
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("id,name,email,toda_plate")
        .eq("role", "rider")
        .eq("terminal_id", terminalId)
        .in("id", onlineIds);

      if (!active || request !== latestRequest) return;
      if (error) {
        setStatus("error");
        return;
      }

      const onlineDrivers: OnlineDriver[] = (data || [])
        .map((driver: any) => ({
          id: driver.id,
          name: driver.name || "Driver",
          email: driver.email || "",
          plate: driver.toda_plate || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setDrivers(onlineDrivers);
      setStatus("live");
    };

    channel
      .on("presence", { event: "sync" }, () => { void refreshDrivers(); })
      .subscribe((channelStatus) => {
        if (!active) return;
        if (channelStatus === "SUBSCRIBED") {
          void refreshDrivers();
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          setStatus("error");
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [terminalId, refreshToken]);

  const subtitle = terminalName ? `Currently connected in ${terminalName}` : "Currently connected in your assigned terminal";

  return (
    <section aria-labelledby="terminal-online-drivers-title" aria-busy={status === "connecting"}>
      <Card className="gap-0 overflow-hidden rounded-3xl border-line bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--success-soft)] text-[var(--success-ink)]">
            <Users className="size-5" aria-hidden="true" />
            <span className={`absolute bottom-1 right-1 size-2.5 rounded-full border-2 border-card ${status === "live" ? "bg-[var(--success-ink)]" : "bg-[var(--amber-ink)]"}`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="terminal-online-drivers-title" className="text-base font-bold text-[var(--ink)]">Online drivers</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{subtitle}</p>
          </div>
          <span
            className="rounded-lg bg-[var(--success-soft)] px-2.5 py-1 text-sm font-extrabold text-[var(--success-ink)] tabular-nums"
            aria-label={status === "live" ? `${drivers.length} online drivers` : status === "unassigned" ? "Terminal not assigned" : "Online driver count unavailable"}
          >
            {status === "live" ? drivers.length.toLocaleString() : "—"}
          </span>
        </div>

        {status === "unassigned" ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">Your Driver Admin account has no terminal assignment yet. Ask the Super Admin to assign one.</p>
        ) : status === "connecting" ? (
          <p role="status" className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">Connecting to live driver presence…</p>
        ) : status === "error" ? (
          <p role="alert" className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">Live driver presence is temporarily unavailable. Refresh the overview to try again.</p>
        ) : drivers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">No drivers from your terminal are online right now.</p>
        ) : (
          <ul aria-label="Online drivers in your terminal" className="grid max-h-96 gap-2 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
            {drivers.map(driver => (
              <li key={driver.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-sm font-bold uppercase text-[var(--ink)]" aria-hidden="true">
                  {driver.name.trim().charAt(0) || "D"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--ink)]">{driver.name}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {driver.plate ? `Plate ${driver.plate}` : driver.email}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-[var(--success-soft)] px-2 py-1 text-[10px] font-bold text-[var(--success-ink)]">Online</span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-[var(--muted-foreground)] sm:px-5">Updates live while drivers have TrikeServe open.</p>
      </Card>
    </section>
  );
}
