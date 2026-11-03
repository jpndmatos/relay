import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ServiceHealth } from "./components";
import type { Responder, Service } from "./types";

export function ServiceWatch({
  services,
  responders,
  userId,
  filter,
  directory,
}: {
  services: Service[];
  responders: Responder[];
  userId: string;
  filter: (id: string) => void;
  directory: () => void;
}) {
  const [expanded, setExpanded] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => setExpanded(!media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const impacted = services.filter(
    (service) => service.health !== "Operational",
  ).length;
  return (
    <aside className="watch-panel" tabIndex={0} aria-label="Service watch">
      <details
        className="watch-disclosure"
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          <h2>Service watch</h2>
          <span>{impacted ? `${impacted} impacted` : "All operational"}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="watch-content">
          <div className="service-watch">
            {services.map((service) => (
              <ServiceHealth
                key={service.id}
                service={service}
                onClick={() => filter(service.id)}
              />
            ))}
          </div>
          <button type="button" className="all-services" onClick={directory}>
            View service directory
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <div className="responder-section">
            <div className="section-heading">
              <h3>Response team</h3>
              <span>{responders.length} people</span>
            </div>
            {responders.map((person) => (
              <div className="responder" key={person.id}>
                <span className="avatar small">
                  {person.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <span>
                  {person.name}
                  <small>{person.id === userId ? "You" : "Responder"}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </aside>
  );
}
