"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { MOOD_META, STATIONS, STATION_BY_ID } from "@/lib/studio/stations";
import type { StationId, StationState } from "@/lib/studio/types";
import { formatInstant } from "@/lib/studio/workflow";

export function MoodBadge({ state }: { state: StationState }) {
  const meta = MOOD_META[state.mood];
  return (
    <span className="studio-badge" data-tone={state.unknown ? "neutral" : meta.tone}>
      <i aria-hidden />
      {state.unknown ? "Unknown" : meta.label}
    </span>
  );
}

function when(iso: string | null, timeZone: string) {
  return iso ? formatInstant(iso, timeZone) : "No recorded update";
}

function StationFacts({
  state,
  businessName,
  timeZone,
  demo,
}: {
  state: StationState;
  businessName: string;
  timeZone: string;
  demo: boolean;
}) {
  return (
    <dl className="studio-facts">
      <div>
        <dt>Business</dt>
        <dd>{demo ? "Demo studio · simulated" : businessName}</dd>
      </div>
      <div>
        <dt>Current task</dt>
        <dd>
          {state.taskTitle ? (
            state.taskHref ? (
              <Link href={state.taskHref}>
                {state.taskTitle} <ArrowUpRight size={12} />
              </Link>
            ) : (
              state.taskTitle
            )
          ) : (
            "No task in progress"
          )}
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{state.statusLabel}</dd>
      </div>
      <div>
        <dt>Queue</dt>
        <dd>{state.unknown ? "—" : state.queueLabel}</dd>
      </div>
      <div>
        <dt>Last update</dt>
        <dd>{state.unknown ? "—" : when(state.lastUpdate, timeZone)}</dd>
      </div>
    </dl>
  );
}

function Actions({ state, demo }: { state: StationState; demo: boolean }) {
  if (!state.actions.length) return null;
  return (
    <div className="studio-actions">
      {state.actions.map((a) => (
        <Link key={a.href} href={a.href} className="studio-action">
          {a.label} <ArrowUpRight size={12} />
        </Link>
      ))}
      {demo && <p className="studio-note">These links open your real screens; demo items are not records.</p>}
    </div>
  );
}

export const StationDetail = forwardRef<
  HTMLHeadingElement,
  {
    selected: StationId | null;
    states: Record<StationId, StationState>;
    businessName: string;
    timeZone: string;
    demo: boolean;
    onSelect: (id: StationId) => void;
  }
>(function StationDetail({ selected, states, businessName, timeZone, demo, onSelect }, ref) {
  if (!selected) {
    return (
      <aside className="studio-detail" aria-labelledby="studio-detail-title">
        <h3 id="studio-detail-title" ref={ref} tabIndex={-1}>
          Select a station
        </h3>
        <p className="studio-note">
          Click a character, desk or label to see what that station is holding. Work moves left to
          right along the top, down to publishing, then back round through analytics.
        </p>
        <ul className="studio-mini">
          {STATIONS.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onSelect(s.id)}>
                <span className="studio-mini-order">{s.order}</span>
                <span className="studio-mini-name">{s.name}</span>
                <MoodBadge state={states[s.id]} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    );
  }
  const def = STATION_BY_ID[selected];
  const state = states[selected];
  return (
    <aside className="studio-detail" aria-labelledby="studio-detail-title">
      <p className="eyebrow">
        Station {def.order} · {def.agent}, {def.role.toLowerCase()}
      </p>
      <div className="studio-detail-head">
        <h3 id="studio-detail-title" ref={ref} tabIndex={-1}>
          {def.name}
        </h3>
        <MoodBadge state={state} />
      </div>
      <p className="studio-note">{def.description}</p>
      <StationFacts state={state} businessName={businessName} timeZone={timeZone} demo={demo} />
      <p className="studio-note">{state.detail}</p>
      <Actions state={state} demo={demo} />
    </aside>
  );
});

/** The accessible list alternative: the same information as the studio, as HTML. */
export function StudioList({
  states,
  businessName,
  timeZone,
  demo,
  onShow,
}: {
  states: Record<StationId, StationState>;
  businessName: string;
  timeZone: string;
  demo: boolean;
  onShow?: (id: StationId) => void;
}) {
  return (
    <ol className="studio-list" aria-label="Marketing Studio stations">
      {STATIONS.map((s) => {
        const state = states[s.id];
        return (
          <li key={s.id} className="studio-list-item">
            <div className="studio-list-head">
              <span className="studio-mini-order" aria-hidden>
                {s.order}
              </span>
              <div>
                <h3>{s.name}</h3>
                <p>
                  {s.agent} · {s.role}
                </p>
              </div>
              <MoodBadge state={state} />
            </div>
            <StationFacts state={state} businessName={businessName} timeZone={timeZone} demo={demo} />
            <div className="studio-list-foot">
              <Actions state={state} demo={demo} />
              {onShow && (
                <button type="button" className="studio-action ghost" onClick={() => onShow(s.id)}>
                  <MapPin size={12} /> Show in studio
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A simplified bird's-eye plan used when 3D can't run. Same stations, same
 * states, laid out like the office.
 */
export function StudioPlan({
  states,
  selected,
  onSelect,
  reason,
}: {
  states: Record<StationId, StationState>;
  selected: StationId | null;
  onSelect: (id: StationId) => void;
  reason: string;
}) {
  return (
    <div className="studio-plan">
      <p className="studio-plan-note">{reason}</p>
      <div className="studio-plan-grid">
        {STATIONS.map((s) => {
          const state = states[s.id];
          return (
            <button
              key={s.id}
              type="button"
              className="studio-plan-room"
              data-station={s.id}
              data-tone={state.unknown ? "neutral" : MOOD_META[state.mood].tone}
              aria-pressed={selected === s.id}
              onClick={() => onSelect(s.id)}
            >
              <span className="studio-mini-order">{s.order}</span>
              <strong>{s.name}</strong>
              <small>{state.statusLabel}</small>
              <span className="studio-plan-count">{state.unknown ? "—" : state.queue}</span>
            </button>
          );
        })}
        <div className="studio-plan-lounge" aria-hidden>
          Meeting & lounge
        </div>
      </div>
    </div>
  );
}
