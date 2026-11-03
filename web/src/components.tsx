import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Focus,
  ScanSearch,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Incident, Service, Stage } from "./types";
import { relativeTime, targetLabel, utc } from "./types";

export function StageIcon({
  stage,
  size = 16,
}: {
  stage: Stage;
  size?: number;
}) {
  const Icon = {
    Investigating: CircleDashed,
    Identified: ScanSearch,
    Monitoring: Focus,
    Resolved: CheckCircle2,
  }[stage];
  return <Icon size={size} aria-hidden="true" />;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone.toLowerCase()}`}>{children}</span>;
}
export function SeverityBadge({
  severity,
}: {
  severity: Incident["severity"];
}) {
  return (
    <Badge tone={severity}>
      <span className="severity-mark" aria-hidden="true">
        {severity === "Critical" ? "!!!" : severity === "Major" ? "!!" : "!"}
      </span>
      {severity}
    </Badge>
  );
}
export function ErrorMessage({
  message,
  retry,
  close,
}: {
  message: string;
  retry?: () => void;
  close?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
      {retry && (
        <button type="button" className="text-button" onClick={retry}>
          Try again
        </button>
      )}
      {close && (
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss error"
          onClick={close}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <CheckCircle2 size={28} strokeWidth={1.3} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton-list" role="status" aria-label="Loading workspace">
      {[0, 1, 2, 3].map((n) => (
        <div className="skeleton-row" key={n}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function ServiceHealth({
  service,
  onClick,
}: {
  service: Service;
  onClick: () => void;
}) {
  return (
    <button type="button" className="service-health" onClick={onClick}>
      <span className="service-symbol" aria-hidden="true">
        {service.name.slice(0, 1)}
      </span>
      <span className="service-health-name">
        {service.name}
        <small>{service.team}</small>
      </span>
      <span className={`health-text ${service.health.toLowerCase()}`}>
        {service.health === "Operational" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Activity size={14} aria-hidden="true" />
        )}
        {service.health}
      </span>
    </button>
  );
}
export function Target({ incident }: { incident: Incident }) {
  const overdue =
    incident.status !== "Resolved" &&
    utc(incident.dueAt).getTime() < Date.now();
  return (
    <span className={`target ${overdue ? "overdue" : ""}`}>
      <Clock3 size={13} aria-hidden="true" />
      {targetLabel(incident)}
    </span>
  );
}
export function EventSymbol({ kind }: { kind: string }) {
  const Icon =
    kind === "status"
      ? CheckCircle2
      : kind === "sla"
        ? AlertCircle
        : kind === "assigned"
          ? ArrowUpRight
          : kind === "created"
            ? CircleDashed
            : Activity;
  return (
    <span className={`event-symbol ${kind}`}>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}
export function Time({ value }: { value: string }) {
  return (
    <time dateTime={value} title={utc(value).toLocaleString()}>
      {relativeTime(value)}
    </time>
  );
}
export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <span className="breadcrumb">
      Workspace
      <ChevronRight size={12} aria-hidden="true" />
      {children}
    </span>
  );
}
