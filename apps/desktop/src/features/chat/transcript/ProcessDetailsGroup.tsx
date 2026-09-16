import {
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { AgentActivity, UiMessage } from "@pi-desktop/shared";
import type {
  AssistantTurnPart,
} from "../../../lib/assistant-turns";
import {
  activityItemDetail,
  ActivityGroup,
} from "./ActivityGroup";
import {
  DisclosureCollapseRail,
  useAutomaticDisclosure,
} from "./shared";
import type { SubagentOutcome, SubagentTiming } from "../../../lib/subagent-topology";
import { formatToolDuration } from "../../../lib/tool-display";
import { IconChevronRight } from "../../../components/icons";
import { ModelIcon } from "../../../lib/model-icons";
import { TranscriptSearchContext } from "../../../lib/transcript-search-context";

type ProcessDetailsGroupProps = {
  parts: AssistantTurnPart[];
  isActive: boolean;
  /** The first answer timestamp ends the process phase. */
  endedAt?: string;
  /** Provider/model metadata for the assistant turn owning this activity. */
  providerId?: string;
  modelId?: string;
  runtimeActivity?: AgentActivity;
  turnDelegationStatuses?: ReadonlyMap<string, SubagentOutcome>;
  turnDelegationTimings?: ReadonlyMap<string, SubagentTiming>;
  renderMessage: (message: UiMessage) => ReactNode;
};

function processMessages(parts: AssistantTurnPart[]): UiMessage[] {
  return parts.flatMap((part) =>
    part.kind === "message"
      ? [part.message]
      : part.items.map((item) => item.message),
  );
}

function messagePreview(message: UiMessage): string {
  const lines = (message.content || "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*|\*\*/g, "").trim())
    .filter(Boolean);
  return lines[lines.length - 1] || "";
}

function processPreview(part: AssistantTurnPart | undefined): string {
  if (!part) return "";
  if (part.kind === "message") return messagePreview(part.message);
  const lastItem = part.items[part.items.length - 1];
  return lastItem ? activityItemDetail(lastItem) : "";
}

function processStepCount(parts: AssistantTurnPart[]): number {
  return parts.reduce(
    (count, part) =>
      count +
      (part.kind === "activity"
        ? part.items.length
        : (part.message.content || "").trim() || part.message.error
          ? 1
          : 0),
    0,
  );
}

function partKey(part: AssistantTurnPart): string {
  return part.kind === "message"
    ? part.message.id
    : `activity-${part.items[0]?.message.id || "empty"}`;
}

export function ProcessDetailsGroup({
  parts,
  isActive,
  endedAt,
  providerId,
  modelId,
  runtimeActivity,
  turnDelegationStatuses,
  turnDelegationTimings,
  renderMessage,
}: ProcessDetailsGroupProps) {
  const { t } = useTranslation();
  const detailsId = useId();
  const searchTarget = useContext(TranscriptSearchContext);
  const messages = processMessages(parts);
  const lastPart = parts[parts.length - 1];
  const live = isActive && !endedAt;
  const revealRequest =
    searchTarget &&
    parts.some((part) =>
      part.kind === "message"
        ? part.message.id === searchTarget.messageId
        : part.items.some((item) => item.message.id === searchTarget.messageId),
    )
      ? searchTarget.requestId
      : undefined;
  const {
    open,
    toggle: toggleDisclosure,
    collapse: collapseDisclosure,
    claim: claimDisclosure,
  } = useAutomaticDisclosure(live, revealRequest);
  const [now, setNow] = useState(Date.now);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const wasLiveRef = useRef(live);
  const startedAt = Date.parse(messages[0]?.createdAt || "") || now;
  const fallbackEnd = Math.max(
    startedAt,
    ...messages.map(
      (message) =>
        Date.parse(message.toolCompletedAt || "") ||
        (Date.parse(message.createdAt) || startedAt) +
          (message.toolDurationMs || 0),
    ),
  );
  const completedAt =
    Date.parse(endedAt || "") || finishedAt || fallbackEnd;
  const elapsedSeconds = Math.max(
    0,
    Math.floor(((live ? now : completedAt) - startedAt) / 1000),
  );
  const elapsed = formatToolDuration(elapsedSeconds);
  const stepCount = processStepCount(parts);
  const tail = live && !open ? processPreview(lastPart) : "";

  useEffect(() => {
    if (wasLiveRef.current && !live) setFinishedAt(Date.now());
    wasLiveRef.current = live;
    if (!live) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  return (
    <div
      className={`tool-activity-group process-details-group${open ? " open" : ""}${live ? " active" : ""}`}
      data-testid="process-details-group"
    >
      <button
        className="tool-activity-header"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={toggleDisclosure}
      >
        <span className="tool-activity-icon" aria-hidden>
          <ModelIcon
            provider={providerId ?? ""}
            modelId={modelId ?? ""}
            size={14}
          />
        </span>
        <span className={`tool-activity-label ${live ? "running" : ""}`}>
          {t(live ? "chat.processingFor" : "chat.processedFor", {
            time: elapsed,
          })}
        </span>
        {stepCount > 1 ? (
          <span className="tool-activity-count">
            {t("chat.processingSteps", { count: stepCount })}
          </span>
        ) : null}
        <span className="tool-activity-caret" aria-hidden>
          <IconChevronRight size={12} />
        </span>
      </button>
      {tail ? (
        <div className="tool-activity-preview" aria-hidden>
          {tail}
        </div>
      ) : null}
      <div
        className="tool-activity-collapse"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="tool-activity-collapse-inner">
          <div className="tool-activity-body" id={detailsId}>
            <DisclosureCollapseRail
              label={t("chat.collapseDetails")}
              onCollapse={collapseDisclosure}
            />
            {parts.map((part, index) =>
              part.kind === "activity" ? (
                <ActivityGroup
                  key={partKey(part)}
                  items={part.items}
                  embedded
                  isActive={live && index === parts.length - 1}
                  providerId={providerId}
                  modelId={modelId}
                  runtimeActivity={
                    live && index === parts.length - 1
                      ? runtimeActivity
                      : undefined
                  }
                  turnDelegationStatuses={turnDelegationStatuses}
                  turnDelegationTimings={turnDelegationTimings}
                />
              ) : (
                <Fragment key={partKey(part)}>
                  {renderMessage(part.message)}
                </Fragment>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
